/**
 * Uber Developer Portal values for RoamFleet → Vehicles/Fleet API.
 * Register these exactly in developer.uber.com (org: RoamFleet).
 */
export const UBER_FLEET_PORTAL = {
  /** Prefer this org name in Uber Developer Dashboard (rename off GoRide Fleet if possible). */
  orgName: 'RoamFleet',
  appNameSuggestion: 'RoamFleet Production',
  privacyPolicyUrl: 'https://roamenterprise.co/privacy',
  redirectUriProduction: 'https://roamfleet.co/uber-callback',
  /** Dev fallback — must also be registered in Uber Setup if you test locally. */
  redirectUriLocalHint: 'http://localhost:5173/uber-callback',
  webhookUrl:
    'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/webhook',
  docsUrl: 'https://developer.uber.com/docs/vehicles/getting-started',
  /** Org-level Client Credentials scopes for Phase 1 vehicle sync. */
  phase1Scopes: [
    'vehicle_suppliers.vehicles.read',
    'vehicle_suppliers.vehicles.assignment',
  ] as const,
  secretEnvNames: ['UBER_CLIENT_ID', 'UBER_CLIENT_SECRET'] as const,
} as const;
