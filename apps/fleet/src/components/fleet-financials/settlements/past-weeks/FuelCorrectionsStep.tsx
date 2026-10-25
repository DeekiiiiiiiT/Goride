import { useState, type ReactNode } from 'react';
import { Button } from '../../../ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../ui/collapsible';
import {
  correctionHistoryNote,
  correctionLineReason,
  fuelSummaryRows,
  landingWeekBlock,
  owesPhrase,
  PAST_WEEKS_NOT_LIVE,
  plainCorrectionBlock,
  weekLabel,
} from '../../../../utils/pastWeeksCleanupCopy';

type Line = { sourceWeek: string; amount: number };

export function FuelCorrectionsStep({
  lines,
  oct12,
  driverName,
  matchesAudit,
  reason,
  landingWeek,
  busy,
  done,
  outlook,
  postsEnabled,
  onPost,
}: {
  lines: Line[];
  oct12: { sourceWeek: string; amount: number } | null;
  driverName: string;
  matchesAudit: boolean;
  reason: string;
  /** Missing when an older server has not reported the open week yet. */
  landingWeek: string | null | undefined;
  busy: boolean;
  done: boolean;
  outlook: ReactNode;
  postsEnabled: boolean;
  onPost: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = fuelSummaryRows(lines, oct12?.amount ?? null, driverName);
  const landingSpecified = landingWeek !== undefined;
  const landOn = landingSpecified ? String(landingWeek || '').slice(0, 10) : '';
  const landingBlock = !postsEnabled || !landingSpecified
    ? PAST_WEEKS_NOT_LIVE
    : landingWeekBlock(landOn);
  const checkBlock = !matchesAudit ? plainCorrectionBlock(reason, driverName) : '';
  const detail = [
    ...lines.map((line) => ({
      week: line.sourceWeek,
      reason: correctionLineReason(line.amount, driverName),
      phrase: owesPhrase(line.amount, driverName),
    })),
    ...(oct12
      ? [{
          week: oct12.sourceWeek,
          reason: 'Same issue',
          phrase: owesPhrase(oct12.amount, driverName),
        }]
      : []),
  ];
  if (done) {
    return <p className="text-sm text-slate-600">Corrections are already on the open week.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-slate-200">
        {summary.rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${row.emphasis ? 'bg-slate-50 font-semibold' : ''}`}
          >
            <span className="text-slate-700">{row.label}</span>
            <span className="shrink-0 text-right text-slate-900">{row.phrase}</span>
          </div>
        ))}
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger type="button" className="h-11 text-sm font-medium text-[#3525cd]">
          {open ? 'Hide weeks' : `See ${detail.length} weeks`}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {detail.map((row) => (
            <div key={row.week} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm sm:grid-cols-[6.5rem_1fr_auto]">
              <span className="font-medium text-slate-900">{weekLabel(row.week)}</span>
              <span className="text-slate-600">{row.reason}</span>
              <span className="col-span-2 text-slate-900 sm:col-span-1 sm:text-right">{row.phrase}</span>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      {postsEnabled && landingSpecified ? (
        <p className="text-sm text-slate-700">
          {landOn
            ? `Posted to the week of ${weekLabel(landOn)}.`
            : 'There is no open week to post these onto.'}
        </p>
      ) : null}
      <p className="text-sm text-slate-600">{correctionHistoryNote()}</p>
      {outlook}
      {landingBlock ? <p className="text-sm text-amber-900">{landingBlock}</p> : null}
      {checkBlock ? <p className="text-sm text-amber-900">{checkBlock}</p> : null}
      <Button
        type="button"
        className="h-11"
        disabled={busy || !postsEnabled || !matchesAudit || !landingSpecified || !landOn || Boolean(landingBlock)}
        onClick={onPost}
      >
        Post corrections
      </Button>
    </div>
  );
}
