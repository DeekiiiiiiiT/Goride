/**
 * Enterprise customer seat RBAC (tenant staff — not Dominion enterprise_admin/ops).
 * Modules = packaging; these keys = per-seat actions.
 */

export type EnterpriseSeatRole =
  | 'enterprise_owner'
  | 'enterprise_dispatcher'
  | 'enterprise_customs'
  | 'enterprise_finance'
  | 'enterprise_viewer';

export type EnterpriseSeatPermission =
  | 'freight.shipments.read'
  | 'freight.shipments.write'
  | 'freight.dispatch.read'
  | 'freight.dispatch.assign'
  | 'freight.fulfillment.read'
  | 'freight.fulfillment.write'
  | 'freight.customs.read'
  | 'freight.customs.write'
  | 'freight.mailbox.read'
  | 'freight.mailbox.write'
  | 'freight.zones.read'
  | 'freight.zones.write'
  | 'freight.rates.read'
  | 'freight.rates.write'
  | 'freight.alerts.read'
  | 'freight.alerts.write'
  | 'freight.clients.read'
  | 'freight.clients.write'
  | 'freight.carriers.read'
  | 'freight.carriers.write'
  | 'ops.team.manage'
  | 'ops.finance.read'
  | 'ops.reports.read'
  | 'ops.fleet.read';

export const ENTERPRISE_SEAT_ROLES: readonly EnterpriseSeatRole[] = [
  'enterprise_owner',
  'enterprise_dispatcher',
  'enterprise_customs',
  'enterprise_finance',
  'enterprise_viewer',
] as const;

/** Maps enabled module keys → minimum seat permission to see the nav/route. */
export const MODULE_SEAT_PERMISSION: Readonly<Record<string, EnterpriseSeatPermission>> = {
  freight_shipments: 'freight.shipments.read',
  freight_carriers: 'freight.carriers.read',
  freight_clients: 'freight.clients.read',
  freight_rate_cards: 'freight.rates.read',
  freight_suites: 'freight.mailbox.read',
  freight_mailbox_packages: 'freight.mailbox.read',
  freight_miami_scan: 'freight.mailbox.write',
  freight_manifests: 'freight.mailbox.read',
  freight_customs_board: 'freight.customs.read',
  freight_hub_station: 'freight.customs.read',
  freight_fulfillment: 'freight.fulfillment.read',
  freight_client_fleet: 'freight.fulfillment.read',
  freight_dispatch: 'freight.dispatch.read',
  freight_service_zones: 'freight.zones.read',
  freight_ops_inbox: 'freight.alerts.read',
  fuelManagement: 'ops.fleet.read',
  tollManagement: 'ops.fleet.read',
  drivers: 'ops.fleet.read',
  vehicles: 'ops.fleet.read',
  fleetEquipment: 'ops.fleet.read',
  trips: 'ops.fleet.read',
  dataCenter: 'ops.fleet.read',
  reports: 'ops.reports.read',
  businessFinance: 'ops.finance.read',
  claimableLoss: 'ops.finance.read',
  teamManagement: 'ops.team.manage',
};

const ALL_PERMS: readonly EnterpriseSeatPermission[] = [
  'freight.shipments.read',
  'freight.shipments.write',
  'freight.dispatch.read',
  'freight.dispatch.assign',
  'freight.fulfillment.read',
  'freight.fulfillment.write',
  'freight.customs.read',
  'freight.customs.write',
  'freight.mailbox.read',
  'freight.mailbox.write',
  'freight.zones.read',
  'freight.zones.write',
  'freight.rates.read',
  'freight.rates.write',
  'freight.alerts.read',
  'freight.alerts.write',
  'freight.clients.read',
  'freight.clients.write',
  'freight.carriers.read',
  'freight.carriers.write',
  'ops.team.manage',
  'ops.finance.read',
  'ops.reports.read',
  'ops.fleet.read',
];

const READ_OPS: readonly EnterpriseSeatPermission[] = ALL_PERMS.filter((p) =>
  p.endsWith('.read') || p === 'ops.fleet.read' || p === 'ops.finance.read' || p === 'ops.reports.read',
);

