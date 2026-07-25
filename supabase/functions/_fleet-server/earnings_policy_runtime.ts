/**
 * Edge-safe earnings policy resolve for ledger / money math.
 * Mirrors client utils/earningsPolicyResolve.ts semantics without date-fns.
 */

import { migrateVersionAssignmentsServer } from "./earnings_policy_validation.ts";

export interface LegacyEarningsConfigEH {
  tiers: any[];
  quotas: any;
  personalAllowance: any;
}

export interface ResolvedEarningsBundleEH {
  tiers: any[];
  quotas: any;
  personalAllowance: any;
  source: "version" | "default" | "legacy";
  policyId?: string;
  versionId?: string;
  policyName?: string;
}

function cloneDeep<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Monday yyyy-MM-dd for a calendar ymd (UTC date parts — fleet stores Mondays as ymd). */
export function mondayYmdFromYmd(ymd: string): string {
  const key = String(ymd || "").split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function assignmentAppliesToWeek(
  assignment: { effectiveFrom?: string; effectiveUntil?: string },
  weekStartYmd: string,
): boolean {
  const key = String(weekStartYmd).split("T")[0];
  const from = String(assignment.effectiveFrom || "").split("T")[0];
  if (!from || from > key) return false;
  const until = assignment.effectiveUntil
    ? String(assignment.effectiveUntil).split("T")[0]
    : "";
  if (until && until <= key) return false;
  return true;
}

function normalizePolicyVersions(policy: any): any {
  if (!policy || typeof policy !== "object") return policy;
  const versions = Array.isArray(policy.versions)
    ? [...policy.versions]
        .map(migrateVersionAssignmentsServer)
        .sort((a: any, b: any) =>
          String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
        )
    : [];
  return { ...policy, versions };
}

function templateAsVersion(policy: any): any | undefined {
  if (!policy?.tiers?.length) return undefined;
  return {
    id: `template-${policy.id}`,
    tiers: cloneDeep(policy.tiers || []),
    quotas: cloneDeep(policy.quotas),
    personalAllowance: cloneDeep(policy.personalAllowance),
    assignments: [],
    createdAt: policy.versions?.[0]?.createdAt || new Date(0).toISOString(),
  };
}

function resolveVersionForWeek(policy: any): any | undefined {
  const normalized = normalizePolicyVersions(policy);
  if (normalized.versions?.length) {
    return normalized.versions[normalized.versions.length - 1];
  }
  return templateAsVersion(normalized);
}

function listDriverAssignments(policies: any[], driverId: string): any[] {
  const hits: any[] = [];
  for (const raw of policies) {
    const p = normalizePolicyVersions(raw);
    for (const v of p.versions || []) {
      for (const a of v.assignments || []) {
        if (a.driverId === driverId) {
          hits.push({ policy: p, version: v, assignment: a });
        }
      }
    }
  }
  return hits;
}

/**
 * Explicit assignment for driver-week, else Default (or first) policy latest version.
 */
export function resolveDriverVersionForWeekEH(
  policies: any[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): { policy: any; version: any; assignment?: any } | undefined {
  const key = String(weekStartYmd).split("T")[0];
  if (driverId) {
    const hits = listDriverAssignments(policies, driverId).filter((h) =>
      assignmentAppliesToWeek(h.assignment, key),
    );
    if (hits.length > 0) {
      hits.sort((a, b) =>
        String(a.assignment.effectiveFrom).localeCompare(
          String(b.assignment.effectiveFrom),
        ),
      );
      const best = hits[hits.length - 1];
      return {
        policy: best.policy,
        version: best.version,
        assignment: best.assignment,
      };
    }
  }

  const defaultPolicy = policies.find((p) => p.isDefault) || policies[0];
  if (!defaultPolicy) return undefined;
  const normalized = normalizePolicyVersions(defaultPolicy);
  const version = resolveVersionForWeek(normalized);
  if (!version) return undefined;
  return { policy: normalized, version };
}

/**
 * Dual-read facade (same order as client earningsPolicyResolve):
 * covering version membership → Default policy template/version → legacy prefs
 */
export function resolveActiveEarningsBundleForDriverWeek(
  params: {
    policies: any[];
    driverId?: string | null;
    weekStartYmd: string;
    legacy: LegacyEarningsConfigEH;
  },
): ResolvedEarningsBundleEH {
  const { policies, driverId, weekStartYmd, legacy } = params;

  if (!policies || policies.length === 0) {
    return {
      tiers: legacy.tiers,
      quotas: legacy.quotas,
      personalAllowance: legacy.personalAllowance,
      source: "legacy",
    };
  }

  const hit = resolveDriverVersionForWeekEH(policies, driverId, weekStartYmd);
  if (hit) {
    const isDriverMember = !!hit.assignment;
    return {
      tiers: hit.version.tiers,
      quotas: hit.version.quotas,
      personalAllowance: hit.version.personalAllowance,
      source: isDriverMember ? "version" : "default",
      policyId: hit.policy.id,
      versionId: hit.version.id,
      policyName: hit.policy.name,
    };
  }

  const defaultPolicy = policies.find((p) => p.isDefault);
  if (defaultPolicy) {
    const normalized = normalizePolicyVersions(defaultPolicy);
    const version =
      resolveVersionForWeek(normalized) || templateAsVersion(normalized);
    if (version) {
      return {
        tiers: version.tiers,
        quotas: version.quotas,
        personalAllowance: version.personalAllowance,
        source: "default",
        policyId: defaultPolicy.id,
        versionId: version.id,
        policyName: defaultPolicy.name,
      };
    }

    return {
      tiers: normalized.tiers || [],
      quotas: normalized.quotas,
      personalAllowance: normalized.personalAllowance,
      source: "default",
      policyId: defaultPolicy.id,
      policyName: defaultPolicy.name,
    };
  }

  return {
    tiers: legacy.tiers,
    quotas: legacy.quotas,
    personalAllowance: legacy.personalAllowance,
    source: "legacy",
  };
}

/** Quota target for daily | weekly | monthly — mirrors ledger earnings-history helper. */
export function getQuotaTargetForPeriod(
  periodType: string,
  quotaConfig: any,
): number | null {
  if (!quotaConfig) return null;
  if (periodType === "daily") {
    if (!quotaConfig.weekly?.enabled) return null;
    const workingDays = quotaConfig.weekly.workingDays?.length || 6;
    return quotaConfig.weekly.amount / workingDays;
  }
  if (periodType === "weekly") {
    if (!quotaConfig.weekly?.enabled) return null;
    return quotaConfig.weekly.amount;
  }
  if (quotaConfig.monthly?.enabled) return quotaConfig.monthly.amount;
  if (quotaConfig.weekly?.enabled) return quotaConfig.weekly.amount * 4.33;
  return null;
}

export function getTierForEarningsEH(cumulative: number, tiers: any[]): any {
  const sorted = [...(tiers || [])].sort(
    (a, b) => (a.minEarnings ?? 0) - (b.minEarnings ?? 0),
  );
  if (sorted.length === 0) {
    return {
      id: "tier_fallback",
      name: "Default",
      minEarnings: 0,
      maxEarnings: null,
      sharePercentage: 25,
      color: "#94a3b8",
    };
  }
  const match = sorted.find((t) => {
    if (t.maxEarnings === null || t.maxEarnings === undefined) {
      return cumulative >= t.minEarnings;
    }
    return cumulative >= t.minEarnings && cumulative < t.maxEarnings;
  });
  return match || sorted[0];
}
