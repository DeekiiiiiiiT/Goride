/**
 * Exhaustive status maps must include Awaiting Tolls (R4-1 / Flawless R5).
 */
import { describe, expect, it } from 'vitest';
import type { PayoutStatus } from '../types/driverPayoutPeriod';

const PAYOUT_STATUSES: PayoutStatus[] = [
  'Finalized',
  'Awaiting Cash',
  'Awaiting Tolls',
  'Pending',
];

describe('driver payout/settlement status SSOT', () => {
  it('PayoutStatus includes Awaiting Tolls', () => {
    expect(PAYOUT_STATUSES).toContain('Awaiting Tolls');
  });

  it('exhaustive Record would require Awaiting Tolls key', () => {
    const map: Record<PayoutStatus, true> = {
      Finalized: true,
      'Awaiting Cash': true,
      'Awaiting Tolls': true,
      Pending: true,
    };
    expect(Object.keys(map)).toHaveLength(4);
  });
});
