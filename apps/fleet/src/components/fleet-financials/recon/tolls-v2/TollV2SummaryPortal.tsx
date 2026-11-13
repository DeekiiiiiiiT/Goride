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

export function TollV2SummaryPortal({
  target,
  result,
  charges,
  onGoToTagAccount,
}: {
  target: HTMLElement | null;
  result: TollV2WeekResult;
  charges: TollV2Charge[];
  onGoToTagAccount: () => void;
}) {
  const drivers = result.drivers ?? [];
  const tag = result.tagAccount;

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
            <dd className="font-medium text-[#0b1c30]">{fmtTollMinor(tag?.openingMinor ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[#47464c]">+ Top-ups</dt>
            <dd className="font-medium text-[#0b1c30]">{fmtTollMinor(tag?.topUpsMinor ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[#47464c]">− Usage</dt>
            <dd className="font-medium text-[#0b1c30]">{fmtTollMinor(tag?.usageMinor ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-[#eff4ff] pt-2">
            <dt className="font-medium text-[#0b1c30]">= Closing</dt>
            <dd className="font-semibold text-[#0b1c30]">{fmtTollMinor(tag?.closingMinor ?? 0)}</dd>
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
