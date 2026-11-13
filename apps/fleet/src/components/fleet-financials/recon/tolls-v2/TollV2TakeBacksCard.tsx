import React from 'react';
import { TollV2SecondaryButton } from './TollV2Buttons';
import { fmtTollMinor } from './tollV2Format';
import type { TollV2TakeBack } from './types';

export function TollV2TakeBacksCard({
  takeBacks,
  onRecord,
}: {
  takeBacks: TollV2TakeBack[];
  onRecord: (tb: TollV2TakeBack) => void;
}) {
  if (!takeBacks.length) return null;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm" data-testid="toll-v2-takebacks">
      <h3 className="text-sm font-semibold text-[#0b1c30]">Uber took back a toll payment</h3>
      <ul className="mt-3 space-y-2">
        {takeBacks.map((tb) => (
          <li
            key={tb.id}
            className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-sm">
              <p className="font-medium text-[#0b1c30]">
                {tb.driverName ?? 'Driver'} · {fmtTollMinor(tb.amountMinor)}
              </p>
              <p className="text-xs text-[#47464c]">
                {tb.reference ?? 'Uber adjustment'} · {tb.paidOn ?? '—'}
              </p>
            </div>
            <TollV2SecondaryButton type="button" className="w-full sm:w-auto" onClick={() => onRecord(tb)}>
              Record the take-back
            </TollV2SecondaryButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
