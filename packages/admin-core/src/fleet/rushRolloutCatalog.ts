/** Rush rollout flag metadata — mirrors fleet-server rush_rollout_admin catalog. */

export type RushRolloutFlagKey =
  | 'service_lines_enabled'
  | 'rush_courier_link'
  | 'rush_trip_projection'
  | 'rush_ui'
  | 'rush_settlement';

export type RushRolloutCatalogEntry = {
  key: RushRolloutFlagKey;
  label: string;
  description: string;
  step: number;
};

export const RUSH_ROLLOUT_CATALOG: readonly RushRolloutCatalogEntry[] = [
  {
    key: 'service_lines_enabled',
    label: 'Service lines config',
    description: 'Org reads multi-line service_lines instead of business_type only',
    step: 1,
  },
  {
    key: 'rush_courier_link',
    label: 'Courier linking',
    description: 'Workforce invites and courier↔fleet membership',
    step: 2,
  },
  {
    key: 'rush_trip_projection',
    label: 'Trip projection',
    description: 'Project Rush orders into fleet.trips',
    step: 3,
  },
  {
    key: 'rush_ui',
    label: 'Delivery UI',
    description: 'Delivery navigation and pages in RoamFleet',
    step: 4,
  },
  {
    key: 'rush_settlement',
    label: 'Settlement',
    description: 'Include delivery revenue in weekly settlement',
    step: 5,
  },
];

export const RUSH_MODULE_LABELS: Record<string, string> = {
  rush_couriers: 'Couriers',
  rush_deliveries: 'Deliveries desk',
  rush_courier_settlements: 'Courier settlements',
  rush_supply_health: 'Supply health',
  rush_merchant_link: 'Merchant link',
};

export type RushRolloutFlagStatus = {
  flag: RushRolloutFlagKey;
  label: string;
  description: string;
  step: number;
  globalEnabled: boolean;
  enabledForOrg: boolean;
  disabledForOrg: boolean;
  effectiveForOrg: boolean;
};

export type RushRolloutResponse = {
  orgId: string;
  serviceLines: string[];
  businessType: string | null;
  rushModulesEffective: Record<string, boolean>;
  flags: RushRolloutFlagStatus[];
};

/** Client-side guard: can this flag be enabled given current effective states? */
export function canEnableRolloutFlag(
  flag: RushRolloutFlagKey,
  serviceLines: string[],
  flags: RushRolloutFlagStatus[],
): { ok: boolean; reason?: string } {
  const byKey = Object.fromEntries(flags.map((f) => [f.flag, f])) as Record<
    RushRolloutFlagKey,
    RushRolloutFlagStatus | undefined
  >;
  const step1 = byKey.service_lines_enabled?.effectiveForOrg === true;
  const step2 = byKey.rush_courier_link?.effectiveForOrg === true;
  const step3 = byKey.rush_trip_projection?.effectiveForOrg === true;
  const hasDelivery = serviceLines.includes('rush_delivery');

  switch (flag) {
    case 'service_lines_enabled':
      return { ok: true };
    case 'rush_courier_link':
      if (!step1) return { ok: false, reason: 'Enable step 1 (Service lines config) first.' };
      return { ok: true };
    case 'rush_trip_projection':
      if (!step2) return { ok: false, reason: 'Enable step 2 (Courier linking) first.' };
      return { ok: true };
    case 'rush_ui':
      if (!step1) return { ok: false, reason: 'Enable step 1 (Service lines config) first.' };
      if (!hasDelivery) return { ok: false, reason: 'Org must include Deliveries service line.' };
      return { ok: true };
    case 'rush_settlement':
      if (!step3) return { ok: false, reason: 'Enable step 3 (Trip projection) first.' };
      return { ok: true };
    default:
      return { ok: true };
  }
}

export function effectiveFlagLabel(flag: RushRolloutFlagStatus): string {
  if (flag.globalEnabled) return 'Global on';
  if (flag.effectiveForOrg) return 'On for org';
  return 'Off';
}
