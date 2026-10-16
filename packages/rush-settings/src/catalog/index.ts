import type { SettingDef } from '../defineSetting';
import { COURIER_SETTINGS } from './courier';
import { CUSTOMER_SETTINGS } from './customer';
import { ENTERPRISE_SETTINGS } from './enterprise';
import { PARTNER_SETTINGS } from './partner';
import { PLATFORM_SETTINGS } from './platform';

/** Full Rush settings registry (§4.1–4.6 + enterprise areas). */
export const ALL_SETTINGS: SettingDef[] = [
  ...PLATFORM_SETTINGS,
  ...CUSTOMER_SETTINGS,
  ...COURIER_SETTINGS,
  ...PARTNER_SETTINGS,
  ...ENTERPRISE_SETTINGS,
];

const byKey = new Map<string, SettingDef>();
for (const setting of ALL_SETTINGS) {
  if (byKey.has(setting.key)) {
    throw new Error(`Duplicate setting key in registry: ${setting.key}`);
  }
  byKey.set(setting.key, setting);
}

/** Lookup by stable key. */
export const SETTINGS_BY_KEY: ReadonlyMap<string, SettingDef> = byKey;

export {
  PLATFORM_SETTINGS,
  CUSTOMER_SETTINGS,
  COURIER_SETTINGS,
  PARTNER_SETTINGS,
  ENTERPRISE_SETTINGS,
};
