import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

export type ScheduledJobStatus = 'confirmed' | 'pending';

export type HaulScheduledJob = {
  id: string;
  orderRef: string;
  status: ScheduledJobStatus;
  scheduledAt: string;
  arriveBy?: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupName?: string;
  dropoffName?: string;
  pickupDetail?: string;
  dropoffDetail?: string;
  itemsLabel: string;
  itemsIcon: string;
  earningsMinor: number;
  currency: string;
  manifest?: {
    totalLbs: number;
    items: { icon: string; name: string; qty: string; weight: string }[];
  };
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Demo jobs anchored to the current week when no live scheduled rides exist. */
export function buildDemoScheduledJobs(): HaulScheduledJob[] {
  const today = startOfDay(new Date());
  const mon = addDays(today, -((today.getDay() + 6) % 7));

  const at = (dayOffset: number, hour: number, minute: number) => {
    const d = addDays(mon, dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'demo-sched-1',
      orderRef: 'TRK-8829',
      status: 'confirmed',
      scheduledAt: at(0, 9, 0),
      arriveBy: '14:00 PST',
      pickupName: 'Apex Distribution Center',
      pickupDetail: 'Dock 42, 1990 Industrial Pkwy',
      pickupAddress: '123 Port St, Industrial District',
      dropoffName: 'Metro Retail Hub',
      dropoffDetail: 'Receiving Bay B, 882 Central Ave',
      dropoffAddress: '456 Industrial Way, North Sector',
      itemsLabel: 'Items: 3 (Large Furniture)',
      itemsIcon: 'inventory_2',
      earningsMinor: 920_000,
      currency: 'JMD',
      manifest: {
        totalLbs: 2450,
        items: [
          { icon: 'weekend', name: 'Sectional Sofa', qty: 'Qty: 2', weight: '450 lbs' },
          { icon: 'kitchen', name: 'Commercial Fridge', qty: 'Qty: 1', weight: '800 lbs' },
          {
            icon: 'inventory_2',
            name: 'Misc Office Furniture',
            qty: 'Qty: 14 boxes',
            weight: '1200 lbs',
          },
        ],
      },
    },
    {
      id: 'demo-sched-2',
      orderRef: 'TRK-8830',
      status: 'pending',
      scheduledAt: at(0, 14, 30),
      pickupAddress: '789 Warehouse Blvd, East Gates',
      dropoffAddress: '101 Retail Ave, Central Plaza',
      itemsLabel: 'Items: 12 (Palletized Goods)',
      itemsIcon: 'pallet',
      earningsMinor: 1_450_000,
      currency: 'JMD',
    },
  ];
}

export function scheduledJobFromTrip(trip: RideRequestRow): HaulScheduledJob {
  const manifest = trip.haulage_manifest;
  const lineCount = manifest?.lines?.length ?? 0;
  const summary = manifest?.summary?.trim();
  const itemsLabel =
    lineCount > 0
      ? `Items: ${lineCount}${summary ? ` (${summary})` : ''}`
      : summary || 'Freight load';

  return {
    id: trip.id,
    orderRef: trip.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    status: trip.status === 'scheduled' ? 'confirmed' : 'pending',
    scheduledAt: trip.scheduled_pickup_at ?? trip.created_at,
    pickupAddress: trip.pickup_address ?? 'Pickup pending',
    dropoffAddress: trip.dropoff_address ?? 'Dropoff pending',
    itemsLabel,
    itemsIcon: 'inventory_2',
    earningsMinor: trip.fare_estimate_minor ?? 0,
    currency: trip.currency ?? 'JMD',
  };
}

export function formatScheduledDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatScheduledEarnings(job: HaulScheduledJob): string {
  return formatMoneyMinor(job.earningsMinor, job.currency);
}

export function countdownToStart(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return 'Starting soon';
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function jobsForDate(jobs: HaulScheduledJob[], date: Date): HaulScheduledJob[] {
  const day = startOfDay(date).getTime();
  return jobs.filter((j) => startOfDay(new Date(j.scheduledAt)).getTime() === day);
}

export function datesWithJobs(jobs: HaulScheduledJob[]): Set<number> {
  const set = new Set<number>();
  for (const j of jobs) {
    set.add(startOfDay(new Date(j.scheduledAt)).getTime());
  }
  return set;
}
