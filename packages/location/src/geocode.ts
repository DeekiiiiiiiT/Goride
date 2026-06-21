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

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
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

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
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
