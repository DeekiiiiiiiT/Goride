import type { DriverCarKitPayload } from '../../services/driverInventoryApi';

export function carKitVehicleLabel(kit: DriverCarKitPayload | null | undefined): string {
  const plate = kit?.vehicleLabel?.trim();
  if (!plate) return 'No vehicle assigned';
  const makeModel = kit?.vehicleMakeModel?.trim();
  if (makeModel && makeModel !== plate) {
    return `${makeModel} · ${plate}`;
  }
  return plate;
}

export function carKitPlateOnly(kit: DriverCarKitPayload | null | undefined): string {
  return kit?.vehicleLabel?.trim() || '—';
}

export function carKitItemCounts(kit: DriverCarKitPayload | null | undefined): {
  present: number;
  total: number;
  missing: number;
  reported: number;
} {
  const items = kit?.items ?? [];
  const total = items.length;
  const present = items.filter((i) => i.status === 'present' || i.status === 'linked').length;
  const reported = items.filter((i) => i.status === 'reported').length;
  const missing = items.filter((i) => i.status === 'missing').length;
  return { present, total, missing, reported };
}

export function carKitProgressOffset(present: number, total: number, radius = 30): number {
  const circumference = 2 * Math.PI * radius;
  if (total <= 0) return circumference;
  return circumference * (1 - present / total);
}

export function carKitSummaryTitle(kit: DriverCarKitPayload | null | undefined): string {
  const { present, total, missing, reported } = carKitItemCounts(kit);
  if (total <= 0) return 'Kit loading';
  if (present === total) return 'Ready for the road';
  if (missing + reported > 0) return 'Items need attention';
  return 'Kit check';
}

export function formatReportedDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-JM', { day: 'numeric', month: 'short' });
}

export function formatSyncedAt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-JM', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function humanizeIssue(issue?: string | null): string {
  if (!issue) return 'Reported';
  const s = issue.toLowerCase();
  if (s === 'missing') return 'Missing';
  if (s === 'damaged') return 'Damaged';
  if (s === 'not_working') return 'Not working';
  return issue.charAt(0).toUpperCase() + issue.slice(1);
}

export function fleetPhoneTel(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:${digits}` : null;
}
