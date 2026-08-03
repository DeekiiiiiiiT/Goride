import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_MODULE_KEYS,
  allModulesOff,
  resolveEffectiveModules,
} from './modules';
import { DEFAULT_ENTERPRISE_ENABLED_MODULES } from './defaults';

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

  it('includes dispatchBoard in catalog defaults', () => {
    expect(ENTERPRISE_MODULE_KEYS).toContain('dispatchBoard');
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.dispatchBoard).toBe(true);
  });

  it('org cannot re-enable when product-line turns dispatchBoard off', () => {
    const effective = resolveEffectiveModules(
      { ...DEFAULT_ENTERPRISE_ENABLED_MODULES, dispatchBoard: false },
      { dispatchBoard: true },
    );
    expect(effective.dispatchBoard).toBe(false);
  });
});

describe('allModulesOff', () => {
  it('sets every catalog key to false', () => {
    const off = allModulesOff();
    for (const key of ENTERPRISE_MODULE_KEYS) {
      expect(off[key]).toBe(false);
    }
  });
});
