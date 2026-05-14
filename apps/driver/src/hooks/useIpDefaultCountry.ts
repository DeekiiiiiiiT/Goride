import { useEffect, useState } from 'react';
import { DEFAULT_PHONE_COUNTRY, getPhoneCountryByIso2, type PhoneCountry } from '../utils/phoneCountries';

async function fetchCountryIso2(signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('https://ipwho.is/', { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { success?: boolean; country_code?: string };
    if (data.success === false) return null;
    if (typeof data.country_code === 'string' && data.country_code.length === 2) {
      return data.country_code.toUpperCase();
    }
  } catch {
    /* try fallback */
  }
  try {
    const res = await fetch('https://ipapi.co/country/', { signal });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (/^[A-Z]{2}$/i.test(text)) return text.toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolves a default {@link PhoneCountry} from the visitor IP (client-side geo APIs).
 * Falls back to Jamaica / first curated country when lookup fails or country is not in the list.
 */
export function useIpDefaultCountry(): { country: PhoneCountry; geoReady: boolean } {
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [geoReady, setGeoReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 6000);

    void (async () => {
      try {
        const iso = await fetchCountryIso2(ac.signal);
        const match = getPhoneCountryByIso2(iso);
        if (match) setCountry(match);
      } finally {
        window.clearTimeout(t);
        setGeoReady(true);
      }
    })();

    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, []);

  return { country, geoReady };
}
