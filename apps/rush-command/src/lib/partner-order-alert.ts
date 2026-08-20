import type { MutableRefObject } from 'react';
import {
  ALERT_SOUND_URLS,
  NotificationSettings,
  OrderAlertSound,
} from '../types/notifications';
import { triggerHaptic } from './partner-haptics';

const DEFAULT_SOUND_URL = ALERT_SOUND_URLS.bell;

export function getOrderAlertSoundUrl(sound: OrderAlertSound) {
  if (sound === 'custom') return DEFAULT_SOUND_URL;
  return ALERT_SOUND_URLS[sound] ?? DEFAULT_SOUND_URL;
}

export function playNewOrderAlert(
  settings: NotificationSettings,
  audioRef: MutableRefObject<HTMLAudioElement | null>,
) {
  if (!settings.newOrderAlerts) return;

  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current = null;
  }

  const audio = new Audio(getOrderAlertSoundUrl(settings.orderAlertSound));
  audio.volume = Math.min(1, Math.max(0, settings.soundVolume / 100));
  audioRef.current = audio;
  audio.play().catch(() => {});

  triggerHaptic('warning', settings.vibration);
}
