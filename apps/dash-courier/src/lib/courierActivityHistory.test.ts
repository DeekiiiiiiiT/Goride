import { describe, expect, it } from 'vitest';
import { mapCourierHistoryToActivity } from './courierActivityHistory';

describe('mapCourierHistoryToActivity', () => {
  it('keeps completed pay and maps cancelled to zero with cancelled status', () => {
    const rows = mapCourierHistoryToActivity([
      {
        id: 'c1',
        restaurant: 'Island Grill',
        dropoff: 'New Kingston',
        amount: 420,
        time: '2026-08-18T19:42:00.000Z',
        status: 'completed',
      },
      {
        id: 'x1',
        restaurant: 'Burger King',
        dropoff: 'Half Way Tree',
        amount: 0,
        time: '2026-08-18T18:10:00.000Z',
        status: 'cancelled',
      },
    ]);
    expect(rows[0].status).toBe('completed');
    expect(rows[0].amount).toBe(420);
    expect(rows[1].status).toBe('cancelled');
    expect(rows[1].amount).toBe(0);
  });
});
