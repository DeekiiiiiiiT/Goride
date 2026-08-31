import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import {
  ArrowLeft, Car, Tag, Wallet, ArrowRight, AlertTriangle, Pencil, Check, XIcon,
  Settings2, CalendarRange, Filter, Download, Clock, History, RefreshCw,
  PlusCircle, UserPlus,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TollTag } from "../../types/vehicle";
import { Claim, DisputeRefund, FinancialTransaction } from "../../types/data";
import { TollTopupHistory } from "../vehicles/TollTopupHistory";
import { LogTollTopupModal } from "../vehicles/LogTollTopupModal";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";
import { sumTagUsageFinancials } from "../../utils/tollReconciliation";
import { isTagLedgerTx, isTagUsage, isTagCredit, isVoidedTx } from "../../utils/tollTagLedger";
import { getTollTransactionDate } from "../../utils/tollWeekPeriod";
import { formatJMD, formatJMDDelta } from "../../utils/formatJMD";
import {
  computeTagBurnRate,
  avgCostPerPassage,
  estimateTripsRemaining,
  balanceRingState,
  type BalanceRingState,
} from "../../utils/tollTagBurnRate";
import { cn } from "../ui/utils";

interface TollTagDetailProps {
  tag: TollTag;
  onBack: () => void;
  onNavigateToReconciliation?: (vehicleId: string) => void;
  onRequestAssign?: () => void;
}

type DatePreset = 'all' | '7d' | '30d' | '3m' | '6m' | 'custom';
type TxKindFilter = 'all' | 'money-in' | 'money-used' | 'money-back';

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

function ringClasses(state: BalanceRingState) {
  switch (state) {
    case 'healthy':
      return 'ring-emerald-500 shadow-emerald-200/60';
    case 'watch':
      return 'ring-lime-500 shadow-lime-200/50';
    case 'low':
      return 'ring-amber-500 shadow-amber-200/60';
    case 'empty':
      return 'ring-red-500 shadow-red-200/60';
  }
}

function providerCardGradient(provider: string) {
  const p = provider.toLowerCase();
  if (p.includes('t-tag') || p.includes('ttag')) {
    return 'from-sky-700 via-sky-800 to-slate-900';
  }
  if (p.includes('jrc')) {
    return 'from-indigo-700 via-indigo-800 to-slate-900';
  }
  return 'from-slate-700 via-slate-800 to-slate-950';
}

