import React from 'react';
import { Check } from 'lucide-react';
import type { BlockerGroup } from './tollV2DeskLogic';
import { progressCounts } from './tollV2Tiles';
import { tileSumLine, type TollV2TileSet } from './tollV2Tiles';
import type { TollV2Charge } from './types';
import { formatWeekTitle } from '../weekListFormat';
import { TollV2PrimaryButton } from './TollV2Buttons';

export function TollV2SealBox({
  weekKey,
  tiles,
  charges,
  blockers,
  blockerGroups,
  sealed,
  sealing,
  onSeal,
  onScrollTo,
}: {
  weekKey: string;
  tiles: TollV2TileSet;
  charges: TollV2Charge[];
  blockers: unknown[];
  blockerGroups: BlockerGroup[];
  sealed: boolean;
  sealing: boolean;
  onSeal: () => void;
  onScrollTo: (id: string) => void;
}) {
  const ready = blockers.length === 0;
  const left = progressCounts(charges).left;
  const sealLabel = ready
    ? `Seal tolls for ${formatWeekTitle(weekKey)}`
    : `${left} toll${left === 1 ? '' : 's'} left to decide`;

  return (
    <div className="mt-6 rounded-[20px] border border-[#e5eeff] bg-white p-5 shadow-sm" data-testid="toll-v2-seal-box">
      <h3 className="text-lg font-semibold text-[#0b1c30]">Seal tolls</h3>
      <p className="mt-1 text-sm tabular-nums text-[#47464c]" data-testid="toll-v2-seal-sum-line">
        {tileSumLine(tiles)}
      </p>
      {ready && !sealed ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#ecfdf5] bg-[#ecfdf5]/50 px-3 py-2">
          <Check className="h-5 w-5 shrink-0 text-[#069669]" aria-hidden />
          <p className="text-sm font-medium text-[#069669]">Everything adds up perfectly.</p>
        </div>
      ) : null}
      {!ready && !sealed ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-[#0b1c30]">Before you can seal</p>
          <ul className="space-y-1 text-sm text-[#47464c]">
            {blockerGroups.map((g) => (
              <li key={g.sectionId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{g.label}</span>
                <button
                  type="button"
                  className="rounded-lg border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold text-[#0b1c30]"
                  onClick={() => onScrollTo(g.sectionId)}
                >
                  Show
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sealed ? (
        <p className="mt-3 text-sm text-[#47464c]">After sealing, this week&apos;s tolls can&apos;t change.</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-[#47464c]">After sealing, this week&apos;s tolls can&apos;t change.</p>
          <TollV2PrimaryButton
            type="button"
            className="mt-4"
            disabled={!ready || sealing}
            onClick={onSeal}
            data-testid="toll-v2-seal-button"
          >
            {sealing ? 'Sealing…' : sealLabel}
          </TollV2PrimaryButton>
        </>
      )}
    </div>
  );
}
