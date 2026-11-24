import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import type { TollV2Charge, TollV2DisputeResult, TollV2WeekResult } from './types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { fmtTollMinor } from './tollV2Format';
import { TollV2SecondaryButton } from './TollV2Buttons';

function driverDisplayName(
  driverId: string,
  driverName: string | undefined,
  charges: TollV2Charge[],
): string {
  const fromRow = driverName?.trim();
  if (fromRow) return fromRow;
  const fromCharge = charges.find((c) => c.driverId === driverId && c.driverName?.trim())?.driverName?.trim();
  if (fromCharge) return fromCharge;
  return 'Driver';
}

/** Step 4's roll-forward (anchored on the last closed week), shown in the Tag account box. */
export type TagAccountBoxRoll = {
  openingMinor: number;
  topUpsMinor: number;
  usageMinor: number;
  closingMinor: number;
};

export function TollV2SummaryPortal({
  target,
  result,
  charges,
  onGoToTagAccount,
  roll,
  results,
  weekKey,
}: {
  target: HTMLElement | null;
  result: TollV2WeekResult;
  charges: TollV2Charge[];
  /** Dispute results posted in this week (desk.results), for each driver's eye breakdown. */
  results?: TollV2DisputeResult[];
  weekKey?: string;
  onGoToTagAccount: () => void;
  /**
   * WRA-57: the toll week result sums uploaded files from zero and ignores the step-4 anchor,
   * so the box shows step 4's numbers. null = still loading or unavailable (shows "—");
   * undefined = no roll given (falls back to the toll week result).
   */
  roll?: TagAccountBoxRoll | null;
}) {
  const drivers = result.drivers ?? [];
  const tag: Partial<TagAccountBoxRoll> | null =
    roll === undefined
      ? result.tagAccount
        ? {
            openingMinor: result.tagAccount.openingMinor,
            topUpsMinor: result.tagAccount.topUpsMinor,
            usageMinor: result.tagAccount.usageMinor,
            closingMinor: result.tagAccount.closingMinor,
          }
        : null
      : roll;
  const show = (minor: number | undefined) => (tag && minor != null ? fmtTollMinor(minor) : '—');

  const driverRows = useMemo(
    () =>
      drivers.map((d) => {
        // Same rule as the server's earlierResults: earlier weeks' disputes that ended this week, driver's share.
        const earlier = (results ?? []).filter(
          (r) =>
            r.driverId === d.driverId &&
            r.bearer === 'driver' &&
            ['lost', 'expired', 'part_won'].includes(r.outcome) &&
            !!weekKey &&
            !!r.chargeWeekKey &&
            r.chargeWeekKey < weekKey,
        );
        const earlierMinor = earlier.reduce((n, r) => n + (r.borneMinor ?? 0), 0);
        return {
          ...d,
          label: driverDisplayName(d.driverId, d.driverName, charges),
          earlierMinor,
          earlierCount: earlier.length,
          thisWeekMinor: (d.owesFleetMinor ?? 0) - earlierMinor,
        };
      }),
    [drivers, charges, results, weekKey],
  );
  const [explainId, setExplainId] = useState<string | null>(null);
  const explain = driverRows.find((d) => d.driverId === explainId) ?? null;

  if (!target) return null;

  const card = (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-driver-charges">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Driver toll charges</p>
        {driverRows.length === 0 ? (
          <p className="mt-2 text-sm text-[#47464c]">No drivers charged this week.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {driverRows.map((d) => (
              <li key={d.driverId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[#0b1c30]" data-testid={`toll-driver-name-${d.driverId}`}>
                    {d.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExplainId(d.driverId)}
                    aria-label={`How ${d.label}'s toll charge is worked out`}
                    data-testid={`toll-driver-explain-${d.driverId}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#cbd5e1] bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe7ff]"
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </button>
                </span>
                <span className="tabular-nums">{fmtTollMinor(d.owesFleetMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-tag-account">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Tag account</p>
        <dl className="mt-2 space-y-1 text-sm tabular-nums">
          <div className="flex justify-between gap-2">
            <dt className="text-[#47464c]">Opening</dt>
            <dd className="font-medium text-[#0b1c30]" data-testid="toll-tag-opening">{show(tag?.openingMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[#47464c]">+ Top-ups</dt>
            <dd className="font-medium text-[#0b1c30]">{show(tag?.topUpsMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[#47464c]">− Usage</dt>
            <dd className="font-medium text-[#0b1c30]">{show(tag?.usageMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-[#eff4ff] pt-2">
            <dt className="font-medium text-[#0b1c30]">= Closing</dt>
            <dd className="font-semibold text-[#0b1c30]" data-testid="toll-tag-closing">{show(tag?.closingMinor)}</dd>
          </div>
        </dl>
        <TollV2SecondaryButton className="mt-4 w-full" type="button" onClick={onGoToTagAccount}>
          Go to Tag account
        </TollV2SecondaryButton>
      </div>
      <Dialog open={!!explain} onOpenChange={(o) => !o && setExplainId(null)}>
        <DialogContent className="max-w-sm" data-testid="toll-driver-explain">
          {explain ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {explain.label} · {fmtTollMinor(explain.owesFleetMinor)}
                </DialogTitle>
                <DialogDescription>What this driver is charged for tolls this week.</DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#47464c]">Tolls from this week</dt>
                  <dd className="font-medium text-[#0b1c30]">{fmtTollMinor(explain.thisWeekMinor)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#47464c]">
                    {explain.earlierCount === 1 ? '1 dispute' : `${explain.earlierCount} disputes`} from earlier weeks
                    <span className="block text-xs">Not sent to Uber in time, or Uber said no</span>
                  </dt>
                  <dd className="font-medium text-[#0b1c30]">{fmtTollMinor(explain.earlierMinor)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-[#e5eeff] pt-2 font-semibold text-[#0b1c30]">
                  <dt>Total</dt>
                  <dd>{fmtTollMinor(explain.owesFleetMinor)}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );

  return createPortal(card, target);
}
