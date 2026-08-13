/**
 * Permanent product doors — separate hostnames = separate PWA installs.
 * courier.roamenterprise.co → Courier (/app) + /login
 * freight-forwarder.roamenterprise.co → Freight Forwarder (/freight-forwarder) + /login
 * apex roamenterprise.co → marketing only; Sign in → /sign-in product picker
 */

export type ProductDoor = 'courier' | 'freight_forwarder' | 'apex';

export const FREIGHT_FORWARDER_PATH = '/freight-forwarder' as const;

const PROD_APEX = 'roamenterprise.co';

function envDoorOverride(): ProductDoor | null {
  const raw = (import.meta.env.VITE_PRODUCT_DOOR as string | undefined)?.trim().toLowerCase();
  if (raw === 'courier' || raw === 'apex') return raw;
  if (raw === 'freight_forwarder' || raw === 'freight-forwarder') {
    return 'freight_forwarder';
  }
  return null;
}

export function isFreightForwarderHost(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'freight-forwarder.localhost' ||
    host.startsWith('freight-forwarder.') ||
    host === 'freight-forwarder'
  );
}

export function isFreightForwarderPath(pathname: string): boolean {
  return (
    pathname === FREIGHT_FORWARDER_PATH ||
    pathname.startsWith(`${FREIGHT_FORWARDER_PATH}/`) ||
    pathname === '/warehouse' ||
    pathname.startsWith('/warehouse/')
  );
}

/** Resolve door from hostname (and optional env override for CI). */
export function resolveProductDoor(
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): ProductDoor {
  const override = envDoorOverride();
  if (override) return override;

  const host = hostname.toLowerCase();

  if (host === 'courier.localhost' || host.startsWith('courier.') || host === 'courier') {
    return 'courier';
  }
  if (isFreightForwarderHost(host)) {
    return 'freight_forwarder';
  }

  return 'apex';
}

export function getProductDoor(): ProductDoor {
  return resolveProductDoor();
}

export function homePathForDoor(door: ProductDoor): '/app' | typeof FREIGHT_FORWARDER_PATH {
  return door === 'freight_forwarder' ? FREIGHT_FORWARDER_PATH : '/app';
}

/** Build origin for a door on the current environment (local vs prod). */
export function originForDoor(door: 'courier' | 'freight_forwarder'): string {
  if (typeof window === 'undefined') {
    return door === 'freight_forwarder'
      ? `https://freight-forwarder.${PROD_APEX}`
      : `https://courier.${PROD_APEX}`;
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : '';

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1'
  ) {
    const localHost =
      door === 'freight_forwarder' ? 'freight-forwarder.localhost' : 'courier.localhost';
    return `${protocol}//${localHost}${portSuffix}`;
  }

  if (hostname === PROD_APEX || hostname.endsWith(`.${PROD_APEX}`)) {
    if (door === 'freight_forwarder' && isFreightForwarderHost(hostname)) {
      return `${protocol}//${hostname}${portSuffix}`;
    }
    return `https://${door === 'freight_forwarder' ? 'freight-forwarder' : 'courier'}.${PROD_APEX}`;
  }

  // Vercel preview / unknown: stay path-only on same origin
  return window.location.origin;
}

export function urlForDoor(door: 'courier' | 'freight_forwarder', path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${originForDoor(door)}${p}`;
}

/** Target door for a user after login (from business type / products / seat path). */
export function preferredDoorForUser(input: {
  businessType?: string | null;
  subscribedProducts?: string[] | null;
  homePath: '/app' | typeof FREIGHT_FORWARDER_PATH | '/warehouse';
}): 'courier' | 'freight_forwarder' {
  if (input.homePath === FREIGHT_FORWARDER_PATH || input.homePath === '/warehouse') {
    return 'freight_forwarder';
  }
  const products = input.subscribedProducts || [];
  const bt = input.businessType || '';
  if (bt === 'warehouse' || (products.includes('warehouse') && !products.includes('courier'))) {
    return 'freight_forwarder';
  }
  return 'courier';
}

/**
 * Absolute post-login URL. Crosses origins when the preferred door differs from current host.
 */
export function resolvePostLoginHref(input: {
  businessType?: string | null;
  subscribedProducts?: string[] | null;
  homePath: '/app' | typeof FREIGHT_FORWARDER_PATH | '/warehouse';
  requestedFrom?: string | null;
}): string {
  const current = getProductDoor();
  const preferred = preferredDoorForUser(input);
  const preferredHome = homePathForDoor(preferred);

  if (input.requestedFrom && (input.requestedFrom.startsWith('/app') || isFreightForwarderPath(input.requestedFrom))) {
    const fromDoor: 'courier' | 'freight_forwarder' = isFreightForwarderPath(input.requestedFrom)
      ? 'freight_forwarder'
      : 'courier';
    const requestedPath = input.requestedFrom.replace(/^\/warehouse/, FREIGHT_FORWARDER_PATH);
    // Never honor a path on the wrong product for this account
    if (preferred !== fromDoor) {
      if (current === preferred) return preferredHome;
      return urlForDoor(preferred, preferredHome);
    }
    if (current === fromDoor) {
      return requestedPath;
    }
    if (current === 'apex') {
      return urlForDoor(fromDoor, requestedPath);
    }
    return urlForDoor(fromDoor, requestedPath);
  }

  if (current === preferred) {
    return preferredHome;
  }
  if (current === 'apex') {
    return urlForDoor(preferred, preferredHome);
  }
  return urlForDoor(preferred, preferredHome);
}

/** Hard navigation when target is another origin; relative assign otherwise. */
export function navigateDoorHref(href: string): void {
  if (typeof window === 'undefined') return;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    const target = new URL(href);
    if (target.origin !== window.location.origin) {
      window.location.assign(href);
      return;
    }
    window.location.assign(`${target.pathname}${target.search}${target.hash}`);
    return;
  }
  window.location.assign(href);
}

/** Manifest href for current door (apex uses courier install for ops PWA). */
export function manifestHrefForDoor(door: ProductDoor = getProductDoor()): string {
  if (door === 'freight_forwarder') return '/manifests/freight-forwarder.webmanifest';
  return '/manifests/courier.webmanifest';
}
