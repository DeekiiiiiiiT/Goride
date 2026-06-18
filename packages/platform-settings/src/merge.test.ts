import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLEET_SETTINGS,
  DEFAULT_ENTERPRISE_SETTINGS,
  mergeSettings,
  platformSettingsKvKey,
  LEGACY_PLATFORM_SETTINGS_KEY,
} from './index';

describe('platformSettingsKvKey', () => {
  it('maps fleet segment to KV key', () => {
    expect(platformSettingsKvKey('fleet')).toBe('platform:settings:fleet');
  });

  it('maps enterprise segment to KV key', () => {
    expect(platformSettingsKvKey('enterprise')).toBe('platform:settings:enterprise');
  });

  it('maps global segment to KV key', () => {
    expect(platformSettingsKvKey('global')).toBe('platform:settings:global');
  });

  it('preserves legacy key constant', () => {
    expect(LEGACY_PLATFORM_SETTINGS_KEY).toBe('platform:settings');
  });
});

describe('mergeSettings', () => {
  it('preserves nested securityPolicies when partial omits fields', () => {
    const merged = mergeSettings(DEFAULT_FLEET_SETTINGS, {
      platformName: 'Custom Fleet',
      securityPolicies: { minPasswordLength: 12 },
    });
    expect(merged.platformName).toBe('Custom Fleet');
    expect(merged.securityPolicies.minPasswordLength).toBe(12);
    expect(merged.securityPolicies.requireUppercase).toBe(false);
  });

  it('merges enabledModules partially', () => {
    const merged = mergeSettings(DEFAULT_FLEET_SETTINGS, {
      enabledModules: { fuelManagement: false },
    });
    expect(merged.enabledModules.fuelManagement).toBe(false);
    expect(merged.enabledModules.tollManagement).toBe(true);
  });

  it('returns copy of defaults when partial is null', () => {
    const merged = mergeSettings(DEFAULT_ENTERPRISE_SETTINGS, null);
    expect(merged.platformName).toBe('Roam Enterprise');
    expect(merged).not.toBe(DEFAULT_ENTERPRISE_SETTINGS);
  });
});

describe('defaults', () => {
  it('fleet defaults rideshare-only business types', () => {
    expect(DEFAULT_FLEET_SETTINGS.enabledBusinessTypes.rideshare).toBe(true);
    expect(DEFAULT_FLEET_SETTINGS.enabledBusinessTypes.delivery).toBe(false);
  });

  it('enterprise defaults enable all business types', () => {
    expect(DEFAULT_ENTERPRISE_SETTINGS.enabledBusinessTypes.delivery).toBe(true);
    expect(DEFAULT_ENTERPRISE_SETTINGS.enabledBusinessTypes.trucking).toBe(true);
  });
});
