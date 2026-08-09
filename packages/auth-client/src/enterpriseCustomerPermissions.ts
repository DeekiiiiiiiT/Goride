/**
 * Enterprise customer seat RBAC (tenant staff — not Dominion enterprise_admin/ops).
 * Modules = packaging; these keys = per-seat actions.
 * Section overrides = per-person grant/deny on top of role templates.
 */

export type EnterpriseSeatRole =
  | 'enterprise_owner'
  | 'enterprise_dispatcher'
  | 'enterprise_customs'
  | 'enterprise_warehouse'
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

/** Sidebar section groups admins can grant/deny per teammate. */
export type EnterpriseAccessSection =
  | 'mailbox_intake'
  | 'customs'
  | 'last_mile'
  | 'domestic_setup'
  | 'fleet_ops'
  | 'business_finance'
  | 'team';

/** missing key = inherit role; true = force grant; false = force deny */
export type EnterpriseSectionOverrides = Partial<Record<EnterpriseAccessSection, boolean>>;

export const ENTERPRISE_SEAT_ROLES: readonly EnterpriseSeatRole[] = [
  'enterprise_owner',
  'enterprise_dispatcher',
  'enterprise_customs',
  'enterprise_warehouse',
  'enterprise_finance',
  'enterprise_viewer',
] as const;

export const ENTERPRISE_ACCESS_SECTIONS: readonly {
  key: EnterpriseAccessSection;
  label: string;
  description: string;
}[] = [
  {
    key: 'mailbox_intake',
    label: 'Mailbox & Intake',
    description: 'Suites, packages, receive, manifests, invoice audit',
  },
  {
    key: 'customs',
    label: 'Customs & Clearance',
    description: 'Customs, clearance board, hub station',
  },
  {
    key: 'last_mile',
    label: 'Last Mile',
    description: 'Fulfillment and client fleet',
  },
  {
    key: 'domestic_setup',
    label: 'Domestic & Setup',
    description: 'Dispatch, zones, shipments, carriers, clients, rates',
  },
  {
    key: 'fleet_ops',
    label: 'Fleet Ops',
    description: 'Fuel, toll, drivers, vehicles, trips, reports',
  },
  {
    key: 'business_finance',
    label: 'Business Finance',
    description: 'Finance ledgers and claimable loss',
  },
  {
    key: 'team',
    label: 'Team management',
    description: 'Invite and manage teammates',
  },
] as const;

const SECTION_PERMS: Record<EnterpriseAccessSection, readonly EnterpriseSeatPermission[]> = {
  mailbox_intake: ['freight.mailbox.read', 'freight.mailbox.write'],
  customs: ['freight.customs.read', 'freight.customs.write'],
  last_mile: ['freight.fulfillment.read', 'freight.fulfillment.write'],
  domestic_setup: [
    'freight.shipments.read',
    'freight.shipments.write',
    'freight.dispatch.read',
    'freight.dispatch.assign',
    'freight.zones.read',
    'freight.zones.write',
    'freight.clients.read',
    'freight.clients.write',
    'freight.carriers.read',
    'freight.carriers.write',
    'freight.rates.read',
    'freight.rates.write',
    'freight.alerts.read',
    'freight.alerts.write',
  ],
  fleet_ops: ['ops.fleet.read', 'ops.reports.read'],
  business_finance: ['ops.finance.read'],
  team: ['ops.team.manage'],
};

/** Gate perm used for Team UI section on/off (read-only roles still count as on). */
const SECTION_GATE: Record<EnterpriseAccessSection, EnterpriseSeatPermission> = {
  mailbox_intake: 'freight.mailbox.read',
  customs: 'freight.customs.read',
  last_mile: 'freight.fulfillment.read',
  domestic_setup: 'freight.dispatch.read',
  fleet_ops: 'ops.fleet.read',
  business_finance: 'ops.finance.read',
  team: 'ops.team.manage',
};

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
  freight_pipeline_command: 'freight.mailbox.read',
  freight_invoice_audit: 'freight.mailbox.write',
  freight_hs_tariffs: 'freight.mailbox.read',
  freight_billing: 'freight.mailbox.read',
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

