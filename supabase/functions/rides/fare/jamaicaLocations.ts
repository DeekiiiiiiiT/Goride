/**
 * Fare-rule location keys. Place names and borders come from Dominion (geo schema).
 * Keep in sync with packages/business-config/src/jamaicaLocations.ts
 */

export type JamaicaCountySlug = 'cornwall' | 'middlesex' | 'surrey';

export type LocationScope = 'country' | 'county' | 'parish' | 'locality';

export type JamaicaLocationSelection = {
  scope: LocationScope;
  county?: JamaicaCountySlug;
  parish?: string;
  locality?: string;
};

export const JAMAICA_COUNTRY_SLUG = 'jamaica';

function titleCase(slug: string): string {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function buildLocationKey(selection: JamaicaLocationSelection): string {
  const parts = [JAMAICA_COUNTRY_SLUG];
  if (selection.scope === 'country') return JAMAICA_COUNTRY_SLUG;
  if (!selection.county) return JAMAICA_COUNTRY_SLUG;
  parts.push(selection.county);
  if (selection.scope === 'county') return parts.join('/');
  if (!selection.parish) return parts.join('/');
  parts.push(selection.parish);
  if (selection.scope === 'parish') return parts.join('/');
  if (!selection.locality) return parts.join('/');
  parts.push(selection.locality);
  return parts.join('/');
}

export function parseLocationKey(key: string): {
  country: string;
  county?: string;
  parish?: string;
  locality?: string;
  scope: LocationScope;
} {
  const segments = key.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return { country: JAMAICA_COUNTRY_SLUG, scope: 'country' };
  }
  const [, county, parish, locality] = segments;
  if (locality) return { country: JAMAICA_COUNTRY_SLUG, county, parish, locality, scope: 'locality' };
  if (parish) return { country: JAMAICA_COUNTRY_SLUG, county, parish, scope: 'parish' };
  if (county) return { country: JAMAICA_COUNTRY_SLUG, county, scope: 'county' };
  return { country: JAMAICA_COUNTRY_SLUG, scope: 'country' };
}

export function locationKeysForFallback(key: string): string[] {
  const parts = key.split('/').filter(Boolean);
  const keys: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    keys.push(parts.slice(0, i).join('/'));
  }
  return keys;
}

export function selectionFromLocationKey(key: string): JamaicaLocationSelection {
  const parsed = parseLocationKey(key);
  return {
    scope: parsed.scope,
    county: parsed.county as JamaicaCountySlug | undefined,
    parish: parsed.parish,
    locality: parsed.locality,
  };
}

export function formatLocationLabel(key: string): string {
  const parsed = parseLocationKey(key);
  if (parsed.scope === 'country') return 'Jamaica (national)';
  const bits = [parsed.locality, parsed.parish, parsed.county].filter(Boolean).map((part) => titleCase(String(part)));
  return bits.join(', ') || key;
}
