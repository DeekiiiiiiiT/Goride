import { geocodeAddress, reverseGeocode } from '@roam/location';
import {
  decodePlusCode,
  extractCodePortion,
  extractLocality,
  isFullPlusCode,
  isValidPlusCode,
  recoverShortCode,
} from '@roam/platform-ops-ui/utils/plusCode';

export type StorePin = {
  address: string;
  lat: string;
  lng: string;
};

/** Plus Code token, including a short code with the locality that follows it. */
export function plusCodeQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = extractCodePortion(trimmed);
  if (isValidPlusCode(direct)) {
    const locality = extractLocality(trimmed);
    return locality ? `${direct} ${locality}` : direct;
  }
  const match = trimmed.toUpperCase().match(/[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}/);
  if (!match || !isValidPlusCode(match[0])) return null;
  const after = trimmed.slice(trimmed.toUpperCase().indexOf(match[0]) + match[0].length).replace(/^[\s,]+/, '');
  const locality = after.split(',')[0]?.trim();
  if (locality && !isFullPlusCode(match[0])) return `${match[0]} ${locality}`;
  return match[0];
}

function pin(address: string, lat: number, lng: number): StorePin {
  return {
    address,
    lat: lat.toFixed(7),
    lng: lng.toFixed(7),
  };
}

async function resolvePlusCode(query: string): Promise<StorePin> {
  const codePart = extractCodePortion(query);
  if (!isValidPlusCode(codePart)) {
    throw new Error('That Plus Code is not valid. Paste the code from Google Maps, or a street address.');
  }
  let fullCode = codePart;
  if (!isFullPlusCode(codePart)) {
    const locality = extractLocality(query);
    if (!locality) {
      throw new Error('A short Plus Code needs the area after it, for example X36X+5W Portmore.');
    }
    const reference = await geocodeAddress(`${locality}, Jamaica`);
    const recovered = recoverShortCode(codePart, reference.lat, reference.lng);
    if (!recovered) {
      throw new Error('Could not place that short Plus Code. Paste the full code from Google Maps.');
    }
    fullCode = recovered;
  }
  const decoded = decodePlusCode(fullCode);
  if (!decoded) throw new Error('Could not read that Plus Code.');
  try {
    const place = await reverseGeocode(decoded.lat, decoded.lng);
    const address = place.streetAddress || place.formattedAddress;
    if (!address) throw new Error('no address');
    return pin(address, decoded.lat, decoded.lng);
  } catch {
    return pin(query.trim(), decoded.lat, decoded.lng);
  }
}

/** Same pin rules as a Dominion fuel station: Plus Code decodes locally, a street address is looked up. */
export async function resolveStorePin(raw: string): Promise<StorePin> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Paste a Plus Code or address first.');
  const code = plusCodeQuery(trimmed);
  if (code) return resolvePlusCode(code);
  const found = await geocodeAddress(trimmed.toLowerCase().includes('jamaica') ? trimmed : `${trimmed}, Jamaica`);
  const address = found.formattedAddress || found.streetAddress || trimmed;
  return pin(address, found.lat, found.lng);
}
