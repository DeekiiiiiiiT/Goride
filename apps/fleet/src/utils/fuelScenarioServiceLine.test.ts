import { describe, expect, it } from 'vitest';
import type { FuelScenario } from '../types/fuel';
import {
  buildLineOverrideScenario,
  effectiveScenariosForServiceLine,
  findLineOverride,
  orgDefaultScenarios,
  resolvePoliciesForLens,
} from './fuelScenarioServiceLine';

const base = (partial: Partial<FuelScenario> & { id: string; name: string }): FuelScenario => ({
  rules: [
    {
      id: 'r1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 50,
    },
  ],
  ...partial,
});

describe('fuelScenarioServiceLine', () => {
  const orgA = base({ id: 'a', name: 'Standard', isDefault: true });
  const orgB = base({ id: 'b', name: 'OO' });
  const delA = buildLineOverrideScenario(orgA, 'rush_delivery', 'a-del');

  it('lists org defaults ignoring overrides', () => {
    expect(orgDefaultScenarios([orgA, orgB, delA]).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('inherits when no override; override wins for that line only', () => {
    const all = [orgA, orgB, delA];
    const delivery = resolvePoliciesForLens(all, 'rush_delivery');
    expect(delivery.find((r) => r.parent.id === 'a')?.kind).toBe('override');
    expect(delivery.find((r) => r.parent.id === 'a')?.scenario.id).toBe('a-del');
    expect(delivery.find((r) => r.parent.id === 'b')?.kind).toBe('inherited');

    const rideshare = resolvePoliciesForLens(all, 'rideshare');
    expect(rideshare.every((r) => r.kind === 'inherited')).toBe(true);

    const allLens = resolvePoliciesForLens(all, 'all');
    expect(allLens.map((r) => r.scenario.id)).toEqual(['a', 'b']);
  });

  it('effectiveScenariosForServiceLine prefers override', () => {
    const all = [orgA, orgB, delA];
    expect(effectiveScenariosForServiceLine(all, 'rush_delivery').map((s) => s.id)).toEqual([
      'a-del',
      'b',
    ]);
    expect(effectiveScenariosForServiceLine(all, null).map((s) => s.id)).toEqual(['a', 'b']);
    expect(findLineOverride(all, 'a', 'rideshare')).toBeUndefined();
  });

  it('buildLineOverrideScenario stamps serviceLine + overridesOfId', () => {
    expect(delA.serviceLine).toBe('rush_delivery');
    expect(delA.overridesOfId).toBe('a');
    expect(delA.isDefault).toBe(false);
    expect(delA.rules).toEqual(orgA.rules);
    expect(delA.rules).not.toBe(orgA.rules);
  });
});
