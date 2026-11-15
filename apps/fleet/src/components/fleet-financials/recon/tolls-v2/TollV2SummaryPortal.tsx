import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TollV2Charge, TollV2WeekResult } from './types';
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
}: {
  target: HTMLElement | null;
  result: TollV2WeekResult;
  charges: TollV2Charge[];
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
      drivers.map((d) => ({
        ...d,
        label: driverDisplayName(d.driverId, d.driverName, charges),
      })),
    [drivers, charges],
  );

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
              <li key={d.driverId} className="flex justify-between gap-2">
                <span className="truncate text-[#0b1c30]" data-testid={`toll-driver-name-${d.driverId}`}>
                  {d.label}
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
    </div>
  );

  return createPortal(card, target);
}
