/**
 * Dominion product-scoped admin actions — which surface owns which verbs.
 */

export const PRODUCT_LINE = ['enterprise', 'fleet'] as const;
export type ProductLineFilter = (typeof PRODUCT_LINE)[number];

/** Coarse namespaces for Dominion navigation & services. */
export const ACTION_PRODUCT_SCOPE = {
  PLATFORM_MONOLITH: 'platform_monolith',
  ROAM_DRIVER: 'roam_driver',
  ROAM_RIDES: 'roam_rides',
  ROAM_ENTERPRISE: 'roam_enterprise',
  ROAM_FLEET_CUSTOMERS: 'roam_fleet',
} as const;

export type ActionProductScope = (typeof ACTION_PRODUCT_SCOPE)[keyof typeof ACTION_PRODUCT_SCOPE];

/**
 * Typical admin verbs per product scope (documentation for operators).
 * Enforcement lives in Edge functions — this mirrors intent for UI/copy.
 */
export const ACTION_MATRIX: Record<ActionProductScope, readonly string[]> = {
  [ACTION_PRODUCT_SCOPE.PLATFORM_MONOLITH]: [
    'lookup_user_by_email',
    'cross_product_status',
    'force_logout',
    'full_delete_user',
    'list_customers',
    'list_team_members',
    'link_driver_to_org',
    'unlink_driver_from_org',
    'list_legacy_fleet_drivers',
  ],
  [ACTION_PRODUCT_SCOPE.ROAM_DRIVER]: [
    'list_directory',
    'detail',
    'suspend',
    'unsuspend',
    'deactivate',
    'reactivate',
    'sign_out_all',
    'delete_profile',
    'trips_read',
  ],
  [ACTION_PRODUCT_SCOPE.ROAM_RIDES]: [
    'list_directory',
    'detail',
    'suspend',
    'unsuspend',
    'ban',
    'reactivate_via_unsuspend',
    'sign_out_all',
    'delete_profile',
    'trips_read',
  ],
  [ACTION_PRODUCT_SCOPE.ROAM_ENTERPRISE]: ['customers_read', 'team_members_read'],
  [ACTION_PRODUCT_SCOPE.ROAM_FLEET_CUSTOMERS]: ['customers_read', 'team_members_read'],
};

export const ACTION_MATRIX_DOCS = `
Dominion separates fleet vs enterprise Roam lines for customers and team members.

- Platform monolith (${ACTION_PRODUCT_SCOPE.PLATFORM_MONOLITH}): KV + Auth backed lists, driver org linking, global identity.
- Driver (${ACTION_PRODUCT_SCOPE.ROAM_DRIVER}): driver_profiles lifecycle in driver Edge function.
- Rides (${ACTION_PRODUCT_SCOPE.ROAM_RIDES}): rider_profiles lifecycle in rides Edge function.

Full-delete removes auth.users and should only be exposed to platform owners.
Product delete removes only that product profile row.
`.trim();