export function TollTagDetail({
  tag,
  onBack,
  onNavigateToReconciliation,
  onRequestAssign,
}: TollTagDetailProps) {
  const [providerBalance, setProviderBalance] = useState<number | undefined>(tag.providerBalance);
  const [providerBalanceDate, setProviderBalanceDate] = useState<string | undefined>(tag.providerBalanceDate);
  const [isEditingProviderBalance, setIsEditingProviderBalance] = useState(false);
  const [providerBalanceInput, setProviderBalanceInput] = useState('');
  const [isSavingProviderBalance, setIsSavingProviderBalance] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number>(tag.lowBalanceThreshold ?? 500);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [showRepairTools, setShowRepairTools] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [thisTagOnly, setThisTagOnly] = useState(false);
  const [txKindFilter, setTxKindFilter] = useState<TxKindFilter>('all');
  const [plazaFilter, setPlazaFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [ledgerAll, setLedgerAll] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [disputeRefunds, setDisputeRefunds] = useState<DisputeRefund[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [topupOpen, setTopupOpen] = useState(false);

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
      const txDate = tx.date
        ? getTollTransactionDate(tx)
        : new Date((tx as any).createdAt);
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
        await api.saveVehicle({
          ...vehicle,
          tollBalance: calculatedBalance,
          expectedUpdatedAt: vehicle.updatedAt,
        });
      }
      if (tag.lastCalculatedBalance === undefined || Math.abs((tag.lastCalculatedBalance || 0) - calculatedBalance) > 0.01) {
        await api.saveTollTag({
          ...tag,
          lastCalculatedBalance: calculatedBalance,
          lastBalanceSyncedAt: new Date().toISOString(),
          expectedUpdatedAt: tag.updatedAt,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      if (e?.name === 'TollTagConflictError' || e?.name === 'VehicleConflictError') {
        toast.error('This record was updated in another tab — refresh and recalculate again.');
        return;
      }
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
    void fetchLedger({ syncBalance: false });
  }, [tag.assignedVehicleId, tag.id]);

  const scopedLedger = useMemo(() => {
    if (!thisTagOnly) return ledgerAll;
    return ledgerAll.filter((tx) => !isDifferentTagTx(tx, tag.tagNumber));
  }, [ledgerAll, thisTagOnly, tag.tagNumber]);

  const periodTx = useMemo(
    () => filterByDate(scopedLedger),
    [scopedLedger, datePreset, customStartDate, customEndDate],
  );

  const balanceLedger = useMemo(
    () => ledgerAll.filter((tx) => !isVoidedTx(tx) && !isDifferentTagTx(tx, tag.tagNumber)),
    [ledgerAll, tag.tagNumber],
  );

  const calculatedBalance = useMemo(
    () => balanceLedger.reduce((sum, tx) => sum + tx.amount, 0),
    [balanceLedger],
  );

  const periodStats = useMemo(() => {
    const usage = periodTx.filter(isTagUsage);
    const credits = periodTx.filter(isTagCredit);
    const tagSpent = usage.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totalTopUp = credits.reduce((sum, tx) => sum + tx.amount, 0);
    const topUpCount = credits.length;
    const { totalRecovered, netLoss } = sumTagUsageFinancials({
      usageTolls: usage,
      claims,
      disputeRefunds,
    });
    const burn = computeTagBurnRate(usage, getDateRange());
    const avg = avgCostPerPassage(usage);
    const lastTopUp = credits
      .slice()
      .sort((a, b) => getTollTransactionDate(b).getTime() - getTollTransactionDate(a).getTime())[0];
    const lastTopUpAmount = lastTopUp ? Math.abs(lastTopUp.amount) : 0;
    return {
      tagSpent,
      totalTopUp,
      topUpCount,
      passageCount: usage.length,
      totalRecovered,
      netLoss,
      burn,
      avg,
      lastTopUpAmount,
    };
  }, [periodTx, claims, disputeRefunds, datePreset, customStartDate, customEndDate]);

  const tripsLeft = useMemo(
    () => estimateTripsRemaining(calculatedBalance, periodStats.avg),
    [calculatedBalance, periodStats.avg],
  );

  const ringState = useMemo(
    () => balanceRingState(calculatedBalance, lowBalanceThreshold),
    [calculatedBalance, lowBalanceThreshold],
  );

  const plazaOptions = useMemo(() => {
    const names = new Set<string>();
    for (const tx of periodTx) {
      const name = String(
        (tx as any).plazaName ||
          tx.metadata?.plazaName ||
          tx.metadata?.location ||
          '',
      ).trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [periodTx]);

  const filteredTx = useMemo(() => {
    let rows = periodTx;
    if (txKindFilter === 'money-in') {
      rows = rows.filter(isTagCredit);
    } else if (txKindFilter === 'money-used') {
      rows = rows.filter(isTagUsage);
    } else if (txKindFilter === 'money-back') {
      rows = rows.filter((tx) => {
        if (!isTagUsage(tx) || isVoidedTx(tx)) return false;
        const claim = claims.find((c) => c.transactionId === tx.id);
        return !!claim || Math.abs(tx.amount) > 0;
      });
      // Money back = usage rows that have recovery; fall back to recovered allocation
      const { allocation } = sumTagUsageFinancials({
        usageTolls: rows.filter(isTagUsage),
        claims,
        disputeRefunds,
      });
      rows = rows.filter((tx) => (allocation.get(tx.id) ?? 0) > 0.005);
    }
    if (plazaFilter !== 'all') {
      rows = rows.filter((tx) => {
        const name = String(
          (tx as any).plazaName ||
            tx.metadata?.plazaName ||
            tx.metadata?.location ||
            '',
        ).trim();
        return name === plazaFilter;
      });
    }
    return rows;
  }, [periodTx, txKindFilter, plazaFilter, claims, disputeRefunds]);

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
      await api.saveTollTag({ ...tag, providerBalance: newBalance, providerBalanceDate: now, expectedUpdatedAt: tag.updatedAt, updatedAt: now });
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
      await api.saveTollTag({ ...tag, lowBalanceThreshold: newThreshold, expectedUpdatedAt: tag.updatedAt, updatedAt: now });
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
    const rows = filteredTx;
    const header = ['Date', 'Description', 'Type', 'Platform', 'Recovered', 'Net Loss', 'Amount', 'Tag'];
    const { allocation } = sumTagUsageFinancials({
      usageTolls: rows.filter(isTagUsage),
      claims,
      disputeRefunds,
    });
    const lines = rows.map((tx) => {
      const trip = (tx as any).linkedTrip;
      const recovered = isTagUsage(tx) ? (allocation.get(tx.id) ?? 0) : 0;
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

  const openTxFilter = (kind: TxKindFilter) => {
    setTxKindFilter(kind);
    setActiveTab('transactions');
  };

  const discrepancy = providerBalance !== undefined ? (providerBalance - calculatedBalance) : null;
  const isBalanced = discrepancy !== null && Math.abs(discrepancy) <= 1;
  const hasDiscrepancy = discrepancy !== null && Math.abs(discrepancy) > 1;
  const providerAge = daysAgo(providerBalanceDate);
  const differentTagCount = periodTx.filter((tx) => isDifferentTagTx(tx, tag.tagNumber)).length;
  const isLow = !ledgerLoading && (ringState === 'low' || ringState === 'empty');
  const fillPct =
    periodStats.lastTopUpAmount > 0
      ? Math.max(0, Math.min(100, (calculatedBalance / periodStats.lastTopUpAmount) * 100))
      : calculatedBalance > 0
        ? 100
        : 0;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
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
              {isLow && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Needs top-up</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tag.assignedVehicleId ? (
              <Button size="sm" onClick={() => setTopupOpen(true)}>
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Top up
              </Button>
            ) : onRequestAssign ? (
              <Button size="sm" onClick={onRequestAssign}>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Assign to vehicle
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!tag.assignedVehicleId || filteredTx.length === 0}>
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
      </div>

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
          <TabsTrigger value="transactions">Transactions ({filteredTx.length})</TabsTrigger>
          <TabsTrigger value="history">Assignment History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {tag.assignedVehicleId && (
            <>
              {/* B8 hero — physical transponder card */}
              <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                <button
                  type="button"
                  onClick={() => setShowAlertSettings((v) => !v)}
                  className={cn(
                    'relative w-full max-w-[340px] aspect-[340/210] rounded-2xl bg-gradient-to-br text-left text-white p-5 ring-4 shadow-lg transition-shadow',
                    providerCardGradient(tag.provider),
                    ringClasses(ringState),
                  )}
                  aria-label="Tag balance card — click for alert settings"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">{tag.provider}</p>
                      <p className="mt-1 font-mono text-sm tracking-wider">{tag.tagNumber}</p>
                    </div>
                    <Wallet className="h-5 w-5 text-white/70" />
                  </div>
                  <div className="mt-6">
                    {ledgerLoading ? (
                      <div className="h-9 w-36 bg-white/20 animate-pulse rounded" />
                    ) : (
                      <p className="text-3xl font-bold tabular-nums tracking-tight">{formatJMD(calculatedBalance, 2)}</p>
                    )}
                    <p className="mt-1 text-sm text-white/80">
                      {ledgerLoading
                        ? '…'
                        : tripsLeft == null
                          ? 'Not enough passages yet to estimate trips left'
                          : tripsLeft === 0
                            ? 'No more trips at this rate — top up now'
                            : `About ${tripsLeft} more trip${tripsLeft === 1 ? '' : 's'} at this rate`}
                    </p>
                  </div>
                  <div className="absolute bottom-5 left-5 right-5">
                    <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
                      <span>{tag.assignedVehicleName || 'No plate'}</span>
                      <span>{Math.round(fillPct)}% of last top-up</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/90 transition-all"
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                </button>

                <div className="flex-1 space-y-3">
                  {showAlertSettings && (
                    <Card className="border-amber-200 bg-amber-50/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Settings2 className="h-3.5 w-3.5" />
                          Low balance alert
                        </CardTitle>
                        <CardDescription>
                          Ring turns amber below this amount. Click the card again to hide.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isEditingThreshold ? (
                          <div className="flex items-center gap-2">
                            <input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-24 h-8 px-2 text-sm border rounded" />
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600" onClick={handleThresholdSave} disabled={isSavingThreshold}><Check className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsEditingThreshold(false)}><XIcon className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-slate-600">
                              Alert when balance drops below <span className="font-medium text-slate-900">{formatJMD(lowBalanceThreshold)}</span>
                            </p>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setIsEditingThreshold(true); setThresholdInput(lowBalanceThreshold.toString()); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {isLow && !showAlertSettings && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        Balance is below your {formatJMD(lowBalanceThreshold)} alert. Top up this tag soon.
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0 border-amber-300" onClick={() => setTopupOpen(true)}>
                        Top up
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => openTxFilter('money-in')}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
                    >
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Money in</p>
                      {periodLoading ? (
                        <div className="mt-2 h-7 w-24 bg-slate-100 animate-pulse rounded" />
                      ) : (
                        <>
                          <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{formatJMD(periodStats.totalTopUp, 2)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            added across {periodStats.topUpCount} top-up{periodStats.topUpCount === 1 ? '' : 's'}
                          </p>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openTxFilter('money-used')}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                    >
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Money used</p>
                      {periodLoading ? (
                        <div className="mt-2 h-7 w-24 bg-slate-100 animate-pulse rounded" />
                      ) : (
                        <>
                          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatJMD(periodStats.tagSpent, 2)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            at {periodStats.passageCount} plaza passage{periodStats.passageCount === 1 ? '' : 's'}
                          </p>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openTxFilter('money-back')}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors"
                    >
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Money back</p>
                      {periodLoading ? (
                        <div className="mt-2 h-7 w-24 bg-slate-100 animate-pulse rounded" />
                      ) : (
                        <>
                          <p className="mt-1 text-xl font-bold tabular-nums text-sky-700">{formatJMD(periodStats.totalRecovered, 2)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            recovered from trips · {formatJMD(periodStats.netLoss, 2)} absorbed
                          </p>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Reconciliation strip */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <p className="text-sm text-slate-700 flex-1">
                        We calculate <span className="font-semibold tabular-nums">{formatJMD(calculatedBalance, 2)}</span>.
                        {' '}What does the {tag.provider} app show?
                      </p>
                      {isEditingProviderBalance ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={providerBalanceInput}
                            onChange={(e) => setProviderBalanceInput(e.target.value)}
                            className="w-28 h-8 px-2 text-sm border border-slate-200 rounded bg-white"
                            autoFocus
                            placeholder="Amount"
                          />
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600" onClick={handleProviderBalanceSave} disabled={isSavingProviderBalance}><Check className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsEditingProviderBalance(false)}><XIcon className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={handleProviderBalanceEdit}>
                          {providerBalance === undefined ? 'Enter amount' : 'Update amount'}
                        </Button>
                      )}
                    </div>
                    {!isEditingProviderBalance && providerBalance !== undefined && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        {isBalanced && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Check className="h-2.5 w-2.5 mr-0.5" /> Matches
                          </Badge>
                        )}
                        {hasDiscrepancy && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            Off by {formatJMD(Math.abs(discrepancy!), 2)} — some transactions may be missing
                          </Badge>
                        )}
                        <span className="text-slate-400">
                          {providerAge == null ? 'Never checked' : providerAge === 0 ? 'Checked today' : `Checked ${providerAge} day${providerAge === 1 ? '' : 's'} ago`}
                          {' · '}app shows {formatJMD(providerBalance, 2)}
                          {hasDiscrepancy ? ` (${formatJMDDelta(discrepancy!, 2)})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <details
                    className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500"
                    open={showRepairTools}
                    onToggle={(e) => setShowRepairTools((e.target as HTMLDetailsElement).open)}
                  >
                    <summary className="cursor-pointer select-none font-medium text-slate-600">Repair tools</summary>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void fetchLedger({ syncBalance: true })}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Recalculate balance
                      </Button>
                      <span className="text-slate-400">Only needed if the balance looks stuck after an import.</span>
                    </div>
                  </details>
                </div>
              </div>
            </>
          )}

          {!tag.assignedVehicleId && (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="mb-4">Assign this tag to a vehicle to track balance and activity.</p>
                {onRequestAssign && (
                  <Button onClick={onRequestAssign}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign to vehicle
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>
                    {tag.assignedVehicleId
                      ? `Prepaid tag activity for ${tag.tagNumber}. Row click opens detail.`
                      : "This tag is not currently assigned to a vehicle."}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!tag.assignedVehicleId || filteredTx.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              </div>
              {tag.assignedVehicleId && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'money-in', label: 'Money in' },
                    { key: 'money-used', label: 'Money used' },
                    { key: 'money-back', label: 'Money back' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTxKindFilter(key)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        txKindFilter === key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  {plazaOptions.length > 0 && (
                    <select
                      value={plazaFilter}
                      onChange={(e) => setPlazaFilter(e.target.value)}
                      className="ml-auto h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
                    >
                      <option value="all">All plazas</option>
                      {plazaOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
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
                  dateFilteredTransactions={filteredTx}
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

      {tag.assignedVehicleId && (
        <LogTollTopupModal
          isOpen={topupOpen}
          onClose={() => setTopupOpen(false)}
          vehicleId={tag.assignedVehicleId}
          vehicleName={tag.assignedVehicleName || tag.tagNumber}
          tollTagId={tag.tagNumber}
          tollTagUuid={tag.id}
          onSuccess={() => {
            setTopupOpen(false);
            void fetchLedger({ syncBalance: true });
            setHistoryRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
