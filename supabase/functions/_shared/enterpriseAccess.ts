/**
 * Freight / logistics edge auth — enterprise org members (owner + seats) or platform.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";
import { PLATFORM_ROLES } from "./productAdmin.ts";
import {
  enterpriseSeatHasPermission,
  resolveEnterpriseSeatRole,
  seatForbiddenResponse,
  type EnterpriseSeatPermission,
} from "./enterpriseSeat.ts";

export type EnterpriseAccessUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  isPlatformRole: boolean;
};

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const ORG_SEAT_ROLES = new Set([
  "fleet_owner",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "admin",
  "manager",
  "viewer",
  "enterprise_owner",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_finance",
  "enterprise_viewer",
]);

export async function requireEnterpriseAccess(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<EnterpriseAccessUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getJwtRoles(user);
  const primaryRole = jwtPrimaryRole(user);
  const isPlatform = roles.some((r) => PLATFORM_ROLES.has(r));
  const svc = serviceClient();

  const orgIdHeader = c.req.header("X-Roam-Organization-Id");
  let organizationId =
    orgIdHeader ||
    (user.app_metadata?.organizationId as string | undefined) ||
    (user.user_metadata?.organizationId as string | undefined) ||
    "";

  if (!organizationId) {
    const { data: owned } = await svc
      .from("organizations")
      .select("id, product_line")
      .eq("owner_id", user.id)
      .eq("product_line", "enterprise")
      .limit(1)
      .maybeSingle();
    organizationId = owned?.id ?? "";
  }

  if (!organizationId && !isPlatform) {
    return c.json({ error: "Forbidden: no enterprise organization" }, 403);
  }

  if (organizationId) {
    const { data: org } = await svc
      .from("organizations")
      .select("id, product_line, owner_id")
      .eq("id", organizationId)
      .maybeSingle();

    if (!org) {
      return c.json({ error: "Forbidden: organization not found" }, 403);
    }
    if (org.product_line !== "enterprise" && !isPlatform) {
      return c.json({ error: "Forbidden: not an enterprise organization" }, 403);
    }
    const isOwner = org.owner_id === user.id;
    const jwtOrg =
      (user.app_metadata?.organizationId as string | undefined) ||
      (user.user_metadata?.organizationId as string | undefined) ||
      "";
    const isOrgSeat =
      jwtOrg === organizationId &&
      (ORG_SEAT_ROLES.has(primaryRole) || roles.some((r) => ORG_SEAT_ROLES.has(r)));
    if (!isOwner && !isOrgSeat && !isPlatform) {
      return c.json({ error: "Forbidden: not an organization member" }, 403);
    }
  }

  return {
    id: user.id,
    email: user.email ?? "",
    role: primaryRole,
    organizationId,
    isPlatformRole: isPlatform,
  };
}

/** Seat permission gate after requireEnterpriseAccess. Platform staff bypass. */
export function requireSeatPermission(
  user: EnterpriseAccessUser,
  permission: EnterpriseSeatPermission,
): true | Response {
  if (user.isPlatformRole) return true;
  const seat = resolveEnterpriseSeatRole(user.role);
  if (enterpriseSeatHasPermission(seat, permission)) return true;
  return seatForbiddenResponse(`Missing permission: ${permission}`);
}
