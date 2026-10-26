/**
 * Dominion access uses the trusted app record only.
 * A profile field the person can edit never grants access.
 */
import { getJwtRoles } from "./fleet_owner_provision.ts";

const PLATFORM_APP_ROLES = [
  "platform_owner",
  "platform_support",
  "platform_analyst",
  "superadmin",
] as const;

const STAFF_ROLES_THAT_CAN_CHANGE = new Set(["platform_support", "platform_analyst"]);

export type AuthRoleUser = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type DominionAccess =
  | { ok: true; role: string }
  | { ok: false; reason: "no_platform_role" };

/** Password already succeeded. Allow only a platform role on the trusted app record. */
export function dominionAccessDecision(user: AuthRoleUser): DominionAccess {
  const roles = getJwtRoles(user);
  const role = PLATFORM_APP_ROLES.find((candidate) => roles.includes(candidate));
  if (!role) return { ok: false, reason: "no_platform_role" };
  return { ok: true, role };
}

/** True when the trusted app record says this person is the platform owner. */
export function hasPlatformOwnerAppRole(user: AuthRoleUser): boolean {
  const roles = getJwtRoles(user);
  return roles.includes("platform_owner") || roles.includes("superadmin");
}

/**
 * Role shown on the platform team list.
 * Legacy `superadmin` on the trusted app record is the owner.
 */
export function displayedPlatformRole(user: AuthRoleUser): string | null {
  const roles = getJwtRoles(user);
  if (roles.includes("platform_owner") || roles.includes("superadmin")) return "platform_owner";
  if (roles.includes("platform_support")) return "platform_support";
  if (roles.includes("platform_analyst")) return "platform_analyst";
  return null;
}

/**
 * Fleet manager: trusted app record has admin or fleet_owner,
 * or the old profile field is still admin. Profile `superadmin` does not count.
 */
export function userIsFleetManager(user: AuthRoleUser): boolean {
  const roles = getJwtRoles(user);
  if (roles.includes("admin") || roles.includes("fleet_owner")) return true;
  return user.user_metadata?.role === "admin";
}

/** Add the new staff role and drop the previous support/analyst role. Other roles stay. */
export function mergePlatformStaffRole(
  appMeta: Record<string, unknown>,
  nextStaffRole: "platform_support" | "platform_analyst",
): { role: string; roles: string[] } {
  const drop = STAFF_ROLES_THAT_CAN_CHANGE;
  const current = getJwtRoles({ app_metadata: appMeta });
  const roles = [...new Set([...current.filter((role) => !drop.has(role)), nextStaffRole])];
  const primary = typeof appMeta.role === "string" ? appMeta.role.trim() : "";
  const role = primary && roles.includes(primary) ? primary : nextStaffRole;
  return { role, roles };
}

/** Take support/analyst off the trusted app record. Owner, fleet, and driver roles stay. */
export function removePlatformStaffRoles(
  appMeta: Record<string, unknown>,
): { role: string; roles: string[] } {
  const roles = getJwtRoles({ app_metadata: appMeta }).filter(
    (role) => !STAFF_ROLES_THAT_CAN_CHANGE.has(role),
  );
  const primary = typeof appMeta.role === "string" ? appMeta.role.trim() : "";
  const role = primary && roles.includes(primary) ? primary : (roles[0] ?? "");
  return { role, roles };
}

type ListedUser = AuthRoleUser & { id?: string };

/** Page through Auth admin listUsers. Stops at the first short page. */
export async function listAllAuthUsers(
  listUsers: (args: { page: number; perPage: number }) => Promise<{
    data: { users: ListedUser[] } | null;
    error: { message: string } | null;
  }>,
): Promise<ListedUser[]> {
  const users: ListedUser[] = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}
