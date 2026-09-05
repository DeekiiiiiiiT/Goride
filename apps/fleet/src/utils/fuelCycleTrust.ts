/**
 * Trust partition for Full Tanks period view.
 * Trusted cycles feed headline KPIs + primary list.
 * Incomplete mega / anomaly / unclosed Active (on closed weeks) → Exception queue only.
 */
import type { FuelCycle } from '../types/fuel';

export type PeriodBoundsYmd = {
  start?: string | null;
  end?: string | null;
};

export type CyclePartition = {
  trusted: FuelCycle[];
  exceptions: FuelCycle[];
};

export type PartitionOpts = {
  periodFillToFillKm?: number;
  /**
   * When false (historical closed week), Active tanks are incomplete for that
   * week — never headline “Calculating…” totals. Open weeks keep Active trusted.
   */
  isPeriodOpen?: boolean;
};

function ymd(value: string | undefined | null): string {
  return String(value || '').split('T')[0];
}

function spanDays(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const a = Date.parse(`${start}T12:00:00Z`);
  const b = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function isExceptionSignal(cycle: FuelCycle): boolean {
  return (
    cycle.status === 'Anomaly' ||
    cycle.signalTier === 'exception' ||
    (typeof cycle.efficiency === 'number' && cycle.efficiency > 0 && cycle.efficiency < 8)
  );
}

/**
 * Open Active tank on a closed week = no capacity close in that week.
 * Still overlaps the week in the engine, but must not look like a finished tank.
 */
export function isUnclosedActiveOnClosedPeriod(
  cycle: FuelCycle,
  opts?: Pick<PartitionOpts, 'isPeriodOpen'>,
): boolean {
  if (cycle.status !== 'Active') return false;
  // Undefined → treat as closed-safe only when explicitly false
  return opts?.isPeriodOpen === false;
}

/**
 * Long tanks that opened before the selected week and are not trustworthy
 * capacity closes for headline totals (missing stamps / card CSV / collapse).
 */
export function isIncompleteMegaCycle(
  cycle: FuelCycle,
  period: PeriodBoundsYmd,
  opts?: Pick<PartitionOpts, 'periodFillToFillKm'>,
): boolean {
  const periodStart = period.start ? ymd(period.start) : '';
  if (!periodStart) return false;

  const cStart = ymd(cycle.startDate);
  if (!cStart || cStart >= periodStart) return false;

  const cEnd = ymd(cycle.endDate) || cStart;
  const days = spanDays(cStart, cEnd);
  const distance = Number(cycle.distance) || 0;
  const fillToFill = opts?.periodFillToFillKm ?? 0;

  if (cycle.status === 'Anomaly' || cycle.signalTier === 'exception') return true;
  if (days > 7) return true;
  if (fillToFill > 0 && distance > fillToFill * 2) return true;
  return false;
}

/**
 * Complete tanks count for a week only when the capacity close lands in that week.
 * A cycle that merely overlaps (e.g. starts Aug 29, closes Sep 1) is next week's tank.
 */
export function isCompleteCloseInPeriod(
  cycle: FuelCycle,
  period: PeriodBoundsYmd,
): boolean {
  if (cycle.status !== 'Complete') return false;
  const periodStart = period.start ? ymd(period.start) : '';
  const periodEnd = period.end ? ymd(period.end) : '';
  const cEnd = ymd(cycle.endDate);
  if (!cEnd) return false;
  if (periodStart && cEnd < periodStart) return false;
  if (periodEnd && cEnd > periodEnd) return false;
  return true;
}

/**
 * Split overlapping cycles into trusted (Completes closed this week + Active-on-open-week)
 * vs exception / next-week spillover.
 */
export function partitionCyclesForPeriod(
  cycles: FuelCycle[] | null | undefined,
  period: PeriodBoundsYmd,
  opts?: PartitionOpts,
): CyclePartition {
  const trusted: FuelCycle[] = [];
  const exceptions: FuelCycle[] = [];
  const seenException = new Set<string>();

  const pushException = (c: FuelCycle) => {
    if (seenException.has(c.id)) return;
    seenException.add(c.id);
    exceptions.push(c);
  };

  for (const cycle of cycles ?? []) {
    if (isIncompleteMegaCycle(cycle, period, opts)) {
      pushException(cycle);
      continue;
    }
    if (isUnclosedActiveOnClosedPeriod(cycle, opts)) {
      pushException(cycle);
      continue;
    }
    if (cycle.status === 'Anomaly' || cycle.signalTier === 'exception') {
      pushException(cycle);
      continue;
    }
    if (cycle.status === 'Complete') {
      if (!isCompleteCloseInPeriod(cycle, period)) {
        // Overlaps this week but closes later — investigation only, not this week's done tank
        pushException(cycle);
        continue;
      }
      trusted.push(cycle);
      if (
        typeof cycle.efficiency === 'number' &&
        cycle.efficiency > 0 &&
        cycle.efficiency < 8
      ) {
        pushException(cycle);
      }
      continue;
    }
    if (cycle.status === 'Active') {
      trusted.push(cycle);
      if (
        typeof cycle.efficiency === 'number' &&
        cycle.efficiency > 0 &&
        cycle.efficiency < 8
      ) {
        pushException(cycle);
      }
      continue;
    }
    pushException(cycle);
  }

  return { trusted, exceptions };
}

export function incompleteHistoryReason(cycle: FuelCycle, period: PeriodBoundsYmd, opts?: PartitionOpts): string {
  if (isUnclosedActiveOnClosedPeriod(cycle, opts)) {
    return 'Tank did not close in this week — still open or missing capacity close';
  }
  if (
    cycle.status === 'Complete' &&
    !isCompleteCloseInPeriod(cycle, period) &&
    !isIncompleteMegaCycle(cycle, period, opts)
  ) {
    return 'Tank closes after this week — counted in the close week';
  }
  if (isIncompleteMegaCycle(cycle, period, opts)) {
    return 'Incomplete tank history — often missing card import or capacity closes';
  }
  if (cycle.status === 'Anomaly') return 'Anomaly status';
  if (cycle.signalTier === 'exception') return 'Exception signal';
  if (typeof cycle.efficiency === 'number' && cycle.efficiency > 0 && cycle.efficiency < 8) {
    return `Low efficiency (${cycle.efficiency.toFixed(1)} km/L)`;
  }
  return 'Needs review';
}
