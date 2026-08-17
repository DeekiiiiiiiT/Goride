import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { ArrowLeft, Car, Tag, Wallet, TrendingDown, ShieldCheck, ArrowRight, AlertTriangle, Pencil, Check, XIcon, Settings2, CalendarRange, Filter, Download, Clock, History, Info, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TollTag } from "../../types/vehicle";
import { Claim, DisputeRefund, FinancialTransaction } from "../../types/data";
import { TollTopupHistory } from "../vehicles/TollTopupHistory";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";
import { sumTagUsageFinancials } from "../../utils/tollReconciliation";
import { isTagLedgerTx, isTagUsage, isTagCredit, isVoidedTx } from "../../utils/tollTagLedger";

interface TollTagDetailProps {
  tag: TollTag;
  onBack: () => void;
  onNavigateToReconciliation?: (vehicleId: string) => void;
}

type DatePreset = 'all' | '7d' | '30d' | '3m' | '6m' | 'custom';

function normalizeTag(t: string) {
  return t.trim().replace(/^0+/, '');
}

function isDifferentTagTx(tx: FinancialTransaction, tagNumber?: string) {
  const txTagId = String(tx.metadata?.tollTagId || tx.metadata?.tagId || tx.metadata?.tagNumber || '');
  if (!tagNumber || !txTagId) return false;
  return normalizeTag(txTagId) !== normalizeTag(tagNumber);
}

function daysAgo(iso?: string) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

function BalanceSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 160;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-emerald-600" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function TollTagDetail({ tag, onBack, onNavigateToReconciliation }: TollTagDetailProps) {
  const [providerBalance, setProviderBalance] = useState<number | undefined>(tag.providerBalance);
  const [providerBalanceDate, setProviderBalanceDate] = useState<string | undefined>(tag.providerBalanceDate);
  const [isEditingProviderBalance, setIsEditingProviderBalance] = useState(false);
  const [providerBalanceInput, setProviderBalanceInput] = useState('');
  const [isSavingProviderBalance, setIsSavingProviderBalance] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number>(tag.lowBalanceThreshold ?? 500);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [lowBalanceDismissed, setLowBalanceDismissed] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [thisTagOnly, setThisTagOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [ledgerAll, setLedgerAll] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [disputeRefunds, setDisputeRefunds] = useState<DisputeRefund[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

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

  const filterByDate = (txList: FinancialTransaction[]) => {
    const { start, end } = getDateRange();
    if (!start && !end) return txList;
    return txList.filter((tx) => {
      const txDate = new Date(tx.date || (tx as any).createdAt);
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
      return true;
    });
  };

  const syncBalanceIfNeeded = async (calculatedBalance: number) => {
    if (!tag.assignedVehicleId) return;
    try {
      const vehicles = await api.getVehicles();
      const vehicle = vehicles.find((v: any) => v.id === tag.assignedVehicleId);
      const currentBalance = vehicle?.tollBalance || 0;
      if (Math.abs(currentBalance - calculatedBalance) > 0.01 && vehicle) {
        await api.saveVehicle({ ...vehicle, tollBalance: calculatedBalance });
      }
      if (tag.lastCalculatedBalance === undefined || Math.abs((tag.lastCalculatedBalance || 0) - calculatedBalance) > 0.01) {
        await api.saveTollTag({
          ...tag,
          lastCalculatedBalance: calculatedBalance,
          lastBalanceSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Failed to sync calculated balance:", e);
    }
  };

  const fetchLedger = async (opts?: { syncBalance?: boolean }) => {
    if (!tag.assignedVehicleId) {
      setLedgerAll([]);
      setLedgerLoading(false);
      return;
    }
    setLedgerLoading(true);
    try {
      const [tollResponse, allClaims, disputesRes] = await Promise.all([
        api.getTollLogs({ vehicleId: tag.assignedVehicleId, tagNumber: tag.tagNumber, tagId: tag.id, scope: 'tag' }),
        api.getClaims(),
        api.getDisputeRefunds().catch(() => ({ data: [] as DisputeRefund[] })),
      ]);
      const tagLedgerAll = ((tollResponse?.data || []) as FinancialTransaction[]).filter(isTagLedgerTx);
      setLedgerAll(tagLedgerAll);
      setClaims(allClaims || []);
      setDisputeRefunds(disputesRes?.data || []);
      const calculatedBalance = tagLedgerAll
        .filter((tx) => !isVoidedTx(tx))
        .reduce((sum, tx) => sum + tx.amount, 0);
      if (opts?.syncBalance) {
        await syncBalanceIfNeeded(calculatedBalance);
      }
    } catch (error) {
      console.error("Failed to fetch tag stats", error);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    void fetchLedger({ syncBalance: true });
  }, [tag.assignedVehicleId, tag.id]);

  useEffect(() => {
    const backfillHistory = async () => {
      if (tag.assignedVehicleId && (!tag.assignmentHistory || tag.assignmentHistory.length === 0)) {
        try {
          await api.saveTollTag({
            ...tag,
            assignmentHistory: [{
              vehicleId: tag.assignedVehicleId,
              vehicleName: tag.assignedVehicleName || 'Unknown Vehicle',
              assignedAt: tag.createdAt || new Date().toISOString(),
            }],
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error("Failed to backfill assignment history:", e);
        }
      }
    };
    void backfillHistory();
  }, [tag.id]);

  const scopedLedger = useMemo(() => {
    if (!thisTagOnly) return ledgerAll;
    return ledgerAll.filter((tx) => !isDifferentTagTx(tx, tag.tagNumber));
  }, [ledgerAll, thisTagOnly, tag.tagNumber]);

  const periodTx = useMemo(() => filterByDate(scopedLedger), [scopedLedger, datePreset, customStartDate, customEndDate]);

  const calculatedBalance = useMemo(
    () => scopedLedger.filter((tx) => !isVoidedTx(tx)).reduce((sum, tx) => sum + tx.amount, 0),
    [scopedLedger],
  );

  const sparkPoints = useMemo(() => {
    const chrono = [...scopedLedger]
      .filter((tx) => !isVoidedTx(tx))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = 0;
    return chrono.map((tx) => {
      running += tx.amount;
      return running;
    });
  }, [scopedLedger]);

  const periodStats = useMemo(() => {
    const tagSpent = periodTx.filter(isTagUsage).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totalTopUp = periodTx.filter(isTagCredit).reduce((sum, tx) => sum + tx.amount, 0);
    const usage = periodTx.filter(isTagUsage);
    const { totalRecovered, netLoss } = sumTagUsageFinancials({
      usageTolls: usage,
      claims,
      disputeRefunds,
    });
    const { start, end } = getDateRange();
    const days = start && end ? Math.max(1, (end.getTime() - start.getTime()) / 86400000) : 7;
    const burnPerWeek = tagSpent / (days / 7);
    return { tagSpent, totalTopUp, totalRecovered, netLoss, burnPerWeek };
  }, [periodTx, claims, disputeRefunds]);

  useEffect(() => {
    if (ledgerLoading) return;
    setPeriodLoading(true);
    const t = window.setTimeout(() => setPeriodLoading(false), 120);
    return () => window.clearTimeout(t);
  }, [datePreset, customStartDate, customEndDate, thisTagOnly, ledgerLoading]);

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
        return;
      }
      const now = new Date().toISOString();
      await api.saveTollTag({ ...tag, providerBalance: newBalance, providerBalanceDate: now, updatedAt: now });
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

  const handleThresholdSave = async () => {
    setIsSavingThreshold(true);
    try {
      const newThreshold = parseFloat(thresholdInput);
      if (isNaN(newThreshold)) {
        toast.error("Please enter a valid number");
        return;
      }
      const now = new Date().toISOString();
      await api.saveTollTag({ ...tag, lowBalanceThreshold: newThreshold, updatedAt: now });
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

  const exportCsv = () => {
    const rows = periodTx;
    const header = ['Date', 'Description', 'Type', 'Platform', 'Recovered', 'Net Loss', 'Amount', 'Tag'];
    const { allocation } = sumTagUsageFinancials({
      usageTolls: rows.filter(isTagUsage),
      claims,
      disputeRefunds,
    });
    const lines = rows.map((tx) => {
      const trip = (tx as any).linkedTrip;
      const claim = claims.find((c) => c.transactionId === tx.id);
      const recovered = isTagUsage(tx)
        ? (allocation.get(tx.id) ?? 0)
        : 0;
      const voided = isVoidedTx(tx);
      const amount = voided ? Number(tx.metadata?.originalAmount ?? tx.amount ?? 0) : tx.amount;
      return [
        tx.date,
        (tx.description || '').replace(/,/g, ' '),
        tx.category || '',
        trip?.platform || '',
        recovered.toFixed(2),
        isTagUsage(tx) && !voided ? (Math.abs(tx.amount) - recovered).toFixed(2) : '',
        amount.toFixed(2),
        String(tx.metadata?.tagNumber || tx.metadata?.tollTagId || tag.tagNumber),
      ].join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tag-${tag.tagNumber}-transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const discrepancy = providerBalance !== undefined ? (providerBalance - calculatedBalance) : null;
  const isBalanced = discrepancy !== null && Math.abs(discrepancy) <= 1;
  const hasDiscrepancy = discrepancy !== null && Math.abs(discrepancy) > 1;
  const providerAge = daysAgo(providerBalanceDate);
  const differentTagCount = ledgerAll.filter((tx) => isDifferentTagTx(tx, tag.tagNumber)).length;
  const isLow = !ledgerLoading && calculatedBalance < lowBalanceThreshold;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-100">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 truncate">
              {tag.provider} <span className="text-slate-400">/</span> {tag.tagNumber}
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5 flex-wrap">
              <Badge variant="outline" className={
                tag.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-700'
              }>
                {tag.status}
              </Badge>
              <span className="flex items-center gap-1">
                <Car className="h-3 w-3" />
                {tag.assignedVehicleName || 'No Vehicle Assigned'}
              </span>
              <span className={`font-semibold ${calculatedBalance > 0 ? 'text-emerald-600' : calculatedBalance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                ${calculatedBalance.toFixed(2)}
              </span>
              {isLow && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Low</Badge>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!tag.assignedVehicleId || periodTx.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          {tag.assignedVehicleId && onNavigateToReconciliation && (
            <Button variant="outline" size="sm" onClick={() => onNavigateToReconciliation(tag.assignedVehicleId!)} className="shrink-0">
              View in Reconciliation
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {tag.assignedVehicleId && !ledgerLoading && !lowBalanceDismissed && isLow && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <div className="flex-1 text-sm text-red-800">
            <span className="font-semibold">Low Balance:</span> ${calculatedBalance.toFixed(2)} is below your ${lowBalanceThreshold.toLocaleString()} threshold. Top up this tag soon.
          </div>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800 hover:bg-red-100 shrink-0" onClick={() => setLowBalanceDismissed(true)}>
            Dismiss
          </Button>
        </div>
      )}

      {differentTagCount > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          This page can include vehicle history not yet linked to this tag ({differentTagCount} row{differentTagCount === 1 ? '' : 's'}). Use “This tag only” to hide them.
        </div>
      )}

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
                datePreset === key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="h-7 px-2 text-xs border border-slate-200 rounded" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="h-7 px-2 text-xs border border-slate-200 rounded" />
            </div>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={thisTagOnly} onChange={(e) => setThisTagOnly(e.target.checked)} />
            This tag only
          </label>
          {datePreset !== 'all' && (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200 text-[10px]">
              <Filter className="h-2.5 w-2.5 mr-0.5" /> Filtered
            </Badge>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({periodTx.length})</TabsTrigger>
          <TabsTrigger value="history">Assignment History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {tag.assignedVehicleId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tag Account Balance</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {ledgerLoading ? (
                  <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`text-2xl font-bold ${calculatedBalance > 0 ? 'text-emerald-600' : calculatedBalance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          ${calculatedBalance.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">All-time prepaid tag balance</p>
                      </div>
                      <BalanceSparkline points={sparkPoints} />
                    </div>
                    <Button variant="ghost" size="sm" className="w-fit h-7 px-2 text-xs text-slate-500" onClick={() => void fetchLedger({ syncBalance: true })}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Recalculate balance
                    </Button>

                    <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">Verify provider balance</span>
                        {!isEditingProviderBalance && (
                          <Button variant="outline" size="sm" className="h-7" onClick={handleProviderBalanceEdit}>
                            <Pencil className="h-3 w-3 mr-1" /> Update
                          </Button>
                        )}
                      </div>
                      {isEditingProviderBalance ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={providerBalanceInput}
                            onChange={(e) => setProviderBalanceInput(e.target.value)}
                            className="w-28 h-7 px-2 text-sm border border-slate-200 rounded"
                            autoFocus
                          />
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600" onClick={handleProviderBalanceSave} disabled={isSavingProviderBalance}><Check className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditingProviderBalance(false)}><XIcon className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : providerBalance !== undefined ? (
                        <div>
                          <div className="text-sm font-semibold text-slate-700">${providerBalance.toFixed(2)}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {providerAge == null ? 'Never checked' : providerAge === 0 ? 'Last checked today' : `Last checked ${providerAge} day${providerAge === 1 ? '' : 's'} ago`}
                          </div>
                          {isBalanced && <Badge variant="outline" className="mt-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"><Check className="h-2.5 w-2.5 mr-0.5" /> Balanced</Badge>}
                          {hasDiscrepancy && (
                            <Badge variant="outline" className="mt-1.5 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Discrepancy: {discrepancy! > 0 ? '+' : ''}${discrepancy!.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <button onClick={handleProviderBalanceEdit} className="text-sm text-indigo-600 hover:underline">
                          Enter provider balance to verify
                        </button>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Settings2 className="h-3 w-3" /> Low Balance Alert</span>
                        {!isEditingThreshold && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setIsEditingThreshold(true); setThresholdInput(lowBalanceThreshold.toString()); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {isEditingThreshold ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-20 h-7 px-2 text-sm border rounded" />
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600" onClick={handleThresholdSave}><Check className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditingThreshold(false)}><XIcon className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-500">Alert when balance drops below <span className="font-medium text-slate-700">${lowBalanceThreshold.toLocaleString()}</span></div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tag.assignedVehicleId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Activity Summary</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {periodLoading ? (
                  <div className="h-8 w-40 bg-slate-100 animate-pulse rounded" />
                ) : (
                  <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-6 flex-wrap">
                      <div>
                        <div className="text-xl font-bold text-slate-900">${periodStats.tagSpent.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">Tag Usage</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Burn ~${periodStats.burnPerWeek.toFixed(0)}/week</p>
                      </div>
                      <div className="w-px h-10 bg-slate-200" />
                      <div>
                        <div className="text-xl font-bold text-emerald-600">${periodStats.totalTopUp.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">Total Top Up</p>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recovery Status</span>
                        <Tooltip>
                          <TooltipTrigger><Info className="h-3.5 w-3.5 text-slate-400" /></TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Recovered uses the same trip-refund pooling as Toll Reconciliation (shared across plazas on one trip, plus dispute and unlinked credits).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-6 flex-wrap">
                        <div>
                          <div className="text-xl font-bold text-emerald-600">${periodStats.totalRecovered.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground mt-0.5">Recovered</p>
                        </div>
                        <div className="w-px h-10 bg-slate-200" />
                        <div>
                          <div className={`text-xl font-bold ${periodStats.netLoss > 0 ? 'text-rose-600' : 'text-slate-400'}`}>${periodStats.netLoss.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground mt-0.5">Net Loss</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                {tag.assignedVehicleId
                  ? `Prepaid tag activity for ${tag.tagNumber}. Row click opens detail. Void keeps an audit trail.`
                  : "This tag is not currently assigned to a vehicle."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tag.assignedVehicleId ? (
                <TollTopupHistory
                  vehicleId={tag.assignedVehicleId}
                  tagNumber={tag.tagNumber}
                  tagId={tag.id}
                  scope="tag"
                  refreshTrigger={historyRefresh}
                  thisTagOnly={thisTagOnly}
                  dateFilteredTransactions={periodTx}
                  claimsList={claims}
                  disputeRefunds={disputeRefunds}
                  onTransactionChange={() => {
                    void fetchLedger({ syncBalance: true });
                    setHistoryRefresh((n) => n + 1);
                  }}
                />
              ) : (
                <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                  <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Assign this tag to a vehicle to track its usage.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignment History</CardTitle>
              <CardDescription>When this tag was assigned or unassigned from vehicles.</CardDescription>
            </CardHeader>
            <CardContent>
              {tag.assignmentHistory && tag.assignmentHistory.length > 0 ? (
                <div className="relative pl-6">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200" />
                  {[...tag.assignmentHistory]
                    .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())
                    .map((entry) => {
                      const isCurrent = !entry.unassignedAt;
                      return (
                        <div key={`${entry.vehicleId}-${entry.assignedAt}`} className="relative pb-5 last:pb-0">
                          <div className="flex items-start gap-3 mb-2">
                            <div className={`absolute -left-6 mt-1 h-[18px] w-[18px] rounded-full border-2 ${isCurrent ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${isCurrent ? 'text-emerald-700' : 'text-slate-700'}`}>Assigned to {entry.vehicleName}</span>
                                {isCurrent && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Current</Badge>}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(entry.assignedAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {entry.unassignedAt && (
                            <div className="text-sm text-red-600">
                              Unassigned from {entry.vehicleName}
                              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(entry.unassignedAt).toLocaleString()}
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
