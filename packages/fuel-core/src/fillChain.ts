/**
 * One continuous fill chain. The week's kilometres run from the last
 * odometered fill before the week to the last odometered fill in the week.
 * Every litre bought in the week counts. The first week of a vehicle
 * (no prior fill) keeps the shorter in-week span.
 */
import { fleetInstantMs, hasTzSuffix } from './fleetTime.ts';
import { isEntryInInclusiveYmdRange } from './fuelWeekRange.ts';

export type PriorFill = {
  odometer: number;
  /** Fleet wall time or UTC instant of that fill. */
  at?: string;
};

export type FillChainSpan = {
  useChain: boolean;
  chainStart: 'prior_fill' | 'vehicle_first_week';
  spanStartOdometer: number;
  spanEndOdometer: number;
  spanKm: number;
};

export function resolveFillChainSpan(args: {
  weekStartOdometer: number;
  weekEndOdometer: number;
  prior?: PriorFill | null;
}): FillChainSpan {
  const end = Number(args.weekEndOdometer) || 0;
  const startInWeek = Number(args.weekStartOdometer) || 0;
  const priorOdo = Number(args.prior?.odometer) || 0;
  if (priorOdo > 0 && end > priorOdo) {
    return {
      useChain: true,
      chainStart: 'prior_fill',
      spanStartOdometer: priorOdo,
      spanEndOdometer: end,
      spanKm: end - priorOdo,
    };
  }
  const spanKm = end > startInWeek ? end - startInWeek : 0;
  return {
    useChain: false,
    chainStart: 'vehicle_first_week',
    spanStartOdometer: startInWeek,
    spanEndOdometer: end,
    spanKm,
  };
}

function hasClock(stored: string | undefined): boolean {
  if (!stored) return false;
  return /T\d{2}:\d{2}/.test(stored) || hasTzSuffix(stored);
}

/**
 * Trips with a real clock belong to the fill span (prior, last].
 * Date-only trips stay on the calendar week.
 */
export function tripBelongsToFillSpan(
  trip: { date?: string; requestTime?: string; dropoffTime?: string },
  args: { weekStart: string; weekEnd: string; priorAt?: string; endAt?: string },
): boolean {
  const clock = [trip.requestTime, trip.dropoffTime, trip.date].find((v) => hasClock(v));
  if (args.priorAt && args.endAt && clock && hasClock(args.priorAt) && hasClock(args.endAt)) {
    const ms = fleetInstantMs(clock);
    const a = fleetInstantMs(args.priorAt);
    const b = fleetInstantMs(args.endAt);
    if (ms != null && a != null && b != null) return ms > a && ms <= b;
  }
  return isEntryInInclusiveYmdRange(trip.date, args.weekStart, args.weekEnd);
}
