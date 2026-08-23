/** Rush Ops Console — lives on roamrush.app/admin (not the partner PWA). */
export const DASH_ADMIN_PRODUCTION_ORIGIN = 'https://roamrush.app';

export function getDashAdminOrigin(): string {
  const env = import.meta.env.VITE_DASH_ADMIN_ORIGIN?.trim?.();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    const port = window.location.port || '5174';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  return DASH_ADMIN_PRODUCTION_ORIGIN;
}

/** Browser router basename for DashAdminPortal. */
export function dashAdminBasename(): string {
  return '/admin';
}

/** @deprecated use dashAdminBasename */
export const opsAdminBasename = dashAdminBasename;

/** Partner PWA must not host admin — use roamrush.app/admin. */
export function isPartnerAdminPathBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isPartnerHost =
    host === 'partner.roamrush.app' || host === 'www.partner.roamrush.app';
  return isPartnerHost && window.location.pathname.startsWith('/admin');
}

/** @deprecated Partner app no longer hosts admin. */
export function isOpsAdminSurface(): boolean {
  return false;
}

/** @deprecated use getDashAdminOrigin */
export const OPS_PRODUCTION_ORIGIN = `${DASH_ADMIN_PRODUCTION_ORIGIN}/admin`;
export const getOpsOrigin = getDashAdminOrigin;
