import { describe, expect, it } from 'vitest';
import { resolveEffectiveModules } from './modules';

describe('resolveEffectiveModules', () => {
  it('intersects product-line and org overrides', () => {
    const effective = resolveEffectiveModules(
      { tollManagement: true, fuelManagement: false, shipments: true },
      { tollManagement: false, shipments: true },
      ['tollManagement', 'fuelManagement', 'shipments'],
    );
    expect(effective.tollManagement).toBe(false);
    expect(effective.fuelManagement).toBe(false);
    expect(effective.shipments).toBe(true);
  });

  it('inherits product-line when org key missing', () => {
    const effective = resolveEffectiveModules(
      { tollManagement: true },
      null,
      ['tollManagement'],
    );
    expect(effective.tollManagement).toBe(true);
  });

  it('treats missing product-line key as enabled', () => {
    const effective = resolveEffectiveModules({}, { tollManagement: true }, ['tollManagement']);
    expect(effective.tollManagement).toBe(true);
  });
});
