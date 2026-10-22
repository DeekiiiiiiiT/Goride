/**
 * Bill only the part of a 4-week running difference that is still unexplained
 * after earlier weeks' unused credit. A negative week is never billed.
 * The week's own miscellaneousCost stays the raw number for the close check.
 */
import { VARIANCE_MATERIALITY_PCT } from './referenceEfficiency.ts';

export type RollingVariance = {
  /** Unused negative from earlier weeks. Zero or negative. */
  creditIn: number;
  /** This week plus unused credit. */
  runningBalance: number;
  /** Amount the leftover split may bill. Never negative. */
  billable: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rollingVarianceBill(args: {
  thisWeek: number;
  /** Oldest first. A missing week is already 0. */
  priorSigned: number[];
  weekSpend: number;
  materialityPct?: number;
}): RollingVariance {
  let credit = 0;
  for (const raw of args.priorSigned || []) {
    const net = (Number(raw) || 0) + credit;
    credit = net < 0 ? net : 0;
  }
  const thisWeek = Number(args.thisWeek) || 0;
  const running = thisWeek + credit;
  const spend = Math.max(0, Number(args.weekSpend) || 0);
  const pct = args.materialityPct ?? VARIANCE_MATERIALITY_PCT;
  const materiality = spend * (pct / 100);
  const billable = running > materiality ? round2(running - materiality) : 0;
  return {
    creditIn: round2(credit),
    runningBalance: round2(running),
    billable,
  };
}
