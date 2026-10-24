/**
 * Who this person is on a request.
 * Platform roles come from the login. Fleet dashboard power comes from the
 * owner record or one active staff seat. A driver or courier comes from an
 * open membership. A saved staff role on the login never grants access.
 */

export type DashboardRole =
  | "platform_owner"
  | "platform_support"
  | "platform_analyst"
  | "fleet_owner"
  | "fleet_manager"
  | "fleet_accountant"
  | "fleet_viewer"
  | "driver"
  | "unassigned";

export type AccessSeat = {
  id: string;
  status: string;
  scopeId: string;
  roleName: string;
  grantedAt: string;
};

export type OwnedOrg = {
  id: string;
  productLine: "fleet" | "enterprise";
};

export type OpenMembership = {
  organizationId: string;
  serviceLine: string;
  status: string;
};

export type AccessDecision = {
  rawRole: string;
  resolvedRole: DashboardRole;
  staffRole: string | null;
  organizationId: string | null;
  productLine: "fleet" | "enterprise" | null;
  portal: boolean;
};

const PLATFORM = new Set([
  "superadmin",
  "platform_owner",
  "platform_support",
  "platform_analyst",
]);

const STAFF_NAMES = new Set([
  "fleet_owner",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "enterprise_owner",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_warehouse",
  "enterprise_finance",
  "enterprise_viewer",
]);

const PORTAL = new Set<DashboardRole>([
  "fleet_owner",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
]);

export function dashboardRole(raw: string): DashboardRole {
  switch (raw) {
    case "superadmin":
      return "platform_owner";
    case "admin":
    case "fleet_owner":
    case "enterprise_owner":
      return "fleet_owner";
    case "manager":
    case "fleet_manager":
    case "enterprise_dispatcher":
    case "enterprise_customs":
    case "enterprise_warehouse":
      return "fleet_manager";
    case "fleet_accountant":
    case "enterprise_finance":
      return "fleet_accountant";
    case "viewer":
    case "fleet_viewer":
    case "enterprise_viewer":
      return "fleet_viewer";
    case "platform_owner":
    case "platform_support":
    case "platform_analyst":
    case "driver":
      return raw;
    default:
      return "unassigned";
  }
}

function sortSeats(seats: AccessSeat[]): AccessSeat[] {
  return [...seats].sort((a, b) => {
    const byTime = a.grantedAt.localeCompare(b.grantedAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

function productOfRole(roleName: string, org?: OwnedOrg): "fleet" | "enterprise" {
  if (org?.productLine === "enterprise" || roleName.startsWith("enterprise_")) return "enterprise";
  return "fleet";
}

export function resolveAccess(input: {
  jwtRole: string;
  jwtOrgId: string | null;
  seats: AccessSeat[];
  ownedOrgs: OwnedOrg[];
  memberships: OpenMembership[];
}): AccessDecision {
  const jwtRole = input.jwtRole.trim();
  if (PLATFORM.has(jwtRole)) {
    const resolved = dashboardRole(jwtRole);
    return {
      rawRole: jwtRole,
      resolvedRole: resolved,
      staffRole: null,
      organizationId: input.jwtOrgId,
      productLine: null,
      portal: false,
    };
  }

  const active = sortSeats(
    input.seats.filter((s) => s.status === "active" && STAFF_NAMES.has(s.roleName) && s.scopeId),
  );
  const jwtOrg = input.jwtOrgId;
  const ownerOf = (orgId: string) => input.ownedOrgs.find((o) => o.id === orgId);
  const seatOf = (orgId: string) => active.find((s) => s.scopeId === orgId);
  const suspendedHere = !!jwtOrg && input.seats.some(
    (s) => s.status === "suspended" && s.scopeId === jwtOrg && STAFF_NAMES.has(s.roleName),
  );

  let roleName = "";
  let organizationId: string | null = null;
  let productLine: "fleet" | "enterprise" | null = null;

  const owned = jwtOrg ? ownerOf(jwtOrg) : undefined;
  const seated = jwtOrg ? seatOf(jwtOrg) : undefined;
  if (owned) {
    roleName = owned.productLine === "enterprise" ? "enterprise_owner" : "fleet_owner";
    organizationId = owned.id;
    productLine = owned.productLine;
  } else if (seated) {
    roleName = seated.roleName;
    organizationId = seated.scopeId;
    productLine = productOfRole(seated.roleName);
  } else if (!suspendedHere && input.ownedOrgs.length === 1 && active.every((s) => s.scopeId === input.ownedOrgs[0].id)) {
    const org = input.ownedOrgs[0];
    roleName = org.productLine === "enterprise" ? "enterprise_owner" : "fleet_owner";
    organizationId = org.id;
    productLine = org.productLine;
  } else if (!suspendedHere && active.length === 1 && input.ownedOrgs.length === 0) {
    roleName = active[0].roleName;
    organizationId = active[0].scopeId;
    productLine = productOfRole(active[0].roleName);
  } else if (
    !suspendedHere &&
    active.length === 1 &&
    input.ownedOrgs.length === 1 &&
    active[0].scopeId === input.ownedOrgs[0].id
  ) {
    const org = input.ownedOrgs[0];
    roleName = org.productLine === "enterprise" ? "enterprise_owner" : "fleet_owner";
    organizationId = org.id;
    productLine = org.productLine;
  }

  if (roleName && organizationId) {
    const resolved = dashboardRole(roleName);
    const worker = jwtRole === "driver" || jwtRole === "courier";
    return {
      rawRole: worker ? jwtRole : roleName,
      resolvedRole: resolved,
      staffRole: roleName,
      organizationId,
      productLine,
      portal: PORTAL.has(resolved),
    };
  }

  const open = input.memberships.filter((m) => m.status !== "ended" && m.organizationId);
  const matched = jwtOrg ? open.find((m) => m.organizationId === jwtOrg) : undefined;
  const membership = matched || (open.length === 1 ? open[0] : undefined);
  if (jwtRole === "driver" || membership?.serviceLine === "rideshare") {
    return {
      rawRole: "driver",
      resolvedRole: "driver",
      staffRole: null,
      organizationId: membership?.organizationId ?? null,
      productLine: membership ? "fleet" : null,
      portal: false,
    };
  }
  if (jwtRole === "courier" || membership?.serviceLine === "rush_delivery") {
    return {
      rawRole: "courier",
      resolvedRole: "unassigned",
      staffRole: null,
      organizationId: membership?.organizationId ?? null,
      productLine: null,
      portal: false,
    };
  }
  return {
    rawRole: "",
    resolvedRole: "unassigned",
    staffRole: null,
    organizationId: null,
    productLine: null,
    portal: false,
  };
}
