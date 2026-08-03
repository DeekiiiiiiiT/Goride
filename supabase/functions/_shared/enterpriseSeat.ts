/**
 * Enterprise customer seat checks for Deno edge (mirror of @roam/auth-client
 * enterpriseCustomerPermissions — keep maps in sync).
 */

export type EnterpriseSeatRole =
  | "enterprise_owner"
  | "enterprise_dispatcher"
  | "enterprise_customs"
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

const ROLE_PERMS: Record<EnterpriseSeatRole, readonly EnterpriseSeatPermission[]> = {
  enterprise_owner: ALL_PERMS,
  enterprise_dispatcher: DISPATCHER,
  enterprise_customs: CUSTOMS,
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

export function enterpriseSeatHasPermission(
  role: EnterpriseSeatRole,
  permission: EnterpriseSeatPermission,
): boolean {
  return ROLE_PERMS[role]?.includes(permission) ?? false;
}

export function seatForbiddenResponse(
  message = "Insufficient seat permission",
): Response {
  return new Response(JSON.stringify({ error: "forbidden", message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
