import { describe, expect, it } from 'vitest';
import {
  AUGUST_FUEL_CORRECTIONS,
  FUEL_CORRECTION_NET,
  OCT12_CORRECTION,
  correctionPreviewAccepted,
  fuelShareCorrectionDelta,
  fuelShareCorrectionSentence,
} from './fuelShareCorrection';

const jan19 = {
  driverShare: 30357.13,
  fuelDeduction: 5923.8,
  cashCollected: 40111.38,
  cashReturned: 5848.77,
  tollChargedToDriver: 0,
  tollCashSpend: 1640,
  driverPaidFuel: 24800,
  settlementPaid: 10686.92,
  storedSettlement: 0,
};

describe('fuelShareCorrectionDelta', () => {
  it('matches driver-paid minus company share when the week was not restated', () => {
    expect(fuelShareCorrectionDelta(jan19)).toBeCloseTo(24800 - 18876.2, 2);
  });

  it('uses the week fuel charge, not the later August restatement', () => {
    expect(fuelShareCorrectionDelta({
      driverShare: 23704.69,
      fuelDeduction: 5364.87,
      cashCollected: 54196.26,
      cashReturned: 16000,
      tollChargedToDriver: 595,
      tollCashSpend: 1015,
      driverPaidFuel: 22800,
      settlementPaid: 10404.21,
      storedSettlement: 0,
    })).toBe(AUGUST_FUEL_CORRECTIONS['2026-08-03']);
  });

  it('subtracts the settlement already stored on the week', () => {
    expect(fuelShareCorrectionDelta({
      driverShare: 31239.15,
      fuelDeduction: 13608.13,
      cashCollected: 49264.39,
      cashReturned: 0,
      tollChargedToDriver: 640,
      tollCashSpend: 0,
      driverPaidFuel: 20000,
      cashWrittenOff: 0,
      settlementPaid: 8047.14,
      tipsPaidToDriver: 160,
      storedSettlement: -350,
    })).toBe(AUGUST_FUEL_CORRECTIONS['2026-08-10']);
  });
});

describe('correctionPreviewAccepted', () => {
  it('accepts the audited net, August lines, and the Oct 12 line', () => {
    const lines = [
      ...Object.entries(AUGUST_FUEL_CORRECTIONS).map(([sourceWeek, amount]) => ({ sourceWeek, amount })),
      { sourceWeek: '2026-01-19', amount: roundAway(FUEL_CORRECTION_NET, AUGUST_FUEL_CORRECTIONS) },
    ];
    expect(correctionPreviewAccepted({ lines, oct12Amount: OCT12_CORRECTION }).ok).toBe(true);
  });

  it('refuses a preview that still uses the short August figure', () => {
    const lines = [
      { sourceWeek: '2026-08-03', amount: -289.56 },
      { sourceWeek: '2026-01-19', amount: FUEL_CORRECTION_NET + 289.56 },
    ];
    expect(correctionPreviewAccepted({ lines, oct12Amount: OCT12_CORRECTION }).ok).toBe(false);
  });
});

function roundAway(net: number, august: Record<string, number>): number {
  const augustSum = Object.values(august).reduce((sum, n) => sum + n, 0);
  return Math.round((net - augustSum) * 100) / 100;
}

describe('fuelShareCorrectionSentence', () => {
  it('names a cash week in plain language', () => {
    expect(fuelShareCorrectionSentence({
      week: '2026-01-19',
      delta: 2425.36,
      gasCard: 0,
    })).toContain('taken twice');
  });
});
