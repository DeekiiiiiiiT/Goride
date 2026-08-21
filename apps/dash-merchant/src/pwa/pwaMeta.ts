/// <reference types="vite-plugin-pwa/client" />

import { Capacitor } from '@capacitor/core';

/** Install UI / SW registration only on web — never inside the Capacitor shell. */
export function isPwaInstallAllowed(): boolean {
  return !Capacitor.isNativePlatform();
}

export function getPwaAppName(): string {
  return 'Roam Rush Partner';
}

/** True when launched from an installed desktop/PWA window. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
