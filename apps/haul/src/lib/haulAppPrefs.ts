const PREFS_KEY = 'roam-haul:app-prefs';

export type AppearanceMode = 'light' | 'dark';
export type UnitsMode = 'metric' | 'imperial';
export type NavigationApp = 'google_maps' | 'apple_maps' | 'waze';

export type HaulAppPrefs = {
  appearance: AppearanceMode;
  units: UnitsMode;
  language: string;
  navigationApp: NavigationApp;
};

const DEFAULT_PREFS: HaulAppPrefs = {
  appearance: 'dark',
  units: 'imperial',
  language: 'English',
  navigationApp: 'google_maps',
};

export function readAppPrefs(): HaulAppPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<HaulAppPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeAppPrefs(prefs: HaulAppPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

const REMINDER_KEY = 'roam-haul:departure-reminders';

export function readDepartureReminder(jobId: string): boolean {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (!raw) return true;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return map[jobId] ?? true;
  } catch {
    return true;
  }
}

export function writeDepartureReminder(jobId: string, enabled: boolean): void {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[jobId] = enabled;
    localStorage.setItem(REMINDER_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export const NAV_APP_LABELS: Record<NavigationApp, string> = {
  google_maps: 'Google Maps',
  apple_maps: 'Apple Maps',
  waze: 'Waze',
};
