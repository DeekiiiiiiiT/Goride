const STORAGE_KEY = 'roam:driver:bg-location-disclosure:v1';

export function hasAcceptedDriverBackgroundLocationDisclosure(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'accepted';
}

export function acceptDriverBackgroundLocationDisclosure(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, 'accepted');
}

export function clearDriverBackgroundLocationDisclosure(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
