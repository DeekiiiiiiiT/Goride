/**
 * Permanent product doors — separate hostnames = separate PWA installs.
 * courier.roamenterprise.co → Courier (/app)
 * warehouse.roamenterprise.co → Warehouse (/warehouse)
 * apex roamenterprise.co → marketing (+ login that routes to a door)
 */

export type ProductDoor = 'courier' | 'warehouse' | 'apex';

const PROD_APEX = 'roamenterprise.co';

function envDoorOverride(): ProductDoor | null {
  const raw = (import.meta.env.VITE_PRODUCT_DOOR as string | undefined)?.trim().toLowerCase();
  if (raw === 'courier' || raw === 'warehouse' || raw === 'apex') return raw;
  return null;
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
  if (
    host === 'warehouse.localhost' ||
    host.startsWith('warehouse.') ||
    host === 'warehouse'
  ) {
    return 'warehouse';
  }

  return 'apex';
}

export function getProductDoor(): ProductDoor {
  return resolveProductDoor();
}

export function homePathForDoor(door: ProductDoor): '/app' | '/warehouse' {
  return door === 'warehouse' ? '/warehouse' : '/app';
}

/** Build origin for a door on the current environment (local vs prod). */
export function originForDoor(door: 'courier' | 'warehouse'): string {
  if (typeof window === 'undefined') {
    return door === 'warehouse'
      ? `https://warehouse.${PROD_APEX}`
      : `https://courier.${PROD_APEX}`;
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : '';

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1'
  ) {
    const localHost = door === 'warehouse' ? 'warehouse.localhost' : 'courier.localhost';
    return `${protocol}//${localHost}${portSuffix}`;
  }

  if (hostname === PROD_APEX || hostname.endsWith(`.${PROD_APEX}`)) {
    return `https://${door}.${PROD_APEX}`;
  }

  // Vercel preview / unknown: stay path-only on same origin
  return window.location.origin;
}

export function urlForDoor(door: 'courier' | 'warehouse', path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${originForDoor(door)}${p}`;
}

/** Target door for a user after login (from business type / products / seat path). */
export function preferredDoorForUser(input: {
  businessType?: string | null;
  subscribedProducts?: string[] | null;
  homePath: '/app' | '/warehouse';
}): 'courier' | 'warehouse' {
  if (input.homePath === '/warehouse') return 'warehouse';
  const products = input.subscribedProducts || [];
  const bt = input.businessType || '';
  if (bt === 'warehouse' || (products.includes('warehouse') && !products.includes('courier'))) {
    return 'warehouse';
  }
  return 'courier';
}

/**
 * Absolute post-login URL. Crosses origins when the preferred door differs from current host.
 */
export function resolvePostLoginHref(input: {
  businessType?: string | null;
  subscribedProducts?: string[] | null;
  homePath: '/app' | '/warehouse';
  requestedFrom?: string | null;
}): string {
  const current = getProductDoor();
  const preferred = preferredDoorForUser(input);
  const preferredHome = homePathForDoor(preferred);

  if (
    input.requestedFrom &&
    (input.requestedFrom.startsWith('/app') || input.requestedFrom.startsWith('/warehouse'))
  ) {
    const fromDoor: 'courier' | 'warehouse' = input.requestedFrom.startsWith('/warehouse')
      ? 'warehouse'
      : 'courier';
    // Never honor a path on the wrong product for this account
    if (preferred !== fromDoor) {
      if (current === preferred) return preferredHome;
      return urlForDoor(preferred, preferredHome);
    }
    if (current === fromDoor) {
      return input.requestedFrom;
    }
    if (current === 'apex') {
      return urlForDoor(fromDoor, input.requestedFrom);
    }
    return urlForDoor(fromDoor, input.requestedFrom);
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
  if (door === 'warehouse') return '/manifests/warehouse.webmanifest';
  return '/manifests/courier.webmanifest';
}
