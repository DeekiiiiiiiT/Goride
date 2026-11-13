import React from 'react';
import { AlertTriangle, Clock, RotateCcw, Tag } from 'lucide-react';
import { formatWeekTitle } from '../weekListFormat';
import { TollV2PrimaryButton } from './TollV2Buttons';
import { chargeWhen, fmtTollMinor, paybackLine } from './tollV2Format';
import type { TollV2LateItem, TollV2Trip } from './types';

/** Stitch "sealed week with late items": the late items card under the tiles. */
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
    <section
      className="rounded-[20px] border border-[#fde7c7] bg-[#fffaf2] p-4 shadow-sm sm:p-5"
      data-testid="toll-v2-late"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[#b45309]" aria-hidden />
        <h3 className="text-base font-semibold text-[#0b1c30]">Arrived after this week was sealed</h3>
        <span className="rounded-full bg-[#fde68a] px-2 py-0.5 text-xs font-semibold text-[#78350f]">
          {items.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#47464c]">
        These belong to this week but came in late. They move into the week that&apos;s open now, so this
        week&apos;s numbers never change.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const { chip, title, sub } = lateItemCopy(item);
          return (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex flex-col gap-3 rounded-xl border border-[#e5eeff] bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eff4ff] px-2 py-0.5 text-xs font-medium text-[#47464c]">
                  {chip.icon}
                  {chip.label}
                </span>
                <p className="mt-1 text-sm font-medium text-[#0b1c30]">{title}</p>
                {sub ? <p className="text-xs text-[#47464c]">{sub}</p> : null}
              </div>
              {weekPaid ? (
                <TollV2PrimaryButton type="button" disabled={busy} onClick={() => onCarry(item)}>
                  {item.kind === 'correction' ? `Move the difference to ${openLabel}` : `Move to ${openLabel}`}
                </TollV2PrimaryButton>
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

/** Plain words for one late item — no ids or references. */
export function lateItemCopy(item: TollV2LateItem & { trip?: TollV2Trip | null }): {
  chip: { label: string; icon: React.ReactNode };
  title: string;
  sub?: string;
} {
  const amount = fmtTollMinor(item.amountMinor ?? 0);
  if (item.kind === 'late_charge') {
    const who = item.paidBy === 'cash' ? 'A cash toll the driver sent late' : 'A toll the provider sent late';
    return {
      chip: { label: 'Arrived late', icon: <Clock className="h-3 w-3" aria-hidden /> },
      title: `${who} · ${chargeWhen(item.at || item.occurredAt)} · ${item.plazaName ?? 'Toll'} · ${amount}`,
    };
  }
  if (item.kind === 'late_payback') {
    return {
      chip: { label: 'Uber payback', icon: <RotateCcw className="h-3 w-3" aria-hidden /> },
      title: `A payback that came in late · ${amount}`,
      sub: paybackLine(item.trip, item.at?.slice(0, 10), item.amountMinor),
    };
  }
  if (item.kind === 'correction') {
    return {
      chip: { label: 'Amount corrected', icon: <Tag className="h-3 w-3" aria-hidden /> },
      title: `Toll amount corrected by the provider · ${chargeWhen(item.occurredAt || item.at)} · ${
        item.plazaName ?? 'Toll'
      } · ${fmtTollMinor(item.oldAmountMinor ?? 0)} → ${fmtTollMinor(item.newAmountMinor ?? 0)}`,
    };
  }
  return { chip: { label: 'Arrived late', icon: <Clock className="h-3 w-3" aria-hidden /> }, title: `Late item · ${amount}` };
}
