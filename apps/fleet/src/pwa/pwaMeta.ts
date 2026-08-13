/// <reference types="vite-plugin-pwa/client" />

import { IS_ENTERPRISE_PRODUCT } from '../config/productLine';

function enterpriseDoorAppName(): string {
  if (typeof window === 'undefined') return 'Roam Enterprise';
  const host = window.location.hostname.toLowerCase();
  if (
    host === 'freight-forwarder.localhost' ||
    host.startsWith('freight-forwarder.') ||
    host === 'freight-forwarder'
  ) {
    return 'Roam Freight Forwarder';
  }
  if (
    host === 'courier.localhost' ||
    host.startsWith('courier.') ||
    host === 'courier'
  ) {
    return 'Roam Courier';
  }
  return 'Roam Enterprise';
}

/**
 * Enterprise product doors that may install as PWAs.
 * Apex marketing (roamenterprise.co) is never installable.
 */
export function isEnterpriseOpsDoorHost(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'courier.localhost' ||
    host.startsWith('courier.') ||
    host === 'courier' ||
    host === 'freight-forwarder.localhost' ||
    host.startsWith('freight-forwarder.') ||
    host === 'freight-forwarder'
  );
}

/** Whether this build/host may show install UI / register as an installable PWA. */
export function isPwaInstallAllowed(): boolean {
  if (!IS_ENTERPRISE_PRODUCT) return true;
  return isEnterpriseOpsDoorHost();
}

/** Product display name for install / update copy. */
export function getPwaAppName(): string {
  return IS_ENTERPRISE_PRODUCT ? enterpriseDoorAppName() : 'Roam Fleet';
}

/** True when launched from an installed desktop/PWA window. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari legacy
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
