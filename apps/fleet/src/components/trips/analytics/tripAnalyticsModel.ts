import { format, subDays, startOfMonth, endOfDay } from 'date-fns';
import { percentDelta } from '@roam/finance-core';

export type AnalyticsPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom';
export type HeatMeasure = 'completed' | 'cancelled' | 'surge_share' | 'fare_per_km';

export type TripAnalyticsState = {
  preset: AnalyticsPreset;
  from: string;
  to: string;
  compare: boolean;
  platforms: string[];
  driverId: string;
  vehicleId: string;
  status: string;
  payment: string;
  zone: string;
  tripType: string;
  hour: number | null;
  dow: number | null;
  measure: HeatMeasure;
};

const DAY = 'yyyy-MM-dd';

export function defaultAnalyticsState(today = new Date()): TripAnalyticsState {
  return {
    preset: 'last30',
    from: format(subDays(today, 29), DAY),
    to: format(today, DAY),
    compare: true,
    platforms: [],
    driverId: '',
    vehicleId: '',
    status: '',
    payment: '',
    zone: '',
    tripType: '',
    hour: null,
    dow: null,
    measure: 'completed',
  };
}

export function rangeForPreset(preset: AnalyticsPreset, today = new Date()): { from: string; to: string } | null {
  if (preset === 'custom') return null;
  const to = format(endOfDay(today), DAY);
  if (preset === 'today') return { from: format(today, DAY), to };
  if (preset === 'yesterday') {
    const y = subDays(today, 1);
    return { from: format(y, DAY), to: format(y, DAY) };
  }
  if (preset === 'last7') return { from: format(subDays(today, 6), DAY), to };
  if (preset === 'last30') return { from: format(subDays(today, 29), DAY), to };
  return { from: format(startOfMonth(today), DAY), to };
}

export function readAnalyticsState(): TripAnalyticsState {
  const base = defaultAnalyticsState();
  if (typeof window === 'undefined') return base;
  const q = new URLSearchParams(window.location.search);
  const preset = (q.get('preset') as AnalyticsPreset) || base.preset;
  const ranged = rangeForPreset(preset);
  const hour = q.get('hour');
  const dow = q.get('dow');
  return {
    preset,
    from: q.get('from') || ranged?.from || base.from,
    to: q.get('to') || ranged?.to || base.to,
    compare: q.get('cmp') !== '0',
    platforms: (q.get('platform') || '').split(',').map((s) => s.trim()).filter(Boolean),
    driverId: q.get('driver') || '',
    vehicleId: q.get('vehicle') || '',
    status: q.get('status') || '',
    payment: q.get('pay') || '',
    zone: q.get('zone') || '',
    tripType: q.get('type') || '',
    hour: hour != null && hour !== '' ? Number(hour) : null,
    dow: dow != null && dow !== '' ? Number(dow) : null,
    measure: (q.get('measure') as HeatMeasure) || 'completed',
  };
}

export function writeAnalyticsState(state: TripAnalyticsState) {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams();
  q.set('preset', state.preset);
  q.set('from', state.from);
  q.set('to', state.to);
  q.set('cmp', state.compare ? '1' : '0');
  if (state.platforms.length) q.set('platform', state.platforms.join(','));
  if (state.driverId) q.set('driver', state.driverId);
  if (state.vehicleId) q.set('vehicle', state.vehicleId);
  if (state.status) q.set('status', state.status);
  if (state.payment) q.set('pay', state.payment);
  if (state.zone) q.set('zone', state.zone);
  if (state.tripType) q.set('type', state.tripType);
  if (state.hour != null) q.set('hour', String(state.hour));
  if (state.dow != null) q.set('dow', String(state.dow));
  if (state.measure !== 'completed') q.set('measure', state.measure);
  const next = `${window.location.pathname}?${q.toString()}`;
  window.history.replaceState({ page: 'trip-analytics' }, '', next);
}

export function analyticsFilterBody(state: TripAnalyticsState) {
  return {
    startDate: state.from,
    endDate: state.to,
    compare: state.compare,
    platforms: state.platforms,
    driverId: state.driverId || undefined,
    vehicleId: state.vehicleId || undefined,
    status: state.status || undefined,
    paymentMethod: state.payment || undefined,
    zone: state.zone || undefined,
    tripType: state.tripType || undefined,
    hour: state.hour,
    dow: state.dow,
    population: 'rideshare',
  };
}

export function kpiDelta(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (current == null || prior == null) return null;
  return percentDelta(Number(current), Number(prior));
}

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
