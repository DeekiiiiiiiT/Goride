/**
 * Jamaica fare-rule geography: counties → parishes → towns/localities.
 * Keep in sync with supabase/functions/rides/fare/jamaicaLocations.ts
 */

export type JamaicaCountySlug = 'cornwall' | 'middlesex' | 'surrey';

export type JamaicaLocality = {
  slug: string;
  label: string;
  /** Optional centroid for pickup matching (nearest within parish). */
  lat?: number;
  lng?: number;
  isCapital?: boolean;
};

export type JamaicaParish = {
  slug: string;
  label: string;
  localities: JamaicaLocality[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
};

export type JamaicaCounty = {
  slug: JamaicaCountySlug;
  label: string;
  parishes: JamaicaParish[];
};

export const JAMAICA_COUNTRY_SLUG = 'jamaica';

export const JAMAICA_COUNTIES: JamaicaCounty[] = [
  {
    slug: 'cornwall',
    label: 'Cornwall County (Western Jamaica)',
    parishes: [
      {
        slug: 'hanover',
        label: 'Hanover',
        bounds: { minLat: 18.28, maxLat: 18.45, minLng: -78.42, maxLng: -78.08 },
        localities: [
          { slug: 'lucea', label: 'Lucea', isCapital: true, lat: 18.451, lng: -78.174 },
          { slug: 'sandy-bay', label: 'Sandy Bay' },
          { slug: 'green-island', label: 'Green Island', lat: 18.256, lng: -78.235 },
          { slug: 'hopewell', label: 'Hopewell' },
          { slug: 'cascade', label: 'Cascade' },
          { slug: 'bethel-town-hanover', label: 'Bethel Town' },
        ],
      },
      {
        slug: 'saint-elizabeth',
        label: 'Saint Elizabeth',
        bounds: { minLat: 17.84, maxLat: 18.25, minLng: -78.35, maxLng: -77.72 },
        localities: [
          { slug: 'black-river', label: 'Black River', isCapital: true, lat: 18.026, lng: -77.853 },
          { slug: 'santa-cruz', label: 'Santa Cruz', lat: 18.053, lng: -77.699 },
          { slug: 'balaclava', label: 'Balaclava' },
          { slug: 'junction', label: 'Junction' },
          { slug: 'maggotty', label: 'Maggotty' },
          { slug: 'bull-savanna', label: 'Bull Savanna' },
          { slug: 'lacovia', label: 'Lacovia' },
          { slug: 'new-market', label: 'New Market' },
        ],
      },
      {
        slug: 'saint-james',
        label: 'Saint James',
        bounds: { minLat: 18.35, maxLat: 18.55, minLng: -78.08, maxLng: -77.72 },
        localities: [
          { slug: 'montego-bay', label: 'Montego Bay', isCapital: true, lat: 18.471, lng: -77.919 },
          { slug: 'anchovy', label: 'Anchovy' },
          { slug: 'cambridge', label: 'Cambridge' },
          { slug: 'adelphi', label: 'Adelphi' },
          { slug: 'reading', label: 'Reading' },
          { slug: 'montpelier', label: 'Montpelier' },
          { slug: 'rose-hall', label: 'Rose Hall', lat: 18.525, lng: -77.82 },
        ],
      },
      {
        slug: 'trelawny',
        label: 'Trelawny',
        bounds: { minLat: 18.28, maxLat: 18.52, minLng: -77.78, maxLng: -77.42 },
        localities: [
          { slug: 'falmouth', label: 'Falmouth', isCapital: true, lat: 18.492, lng: -77.656 },
          { slug: 'wakefield', label: 'Wakefield' },
          { slug: 'clarks-town', label: 'Clarks Town' },
          { slug: 'rio-bueno', label: 'Rio Bueno' },
          { slug: 'albert-town-trelawny', label: 'Albert Town' },
          { slug: 'duncans', label: 'Duncans' },
          { slug: 'wait-a-bit', label: 'Wait-a-Bit' },
        ],
      },
      {
        slug: 'westmoreland',
        label: 'Westmoreland',
        bounds: { minLat: 18.15, maxLat: 18.38, minLng: -78.42, maxLng: -77.88 },
        localities: [
          { slug: 'savanna-la-mar', label: 'Savanna-la-Mar', isCapital: true, lat: 18.214, lng: -78.133 },
          { slug: 'negril', label: 'Negril', lat: 18.268, lng: -78.348 },
          { slug: 'little-london', label: 'Little London' },
          { slug: 'grange-hill', label: 'Grange Hill' },
          { slug: 'bethel-town-westmoreland', label: 'Bethel Town' },
          { slug: 'bluefields', label: 'Bluefields', lat: 18.172, lng: -78.027 },
        ],
      },
    ],
  },
  {
    slug: 'middlesex',
    label: 'Middlesex County (Central Jamaica)',
    parishes: [
      {
        slug: 'clarendon',
        label: 'Clarendon',
        bounds: { minLat: 17.82, maxLat: 18.22, minLng: -77.52, maxLng: -77.12 },
        localities: [
          { slug: 'may-pen', label: 'May Pen', isCapital: true, lat: 17.964, lng: -77.245 },
          { slug: 'chapelton', label: 'Chapelton' },
          { slug: 'hayes', label: 'Hayes' },
          { slug: 'kellits', label: 'Kellits' },
          { slug: 'lionel-town', label: 'Lionel Town' },
          { slug: 'frankfield', label: 'Frankfield' },
          { slug: 'rocky-point', label: 'Rocky Point' },
          { slug: 'aenon-town', label: 'Aenon Town' },
          { slug: 'alston', label: 'Alston' },
        ],
      },
      {
        slug: 'manchester',
        label: 'Manchester',
        bounds: { minLat: 17.88, maxLat: 18.22, minLng: -77.62, maxLng: -77.32 },
        localities: [
          { slug: 'mandeville', label: 'Mandeville', isCapital: true, lat: 18.047, lng: -77.507 },
          { slug: 'christiana', label: 'Christiana' },
          { slug: 'porus', label: 'Porus' },
          { slug: 'mile-gully', label: 'Mile Gully' },
          { slug: 'alligator-pond', label: 'Alligator Pond', lat: 17.869, lng: -77.565 },
          { slug: 'williamsfield', label: 'Williamsfield' },
        ],
      },
      {
        slug: 'saint-ann',
        label: 'Saint Ann',
        bounds: { minLat: 18.2, maxLat: 18.48, minLng: -77.42, maxLng: -77.02 },
        localities: [
          { slug: 'saint-anns-bay', label: "Saint Ann's Bay", isCapital: true, lat: 18.436, lng: -77.201 },
          { slug: 'ocho-rios', label: 'Ocho Rios', lat: 18.408, lng: -77.103 },
          { slug: 'browns-town', label: "Brown's Town", lat: 18.388, lng: -77.365 },
          { slug: 'runaway-bay', label: 'Runaway Bay', lat: 18.456, lng: -77.335 },
          { slug: 'discovery-bay', label: 'Discovery Bay', lat: 18.458, lng: -77.397 },
          { slug: 'bamboo', label: 'Bamboo' },
          { slug: 'moneague', label: 'Moneague' },
          { slug: 'alexandria', label: 'Alexandria' },
          { slug: 'cave-valley', label: 'Cave Valley' },
        ],
      },
      {
        slug: 'saint-catherine',
        label: 'Saint Catherine',
        bounds: { minLat: 17.88, maxLat: 18.18, minLng: -77.22, maxLng: -76.88 },
        localities: [
          { slug: 'spanish-town', label: 'Spanish Town', isCapital: true, lat: 17.996, lng: -76.954 },
          { slug: 'portmore', label: 'Portmore', lat: 17.957, lng: -76.882 },
          { slug: 'old-harbour', label: 'Old Harbour', lat: 17.941, lng: -77.109 },
          { slug: 'linstead', label: 'Linstead', lat: 18.152, lng: -77.032 },
          { slug: 'bog-walk', label: 'Bog Walk' },
          { slug: 'ewarton', label: 'Ewarton' },
          { slug: 'above-rocks', label: 'Above Rocks' },
          { slug: 'old-harbour-bay', label: 'Old Harbour Bay' },
        ],
      },
      {
        slug: 'saint-mary',
        label: 'Saint Mary',
        bounds: { minLat: 18.22, maxLat: 18.42, minLng: -77.12, maxLng: -76.72 },
        localities: [
          { slug: 'port-maria', label: 'Port Maria', isCapital: true, lat: 18.369, lng: -76.889 },
          { slug: 'annotto-bay', label: 'Annotto Bay', lat: 18.276, lng: -76.764 },
          { slug: 'highgate', label: 'Highgate' },
          { slug: 'gayle', label: 'Gayle' },
          { slug: 'oracabessa', label: 'Oracabessa', lat: 18.403, lng: -76.946 },
          { slug: 'carron-hall', label: 'Carron Hall' },
          { slug: 'islington', label: 'Islington' },
        ],
      },
    ],
  },
  {
    slug: 'surrey',
    label: 'Surrey County (Eastern Jamaica)',
    parishes: [
      {
        slug: 'kingston',
        label: 'Kingston',
        bounds: { minLat: 17.92, maxLat: 18.02, minLng: -76.87, maxLng: -76.72 },
        localities: [
          { slug: 'kingston', label: 'Kingston', isCapital: true, lat: 17.971, lng: -76.793 },
          { slug: 'downtown-kingston', label: 'Downtown Kingston', lat: 17.968, lng: -76.793 },
          { slug: 'new-kingston', label: 'New Kingston', lat: 18.007, lng: -76.783 },
          { slug: 'tivoli-gardens', label: 'Tivoli Gardens' },
          { slug: 'denham-town', label: 'Denham Town' },
          { slug: 'harbour-view', label: 'Harbour View', lat: 17.944, lng: -76.722 },
          { slug: 'port-royal', label: 'Port Royal', lat: 17.937, lng: -76.841 },
        ],
      },
      {
        slug: 'saint-andrew',
        label: 'Saint Andrew',
        bounds: { minLat: 17.98, maxLat: 18.12, minLng: -76.92, maxLng: -76.68 },
        localities: [
          { slug: 'half-way-tree', label: 'Half Way Tree', isCapital: true, lat: 18.013, lng: -76.799 },
          { slug: 'constant-spring', label: 'Constant Spring' },
          { slug: 'papine', label: 'Papine', lat: 18.021, lng: -76.745 },
          { slug: 'stony-hill', label: 'Stony Hill' },
          { slug: 'barbican', label: 'Barbican' },
          { slug: 'liguanea', label: 'Liguanea', lat: 18.018, lng: -76.744 },
          { slug: 'mona', label: 'Mona' },
          { slug: 'gordon-town', label: 'Gordon Town' },
          { slug: 'bull-bay', label: 'Bull Bay', lat: 17.942, lng: -76.667 },
          { slug: 'mavis-bank', label: 'Mavis Bank' },
          { slug: 'newcastle', label: 'Newcastle' },
        ],
      },
      {
        slug: 'portland',
        label: 'Portland',
        bounds: { minLat: 18.08, maxLat: 18.28, minLng: -76.62, maxLng: -76.32 },
        localities: [
          { slug: 'port-antonio', label: 'Port Antonio', isCapital: true, lat: 18.177, lng: -76.451 },
          { slug: 'buff-bay', label: 'Buff Bay' },
          { slug: 'manchioneal', label: 'Manchioneal' },
          { slug: 'hope-bay', label: 'Hope Bay' },
          { slug: 'fairy-hill', label: 'Fairy Hill' },
        ],
      },
      {
        slug: 'saint-thomas',
        label: 'Saint Thomas',
        bounds: { minLat: 17.84, maxLat: 18.08, minLng: -76.48, maxLng: -76.22 },
        localities: [
          { slug: 'morant-bay', label: 'Morant Bay', isCapital: true, lat: 17.881, lng: -76.409 },
          { slug: 'yallahs', label: 'Yallahs' },
          { slug: 'bath', label: 'Bath' },
          { slug: 'seaforth', label: 'Seaforth' },
          { slug: 'cedar-valley', label: 'Cedar Valley' },
        ],
      },
    ],
  },
];

export type LocationScope = 'country' | 'county' | 'parish' | 'locality';

export type JamaicaLocationSelection = {
  scope: LocationScope;
  county?: JamaicaCountySlug;
  parish?: string;
  locality?: string;
};

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-');
}

/** Canonical fare-rule key: jamaica[/county[/parish[/locality]]] */
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

/** Keys from most specific to broadest for fare-rule fallback lookup. */
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

export function findParishBySlug(parishSlug: string): { county: JamaicaCounty; parish: JamaicaParish } | null {
  for (const county of JAMAICA_COUNTIES) {
    const parish = county.parishes.find((p) => p.slug === parishSlug);
    if (parish) return { county, parish };
  }
  return null;
}

export function formatLocationLabel(key: string): string {
  const parsed = parseLocationKey(key);
  if (parsed.scope === 'country') return 'Jamaica (national)';
  const county = JAMAICA_COUNTIES.find((c) => c.slug === parsed.county);
  if (parsed.scope === 'county' && county) return county.label;
  const parish = county?.parishes.find((p) => p.slug === parsed.parish);
  if (parsed.scope === 'parish' && parish) return `${parish.label}, ${county?.label ?? ''}`;
  const loc = parish?.localities.find((l) => l.slug === parsed.locality);
  if (loc && parish) return `${loc.label}, ${parish.label}`;
  return key;
}

export function normalizeLocalitySlug(label: string): string {
  return slug(label);
}
