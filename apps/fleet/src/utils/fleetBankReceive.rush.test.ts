import { describe, expect, it } from 'vitest';
import { aggregateRoamCardExpectedByWeek } from './fleetBankReceive';

describe('aggregateRoamCardExpectedByWeek Rush COD', () => {
  it('uses courier earning for Roam Rush card trips, not abs(netToDriver)', () => {
    const rows = aggregateRoamCardExpectedByWeek(
      [
        {
          platform: 'Roam Rush',
          paymentMethod: 'Card',
          status: 'Completed',
          completed_at: '2026-09-01T18:00:00.000Z',
          amount: 300,
          netToDriver: 300,
        },
      ],
      'America/Jamaica',
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.expected).toBe(300);
  });

  it('skips COD Rush trips from bank-receive aggregation', () => {
    const rows = aggregateRoamCardExpectedByWeek(
      [
        {
          platform: 'Roam Rush',
          paymentMethod: 'Cash',
          status: 'Completed',
          date: '2026-09-01',
          amount: 300,
          netToDriver: -2200,
          cashCollected: 2500,
        },
      ],
      'America/Jamaica',
    );
    expect(rows.length).toBe(0);
  });
});
