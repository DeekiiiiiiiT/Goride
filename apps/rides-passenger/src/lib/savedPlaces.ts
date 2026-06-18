import type { PassengerSavedPlaceIcon, PassengerSavedPlaceRow } from '@roam/types/passengerSavedPlaces';

export type SavedPlaceIcon = PassengerSavedPlaceIcon;
export type SavedPlace = PassengerSavedPlaceRow;

export const SAVED_PLACE_ICONS: { id: SavedPlaceIcon; labelKey: string }[] = [
  { id: 'home', labelKey: 'places.icons.home' },
  { id: 'work', labelKey: 'places.icons.work' },
  { id: 'saved', labelKey: 'places.icons.saved' },
  { id: 'star', labelKey: 'places.icons.star' },
  { id: 'gym', labelKey: 'places.icons.gym' },
  { id: 'school', labelKey: 'places.icons.school' },
];

const LEGACY_STORAGE_KEY = 'roam-passenger-saved-places';

type LegacySavedPlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon: SavedPlaceIcon;
  createdAt: string;
};

export function readLegacySavedPlaces(): LegacySavedPlace[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacySavedPlace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacySavedPlaces() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function getHomePlace(places: SavedPlace[]) {
  return places.find((p) => p.icon === 'home');
}

export function getWorkPlace(places: SavedPlace[]) {
  return places.find((p) => p.icon === 'work');
}

export function getOtherPlaces(places: SavedPlace[]) {
  return places.filter((p) => p.icon !== 'home' && p.icon !== 'work');
}

export function getBookingShortcuts(places: SavedPlace[]) {
  const home = getHomePlace(places);
  const work = getWorkPlace(places);
  const others = getOtherPlaces(places).slice(0, 3);
  return [home, work, ...others].filter(Boolean) as SavedPlace[];
}
