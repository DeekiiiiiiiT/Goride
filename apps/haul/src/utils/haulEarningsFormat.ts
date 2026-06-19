import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

export type HaulEarningsPeriod = 'today' | 'week' | 'month';

export function periodToApi(period: HaulEarningsPeriod): 'today' | 'week' | 'all' {
  if (period === 'today') return 'today';
  if (period === 'week') return 'week';
  return 'all';
}

function tripDate(ride: RideRequestRow): Date | null {
  const raw = ride.completed_at ?? ride.updated_at ?? ride.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function filterTripsByPeriod(trips: RideRequestRow[], period: HaulEarningsPeriod): RideRequestRow[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return trips.filter((ride) => {
    const d = tripDate(ride);
    if (!d) return false;
    if (period === 'today') return d >= startOfToday;
    if (period === 'week') {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= monthStart;
  });
}

export function shortPlace(address: string | null | undefined): string {
  const trimmed = address?.trim();
  if (!trimmed) return '—';
  return trimmed.split(',')[0]?.trim() || trimmed;
}

export function placeCode(address: string | null | undefined): string {
  const line = shortPlace(address);
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return line.slice(0, 3).toUpperCase();
}

export function formatTripTime(ride: RideRequestRow): string {
  const d = tripDate(ride);
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatTripDateTime(ride: RideRequestRow): string {
  const d = tripDate(ride);
  if (!d) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function tripFare(ride: RideRequestRow): string {
  const currency = ride.currency ?? 'JMD';
  const minor = ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0;
  return formatMoneyMinor(minor, currency);
}

export function manifestItemCount(ride: RideRequestRow): number {
  const lines = ride.haulage_manifest?.lines;
  if (!lines?.length) return 0;
  return lines.reduce((sum, l) => sum + (l.qty || 1), 0);
}

export function manifestSummary(ride: RideRequestRow): string {
  const manifest = ride.haulage_manifest;
  if (!manifest) return 'Freight load';
  if (manifest.manifest_summary?.trim()) return manifest.manifest_summary.trim();
  const count = manifestItemCount(ride);
  return count > 0 ? `${count} item${count === 1 ? '' : 's'}` : 'Freight load';
}

export function formatOnlineDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
