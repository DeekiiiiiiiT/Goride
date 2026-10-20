import type { WeekCashSummary } from '../../../utils/settlementWeekCashSummary';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

/** Passenger / Returned / Still held — larger type + distinct colors. */
export function WeekCashStatsLine({ cash }: { cash: WeekCashSummary }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-semibold tabular-nums leading-snug">
      <span className="text-slate-700">
        <span className="font-medium text-slate-500">Passenger</span> {MONEY(cash.passenger)}
      </span>
      <span className="text-emerald-700">
        <span className="font-medium text-emerald-600/90">Returned</span> {MONEY(cash.returned)}
      </span>
      <span className="text-amber-700">
        <span className="font-medium text-amber-600/90">Still held</span> {MONEY(cash.stillHeld)}
      </span>
    </p>
  );
}
