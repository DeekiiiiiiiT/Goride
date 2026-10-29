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

export function preferredGrade(): string {
  return sessionStorage.getItem('plug-preferred-grade')
    || sessionStorage.getItem('plug-grade')
    || 'e10_87';
}

export function rememberGrade(grade: string, el: HTMLElement) {
  sessionStorage.setItem('plug-grade', grade);
  if (!sessionStorage.getItem('plug-preferred-grade')) {
    sessionStorage.setItem('plug-preferred-grade', grade);
  }
  const tray = el.closest('[data-grade-tray], [data-plug-grades], #grades-tray, #grade-selector');
  const group = tray || el.parentElement;
  const lockedTray = Boolean(el.closest('[data-grade-tray], #grades-tray') || group?.id === 'grades-tray' || (group as HTMLElement | null)?.dataset?.gradeTray);
  group?.querySelectorAll('button').forEach((button) => {
    const on = gradeKey(button, controlLabel(button)) === grade;
    if (lockedTray) {
      button.classList.toggle('bg-primary-container', on);
      button.classList.toggle('text-on-primary-container', on);
      button.classList.toggle('shadow-sm', on);
      button.classList.toggle('bg-surface-container', !on);
      button.classList.toggle('text-on-surface', !on);
    } else {
      button.classList.toggle('bg-secondary', on);
      button.classList.toggle('text-on-secondary', on);
      button.classList.toggle('bg-secondary-container', on);
      button.classList.toggle('text-on-primary', on);
    }
  });
  const root = el.closest<HTMLElement>('[data-plug-screen]');
  if (root) paintLockedGradeChrome(root, grade);
  window.dispatchEvent(new Event('plug-refresh'));
}

function gradeTitle(grade: string): string {
  if (grade === 'e10_90') return 'Super Premium';
  if (grade === 'diesel' || grade === 'ulsd') return 'Ultra Low Sulfur';
  return 'Unleaded Regular';
}

export function paintLockedGradeChrome(root: HTMLElement, selected?: string | null) {
  const preferred = preferredGrade();
  const current = selected || sessionStorage.getItem('plug-grade') || preferred;
  const label = current === 'e10_90' ? 'E-10 90' : current === 'diesel' || current === 'ulsd' ? 'ULSD' : 'E-10 87';
  const preferredLabel = preferred === 'e10_90' ? 'E-10 90' : preferred === 'diesel' || preferred === 'ulsd' ? 'ULSD' : 'E-10 87';
  const car = sessionStorage.getItem('plug-car-name') || 'your car';
  root.querySelectorAll<HTMLElement>('[data-slot="locked-grade-badge"]').forEach((node) => {
    node.textContent = label;
    node.className = current === 'e10_90'
      ? 'bg-rose-700 text-surface-container-lowest font-headline-sm text-headline-sm px-3 py-1 rounded-lg tracking-wide shadow-sm'
      : current === 'diesel' || current === 'ulsd'
        ? 'bg-inverse-surface text-inverse-on-surface font-headline-sm text-headline-sm px-3 py-1 rounded-lg tracking-wide shadow-sm'
        : 'bg-[#16a34a] text-surface-container-lowest font-headline-sm text-headline-sm px-3 py-1 rounded-lg tracking-wide shadow-sm';
  });
  root.querySelectorAll<HTMLElement>('[data-slot="locked-grade-title"]').forEach((node) => {
    node.textContent = gradeTitle(current);
  });
  root.querySelectorAll<HTMLElement>('[data-slot="locked-grade-callout"]').forEach((node) => {
    node.innerHTML = `From your <strong class="text-on-surface font-semibold">${car}</strong> — normally runs on ${preferredLabel}.`;
  });
  root.querySelectorAll<HTMLElement>('[data-slot="grade-mismatch-note"]').forEach((node) => {
    node.textContent = `Your car normally runs on ${preferredLabel}. Choosing another grade will flag a quick verification before pushing rates to the Roam Plug island map.`;
  });
  root.querySelectorAll<HTMLElement>('[data-grade-hint]').forEach((node) => {
    const key = node.dataset.gradeHint || '';
    node.textContent = key === preferred ? 'Recommended' : node.textContent || '';
    if (key === 'e10_87' && preferred !== 'e10_87') node.textContent = 'Regular';
    if (key === preferred) node.textContent = 'Recommended';
  });
  const tray = root.querySelector('#grades-tray, [data-grade-tray]');
  tray?.querySelectorAll('button').forEach((button) => {
    const on = gradeKey(button as HTMLElement, controlLabel(button as HTMLElement)) === current;
    button.classList.toggle('bg-primary-container', on);
    button.classList.toggle('text-on-primary-container', on);
    button.classList.toggle('shadow-sm', on);
    button.classList.toggle('bg-surface-container', !on);
    button.classList.toggle('text-on-surface', !on);
  });
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
  const queuedAt = new Date().toISOString();
  const remember = (savedAt: string) => {
    sessionStorage.setItem('plug-last-fill', JSON.stringify({
      stationName: sessionStorage.getItem('plug-station-name') || '',
      grade,
      amount,
      litres,
      odometer,
      savedAt,
    }));
  };
  if (!navigator.onLine) {
    remember(queuedAt);
    enqueue('/fuel-logs', payload);
    rt.toast('Saved on this phone. It will send when you are back online.');
    rt.go('/fuel/offline');
    return;
  }
  try {
    const saved = await plugSend<{ first?: boolean; createdAt?: string; priceStatus?: string }>('/fuel-logs', 'POST', payload);
    remember(saved.createdAt || queuedAt);
    sessionStorage.setItem('plug-price-status', saved.priceStatus || 'checking');
    if (saved.priceStatus === 'published') rt.toast('That price is on the map.');
    else if (saved.priceStatus === 'review') rt.toast('That price is waiting for a check before it goes on the map.');
    else rt.toast('Checking that price.');
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

export function sectionFlag(path: string): string | null {
  if (path === '/paused') return null;
  if (path.includes('/documents')) return 'plug.documents';
  if (path.startsWith('/garage')) return 'plug.garage';
  if (path.startsWith('/fuel')) return 'plug.fuel_log';
  if (path.startsWith('/parts')) return 'plug.parts';
  if (path.startsWith('/map') || path.startsWith('/contributions') || path.startsWith('/pending') || path.startsWith('/parish')) return 'plug.map_it';
  if (path === '/tolls') return 'plug.tolls';
  if (path === '/explore' || path.startsWith('/explore/')) return 'plug.explore';
  return null;
}

export function goPath(path: string) {
  const rt = getPlugRuntime();
  const here = currentPath();
  if (path.startsWith('/fuel') && !isFuel(here)) sessionStorage.setItem('plug-fuel-from', here);
  const flag = sectionFlag(path);
  if (flag && !rt.flagOn(flag)) {
    rt.go('/paused');
    return;
  }
  if (!rt.signedIn() && pathNeedsAccount(path)) {
    rt.signIn(path);
    return;
  }
  rt.go(path);
}

export { fallbackFor };
