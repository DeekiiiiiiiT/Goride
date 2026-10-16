import type { AppConfigPlatform } from './types';

/** Prefer Capacitor when present; otherwise web. */
export function detectPlatform(): AppConfigPlatform {
  if (typeof window === 'undefined') return 'web';
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = cap?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch {
    /* ignore */
  }
  return 'web';
}
