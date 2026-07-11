import { describe, it, expect } from 'vitest';
import { validateFuelScenarioPayload } from '../supabase/functions/server/fuel_scenario_validation';

/**
 * Pins server-side validation for POST /scenarios, which previously kv.set the
 * raw request body verbatim with zero shape/range checks — client-side
 * validation (ScenarioEditor.test.ts) was the ONLY gate, so any other caller
 * (curl, a future integration, a bug in the client) could still corrupt a
 * scenario with NaN/negative/>100% values.
 */
describe('validateFuelScenarioPayload', () => {
  const validPayload = () => ({
    name: 'Owner Operators',
    description: 'Standard',
    isDefault: false,
    rules: [
      {
        id: 'r1',
        category: 'Fuel',
        coverageType: 'Percentage',
        coverageValue: 50,
        rideShareCoverage: 100,
        companyUsageCoverage: 90,
        personalCoverage: 0,
        conditions: { requiresReceipt: true },
      },
    ],
  });

  it('accepts a well-formed payload', () => {
    expect(validateFuelScenarioPayload(validPayload())).toBeNull();
  });

  it('rejects a missing/empty name', () => {
    expect(validateFuelScenarioPayload({ ...validPayload(), name: '' })).toMatch(/name/i);
    expect(validateFuelScenarioPayload({ ...validPayload(), name: '   ' })).toMatch(/name/i);
    const { name, ...rest } = validPayload();
    expect(validateFuelScenarioPayload(rest)).toMatch(/name/i);
  });

  it('rejects a non-array or missing rules field', () => {
    expect(validateFuelScenarioPayload({ ...validPayload(), rules: undefined })).toMatch(/rules/i);
    expect(validateFuelScenarioPayload({ ...validPayload(), rules: 'not-an-array' })).toMatch(/rules/i);
  });

  it('rejects zero or multiple Fuel rules', () => {
    expect(validateFuelScenarioPayload({ ...validPayload(), rules: [] })).toMatch(/exactly one/i);
    const dup = validPayload();
    dup.rules.push({ ...dup.rules[0], id: 'r2' });
    expect(validateFuelScenarioPayload(dup)).toMatch(/exactly one/i);
  });

  it('rejects an invalid coverageType', () => {
    const payload = validPayload();
    (payload.rules[0] as any).coverageType = 'Bogus';
    expect(validateFuelScenarioPayload(payload)).toMatch(/coverage type/i);
  });

  it('rejects a NaN or negative coverageValue', () => {
    const nanPayload = validPayload();
    nanPayload.rules[0].coverageValue = NaN;
    expect(validateFuelScenarioPayload(nanPayload)).toBeTruthy();

    const negPayload = validPayload();
    negPayload.rules[0].coverageValue = -10;
    expect(validateFuelScenarioPayload(negPayload)).toBeTruthy();
  });

  it('rejects Fixed_Amount with a non-positive allowance', () => {
    const payload = validPayload();
    payload.rules[0].coverageType = 'Fixed_Amount';
    payload.rules[0].coverageValue = 0;
    expect(validateFuelScenarioPayload(payload)).toMatch(/allowance/i);
  });

  it.each([
    'rideShareCoverage',
    'companyUsageCoverage',
    'deadheadCoverage',
    'personalCoverage',
    'miscCoverage',
  ])('rejects an out-of-range %s', (field) => {
    const payload = validPayload();
    (payload.rules[0] as any)[field] = 150;
    expect(validateFuelScenarioPayload(payload)).toMatch(new RegExp(field));
  });

  it('ignores unset granular fields', () => {
    const payload = validPayload();
    delete (payload.rules[0] as any).rideShareCoverage;
    expect(validateFuelScenarioPayload(payload)).toBeNull();
  });

  it('rejects a non-positive maxAmount cap', () => {
    const payload = validPayload();
    payload.rules[0].conditions = { maxAmount: -5 };
    expect(validateFuelScenarioPayload(payload)).toMatch(/max amount/i);
  });

  it('rejects null/non-object payloads', () => {
    expect(validateFuelScenarioPayload(null)).toBeTruthy();
    expect(validateFuelScenarioPayload('not an object')).toBeTruthy();
  });
});
