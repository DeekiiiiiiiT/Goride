import type { DeclineReasonId } from '@/lib/declineReasons';
import type { PayoutSchedule } from '@/lib/mockSettings';
import {
  DEFAULT_DASH_PREFERENCES,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '@/lib/mockSettings';

const KEYS = {
  preferences: 'courier:preferences',
  notifications: 'courier:notifications',
  settings: 'courier:settings',
  declineReasons: 'courier:decline-reasons',
} as const;

export type DashPreferences = typeof DEFAULT_DASH_PREFERENCES;
export type NotificationSettings = typeof DEFAULT_NOTIFICATION_SETTINGS;

export type CourierAppSettings = {
  appearance: 'Light' | 'Dark' | 'System';
  language: string;
  navApp: string;
  distanceUnits: 'km' | 'Miles';
};

export type DeclineReasonEntry = {
  reasonId: DeclineReasonId;
  offerId?: string;
  timestamp: string;
};

const DEFAULT_APP_SETTINGS: CourierAppSettings = {
  appearance: 'System',
  language: 'English (US)',
  navApp: 'Google Maps',
  distanceUnits: 'km',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadDashPreferences(): DashPreferences {
  return readJson(KEYS.preferences, DEFAULT_DASH_PREFERENCES);
}

export function saveDashPreferences(prefs: DashPreferences): void {
  writeJson(KEYS.preferences, prefs);
}

export function loadNotificationSettings(): NotificationSettings {
  return readJson(KEYS.notifications, DEFAULT_NOTIFICATION_SETTINGS);
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  writeJson(KEYS.notifications, settings);
}

export function loadAppSettings(): CourierAppSettings {
  return readJson(KEYS.settings, DEFAULT_APP_SETTINGS);
}

export function saveAppSettings(settings: CourierAppSettings): void {
  writeJson(KEYS.settings, settings);
}

export function loadPayoutSchedule(): PayoutSchedule {
  const settings = readJson<{ payoutSchedule?: PayoutSchedule }>(KEYS.settings, {});
  return settings.payoutSchedule ?? 'weekly';
}

export function savePayoutSchedule(schedule: PayoutSchedule): void {
  const current = readJson<{ payoutSchedule?: PayoutSchedule }>(KEYS.settings, {});
  writeJson(KEYS.settings, { ...current, payoutSchedule: schedule });
}

export function appendDeclineReason(entry: Omit<DeclineReasonEntry, 'timestamp'>): void {
  const list = readJson<DeclineReasonEntry[]>(KEYS.declineReasons, []);
  list.unshift({ ...entry, timestamp: new Date().toISOString() });
  writeJson(KEYS.declineReasons, list.slice(0, 50));
}

export function loadDeclineReasons(): DeclineReasonEntry[] {
  return readJson<DeclineReasonEntry[]>(KEYS.declineReasons, []);
}
