/**
 * Week Reconciliation step 5 → "Fuel checks" (fuel audit Part J screens 4–8). Pure helpers:
 * the server's check lists, the missed-fill form rules and the car-economy chips.
 */
import type { FuelEntry } from '../types/fuel';
import { buildGasCardOdometerAnchor } from './buildGasCardOdometerAnchor';
import { stampAdminKnownFillCashMeta } from './adminKnownFillStamp';

export type AwaitingCardFill = {
  entryId: string;
  vehicleId: string;
  dateYmd: string;
  odometer: number | null;
  amountSoFar: number;
  daysWaiting: number;
};

export type ClosedCheck = {
  entryId: string;
  flagCode: string;
  note: string | null;
  actorId: string | null;
  at: string | null;
};

export type PossibleFillCheck = {
  flagId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  startOdometer: number;
  endOdometer: number;
  stretchKm: number;
  p90Km: number;
  closed: ClosedCheck | null;
};

export type WeekStretch = {
  vehicleId: string;
  startDate: string;
  endDate: string;
  km: number;
  flagged: boolean;
};

export type FuelWeekChecksResponse = {
  periodId: string;
  weekStart: string;
  weekEnd: string;
  locked: boolean;
  awaiting: AwaitingCardFill[];
  possibleFills: PossibleFillCheck[];
  stretches: WeekStretch[];
  actorNames: Record<string, string>;
};

export type EconomyWeekRow = {
  weekStart: string;
  kmPerLiter: number | null;
  referenceKmPerLiter: number | null;
  pctVsUsual: number | null;
  band: 'normal' | 'watch' | 'flagged' | null;
};

export type VehicleEconomyResponse = {
  vehicleId: string;
  weekStart: string;
  weeks: EconomyWeekRow[];
  economyDriftAlert: boolean;
  referenceKmPerLiter: number | null;
};

