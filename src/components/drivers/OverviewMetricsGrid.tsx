import { useIndriveWallet, type IndriveWalletDateRange } from '../../hooks/useIndriveWallet';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../services/api';
import {
  INDRIVE_WALLET_LOAD_CATEGORY,
  INDRIVE_WALLET_PLATFORM,
  INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
} from '../../constants/indriveWallet';
import type { FinancialTransaction } from '../../types/data';
import React, { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Navigation,
  Loader2,
  Fuel,
  Info,
  ChevronRight,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner@2.0.3';
import {
  Tooltip,
  PieChart as RawPieChart,
  Pie,
  Cell
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { cn } from '../ui/utils';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

// ── Shared constants (exported for use by DriverDetail.tsx) ──
export const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  Roam: '#6366f1',
  Private: '#f59e0b',
  Cash: '#84cc16',
  Other: '#64748b'
};

export const getPlatformColor = (platform: string) => PLATFORM_COLORS[platform] || PLATFORM_COLORS['Other'];

// ── PieChart wrapper removed — use RawPieChart directly with explicit keys ──

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── MetricCard (exported for use elsewhere in DriverDetail) ──
export function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon, breakdown, action, tooltip, loading, onClick, interactiveLabel }: any) {
   return (
      <Card
        className={cn(
          loading && "animate-pulse",
          onClick && "cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50 border-slate-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        )}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        aria-label={onClick ? interactiveLabel || title : undefined}
      >
         <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
               <div className="flex items-center gap-2">
                   <p className="text-sm font-medium text-slate-500">{title}</p>
                   {tooltip && (
                       <TooltipProvider>
                           <UiTooltip>
                               <TooltipTrigger>
                                   <Info className="h-3 w-3 text-slate-400" />
                               </TooltipTrigger>
                               <TooltipContent>
                                   <p className="max-w-[200px] text-xs">{tooltip}</p>
                               </TooltipContent>
                           </UiTooltip>
                       </TooltipProvider>
                   )}
               </div>
               {icon}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
               {loading ? (
                   <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div>
               ) : (
                   <h2 className="text-2xl font-bold">{value}</h2>
               )}
               {trend && !loading && (
                  <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {trend}
                  </span>
               )}
            </div>
            {(target || progress !== undefined) && (
               <div className="mt-3 space-y-1">
                  {target && <p className="text-xs text-slate-500">{target}</p>}
                  {progress !== undefined && (
                     <Progress value={loading ? 0 : progress} className="h-1.5" indicatorClassName={progressColor} />
                  )}
               </div>
            )}
            {subtext && !loading && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            {loading && !target && !progress && <div className="h-3 w-32 bg-slate-100 rounded mt-2"></div>}
            
            {breakdown && breakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {loading ? (
                        [1, 2].map(i => <div key={i} className="flex justify-between h-3 bg-slate-50 rounded"></div>)
                    ) : (
                        breakdown.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: item.color }}></span>
                                    {item.label}
                                </span>
                                <span className="font-medium text-slate-700">{item.value}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {action && !loading && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                    {action}
                </div>
            )}
         </CardContent>
      </Card>
   )
}

// ── Props ──
interface OverviewMetricsGridProps {
  resolvedFinancials: any;
  metrics: any;
  localLoading: boolean;
  isToday: boolean;
  driverId?: string;
  walletRange?: IndriveWalletDateRange | null;
  /** When false, driver-overview may omit platforms — InDrive wallet GET uses all InDrive rows for the same dates. */
  platformFilterAllPlatforms?: boolean;
  onWalletLoadSuccess?: () => void | Promise<void>;
}

// ── The Grid Component ──
export function OverviewMetricsGrid({
  resolvedFinancials,
  metrics,
  localLoading,
  isToday,
  driverId,
  walletRange,
  platformFilterAllPlatforms = true,
  onWalletLoadSuccess,
}: OverviewMetricsGridProps) {
  const { can } = usePermissions();
  const [periodEarningsOpen, setPeriodEarningsOpen] = useState(false);
  const [platformFeesExpanded, setPlatformFeesExpanded] = useState(false);
  const [logLoadOpen, setLogLoadOpen] = useState(false);
  const [loadAmount, setLoadAmount] = useState('');
  const [loadDate, setLoadDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loadNote, setLoadNote] = useState('');
  const [loadSubmitting, setLoadSubmitting] = useState(false);

  const rangeReady = !!(driverId && walletRange?.startDate && walletRange?.endDate);
  const { data: walletData, loading: walletLoading, error: walletError, refetch: refetchWallet } =
    useIndriveWallet(driverId, rangeReady ? walletRange : null);

  useEffect(() => {
    if (logLoadOpen) {
      setLoadAmount('');
      setLoadDate(format(new Date(), 'yyyy-MM-dd'));
      setLoadNote('');
    }
  }, [logLoadOpen]);

  // Platform breakdowns computed from resolvedFinancials (ledger-preferred)
  const earningsBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.earnings > 0 || stats.completed > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.earnings.toFixed(2)}`,
        color: getPlatformColor(label)
      })),
    [resolvedFinancials]
  );

  const cashBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.cashCollected > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.cashCollected.toFixed(2)}`,
        color: '#f43f5e'
      })),
    [resolvedFinancials]
  );

  const tollsBreakdown = useMemo(() =>
    Object.entries(resolvedFinancials.platformStats)
      .filter(([_, stats]: [string, any]) => stats.tolls > 0)
      .map(([label, stats]: [string, any]) => ({
        label,
        value: `$${stats.tolls.toFixed(2)}`,
        color: getPlatformColor(label)
      })),
    [resolvedFinancials]
  );

  const platformEarningsSum = useMemo(() => {
    if (!resolvedFinancials.platformStats) return 0;
    return Object.values(resolvedFinancials.platformStats).reduce(
      (s: number, p: any) => s + (p?.earnings || 0),
      0
    );
  }, [resolvedFinancials.platformStats]);

  const fareGrossMinusNet = useMemo(() => {
    const gross = Number(resolvedFinancials.totalBaseFare) || 0;
    const net = Number(resolvedFinancials.periodEarnings) || 0;
    return gross - net;
  }, [resolvedFinancials.totalBaseFare, resolvedFinancials.periodEarnings]);

  const cashByPlatformRows = useMemo(() => {
    return Object.entries(resolvedFinancials.platformStats || {})
      .filter(([, stats]: [string, any]) => (stats?.cashCollected || 0) > 0)
      .sort((a, b) => (b[1].cashCollected || 0) - (a[1].cashCollected || 0));
  }, [resolvedFinancials.platformStats]);

  const platformFeesLedgerRows = useMemo(() => {
    return Object.entries(resolvedFinancials.platformFeesByPlatform || {})
      .filter(([, v]) => (v || 0) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));
  }, [resolvedFinancials.platformFeesByPlatform]);

  const fareGapByPlatformRows = useMemo(() => {
    return Object.entries(resolvedFinancials.fareGrossMinusNetByPlatform || {})
      .filter(([, v]) => (v || 0) > 0.005)
      .sort((a, b) => (b[1] as number) - (a[1] as number));
  }, [resolvedFinancials.fareGrossMinusNetByPlatform]);

  /** Same rule as GET /ledger/driver-indrive-wallet `periodFees` (ledger platform_fee or fare gross−net for InDrive). */
  const inDriveFeesFromLedgerOverlay = useMemo(() => {
    const pf = resolvedFinancials.platformFeesByPlatform || {};
    const fg = resolvedFinancials.fareGrossMinusNetByPlatform || {};
    const ledgerFee = Number(pf.InDrive ?? 0) || 0;
    const gap = Number(fg.InDrive ?? 0) || 0;
    return ledgerFee > 0 ? ledgerFee : gap;
  }, [resolvedFinancials.platformFeesByPlatform, resolvedFinancials.fareGrossMinusNetByPlatform]);

  const walletAllZero =
    rangeReady &&
    !!walletData &&
    walletData.periodLoads === 0 &&
    walletData.periodFees === 0 &&
    (walletData.estimatedBalance ?? 0) === 0;

  const handleSubmitLogLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverId || !rangeReady) {
      toast.error('Driver and date range are required.');
      return;
    }
    const amt = parseFloat(loadAmount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }
    const desc = loadNote.trim();
    setLoadSubmitting(true);
    try {
      const payload: Partial<FinancialTransaction> & { platform?: string } = {
        id: crypto.randomUUID(),
        driverId,
        date: loadDate,
        amount: amt,
        category: INDRIVE_WALLET_LOAD_CATEGORY,
        platform: INDRIVE_WALLET_PLATFORM,
        type: INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
        description: desc || 'Fleet load — InDrive digital wallet',
        paymentMethod: 'Digital Wallet',
        status: 'Completed',
        isReconciled: true,
      };
      await api.saveTransaction(payload);
      toast.success('InDrive wallet load recorded');
      setLogLoadOpen(false);
      await refetchWallet();
      await onWalletLoadSuccess?.();
    } catch (err) {
      console.error('[OverviewMetricsGrid] Log load failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to save load';
      toast.error(msg);
    } finally {
      setLoadSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={periodEarningsOpen}
        onOpenChange={(open) => {
          setPeriodEarningsOpen(open);
          if (!open) setPlatformFeesExpanded(false);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {isToday ? "Today's earnings" : "Period earnings"} — breakdown
            </DialogTitle>
            <DialogDescription className="text-left text-sm text-slate-600 dark:text-slate-400">
              Ledger totals for the selected date range. The card headline is net fare on trip lines; platform rows include tips.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 text-sm">
            {resolvedFinancials.dataIncomplete ? (
              <p className="text-slate-600 dark:text-slate-400">
                Ledger data is incomplete for this period. Repair the ledger or widen filters to see a full breakdown.
              </p>
            ) : (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fare & tips</h3>
                  <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    {(resolvedFinancials.tripCount || 0) > 0 && (
                      <p className="text-[11px] text-slate-500">
                        Ledger trip lines: {resolvedFinancials.tripCount}
                      </p>
                    )}
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-600 dark:text-slate-400">Gross fare</span>
                      <span className="font-medium tabular-nums">${fmtMoney(resolvedFinancials.totalBaseFare || 0)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-600 dark:text-slate-400">Net fare</span>
                      <span className="font-semibold tabular-nums">${fmtMoney(resolvedFinancials.periodEarnings)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-slate-500">Implied on fare</span>
                      <span className="tabular-nums text-slate-600">${fmtMoney(fareGrossMinusNet)}</span>
                    </div>
                    {(resolvedFinancials.platformFees || 0) > 0 && (
                      <div className="text-xs">
                        <button
                          type="button"
                          onClick={() => setPlatformFeesExpanded((e) => !e)}
                          className="flex w-full items-center justify-between gap-3 rounded-md py-1.5 pl-1 pr-0 text-left transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                          aria-expanded={platformFeesExpanded}
                        >
                          <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200',
                                platformFeesExpanded && 'rotate-90'
                              )}
                              aria-hidden
                            />
                            Platform fee entries
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-600">
                            ${fmtMoney(resolvedFinancials.platformFees)}
                          </span>
                        </button>
                        {platformFeesExpanded && (
                          <div className="mt-2 space-y-3 border-l border-slate-200 pl-3 ml-1.5 dark:border-slate-600">
                            {platformFeesLedgerRows.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                  Ledger platform fees
                                </p>
                                {platformFeesLedgerRows.map(([label, amt]) => (
                                  <div
                                    key={label}
                                    className="flex justify-between gap-4 text-[11px]"
                                  >
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: getPlatformColor(label) }}
                                      />
                                      {label}
                                    </span>
                                    <span className="tabular-nums font-medium text-slate-700">
                                      ${fmtMoney(amt as number)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {fareGapByPlatformRows.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                  Gross − net by platform
                                </p>
                                {fareGapByPlatformRows.map(([label, amt]) => (
                                  <div
                                    key={`gap-${label}`}
                                    className="flex justify-between gap-4 text-[11px]"
                                  >
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: getPlatformColor(label) }}
                                      />
                                      {label}
                                    </span>
                                    <span className="tabular-nums font-medium text-slate-700">
                                      ${fmtMoney(amt as number)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {platformFeesLedgerRows.length === 0 &&
                              fareGapByPlatformRows.length === 0 && (
                                <p className="text-[11px] text-slate-500">
                                  No per-platform breakdown in the ledger for this period.
                                </p>
                              )}
                          </div>
                        )}
                      </div>
                    )}
                    <Separator className="bg-slate-200/80 dark:bg-slate-700" />
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-600 dark:text-slate-400">Tips</span>
                      <span className="font-medium tabular-nums">${fmtMoney(resolvedFinancials.totalTips || 0)}</span>
                    </div>
                    {(resolvedFinancials.disputeRefunds || 0) > 0 && (
                      <div className="flex justify-between gap-4 text-xs">
                        <span className="text-slate-500">Dispute recoveries</span>
                        <span className="tabular-nums text-emerald-700">${fmtMoney(resolvedFinancials.disputeRefunds)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <span className="text-slate-700 dark:text-slate-300">Net fare + tips</span>
                      <span className="font-semibold tabular-nums">
                        ${fmtMoney((resolvedFinancials.periodEarnings || 0) + (resolvedFinancials.totalTips || 0))}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-slate-500">
                      Sum of platform lines (below) includes tips: ${fmtMoney(platformEarningsSum)}.
                    </p>
                    {resolvedFinancials.source === 'ledger' && rangeReady && (
                      <div className="mt-3 rounded-md border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                          InDrive fees — period alignment
                        </p>
                        {walletLoading ? (
                          <p className="mt-1 text-[11px] text-slate-500">Loading InDrive wallet summary…</p>
                        ) : walletError ? (
                          <p className="mt-1 text-[11px] text-rose-600">{walletError}</p>
                        ) : walletData ? (
                          <>
                            <div className="mt-1 flex justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span>GET /ledger/driver-indrive-wallet (period)</span>
                              <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                                ${fmtMoney(walletData.periodFees)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span>Same rule from this breakdown</span>
                              <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                                ${fmtMoney(inDriveFeesFromLedgerOverlay)}
                              </span>
                            </div>
                            {!platformFilterAllPlatforms && (
                              <p className="mt-2 text-[10px] leading-snug text-slate-500">
                                Platform filter is not All — overview totals may omit InDrive; the InDrive wallet card always includes all InDrive ledger rows for these dates.
                              </p>
                            )}
                            {platformFilterAllPlatforms &&
                              Math.abs(walletData.periodFees - inDriveFeesFromLedgerOverlay) <= 0.02 && (
                                <p className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-500">
                                  Matches the InDrive wallet card (server fee rule: ledger fees or gross−net when fees are zero).
                                </p>
                              )}
                            {platformFilterAllPlatforms &&
                              Math.abs(walletData.periodFees - inDriveFeesFromLedgerOverlay) > 0.02 && (
                                <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-500">
                                  Values differ — check rounding or sync timing; see solution.md Phase 6.
                                </p>
                              )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash allocation</h3>
                  <div className="space-y-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-600 dark:text-slate-400">Total cash collected</span>
                      <span className="font-semibold tabular-nums">${fmtMoney(resolvedFinancials.cashCollected || 0)}</span>
                    </div>
                    <Separator className="my-1 bg-slate-100 dark:bg-slate-800" />
                    {cashByPlatformRows.map(([label, stats]: [string, any]) => (
                        <div key={label} className="flex justify-between gap-4 text-xs">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: getPlatformColor(label) }}
                            />
                            {label}
                          </span>
                          <span className="tabular-nums font-medium">${fmtMoney(stats.cashCollected)}</span>
                        </div>
                      ))}
                    {cashByPlatformRows.length === 0 && (resolvedFinancials.cashCollected || 0) > 0 && (
                        <p className="text-[11px] text-slate-500">Cash total is from the ledger; per-platform cash may be unallocated in older data.</p>
                      )}
                  </div>
                </section>

                <p className="text-[11px] leading-relaxed text-slate-500">
                  Financials → Earnings uses <span className="font-medium text-slate-600 dark:text-slate-400">gross fare</span> per week; this view matches the overview card (net fare) plus tips context.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logLoadOpen} onOpenChange={setLogLoadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log InDrive wallet load</DialogTitle>
            <DialogDescription>
              Record a fleet top-up to this driver&apos;s InDrive digital wallet. Amount must be positive.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitLogLoad} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="indrive-load-amount">Amount</Label>
              <Input
                id="indrive-load-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={loadAmount}
                onChange={(ev) => setLoadAmount(ev.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="indrive-load-date">Date</Label>
              <Input
                id="indrive-load-date"
                type="date"
                value={loadDate}
                onChange={(ev) => setLoadDate(ev.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="indrive-load-note">Note or reference (optional)</Label>
              <Input
                id="indrive-load-note"
                type="text"
                placeholder="e.g. bank ref, batch id"
                value={loadNote}
                onChange={(ev) => setLoadNote(ev.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLogLoadOpen(false)} disabled={loadSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={loadSubmitting}>
                {loadSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save load'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [&>:nth-child(1)]:order-1 [&>:nth-child(2)]:order-2 [&>:nth-child(3)]:order-3 [&>:nth-child(4)]:order-4 [&>:nth-child(5)]:order-5 [&>:nth-child(6)]:order-6 [&>:nth-child(7)]:hidden [&>:nth-child(8)]:order-7">
      {/* Card 1: Period Earnings — breakdown now from resolvedFinancials */}
      <MetricCard
        title={isToday ? "Today's Earnings" : "Period Earnings"}
        subtext={resolvedFinancials.source === 'ledger' ? 'Ledger' : resolvedFinancials.dataIncomplete ? `Ledger incomplete${resolvedFinancials.missingPlatforms?.length > 0 ? ` (missing: ${resolvedFinancials.missingPlatforms.join(', ')})` : ''}` : 'Unavailable'}
        value={resolvedFinancials.dataIncomplete ? '—' : `$${resolvedFinancials.periodEarnings.toFixed(2)}`}
        trend={resolvedFinancials.dataIncomplete ? undefined : `${resolvedFinancials.trendPercent}% vs prev`}
        trendUp={resolvedFinancials.trendUp}
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={resolvedFinancials.dataIncomplete ? [] : earningsBreakdown}
        onClick={() => setPeriodEarningsOpen(true)}
        interactiveLabel="Open period earnings breakdown and cash allocation"
      />

      {/* Card 2: Cash Collected */}
      <MetricCard
        title="Cash Collected"
        value={resolvedFinancials.dataIncomplete ? '—' : `$${resolvedFinancials.cashCollected.toFixed(2)}`}
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        tooltip="Total cash collected from trips during this period"
        loading={localLoading}
        breakdown={resolvedFinancials.dataIncomplete ? [] : cashBreakdown}
      />

      {/* Card 3: Km Driven (operational — stays on metrics) */}
      <MetricCard
        title="Km Driven for Period"
        value={`${metrics.totalDistance.toFixed(1)} km`}
        icon={<Navigation className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={Object.entries(metrics.platformStats)
          .filter(([_, stats]: [string, any]) => stats.distance > 0)
          .map(([label, stats]: [string, any]) => ({
            label,
            value: `${stats.distance.toFixed(1)} km`,
            color: getPlatformColor(label)
          }))}
      />

      <div className="flex flex-col gap-1.5">
        <MetricCard
          title="InDrive wallet"
          subtext={
            !rangeReady
              ? 'Pick a date range to see InDrive wallet totals.'
              : walletError
                ? walletError
                : walletAllZero
                  ? 'No InDrive fee lines, wallet loads in this period, or estimated balance — zeros below are expected.'
                  : 'Fees are platform charges for this range; the headline is fleet top-ups you log.'
          }
          tooltip="Headline: period loads (fleet top-ups in range). Breakdown: period fees, est. balance. Est. balance = lifetime loads minus lifetime InDrive fees (same ledger rule as period fees, all-time). Estimate only — not InDrive’s official balance. Not Roam cash or other platforms."
          value={
            !rangeReady || (rangeReady && walletError)
              ? '—'
              : `$${fmtMoney(walletData?.periodLoads ?? 0)}`
          }
          icon={<Wallet className="h-4 w-4 text-emerald-600" />}
          loading={rangeReady && walletLoading}
          breakdown={
            !rangeReady || walletError || !walletData
              ? []
              : [
                  { label: 'Period fees', value: `$${fmtMoney(walletData.periodFees)}`, color: '#94a3b8' },
                  {
                    label: 'Est. balance',
                    value: `$${fmtMoney(walletData.estimatedBalance ?? 0)}`,
                    color: '#6366f1',
                  },
                ]
          }
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!rangeReady || loadSubmitting || !can('transactions.edit')}
              title={!can('transactions.edit') ? 'Requires permission to edit transactions' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setLogLoadOpen(true);
              }}
            >
              Log load
            </Button>
          }
        />
        {rangeReady && !walletError && walletData && (
          <p className="px-1 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
            Est. balance is a fleet model only — not InDrive&apos;s official balance. Not Roam cash or Uber.
          </p>
        )}
      </div>

      {/* Card 4: Time Metrics Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Time Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px] w-full relative">
            {localLoading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <RawPieChart>
                <Pie
                  key="pie-time"
                  data={[
                    { name: 'Open Time', value: metrics.tripRatio.available, fill: '#1e3a8a' },
                    { name: 'Enroute Time', value: metrics.tripRatio.toTrip, fill: '#fbbf24' },
                    { name: 'On Trip Time', value: metrics.tripRatio.onTrip, fill: '#10b981' },
                    { name: 'Unavailable Time', value: metrics.tripRatio.unavailable, fill: '#94a3b8' }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={0}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                </Pie>
                <Tooltip key="tt-time" formatter={(value: number) => [value.toFixed(2) + ' hrs', 'Duration']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
              </RawPieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-2xl font-bold text-slate-900">{metrics.tripRatio.totalOnline.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Hours Online</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
            <TooltipProvider>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.available.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#1e3a8a]"></div>
                      <span className="text-xs font-medium text-slate-500">Open</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The amount of time the driver was online and available to accept new trip requests (waiting for a "ping").</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.toTrip.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
                      <span className="text-xs font-medium text-slate-500">Enroute</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time spent traveling to a pickup location after accepting a request.</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.onTrip.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                      <span className="text-xs font-medium text-slate-500">On Trip</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time spent with a passenger or delivery in the vehicle, from pickup to drop-off.</p>
                </TooltipContent>
              </UiTooltip>

              <UiTooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-help">
                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.unavailable.toFixed(2)} h</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#94a3b8]"></div>
                      <span className="text-xs font-medium text-slate-500">Unavail</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">The time the driver was logged into the system but marked as "Unavailable" (e.g., taking a break or paused).</p>
                </TooltipContent>
              </UiTooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Card 5: Toll Refunded — breakdown now from resolvedFinancials */}
      <MetricCard
        title="Toll Refunded"
        value={resolvedFinancials.dataIncomplete ? '—' : `$${resolvedFinancials.totalTolls.toFixed(2)}`}
        subtext="Added to Debt (Cash Risk)"
        icon={<DollarSign className="h-4 w-4 text-slate-500" />}
        loading={localLoading}
        breakdown={resolvedFinancials.dataIncomplete ? [] : tollsBreakdown}
      />

      {/* Card 6: Distance Metrics Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Distance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.distanceMetrics ? (
            <>
              <div className="h-[180px] w-full relative">
                {localLoading && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <RawPieChart>
                    <Pie
                      key="pie-dist"
                      data={[
                        { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                        { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                        { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                        { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                        { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' },
                        { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' },
                        { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {[
                        { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                        { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                        { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                        { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                        { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' },
                        { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' },
                        { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' }
                      ].filter(d => d.value > 0).map((d, i) => (
                        <Cell key={`di-${i}`} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip key="tt-dist" formatter={(value: number) => [value.toFixed(2) + ' km', 'Distance']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                  </RawPieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="text-2xl font-bold text-slate-900">{metrics.distanceMetrics.total.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total KM</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 px-2 text-center">
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.open.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#1e3a8a] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Open</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was online and waiting for a request.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.enroute.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Enroute</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was heading to the pickup location.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.onTrip.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">On Trip</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled during the actual trip (from pickup to destination).</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.unavailable.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Unavail</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled while the driver was in an unavailable or offline-equivalent state.</p>
                    </TooltipContent>
                  </UiTooltip>

                  {/* Cancellation stats */}
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.riderCancelled || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#f97316] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Rider Cx</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on trips cancelled by the rider.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.driverCancelled || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Driver Cx</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on trips cancelled by the driver.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.deliveryFailed || 0).toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#475569] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Failed</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Distance traveled on failed deliveries.</p>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
            </>
          ) : (
            <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
              <Navigation className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No distance breakdown</p>
              <p className="text-xs mt-1">Upload "Time & Distance" Report</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 7: Fuel Usage Split Donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Fuel Usage Split</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.fuelMetrics ? (
            <>
              <div className="h-[180px] w-full relative">
                {localLoading && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <RawPieChart>
                    <Pie
                      key="pie-fuel"
                      data={[
                        { name: 'Ride Share', value: metrics.fuelMetrics.rideShare, fill: '#10b981' },
                        { name: 'Company Ops', value: metrics.fuelMetrics.companyOps, fill: '#fbbf24' },
                        { name: 'Personal', value: metrics.fuelMetrics.personal, fill: '#ef4444' },
                        { name: 'Misc/Leakage', value: metrics.fuelMetrics.misc, fill: '#94a3b8' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                    </Pie>
                    <Tooltip key="tt-fuel" formatter={(value: number) => [value.toFixed(1) + ' L', 'Fuel']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                  </RawPieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="text-2xl font-bold text-slate-900">{metrics.fuelMetrics.total.toFixed(0)}</div>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total L</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.rideShare.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">RideShare</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed during revenue-generating trips.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.companyOps.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Com. Ops</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed for company operations.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.personal.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Personal</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Fuel consumed for personal use.</p>
                    </TooltipContent>
                  </UiTooltip>

                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center gap-1 cursor-help">
                        <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.misc.toFixed(2)}</span>
                        <div className="flex items-center gap-1.5 justify-center w-full">
                          <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                          <span className="text-xs font-medium text-slate-500 truncate">Leakage</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Unaccounted fuel consumption or leakage.</p>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
            </>
          ) : (
            <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
              <Fuel className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No fuel data</p>
              <p className="text-xs mt-1">Requires Time & Distance</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}