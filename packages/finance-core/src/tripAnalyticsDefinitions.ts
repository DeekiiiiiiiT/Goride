/**
 * Operational trip analytics rules. Not a ledger.
 * Settlement, cash signs, and finance engines must not import this module.
 *
 * Edge re-exports this file (one copy). SQL in the trip_facts migration
 * must keep the same cancel codes, Jamaica timezone, and prior-period rule.
 */

export const TRIP_ANALYTICS_TZ = 'America/Jamaica';

/** Marker the drift test and the SQL migration both carry. */
export const TRIP_ANALYTICS_RULES_V1 = 'trip-analytics-rules-v1';

export const CANCEL_REASON_CODES = [
  'rider_cancelled',
  'driver_cancelled',
  'delivery_failed',
  'other',
  'wait_too_long',
  'unknown',
  'unmatched',
  'timeout',
] as const;

export const TRIP_ANALYTICS_FILTER_KEYS = [
  'startDate',
  'endDate',
  'platforms',
  'platform',
  'serviceLine',
  'driverIds',
  'driverId',
  'vehicleIds',
  'vehicleId',
  'status',
  'paymentMethod',
  'zone',
  'isManual',
  'hour',
  'dow',
  'minEarnings',
  'maxEarnings',
  'minDistance',
  'hasTip',
  'hasSurge',
  'population',
  'anchorPeriodId',
  'cursorDate',
  'cursorId',
  'compare',
] as const;

export type StatusBucket = 'completed' | 'cancelled' | 'in_progress';
export type CancelActor = 'rider' | 'driver' | 'delivery' | 'system' | 'unknown';
export type AnalyticsPopulation = 'rideshare' | 'delivery';

const WEEKDAY_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function statusBucket(status: string | null | undefined): StatusBucket {
  const raw = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'completed') return 'completed';
  if (raw === 'cancelled' || raw === 'canceled') return 'cancelled';
  if (raw === 'processing' || raw === 'in_progress' || raw === 'started') return 'in_progress';
  return 'in_progress';
}

export function normalizeAnalyticsPlatform(platform: string | null | undefined): string {
  const raw = String(platform || '').trim();
  const key = raw.toLowerCase().replace(/\s+/g, '');
  if (key === 'uber') return 'Uber';
  if (key === 'indrive' || key === 'indrive') return 'InDrive';
  if (key === 'roam' || key === 'goride') return 'Roam';
  if (key === 'roamrush') return 'Roam Rush';
  return raw || 'Unknown';
}

/** Absolute cash for analytics only. Does not change the stored sign. */
export function cashCollectedAbs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

export function normalizeCancel(input: {
  status?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  uberTripStatus?: string | null;
}): { actor: CancelActor; reason: string } | null {
  if (statusBucket(input.status) !== 'cancelled') return null;
  const reason = String(input.cancellationReason || '').trim().toLowerCase();
  const by = String(input.cancelledBy || '').trim().toLowerCase();
  const uber = String(input.uberTripStatus || '').trim().toLowerCase();
  const token = reason || uber;

  if (token === 'rider_cancelled') return { actor: 'rider', reason: 'rider_cancelled' };
  if (token === 'driver_cancelled') return { actor: 'driver', reason: 'driver_cancelled' };
  if (token === 'delivery_failed') return { actor: 'delivery', reason: 'delivery_failed' };
  if (token === 'other (driver)' || by === 'driver') return { actor: 'driver', reason: 'other' };
  if (token === 'other (rider)' || by === 'rider') return { actor: 'rider', reason: 'other' };
  if (token === 'wait time too long') {
    if (by === 'driver') return { actor: 'driver', reason: 'wait_too_long' };
    if (by === 'rider') return { actor: 'rider', reason: 'wait_too_long' };
    return { actor: 'unknown', reason: 'wait_too_long' };
  }
  if (by === 'system') return { actor: 'system', reason: token === 'timeout' ? 'timeout' : 'unmatched' };
  if (!token) return { actor: 'unknown', reason: 'unknown' };
  return { actor: 'unknown', reason: 'other' };
}

export function analyticsPopulation(input: {
  serviceLine?: string | null;
  serviceCategory?: string | null;
  cancelReason?: string | null;
}): AnalyticsPopulation {
  const line = String(input.serviceLine || '').toLowerCase();
  const category = String(input.serviceCategory || '').toLowerCase();
  if (line === 'rush_delivery' || category === 'courier' || input.cancelReason === 'delivery_failed') {
    return 'delivery';
  }
  return 'rideshare';
}

function jamaicaParts(iso: string): { date: string; hour: number; dow: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TRIP_ANALYTICS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const weekday = get('weekday');
  if (!year || !month || !day || hour == null || !weekday) return null;
  const dow = WEEKDAY_ISO[weekday.slice(0, 3)];
  if (!dow) return null;
  return { date: `${year}-${month}-${day}`, hour: Number(hour), dow };
}

