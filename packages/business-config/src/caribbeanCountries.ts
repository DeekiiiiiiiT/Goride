/**
 * Caribbean markets for fare rules: country/territory → official currency (ISO 4217).
 * Jamaica retains sub-location keys via jamaicaLocations (county / parish / locality).
 */

export type CaribbeanCountry = {
  /** location_key prefix for non-Jamaica markets (whole country/territory). */
  slug: string;
  label: string;
  currencyCode: string;
  currencyLabel: string;
};

export const JAMAICA_MARKET_SLUG = 'jamaica';

/** Sorted by label for admin dropdowns. */
export const CARIBBEAN_COUNTRIES: CaribbeanCountry[] = [
  { slug: 'anguilla', label: 'Anguilla', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'antigua-and-barbuda', label: 'Antigua and Barbuda', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'aruba', label: 'Aruba', currencyCode: 'AWG', currencyLabel: 'Aruban Florin' },
  { slug: 'bahamas', label: 'Bahamas', currencyCode: 'BSD', currencyLabel: 'Bahamian Dollar' },
  { slug: 'barbados', label: 'Barbados', currencyCode: 'BBD', currencyLabel: 'Barbadian Dollar' },
  { slug: 'belize', label: 'Belize', currencyCode: 'BZD', currencyLabel: 'Belize Dollar' },
  { slug: 'bonaire', label: 'Bonaire (Caribbean Netherlands)', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'british-virgin-islands', label: 'British Virgin Islands', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'cayman-islands', label: 'Cayman Islands', currencyCode: 'KYD', currencyLabel: 'Cayman Islands Dollar' },
  { slug: 'cuba', label: 'Cuba', currencyCode: 'CUP', currencyLabel: 'Cuban Peso' },
  { slug: 'curacao', label: 'Curaçao', currencyCode: 'XCG', currencyLabel: 'Caribbean Guilder' },
  { slug: 'dominica', label: 'Dominica', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'dominican-republic', label: 'Dominican Republic', currencyCode: 'DOP', currencyLabel: 'Dominican Peso' },
  { slug: 'grenada', label: 'Grenada', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'guadeloupe', label: 'Guadeloupe', currencyCode: 'EUR', currencyLabel: 'Euro' },
  { slug: 'guyana', label: 'Guyana', currencyCode: 'GYD', currencyLabel: 'Guyanese Dollar' },
  { slug: 'haiti', label: 'Haiti', currencyCode: 'HTG', currencyLabel: 'Haitian Gourde' },
  { slug: JAMAICA_MARKET_SLUG, label: 'Jamaica', currencyCode: 'JMD', currencyLabel: 'Jamaican Dollar' },
  { slug: 'martinique', label: 'Martinique', currencyCode: 'EUR', currencyLabel: 'Euro' },
  { slug: 'montserrat', label: 'Montserrat', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'puerto-rico', label: 'Puerto Rico', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'saba', label: 'Saba (Caribbean Netherlands)', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'saint-barthelemy', label: 'Saint Barthélemy', currencyCode: 'EUR', currencyLabel: 'Euro' },
  { slug: 'saint-kitts-and-nevis', label: 'Saint Kitts and Nevis', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'saint-lucia', label: 'Saint Lucia', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'saint-martin', label: 'Saint Martin', currencyCode: 'EUR', currencyLabel: 'Euro' },
  { slug: 'saint-vincent-and-the-grenadines', label: 'Saint Vincent and the Grenadines', currencyCode: 'XCD', currencyLabel: 'Eastern Caribbean Dollar' },
  { slug: 'sint-eustatius', label: 'Sint Eustatius (Caribbean Netherlands)', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'sint-maarten', label: 'Sint Maarten', currencyCode: 'XCG', currencyLabel: 'Caribbean Guilder' },
  { slug: 'suriname', label: 'Suriname', currencyCode: 'SRD', currencyLabel: 'Surinamese Dollar' },
  { slug: 'trinidad-and-tobago', label: 'Trinidad and Tobago', currencyCode: 'TTD', currencyLabel: 'Trinidad and Tobago Dollar' },
  { slug: 'turks-and-caicos', label: 'Turks and Caicos Islands', currencyCode: 'USD', currencyLabel: 'US Dollar' },
  { slug: 'us-virgin-islands', label: 'U.S. Virgin Islands', currencyCode: 'USD', currencyLabel: 'US Dollar' },
];

const bySlug = new Map(CARIBBEAN_COUNTRIES.map((c) => [c.slug, c]));

export function getCaribbeanCountry(slug: string): CaribbeanCountry | undefined {
  return bySlug.get(slug);
}

export function isJamaicaMarket(slug: string): boolean {
  return slug === JAMAICA_MARKET_SLUG;
}

/** Unique currencies for display (code → label). */
export function caribbeanCurrencyOptions(): { code: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const c of CARIBBEAN_COUNTRIES) {
    if (!seen.has(c.currencyCode)) {
      seen.set(c.currencyCode, c.currencyLabel);
    }
  }
  return [...seen.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Infer market slug from a stored location_key.
 * Jamaica keys: `jamaica`, `jamaica/middlesex/clarendon`, etc.
 */
export function marketSlugFromLocationKey(locationKey: string): string {
  const key = locationKey.trim().toLowerCase();
  if (key === JAMAICA_MARKET_SLUG || key.startsWith(`${JAMAICA_MARKET_SLUG}/`)) {
    return JAMAICA_MARKET_SLUG;
  }
  const first = key.split('/')[0];
  if (bySlug.has(first)) return first;
  return JAMAICA_MARKET_SLUG;
}

export function currencyForMarket(slug: string): string {
  return getCaribbeanCountry(slug)?.currencyCode ?? 'JMD';
}
