import type { DriverCarKitPayload } from '../../services/driverInventoryApi';

export function carKitVehicleLabel(kit: DriverCarKitPayload | null | undefined): string {
  const label = kit?.vehicleLabel?.trim();
  return label || 'No vehicle assigned';
}

export function carKitItemCounts(kit: DriverCarKitPayload | null | undefined): {
  present: number;
  total: number;
} {
  const items = kit?.items ?? [];
  const total = items.length;
  const present = items.filter(
    (i) => i.status === 'present' || i.status === 'linked',
  ).length;
  return { present, total };
}

export function carKitProgressOffset(present: number, total: number, radius = 30): number {
  const circumference = 2 * Math.PI * radius;
  if (total <= 0) return circumference;
  return circumference * (1 - present / total);
}
