/**
 * Business Finance → InDrive Wallet Center
 * Multi-driver top-ups, period fees/balances, recent loads. Wallet funding only — not passenger cash.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { Loader2, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { buildIndriveWalletLoadTransaction } from '../../utils/indriveWalletLoad';
import { usePermissions } from '../../hooks/usePermissions';
import type { IndriveWalletSummary, LedgerEntry } from '../../types/data';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

const MONEY = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function driverIdOf(d: any): string {
  return String(d?.id || d?.roamId || '').trim();
}

function driverNameOf(d: any): string {
  return String(d?.name || d?.fullName || d?.driverName || 'Unknown').trim();
}

function defaultWeekRange(): { from: string; to: string } {
  const now = new Date();
  const from = startOfWeek(now, { weekStartsOn: 1 });
  const to = endOfWeek(now, { weekStartsOn: 1 });
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
}

type DriverWalletRow = {
  driverId: string;
  name: string;
  summary: IndriveWalletSummary | null;
  error?: string;
};

type RecentTopUp = {
  id: string;
  dayKey: string;
  driverId: string;
  driverName: string;
  amount: number;
  description: string;
  transactionId?: string;
};

async function fetchWalletCreditsPage(
  driverIds: string[],
  startDate: string,
  endDate: string,
): Promise<LedgerEntry[]> {
  const merged: LedgerEntry[] = [];
  let offset = 0;
  const limit = 250;
  const maxPages = 20;
  for (let p = 0; p < maxPages; p++) {
    const res = await api.getLedgerEntries({
      driverIds,
      startDate,
      endDate,
      eventTypes: ['wallet_credit'],
      platform: 'InDrive',
      limit,
      offset,
      sortBy: 'date',
      sortDir: 'desc',
    });
    merged.push(...(res.data || []));
    if (!res.hasMore || !res.data?.length) break;
    offset += limit;
  }
  return merged;
}

export function IndriveWalletCenterPage({
  initialDateFrom,
  initialDateTo,
  onBackToBusinessFinance,
  onPeriodHintConsumed,
}: {
  initialDateFrom?: string;
  initialDateTo?: string;
  onBackToBusinessFinance?: () => void;
  onPeriodHintConsumed?: () => void;
} = {}) {
  const { can } = usePermissions();
  const canEdit = can('transactions.edit');
  const queryClient = useQueryClient();

  const week0 = useMemo(() => defaultWeekRange(), []);
  const [dateFrom, setDateFrom] = useState(initialDateFrom || week0.from);
  const [dateTo, setDateTo] = useState(initialDateTo || week0.to);

  useEffect(() => {
    if (!initialDateFrom && !initialDateTo) return;
    if (initialDateFrom) setDateFrom(initialDateFrom);
    if (initialDateTo) setDateTo(initialDateTo);
    onPeriodHintConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDateFrom, initialDateTo]);

  const [loadDriverId, setLoadDriverId] = useState('');
  const [loadAmount, setLoadAmount] = useState('');
  const [loadDate, setLoadDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loadNote, setLoadNote] = useState('');
  const [loadSubmitting, setLoadSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState<{
    transactionId: string;
    amountLabel: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rangeReady = !!(dateFrom && dateTo && dateFrom <= dateTo);

  const driversQuery = useQuery({
    queryKey: ['drivers', 'indrive-wallet-center'],
    queryFn: () => api.getDrivers(),
  });

  const driverList = useMemo(() => {
    const raw = driversQuery.data;
    const list = Array.isArray(raw) ? raw : (raw as any)?.data || [];
    return [...list].sort((a: any, b: any) =>
      driverNameOf(a).localeCompare(driverNameOf(b), undefined, { sensitivity: 'base' }),
    );
  }, [driversQuery.data]);

  const driverIds = useMemo(
    () => driverList.map(driverIdOf).filter(Boolean),
    [driverList],
  );

  const driverNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of driverList) {
      const id = driverIdOf(d);
      if (id) map[id] = driverNameOf(d);
    }
    return map;
  }, [driverList]);

  const summariesQuery = useQuery({
    queryKey: ['indrive-wallet-center', 'summaries', dateFrom, dateTo, driverIds.join(',')],
    enabled: rangeReady && driverIds.length > 0,
    queryFn: async (): Promise<DriverWalletRow[]> => {
      const settled = await Promise.allSettled(
        driverIds.map((id) =>
          api.getDriverIndriveWallet({ driverId: id, startDate: dateFrom, endDate: dateTo }),
        ),
      );
      return driverIds.map((id, i) => {
        const r = settled[i];
        if (r.status === 'fulfilled') {
          return { driverId: id, name: driverNameById[id] || id, summary: r.value };
        }
        return {
          driverId: id,
          name: driverNameById[id] || id,
          summary: null,
          error: r.reason instanceof Error ? r.reason.message : 'Failed to load',
        };
      });
    },
  });

  const recentQuery = useQuery({
    queryKey: ['indrive-wallet-center', 'recent', dateFrom, dateTo, driverIds.join(',')],
    enabled: rangeReady && driverIds.length > 0,
    queryFn: async (): Promise<RecentTopUp[]> => {
      const entries = await fetchWalletCreditsPage(driverIds, dateFrom, dateTo);
      const rows: RecentTopUp[] = [];
      for (const e of entries) {
        if (e.eventType !== 'wallet_credit') continue;
        const dayKey = (e.date || '').split('T')[0];
        if (!dayKey) continue;
        const did = String(e.driverId || '').trim();
        const amount = Math.abs(Number(e.netAmount) || Number(e.grossAmount) || 0);
        const transactionId =
          e.sourceType === 'transaction' && e.sourceId ? String(e.sourceId).trim() : undefined;
        rows.push({
          id: e.id,
          dayKey,
          driverId: did,
          driverName: driverNameById[did] || did || '—',
          amount,
          description: e.description || 'Fleet load — InDrive digital wallet',
          transactionId: transactionId || undefined,
        });
      }
      rows.sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.id.localeCompare(a.id));
      return rows;
    },
  });

  const sortedRows = useMemo(() => {
    const rows = summariesQuery.data || [];
    return [...rows].sort((a, b) => {
      const balA = a.summary?.estimatedBalance ?? 0;
      const balB = b.summary?.estimatedBalance ?? 0;
      const shortA = balA < -0.005 ? 0 : 1;
      const shortB = balB < -0.005 ? 0 : 1;
      if (shortA !== shortB) return shortA - shortB;
      if (shortA === 0 && Math.abs(balA - balB) > 0.005) return balA - balB;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [summariesQuery.data]);

  const fleetTotals = useMemo(() => {
    let topUps = 0;
    let fees = 0;
    let shortCount = 0;
    for (const r of summariesQuery.data || []) {
      if (!r.summary) continue;
      topUps += r.summary.periodLoads || 0;
      fees += r.summary.periodFees || 0;
      if ((r.summary.estimatedBalance || 0) < -0.005) shortCount++;
    }
    return {
      topUps: Math.round(topUps * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      shortCount,
    };
  }, [summariesQuery.data]);

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['indrive-wallet-center'] }),
      queryClient.invalidateQueries({ queryKey: ['drivers', 'indrive-wallet-center'] }),
      // Keep list/tx views and any ledger caches in sync after load/delete.
      queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
  }, [queryClient]);

  const handleRefresh = () => {
    void summariesQuery.refetch();
    void recentQuery.refetch();
  };

  const handleQuickLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error('You do not have permission to record wallet loads.');
      return;
    }
    if (!loadDriverId) {
      toast.error('Select a driver.');
      return;
    }
    const amt = parseFloat(loadAmount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }
    if (!loadDate) {
      toast.error('Pick a date.');
      return;
    }
    setLoadSubmitting(true);
    try {
      await api.saveTransaction(
        buildIndriveWalletLoadTransaction({
          driverId: loadDriverId,
          amount: amt,
          date: loadDate,
          description: loadNote.trim(),
        }),
      );
      toast.success('InDrive wallet load recorded');
      setLoadAmount('');
      setLoadNote('');
      await invalidateAll();
      await Promise.all([summariesQuery.refetch(), recentQuery.refetch()]);
    } catch (err) {
      console.error('[IndriveWalletCenter] load failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save load');
    } finally {
      setLoadSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletePending?.transactionId) return;
    setDeleting(true);
    try {
      await api.deleteTransaction(deletePending.transactionId);
      toast.success('Top up removed');
      setDeleteOpen(false);
      setDeletePending(null);
      await invalidateAll();
      await Promise.all([summariesQuery.refetch(), recentQuery.refetch()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete top up');
    } finally {
      setDeleting(false);
    }
  };

  const loadingDrivers = driversQuery.isLoading;
  const loadingSummaries = summariesQuery.isFetching;
  const loadingRecent = recentQuery.isFetching;

  return (
    <div className="space-y-6">
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletePending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this top up?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the fleet wallet load ({deletePending?.amountLabel}) and updates InDrive wallet
              totals. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? (
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

      {onBackToBusinessFinance && (
        <BusinessFinanceDeskChrome deskLabel="InDrive Wallet" onBack={onBackToBusinessFinance} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">InDrive Wallet</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Fleet top-ups for driver InDrive apps — who needs funding and what you loaded. Passenger cash
            collection stays on Cash Wallet; this page is wallet funding only.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={!rangeReady || loadingSummaries || loadingRecent}
        >
          {(loadingSummaries || loadingRecent) ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="iw-from" className="text-xs text-slate-500">
            From
          </Label>
          <Input
            id="iw-from"
            type="date"
            className="w-[160px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="iw-to" className="text-xs text-slate-500">
            To
          </Label>
          <Input
            id="iw-to"
            type="date"
            className="w-[160px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => {
            const w = defaultWeekRange();
            setDateFrom(w.from);
            setDateTo(w.to);
          }}
        >
          This week
        </Button>
      </div>

      {/* Quick load */}
      <Card className="border-emerald-100/80 dark:border-emerald-900/40 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Quick load
            </CardTitle>
          </div>
          <CardDescription>Select a driver and record money loaded onto their InDrive app.</CardDescription>
        </CardHeader>
        <CardContent>
          {!canEdit ? (
            <p className="text-sm text-slate-500">You do not have permission to record wallet loads.</p>
          ) : (
            <form
              onSubmit={(e) => void handleQuickLoad(e)}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
            >
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-xs text-slate-500">Driver</Label>
                <Select value={loadDriverId || undefined} onValueChange={setLoadDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDrivers ? 'Loading…' : 'Select driver'} />
                  </SelectTrigger>
                  <SelectContent>
                    {driverList.map((d: any) => {
                      const id = driverIdOf(d);
                      if (!id) return null;
                      return (
                        <SelectItem key={id} value={id}>
                          {driverNameOf(d)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="iw-amt" className="text-xs text-slate-500">
                  Amount
                </Label>
                <Input
                  id="iw-amt"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={loadAmount}
                  onChange={(e) => setLoadAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="iw-date" className="text-xs text-slate-500">
                  Date
                </Label>
                <Input
                  id="iw-date"
                  type="date"
                  value={loadDate}
                  onChange={(e) => setLoadDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="iw-note" className="text-xs text-slate-500">
                  Note (optional)
                </Label>
                <Input
                  id="iw-note"
                  value={loadNote}
                  onChange={(e) => setLoadNote(e.target.value)}
                  placeholder="e.g. batch ref"
                />
              </div>
              <Button type="submit" disabled={loadSubmitting || loadingDrivers}>
                {loadSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  'Save load'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Fleet totals */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Period summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!rangeReady ? (
            <p className="text-sm text-slate-500">Pick a valid date range.</p>
          ) : loadingDrivers || (loadingSummaries && !summariesQuery.data) ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading summaries…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Period top ups</p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  ${MONEY(fleetTotals.topUps)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Period fees</p>
                <p className="text-lg font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                  −${MONEY(fleetTotals.fees)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Drivers short</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {fleetTotals.shortCount}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Who's short */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Who’s short</CardTitle>
          <CardDescription>
            Est. balance is lifetime top-ups minus lifetime InDrive fees (fleet estimate). Negative = needs funding.
            Sorted short first.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDrivers || (loadingSummaries && !summariesQuery.data) ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading drivers…
            </div>
          ) : sortedRows.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">No drivers found.</p>
          ) : (
            <div className="border-t overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900/40">
                    <TableHead className="text-xs">Driver</TableHead>
                    <TableHead className="text-xs text-right">Period top ups</TableHead>
                    <TableHead className="text-xs text-right">Period fees</TableHead>
                    <TableHead className="text-xs text-right">Est. balance</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => {
                    const s = row.summary;
                    const short = (s?.estimatedBalance ?? 0) < -0.005;
                    return (
                      <TableRow
                        key={row.driverId}
                        className={short ? 'bg-rose-50/40 dark:bg-rose-950/20' : undefined}
                      >
                        <TableCell className="text-sm font-medium">{row.name}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {row.error ? (
                            <span className="text-rose-600 text-xs">Error</span>
                          ) : (
                            `$${MONEY(s?.periodLoads ?? 0)}`
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-rose-700 dark:text-rose-400">
                          {row.error ? '—' : `−$${MONEY(s?.periodFees ?? 0)}`}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-slate-900 dark:text-slate-100">
                          {row.error ? '—' : `$${MONEY(s?.estimatedBalance ?? 0)}`}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!canEdit}
                            onClick={() => {
                              setLoadDriverId(row.driverId);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Log top-up
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent top-ups */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Recent top-ups</CardTitle>
          <CardDescription>Wallet credits in the selected date range across all drivers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingRecent && !recentQuery.data ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading top-ups…
            </div>
          ) : !(recentQuery.data?.length) ? (
            <p className="text-sm text-slate-500 p-6">No top-ups in this range.</p>
          ) : (
            <div className="border-t overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900/40">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Driver</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Note</TableHead>
                    <TableHead className="text-xs text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentQuery.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(`${r.dayKey}T12:00:00`), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{r.driverName}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        +${MONEY(r.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[240px] truncate">
                        {r.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && r.transactionId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                            onClick={() => {
                              setDeletePending({
                                transactionId: r.transactionId!,
                                amountLabel: `$${MONEY(r.amount)}`,
                              });
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