export const FLAG_POSSIBLE_FILL = 'possible_fill_not_scanned';
export const CLOSE_NOTE_MIN = 10;
/** With this many waiting fills or more, they show as one row that opens (Part E screen 3). */
export const AWAITING_GROUP_AT = 3;
/** "Check" when a week is this much better than usual (Part J screen 8). */
export const ECONOMY_CHECK_BETTER_PCT = 15;

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ymd: string): { y: number; m: number; d: number; dow: number } | null {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Wed 18 Nov" */
export function dayLabel(ymd: string): string {
  const p = parts(ymd);
  return p ? `${DAY[p.dow]} ${p.d} ${MON[p.m - 1]}` : ymd;
}

/** "18 Nov" */
export function shortDay(ymd: string): string {
  const p = parts(ymd);
  return p ? `${p.d} ${MON[p.m - 1]}` : ymd;
}

export const km = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} km`;
export const odo = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');

export function daysWaitingText(days: number): string {
  if (!(days > 0)) return 'Since today';
  return days === 1 ? '1 day waiting' : `${days} days waiting`;
}

/** Open = not closed with a note. Only open checks block the lock. */
export function openPossibleFills(list: PossibleFillCheck[]): PossibleFillCheck[] {
  return list.filter((p) => !p.closed);
}

/** "Closed by Deeki T, Sun 22 Nov: Long trip to Negril…" */
export function closedLine(check: PossibleFillCheck, actorNames: Record<string, string>): string {
  const c = check.closed;
  if (!c) return '';
  const who = (c.actorId && actorNames[c.actorId]) || '';
  const when = c.at ? dayLabel(fleetYmd(c.at)) : '';
  const head = ['Closed', who ? `by ${who}` : ''].filter(Boolean).join(' ');
  return `${head}${when ? `, ${when}` : ''}: ${c.note || ''}`.trim();
}

/** An ISO time as the fleet's day (America/Jamaica, UTC−5, no daylight saving). */
export function fleetYmd(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso || '').slice(0, 10);
  return new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- stretch chart

export type StretchBar = { key: string; label: string; km: number; flagged: boolean; heightPct: number };

/** One bar per fill-to-fill stretch that ends in the week; the flagged one is marked. */
export function stretchBars(stretches: WeekStretch[], vehicleId: string): { bars: StretchBar[]; averageKm: number | null } {
  const mine = stretches
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate));
  if (!mine.length) return { bars: [], averageKm: null };
  const max = Math.max(...mine.map((s) => s.km));
  const avg = mine.reduce((s, x) => s + x.km, 0) / mine.length;
  return {
    averageKm: Math.round(avg),
    bars: mine.map((s, i) => ({
      key: `${s.startDate}-${s.endDate}-${i}`,
      label: dayLabel(s.endDate).split(' ')[0],
      km: s.km,
      flagged: s.flagged,
      heightPct: max > 0 ? Math.max(8, Math.round((s.km / max) * 100)) : 8,
    })),
  };
}

// ---------------------------------------------------------------- car economy

export type EconomyChip = { text: 'Check' | 'Normal' | 'Watch' | 'Flagged'; tone: 'amber' | 'green' | 'orange' | 'red' };

/** Better by 15% or more → Check (a fill may be missing); worse → the KmLTracking bands. */
export function economyChip(row: EconomyWeekRow): EconomyChip | null {
  if (row.kmPerLiter == null || row.pctVsUsual == null || row.band == null) return null;
  if (row.pctVsUsual >= ECONOMY_CHECK_BETTER_PCT) return { text: 'Check', tone: 'amber' };
  if (row.band === 'flagged') return { text: 'Flagged', tone: 'red' };
  if (row.band === 'watch') return { text: 'Watch', tone: 'orange' };
  return { text: 'Normal', tone: 'green' };
}

/** "+14%", "-3%", "same" */
export function diffText(pct: number | null): string {
  if (pct == null) return '—';
  const r = Math.round(pct);
  if (r === 0) return 'same';
  return r > 0 ? `+${r}%` : `${r}%`;
}

export const kmL = (n: number | null | undefined) => (n == null || !(n > 0) ? '—' : (Math.round(n * 10) / 10).toFixed(1));

/** True when the car has fewer than two weeks with a km per litre (empty state). */
export function economyNeedsMoreWeeks(rows: EconomyWeekRow[]): boolean {
  return rows.filter((r) => r.kmPerLiter != null && r.kmPerLiter > 0).length < 2;
}

// ---------------------------------------------------------------- add a missed fill

export type PaidWith = 'gas_card' | 'cash';

export type MissedFillDraft = {
  date: string;
  amount: string;
  liters: string;
  odometer: string;
  paidWith: PaidWith;
  note: string;
};

export type MissedFillProblems = Partial<Record<'date' | 'amount' | 'liters' | 'odometer' | 'card', string>>;

/**
 * Date inside the stretch, odometer strictly between its two readings. Cash needs the amount and
 * litres (the same rule as the fuel log form). A gas-card fill's amount and litres come from the
 * card statement, so they are not typed here — typing them would count the fill twice (F-07).
 */
export function checkMissedFill(
  draft: MissedFillDraft,
  stretch: Pick<PossibleFillCheck, 'startDate' | 'endDate' | 'startOdometer' | 'endOdometer'>,
  opts: { hasGasCard: boolean },
): MissedFillProblems {
  const out: MissedFillProblems = {};
  const d = String(draft.date || '').slice(0, 10);
  if (!d) out.date = 'Pick the date';
  else if (d < stretch.startDate || d > stretch.endDate) {
    out.date = `Must be between ${shortDay(stretch.startDate)} and ${shortDay(stretch.endDate)}`;
  }
  const o = Number(String(draft.odometer).replace(/,/g, ''));
  if (!(o > 0)) out.odometer = 'Enter the odometer';
  else if (!(o > stretch.startOdometer && o < stretch.endOdometer)) {
    out.odometer = `Must be between ${odo(stretch.startOdometer)} and ${odo(stretch.endOdometer)} km`;
  }
  if (draft.paidWith === 'cash') {
    if (!(Number(String(draft.amount).replace(/,/g, '')) > 0)) out.amount = 'Enter the amount';
    if (!(Number(draft.liters) > 0)) out.liters = 'Enter the litres';
  } else if (!opts.hasGasCard) {
    out.card = 'This car has no active gas card in Card Inventory';
  }
  return out;
}

export function missedFillReady(problems: MissedFillProblems): boolean {
  return Object.keys(problems).length === 0;
}

/** The fuel entry the existing save takes (same shapes as the fuel log form). */
export function buildMissedFillEntry(input: {
  draft: MissedFillDraft;
  vehicleId: string;
  driverId: string;
  driverName?: string;
  cardId?: string;
  flagId: string;
  actorId?: string | null;
  id?: string;
}): FuelEntry {
  const { draft } = input;
  const date = String(draft.date).slice(0, 10);
  const time = '12:00:00';
  const odometer = Number(String(draft.odometer).replace(/,/g, ''));
  const note = draft.note.trim();
  const tag = { addedFrom: 'fuel_checks_missed_fill', missedFillFlagId: input.flagId, ...(note ? { missedFillNote: note } : {}) };
  if (draft.paidWith === 'gas_card') {
    const e = buildGasCardOdometerAnchor({
      id: input.id,
      date: `${date}T${time}`,
      time,
      cardId: String(input.cardId || ''),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      odometer,
      entrySource: 'admin-manual',
      odometerMethod: 'Direct Entry',
      driverName: input.driverName,
    });
    return { ...e, notes: note || undefined, metadata: { ...(e.metadata || {}), ...tag } } as FuelEntry;
  }
  const amount = Number(String(draft.amount).replace(/,/g, ''));
  const liters = Number(draft.liters);
  const pricePerLiter = liters > 0 ? Math.round((amount / liters) * 100) / 100 : 0;
  return {
    id: input.id || crypto.randomUUID(),
    date: `${date}T${time}`,
    time,
    type: 'Fuel_Manual_Entry',
    amount,
    liters,
    pricePerLiter,
    odometer,
    location: '',
    stationAddress: '',
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    paymentSource: 'RideShare_Cash',
    entrySource: 'admin-manual',
    notes: note || undefined,
    metadata: {
      ...stampAdminKnownFillCashMeta({}, input.actorId),
      pricePerLiter,
      source: 'Fuel Log',
      portal_type: 'Manual_Entry',
      isManual: true,
      paymentSource: 'rideshare_cash',
      odometerMethod: 'Direct Entry',
      driverName: input.driverName,
      ...tag,
    },
  } as unknown as FuelEntry;
}
