import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Filter, Loader2, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import type { IndriveWalletDateRange } from '../../hooks/useIndriveWallet';
import { useIndriveWallet } from '../../hooks/useIndriveWallet';
import { usePermissions } from '../../hooks/usePermissions';
import type { LedgerEntry } from '../../types/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { cn } from '../ui/utils';

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function entrySortTs(e: LedgerEntry): number {
  const t = e.time?.trim();
  if (t && /^\d{1,2}:\d{2}/.test(t)) {
    const parts = t.split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) || 0;
    const ss = parseInt(parts[2], 10) || 0;
    if (Number.isFinite(hh)) return hh * 3600 + mm * 60 + ss;
  }
  try {
    return parseISO(e.createdAt).getTime();
  } catch {
    return 0;
  }
}

function formatTimeLabel(e: LedgerEntry): string {
  const t = e.time?.trim();
  if (t && /^\d{1,2}:\d{2}/.test(t)) {
    const [h, m] = t.split(':');
    return `${h.padStart(2, '0')}:${(m || '00').slice(0, 2)}`;
  }
  try {
    return format(parseISO(e.createdAt), 'HH:mm');
  } catch {
    return '—';
  }
}

async function fetchIndriveWalletLedgerPage(
  driverId: string,
  startDate: string,
  endDate: string
): Promise<LedgerEntry[]> {
  const merged: LedgerEntry[] = [];
  let offset = 0;
  const limit = 250;
  const maxPages = 40;

  for (let p = 0; p < maxPages; p++) {
    const res = await api.getLedgerEntries({
      driverId,
      startDate,
      endDate,
      eventTypes: ['wallet_credit', 'platform_fee', 'fare_earning'],
      platform: 'InDrive',
      limit,
      offset,
      sortBy: 'date',
      sortDir: 'desc',
    });
    merged.push(...res.data);
    if (!res.hasMore || res.data.length === 0) break;
    offset += limit;
  }

  return merged;
}

export interface DriverIndriveWalletTabProps {
  driverId: string | undefined;
  range: IndriveWalletDateRange | null;
  /** Bumped from parent after ledger-affecting actions (e.g. log wallet load on Overview). */
  ledgerRefreshKey?: number;
  /** Called after a top-up is deleted so overview cards refetch. */
  onWalletLedgerMutated?: () => void;
}

type RowKind = 'top_up' | 'service_fee';

type ActivityKindFilter = 'all' | RowKind;

interface ActivityRow {
  id: string;
  kind: RowKind;
  title: string;
  subtitle: string;
  amount: number;
  /** Positive = credit to wallet model; negative = debit */
  signedAmount: number;
  currency: string;
  timeLabel: string;
  sortKey: number;
  dayKey: string;
  /** Underlying financial transaction id — only top-ups from `transaction:*` can be deleted */
  transactionId?: string;
}

const FEE_EPS = 0.005;

function normPlatform(p?: string) {
  return p === 'GoRide' ? 'Roam' : p;
}

/** Build activity rows from ledger lines; dedupe fee when both platform_fee and fare gap exist for the same trip. */
function buildActivityRows(entries: LedgerEntry[]): ActivityRow[] {
  const inDrive = entries.filter((e) => normPlatform(e.platform) === 'InDrive');
  const tripIdsWithPlatformFee = new Set(
    inDrive.filter((e) => e.eventType === 'platform_fee').map((e) => e.sourceId)
  );

  const rows: ActivityRow[] = [];

  for (const e of inDrive) {
    const dayKey = e.date?.split('T')[0] || '';
    if (!dayKey) continue;

    if (e.eventType === 'wallet_credit') {
      const signed = Math.abs(Number(e.netAmount) || Number(e.grossAmount) || 0);
      const transactionId =
        e.sourceType === 'transaction' && e.sourceId ? String(e.sourceId).trim() : undefined;
      rows.push({
        id: e.id,
        kind: 'top_up',
        title: 'Top up',
        subtitle: e.description || 'Fleet load — InDrive digital wallet',
        amount: signed,
        signedAmount: signed,
        currency: e.currency || 'JMD',
        timeLabel: formatTimeLabel(e),
        sortKey: entrySortTs(e),
        dayKey,
        transactionId: transactionId || undefined,
      });
      continue;
    }

    if (e.eventType === 'platform_fee') {
      const abs = Math.abs(Number(e.netAmount) || 0);
      rows.push({
        id: e.id,
        kind: 'service_fee',
        title: 'Service fee',
        subtitle: e.description || 'InDrive platform fee',
        amount: abs,
        signedAmount: -abs,
        currency: e.currency || 'JMD',
        timeLabel: formatTimeLabel(e),
        sortKey: entrySortTs(e),
        dayKey,
      });
      continue;
    }

    if (e.eventType === 'fare_earning') {
      const gross = Number(e.grossAmount) || 0;
      const net = Number(e.netAmount) || 0;
      const gap = gross - net;
      if (gap <= FEE_EPS) continue;
      if (tripIdsWithPlatformFee.has(e.sourceId)) continue;
      rows.push({
        id: `fare-fee:${e.id}`,
        kind: 'service_fee',
        title: 'Service fee',
        subtitle: e.description || 'InDrive fee (fare vs net income)',
        amount: gap,
        signedAmount: -gap,
        currency: e.currency || 'JMD',
        timeLabel: formatTimeLabel(e),
        sortKey: entrySortTs(e),
        dayKey,
      });
    }
  }

  return rows;
}

