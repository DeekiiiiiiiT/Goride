import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_MODULE_KEYS,
  allModulesOff,
  normalizeModuleKeyMap,
  resolveEffectiveModules,
  rushModuleOverridesForServiceLines,
} from './modules';
import { DEFAULT_ENTERPRISE_ENABLED_MODULES } from './defaults';

describe('resolveEffectiveModules', () => {
  it('intersects product-line and org overrides', () => {
    const effective = resolveEffectiveModules(
      { tollManagement: true, fuelManagement: false, freight_shipments: true },
      { tollManagement: false, freight_shipments: true },
      ['tollManagement', 'fuelManagement', 'freight_shipments'],
    );
    expect(effective.tollManagement).toBe(false);
    expect(effective.fuelManagement).toBe(false);
    expect(effective.freight_shipments).toBe(true);
  });

  it('maps legacy camelCase keys to freight_*', () => {
    const effective = resolveEffectiveModules(
      { dispatchBoard: false },
      { shipments: true },
      ['freight_dispatch', 'freight_shipments'],
    );
    expect(effective.freight_dispatch).toBe(false);
    expect(effective.freight_shipments).toBe(true);
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

  it('includes freight_dispatch in catalog defaults', () => {
    expect(ENTERPRISE_MODULE_KEYS).toContain('freight_dispatch');
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.freight_dispatch).toBe(true);
  });

  it('includes freight_service_zones and freight_ops_inbox', () => {
    expect(ENTERPRISE_MODULE_KEYS).toContain('freight_service_zones');
    expect(ENTERPRISE_MODULE_KEYS).toContain('freight_ops_inbox');
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.freight_service_zones).toBe(true);
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.freight_ops_inbox).toBe(true);
  });

  it('reserves grocery_* off by default', () => {
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.grocery_catalog).toBe(false);
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.grocery_orders).toBe(false);
    expect(DEFAULT_ENTERPRISE_ENABLED_MODULES.grocery_fulfillment).toBe(false);
  });

  it('org cannot re-enable when product-line turns freight_dispatch off', () => {
    const effective = resolveEffectiveModules(
      { ...DEFAULT_ENTERPRISE_ENABLED_MODULES, freight_dispatch: false },
      { freight_dispatch: true },
    );
    expect(effective.freight_dispatch).toBe(false);
  });
});

describe('normalizeModuleKeyMap', () => {
  it('prefers canonical key when both legacy and new present', () => {
    const out = normalizeModuleKeyMap({
      shipments: true,
      freight_shipments: false,
    });
    expect(out.freight_shipments).toBe(false);
  });
});

describe('rushModuleOverridesForServiceLines', () => {
  it('enables all rush modules when rush_delivery is in service_lines', () => {
    const mods = rushModuleOverridesForServiceLines(['rideshare', 'rush_delivery'], {});
    expect(mods.rush_couriers).toBe(true);
    expect(mods.rush_deliveries).toBe(true);
    expect(mods.rush_courier_settlements).toBe(true);
  });

  it('disables rush modules when only rideshare', () => {
    const mods = rushModuleOverridesForServiceLines(['rideshare'], { rush_couriers: true });
    expect(mods.rush_couriers).toBe(false);
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
