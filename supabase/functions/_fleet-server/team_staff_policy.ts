/** Pure rules for fleet/enterprise staff seats. No I/O. */

export const TEAM_ROLES = [
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_warehouse",
  "enterprise_finance",
  "enterprise_viewer",
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

const PLATFORM_ROLES = new Set([
  "superadmin",
  "platform_owner",
  "platform_support",
  "platform_analyst",
]);

const OWNER_ROLES = new Set(["admin", "fleet_owner", "enterprise_owner"]);

export function isTeamRole(role: string | null | undefined): role is TeamRole {
  return TEAM_ROLES.includes(role as TeamRole);
}

export function isPlatformRole(role: string | null | undefined): boolean {
  return !!role && PLATFORM_ROLES.has(role);
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return !!role && OWNER_ROLES.has(role);
}

type MetaUser = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

/** Membership and role come from app_metadata only. user_metadata is ignored. */
export function authMetaOrgId(u: MetaUser): string | undefined {
  const app = u.app_metadata?.organizationId;
  if (typeof app === "string" && app.trim()) return app.trim();
  return undefined;
}

export function authMetaRole(u: MetaUser): string {
  const app = u.app_metadata?.role;
  if (typeof app === "string" && app.trim()) return app.trim();
  return "";
}

export function canChangeStaffRole(currentRole: string): { ok: true } | { ok: false; error: string } {
  if (isPlatformRole(currentRole)) return { ok: false, error: "This user cannot be modified" };
  if (isOwnerRole(currentRole)) return { ok: false, error: "Cannot change the organization owner's role" };
  if (!isTeamRole(currentRole)) {
    return { ok: false, error: "Role changes apply to staff only" };
  }
  return { ok: true };
}

export function canRemoveStaffSeat(currentRole: string): { ok: true } | { ok: false; error: string } {
  if (isPlatformRole(currentRole)) return { ok: false, error: "This user cannot be removed" };
  if (isOwnerRole(currentRole)) return { ok: false, error: "Cannot remove the organization owner" };
  if (!isTeamRole(currentRole)) {
    return { ok: false, error: "Only a staff seat can be removed here" };
  }
  return { ok: true };
}

/** A grantor may only grant a role strictly below their own level, never owner. */
export function canGrantRole(actorLevel: number, targetLevel: number, targetRole: string): boolean {
  if (isOwnerRole(targetRole) || targetRole === "fleet_owner" || targetRole === "enterprise_owner") {
    return false;
  }
  if (!isTeamRole(targetRole)) return false;
  return targetLevel < actorLevel;
}

export function namesMatch(typed: string, displayName: string): boolean {
  return typed.trim().toLowerCase() === displayName.trim().toLowerCase();
}

/** Role writes on another login are platform-owner only. Fleet tokens never qualify. */
export function mayWriteAnotherUsersRole(platformOwner: boolean): boolean {
  return platformOwner;
}

/** Customer name / business type edits are Roam platform staff only. */
export function mayWriteCustomerProfile(platformStaff: boolean): boolean {
  return platformStaff;
}

/** Fleet and enterprise tokens have no account-delete route. */
export function mayDeleteAccountFromFleetRoute(): boolean {
  return false;
}
