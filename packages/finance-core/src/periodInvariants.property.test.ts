import { describe, expect, it } from 'vitest';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';
import { round2 } from './money.ts';

function randMoney(rng: () => number): number {
  return Math.round((rng() * 200_000 - 100_000) * 100) / 100;
}

/** Simple seeded PRNG for reproducible fuzz (A-4 without fast-check install). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('periodInvariants property tests (A-4)', () => {
  it('settlement == grossSettlement - settlementPaid (200 fuzz runs)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const r = computePeriodSettlement({
        driverShare: randMoney(rng),
        fuelDeduction: Math.max(0, randMoney(rng)),
        baseCashOwed: Math.max(0, randMoney(rng)),
        baseCashPaid: Math.max(0, randMoney(rng)),
        tollCashWash: Math.max(0, randMoney(rng)),
        tollPersonal: Math.max(0, randMoney(rng)),
        fuelCredits: Math.max(0, randMoney(rng)),
        cashWrittenOff: Math.max(0, randMoney(rng)),
        settlementPaid: Math.max(0, randMoney(rng)),
        tipsPaidToDriver: Math.max(0, randMoney(rng)),
      });
      expect(r.settlement).toBe(round2(r.grossSettlement - r.settlementPaid));
    }
  });

  it('settlement is continuous in grossSettlement at fixed paid', () => {
    const paid = 5000;
    const inputs = {
      driverShare: 1000,
      fuelDeduction: 200,
      baseCashOwed: 8000,
      baseCashPaid: 3000,
      tollCashWash: 500,
      tollPersonal: 0,
      fuelCredits: 100,
      cashWrittenOff: 0,
      settlementPaid: paid,
      tipsPaidToDriver: 0,
    };
    const atNeg = computePeriodSettlement({ ...inputs, baseCashOwed: 0 }).settlement;
    const atPos = computePeriodSettlement({ ...inputs, baseCashOwed: 20 }).settlement;
    expect(Math.abs(atPos - atNeg)).toBeLessThan(100);
  });

  it('netPayout == driverShare - fuelDeduction + tipsPaid (200 fuzz runs)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const driverShare = randMoney(rng);
      const fuelDeduction = Math.max(0, randMoney(rng));
      const tips = Math.max(0, randMoney(rng));
      const r = computePeriodSettlement({
        driverShare,
        fuelDeduction,
        baseCashOwed: 0,
        baseCashPaid: 0,
        tollCashWash: 0,
        tollPersonal: 0,
        tipsPaidToDriver: tips,
      });
      expect(r.netPayout).toBe(round2(driverShare - fuelDeduction + tips));
    }
  });
});
