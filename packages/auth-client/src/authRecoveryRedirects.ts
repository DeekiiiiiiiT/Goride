/** Per-product password recovery landing URLs (must be in Supabase Auth redirect allowlist). */
export const AUTH_RECOVERY_REDIRECTS = {
  dominion: 'https://roamdominion.co/reset-password',
  driver: 'https://roamdriver.co/reset-password',
  rides: 'https://roam-s.co/reset-password',
  courier: 'https://courier.roamdash.co/reset-password',
  dash: 'https://roamdash.co/reset-password',
  partner: 'https://partner.roamdash.co/reset-password',
  haul: 'https://roamhaul.co/reset-password',
  fleet: 'https://roamfleet.co/reset-password',
  enterprise: 'https://roamenterprise.co/reset-password',
} as const;

export type AuthRecoverySurface = keyof typeof AUTH_RECOVERY_REDIRECTS;

/** Server-side / explicit canonical redirect for a product surface. */
export function recoveryRedirectForSurface(surface: AuthRecoverySurface): string {
  return AUTH_RECOVERY_REDIRECTS[surface];
}

/** Client-initiated resets: always return to the app the user is on. */
export function recoveryRedirectForCurrentOrigin(): string {
  if (typeof window === 'undefined') {
    return AUTH_RECOVERY_REDIRECTS.dominion;
  }
  return `${window.location.origin}/reset-password`;
}

/** Map product admin keys to recovery URLs (server-side generateLink). */
export type RecoveryProductKey =
  | 'driver'
  | 'rides'
  | 'courier'
  | 'dash'
  | 'haul'
  | 'fleet'
  | 'enterprise';

export function recoveryRedirectForProduct(productKey: RecoveryProductKey): string {
  const map: Record<RecoveryProductKey, string> = {
    driver: AUTH_RECOVERY_REDIRECTS.driver,
    rides: AUTH_RECOVERY_REDIRECTS.rides,
    courier: AUTH_RECOVERY_REDIRECTS.courier,
    dash: AUTH_RECOVERY_REDIRECTS.dash,
    haul: AUTH_RECOVERY_REDIRECTS.haul,
    fleet: AUTH_RECOVERY_REDIRECTS.fleet,
    enterprise: AUTH_RECOVERY_REDIRECTS.enterprise,
  };
  return map[productKey];
}
