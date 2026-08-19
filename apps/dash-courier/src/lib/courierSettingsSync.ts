import {
  loadAppSettings,
  loadDashPreferences,
  loadNotificationSettings,
  saveAppSettings,
  saveDashPreferences,
  saveNotificationSettings,
  type CourierAppSettings,
  type DashPreferences,
  type NotificationSettings,
} from '@/lib/courierStorage';
import { fetchCourierSettings, patchCourierSettings } from '@/lib/courierApi';

const STORAGE_KEYS = {
  preferences: 'courier:preferences',
  notifications: 'courier:notifications',
  settings: 'courier:settings',
} as const;

let saveTimer: number | null = null;
let hydrating = false;

function readCloudSlice(settings: Record<string, unknown>, key: string): unknown {
  const slice = settings[key];
  return slice && typeof slice === 'object' ? slice : undefined;
}

/** Pull cloud settings into localStorage on login/boot. */
export async function hydrateCourierSettingsFromCloud(): Promise<void> {
  hydrating = true;
  try {
    const cloud = await fetchCourierSettings();
    if (!cloud) return;

    const prefs = readCloudSlice(cloud, STORAGE_KEYS.preferences) as DashPreferences | undefined;
    if (prefs) saveDashPreferences({ ...loadDashPreferences(), ...prefs });

    const notifs = readCloudSlice(cloud, STORAGE_KEYS.notifications) as NotificationSettings | undefined;
    if (notifs) saveNotificationSettings({ ...loadNotificationSettings(), ...notifs });

    const app = readCloudSlice(cloud, STORAGE_KEYS.settings) as Partial<CourierAppSettings> | undefined;
    if (app) saveAppSettings({ ...loadAppSettings(), ...app });
  } finally {
    hydrating = false;
  }
}

function buildCloudPatch(): Record<string, unknown> {
  return {
    [STORAGE_KEYS.preferences]: loadDashPreferences(),
    [STORAGE_KEYS.notifications]: loadNotificationSettings(),
    [STORAGE_KEYS.settings]: loadAppSettings(),
  };
}

/** Debounced PATCH after local toggle changes. */
export function scheduleCourierSettingsSave(): void {
  if (hydrating) return;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void patchCourierSettings(buildCloudPatch());
  }, 400);
}

export function saveDashPreferencesSynced(prefs: DashPreferences): void {
  saveDashPreferences(prefs);
  scheduleCourierSettingsSave();
}

export function saveNotificationSettingsSynced(settings: NotificationSettings): void {
  saveNotificationSettings(settings);
  scheduleCourierSettingsSave();
}

export function saveAppSettingsSynced(settings: CourierAppSettings): void {
  saveAppSettings(settings);
  scheduleCourierSettingsSave();
}
