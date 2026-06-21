import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
} from '../types/notifications';

function settingsKey(merchantId: string) {
  return `roam_notification_settings_${merchantId}`;
}

function loadSettings(merchantId: string): NotificationSettings {
  try {
    const raw = localStorage.getItem(settingsKey(merchantId));
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function saveSettings(merchantId: string, settings: NotificationSettings) {
  localStorage.setItem(settingsKey(merchantId), JSON.stringify(settings));
}

export function useNotificationSettings(merchantId: string) {
  const [settings, setSettings] = useState<NotificationSettings>(() => loadSettings(merchantId));

  useEffect(() => {
    setSettings(loadSettings(merchantId));
  }, [merchantId]);

  const updateSettings = useCallback(
    (updates: Partial<NotificationSettings>) => {
      setSettings((current) => {
        const next = {
          ...current,
          ...updates,
          newOrderAlerts: true,
        };
        saveSettings(merchantId, next);
        return next;
      });
    },
    [merchantId]
  );

  return { settings, updateSettings };
}
