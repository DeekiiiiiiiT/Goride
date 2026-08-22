/** Rush Ops Console — dedicated host (not the partner PWA). */
export const OPS_PRODUCTION_ORIGIN = 'https://ops.roamrush.app';

export function getOpsOrigin(): string {
  const env = import.meta.env.VITE_OPS_ORIGIN?.trim?.();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:5175`;
  }
  return OPS_PRODUCTION_ORIGIN;
}

/** True when the Rush Ops Console should render (ops host or local /admin dev path). */
export function isOpsAdminSurface(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'ops.roamrush.app') return true;
  if (/localhost|127\.0\.0\.1/.test(host) && window.location.pathname.startsWith('/admin')) {
    return true;
  }
  return false;
}

/** Partner PWA must not host admin — ops console lives on ops.roamrush.app only. */
export function isPartnerAdminPathBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isPartnerHost =
    host === 'partner.roamrush.app' || host === 'www.partner.roamrush.app';
  return isPartnerHost && window.location.pathname.startsWith('/admin');
}

/** Browser router basename for DashAdminPortal. */
export function opsAdminBasename(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'ops.roamrush.app') {
    return '/';
  }
  return '/admin';
}