const READ_OPS: readonly EnterpriseSeatPermission[] = ALL_PERMS.filter(
  (p) =>
    p.endsWith('.read') ||
    p === 'ops.fleet.read' ||
    p === 'ops.finance.read' ||
    p === 'ops.reports.read',
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

/** Mailbox & Intake (suites, packages, receive, manifests). */
const WAREHOUSE: readonly EnterpriseSeatPermission[] = [
  'freight.mailbox.read',
  'freight.mailbox.write',
];

export const ENTERPRISE_SEAT_PERMISSIONS: Record<
  EnterpriseSeatRole,
  readonly EnterpriseSeatPermission[]
> = {
  enterprise_owner: ALL_PERMS,
  enterprise_dispatcher: DISPATCHER,
  enterprise_customs: CUSTOMS,
  enterprise_warehouse: WAREHOUSE,
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
    case 'enterprise_warehouse':
      return 'enterprise_warehouse';
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

export function sectionPermissions(
  section: EnterpriseAccessSection,
): readonly EnterpriseSeatPermission[] {
  return SECTION_PERMS[section] ?? [];
}

export function parseSectionOverrides(raw: unknown): EnterpriseSectionOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: EnterpriseSectionOverrides = {};
  for (const { key } of ENTERPRISE_ACCESS_SECTIONS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

/** Role defaults with optional per-section grant/deny overrides. */
export function effectiveSeatPermissions(
  role: EnterpriseSeatRole,
  overrides: EnterpriseSectionOverrides = {},
): EnterpriseSeatPermission[] {
  const set = new Set<EnterpriseSeatPermission>(ENTERPRISE_SEAT_PERMISSIONS[role] ?? []);
  for (const { key } of ENTERPRISE_ACCESS_SECTIONS) {
    const forced = overrides[key];
    if (forced === undefined) continue;
    const perms = SECTION_PERMS[key];
    if (forced) {
      for (const p of perms) set.add(p);
    } else {
      for (const p of perms) set.delete(p);
    }
  }
  return [...set];
}

export function enterpriseSeatHasPermission(
  role: EnterpriseSeatRole,
  permission: EnterpriseSeatPermission,
  overrides: EnterpriseSectionOverrides = {},
): boolean {
  return effectiveSeatPermissions(role, overrides).includes(permission);
}

export function getEnterpriseSeatPermissions(
  role: EnterpriseSeatRole,
  overrides: EnterpriseSectionOverrides = {},
): readonly EnterpriseSeatPermission[] {
  return effectiveSeatPermissions(role, overrides);
}

/** Whether a section is on after applying role + overrides (for Team UI). */
export function effectiveSectionAccess(
  role: EnterpriseSeatRole,
  overrides: EnterpriseSectionOverrides = {},
): Record<EnterpriseAccessSection, boolean> {
  const effective = new Set(effectiveSeatPermissions(role, overrides));
  const out = {} as Record<EnterpriseAccessSection, boolean>;
  for (const { key } of ENTERPRISE_ACCESS_SECTIONS) {
    out[key] = effective.has(SECTION_GATE[key]);
  }
  return out;
}

/** Compact overrides relative to role defaults (only store deltas). */
export function compactSectionOverrides(
  role: EnterpriseSeatRole,
  desired: Record<EnterpriseAccessSection, boolean>,
): EnterpriseSectionOverrides {
  const base = effectiveSectionAccess(role, {});
  const out: EnterpriseSectionOverrides = {};
  for (const { key } of ENTERPRISE_ACCESS_SECTIONS) {
    if (desired[key] !== base[key]) out[key] = desired[key];
  }
  return out;
}

export function sectionOverridesAreCustom(overrides: EnterpriseSectionOverrides): boolean {
  return Object.keys(overrides).length > 0;
}

export function seatCanAccessModule(
  role: EnterpriseSeatRole,
  moduleKey: string,
  overrides: EnterpriseSectionOverrides = {},
): boolean {
  const need = MODULE_SEAT_PERMISSION[moduleKey];
  // Unknown module keys deny for seats (owners have all mapped perms via role)
  if (!need) return false;
  return enterpriseSeatHasPermission(role, need, overrides);
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
    value: 'enterprise_warehouse',
    label: 'Warehouse Intake',
    description: 'US Receive floor — lands in Warehouse app (/warehouse)',
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
