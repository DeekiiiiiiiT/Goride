/**
 * Pure compliance logic for courier admin — single source of truth for blockers and approve rules.
 */

export type CourierComplianceBlocker =
  | "no_profile"
  | "onboarding_incomplete"
  | "background_check_not_approved"
  | "license_missing"
  | "vehicle_missing"
  | "insurance_missing"
  | "account_suspended"
  | "account_deactivated";

export type CourierAccountStatus = "active" | "pending" | "suspended" | "deactivated";

export interface ComplianceProfileInput {
  status: CourierAccountStatus;
  onboarding_complete: boolean;
  background_check_status: string | null;
}

export interface ComplianceAssetInput {
  hasLicense: boolean;
  hasVehicle: boolean;
  hasInsurance: boolean;
}

export const FORCE_APPROVE_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "superadmin",
  "admin",
  "courier_admin",
]);
export const MIN_FORCE_APPROVE_REASON_LENGTH = 10;

const LIFECYCLE_BLOCKERS = new Set<CourierComplianceBlocker>([
  "account_suspended",
  "account_deactivated",
]);

export function computeComplianceBlockers(
  profile: ComplianceProfileInput | null,
  assets: ComplianceAssetInput,
): CourierComplianceBlocker[] {
  if (!profile) return ["no_profile"];

  const blockers: CourierComplianceBlocker[] = [];

  if (profile.status === "suspended") blockers.push("account_suspended");
  if (profile.status === "deactivated") blockers.push("account_deactivated");
  if (!profile.onboarding_complete) blockers.push("onboarding_incomplete");

  const bg = profile.background_check_status?.trim().toLowerCase();
  if (bg !== "approved") blockers.push("background_check_not_approved");

  if (!assets.hasLicense) blockers.push("license_missing");
  if (!assets.hasVehicle) blockers.push("vehicle_missing");
  if (!assets.hasInsurance) blockers.push("insurance_missing");

  return blockers;
}

export function getStrictApproveBlockers(
  blockers: CourierComplianceBlocker[],
): CourierComplianceBlocker[] {
  return blockers.filter((b) => !LIFECYCLE_BLOCKERS.has(b));
}

export function canStrictApprove(
  blockers: CourierComplianceBlocker[],
  status: CourierAccountStatus,
): boolean {
  if (status !== "pending") return false;
  if (blockers.includes("no_profile")) return false;
  if (blockers.some((b) => LIFECYCLE_BLOCKERS.has(b))) return false;
  return getStrictApproveBlockers(blockers).length === 0;
}

export function hasForceApproveRole(roles: string[]): boolean {
  return roles.some((r) => FORCE_APPROVE_ROLES.has(r));
}

export function canForceApprove(
  roleOrRoles: string | string[],
  blockers: CourierComplianceBlocker[],
  status: CourierAccountStatus,
): boolean {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  if (!hasForceApproveRole(roles)) return false;
  if (status !== "pending") return false;
  if (blockers.includes("no_profile")) return false;
  if (blockers.some((b) => LIFECYCLE_BLOCKERS.has(b))) return false;
  return true;
}

export function isInComplianceQueue(
  blockers: CourierComplianceBlocker[],
  status: CourierAccountStatus,
): boolean {
  if (status === "pending") return true;
  return getStrictApproveBlockers(blockers).length > 0;
}

export type ApproveValidationResult =
  | { ok: true; force: boolean; reason?: string }
  | { ok: false; error: string; message: string; httpStatus: number };

export function validateApproveRequest(
  input: { force?: boolean; reason?: string },
  blockers: CourierComplianceBlocker[],
  status: CourierAccountStatus,
  adminRoles: string | string[],
): ApproveValidationResult {
  const roles = Array.isArray(adminRoles) ? adminRoles : [adminRoles];
  if (blockers.includes("no_profile")) {
    return {
      ok: false,
      error: "no_profile",
      message: "Courier profile not found. Courier must complete signup first.",
      httpStatus: 404,
    };
  }

  if (
    status === "suspended" ||
    status === "deactivated" ||
    blockers.includes("account_suspended") ||
    blockers.includes("account_deactivated")
  ) {
    return {
      ok: false,
      error: "blocked_lifecycle_state",
      message: "Cannot approve a suspended or deactivated account.",
      httpStatus: 409,
    };
  }

  if (status !== "pending") {
    return {
      ok: false,
      error: "not_pending",
      message: "Only pending accounts can be approved.",
      httpStatus: 409,
    };
  }

  const force = Boolean(input.force);
  if (force) {
    if (!canForceApprove(roles, blockers, status)) {
      return {
        ok: false,
        error: "forbidden",
        message: "Force approve requires courier_admin or platform role.",
        httpStatus: 403,
      };
    }
    const reason = (input.reason ?? "").trim();
    if (reason.length < MIN_FORCE_APPROVE_REASON_LENGTH) {
      return {
        ok: false,
        error: "force_reason_required",
        message: `Force approve reason must be at least ${MIN_FORCE_APPROVE_REASON_LENGTH} characters.`,
        httpStatus: 400,
      };
    }
    return { ok: true, force: true, reason };
  }

  if (!canStrictApprove(blockers, status)) {
    return {
      ok: false,
      error: "compliance_incomplete",
      message: "Compliance requirements are not met. Resolve blockers or use force approve.",
      httpStatus: 409,
    };
  }

  return { ok: true, force: false };
}
