import { describe, expect, it } from 'vitest';
import {
  canEnableRolloutFlag,
  type RushRolloutFlagStatus,
} from './rushRolloutCatalog';

function flag(
  key: RushRolloutFlagStatus['flag'],
  effective: boolean,
): RushRolloutFlagStatus {
  return {
    flag: key,
    label: key,
    description: '',
    step: 1,
    globalEnabled: false,
    enabledForOrg: effective,
    disabledForOrg: false,
    effectiveForOrg: effective,
  };
}

describe('canEnableRolloutFlag', () => {
  const emptyFlags: RushRolloutFlagStatus[] = [];

  it('blocks courier link when step 1 is off', () => {
    const result = canEnableRolloutFlag('rush_courier_link', ['rush_delivery'], emptyFlags);
    expect(result.ok).toBe(false);
  });

  it('allows service lines config flag regardless of delivery line', () => {
    const result = canEnableRolloutFlag('service_lines_enabled', ['rideshare'], emptyFlags);
    expect(result.ok).toBe(true);
  });

  it('blocks trip projection when courier link is off', () => {
    const flags = [flag('service_lines_enabled', true)];
    const result = canEnableRolloutFlag('rush_trip_projection', ['rush_delivery'], flags);
    expect(result.ok).toBe(false);
  });

  it('blocks settlement when projection is off', () => {
    const flags = [
      flag('service_lines_enabled', true),
      flag('rush_courier_link', true),
    ];
    const result = canEnableRolloutFlag('rush_settlement', ['rush_delivery'], flags);
    expect(result.ok).toBe(false);
  });

  it('allows settlement when projection is on', () => {
    const flags = [
      flag('service_lines_enabled', true),
      flag('rush_courier_link', true),
      flag('rush_trip_projection', true),
    ];
    const result = canEnableRolloutFlag('rush_settlement', ['rush_delivery'], flags);
    expect(result.ok).toBe(true);
  });
});
