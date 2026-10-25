import { isPriceOutlier } from '../../fuel-core/src/retailPriceEstimate.ts';
import { calculateDistance, type SmartMatchResult } from '../../location/src/stationMatch.ts';

/** Tables a Plug fill must never insert into. */
export const FLEET_MONEY_TABLES = [
  'fleet.fuel_entries',
  'fleet.fuel_cards',
  'fleet.fuel_adjustments',
  'fleet.fuel_disputes',
  'fleet.odometer_readings',
  'public.fuel_reconciliation_period',
  'public.fuel_week_snapshot',
  'public.vehicle_week_distance',
  'ledger.driver_settlement_transactions',
  'ledger.driver_financial_periods',
  'ledger.settlement_movements',
  'ledger.settlement_runs',
  'ledger.settlement_run_rows',
] as const;

export type PlugWriteTable =
  | 'explorer.fuel_log'
  | 'explorer.odometer_reading'
  | 'places.price_observation'
  | 'places.station_evidence'
  | 'fleet.stations';

export type PlugWrite = {
  table: PlugWriteTable;
  /** Learnt stations are platform rows with no fleet company. */
  organizationId?: null;
  originApp: 'roam_plug';
};

export type PlugStationDecision = 'confirm' | 'review' | 'learnt';

export function decidePlugStation(match: Pick<SmartMatchResult, 'confidence' | 'station'>): PlugStationDecision {
  if (match.confidence === 'ambiguous') return 'review';
  if ((match.confidence === 'high' || match.confidence === 'medium') && match.station) {
    if (match.station.status === 'learnt') return 'review';
    return 'confirm';
  }
  return 'learnt';
}

export function plugPriceDecision(paidPerLitre: number, retailEstimate: number): 'publish' | 'hold' {
  if (!(paidPerLitre > 0) || !(retailEstimate > 0)) return 'hold';
  if (paidPerLitre < retailEstimate * 0.5) return 'hold';
  if (isPriceOutlier(paidPerLitre, retailEstimate)) return 'hold';
  return 'publish';
}

export function planPlugFill(input: {
  decision: PlugStationDecision;
  price: 'publish' | 'hold' | 'none';
}): PlugWrite[] {
  const writes: PlugWrite[] = [
    { table: 'explorer.fuel_log', originApp: 'roam_plug' },
    { table: 'explorer.odometer_reading', originApp: 'roam_plug' },
    { table: 'places.station_evidence', originApp: 'roam_plug' },
  ];
  if (input.price === 'publish' || input.price === 'hold') {
    writes.push({ table: 'places.price_observation', originApp: 'roam_plug' });
  }
  if (input.decision === 'learnt') {
    writes.push({ table: 'fleet.stations', organizationId: null, originApp: 'roam_plug' });
  }
  return writes;
}

export function writesTouchFleetMoney(tables: string[]): string[] {
  const banned = new Set<string>(FLEET_MONEY_TABLES);
  return tables.filter((table) => banned.has(table));
}

/** Km per litre from the previous reading. Null until two increasing readings exist. */
export function kmPerLitre(previousKm: number | null, odometer: number, litres: number): number | null {
  if (previousKm == null || !(litres > 0) || !(odometer > previousKm)) return null;
  return (odometer - previousKm) / litres;
}

/**
 * Mileage and next service from real readings.
 * The date moves when a later fill changes the pace. Crossing the km interval is overdue immediately.
 */
export function fillCare(input: {
  readings: { at: string; km: number }[];
  litres: number | null;
  lastServiceOn: string | null;
  lastServiceKm: number | null;
  now: string;
}): { kmPerLitre: number | null; dueOn: string | null; status: CareStatus; pace: number | null } {
  const sorted = [...input.readings].filter((row) => row.km >= 0 && row.at).sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;
  const perLitre = last && input.litres != null ? kmPerLitre(prev?.km ?? null, last.km, input.litres) : null;
  const pace = kmPerDay(sorted);
  const lastKm = last?.km ?? input.lastServiceKm ?? 0;
  const lastDoneOn = input.lastServiceOn || sorted[0]?.at || input.now;
  if (input.lastServiceKm != null && lastKm - input.lastServiceKm >= 5000) {
    return { kmPerLitre: perLitre, dueOn: input.now, status: 'overdue', pace };
  }
  const due = projectServiceDue({
    intervalKm: 5000,
    intervalDays: 180,
    lastKm,
    lastDoneOn,
    kmPerDay: pace,
    now: input.now,
  });
  return { kmPerLitre: perLitre, dueOn: due.dueOn, status: due.status, pace };
}

export function kmPerDay(readings: { at: string; km: number }[]): number | null {
  const sorted = [...readings].filter((r) => r.km >= 0 && r.at).sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.length < 2) return null;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const days = (Date.parse(last.at) - Date.parse(first.at)) / 86_400_000;
  if (!(days > 0) || last.km < first.km) return null;
  return (last.km - first.km) / days;
}

export type CareStatus = 'overdue' | 'due_soon' | 'upcoming' | 'done';

