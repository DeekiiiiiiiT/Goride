import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
} from '../types/notifications';
import { fetchNotificationSettings, saveNotificationSettings } from '../lib/partner-api';

function settingsKey(merchantId: string) {
  return `roam_notification_settings_${merchantId}`;
}

function loadLocalSettings(merchantId: string): NotificationSettings {
  try {
    const raw = localStorage.getItem(settingsKey(merchantId));
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function saveLocalSettings(merchantId: string, settings: NotificationSettings) {
  localStorage.setItem(settingsKey(merchantId), JSON.stringify(settings));
}

export function useNotificationSettings(merchantId: string) {
  const [settings, setSettings] = useState<NotificationSettings>(() => loadLocalSettings(merchantId));
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    setSettings(loadLocalSettings(merchantId));
    void fetchNotificationSettings()
      .then((res) => {
        if (res.settings && Object.keys(res.settings).length > 0) {
          const merged = { ...DEFAULT_NOTIFICATION_SETTINGS, ...res.settings } as NotificationSettings;
          setSettings(merged);
          saveLocalSettings(merchantId, merged);
        }
      })
      .catch(() => {})
      .finally(() => setSynced(true));
  }, [merchantId]);

  const updateSettings = useCallback(
    (updates: Partial<NotificationSettings>) => {
      setSettings((current) => {
        const next = {
          ...current,
          ...updates,
          newOrderAlerts: true,
        };
        saveLocalSettings(merchantId, next);
        if (synced) {
          void saveNotificationSettings(next as unknown as Record<string, unknown>).catch(() => {});
        }
        return next;
      });
    },
    [merchantId, synced],
  );

  return { settings, updateSettings };
}