export function DriverIndriveWalletTab({
  driverId,
  range,
  ledgerRefreshKey = 0,
  onWalletLedgerMutated,
}: DriverIndriveWalletTabProps) {
  const { can } = usePermissions();
  const canView = can('transactions.view');
  const canDeleteTopUp = can('transactions.edit');

  const rangeReady = !!(driverId && range?.startDate && range?.endDate);
  const { data: walletData, loading: walletLoading, error: walletError, refetch: refetchWalletSummary } = useIndriveWallet(
    driverId,
    rangeReady ? range : null
  );

  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [topUpDeleteOpen, setTopUpDeleteOpen] = useState(false);
  const [topUpPending, setTopUpPending] = useState<{ transactionId: string; amountLabel: string } | null>(null);
  const [topUpDeleting, setTopUpDeleting] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityKindFilter>('all');

  const loadLedger = useCallback(async () => {
    if (!driverId || !range?.startDate || !range?.endDate) {
      setLedgerEntries([]);
      return;
    }
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const rows = await fetchIndriveWalletLedgerPage(driverId, range.startDate, range.endDate);
      setLedgerEntries(rows);
    } catch (err) {
      console.error('[DriverIndriveWalletTab] ledger fetch', err);
      setLedgerError(err instanceof Error ? err.message : 'Failed to load activity');
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  }, [driverId, range?.startDate, range?.endDate]);

  useEffect(() => {
    if (!canView || !rangeReady) {
      setLedgerEntries([]);
      return;
    }
    void loadLedger();
    void refetchWalletSummary();
  }, [canView, rangeReady, loadLedger, refetchWalletSummary, ledgerRefreshKey]);

  useEffect(() => {
    setActivityFilter('all');
  }, [driverId, range?.startDate, range?.endDate]);

  const activityCounts = useMemo(() => {
    const rows = buildActivityRows(ledgerEntries);
    let top_up = 0;
    let service_fee = 0;
    for (const r of rows) {
      if (r.kind === 'top_up') top_up++;
      else service_fee++;
    }
    return { top_up, service_fee, total: rows.length };
  }, [ledgerEntries]);

  const groupedDaysAll = useMemo(() => {
    const activityRows = buildActivityRows(ledgerEntries);
    const byDate = new Map<string, ActivityRow[]>();
    for (const r of activityRows) {
      const list = byDate.get(r.dayKey) ?? [];
      list.push(r);
      byDate.set(r.dayKey, list);
    }

    const sortedDays = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return sortedDays.map((day) => {
      const list = [...(byDate.get(day) ?? [])];
      list.sort((a, b) => b.sortKey - a.sortKey);
      return { day, label: format(parseISO(`${day}T12:00:00`), 'EEE, d MMM yyyy'), rows: list };
    });
  }, [ledgerEntries]);

  const filteredGroupedDays = useMemo(() => {
    if (activityFilter === 'all') return groupedDaysAll;
    return groupedDaysAll
      .map((section) => ({
        ...section,
        rows: section.rows.filter((r) => r.kind === activityFilter),
      }))
      .filter((section) => section.rows.length > 0);
  }, [groupedDaysAll, activityFilter]);

  const confirmDeleteTopUp = useCallback(async () => {
    if (!topUpPending?.transactionId) return;
    setTopUpDeleting(true);
    try {
      await api.deleteTransaction(topUpPending.transactionId);
      toast.success('Top up removed', {
        description: 'The wallet load transaction and its ledger line were deleted.',
      });
      setTopUpDeleteOpen(false);
      setTopUpPending(null);
      await refetchWalletSummary();
      await loadLedger();
      onWalletLedgerMutated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete top up');
    } finally {
      setTopUpDeleting(false);
    }
  }, [topUpPending, refetchWalletSummary, loadLedger, onWalletLedgerMutated]);

  if (!canView) {
    return (
      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">InDrive wallet</CardTitle>
          <CardDescription>You do not have permission to view financial transactions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!driverId) {
    return null;
  }

  const loading = walletLoading || ledgerLoading;
  const err = walletError || ledgerError;

  return (
    <div className="space-y-6">
      <AlertDialog
        open={topUpDeleteOpen}
        onOpenChange={(open) => {
          setTopUpDeleteOpen(open);
          if (!open) setTopUpPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this top up?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the fleet wallet load ({topUpPending?.amountLabel}) and updates InDrive wallet totals. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={topUpDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={topUpDeleting}
              onClick={() => void confirmDeleteTopUp()}
            >
              {topUpDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                  Deleting…
                </>
              ) : (
                'Delete top up'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">InDrive wallet</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Activity for the same date range as the driver header — fleet top-ups, InDrive service fees, and (when
          needed) fees implied from fare vs net on trip lines. Saving a trip refresh its ledger rows so edits apply
          here. Est. balance matches the overview card. Summary always reflects the full range; filters apply to the
          activity list only.
        </p>
      </div>

      <Card className="border-emerald-100/80 dark:border-emerald-900/40 bg-white dark:bg-slate-950 shadow-sm ring-1 ring-emerald-100/50 dark:ring-emerald-900/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">Summary</CardTitle>
          </div>
          {!rangeReady && (
            <CardDescription>Select a date range on the driver page to load wallet figures.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {loading && !walletData && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading summary…
            </div>
          )}
          {err && (
            <p className="text-sm text-rose-600 dark:text-rose-400 py-2">{err}</p>
          )}
          {walletData && rangeReady && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Period loads</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  ${fmtMoney(walletData.periodLoads)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Period fees</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  ${fmtMoney(walletData.periodFees)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Est. balance</p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  ${fmtMoney(walletData.estimatedBalance)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-4">
          <div>
            <CardTitle className="text-base font-semibold">Activity</CardTitle>
            <CardDescription>
              Grouped by day. Top ups are fleet-reported wallet credits. Service fees are{' '}
              <code className="text-xs">platform_fee</code> lines, or the fare gap on{' '}
              <code className="text-xs">fare_earning</code> when no separate fee line exists for that trip.
            </CardDescription>
          </div>
          {rangeReady && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>Show</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all' as const, label: 'All', count: activityCounts.total },
                    { id: 'top_up' as const, label: 'Top ups', count: activityCounts.top_up },
                    { id: 'service_fee' as const, label: 'Service fees', count: activityCounts.service_fee },
                  ] as const
                ).map(({ id, label, count }) => (
                  <Button
                    key={id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 rounded-full text-xs font-medium',
                      activityFilter === id
                        ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    )}
                    onClick={() => setActivityFilter(id)}
                    aria-pressed={activityFilter === id}
                  >
                    {label}
                    <span className="ml-1.5 tabular-nums opacity-70">({count})</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!rangeReady ? (
            <p className="text-sm text-slate-500 p-6">Pick a date range to see activity.</p>
          ) : loading && ledgerEntries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading activity…
            </div>
          ) : groupedDaysAll.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">No InDrive wallet credits or service fees in this period.</p>
          ) : filteredGroupedDays.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">Nothing matches this filter for the selected range.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredGroupedDays.map(({ day, label, rows }) => (
                <section key={day} className="bg-white dark:bg-slate-950">
                  <div className="sticky top-0 z-[1] bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 tracking-wide">{label}</p>
                  </div>
                  <ul className="divide-y divide-slate-50 dark:divide-slate-800/80">
                    {rows.map((row) => (
                      <li key={row.id} className="flex items-start gap-3 px-4 py-3.5">
                        <div
                          className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            row.kind === 'top_up'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                          )}
                        >
                          {row.kind === 'top_up' ? (
                            <ArrowDownLeft className="h-4 w-4" aria-hidden />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                {row.subtitle}
                              </p>
                            </div>
                            <div className="flex items-start gap-1 shrink-0">
                              <div className="text-right">
                                <p
                                  className={cn(
                                    'text-sm font-semibold tabular-nums',
                                    row.signedAmount >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  )}
                                >
                                  {row.signedAmount >= 0 ? '+' : '-'}${fmtMoney(row.amount)}{' '}
                                  <span className="text-[11px] font-normal text-slate-400">{row.currency}</span>
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{row.timeLabel}</p>
                              </div>
                              {row.kind === 'top_up' && row.transactionId && canDeleteTopUp && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                                  title="Delete top up"
                                  aria-label="Delete top up"
                                  onClick={() => {
                                    setTopUpPending({
                                      transactionId: row.transactionId!,
                                      amountLabel: `$${fmtMoney(row.amount)} ${row.currency}`,
                                    });
                                    setTopUpDeleteOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
