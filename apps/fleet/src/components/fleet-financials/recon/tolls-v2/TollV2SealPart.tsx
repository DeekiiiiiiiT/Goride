import React from 'react';
import { ArrowRight, Check, Loader2, Lock } from 'lucide-react';
import type { TollV2Blocker, TollV2Charge, TollV2Desk, TollV2PartNo } from './types';
import { earlierResultsText, stillOpenLines, sumLineText } from './tollV2Parts';
import { formatWeekTitle } from '../weekListFormat';
import { TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';
import { TollV2ChargeRow, type TollV2RowActions } from './TollV2ChargeRow';

export function TollV2SealPart({
  desk,
  decided,
  blockers,
  rowActions,
  sealing,
  onSeal,
  onGoTo,
  onGoToTagAccount,
}: {
  desk: TollV2Desk;
  /** This week's decided charges (part 6). */
  decided: TollV2Charge[];
  /** The server's blockers, or a refused seal's `blocking` items when that is newer (AD3). */
  blockers: TollV2Blocker[];
  rowActions: TollV2RowActions;
  sealing: boolean;
  onSeal: () => void;
  onGoTo: (part: TollV2PartNo) => void;
  onGoToTagAccount: () => void;
}) {
  const lines = stillOpenLines(blockers);
  const ready = lines.length === 0;
  const earlier = earlierResultsText(desk.earlierResults);

  return (
    <div className="flex flex-col gap-6" data-testid="toll-v2-part-seal">
      {desk.sealed ? (
        <div
          className="flex flex-col gap-3 rounded-xl bg-[#ecfdf5] p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="toll-v2-sealed-banner"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-[#065f46]">
            <Check className="h-5 w-5 shrink-0" aria-hidden />
            Tolls for the week of {formatWeekTitle(desk.weekKey).replace(/^Week of\s+/i, '')} are sealed.
          </p>
          <TollV2PrimaryButton type="button" onClick={onGoToTagAccount} data-testid="toll-v2-continue-tag">
            Continue to Tag account <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </TollV2PrimaryButton>
        </div>
      ) : null}

      {!desk.sealed && !ready ? (
        <section className="flex flex-col gap-3" data-testid="toll-v2-still-open">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0b1c30]">Still open</h3>
            <span className="text-xs font-semibold text-[#ba1a1a]">
              {lines.length} part{lines.length === 1 ? '' : 's'} with work left
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li
                key={l.part}
                className="flex flex-col gap-2 rounded-xl bg-[#f8f9ff] p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`toll-v2-still-open-${l.part}`}
              >
                <span className="text-sm font-medium text-[#0b1c30]">{l.text}</span>
                <TollV2SecondaryButton type="button" onClick={() => onGoTo(l.part)}>
                  {l.goLabel}
                </TollV2SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" data-testid="toll-v2-decided">
        <h3 className="text-base font-semibold text-[#0b1c30]">
          Decided · {decided.length} toll{decided.length === 1 ? '' : 's'}
        </h3>
        {decided.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[#47464c]">
            <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
            Nothing decided yet
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[#eff4ff] bg-white">
            {decided.map((c) => (
              <TollV2ChargeRow key={c.id} charge={c} actions={{ ...rowActions, readOnly: desk.sealed }} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-[#f8f9ff] p-4" data-testid="toll-v2-seal-box">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
              <Lock className="h-4 w-4 text-[#47464c]" aria-hidden />
            </span>
            <div>
              <p className="flex items-center gap-2 font-semibold text-[#0b1c30]">
                Seal tolls
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#47464c]">
                  {desk.sealed ? 'Sealed' : ready ? 'Ready' : 'Not ready'}
                </span>
              </p>
              {!desk.sealed && !ready ? (
                <p className="text-xs text-[#ba1a1a]">
                  Finish the {lines.length === 1 ? 'part' : 'parts'} above before sealing
                </p>
              ) : !desk.sealed ? (
                <p className="text-xs text-[#47464c]">After sealing, this week&apos;s tolls can&apos;t change.</p>
              ) : null}
            </div>
          </div>
          {!desk.sealed ? (
            <TollV2PrimaryButton
              type="button"
              disabled={!ready || sealing}
              onClick={onSeal}
              data-testid="toll-v2-seal-button"
            >
              {sealing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> Sealing…
                </>
              ) : (
                <>
                  <Lock className="mr-1 h-4 w-4" aria-hidden /> Seal tolls
                </>
              )}
            </TollV2PrimaryButton>
          ) : null}
        </div>
        {desk.sumLine ? (
          <p className="rounded-lg bg-white px-3 py-2 text-sm tabular-nums text-[#0b1c30]" data-testid="toll-v2-seal-sum-line">
            {sumLineText(desk.sumLine)}
          </p>
        ) : null}
        {earlier ? (
          <p className="text-xs text-[#47464c]" data-testid="toll-v2-earlier-results">
            {earlier}
          </p>
        ) : null}
      </section>
    </div>
  );
}
