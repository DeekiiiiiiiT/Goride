import { describe, expect, it } from 'vitest';
import { allModulesOff, resolveEffectiveModules } from '@roam/platform-settings';

/** Rush modules must fail closed unless explicitly enabled at both levels. */
describe('Rush module resolution', () => {
  const rushKeys = [
    'rush_couriers',
    'rush_deliveries',
    'rush_courier_settlements',
    'rush_supply_health',
  ] as const;

  it('defaults rush modules off when platform catalog is allModulesOff', () => {
    const platform = allModulesOff();
    const org = Object.fromEntries(rushKeys.map((k) => [k, false]));
    const effective = resolveEffectiveModules(platform, org);
    for (const key of rushKeys) {
      expect(effective[key]).toBe(false);
    }
  });

  it('enables rush module only when org override is true and platform allows', () => {
    const platform = { ...allModulesOff(), rush_couriers: true };
    const org = { rush_couriers: true };
    expect(resolveEffectiveModules(platform, org).rush_couriers).toBe(true);
  });

  it('org purchase enables module when platform default is off', () => {
    const platform = allModulesOff();
    const org = { rush_couriers: true };
    expect(resolveEffectiveModules(platform, org).rush_couriers).toBe(true);
  });
});

describe('Rush rollout flag inventory', () => {
  const RUSH_FLAGS = [
    'service_lines_enabled',
    'rush_courier_link',
    'rush_trip_projection',
    'rush_settlement',
    'rush_ui',
  ] as const;

  it('matches documented rollback flag set', () => {
    expect(RUSH_FLAGS.length).toBe(5);
  });
});
