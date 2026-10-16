import { describe, expect, it } from 'vitest';
import { deriveResolvedConfig } from './deriveView';

describe('deriveResolvedConfig', () => {
  it('derives maintenance, tips, and accept deadline from settings bag', () => {
    const resolved = deriveResolvedConfig(
      'customer',
      {
        version: 'abc',
        app: 'customer',
        marketId: null,
        settings: {
          'platform.maintenance.customer': {
            active: true,
            message: 'Down for a bit',
            until: null,
          },
          'customer.tips.presets_jmd': [25, 75],
          'partner.orders.accept_deadline_seconds': 300,
        },
      },
      { appVersion: '0.1.0', platform: 'web', source: 'network' },
    );

    expect(resolved.maintenance.active).toBe(true);
    expect(resolved.maintenance.message).toBe('Down for a bit');
    expect(resolved.rules.tipPresetsJmd).toEqual([25, 75]);
    expect(resolved.rules.acceptDeadlineSeconds).toBe(300);
    expect(resolved.source).toBe('network');
  });

  it('marks force-update when below minVersion', () => {
    const resolved = deriveResolvedConfig(
      'courier',
      {
        version: 1,
        app: 'courier',
        marketId: null,
        settings: {
          'platform.app_version.courier.web': {
            minVersion: '2.0.0',
            recommendedVersion: '2.1.0',
          },
        },
      },
      { appVersion: '0.1.0', platform: 'web', source: 'cache' },
    );

    expect(resolved.update.required).toBe(true);
    expect(resolved.update.recommended).toBe(true);
  });
});
