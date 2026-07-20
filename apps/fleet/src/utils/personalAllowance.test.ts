import { describe, expect, it } from 'vitest';
import {
  computePersonalAllowanceSplit,
  computeQuotaPct,
  DEFAULT_PERSONAL_ALLOWANCE,
  DEFAULT_PERSONAL_ALLOWANCE_BANDS,
  earnedPersonalKmFromBands,
  mergePersonalAllowanceDefaults,
  personalAllowanceBonusKey,
  personalCostForCoverageSplit,
  personalEarnedCostAbsorbed,
  driverFacingPersonalCost,
  driverShareExcludingPersonal,
  resolveWeeklyQuotaJmd,
  validatePersonalAllowanceBands,
} from './personalAllowance';
import type { QuotaConfig } from '../types/data';

const quota: QuotaConfig = {
  daily: { enabled: false, amount: 0 },
  weekly: { enabled: true, amount: 100_000 },
  monthly: { enabled: false, amount: 0 },
};

describe('personalAllowance', () => {
  it('merge defaults to enabled:true', () => {
    const m = mergePersonalAllowanceDefaults(undefined);
    expect(m.enabled).toBe(true);
    expect(m.bands).toHaveLength(4);
  });

  it('merge preserves explicit enabled:false', () => {
    expect(mergePersonalAllowanceDefaults({ enabled: false }).enabled).toBe(false);
  });

  it('bonus key shape', () => {
    expect(personalAllowanceBonusKey('d1', '2026-06-29')).toBe(
      'personal_allowance_bonus:d1:2026-06-29',
    );
  });

  it('quota pct and weekly resolve', () => {
    expect(computeQuotaPct(72_000, 100_000)).toBeCloseTo(72);
    expect(resolveWeeklyQuotaJmd(DEFAULT_PERSONAL_ALLOWANCE, quota)).toBe(100_000);
    expect(
      resolveWeeklyQuotaJmd(
        { ...DEFAULT_PERSONAL_ALLOWANCE, weeklyQuotaOverrideJmd: 80_000 },
        quota,
      ),
    ).toBe(80_000);
  });

  it('band edges', () => {
    const bands = DEFAULT_PERSONAL_ALLOWANCE_BANDS;
    expect(earnedPersonalKmFromBands(59.9, bands)).toBe(0);
    expect(earnedPersonalKmFromBands(60, bands)).toBe(40);
    expect(earnedPersonalKmFromBands(79.9, bands)).toBe(40);
    expect(earnedPersonalKmFromBands(80, bands)).toBe(75);
    expect(earnedPersonalKmFromBands(99.9, bands)).toBe(75);
    expect(earnedPersonalKmFromBands(100, bands)).toBe(100);
    expect(earnedPersonalKmFromBands(150, bands)).toBe(100);
  });

  it('disabled returns skip', () => {
    const r = computePersonalAllowanceSplit({
      measuredKm: 162,
      efficiencyKmPerL: 10,
      pricePerLiter: 200,
      earningsJmd: 72_000,
      config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: false },
      quotaConfig: quota,
    });
    expect(r.skip).toBe(true);
    expect(r.earnedKm).toBe(0);
  });

  it('72% → mid band, company earned + driver overage costs', () => {
    const r = computePersonalAllowanceSplit({
      measuredKm: 162,
      efficiencyKmPerL: 10,
      pricePerLiter: 200,
      earningsJmd: 72_000,
      config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: true },
      quotaConfig: quota,
    });
    expect(r.skip).toBe(false);
    expect(r.earnedKm).toBe(40);
    expect(r.overageKm).toBe(122);
    expect(r.earnedCost).toBeCloseTo(800); // 40 * 20
    expect(r.overageCost).toBeCloseTo(2440); // 122 * 20
  });

  it('zero quota earnings → 0 earned', () => {
    const r = computePersonalAllowanceSplit({
      measuredKm: 100,
      efficiencyKmPerL: 10,
      pricePerLiter: 100,
      earningsJmd: 0,
      config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: true },
      quotaConfig: quota,
    });
    expect(r.earnedKm).toBe(0);
    expect(r.overageKm).toBe(100);
  });

  it('prior week bonus adds to earned (capped by measured)', () => {
    const r = computePersonalAllowanceSplit({
      measuredKm: 50,
      efficiencyKmPerL: 10,
      pricePerLiter: 100,
      earningsJmd: 50_000,
      config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: true },
      quotaConfig: quota,
      priorWeekBonusKm: 20,
    });
    // 50% → 0 band + 20 bonus = 20 earned
    expect(r.earnedKm).toBe(20);
    expect(r.overageKm).toBe(30);
  });

  it('validate bands rejects overlap', () => {
    expect(
      validatePersonalAllowanceBands([
        { minPctInclusive: 0, maxPctExclusive: 70, earnedKm: 0 },
        { minPctInclusive: 60, maxPctExclusive: 100, earnedKm: 40 },
      ]),
    ).toMatch(/overlap/i);
  });

  it('report helpers prefer overage when allowance metadata present', () => {
    const report = {
      personalUsageCost: 1000,
      driverShare: 800,
      metadata: {
        personalAllowance: {
          quotaPct: 72,
          weeklyEarnings: 72000,
          weeklyQuota: 100000,
          earnedKm: 40,
          overageKm: 60,
          earnedCost: 400,
          overageCost: 600,
          hitTopBand: false,
        },
      },
    };
    expect(personalCostForCoverageSplit(report)).toBe(600);
    expect(personalEarnedCostAbsorbed(report)).toBe(400);
    expect(driverFacingPersonalCost(report)).toBe(600);
    expect(driverShareExcludingPersonal(report)).toBe(200);
  });
});
