/** Stamped on every new snapshot and inside the input hash. Locked weeks stay on the old engine. */
export const FUEL_ENGINE_VERSION = 'fuel-chain-v2.1';

export type ShadowDriverDrift = {
  driverId: string;
  vehicleId: string;
  oldDriverShare: number;
  newDriverShare: number;
  delta: number;
  oldCompanyShare: number;
  newCompanyShare: number;
  categoryMoved: string;
};

function num(v: unknown): number {
  return Number(v) || 0;
}

function biggestMove(oldRow: Record<string, unknown>, newRow: Record<string, unknown>): string {
  const keys = [
    ['rideShareCost', 'rideshare'],
    ['deadheadCost', 'reposition'],
    ['personalUsageCost', 'personal'],
    ['commuteCost', 'commute'],
    ['windowTimingCost', 'timing'],
    ['miscellaneousCost', 'variance'],
    ['unattributedFillCost', 'no-odometer'],
    ['unattributedKmCost', 'unattributed'],
  ] as const;
  let best = 'unchanged';
  let bestAbs = 0;
  for (const [key, label] of keys) {
    const d = Math.abs(num(newRow[key]) - num(oldRow[key]));
    if (d > bestAbs) {
      bestAbs = d;
      best = label;
    }
  }
  return best;
}

/** Old snapshot vs the new engine. Does not lock anything. */
export function fuelShadowDrift(
  oldReports: Array<Record<string, unknown>>,
  newReports: Array<Record<string, unknown>>,
): ShadowDriverDrift[] {
  const oldBy = new Map(oldReports.map((r) => [`${r.driverId}:${r.vehicleId}`, r]));
  const ids = new Set<string>([
    ...oldReports.map((r) => `${r.driverId}:${r.vehicleId}`),
    ...newReports.map((r) => `${r.driverId}:${r.vehicleId}`),
  ]);
  const newBy = new Map(newReports.map((r) => [`${r.driverId}:${r.vehicleId}`, r]));
  const out: ShadowDriverDrift[] = [];
  for (const id of ids) {
    const oldRow = oldBy.get(id) || {};
    const newRow = newBy.get(id) || {};
    const oldDriver = num(oldRow.driverShare);
    const newDriver = num(newRow.driverShare);
    out.push({
      driverId: String(newRow.driverId || oldRow.driverId || ''),
      vehicleId: String(newRow.vehicleId || oldRow.vehicleId || ''),
      oldDriverShare: oldDriver,
      newDriverShare: newDriver,
      delta: Math.round((newDriver - oldDriver) * 100) / 100,
      oldCompanyShare: num(oldRow.companyShare),
      newCompanyShare: num(newRow.companyShare),
      categoryMoved: biggestMove(oldRow, newRow),
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
