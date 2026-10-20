import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import type { CloseBlocker } from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import { weekCloseApi, isWeekCloseUnavailable } from '../../../services/weekCloseApi';
import { humanBlockerLabel } from '../../../utils/weekCloseBlockers';
import { Button } from '../../ui/button';

const TRIPS_EARNINGS_CODES = new Set([
  'CASH_SOURCE_MISMATCH',
  'EARNINGS_STATEMENT_MISSING',
  'EARNINGS_STATEMENT_UNVERIFIED',
  'EARNINGS_ENGINE_DRIFT',
  'EARNINGS_GROSS_IDENTITY',
  'CASH_COLLECTED_MISMATCH',
]);

function filterTripsBlockers(blockers: CloseBlocker[]): CloseBlocker[] {
  return blockers.filter((b) => TRIPS_EARNINGS_CODES.has(String(b.code || '').toUpperCase()));
}

export function ReconTripsEarningsStep({
  run,
  onNavigate,
}: {
  run: ReconRunPayload;
  onNavigate?: (page: string) => void;
}) {
  const weekKey = run.run.weekKey;
  const line = run.run.serviceLine as 'rideshare' | 'rush_delivery';

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
        Week-close preview is not available yet — use Driver Settlements to review earnings.
      </p>
    );
  }

  if (previewQuery.isError) {
    return <p className="text-sm text-rose-700">Could not load earnings blockers for this week.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Trip imports and earnings must tie before you close the week. Fix blockers on Driver Settlements or
        run Close Week when everything is green.
      </p>

      {blockers.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          No trips or earnings blockers for this week in the close preview.
        </div>
      ) : (
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
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onNavigate?.('driver-settlements')}
        >
          Driver Settlements
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigate?.('close-week')}
        >
          Close Week
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
