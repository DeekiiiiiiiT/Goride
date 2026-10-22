/**
 * One continuous fill chain. The week's kilometres run from the last
 * odometered fill before the week to the last odometered fill in the week.
 * Every litre bought in the week counts. The first week of a vehicle
 * (no prior fill) keeps the shorter in-week span.
 */
import { fleetInstantMs, hasTzSuffix } from './fleetTime.ts';
import { isEntryInInclusiveYmdRange } from './fuelWeekRange.ts';
import { selectWeekFuelFills } from './selectWeekFuelFills.ts';
import type { FuelEntry } from './fuelTypes.ts';

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

function clockFromTime(day: string, time: string): string | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `${day}T${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

/** A date-only fill borrows the linked card clock, or the end of that Jamaica day. */
export function resolveFillAt(args: {
  date?: string;
  time?: string;
  linkedDate?: string;
  linkedTime?: string;
}): { at: string; assumedEndOfDay: boolean } {
  const date = String(args.date || '').trim();
  const day = date.slice(0, 10);
  if (hasClock(date)) return { at: date, assumedEndOfDay: false };
  const own = clockFromTime(day, String(args.time || ''));
  if (own) return { at: own, assumedEndOfDay: false };
  const linkedDate = String(args.linkedDate || '').trim();
  if (hasClock(linkedDate)) return { at: linkedDate, assumedEndOfDay: false };
  const linked = clockFromTime(day || linkedDate.slice(0, 10), String(args.linkedTime || ''));
  if (linked) return { at: linked, assumedEndOfDay: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return { at: `${day}T23:59:59`, assumedEndOfDay: true };
  return { at: date, assumedEndOfDay: false };
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

function entryTime(entry: FuelEntry | undefined): string {
  if (!entry) return '';
  if (entry.time) return String(entry.time);
  const meta = entry.metadata as Record<string, unknown> | undefined;
  return meta && typeof meta.time === 'string' ? meta.time : '';
}

/** Stamp each physical fill with a real clock so trip matching does not fall back to the calendar. */
export function applyFillClocks(entries: FuelEntry[]): FuelEntry[] {
  const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
  const resolved = new Map<string, { at: string; assumedEndOfDay: boolean }>();
  for (const fill of selectWeekFuelFills(entries || [])) {
    const manual = fill.manualEntryId ? byId.get(fill.manualEntryId) : undefined;
    const card = fill.cardTxId ? byId.get(fill.cardTxId) : undefined;
    const chosen = manual || card;
    if (!chosen) continue;
    const other = chosen.id === manual?.id ? card : manual;
    const clock = resolveFillAt({
      date: chosen.date,
      time: entryTime(chosen),
      linkedDate: other?.date,
      linkedTime: entryTime(other),
    });
    if (manual) resolved.set(manual.id, clock);
    if (card) resolved.set(card.id, clock);
  }
  return (entries || []).map((entry) => {
    const clock = resolved.get(entry.id);
    if (!clock) return entry;
    return {
      ...entry,
      date: clock.at,
      metadata: {
        ...(entry.metadata || {}),
        ...(clock.assumedEndOfDay ? { clockAssumedEndOfDay: true } : {}),
      },
    };
  });
}
