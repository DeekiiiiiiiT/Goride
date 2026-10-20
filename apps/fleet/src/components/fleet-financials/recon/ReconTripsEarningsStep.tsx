import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  isCashSourceAckValid,
  TRIPS_EARNINGS_BLOCKER_CODES,
  type CloseBlocker,
} from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import { api } from '../../../services/api';
import {
  weekCloseApi,
  isWeekCloseUnavailable,
  WeekCloseApiError,
  type WeekCloseCashSourceMismatch,
} from '../../../services/weekCloseApi';
import {
  CLOSE_WEEK_SYNC_FIXABLE_CODES,
  forceResealHintsFromPreview,
} from '../../../utils/closeWeekAutoSync';
import { humanBlockerLabel } from '../../../utils/weekCloseBlockers';
import { CloseWeekUberReimportDialog } from '../CloseWeekUberReimportDialog';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { toast } from 'sonner';

function driverDisplayName(d: {
  id?: string;
  driverId?: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const named = String(d.name || d.fullName || '').trim();
  if (named) return named;
  return [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
}

const TRIPS_EARNINGS_CODES = new Set<string>(TRIPS_EARNINGS_BLOCKER_CODES);

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function filterTripsBlockers(blockers: CloseBlocker[]): CloseBlocker[] {
  return blockers.filter((b) => TRIPS_EARNINGS_CODES.has(String(b.code || '').toUpperCase()));
}

function blockerNeedsEarningsRefresh(code: string): boolean {
  const c = code.toUpperCase();
  return (
    c === 'EARNINGS_STATEMENT_MISSING' ||
    c === 'EARNINGS_STATEMENT_UNVERIFIED' ||
    c === 'EARNINGS_ENGINE_DRIFT'
  );
}

export function ReconTripsEarningsStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh?: () => void;
}) {
  const weekKey = run.run.weekKey;
  const line = run.run.serviceLine as 'rideshare' | 'rush_delivery';
  const [uberOpen, setUberOpen] = useState(false);
  const [cashAckTarget, setCashAckTarget] = useState<WeekCloseCashSourceMismatch | null>(null);
  const [cashAckReason, setCashAckReason] = useState('');
  const [cashAckBusy, setCashAckBusy] = useState(false);
  const [autoSealBusy, setAutoSealBusy] = useState(false);
  const [autoSealError, setAutoSealError] = useState<string | null>(null);
  const autoSealKeyRef = useRef<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['recon-trips-earnings', weekKey, line],
    queryFn: () => weekCloseApi.preview(weekKey, line),
    staleTime: 30_000,
    retry: false,
  });

  const driversQuery = useQuery({
    queryKey: ['drivers', 'recon-trips-earnings'],
    queryFn: () => api.getDrivers().catch(() => []),
    staleTime: 60_000,
  });

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    const raw = driversQuery.data;
    const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] } | null)?.data || [];
    for (const row of list) {
      const d = row as {
        id?: string;
        driverId?: string;
        name?: string;
        fullName?: string;
        firstName?: string;
        lastName?: string;
      };
      const id = String(d.id || d.driverId || '').trim();
      const name = driverDisplayName(d);
      if (id && name) map.set(id, name);
    }
    return map;
  }, [driversQuery.data]);

  const blockers = useMemo(() => {
    if (!previewQuery.data) return [];
    const all = [
      ...(previewQuery.data.blockers ?? []),
      ...(previewQuery.data.weekBlockers ?? []),
    ];
    return filterTripsBlockers(all);
  }, [previewQuery.data]);

  const labelForDriver = (driverId: string | undefined | null): string | null => {
    const id = String(driverId || '').trim();
    if (!id) return null;
    return driverNameById.get(id) || `Driver ${id.slice(0, 8)}…`;
  };

  const openCashMismatches = useMemo(() => {
    const rows = previewQuery.data?.cashSourceMismatches || [];
    return rows.filter(
      (m) => !isCashSourceAckValid(m.ack, Number(m.mismatch) || 0),
    );
  }, [previewQuery.data]);

  const weekAlreadyClosed = !!previewQuery.data?.weekClosed;

  const needsEarningsSeal = useMemo(
    () =>
      blockers.some((b) => blockerNeedsEarningsRefresh(String(b.code || ''))) ||
      blockers.some((b) => CLOSE_WEEK_SYNC_FIXABLE_CODES.has(String(b.code || '').toUpperCase())),
    [blockers],
  );

  // Seal earnings from data already uploaded — no manual Refresh.
  useEffect(() => {
    if (!previewQuery.data || weekAlreadyClosed || !needsEarningsSeal || autoSealBusy) return;
    const key = `${weekKey}:${line}:${blockers.map((b) => b.code).sort().join(',')}`;
    if (autoSealKeyRef.current === key) return;
    autoSealKeyRef.current = key;

    let cancelled = false;
    setAutoSealBusy(true);
    setAutoSealError(null);
    void (async () => {
      try {
        const hints = forceResealHintsFromPreview(previewQuery.data || {});
        hints.forceEarningsReseal = true;
        await weekCloseApi.sync(weekKey, { ...hints, serviceLine: line });
        if (cancelled) return;
        await previewQuery.refetch();
        onRefresh?.();
      } catch (e) {
        if (cancelled) return;
        // Keep key so we don't infinite-loop; Re-upload clears the key.
        if (isWeekCloseUnavailable(e)) {
          setAutoSealError('Earnings seal is not available on this environment yet.');
        } else if (e instanceof WeekCloseApiError) {
          setAutoSealError(e.message);
        } else {
          setAutoSealError(e instanceof Error ? e.message : 'Could not seal earnings');
        }
      } finally {
        if (!cancelled) setAutoSealBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally keyed off preview + needsSeal; busy/ref guard double-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-seal once per blocker set
  }, [previewQuery.data, needsEarningsSeal, weekAlreadyClosed, weekKey, line]);

  const doAcknowledgeCashSource = async () => {
    if (!cashAckTarget) return;
    const reason = cashAckReason.trim();
    if (reason.length < 8) return;
    setCashAckBusy(true);
    try {
      await weekCloseApi.acknowledgeCashSource(weekKey, cashAckTarget.driverId, reason);
      setCashAckTarget(null);
      setCashAckReason('');
      await previewQuery.refetch();
      onRefresh?.();
    } finally {
      setCashAckBusy(false);
    }
  };

  if (previewQuery.isLoading || autoSealBusy) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {autoSealBusy
          ? 'Sealing earnings from uploaded trips…'
          : 'Checking trips & earnings…'}
      </div>
    );
  }

  if (previewQuery.isError && isWeekCloseUnavailable(previewQuery.error)) {
    return (
      <p className="text-sm text-slate-500">
        Week-close preview is not available yet — open Settlement preview after fuel and tolls.
      </p>
    );
  }

  if (previewQuery.isError) {
    return <p className="text-sm text-rose-700">Could not load earnings blockers for this week.</p>;
  }

  return (
    <div className="space-y-4">
      {autoSealError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">
          {autoSealError}
        </div>
      ) : null}

      {openCashMismatches.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Statement cash mismatches</p>
          <div className="overflow-x-auto rounded-md border border-rose-200 bg-white">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="bg-rose-100/80 text-rose-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Statement</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Trip sum</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Difference</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {openCashMismatches.map((m) => (
                  <tr key={m.driverId} className="border-t border-rose-100 text-slate-800">
                    <td className="px-3 py-2">
                      {m.driverName || labelForDriver(m.driverId) || m.driverId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{MONEY(m.uberCash)}</td>
                    <td className="px-3 py-2 tabular-nums">{MONEY(m.uberTripCash)}</td>
                    <td className="px-3 py-2 tabular-nums">{MONEY(m.mismatch)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-indigo-700 hover:bg-indigo-800"
                        disabled={weekAlreadyClosed}
                        onClick={() => {
                          setCashAckReason('');
                          setCashAckTarget(m);
                        }}
                      >
                        Accept statement cash
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {blockers.length === 0 && openCashMismatches.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          Earnings sealed from uploaded trips — continue when ready.
        </div>
      ) : blockers.length > 0 ? (
        <ul className="space-y-2">
          {blockers.map((b, i) => {
            const code = String(b.code || '').toUpperCase();
            const earningsThis = blockerNeedsEarningsRefresh(code);
            return (
              <li
                key={`${b.code}-${i}`}
                className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{humanBlockerLabel(b)}</p>
                  {b.driverId ? (
                    <p className="text-xs text-amber-800/80">{labelForDriver(b.driverId)}</p>
                  ) : null}
                  {earningsThis ? (
                    <p className="text-xs text-amber-900/70">
                      Still blocked after auto-seal — re-upload the Uber week only if the file looks
                      wrong.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setUberOpen(true)}
        >
          Re-upload Uber week
        </Button>
      </div>

      {uberOpen ? (
        <CloseWeekUberReimportDialog
          open={uberOpen}
          onOpenChange={setUberOpen}
          weekLabel={weekKey}
          weekKey={weekKey}
          onImported={async () => {
            autoSealKeyRef.current = null;
            await previewQuery.refetch();
            onRefresh?.();
          }}
        />
      ) : null}

      <Dialog
        open={!!cashAckTarget}
        onOpenChange={(open) => {
          if (cashAckBusy) return;
          if (!open) {
            setCashAckTarget(null);
            setCashAckReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept statement cash?</DialogTitle>
            <DialogDescription>
              Week of {weekKey}
              {cashAckTarget?.driverName ? ` · ${cashAckTarget.driverName}` : ''}. Settlement already
              uses statement cash ({MONEY(cashAckTarget?.uberCash)}); trip sum is{' '}
              {MONEY(cashAckTarget?.uberTripCash)} (difference {MONEY(cashAckTarget?.mismatch)}).
              This clears the close block without changing collected cash.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cashAckReason}
            onChange={(e) => setCashAckReason(e.target.value)}
            placeholder="Why statement cash is correct (required)…"
            rows={3}
            className="text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={cashAckBusy}
              onClick={() => {
                setCashAckTarget(null);
                setCashAckReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={cashAckBusy || cashAckReason.trim().length < 8 || weekAlreadyClosed}
              onClick={() => void doAcknowledgeCashSource()}
            >
              {cashAckBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {weekAlreadyClosed ? 'Re-open week first' : cashAckBusy ? 'Saving…' : 'Accept statement cash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
