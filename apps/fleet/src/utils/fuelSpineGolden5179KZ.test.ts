/**
 * Golden fixture: 5179KZ (Roomy) Jun 15–21 2026 fills from live DB snapshot.
 * Pins cycle-health spine: top-up variance must NOT force Anomaly buckets;
 * cycles form from soft/hard anchors; week health is not Amber solely from ±20% variance.
 */
import { describe, expect, it } from 'vitest';
import { calculateFuelCycles } from './fuelCycleEngine';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { FuelEntry } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import { classifyFuelWeek } from './fuelBrainClassify';

const vehicle: Vehicle = {
  id: '5179KZ',
  licensePlate: '5179KZ',
  specifications: { tankCapacity: 36 },
  fuelSettings: { tankCapacity: 36, efficiencyCity: 7.3 },
} as Vehicle;

/** Chronological fills for the statement week (liters + round-dollar top-ups). */
const weekFills: Array<{ date: string; odometer: number; liters: number; amount: number }> = [
  { date: '2026-06-15T07:43:00', odometer: 162460, liters: 9.55, amount: 2000 },
  { date: '2026-06-15T13:23:00', odometer: 162591, liters: 4.24, amount: 1000 },
  { date: '2026-06-16T06:24:00', odometer: 162713, liters: 9.43, amount: 2000 },
  { date: '2026-06-16T09:31:00', odometer: 162781, liters: 7.16, amount: 1500 },
  { date: '2026-06-17T05:52:00', odometer: 162880, liters: 9.48, amount: 2000 },
  { date: '2026-06-17T12:03:00', odometer: 163009, liters: 4.24, amount: 1000 },
  { date: '2026-06-17T15:10:00', odometer: 163076, liters: 8.94, amount: 2000 },
  { date: '2026-06-18T07:23:00', odometer: 163162, liters: 9.55, amount: 2000 },
  { date: '2026-06-18T12:50:00', odometer: 163287, liters: 9.55, amount: 2000 },
  { date: '2026-06-19T06:02:00', odometer: 163377, liters: 9.48, amount: 2000 },
  { date: '2026-06-19T11:00:00', odometer: 163472, liters: 4.38, amount: 1000 },
  { date: '2026-06-19T13:26:00', odometer: 163526, liters: 9.55, amount: 2000 },
  { date: '2026-06-20T10:10:00', odometer: 163679, liters: 7.29, amount: 1500 },
  { date: '2026-06-20T15:28:00', odometer: 163780, liters: 9.4, amount: 2000 },
  { date: '2026-06-21T10:03:00', odometer: 163924, liters: 9.46, amount: 2000 },
];

function toEntries(): FuelEntry[] {
  return weekFills.map((f, i) => ({
    id: `fe-5179-${i}`,
    vehicleId: '5179KZ',
    date: f.date,
    liters: f.liters,
    amount: f.amount,
    odometer: f.odometer,
    type: 'Card_Transaction',
    paymentSource: 'Gas_Card',
    metadata: {},
  })) as FuelEntry[];
}

describe('5179KZ Jun 15–21 golden spine', () => {
  it('forms closed tank cycles via soft-cap (not one cycle per top-up)', () => {
    const cycles = calculateFuelCycles(toEntries(), [vehicle]);
    const closed = cycles.filter((c) => c.status === 'Complete' || c.status === 'Anomaly');
    // Top-ups accumulate into a few tank cycles; must be far fewer than fill count
    expect(closed.length).toBeGreaterThanOrEqual(2);
    expect(closed.length).toBeLessThan(weekFills.length);
    expect(closed.every((c) => c.status !== 'Anomaly')).toBe(true);
  });

  it('stop-to-stop does not Anomaly on ±20% fuel variance alone', () => {
    const buckets = FuelCalculationService.calculateOdometerBuckets(vehicle, toEntries(), [], []);
    const varianceOnlyFlags = buckets.filter(
      (b) =>
        b.status === 'Anomaly' &&
        Math.abs(b.variancePercent) > 20 &&
        b.unaccountedDistance <= (b.endOdometer - b.startOdometer) * 0.1,
    );
    // Option C residual zeros GAP; overflow unlikely — variance must not flag
    expect(varianceOnlyFlags.length).toBe(0);
  });

  it('week recon health is not Amber solely from top-up variance', () => {
    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      new Date('2026-06-15'),
      new Date('2026-06-21'),
      [],
      toEntries(),
      [],
      [],
    );
    // With cycle health + no critical integrity, expect Emerald (or Amber only for soft-eff / fallbacks)
    const varianceAnomalies =
      report.odometerBuckets?.filter((b) => b.status === 'Anomaly').length ?? 0;
    expect(varianceAnomalies).toBe(0);
    expect(report.healthStatus).not.toBe('Red');
    // Must not be Amber purely because many buckets had high variance (legacy behavior)
    if (report.metadata?.cycleHealth?.mode === 'cycles') {
      expect(['Emerald', 'Amber']).toContain(report.healthStatus);
    }
  });

  it('Fuel Brain stays km-only (no tank integrity fields)', () => {
    const brain = classifyFuelWeek({
      totalOdometerKm: 1464,
      tripRideshareKm: 1000,
      companyOpsKm: 0,
      deadheadHintKm: 50,
    });
    expect(brain.method).toBe('fuel_brain_v2');
    expect(brain.personalKm).toBe(414);
    expect(brain.deadheadKm).toBe(50);
    expect(brain).not.toHaveProperty('isSoftAnchor');
    expect(brain).not.toHaveProperty('tankCapacity');
  });

  it('prefers persisted metadata.cycleId on closed cycles', () => {
    const cycleUuid = '22222222-2222-4222-8222-222222222222';
    const entries = toEntries();
    // First fill = hard open (engine needs a prior anchor before it can close a cycle)
    entries[0].metadata = {
      isFullTank: true,
      isAnchor: true,
      isHardAnchor: true,
      cycleId: '11111111-1111-4111-8111-111111111111',
    };
    // Soft-close the next tank with a stable UUID on the closer
    let cum = 0;
    const cap = 36;
    for (let i = 1; i < entries.length; i++) {
      const e = entries[i];
      const prev = cum;
      cum += e.liters || 0;
      if (cum >= cap * 0.98) {
        e.metadata = {
          isSoftAnchor: true,
          isAnchor: true,
          cycleId: cycleUuid,
          volumeContributed: Math.max(0, cap - prev),
          excessVolume: Math.max(0, (e.liters || 0) - Math.max(0, cap - prev)),
        };
        break;
      }
      e.metadata = { cycleId: cycleUuid };
    }
    const closed = calculateFuelCycles(entries, [vehicle]).filter(
      (c) => c.status === 'Complete' || c.status === 'Anomaly',
    );
    expect(closed.some((c) => c.id === cycleUuid)).toBe(true);
  });
});