const DISPATCHER: readonly EnterpriseSeatPermission[] = [
  'freight.shipments.read',
  'freight.shipments.write',
  'freight.dispatch.read',
  'freight.dispatch.assign',
  'freight.fulfillment.read',
  'freight.fulfillment.write',
  'freight.zones.read',
  'freight.zones.write',
  'freight.alerts.read',
  'freight.alerts.write',
  'freight.carriers.read',
  'freight.clients.read',
  'freight.customs.read',
  'freight.mailbox.read',
  'freight.rates.read',
  'ops.fleet.read',
  'ops.reports.read',
];

const CUSTOMS: readonly EnterpriseSeatPermission[] = [
  'freight.mailbox.read',
  'freight.mailbox.write',
  'freight.customs.read',
  'freight.customs.write',
  'freight.shipments.read',
  'freight.dispatch.read',
  'freight.fulfillment.read',
  'freight.alerts.read',
  'freight.clients.read',
  'freight.carriers.read',
  'ops.fleet.read',
];

const FINANCE: readonly EnterpriseSeatPermission[] = [
  'freight.rates.read',
  'freight.rates.write',
  'freight.clients.read',
  'freight.clients.write',
  'freight.shipments.read',
  'freight.carriers.read',
  'freight.dispatch.read',
  'freight.fulfillment.read',
  'freight.alerts.read',
  'ops.finance.read',
  'ops.reports.read',
  'ops.fleet.read',
];

export const ENTERPRISE_SEAT_PERMISSIONS: Record<
  EnterpriseSeatRole,
  readonly EnterpriseSeatPermission[]
> = {
  enterprise_owner: ALL_PERMS,
  enterprise_dispatcher: DISPATCHER,
  enterprise_customs: CUSTOMS,
  enterprise_finance: FINANCE,
  enterprise_viewer: READ_OPS,
};

/** Fleet / legacy roles → Enterprise seat when product line is enterprise. */
export function resolveEnterpriseSeatRole(
  raw: string | null | undefined,
): EnterpriseSeatRole {
  if (!raw) return 'enterprise_viewer';
  switch (raw) {
    case 'enterprise_owner':
    case 'fleet_owner':
    case 'admin':
      return 'enterprise_owner';
    case 'enterprise_dispatcher':
    case 'fleet_manager':
    case 'manager':
      return 'enterprise_dispatcher';
    case 'enterprise_customs':
      return 'enterprise_customs';
    case 'enterprise_finance':
    case 'fleet_accountant':
      return 'enterprise_finance';
    case 'enterprise_viewer':
    case 'fleet_viewer':
    case 'viewer':
      return 'enterprise_viewer';
    case 'enterprise_admin':
    case 'enterprise_ops':
    case 'platform_owner':
    case 'superadmin':
      // Staff impersonating / break-glass: treat as owner for customer app
      return 'enterprise_owner';
    default:
      return 'enterprise_viewer';
  }
}

export function enterpriseSeatHasPermission(
  role: EnterpriseSeatRole,
  permission: EnterpriseSeatPermission,
): boolean {
  return ENTERPRISE_SEAT_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getEnterpriseSeatPermissions(
  role: EnterpriseSeatRole,
): readonly EnterpriseSeatPermission[] {
  return ENTERPRISE_SEAT_PERMISSIONS[role] ?? [];
}

export const ENTERPRISE_INVITABLE_ROLES: readonly {
  value: EnterpriseSeatRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'enterprise_dispatcher',
    label: 'Dispatcher',
    description: 'Assign jobs, fulfillment, zones — no finance write',
  },
  {
    value: 'enterprise_customs',
    label: 'Customs & Mailbox',
    description: 'Mailbox intake, scan, manifests, customs, hub',
  },
  {
    value: 'enterprise_finance',
    label: 'Finance',
    description: 'Rate cards, clients, finance & reports',
  },
  {
    value: 'enterprise_viewer',
    label: 'Viewer',
    description: 'Read-only across enabled modules',
  },
];
