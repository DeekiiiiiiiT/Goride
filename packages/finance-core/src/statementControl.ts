/**
 * Nightly statement control. Known weeks from the Oct 2026 ledgers audit
 * stay "historical" until Week Reconciliation restates them.
 */

export const KNOWN_FARE_DRIFT_WEEKS = [
  '2026-07-06',
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-14',
  '2026-10-12',
] as const;

/** Toll statement vs trip refunds disagreed in these weeks. */
export const KNOWN_TOLL_DRIFT_WEEKS = [
  '2026-08-03',
  '2026-08-10',
  '2026-09-14',
  '2026-10-05',
] as const;

const EPS = 0.01;

export type StatementControlKind = 'fare' | 'toll' | 'cash';

export function classifyStatementControl(args: {
  week: string;
  kind: StatementControlKind;
  difference: number;
}): 'ok' | 'historical' | 'historical_dual_store' | 'unexplained' {
  if (Math.abs(args.difference) < EPS) {
    return args.kind === 'cash' ? 'historical_dual_store' : 'ok';
  }
  const week = args.week.slice(0, 10);
  if (args.kind === 'fare' && (KNOWN_FARE_DRIFT_WEEKS as readonly string[]).includes(week)) {
    return 'historical';
  }
  if (args.kind === 'toll' && (KNOWN_TOLL_DRIFT_WEEKS as readonly string[]).includes(week)) {
    return 'historical';
  }
  if (args.kind === 'cash') return 'unexplained';
  return 'unexplained';
}
