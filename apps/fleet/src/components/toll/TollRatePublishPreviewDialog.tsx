/**
 * The last screen before a rate card goes live.
 *
 * Publishing re-prices every unsettled toll from the effective date forward and
 * can re-flag reconciliations as drift. This states that in money before the
 * button is pressed, and shows exactly which prices are moving.
 */
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import type { RateImpactPreview } from '../../utils/tollRateImpact';
import type { RateVersionDiff } from '../../utils/tollRateVersionDiff';
import { formatJMD, formatJMDDelta } from '../../utils/formatJMD';
import { isoToDisplayDate } from '../../utils/officialTollRate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  effectiveFrom: string;
  diff: RateVersionDiff | null;
  impact: RateImpactPreview | null;
  loading: boolean;
  error: string | null;
  publishing: boolean;
  onConfirm: () => void;
}

export function TollRatePublishPreviewDialog({
  open,
  onOpenChange,
  effectiveFrom,
  diff,
  impact,
  loading,
  error,
  publishing,
  onConfirm,
}: Props) {
  const priceChanges = diff?.rows.length ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Publish rates from {isoToDisplayDate(effectiveFrom)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Published cards are permanent. Tolls before this date keep their existing rates.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <p className="font-medium">
              {priceChanges === 0
                ? 'No plaza prices change.'
                : `${priceChanges} price${priceChanges === 1 ? '' : 's'} change on this card.`}
            </p>
            {diff && (diff.plazasAdded.length > 0 || diff.plazasRemoved.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {diff.plazasAdded.map(p => (
                  <Badge key={`a-${p}`} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-none text-xs">
                    Adds {p}
                  </Badge>
                ))}
                {diff.plazasRemoved.map(p => (
                  <Badge key={`r-${p}`} className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-none text-xs">
                    Drops {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {loading && (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Working out what this changes…
            </p>
          )}

          {error && (
            <p className="text-amber-600">
              Could not measure the impact ({error}). You can still publish, but the effect on open tolls is unknown.
            </p>
          )}

          {impact && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <p>
                {impact.repriced === 0 ? (
                  <>No open toll changes price.</>
                ) : (
                  <>
                    Changes expected cost on <strong>{impact.repriced}</strong> open toll
                    {impact.repriced === 1 ? '' : 's'} by{' '}
                    <strong className={impact.totalDelta >= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {formatJMDDelta(impact.totalDelta)}
                    </strong>
                    .
                  </>
                )}
              </p>
              {impact.newlyDrifting > 0 && (
                <p>Re-flags <strong>{impact.newlyDrifting}</strong> reconciliation{impact.newlyDrifting === 1 ? '' : 's'} as rate drift.</p>
              )}
              {impact.driftResolved > 0 && (
                <p>Clears drift on <strong>{impact.driftResolved}</strong> reconciliation{impact.driftResolved === 1 ? '' : 's'}.</p>
              )}
              {impact.newlyPriced > 0 && (
                <p>Gives an official price to <strong>{impact.newlyPriced}</strong> toll{impact.newlyPriced === 1 ? '' : 's'} that had none.</p>
              )}
              {impact.frozen > 0 && (
                <p className="text-slate-500">
                  {impact.frozen} already-settled toll{impact.frozen === 1 ? '' : 's'} keep their locked price and are unaffected.
                </p>
              )}

              {impact.byPlaza.length > 0 && (
                <ul className="pt-1 space-y-1">
                  {impact.byPlaza.slice(0, 6).map(line => (
                    <li key={line.plazaName} className="flex items-center justify-between gap-3">
                      <span className="truncate text-slate-600 dark:text-slate-400">
                        {line.plazaName} · {line.count} toll{line.count === 1 ? '' : 's'}
                      </span>
                      <span className={`flex items-center gap-1 ${line.delta >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {line.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {formatJMD(Math.abs(line.delta))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={publishing}>Back to editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={publishing || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {publishing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Publish rates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
