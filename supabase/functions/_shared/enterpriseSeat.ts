/**
 * Enterprise customer seat checks for Deno edge (mirror of @roam/auth-client
 * enterpriseCustomerPermissions — keep maps in sync).
 */

export type EnterpriseSeatRole =
  | "enterprise_owner"
  | "enterprise_dispatcher"
  | "enterprise_customs"
  | "enterprise_warehouse"
  | "enterprise_finance"
  | "enterprise_viewer";

export type EnterpriseSeatPermission =
  | "freight.shipments.read"
  | "freight.shipments.write"
  | "freight.dispatch.read"
  | "freight.dispatch.assign"
  | "freight.fulfillment.read"
  | "freight.fulfillment.write"
  | "freight.customs.read"
  | "freight.customs.write"
  | "freight.mailbox.read"
  | "freight.mailbox.write"
  | "freight.zones.read"
  | "freight.zones.write"
  | "freight.rates.read"
  | "freight.rates.write"
  | "freight.alerts.read"
  | "freight.alerts.write"
  | "freight.clients.read"
  | "freight.clients.write"
  | "freight.carriers.read"
  | "freight.carriers.write"
  | "ops.team.manage"
  | "ops.finance.read"
  | "ops.reports.read"
  | "ops.fleet.read";

export type EnterpriseAccessSection =
  | "mailbox_intake"
  | "customs"
  | "last_mile"
  | "domestic_setup"
  | "fleet_ops"
  | "business_finance"
  | "team";

export type EnterpriseSectionOverrides = Partial<Record<EnterpriseAccessSection, boolean>>;

export const ENTERPRISE_ACCESS_SECTION_KEYS: readonly EnterpriseAccessSection[] = [
  "mailbox_intake",
  "customs",
  "last_mile",
  "domestic_setup",
  "fleet_ops",
  "business_finance",
  "team",
] as const;

const SECTION_PERMS: Record<EnterpriseAccessSection, readonly EnterpriseSeatPermission[]> = {
  mailbox_intake: ["freight.mailbox.read", "freight.mailbox.write"],
  customs: ["freight.customs.read", "freight.customs.write"],
  last_mile: ["freight.fulfillment.read", "freight.fulfillment.write"],
  domestic_setup: [
    "freight.shipments.read",
    "freight.shipments.write",
    "freight.dispatch.read",
    "freight.dispatch.assign",
    "freight.zones.read",
    "freight.zones.write",
    "freight.clients.read",
    "freight.clients.write",
    "freight.carriers.read",
    "freight.carriers.write",
    "freight.rates.read",
    "freight.rates.write",
    "freight.alerts.read",
    "freight.alerts.write",
  ],
  fleet_ops: ["ops.fleet.read", "ops.reports.read"],
  business_finance: ["ops.finance.read"],
  team: ["ops.team.manage"],
};

const SECTION_GATE: Record<EnterpriseAccessSection, EnterpriseSeatPermission> = {
  mailbox_intake: "freight.mailbox.read",
  customs: "freight.customs.read",
  last_mile: "freight.fulfillment.read",
  domestic_setup: "freight.dispatch.read",
  fleet_ops: "ops.fleet.read",
  business_finance: "ops.finance.read",
  team: "ops.team.manage",
};

const ALL_PERMS: EnterpriseSeatPermission[] = [
  "freight.shipments.read",
  "freight.shipments.write",
  "freight.dispatch.read",
  "freight.dispatch.assign",
  "freight.fulfillment.read",
  "freight.fulfillment.write",
  "freight.customs.read",
  "freight.customs.write",
  "freight.mailbox.read",
  "freight.mailbox.write",
  "freight.zones.read",
  "freight.zones.write",
  "freight.rates.read",
  "freight.rates.write",
  "freight.alerts.read",
  "freight.alerts.write",
  "freight.clients.read",
  "freight.clients.write",
  "freight.carriers.read",
  "freight.carriers.write",
  "ops.team.manage",
  "ops.finance.read",
  "ops.reports.read",
  "ops.fleet.read",
];

const READ_OPS = ALL_PERMS.filter(
  (p) =>
    p.endsWith(".read") ||
    p === "ops.fleet.read" ||
    p === "ops.finance.read" ||
    p === "ops.reports.read",
);

