/// <reference types="vite-plugin-pwa/client" />

import { IS_ENTERPRISE_PRODUCT } from '../config/productLine';

/** Product display name for install / update copy. */
export function getPwaAppName(): string {
  return IS_ENTERPRISE_PRODUCT ? 'Roam Enterprise' : 'Roam Fleet';
}

/** True when launched from an installed desktop/PWA window. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari legacy
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
