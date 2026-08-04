/**
 * Uber Developer Portal values for RoamFleet → Vehicles/Fleet API.
 * Register these exactly in developer.uber.com (org: RoamFleet).
 */
export const UBER_FLEET_PORTAL = {
  /** Prefer this org name in Uber Developer Dashboard. */
  orgName: 'RoamFleet',
  appNameSuggestion: 'RoamFleet Production',
  privacyPolicyUrl: 'https://roamenterprise.co/privacy',
  redirectUriProduction: 'https://roamfleet.co/uber-callback',
  /** Dev fallback — must also be registered in Uber Setup if you test locally. */
  redirectUriLocalHint: 'http://localhost:5173/uber-callback',
  webhookUrl:
    'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/webhook',
  docsUrl: 'https://developer.uber.com/docs/vehicles/getting-started',
  /**
   * Full Client Credentials scope set to replace period CSV imports + vehicle ops.
   * Uber must enable these — dashboard currently shows zero scopes.
   */
  phase1Scopes: [
    // Vehicle / org ops
    'vehicle_suppliers.vehicles.read',
    'vehicle_suppliers.vehicles.assignment',
    'vehicle_suppliers.organizations.read',
    // Offline reports = same files as Supplier portal period CSVs
    'solutions.suppliers.reports',
    // Live/near-live metrics (hours, trips, earnings)
    'solutions.suppliers.metrics.read',
    // Payment / transaction streams
    'supplier.partner.payments',
  ] as const,
  /** Report types that mirror RoamFleet’s Uber CSV imports */
  periodReportTypes: [
    'REPORT_TYPE_TRIP_ACTIVITY',
    'REPORT_TYPE_PAYMENTS_ORDER',
    'REPORT_TYPE_PAYMENTS_DRIVER',
    'REPORT_TYPE_PAYMENTS_ORGANIZATION',
    'REPORT_TYPE_DRIVER_QUALITY',
    'REPORT_TYPE_DRIVER_ACTIVITY',
    'REPORT_TYPE_VEHICLE_PERFORMANCE',
    'REPORT_TYPE_DRIVER_PERFORMANCE',
    'REPORT_TYPE_RENTAL_PAYMENTS_CONTRACT',
    'REPORT_TYPE_RENTAL_PAYMENTS_TRANSACTION',
    'REPORT_TYPE_RENTAL_PAYMENTS_ORGANIZATION',
  ] as const,
  secretEnvNames: ['UBER_CLIENT_ID', 'UBER_CLIENT_SECRET'] as const,
} as const;
