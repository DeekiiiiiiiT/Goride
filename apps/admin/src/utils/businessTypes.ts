import { BusinessType } from '../types/data';

/**
 * Business Type Constants & Helpers
 * 
 * Central source of truth for multi-industry business type definitions.
 * Used by the Settings UI, sidebar visibility rules, and vocabulary system.
 */

export const BUSINESS_TYPES = [
  {
    key: 'rideshare' as BusinessType,
    label: 'Rideshare',
    description: 'Uber, Lyft-style ride services',
    icon: 'Car',
  },
  {
    key: 'delivery' as BusinessType,
    label: 'Delivery / Courier',
    description: 'Package delivery, document courier, last-mile',
    icon: 'Package',
  },
  {
    key: 'taxi' as BusinessType,
    label: 'Taxi / Cab',
    description: 'Traditional taxi and dispatch services',
    icon: 'Navigation',
  },
  {
    key: 'trucking' as BusinessType,
    label: 'Trucking / Haulage',
    description: 'Long-haul freight, cargo transport',
    icon: 'Truck',
  },
  {
    key: 'shipping' as BusinessType,
    label: 'Shipping / Logistics',
    description: 'Maritime, port logistics, container transport',
    icon: 'Ship',
  },
] as const;

/**
 * The default business type used when no preference has been set.
 * This ensures the app behaves exactly as it does today (rideshare mode)
 * until an admin explicitly changes it in Settings.
 */
export const DEFAULT_BUSINESS_TYPE: BusinessType = 'rideshare';

/**
 * Validates whether a string is a valid BusinessType.
 * Used when reading from KV/localStorage to guard against corrupted values.
 */
export function isValidBusinessType(value: unknown): value is BusinessType {
  return (
    typeof value === 'string' &&
    ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'].includes(value)
  );
}

// ---------------------------------------------------------------------------
// Sidebar Visibility Rules
// ---------------------------------------------------------------------------

/**
 * Maps each sidebar item key to the business types where it should appear.
 * Items not listed here default to visible (safe fallback).
 */
export const SIDEBAR_VISIBILITY: Record<string, BusinessType[]> = {
  // Universal — always visible
  'dashboard': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'imports': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'drivers': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'vehicles': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'fleet': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'fuel-management': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'trips': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'reports': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],
  'settings': ['rideshare', 'delivery', 'taxi', 'trucking', 'shipping'],

  // Conditionally visible
  'tier-config': ['rideshare'],
  'performance': ['rideshare', 'taxi'],
  'toll-management': ['rideshare', 'taxi', 'trucking', 'shipping'],
};

/**
 * Returns whether a sidebar item should be rendered for the given business type.
 * Items not in SIDEBAR_VISIBILITY default to visible (safe fallback).
 */
export function isSidebarItemVisible(itemKey: string, businessType: BusinessType): boolean {
  const allowed = SIDEBAR_VISIBILITY[itemKey];
  if (!allowed) return true; // Not in the map → show by default
  return allowed.includes(businessType);
}