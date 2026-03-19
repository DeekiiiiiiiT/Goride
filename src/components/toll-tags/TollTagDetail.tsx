import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { ArrowLeft, Car, Calendar, CreditCard, Tag, Wallet, TrendingDown, Receipt, ArrowUpRight, ArrowDownRight, DollarSign, ShieldCheck, ArrowRight, AlertTriangle, Pencil, Check, XIcon, Settings2, CalendarRange, Filter } from "lucide-react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TollTag } from "../../types/vehicle";
import { Claim } from "../../types/data";
import { TollTopupHistory } from "../vehicles/TollTopupHistory";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";
import { calculateTollFinancials } from "../../utils/tollReconciliation";
import { SafeResponsiveContainer } from "../ui/SafeResponsiveContainer";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Clock, History } from "lucide-react";

interface TollTagDetailProps {
  tag: TollTag;
  onBack: () => void;
  onNavigateToReconciliation?: (vehicleId: string) => void;
}

export function TollTagDetail({ tag, onBack, onNavigateToReconciliation }: TollTagDetailProps) {
  const [vehicleName, setVehicleName] = useState(tag.assignedVehicleName || 'Unassigned');
  // Phase 5: Provider balance state
  const [providerBalance, setProviderBalance] = useState<number | undefined>(tag.providerBalance);
  const [providerBalanceDate, setProviderBalanceDate] = useState<string | undefined>(tag.providerBalanceDate);
  const [isEditingProviderBalance, setIsEditingProviderBalance] = useState(false);
  const [providerBalanceInput, setProviderBalanceInput] = useState('');
  const [isSavingProviderBalance, setIsSavingProviderBalance] = useState(false);
  // Phase 6: Low-balance alert state
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number>(tag.lowBalanceThreshold ?? 500);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [lowBalanceDismissed, setLowBalanceDismissed] = useState(false);
  // Date filter state
  type DatePreset = 'all' | '7d' | '30d' | '3m' | '6m' | 'custom';
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getDateRange = (): { start: Date | null; end: Date | null } => {
    const now = new Date();
    switch (datePreset) {
      case '7d':
        return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7), end: now };
      case '30d':
        return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), end: now };
      case '3m':
        return { start: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), end: now };
      case '6m':
        return { start: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()), end: now };
      case 'custom':
        return {
          start: customStartDate ? new Date(customStartDate + 'T00:00:00') : null,
          end: customEndDate ? new Date(customEndDate + 'T23:59:59') : null,
        };
      default:
        return { start: null, end: null };
    }
  };

  const filterByDate = (txList: any[]) => {
    const { start, end } = getDateRange();
    if (!start && !end) return txList;
    return txList.filter((tx: any) => {
      const txDate = new Date(tx.date || tx.createdAt);
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
      return true;
    });
  };

  const [stats, setStats] = useState({
    balance: 0,
    tagSpent: 0,
    cashSpent: 0,
    totalTopUp: 0,
    totalRecovered: 0,
    netLoss: 0,
    calculatedBalance: 0,
    tagTollCount: 0,
    cashTollCount: 0,
    avgTollAmount: 0,
    tagUtilizationPercent: 0,
    monthlySpend: [] as { month: string; tagAmount: number; cashAmount: number }[],
    loading: true,
    claims: [] as Claim[]
  });

  const fetchStats = async () => {
    if (!tag.assignedVehicleId) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setStats(prev => ({ ...prev, loading: true }));

      // Phase 6 refactor: Use server-side /toll-logs endpoint instead of
      // fetching all transactions + trips and filtering client-side.
      // The server already filters by vehicleId, tagNumber, and toll categories,
      // and pre-embeds linkedTrip on each transaction.
      const [vehicles, tollResponse, claims] = await Promise.all([
        api.getVehicles(),
        api.getTollLogs({ vehicleId: tag.assignedVehicleId, tagNumber: tag.tagNumber }),
        api.getClaims(),
      ]);

      const vehicle = vehicles.find((v: any) => v.id === tag.assignedVehicleId);

      // Server returns pre-filtered, pre-sorted toll transactions for this vehicle+tag
      const filteredVehicleTx: any[] = tollResponse?.data || [];

      // Apply date filter for period-specific stats (balance always uses all-time data)
      const dateFilteredTx = filterByDate(filteredVehicleTx);

      // Calculate totals (using date-filtered transactions for period stats)
      const tagSpent = dateFilteredTx
        .filter((tx: any) => tx.category === 'Toll Usage')
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

      const cashSpent = dateFilteredTx
        .filter((tx: any) => tx.category === 'Tolls' && tx.amount < 0)
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

      const totalTopUp = dateFilteredTx
        .filter((tx: any) => tx.amount > 0)
        .reduce((sum: number, tx: any) => sum + tx.amount, 0);

      // Calculate Recovered & Net Loss
      // Phase 6: Use tx.linkedTrip (pre-embedded by server) instead of trips.find()
      let totalRecovered = 0;
      let totalNetLoss = 0;

      dateFilteredTx.forEach((tx: any) => {
          if (tx.amount < 0) {
              const trip = tx.linkedTrip || undefined;
              const claim = claims.find((c: any) => c.transactionId === tx.id);
              const financials = calculateTollFinancials(tx, trip, claim);
              totalRecovered += financials.totalRecovered;
              totalNetLoss += financials.netLoss;
          }
      });
      
      // Only include Top-ups and Tag Usage (exclude cash receipts) for the Tag Balance
      // Balance ALWAYS uses all-time data (not date-filtered) since it's a running total
      const calculatedBalance = filteredVehicleTx
        .filter((tx: any) => tx.category === 'Toll Usage' || tx.category === 'Toll Top-up')
        .reduce((sum: number, tx: any) => sum + tx.amount, 0);
      const currentBalance = vehicle?.tollBalance || 0;

      // Auto-Sync if mismatch detected
      if (Math.abs(currentBalance - calculatedBalance) > 0.01 && vehicle) {
          await api.saveVehicle({
              ...vehicle,
              tollBalance: calculatedBalance
          });
      }

      // Phase 6: Cache calculated balance on tag for list-view badges
      if (tag.lastCalculatedBalance === undefined || Math.abs((tag.lastCalculatedBalance || 0) - calculatedBalance) > 0.01) {
          try {
              await api.saveTollTag({
                  ...tag,
                  lastCalculatedBalance: calculatedBalance,
                  updatedAt: new Date().toISOString(),
              });
          } catch (e) {
              // Non-critical — don't block the UI
              console.error("Failed to cache calculated balance on tag:", e);
          }
      }

      // Phase 7: Compute utilization stats (uses date-filtered data)
      const tagTollCount = dateFilteredTx.filter((tx: any) => tx.category === 'Toll Usage').length;
      const cashTollCount = dateFilteredTx.filter((tx: any) => tx.category === 'Tolls' && tx.amount < 0).length;
      const totalTollCount = tagTollCount + cashTollCount;
      const tagUtilizationPercent = totalTollCount > 0 ? (tagTollCount / totalTollCount) * 100 : 0;
      const avgTollAmount = totalTollCount > 0 ? (tagSpent + cashSpent) / totalTollCount : 0;

      // Phase 7: Monthly spend (last 6 months)
      const monthlyMap = new Map<string, { tagAmount: number; cashAmount: number }>();
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, { tagAmount: 0, cashAmount: 0 });
      }
      dateFilteredTx.forEach((tx: any) => {
        if (tx.amount >= 0) return; // Skip top-ups (positive amounts)
        const txDate = new Date(tx.date || tx.createdAt);
        const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
        const entry = monthlyMap.get(key);
        if (!entry) return; // Outside 6-month window
        if (tx.category === 'Toll Usage') {
          entry.tagAmount += Math.abs(tx.amount);
        } else if (tx.category === 'Tolls') {
          entry.cashAmount += Math.abs(tx.amount);
        }
      });
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlySpend = Array.from(monthlyMap.entries()).map(([key, val]) => ({
        month: monthNames[parseInt(key.split('-')[1]) - 1],
        tagAmount: Math.round(val.tagAmount * 100) / 100,
        cashAmount: Math.round(val.cashAmount * 100) / 100,
      }));

      // Phase 7: Cache utilization percent on tag for list-view badges
      if (tag.lastUtilizationPercent === undefined || Math.abs((tag.lastUtilizationPercent || 0) - tagUtilizationPercent) > 1) {
          try {
              await api.saveTollTag({
                  ...tag,
                  lastCalculatedBalance: calculatedBalance,
                  lastUtilizationPercent: Math.round(tagUtilizationPercent),
                  updatedAt: new Date().toISOString(),
              });
          } catch (e) {
              console.error("Failed to cache utilization on tag:", e);
          }
      }

      setStats({
        balance: calculatedBalance,
        tagSpent,
        cashSpent,
        totalTopUp,
        totalRecovered,
        netLoss: totalNetLoss,
        calculatedBalance,
        tagTollCount,
        cashTollCount,
        avgTollAmount,
        tagUtilizationPercent,
        monthlySpend,
        loading: false,
        claims: claims
      });

    } catch (error) {
      console.error("Failed to fetch tag stats", error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchStats();
  }, [tag.assignedVehicleId]);

  // Re-fetch when date filter changes
  useEffect(() => {
    if (!stats.loading) {
      fetchStats();
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Phase 8: Backfill assignment history for legacy tags
  useEffect(() => {
    const backfillHistory = async () => {
      if (
        tag.assignedVehicleId &&
        (!tag.assignmentHistory || tag.assignmentHistory.length === 0)
      ) {
        try {
          const initialHistory = [{
            vehicleId: tag.assignedVehicleId,
            vehicleName: tag.assignedVehicleName || 'Unknown Vehicle',
            assignedAt: tag.createdAt || new Date().toISOString(),
          }];
          await api.saveTollTag({
            ...tag,
            assignmentHistory: initialHistory,
            updatedAt: new Date().toISOString(),
          });
          console.log("Phase 8: Backfilled assignment history for tag", tag.tagNumber);
        } catch (e) {
          console.error("Failed to backfill assignment history:", e);
        }
      }
    };
    backfillHistory();
  }, [tag.id]);

  const handleProviderBalanceEdit = () => {
    setIsEditingProviderBalance(true);
    setProviderBalanceInput(providerBalance?.toString() || '');
  };

  const handleProviderBalanceSave = async () => {
    setIsSavingProviderBalance(true);
    try {
      const newBalance = parseFloat(providerBalanceInput);
      if (isNaN(newBalance)) {
        toast.error("Please enter a valid number");
        setIsSavingProviderBalance(false);
        return;
      }
      const now = new Date().toISOString();
      await api.saveTollTag({
        ...tag,
        providerBalance: newBalance,
        providerBalanceDate: now,
        updatedAt: now,
      });
      setProviderBalance(newBalance);
      setProviderBalanceDate(now);
      setIsEditingProviderBalance(false);
      toast.success("Provider balance updated");
    } catch (error) {
      console.error("Failed to save provider balance:", error);
      toast.error("Failed to save provider balance");
    } finally {
      setIsSavingProviderBalance(false);
    }
  };

  const handleProviderBalanceCancel = () => {
    setIsEditingProviderBalance(false);
    setProviderBalanceInput('');
  };

  const handleThresholdEdit = () => {
    setIsEditingThreshold(true);
    setThresholdInput(lowBalanceThreshold.toString());
  };

  const handleThresholdSave = async () => {
    setIsSavingThreshold(true);
    try {
      const newThreshold = parseFloat(thresholdInput);
      if (isNaN(newThreshold)) {
        toast.error("Please enter a valid number");
        setIsSavingThreshold(false);
        return;
      }
      const now = new Date().toISOString();
      await api.saveTollTag({
        ...tag,
        lowBalanceThreshold: newThreshold,
        updatedAt: now,
      });
      setLowBalanceThreshold(newThreshold);
      setIsEditingThreshold(false);
      toast.success("Low balance threshold updated");
    } catch (error) {
      console.error("Failed to save low balance threshold:", error);
      toast.error("Failed to save low balance threshold");
    } finally {
      setIsSavingThreshold(false);
    }
  };

  const handleThresholdCancel = () => {
    setIsEditingThreshold(false);
    setThresholdInput('');
  };

  // Phase 5: Compute discrepancy
  const discrepancy = providerBalance !== undefined ? (providerBalance - stats.calculatedBalance) : null;
  const isBalanced = discrepancy !== null && Math.abs(discrepancy) <= 1;
  const hasDiscrepancy = discrepancy !== null && Math.abs(discrepancy) > 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            {tag.provider} <span className="text-slate-400">/</span> {tag.tagNumber}
          </h1>
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
            <Badge variant="outline" className={
                tag.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-700'
            }>
                {tag.status}
            </Badge>
            <span>•</span>
            <span className="flex items-center gap-1">
                <Car className="h-3 w-3" />
                {tag.assignedVehicleName || 'No Vehicle Assigned'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Added {new Date(tag.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        {/* View in Reconciliation button — only when tag has a vehicle */}
        {tag.assignedVehicleId && onNavigateToReconciliation && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onNavigateToReconciliation(tag.assignedVehicleId!)}
            className="shrink-0"
          >
            View in Reconciliation
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Phase 6: Low Balance Alert Banner */}
      {tag.assignedVehicleId && !stats.loading && !lowBalanceDismissed && stats.calculatedBalance < lowBalanceThreshold && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <div className="flex-1 text-sm text-red-800">
            <span className="font-semibold">Low Balance:</span> ${stats.calculatedBalance.toFixed(2)} is below your ${lowBalanceThreshold.toLocaleString()} threshold. Top up this tag soon.
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-800 hover:bg-red-100 shrink-0"
            onClick={() => setLowBalanceDismissed(true)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Date Range Filter Bar */}
      {tag.assignedVehicleId && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white px-4 py-2.5">
          <CalendarRange className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-xs font-medium text-slate-500 mr-1">Period:</span>
          {([
            { key: 'all', label: 'All Time' },
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: '3m', label: '3 Months' },
            { key: '6m', label: '6 Months' },
            { key: 'custom', label: 'Custom' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDatePreset(key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                datePreset === key
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )}
          {datePreset !== 'all' && (
            <Badge variant="outline" className="ml-auto bg-indigo-50 text-indigo-600 border-indigo-200 text-[10px]">
              <Filter className="h-2.5 w-2.5 mr-0.5" /> Filtered
            </Badge>
          )}
        </div>
      )}

      {tag.assignedVehicleId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tag Account Balance Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tag Account Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.loading ? (
                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
              ) : (
                <div className="flex flex-col gap-2">
                    <Tooltip>
                        <TooltipTrigger>
                            <div className={`text-2xl font-bold text-left ${stats.calculatedBalance > 0 ? 'text-emerald-600' : stats.calculatedBalance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            ${stats.calculatedBalance.toFixed(2)}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                            <p>Calculated balance on your prepaid toll tag. Reflects top-ups minus tag-deducted tolls. Cash toll payments are tracked separately.</p>
                        </TooltipContent>
                    </Tooltip>
                    <p className="text-xs text-muted-foreground">Prepaid tag balance</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                            ${stats.totalTopUp.toFixed(2)} top-ups
                        </span>
                        <span className="flex items-center gap-1">
                            <ArrowDownRight className="h-3 w-3 text-red-400" />
                            ${stats.tagSpent.toFixed(2)} tag usage
                        </span>
                    </div>

                    {/* Phase 5: Provider Balance Verification */}
                    <div className="border-t border-slate-100 pt-3 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">Provider Balance</span>
                            {!isEditingProviderBalance && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                                onClick={handleProviderBalanceEdit}
                                title="Update provider balance"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {isEditingProviderBalance ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-sm text-slate-500">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={providerBalanceInput}
                                onChange={(e) => setProviderBalanceInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleProviderBalanceSave();
                                  if (e.key === 'Escape') handleProviderBalanceCancel();
                                }}
                                className="w-28 h-7 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                placeholder="0.00"
                                autoFocus
                                disabled={isSavingProviderBalance}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={handleProviderBalanceSave}
                                disabled={isSavingProviderBalance}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                                onClick={handleProviderBalanceCancel}
                                disabled={isSavingProviderBalance}
                              >
                                <XIcon className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : providerBalance !== undefined ? (
                            <div className="mt-1">
                              <div className="text-sm font-semibold text-slate-700">
                                ${providerBalance.toFixed(2)}
                              </div>
                              {providerBalanceDate && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Last checked: {new Date(providerBalanceDate).toLocaleDateString()}
                                </div>
                              )}

                              {/* Discrepancy Indicator */}
                              {isBalanced && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="mt-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                      <Check className="h-2.5 w-2.5 mr-0.5" /> Balanced
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p>The provider's reported balance matches the system's calculated balance (within $1).</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {hasDiscrepancy && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="mt-1.5 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                      Discrepancy: {discrepancy! > 0 ? '+' : ''}${discrepancy!.toFixed(2)}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p>The provider reports a different balance than what's calculated from imported transactions. This usually means some top-ups or usage charges haven't been imported yet.</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1">
                              <button
                                onClick={handleProviderBalanceEdit}
                                className="text-xs text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
                              >
                                Enter provider balance to verify
                              </button>
                            </div>
                          )}
                        </div>

                    {/* Phase 6: Low Balance Threshold Config */}
                    <div className="border-t border-slate-100 pt-3 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                          <Settings2 className="h-3 w-3" /> Low Balance Alert
                        </span>
                        {!isEditingThreshold && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                            onClick={handleThresholdEdit}
                            title="Change threshold"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {isEditingThreshold ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-slate-500">Alert below $</span>
                          <input
                            type="number"
                            step="100"
                            value={thresholdInput}
                            onChange={(e) => setThresholdInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleThresholdSave();
                              if (e.key === 'Escape') handleThresholdCancel();
                            }}
                            className="w-20 h-7 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            placeholder="500"
                            autoFocus
                            disabled={isSavingThreshold}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={handleThresholdSave}
                            disabled={isSavingThreshold}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                            onClick={handleThresholdCancel}
                            disabled={isSavingThreshold}
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-500">
                          Alert when balance drops below <span className="font-medium text-slate-700">${lowBalanceThreshold.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Cash Toll Expenses Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Toll Expenses</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.loading ? (
                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
              ) : (
                <div className="flex flex-col gap-2">
                    <Tooltip>
                        <TooltipTrigger>
                            <div className={`text-2xl font-bold text-left ${stats.cashSpent > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            ${stats.cashSpent.toFixed(2)}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                            <p>Total tolls paid manually with cash receipts. These are separate from your prepaid tag balance.</p>
                        </TooltipContent>
                    </Tooltip>
                    <p className="text-xs text-muted-foreground">Manual cash payments</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>{stats.cashTollCount} cash receipt{stats.cashTollCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Activity Summary Card — Full Width */}
      {tag.assignedVehicleId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity Summary</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.loading ? (
              <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
            ) : (
              <div className="flex flex-col gap-5">
                  {/* Toll Expenses Row */}
                  <div className="flex items-center gap-6 flex-wrap">
                      <div>
                          <Tooltip>
                              <TooltipTrigger>
                                  <div className="text-xl font-bold text-slate-900">
                                  ${stats.tagSpent.toFixed(2)}
                                  </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>Total amount deducted automatically from the tag</p>
                              </TooltipContent>
                          </Tooltip>
                          <p className="text-xs text-muted-foreground mt-0.5">Tag Usage</p>
                      </div>
                      <div className="w-px h-10 bg-slate-200" />
                      <div>
                          <Tooltip>
                              <TooltipTrigger>
                                  <div className="text-xl font-bold text-slate-900">
                                  ${stats.cashSpent.toFixed(2)}
                                  </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>Total manual cash payments (receipts)</p>
                              </TooltipContent>
                          </Tooltip>
                          <p className="text-xs text-muted-foreground mt-0.5">Cash (Receipts)</p>
                      </div>
                      <div className="w-px h-10 bg-slate-200" />
                      <div>
                          <Tooltip>
                              <TooltipTrigger>
                                  <div className="text-xl font-bold text-emerald-600">
                                  ${stats.totalTopUp.toFixed(2)}
                                  </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>Total funds added to the tag account</p>
                              </TooltipContent>
                          </Tooltip>
                          <p className="text-xs text-muted-foreground mt-0.5">Total Top Up</p>
                      </div>
                      <div className="w-px h-10 bg-slate-200" />
                      <div>
                          <Tooltip>
                              <TooltipTrigger>
                                  <div className="text-xl font-bold text-indigo-600">
                                  ${(stats.tagSpent + stats.cashSpent).toFixed(2)}
                                  </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                  <p>Combined total: tag deductions + cash toll payments</p>
                              </TooltipContent>
                          </Tooltip>
                          <p className="text-xs text-muted-foreground mt-0.5">Total Toll Expense</p>
                      </div>
                  </div>
                  
                  {/* Recovery Status Section */}
                  <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recovery Status</span>
                      </div>
                      <div className="flex items-center gap-6 flex-wrap">
                          <div>
                              <Tooltip>
                                  <TooltipTrigger>
                                      <div className="text-xl font-bold text-emerald-600">
                                      ${stats.totalRecovered.toFixed(2)}
                                      </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p>Total amount recovered from Platform or Drivers</p>
                                  </TooltipContent>
                              </Tooltip>
                              <p className="text-xs text-muted-foreground mt-0.5">Recovered</p>
                          </div>
                          <div className="w-px h-10 bg-slate-200" />
                          <div>
                              <Tooltip>
                                  <TooltipTrigger>
                                      <div className={`text-xl font-bold ${stats.netLoss > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      ${stats.netLoss.toFixed(2)}
                                      </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p>Total unrecovered cost (Fleet Expense)</p>
                                  </TooltipContent>
                              </Tooltip>
                              <p className="text-xs text-muted-foreground mt-0.5">Net Loss</p>
                          </div>
                      </div>
                  </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 7: Tag Utilization Analytics */}
      {tag.assignedVehicleId && !stats.loading && (stats.tagTollCount > 0 || stats.cashTollCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Utilization Pie Chart Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tag Utilization</CardTitle>
              <Tag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {(() => {
                const PIE_COLORS = ['#6366f1', '#a855f7'];
                const pieData = [
                  { name: 'Tag', value: stats.tagTollCount },
                  { name: 'Cash', value: stats.cashTollCount },
                ].filter(d => d.value > 0);
                const pct = Math.round(stats.tagUtilizationPercent);
                return (
                  <div className="flex flex-col items-center gap-3">
                    <SafeResponsiveContainer width="100%" height={160} minHeight={160}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((_, idx) => (
                            <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [`${value} transaction${value !== 1 ? 's' : ''}`, name]}
                        />
                      </PieChart>
                    </SafeResponsiveContainer>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-900">
                        {pct}% tag <span className="text-slate-300 mx-1">·</span> {100 - pct}% cash
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-indigo-500" /> {stats.tagTollCount} tag
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-purple-500" /> {stats.cashTollCount} cash
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Avg toll: ${stats.avgTollAmount.toFixed(2)}
                      </div>
                      {pct === 0 && (
                        <p className="text-xs text-amber-600 mt-2">
                          This tag hasn't been used for toll deductions. All tolls are being paid with cash.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Monthly Spending Trend Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Toll Spend</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.monthlySpend.some(m => m.tagAmount > 0 || m.cashAmount > 0) ? (
                <SafeResponsiveContainer width="100%" height={200} minHeight={200}>
                  <BarChart data={stats.monthlySpend} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [
                        `$${value.toFixed(2)}`,
                        name === 'tagAmount' ? 'Tag Usage' : 'Cash Tolls'
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => value === 'tagAmount' ? 'Tag Usage' : 'Cash Tolls'}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    <Bar dataKey="tagAmount" stackId="toll" fill="#6366f1" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="cashAmount" stackId="toll" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </SafeResponsiveContainer>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  No toll spending data in the last 6 months.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
          {/* We can add more specific tag stats here later */}
          
          <Card>
              <CardHeader>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>
                    {tag.assignedVehicleId 
                        ? `Showing transactions for tag ${tag.tagNumber} on vehicle ${tag.assignedVehicleName}. Legacy transactions without tag metadata are also included.`
                        : "This tag is not currently assigned to a vehicle. History is tracked by vehicle."}
                  </CardDescription>
              </CardHeader>
              <CardContent>
                  {tag.assignedVehicleId ? (
                      <TollTopupHistory 
                        vehicleId={tag.assignedVehicleId}
                        tagNumber={tag.tagNumber}
                        onTransactionChange={fetchStats}
                      />
                  ) : (
                      <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                          <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p>Assign this tag to a vehicle to track its usage.</p>
                      </div>
                  )}
              </CardContent>
          </Card>

          {/* Phase 8: Assignment History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Assignment History</CardTitle>
                <CardDescription>
                  Track when this tag was assigned or unassigned from vehicles.
                </CardDescription>
              </div>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {tag.assignmentHistory && tag.assignmentHistory.length > 0 ? (
                <div className="relative pl-6 space-y-0">
                  {/* Timeline line */}
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200" />
                  {[...tag.assignmentHistory]
                    .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())
                    .map((entry, idx) => {
                      const isCurrent = !entry.unassignedAt;
                      return (
                        <div key={`${entry.vehicleId}-${entry.assignedAt}`} className="relative pb-5 last:pb-0">
                          {/* Assigned event */}
                          <div className="flex items-start gap-3 mb-2">
                            <div className={`absolute -left-6 mt-1 h-[18px] w-[18px] rounded-full border-2 flex items-center justify-center ${
                              isCurrent ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'
                            }`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${isCurrent ? 'bg-white' : 'bg-slate-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm font-medium ${isCurrent ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  Assigned to {entry.vehicleName}
                                </span>
                                {isCurrent && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5">
                                    Current
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(entry.assignedAt).toLocaleDateString()} at {new Date(entry.assignedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>

                          {/* Unassigned event (if applicable) */}
                          {entry.unassignedAt && (
                            <div className="flex items-start gap-3 ml-0 mt-2">
                              <div className="absolute -left-6 mt-1 h-[18px] w-[18px] rounded-full border-2 bg-white border-red-300 flex items-center justify-center">
                                <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-red-600">
                                  Unassigned from {entry.vehicleName}
                                </span>
                                <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {new Date(entry.unassignedAt).toLocaleDateString()} at {new Date(entry.unassignedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No assignment history recorded.</p>
                  <p className="text-xs mt-1">History tracking starts from the next assign/unassign action.</p>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
