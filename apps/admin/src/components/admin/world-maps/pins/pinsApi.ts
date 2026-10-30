// Stitch: dominion-redesign/s36f-map-pins
import { geoFetch } from '../geoClient';

export type MapPin = {
  id: string;
  kind: string;
  name: string;
  lat: number;
  lng: number;
  pcode: string | null;
  status: string;
  area?: string;
};

export function kindLabel(kind: string): string {
  if (kind === 'town_centre') return 'Town centre';
  if (kind === 'landmark') return 'Landmark';
  if (kind === 'junction') return 'Junction';
  return kind;
}

export function pointInJamaica(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 17.6 && lat <= 18.6 && lng >= -78.5 && lng <= -76.1;
}

export function fetchPins(token: string): Promise<MapPin[]> {
  return geoFetch(token, '/geo/places').then((body) => (body.places as MapPin[]) ?? []);
}

export function savePin(token: string, pin: Partial<MapPin> & { reason: string }, id?: string) {
  return geoFetch(token, id ? `/geo/places/${id}` : '/geo/places', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(pin),
  });
}
