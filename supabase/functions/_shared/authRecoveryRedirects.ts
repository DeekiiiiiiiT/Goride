/**
 * Password recovery redirect URLs for Edge Functions.
 * Keep in sync with packages/auth-client/src/authRecoveryRedirects.ts
 */

export const AUTH_RECOVERY_REDIRECTS = {
  dominion: "https://roamdominion.co/reset-password",
  driver: "https://roamdriver.co/reset-password",
  rides: "https://roam-s.co/reset-password",
  courier: "https://courier.roamrush.app/reset-password",
  dash: "https://roamrush.app/reset-password",
  partner: "https://partner.roamrush.app/reset-password",
  haul: "https://roamhaul.co/reset-password",
  fleet: "https://roamfleet.co/reset-password",
  enterprise: "https://roamenterprise.co/reset-password",
} as const;

export type RecoveryProductKey =
  | "driver"
  | "rides"
  | "courier"
  | "dash"
  | "partner"
  | "haul"
  | "fleet"
  | "enterprise";

export function recoveryRedirectForProduct(productKey: RecoveryProductKey): string {
  const map: Record<RecoveryProductKey, string> = {
    driver: AUTH_RECOVERY_REDIRECTS.driver,
    rides: AUTH_RECOVERY_REDIRECTS.rides,
    courier: AUTH_RECOVERY_REDIRECTS.courier,
    dash: AUTH_RECOVERY_REDIRECTS.dash,
    partner: AUTH_RECOVERY_REDIRECTS.partner,
    haul: AUTH_RECOVERY_REDIRECTS.haul,
    fleet: AUTH_RECOVERY_REDIRECTS.fleet,
    enterprise: AUTH_RECOVERY_REDIRECTS.enterprise,
  };
  return map[productKey];
}

export async function generateRecoveryLink(
  auth: { auth: { admin: { generateLink: (opts: unknown) => Promise<{ data: unknown; error: unknown }> } } },
  email: string,
  redirectTo: string,
): Promise<{ data: unknown; error: unknown }> {
  return auth.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
}
