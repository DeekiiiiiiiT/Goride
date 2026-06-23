import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { GeocodeResult, LocationValue } from './types';
import { loadPartnerMapsApi } from './maps';

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function looksLikePlusCode(addr: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]+/i.test(addr.trim());
}

function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  formattedAddress: string,
): Pick<GeocodeResult, 'streetAddress' | 'city' | 'postalCode'> {
  let streetAddress = '';
  let city = '';
  let postalCode = '';
  for (const component of components || []) {
    const types = component.types;
    if (types.includes('route')) streetAddress = component.long_name;
    if (types.includes('street_number')) {
      streetAddress = `${component.long_name} ${streetAddress}`.trim();
    }
    if (types.includes('locality')) city = component.long_name;
    if (types.includes('administrative_area_level_1') && !city) {
      city = component.long_name;
    }
    if (types.includes('postal_code')) postalCode = component.long_name;
  }
  return {
    streetAddress: streetAddress || formattedAddress.split(',')[0] || '',
    city,
    postalCode,
  };
}

function parseGeocoderResult(
  result: google.maps.GeocoderResult,
  fallbackLat: number,
  fallbackLng: number,
): GeocodeResult {
  const location = result.geometry?.location;
  const formattedAddress = result.formatted_address || '';
  const parsed = parseAddressComponents(result.address_components, formattedAddress);
  return {
    lat: location?.lat() ?? fallbackLat,
    lng: location?.lng() ?? fallbackLng,
    formattedAddress,
    ...parsed,
  };
}

function pickBestGeocoderResult(results: google.maps.GeocoderResult[]): google.maps.GeocoderResult {
  return (
    results.find(
      (r) => !r.types?.includes('plus_code') && !looksLikePlusCode(r.formatted_address || ''),
    ) || results[0]
  );
}

async function getClientGeocoder(): Promise<google.maps.Geocoder> {
  await loadPartnerMapsApi();
  if (google.maps.importLibrary) {
    const { Geocoder } = (await google.maps.importLibrary('geocoding')) as google.maps.GeocodingLibrary;
    return new Geocoder();
  }
  return new google.maps.Geocoder();
}

async function reverseGeocodeClient(lat: number, lng: number): Promise<GeocodeResult> {
  const geocoder = await getClientGeocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== 'OK' || !results?.length) {
        reject(new Error(`Reverse geocoding failed: ${status}`));
        return;
      }
      resolve(parseGeocoderResult(pickBestGeocoderResult(results), lat, lng));
    });
  });
}

async function geocodeAddressClient(address: string): Promise<GeocodeResult> {
  const geocoder = await getClientGeocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address, region: 'jm' }, (results, status) => {
      if (status !== 'OK' || !results?.length) {
        reject(new Error(`Geocoding failed: ${status}`));
        return;
      }
      const primary = pickBestGeocoderResult(results);
      const location = primary.geometry?.location;
      if (!location) {
        reject(new Error('Geocoding failed: no coordinates'));
        return;
      }
      resolve(parseGeocoderResult(primary, location.lat(), location.lng()));
    });
  });
}

async function reverseGeocodeServer(lat: number, lng: number): Promise<GeocodeResult> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/geo/reverse-geocode`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Reverse geocoding failed');
  }
  return res.json();
}

async function geocodeAddressServer(address: string): Promise<GeocodeResult> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/geo/geocode`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Geocoding failed');
  }
  return res.json();
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (typeof window !== 'undefined') {
    try {
      return await geocodeAddressClient(address);
    } catch {
      // Fall back to server when client geocoder is unavailable.
    }
  }
  return geocodeAddressServer(address);
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  if (typeof window !== 'undefined') {
    try {
      return await reverseGeocodeClient(lat, lng);
    } catch {
      // Fall back to server when client geocoder is unavailable.
    }
  }
  return reverseGeocodeServer(lat, lng);
}

export interface AddressSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  if (!query.trim()) return [];
  await loadPartnerMapsApi();

  const { AutocompleteSuggestion } = (await google.maps.importLibrary(
    'places',
  )) as google.maps.PlacesLibrary;

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    includedRegionCodes: ['jm'],
  });

  return suggestions.map((s) => {
    const pred = s.placePrediction;
    return {
      placeId: pred?.placeId || '',
      description: pred?.text?.text || '',
      mainText: pred?.mainText?.text || pred?.text?.text || '',
      secondaryText: pred?.secondaryText?.text || '',
    };
  });
}

export async function getPlaceDetails(placeId: string): Promise<LocationValue> {
  await loadPartnerMapsApi();
  const { Place } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const place = new Place({ id: placeId });
  await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents'] });

  const location = place.location;
  if (!location) throw new Error('Place has no coordinates');

  let streetAddress = '';
  let city = '';
  let postalCode = '';
  for (const component of place.addressComponents || []) {
    const types = component.types;
    if (types.includes('route')) streetAddress = component.longText || '';
    if (types.includes('street_number')) {
      streetAddress = `${component.longText} ${streetAddress}`.trim();
    }
    if (types.includes('locality')) city = component.longText || '';
    if (types.includes('administrative_area_level_1') && !city) {
      city = component.longText || '';
    }
    if (types.includes('postal_code')) postalCode = component.longText || '';
  }

  return {
    lat: location.lat(),
    lng: location.lng(),
    formattedAddress: place.formattedAddress || '',
    streetAddress: streetAddress || place.formattedAddress?.split(',')[0] || '',
    city,
    postalCode,
    placeId,
  };
}
