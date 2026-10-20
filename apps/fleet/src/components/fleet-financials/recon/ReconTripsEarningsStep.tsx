import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';
import { isCashSourceAckValid, type CloseBlocker } from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import {
  weekCloseApi,
  isWeekCloseUnavailable,
  type WeekCloseCashSourceMismatch,
} from '../../../services/weekCloseApi';
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

const TRIPS_EARNINGS_CODES = new Set([
  'CASH_SOURCE_MISMATCH',
  'EARNINGS_STATEMENT_MISSING',
  'EARNINGS_STATEMENT_UNVERIFIED',
  'EARNINGS_ENGINE_DRIFT',
  'EARNINGS_GROSS_IDENTITY',
  'CASH_COLLECTED_MISMATCH',
]);

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

export function ReconTripsEarningsStep({
  run,
  onNavigate,
  onRefresh,
}: {
  run: ReconRunPayload;
  onNavigate?: (page: string) => void;
  onRefresh?: () => void;
}) {
  const weekKey = run.run.weekKey;
  const line = run.run.serviceLine as 'rideshare' | 'rush_delivery';
  const [uberOpen, setUberOpen] = useState(false);
  const [cashAckTarget, setCashAckTarget] = useState<WeekCloseCashSourceMismatch | null>(null);
  const [cashAckReason, setCashAckReason] = useState('');
  const [cashAckBusy, setCashAckBusy] = useState(false);

  const previewQuery = useQuery({
    queryKey: ['recon-trips-earnings', weekKey, line],
    queryFn: () => weekCloseApi.preview(weekKey, line),
    staleTime: 30_000,
    retry: false,
  });

  const blockers = useMemo(() => {
    if (!previewQuery.data) return [];
    const all = [
      ...(previewQuery.data.blockers ?? []),
      ...(previewQuery.data.weekBlockers ?? []),
    ];
    return filterTripsBlockers(all);
  }, [previewQuery.data]);

  const openCashMismatches = useMemo(() => {
    const rows = previewQuery.data?.cashSourceMismatches || [];
    return rows.filter(
      (m) => !isCashSourceAckValid(m.ack, Number(m.mismatch) || 0),
    );
  }, [previewQuery.data]);

  const weekAlreadyClosed = !!previewQuery.data?.weekClosed;

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

  if (previewQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking trips &amp; earnings…
      </div>
    );
  }

  if (previewQuery.isError && isWeekCloseUnavailable(previewQuery.error)) {
    return (
      <p className="text-sm text-slate-500">
        Week-close preview is not available yet — re-upload Uber below or open Driver Settlements.
      </p>
    );
  }

  if (previewQuery.isError) {
    return <p className="text-sm text-rose-700">Could not load earnings blockers for this week.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Trip imports and earnings must tie before you close the week. Fix blockers here without leaving
        Week Reconciliation.
      </p>

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
                    <td className="px-3 py-2">{m.driverName || m.driverId.slice(0, 8)}</td>
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
          No trips or earnings blockers for this week in the close preview.
        </div>
      ) : blockers.length > 0 ? (
        <ul className="space-y-2">
          {blockers.map((b, i) => (
            <li
              key={`${b.code}-${i}`}
              className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">{humanBlockerLabel(b)}</p>
                {b.driverId ? (
                  <p className="text-xs text-amber-800/80">Driver {b.driverId.slice(0, 8)}…</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="default" size="sm" onClick={() => setUberOpen(true)}>
          Re-upload Uber week
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-slate-600"
          onClick={() => onNavigate?.('driver-settlements')}
        >
          Open in Driver Settlements
        </Button>
      </div>

      {uberOpen ? (
        <CloseWeekUberReimportDialog
          open={uberOpen}
          onOpenChange={setUberOpen}
          weekLabel={weekKey}
          weekKey={weekKey}
          onImported={async () => {
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
