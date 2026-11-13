import React from 'react';
import { createPortal } from 'react-dom';
import type { TollV2WeekResult } from './types';
import { fmtTollMinor } from './tollV2Format';
import { TollV2SecondaryButton } from './TollV2Buttons';

export function TollV2SummaryPortal({
  target,
  result,
  onGoToTagAccount,
}: {
  target: HTMLElement | null;
  result: TollV2WeekResult;
  onGoToTagAccount: () => void;
}) {
  if (!target) return null;
  const drivers = result.drivers ?? [];
  const tag = result.tagAccount;

  const card = (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-driver-charges">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Driver toll charges</p>
        {drivers.length === 0 ? (
          <p className="mt-2 text-sm text-[#47464c]">No drivers charged this week.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {drivers.map((d) => (
              <li key={d.driverId} className="flex justify-between gap-2">
                <span className="truncate text-[#0b1c30]">{d.driverName || d.driverId}</span>
                <span className="font-mono tabular-nums">{fmtTollMinor(d.owesFleetMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-tag-account">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Tag account</p>
        <dl className="mt-2 space-y-1 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-[#47464c]">Week usage</dt>
            <dd className="font-medium">{fmtTollMinor(tag?.usageMinor ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#47464c]">Closing balance</dt>
            <dd className="font-medium">{fmtTollMinor(tag?.closingMinor ?? 0)}</dd>
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
