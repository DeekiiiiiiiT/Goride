const PREFS_KEY = 'roam-haul:notification-prefs';

export type HaulNotificationPrefs = {
  newJobs: boolean;
  earnings: boolean;
  promotions: boolean;
  appUpdates: boolean;
  sound: boolean;
  vibration: boolean;
};

const DEFAULT_PREFS: HaulNotificationPrefs = {
  newJobs: true,
  earnings: true,
  promotions: false,
  appUpdates: true,
  sound: true,
  vibration: true,
};

export function readNotificationPrefs(): HaulNotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<HaulNotificationPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeNotificationPrefs(prefs: HaulNotificationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
