export type PlugTab = 'explore' | 'garage' | 'map' | 'account';

export const TAB_ROOT: Record<PlugTab, string> = {
  explore: '/explore',
  garage: '/garage',
  map: '/map',
  account: '/account',
};

const ONBOARDING = new Set([
  '/',
  '/welcome',
  '/how',
  '/signup',
  '/otp',
  '/profile',
  '/consent',
  '/permissions',
  '/login',
  '/garage/add',
  '/garage/add/model',
  '/garage/add/missing',
  '/garage/add/odometer',
  '/garage/added',
]);

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const path = hash.split('?')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function isOnboarding(path: string): boolean {
  return ONBOARDING.has(path);
}

export function isFuel(path: string): boolean {
  return path === '/fuel' || path.startsWith('/fuel/');
}

/** Pin, details, and any screen that already draws its own bottom bar. */
export function hidesShellTabs(path: string): boolean {
  if (path === '/map' || path === '/map/pin' || path === '/map/pin/poor' || path === '/map/details') return true;
  if (path === '/search/empty' || path === '/contributions/approved' || path === '/tolls' || path === '/parts/results' || path === '/parish') return true;
  if (/^\/stations\/[^/]+\/directions$/.test(path)) return true;
  return false;
}

export function showsTabs(path: string): boolean {
  return !isOnboarding(path) && !isFuel(path) && !hidesShellTabs(path);
}

/** Shared pages stay on the tab the person was already using. */
export function tabFor(path: string, current: PlugTab | null): PlugTab | null {
  if (isOnboarding(path) || isFuel(path)) return null;
  if (path.startsWith('/inbox') || path === '/contributions' || path.startsWith('/contributions/')) {
    return current || 'explore';
  }
  if (path.startsWith('/garage') || path.startsWith('/parts')) return 'garage';
  if (
    path.startsWith('/map')
    || path.startsWith('/pending')
    || path.startsWith('/parish')
    || path === '/gps'
  ) return 'map';
  if (path.startsWith('/account') || path === '/settings' || path === '/help') return 'account';
  return 'explore';
}

export function fallbackFor(path: string): string {
  if (path === '/otp') return '/signup';
  if (path === '/profile') return '/otp';
  if (path === '/consent') return '/profile';
  if (path === '/permissions') return '/consent';
  if (path === '/how') return '/welcome';
  if (path === '/login' || path === '/signup') return '/welcome';
  if (path === '/garage/add') return '/garage';
  if (path === '/garage/add/model') return '/garage/add';
  if (path === '/garage/add/missing') return '/garage/add/model';
  if (path === '/garage/add/odometer') return '/garage/add/model';
  if (path === '/garage/added') return '/explore';
  if (path === '/fuel') return sessionStorage.getItem('plug-fuel-from') || '/explore';
  if (path === '/fuel/confirm') return '/fuel';
  if (path === '/fuel/details') return '/fuel/confirm';
  if (path === '/fuel/saved' || path === '/fuel/offline') return sessionStorage.getItem('plug-fuel-from') || '/explore';
  const sub = path.match(/^\/garage\/([^/]+)\/(.+)$/);
  if (sub && !['add', 'added'].includes(sub[1])) {
    const id = sub[1];
    if (sub[2] === 'service') return `/garage/${id}/schedule`;
    if (sub[2] === 'log-service') return `/garage/${id}/service`;
    if (sub[2] === 'documents/edit') return `/garage/${id}/documents`;
    return `/garage/${id}`;
  }
  if (/^\/garage\/[^/]+$/.test(path) && path !== '/garage/add' && path !== '/garage/added') return '/garage';
  if (path === '/parts') return '/garage';
  if (path.startsWith('/parts/')) return '/parts';
  if (path === '/map/pin') return '/map';
  if (path === '/map/details') return '/map/pin';
  if (path === '/map/submitted') return '/map';
  if (path === '/pending') return '/contributions';
  if (path === '/parish') return '/contributions';
  if (path === '/gps') return '/map/pin';
  if (path === '/inbox' || path === '/search' || path === '/tolls' || path === '/filters') return '/explore';
  if (path.startsWith('/stations') || path.startsWith('/places')) return '/explore';
  if (path === '/account/notifications' || path === '/account/privacy' || path === '/settings' || path === '/help') return '/account';
  if (path === '/contributions') return '/map';
  return '/explore';
}

const GATED = [
  '/fuel',
  '/garage',
  '/parts',
  '/map',
  '/contributions',
  '/pending',
  '/parish',
  '/account/privacy',
  '/account/notifications',
];

export function pathNeedsAccount(path: string): boolean {
  if (path === '/garage/add' || path.startsWith('/garage/add/')) return false;
  return GATED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix));
}
