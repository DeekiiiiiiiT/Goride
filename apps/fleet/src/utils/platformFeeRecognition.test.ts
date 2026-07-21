import { describe, it, expect } from 'vitest';
import {
  recognizePlatformGrossAndFees,
  computePlatformFeesPeriodAndLifetime,
  recognizedFareGross,
  impliedFareFeeGap,
} from './platformFeeRecognition';

describe('platformFeeRecognition', () => {
  it('uses fare gap as fees when no platform_fee; gross is pre-commission', () => {
    const r = recognizePlatformGrossAndFees([
      {
        eventType: 'fare_earning',
        platform: 'InDrive',
        grossAmount: 100,
        netAmount: 80,
        date: '2025-01-10',
      },
    ]);
    expect(r.totalFees).toBe(20);
    expect(r.totalGross).toBe(100);
    expect(r.byPlatform.get('InDrive')).toEqual({ gross: 100, fees: 20 });
  });

  it('prefers explicit platform_fee over fare gap (no double count)', () => {
    const r = recognizePlatformGrossAndFees([
      {
        eventType: 'fare_earning',
        platform: 'InDrive',
        grossAmount: 100,
        netAmount: 80,
      },
      {
        eventType: 'platform_fee',
        platform: 'InDrive',
        netAmount: -15,
      },
    ]);
    expect(r.totalFees).toBe(15);
    expect(r.totalGross).toBe(100);
  });

  it('Uber fare with gross=net → fees 0', () => {
    const r = recognizePlatformGrossAndFees([
      {
        eventType: 'fare_earning',
        platform: 'Uber',
        grossAmount: 50,
        netAmount: 50,
      },
    ]);
    expect(r.totalFees).toBe(0);
    expect(r.totalGross).toBe(50);
  });

  it('includes tips/promotions in gross, not fees', () => {
    const r = recognizePlatformGrossAndFees([
      { eventType: 'fare_earning', platform: 'Uber', grossAmount: 40, netAmount: 40 },
      { eventType: 'tip', platform: 'Uber', netAmount: 5 },
    ]);
    expect(r.totalGross).toBe(45);
    expect(r.totalFees).toBe(0);
  });

  it('computePlatformFeesPeriodAndLifetime scopes period', () => {
    const entries = [
      {
        eventType: 'fare_earning',
        platform: 'InDrive',
        grossAmount: 100,
        netAmount: 80,
        date: '2025-01-15',
      },
      {
        eventType: 'fare_earning',
        platform: 'InDrive',
        grossAmount: 50,
        netAmount: 40,
        date: '2024-12-01',
      },
    ];
    const r = computePlatformFeesPeriodAndLifetime(entries, 'InDrive', '2025-01-01', '2025-01-31');
    expect(r.periodFees).toBe(20);
    expect(r.lifetimeFees).toBe(30);
  });

  it('recognizedFareGross / impliedFareFeeGap helpers', () => {
    expect(recognizedFareGross({ grossAmount: 100, netAmount: 80 })).toBe(100);
    expect(recognizedFareGross({ grossAmount: 80, netAmount: 80 })).toBe(80);
    expect(impliedFareFeeGap({ grossAmount: 100, netAmount: 80 })).toBe(20);
    expect(impliedFareFeeGap({ grossAmount: 70, netAmount: 80 })).toBe(0);
  });
});