const DISPATCHER: EnterpriseSeatPermission[] = [
  "freight.shipments.read",
  "freight.shipments.write",
  "freight.dispatch.read",
  "freight.dispatch.assign",
  "freight.fulfillment.read",
  "freight.fulfillment.write",
  "freight.zones.read",
  "freight.zones.write",
  "freight.alerts.read",
  "freight.alerts.write",
  "freight.carriers.read",
  "freight.clients.read",
  "freight.customs.read",
  "freight.mailbox.read",
  "freight.rates.read",
  "ops.fleet.read",
  "ops.reports.read",
];

const CUSTOMS: EnterpriseSeatPermission[] = [
  "freight.mailbox.read",
  "freight.mailbox.write",
  "freight.customs.read",
  "freight.customs.write",
  "freight.shipments.read",
  "freight.dispatch.read",
  "freight.fulfillment.read",
  "freight.alerts.read",
  "freight.clients.read",
  "freight.carriers.read",
  "ops.fleet.read",
];

const FINANCE: EnterpriseSeatPermission[] = [
  "freight.rates.read",
  "freight.rates.write",
  "freight.clients.read",
  "freight.clients.write",
  "freight.shipments.read",
  "freight.carriers.read",
  "freight.dispatch.read",
  "freight.fulfillment.read",
  "freight.alerts.read",
  "ops.finance.read",
  "ops.reports.read",
  "ops.fleet.read",
];

const WAREHOUSE: EnterpriseSeatPermission[] = [
  "freight.mailbox.read",
  "freight.mailbox.write",
];

const ROLE_PERMS: Record<EnterpriseSeatRole, readonly EnterpriseSeatPermission[]> = {
  enterprise_owner: ALL_PERMS,
  enterprise_dispatcher: DISPATCHER,
  enterprise_customs: CUSTOMS,
  enterprise_warehouse: WAREHOUSE,
  enterprise_finance: FINANCE,
  enterprise_viewer: READ_OPS,
};

export function resolveEnterpriseSeatRole(raw: string | null | undefined): EnterpriseSeatRole {
  if (!raw) return "enterprise_viewer";
  switch (raw) {
    case "enterprise_owner":
    case "fleet_owner":
    case "admin":
    case "enterprise_admin":
    case "enterprise_ops":
    case "platform_owner":
    case "superadmin":
      return "enterprise_owner";
    case "enterprise_dispatcher":
    case "fleet_manager":
    case "manager":
      return "enterprise_dispatcher";
    case "enterprise_customs":
      return "enterprise_customs";
    case "enterprise_warehouse":
      return "enterprise_warehouse";
    case "enterprise_finance":
    case "fleet_accountant":
      return "enterprise_finance";
    case "enterprise_viewer":
    case "fleet_viewer":
    case "viewer":
      return "enterprise_viewer";
    default:
      return "enterprise_viewer";
  }
}

export function parseSectionOverrides(raw: unknown): EnterpriseSectionOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: EnterpriseSectionOverrides = {};
  for (const key of ENTERPRISE_ACCESS_SECTION_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export function effectiveSeatPermissions(
  role: EnterpriseSeatRole,
  overrides: EnterpriseSectionOverrides = {},
): EnterpriseSeatPermission[] {
  const set = new Set<EnterpriseSeatPermission>(ROLE_PERMS[role] ?? []);
  for (const key of ENTERPRISE_ACCESS_SECTION_KEYS) {
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

export function effectiveSectionAccess(
  role: EnterpriseSeatRole,
  overrides: EnterpriseSectionOverrides = {},
): Record<EnterpriseAccessSection, boolean> {
  const effective = new Set(effectiveSeatPermissions(role, overrides));
  const out = {} as Record<EnterpriseAccessSection, boolean>;
  for (const key of ENTERPRISE_ACCESS_SECTION_KEYS) {
    out[key] = effective.has(SECTION_GATE[key]);
  }
  return out;
}

export function seatForbiddenResponse(
  message = "Insufficient seat permission",
): Response {
  return new Response(JSON.stringify({ error: "forbidden", message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
