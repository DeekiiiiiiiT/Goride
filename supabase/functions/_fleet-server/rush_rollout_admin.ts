/**
 * RoamFleet × Rush — platform admin helpers for org service lines and rollout flags.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  FEATURE_FLAGS,
  type FeatureFlagValue,
  getAllFeatureFlags,
  isFeatureEnabled,
} from "./feature_flags.ts";
import {
  RUSH_MODULE_KEYS,
  rushModuleOverridesForServiceLines,
} from "./enterprise_modules.ts";
import {
  hasPlatformOwnerAccess,
  hasPlatformStaffAccess,
  type RbacUser,
} from "./rbac_middleware.ts";

export const RUSH_ROLLOUT_FLAG_NAMES = [
  FEATURE_FLAGS.SERVICE_LINES_ENABLED,
  FEATURE_FLAGS.RUSH_COURIER_LINK,
  FEATURE_FLAGS.RUSH_TRIP_PROJECTION,
  FEATURE_FLAGS.RUSH_UI,
  FEATURE_FLAGS.RUSH_SETTLEMENT,
] as const;

export type RushRolloutFlagName = (typeof RUSH_ROLLOUT_FLAG_NAMES)[number];

export const RUSH_ROLLOUT_FLAG_CATALOG: ReadonlyArray<{
  key: RushRolloutFlagName;
  label: string;
  description: string;
  step: number;
}> = [
  {
    key: FEATURE_FLAGS.SERVICE_LINES_ENABLED,
    label: "Service lines config",
    description: "Org reads multi-line service_lines instead of business_type only",
    step: 1,
  },
  {
    key: FEATURE_FLAGS.RUSH_COURIER_LINK,
    label: "Courier linking",
    description: "Workforce invites and courier↔fleet membership",
    step: 2,
  },
  {
    key: FEATURE_FLAGS.RUSH_TRIP_PROJECTION,
    label: "Trip projection",
    description: "Project Rush orders into fleet.trips",
    step: 3,
  },
  {
    key: FEATURE_FLAGS.RUSH_UI,
    label: "Delivery UI",
    description: "Delivery navigation and pages in RoamFleet",
    step: 4,
  },
  {
    key: FEATURE_FLAGS.RUSH_SETTLEMENT,
    label: "Settlement",
    description: "Include delivery revenue in weekly settlement",
    step: 5,
  },
];

export function isRushRolloutFlag(flagName: string): flagName is RushRolloutFlagName {
  return (RUSH_ROLLOUT_FLAG_NAMES as readonly string[]).includes(flagName);
}

/** Rush rollout flags: platform staff only. Other flags: owner/staff or fleet_owner scoped to own org. */
export function canMutateFeatureFlag(
  user: RbacUser,
  flagName: string,
  targetOrgId?: string | null,
): { allowed: boolean; reason?: string } {
  if (isRushRolloutFlag(flagName)) {
    if (!hasPlatformOwnerAccess(user)) {
      return { allowed: false, reason: "Rush rollout flags require platform owner" };
    }
    return { allowed: true };
  }

  if (hasPlatformOwnerAccess(user) || hasPlatformStaffAccess(user)) {
    return { allowed: true };
  }

  if (user.resolvedRole === "fleet_owner") {
    const ownOrg = user.organizationId || user.userId;
    if (targetOrgId && targetOrgId !== ownOrg) {
      return { allowed: false, reason: "Fleet owners can only mutate flags for their own org" };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Forbidden" };
}

export function canViewPlatformOrgAdmin(user: RbacUser): boolean {
  return hasPlatformStaffAccess(user);
}

export function canEditOrgServiceLines(user: RbacUser): boolean {
  return hasPlatformOwnerAccess(user);
}

export function parseServiceLinesInput(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const lines = raw.filter((s) => s === "rideshare" || s === "rush_delivery");
  return lines.length ? lines : null;
}

export function primaryBusinessTypeFromServiceLines(lines: string[]): string {
  return lines.includes("rush_delivery") && !lines.includes("rideshare")
    ? "delivery"
    : "rideshare";
}

export async function applyOrgServiceLines(
  supabase: SupabaseClient,
  orgId: string,
  lines: string[],
): Promise<{
  serviceLines: string[];
  businessType: string;
  enabledModules: Record<string, boolean>;
}> {
  const primary = primaryBusinessTypeFromServiceLines(lines);
  const { data: existing } = await supabase
    .from("organizations")
    .select("enabled_modules")
    .eq("id", orgId)
    .maybeSingle();

  const enabledModules = rushModuleOverridesForServiceLines(
    lines,
    (existing?.enabled_modules as Record<string, boolean> | null) ?? null,
  );

  const { data, error } = await supabase
    .from("organizations")
    .update({
      service_lines: lines,
      business_type: primary,
      enabled_modules: enabledModules,
    })
    .eq("id", orgId)
    .select("service_lines, business_type, enabled_modules")
    .single();

  if (error) throw error;

  return {
    serviceLines: data.service_lines as string[],
    businessType: data.business_type as string,
    enabledModules: data.enabled_modules as Record<string, boolean>,
  };
}

export function pickRushModules(
  enabledModules: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of RUSH_MODULE_KEYS) {
    out[key] = enabledModules?.[key] === true;
  }
  return out;
}

export type RushRolloutFlagStatus = {
  flag: RushRolloutFlagName;
  label: string;
  description: string;
  step: number;
  globalEnabled: boolean;
  enabledForOrg: boolean;
  disabledForOrg: boolean;
  effectiveForOrg: boolean;
};

export async function buildRushRolloutStatus(orgId: string): Promise<{
  orgId: string;
  serviceLines: string[];
  businessType: string | null;
  rushModulesEffective: Record<string, boolean>;
  flags: RushRolloutFlagStatus[];
}> {
  const flagsMap = await getAllFeatureFlags();

  let serviceLines: string[] = ["rideshare"];
  let businessType: string | null = null;
  let rushModulesEffective: Record<string, boolean> = {};

  return {
    orgId,
    serviceLines,
    businessType,
    rushModulesEffective,
    flags: await Promise.all(
      RUSH_ROLLOUT_FLAG_CATALOG.map(async (entry) => {
        const config = flagsMap[entry.key] as FeatureFlagValue | undefined;
        const effectiveForOrg = await isFeatureEnabled(entry.key, orgId);
        return {
          flag: entry.key,
          label: entry.label,
          description: entry.description,
          step: entry.step,
          globalEnabled: config?.enabled === true,
          enabledForOrg: config?.enabledForOrgs?.includes(orgId) === true,
          disabledForOrg: config?.disabledForOrgs?.includes(orgId) === true,
          effectiveForOrg,
        };
      }),
    ),
  };
}

export async function buildRushRolloutStatusWithOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Awaited<ReturnType<typeof buildRushRolloutStatus>>> {
  const { data: org } = await supabase
    .from("organizations")
    .select("service_lines, business_type, enabled_modules")
    .eq("id", orgId)
    .maybeSingle();

  const base = await buildRushRolloutStatus(orgId);
  base.serviceLines = (org?.service_lines as string[] | null) ?? ["rideshare"];
  base.businessType = (org?.business_type as string | null) ?? null;
  base.rushModulesEffective = pickRushModules(
    org?.enabled_modules as Record<string, boolean> | null,
  );
  return base;
}