export function projectServiceDue(input: {
  intervalKm?: number | null;
  intervalDays?: number | null;
  lastKm: number;
  lastDoneOn: string;
  kmPerDay: number | null;
  now: string;
}): { dueOn: string | null; status: CareStatus; generalSchedule: boolean } {
  const now = Date.parse(input.now);
  const last = Date.parse(input.lastDoneOn);
  let dueMs: number | null = null;
  if (input.intervalDays && input.intervalDays > 0 && Number.isFinite(last)) {
    dueMs = last + input.intervalDays * 86_400_000;
  }
  if (input.intervalKm && input.intervalKm > 0 && input.kmPerDay && input.kmPerDay > 0 && Number.isFinite(last)) {
    const days = input.intervalKm / input.kmPerDay;
    const byKm = last + days * 86_400_000;
    dueMs = dueMs == null ? byKm : Math.min(dueMs, byKm);
  }
  if (dueMs == null || !Number.isFinite(now)) {
    return { dueOn: null, status: 'upcoming', generalSchedule: true };
  }
  const dueOn = new Date(dueMs).toISOString();
  const daysLeft = (dueMs - now) / 86_400_000;
  const status: CareStatus = daysLeft < 0 ? 'overdue' : daysLeft <= 14 ? 'due_soon' : 'upcoming';
  return { dueOn, status, generalSchedule: false };
}

export type DocState = 'missing' | 'overdue' | 'due_soon' | 'valid';

export function documentStatus(expiry: string | null | undefined, now: string): DocState {
  if (!expiry) return 'missing';
  const days = (Date.parse(expiry) - Date.parse(now)) / 86_400_000;
  if (!Number.isFinite(days)) return 'missing';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due_soon';
  return 'valid';
}

export function suggestReview(input: {
  distinctUsers: number;
  bestAccuracyM: number | null;
  nearbyVerifiedName?: string | null;
}): { label: string; bulkOk: boolean } {
  if (input.nearbyVerifiedName) {
    return { label: `Likely duplicate of ${input.nearbyVerifiedName}`, bulkOk: false };
  }
  const strong = input.distinctUsers >= 3 && input.bestAccuracyM != null && input.bestAccuracyM <= 20;
  if (strong) {
    return {
      label: `Strong — ${input.distinctUsers} people, ${Math.round(input.bestAccuracyM!)} m`,
      bulkOk: true,
    };
  }
  return { label: 'Needs a look', bulkOk: false };
}

export function impossibleTravel(
  a: { lat: number; lng: number; at: string },
  b: { lat: number; lng: number; at: string },
  maxKmh = 150,
): boolean {
  const hours = Math.abs(Date.parse(a.at) - Date.parse(b.at)) / 3_600_000;
  if (!(hours > 0)) return false;
  const km = calculateDistance(a.lat, a.lng, b.lat, b.lng) / 1000;
  return km / hours > maxKmh;
}

export function contributorLevel(approvedPins: number): { name: string; nextAt: number | null } {
  if (approvedPins >= 15) return { name: 'Pathfinder', nextAt: null };
  if (approvedPins >= 5) return { name: 'Guide', nextAt: 15 };
  if (approvedPins >= 1) return { name: 'Mapper', nextAt: 5 };
  return { name: 'Scout', nextAt: 1 };
}

export function priceAgeLabel(updatedAt: string, now: string): string {
  const mins = Math.max(0, Math.round((Date.parse(now) - Date.parse(updatedAt)) / 60_000));
  if (!Number.isFinite(mins)) return 'price age unknown';
  if (mins < 60) return `updated ${mins} m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `updated ${hours} h ago`;
  return `updated ${Math.round(hours / 24)} d ago`;
}

export const PLUG_FLAGS = [
  'plug.explore',
  'plug.fuel_log',
  'plug.garage',
  'plug.parts',
  'plug.map_it',
  'plug.tolls',
  'plug.documents',
] as const;

export type PlugFlag = (typeof PLUG_FLAGS)[number];

export function sectionEnabled(flag: PlugFlag, globalOn: boolean, allowlisted: boolean): boolean {
  return globalOn || allowlisted;
}

/** A Plug account is granted only for a brand-new Google sign-up that Plug itself started. */
export type JoinFacts = {
  role: string;
  createdAt: string;
  now: string;
  providers: string[];
  ticketIssuedAt: string | null;
};

const JOIN_WINDOW_MS = 15 * 60 * 1000;

export function joinDecision(facts: JoinFacts): 'grant' | 'refuse' {
  if (facts.role.trim()) return 'refuse';
  const providers = facts.providers.map((provider) => provider.trim().toLowerCase()).filter(Boolean);
  if (providers.length !== 1 || providers[0] !== 'google') return 'refuse';
  const now = Date.parse(facts.now);
  const created = Date.parse(facts.createdAt);
  const issued = facts.ticketIssuedAt ? Date.parse(facts.ticketIssuedAt) : Number.NaN;
  if (!Number.isFinite(now) || !Number.isFinite(created) || !Number.isFinite(issued)) return 'refuse';
  if (created > now || now - created > JOIN_WINDOW_MS) return 'refuse';
  if (issued > now + 5000 || now - issued > JOIN_WINDOW_MS) return 'refuse';
  if (issued > created + 5000) return 'refuse';
  return 'grant';
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signJoinTicket(issuedAt: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`plug-join:${issuedAt}`));
  return `${issuedAt}.${hex(sig)}`;
}

export async function readJoinTicket(token: string, pepper: string, now: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const issuedAt = token.slice(0, dot);
  const expected = await signJoinTicket(issuedAt, pepper);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff !== 0) return null;
  const issued = Date.parse(issuedAt);
  const at = Date.parse(now);
  if (!Number.isFinite(issued) || !Number.isFinite(at)) return null;
  if (at - issued > JOIN_WINDOW_MS || issued > at + 5000) return null;
  return issuedAt;
}

export async function hashExplorerUser(userId: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${userId}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
