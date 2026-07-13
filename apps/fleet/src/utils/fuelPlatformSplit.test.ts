import { describe, it, expect } from 'vitest';
import {
  allocateAmountByKmShare,
  sumTripKmByPlatform,
  toInsightPlatform,
} from './fuelPlatformSplit';
import type { Trip } from '../types/data';

function trip(partial: Partial<Trip> & Pick<Trip, 'id' | 'platform' | 'date' | 'distance'>): Trip {
  return {
    driverId: 'd1',
    amount: 0,
    status: 'Completed',
    ...partial,
  } as Trip;
}

describe('fuelPlatformSplit', () => {
  it('maps GoRide → Roam', () => {
    expect(toInsightPlatform('GoRide')).toBe('Roam');
  });

  it('sums km by platform in week', () => {
    const km = sumTripKmByPlatform(
      [
        trip({ id: '1', platform: 'Uber', date: '2026-06-30', distance: 100 }),
        trip({ id: '2', platform: 'InDrive', date: '2026-07-01', distance: 50 }),
        trip({
          id: '3',
          platform: 'Roam',
          date: '2026-07-02',
          distance: 20,
          normalizedEnrouteDistance: 5,
        } as any),
        trip({ id: '4', platform: 'Uber', date: '2026-07-10', distance: 999 }), // outside week
      ],
      { weekStart: '2026-06-29', weekEnd: '2026-07-05' },
    );
    expect(km.Uber).toBe(100);
    expect(km.InDrive).toBe(50);
    expect(km.Roam).toBe(25);
  });

  it('allocates Ride Share $ by km share', () => {
    const dollars = allocateAmountByKmShare(300, {
      Roam: 100,
      Uber: 100,
      InDrive: 100,
      Other: 0,
    });
    expect(dollars.Roam).toBe(100);
    expect(dollars.Uber).toBe(100);
    expect(dollars.InDrive).toBe(100);
  });

  it('allocates Deadhead insight $ by same km weights', () => {
    const dollars = allocateAmountByKmShare(100, {
      Roam: 0,
      Uber: 80,
      InDrive: 20,
      Other: 0,
    });
    expect(dollars.Uber).toBe(80);
    expect(dollars.InDrive).toBe(20);
    expect(dollars.Roam).toBe(0);
  });
});
