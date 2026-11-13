import React from 'react';
import { formatWeekTitle } from '../weekListFormat';
import { TollV2SecondaryButton } from './TollV2Buttons';
import { fmtTollMinor, formatTimeJm } from './tollV2Format';
import type { TollV2LateItem } from './types';

export function TollV2LateItemsCard({
  items,
  openWeek,
  weekPaid,
  busy,
  onCarry,
}: {
  items: TollV2LateItem[];
  openWeek?: string;
  weekPaid?: boolean;
  busy: boolean;
  onCarry: (item: TollV2LateItem) => void;
}) {
  if (!items.length) return null;
  const openLabel = openWeek ? formatWeekTitle(openWeek) : 'the open week';

  return (
    <section className="rounded-2xl border border-[#e5eeff] bg-white p-4 shadow-sm" data-testid="toll-v2-late">
      <h3 className="text-sm font-semibold text-[#0b1c30]">Arrived after this week was sealed</h3>
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const line = lateLine(item);
          return (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex flex-col gap-2 rounded-xl border border-[#e5eeff] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-[#0b1c30]">{line}</p>
              {weekPaid ? (
                <TollV2SecondaryButton type="button" disabled={busy} onClick={() => onCarry(item)}>
                  Move to {openLabel}
                </TollV2SecondaryButton>
              ) : (
                <p className="text-xs font-medium text-amber-800">Reopen tolls to add it to this week</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function lateLine(item: TollV2LateItem): string {
  if (item.kind === 'late_charge') {
    return `A toll the provider sent late · ${formatTimeJm(item.at)} · ${item.plazaName ?? 'Toll'} · ${fmtTollMinor(item.amountMinor)}`;
  }
  if (item.kind === 'late_payback') {
    return `A payback that came in late · ${fmtTollMinor(item.amountMinor)} · ${item.reference ?? 'Payback'}`;
  }
  if (item.kind === 'correction') {
    return `Toll amount corrected by the provider · ${fmtTollMinor(item.oldAmountMinor)} → ${fmtTollMinor(item.newAmountMinor)}`;
  }
  return `Late item · ${fmtTollMinor(item.amountMinor)}`;
}
