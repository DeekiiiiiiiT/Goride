import { reviewOdometerChange } from '../../../../packages/ui/src/odometer-scanner';
import { googleDirections, plugSend, publicGet, wazeDirections } from '../api';
import { currentPath, fallbackFor, isFuel, pathNeedsAccount, tabFor } from '../nav';
import { enqueue } from '../offline';
import { deviceFix, lastOdometer, vehicleId as openVehicle } from './facts';

export type PlugRuntime = {
  go: (path: string) => void;
  /** Leave a finished form and drop it, so Back does not reopen it. */
  finish: (path: string) => void;
  back: () => void;
  tab: (path: string) => void;
  toast: (text: string) => void;
  confirm: (message: string) => Promise<boolean>;
  signIn: (returnTo: string) => void;
  openSheet: (name: string) => void;
  closeSheet: () => void;
  signedIn: () => boolean;
  flagOn: (flag: string) => boolean;
  sendCode: (phone: string) => Promise<void>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  continueWithGoogle: () => Promise<void>;
};

let runtime: PlugRuntime | null = null;

export function setPlugRuntime(next: PlugRuntime | null) {
  runtime = next;
}

export function getPlugRuntime(): PlugRuntime {
  if (!runtime) throw new Error('Plug shell is missing');
  return runtime;
}

export function controlLabel(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.material-symbols-outlined').forEach((node) => node.remove());
  return (copy.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
}

export function iconName(el: HTMLElement): string {
  return el.querySelector('.material-symbols-outlined')?.textContent?.trim() || '';
}

export function screenFields(el: HTMLElement): Record<string, string | boolean> {
  const root = el.closest('[data-plug-screen]') || document;
  const fields: Record<string, string | boolean> = {};
  root.querySelectorAll('input, textarea, select').forEach((node) => {
    const field = node as HTMLInputElement;
    if (!field.id) return;
    fields[field.id] = field.type === 'checkbox' ? field.checked : field.value;
  });
  return fields;
}

export function vehicleId(): string | null {
  return openVehicle();
}

export function garagePath(suffix = ''): string {
  const id = openVehicle();
  if (!id) return '/garage';
  return suffix ? `/garage/${id}/${suffix}` : `/garage/${id}`;
}

export function phoneFrom(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1876')) return `+${digits}`;
  if (digits.startsWith('876')) return `+1${digits}`;
  return `+1876${digits}`;
}

export async function openDirections(stationId?: string) {
  const id = stationId || sessionStorage.getItem('plug-station') || '';
  let station: { id: string; lat: number; lng: number; name: string } | null = null;
  if (id) {
    try {
      const body = await publicGet<{ station: { id: string; lat: number; lng: number; name: string } }>(`/stations/${id}`);
      station = body.station;
    } catch {
      station = null;
    }
  }
  if (!station) return;
  sessionStorage.setItem('plug-station', station.id);
  sessionStorage.setItem('plug-station-lat', String(station.lat));
  sessionStorage.setItem('plug-station-lng', String(station.lng));
  getPlugRuntime().openSheet('directions');
}

export function launchDirections(app: 'google' | 'waze') {
  const lat = Number(sessionStorage.getItem('plug-station-lat'));
  const lng = Number(sessionStorage.getItem('plug-station-lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const url = app === 'waze' ? wazeDirections(lat, lng) : googleDirections(lat, lng);
  window.open(url, '_blank', 'noopener');
  getPlugRuntime().closeSheet();
}

export function gradeKey(el: HTMLElement, label: string): string | null {
  const raw = el.dataset.plugGrade || el.dataset.grade || '';
  if (raw === '87' || raw === 'e10_87' || /e-?10\s*87/i.test(label)) return 'e10_87';
  if (raw === '90' || raw === 'e10_90' || /e-?10\s*90/i.test(label)) return 'e10_90';
  if (raw === 'ulsd' || raw === 'diesel' || /ulsd|diesel/i.test(label)) return 'diesel';
  return null;
}

export function rememberGrade(grade: string, el: HTMLElement) {
  sessionStorage.setItem('plug-grade', grade);
  const group = el.parentElement;
  group?.querySelectorAll('button').forEach((button) => {
    const on = gradeKey(button, controlLabel(button)) === grade;
    button.classList.toggle('bg-secondary', on);
    button.classList.toggle('text-on-secondary', on);
    button.classList.toggle('bg-secondary-container', on);
    button.classList.toggle('text-on-primary', on);
  });
  window.dispatchEvent(new Event('plug-refresh'));
}

export async function saveFuel(el: HTMLElement) {
  const rt = getPlugRuntime();
  const fields = screenFields(el);
  const grade = sessionStorage.getItem('plug-grade') || 'e10_87';
  const odometer = Number(sessionStorage.getItem('plug-odometer') || fields.odometerInput || 0);
  const amount = Number(fields['amount-input'] || 0);
  const litres = Number(fields['litres-input'] || 0);
  const vehicle = vehicleId();
  const fix = deviceFix();
  if (!vehicle || !fix) {
    rt.go('/fuel/error');
    return;
  }
  const payload = {
    vehicleId: vehicle,
    grade,
    amount,
    litres,
    odometer,
    stationId: sessionStorage.getItem('plug-station'),
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.accuracyM,
    confirmed: true,
  };
  if (!navigator.onLine) {
    enqueue('/fuel-logs', payload);
    rt.toast('Saved on this phone. It will send when you are back online.');
    rt.go('/fuel/offline');
    return;
  }
  try {
    const saved = await plugSend<{ first?: boolean }>('/fuel-logs', 'POST', payload);
    if (saved.first) sessionStorage.setItem('plug-first-fill', '1');
    else sessionStorage.removeItem('plug-first-fill');
    rt.go('/fuel/saved');
  } catch (err) {
    rt.toast(err instanceof Error ? err.message : 'Could not save that fill');
  }
}

export function odometerWarning(reading: number): string | null {
  const last = lastOdometer();
  const issue = reviewOdometerChange(last, reading);
  if (issue === 'drop') return 'That reading is lower than the last one. Confirm to continue.';
  if (issue === 'jump') return 'That reading jumped more than 1,500 km. Confirm to continue.';
  return null;
}

export function goPath(path: string) {
  const rt = getPlugRuntime();
  const here = currentPath();
  if (path.startsWith('/fuel') && !isFuel(here)) sessionStorage.setItem('plug-fuel-from', here);
  if (!rt.signedIn() && pathNeedsAccount(path)) {
    rt.signIn(path);
    return;
  }
  const tab = tabFor(path, null);
  if (rt.signedIn() && tab === 'garage' && !rt.flagOn('plug.garage')) return;
  if (rt.signedIn() && tab === 'map' && !rt.flagOn('plug.map_it')) return;
  if (rt.signedIn() && path.startsWith('/fuel') && !rt.flagOn('plug.fuel_log')) return;
  if (rt.signedIn() && path.startsWith('/parts') && !rt.flagOn('plug.parts')) return;
  if (rt.signedIn() && path === '/tolls' && !rt.flagOn('plug.tolls')) return;
  rt.go(path);
}

export { fallbackFor };
