/// <reference types="vite-plugin-pwa/client" />

import { Capacitor } from '@capacitor/core';

/** Install UI / SW registration only on web partner app — never ops admin or native shell. */
export function isPwaInstallAllowed(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'ops.roamrush.app') return false;
    if (window.location.pathname.startsWith('/admin')) return false;
  }
  return true;
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