/** Trip day/hour in America/Jamaica. Missing request time falls back to noon on `date` and is time-unknown. */
export function tripLocalParts(
  requestTime: string | null | undefined,
  dateFallback: string | null | undefined,
): { localDate: string | null; localHour: number | null; localDow: number | null; timeUnknown: boolean } {
  const request = String(requestTime || '').trim();
  if (request) {
    const parts = jamaicaParts(request);
    if (parts) {
      return { localDate: parts.date, localHour: parts.hour, localDow: parts.dow, timeUnknown: false };
    }
  }
  const day = String(dateFallback || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { localDate: day, localHour: null, localDow: null, timeUnknown: true };
  }
  return { localDate: null, localHour: null, localDow: null, timeUnknown: true };
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function addDays(value: string, days: number): string {
  const p = parseYmd(value);
  if (!p) return value;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Same-length window ending the day before start.
 * A range that starts on the 1st and stays inside that month uses the same days last month.
 */
export function priorPeriod(start: string, end: string): { start: string; end: string } | null {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (!a || !b || end < start) return null;
  if (a.d === 1 && a.y === b.y && a.m === b.m) {
    const prevMonth = a.m === 1 ? 12 : a.m - 1;
    const prevYear = a.m === 1 ? a.y - 1 : a.y;
    const last = daysInMonth(prevYear, prevMonth);
    return {
      start: ymd(prevYear, prevMonth, 1),
      end: ymd(prevYear, prevMonth, Math.min(b.d, last)),
    };
  }
  const len = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const priorEnd = addDays(start, -1);
  return { start: addDays(priorEnd, -(len - 1)), end: priorEnd };
}

export function percentDelta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export type TripAnalyticsFilter = {
  startDate?: string | null;
  endDate?: string | null;
  platforms?: string[];
  platform?: string | null;
  serviceLine?: string | null;
  driverIds?: string[];
  driverId?: string | null;
  vehicleIds?: string[];
  vehicleId?: string | null;
  status?: string | null;
  paymentMethod?: string | null;
  zone?: string | null;
  isManual?: boolean | null;
  hour?: number | null;
  dow?: number | null;
  minEarnings?: number | null;
  maxEarnings?: number | null;
  minDistance?: number | null;
  hasTip?: boolean | null;
  hasSurge?: boolean | null;
  population?: 'rideshare' | 'delivery' | 'all' | null;
  anchorPeriodId?: string | null;
  cursorDate?: string | null;
  cursorId?: string | null;
  compare?: boolean;
};

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

/** One filter object for search, export, stats, and analytics. */
export function buildTripAnalyticsFilter(input: Record<string, unknown> | null | undefined): TripAnalyticsFilter {
  const src = input || {};
  const platforms = Array.isArray(src.platforms)
    ? src.platforms.map((p) => normalizeAnalyticsPlatform(String(p))).filter(Boolean)
    : undefined;
  let platform = src.platform != null && src.platform !== '' && src.platform !== 'all'
    ? normalizeAnalyticsPlatform(String(src.platform))
    : null;
  if (platform === 'Unknown') platform = null;

  const driverIds = Array.isArray(src.driverIds)
    ? src.driverIds.map((id) => String(id)).filter(Boolean)
    : undefined;

  let status = src.status != null && src.status !== '' && src.status !== 'all' ? String(src.status) : null;
  let startDate = src.startDate != null && src.startDate !== '' ? String(src.startDate).slice(0, 10) : null;
  let endDate = src.endDate != null && src.endDate !== '' ? String(src.endDate).slice(0, 10) : null;
  if (status === 'Processing') {
    startDate = null;
    endDate = null;
    status = 'in_progress';
  } else if (status === 'Completed') status = 'completed';
  else if (status === 'Cancelled') status = 'cancelled';

  const tripType = src.tripType != null ? String(src.tripType) : '';
  let isManual = boolOrNull(src.isManual);
  if (tripType === 'manual') isManual = true;
  if (tripType === 'platform') isManual = false;

  const payRaw = src.paymentMethod != null ? String(src.paymentMethod).toLowerCase() : '';
  const paymentMethod = payRaw === 'cash' || payRaw === 'digital' ? payRaw : null;

  const hasTipRaw = src.hasTip;
  const hasSurgeRaw = src.hasSurge;

  return {
    startDate,
    endDate,
    platforms,
    platform,
    serviceLine: src.serviceLine != null && src.serviceLine !== '' && src.serviceLine !== 'all'
      ? String(src.serviceLine)
      : null,
    driverIds,
    driverId: src.driverId != null && src.driverId !== '' && src.driverId !== 'all' ? String(src.driverId) : null,
    vehicleIds: Array.isArray(src.vehicleIds) ? src.vehicleIds.map(String).filter(Boolean) : undefined,
    vehicleId: src.vehicleId != null && src.vehicleId !== '' && src.vehicleId !== 'all' ? String(src.vehicleId) : null,
    status,
    paymentMethod,
    zone: src.zone != null && src.zone !== '' && src.zone !== 'all' ? String(src.zone) : null,
    isManual,
    hour: numOrNull(src.hour),
    dow: numOrNull(src.dow),
    minEarnings: numOrNull(src.minEarnings),
    maxEarnings: numOrNull(src.maxEarnings),
    minDistance: numOrNull(src.minDistance),
    hasTip: hasTipRaw === 'yes' || hasTipRaw === true ? true : hasTipRaw === 'no' ? false : boolOrNull(hasTipRaw),
    hasSurge: hasSurgeRaw === 'yes' || hasSurgeRaw === true ? true : hasSurgeRaw === 'no' ? false : boolOrNull(hasSurgeRaw),
    population: src.population === 'delivery' || src.population === 'all' || src.population === 'rideshare'
      ? src.population
      : 'rideshare',
    anchorPeriodId: src.anchorPeriodId != null && src.anchorPeriodId !== '' ? String(src.anchorPeriodId) : null,
    cursorDate: src.cursorDate != null && src.cursorDate !== '' ? String(src.cursorDate).slice(0, 10) : null,
    cursorId: src.cursorId != null && src.cursorId !== '' ? String(src.cursorId) : null,
    compare: src.compare !== false && src.compare !== '0' && src.cmp !== '0',
  };
}

/** Higher cancellation rate is bad. Other KPI deltas treat an increase as good. */
export function deltaIsBad(kpi: 'cancellationRate' | string): boolean {
  return kpi === 'cancellationRate';
}
