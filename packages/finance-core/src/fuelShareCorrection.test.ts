import { describe, expect, it } from 'vitest';
import { fuelShareCorrectionDelta, fuelShareCorrectionSentence } from './fuelShareCorrection';

describe('fuelShareCorrectionDelta', () => {
  it('cash weeks return the driver share that was taken twice', () => {
    const driverShare = 2500;
    const companyShare = 10000;
    const cashPaid = driverShare + companyShare;
    expect(fuelShareCorrectionDelta({
      driverPaidFuel: cashPaid,
      companyFuelShare: companyShare,
    })).toBe(driverShare);
  });

  it('gas-card weeks reduce what the company owes', () => {
    expect(fuelShareCorrectionDelta({
      driverPaidFuel: 1000,
      companyFuelShare: 8000,
    })).toBe(-7000);
  });
});

describe('fuelShareCorrectionSentence', () => {
  it('names a cash week in plain language', () => {
    expect(fuelShareCorrectionSentence({
      week: '2026-01-19',
      delta: 2425.36,
      gasCard: 0,
    })).toContain('taken twice');
  });
});
