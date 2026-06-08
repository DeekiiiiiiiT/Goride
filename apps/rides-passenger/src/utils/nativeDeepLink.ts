import { PASSENGER_PRODUCTION_ORIGIN } from './passengerAuthRedirect';

/** Map native or web URLs to in-app router paths. */
export function resolveDelegatedBookingPath(url: string): string | null {
  try {
    const u = new URL(url);

    if (u.protocol === 'co.roamenterprise.rides:') {
      if (u.hostname === 'ride' && u.pathname.startsWith('/join/')) {
        const token = u.pathname.slice('/join/'.length).replace(/\/$/, '');
        return token ? `/ride/join/${token}` : null;
      }
      return null;
    }

    const origin = u.origin.replace(/\/$/, '');
    const prod = PASSENGER_PRODUCTION_ORIGIN.replace(/\/$/, '');
    if (origin === prod || (typeof window !== 'undefined' && origin === window.location.origin)) {
      if (u.pathname.startsWith('/ride/join/')) return u.pathname;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}
