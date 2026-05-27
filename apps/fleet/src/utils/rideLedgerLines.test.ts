import { describe, expect, it } from 'vitest';

/**
 * Mirrors supabase/functions/_shared/rideLedgerLines.ts buildRideLedgerLineInserts logic
 * for unit testing without Deno runtime.
 */
function buildRideLedgerLineInserts(ride: Record<string, unknown>) {
  const rideId = String(ride.id);
  const riderUserId = String(ride.rider_user_id);
  const driverUserId = (ride.assigned_driver_user_id as string | null) ?? null;
  const paymentMethod = (ride.payment_method as 'cash' | 'card' | null) ?? 'cash';
  const completedAt = String(ride.completed_at ?? ride.updated_at ?? new Date().toISOString());
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor) || 0;
  const platformFeeMinor = Number(ride.platform_fee_minor) || 0;
  const tipMinor = Number(ride.tip_minor) || 0;
  const driverNetMinor = Number(ride.driver_net_minor) || Math.max(0, fareMinor - platformFeeMinor);

  const lines: Array<{ line_kind: string; idempotency_key: string; paid_to_you_minor: number }> = [];

  lines.push({
    line_kind: 'fare_earning',
    idempotency_key: `ride:${rideId}|fare_earning`,
    paid_to_you_minor: driverNetMinor,
  });

  if (tipMinor > 0) {
    lines.push({
      line_kind: 'tip',
      idempotency_key: `ride:${rideId}|tip`,
      paid_to_you_minor: tipMinor,
    });
  }

  if (platformFeeMinor > 0) {
    lines.push({
      line_kind: 'platform_fee',
      idempotency_key: `ride:${rideId}|platform_fee`,
      paid_to_you_minor: -platformFeeMinor,
    });
  }

  return { lines, completedAt, paymentMethod, riderUserId, driverUserId };
}

describe('ride completion ledger lines', () => {
  it('builds fare, tip, and platform fee lines with idempotent keys', () => {
    const result = buildRideLedgerLineInserts({
      id: 'ride-1',
      rider_user_id: 'rider-1',
      assigned_driver_user_id: 'driver-1',
      payment_method: 'card',
      completed_at: '2026-05-27T10:00:00.000Z',
      fare_final_minor: 150000,
      platform_fee_minor: 15000,
      tip_minor: 5000,
      driver_net_minor: 135000,
    });

    expect(result.lines).toHaveLength(3);
    expect(result.lines.map((l) => l.line_kind)).toEqual(['fare_earning', 'tip', 'platform_fee']);
    expect(result.lines[0].idempotency_key).toBe('ride:ride-1|fare_earning');
    expect(result.lines[0].paid_to_you_minor).toBe(135000);
    expect(result.lines[1].paid_to_you_minor).toBe(5000);
    expect(result.lines[2].paid_to_you_minor).toBe(-15000);
  });

  it('cash ride produces fare line only when no tip or fee', () => {
    const result = buildRideLedgerLineInserts({
      id: 'ride-2',
      rider_user_id: 'rider-2',
      assigned_driver_user_id: 'driver-2',
      payment_method: 'cash',
      fare_final_minor: 80000,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.paymentMethod).toBe('cash');
    expect(result.lines[0].paid_to_you_minor).toBe(80000);
  });
});
