import { describe, it, expect } from 'vitest';
import { validateFuelRule } from './ScenarioEditor';
import type { FuelRule } from '../../types/fuel';

/**
 * Pins client-side validation added to close the gap where parseFloat('abc')
 * silently saved NaN, and negative/>100% percentages saved with no bounds
 * check — both could corrupt downstream reconciliation math with no warning.
 */
describe('validateFuelRule', () => {
  const baseRule = (overrides: Partial<FuelRule> = {}): FuelRule => ({
    id: 'r1',
    category: 'Fuel',
    coverageType: 'Full',
    coverageValue: 100,
    ...overrides,
  });

  it('accepts a valid Full rule', () => {
    expect(validateFuelRule(baseRule())).toBeNull();
  });

  it('accepts a valid Percentage rule with granular overrides in range', () => {
    const rule = baseRule({
      coverageType: 'Percentage',
      coverageValue: 50,
      rideShareCoverage: 100,
      companyUsageCoverage: 90,
      deadheadCoverage: 60,
      personalCoverage: 0,
      miscCoverage: 50,
    });
    expect(validateFuelRule(rule)).toBeNull();
  });

  it('accepts a valid Fixed_Amount rule', () => {
    expect(validateFuelRule(baseRule({ coverageType: 'Fixed_Amount', coverageValue: 50 }))).toBeNull();
  });

  it('rejects NaN coverageValue (e.g. from parseFloat("abc"))', () => {
    const rule = baseRule({ coverageValue: NaN });
    expect(validateFuelRule(rule)).toMatch(/coverage value/i);
  });

  it('rejects a negative coverageValue', () => {
    const rule = baseRule({ coverageValue: -10 });
    expect(validateFuelRule(rule)).toBeTruthy();
  });

  it('rejects Fixed_Amount with a zero or negative allowance', () => {
    expect(validateFuelRule(baseRule({ coverageType: 'Fixed_Amount', coverageValue: 0 }))).toMatch(/allowance/i);
    expect(validateFuelRule(baseRule({ coverageType: 'Fixed_Amount', coverageValue: -5 }))).toBeTruthy();
  });

  it.each([
    ['rideShareCoverage', 150],
    ['companyUsageCoverage', -5],
    ['deadheadCoverage', NaN],
    ['personalCoverage', 101],
    ['miscCoverage', -0.01],
  ] as const)('rejects an out-of-range %s value (%s)', (field, value) => {
    const rule = baseRule({ coverageType: 'Percentage', coverageValue: 50, [field]: value } as Partial<FuelRule>);
    expect(validateFuelRule(rule)).toBeTruthy();
  });

  it('leaves unset granular fields alone (no error for undefined)', () => {
    const rule = baseRule({ coverageType: 'Percentage', coverageValue: 50 });
    expect(validateFuelRule(rule)).toBeNull();
  });

  it('rejects a non-positive maxAmount cap when provided', () => {
    const rule = baseRule({ conditions: { maxAmount: 0 } });
    expect(validateFuelRule(rule)).toMatch(/max amount/i);
  });

  it('allows an omitted maxAmount cap', () => {
    const rule = baseRule({ conditions: { requiresReceipt: true } });
    expect(validateFuelRule(rule)).toBeNull();
  });
});
