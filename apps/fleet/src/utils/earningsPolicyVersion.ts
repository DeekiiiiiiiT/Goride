/**
 * Earnings policy versioning: Rules = bundle template; Schedule = period + drivers.
 * Mirrors fuelPolicyVersion.ts patterns for consistency.
 */

import { format, parseISO } from 'date-fns';
import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../types/data';
import type { EarningsPolicy, EarningsPolicyVersion } from '../types/earningsPolicy';
import {
  isMondayYmd,
  mondayYmdForDate,
  upcomingMondayOptions,
  versionWindowsOverlap,
  LEGACY_POLICY_EFFECTIVE_FROM,
  POLICY_VERSION_EARLIEST_MONDAY,
} from './fuelPolicyVersion';

export {
  isMondayYmd,
  mondayYmdForDate,
  upcomingMondayOptions,
  versionWindowsOverlap,
  LEGACY_POLICY_EFFECTIVE_FROM,
  POLICY_VERSION_EARLIEST_MONDAY,
};

function cloneTiers(tiers: TierConfig[]): TierConfig[] {
  return tiers.map((t) => ({ ...t }));
}

function cloneQuotas(q: QuotaConfig): QuotaConfig {
  return {
    daily: { ...q.daily, workingDays: q.daily.workingDays ? [...q.daily.workingDays] : undefined },
    weekly: { ...q.weekly, workingDays: q.weekly.workingDays ? [...q.weekly.workingDays] : undefined },
    monthly: { ...q.monthly, workingDays: q.monthly.workingDays ? [...q.monthly.workingDays] : undefined },
  };
}

function clonePersonalAllowance(pa: PersonalAllowanceTierConfig): PersonalAllowanceTierConfig {
  return {
    ...pa,
    bands: pa.bands.map((b) => ({ ...b })),
  };
}

function cloneBundle(policy: EarningsPolicy): {
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
} {
  return {
    tiers: cloneTiers(policy.tiers || []),
    quotas: cloneQuotas(policy.quotas),
    personalAllowance: clonePersonalAllowance(policy.personalAllowance),
  };
}

function sortVersions(versions: EarningsPolicyVersion[]): EarningsPolicyVersion[] {
  return [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function normalizeVersion(v: EarningsPolicyVersion): EarningsPolicyVersion {
  return {
    ...v,
    tiers: cloneTiers(v.tiers || []),
    quotas: cloneQuotas(v.quotas),
    personalAllowance: clonePersonalAllowance(v.personalAllowance),
    driverIds: Array.isArray(v.driverIds) ? [...v.driverIds] : [],
  };
}

/**
 * Ensure version.driverIds arrays exist. Does not invent schedule versions —
 * empty versions means Rules-only until Schedule adds a window.
 */
export function normalizePolicyVersions(policy: EarningsPolicy): EarningsPolicy {
  const bundle = cloneBundle(policy);
  const versions = policy.versions?.length
    ? sortVersions(policy.versions.map(normalizeVersion))
    : [];

  return {
    ...policy,
    ...bundle,
    versions,
  };
}

/** Synthetic open window from template when Schedule has no versions yet (Default fallback). */
export function templateAsVersion(policy: EarningsPolicy): EarningsPolicyVersion | undefined {
  if (!policy.tiers?.length) return undefined;
  return {
    id: `template-${policy.id}`,
    effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
    ...cloneBundle(policy),
    driverIds: [],
    createdAt: policy.versions?.[0]?.createdAt || new Date(0).toISOString(),
  };
}

/** True when version window covers this Monday weekStart (until is exclusive). */
export function versionAppliesToWeek(
  version: EarningsPolicyVersion,
  weekStartYmd: string,
): boolean {
  const key = String(weekStartYmd).split('T')[0];
  const from = String(version.effectiveFrom || '').split('T')[0];
  if (!from || from > key) return false;
  const until = version.effectiveUntil ? String(version.effectiveUntil).split('T')[0] : '';
  if (until && until <= key) return false;
  return true;
}

export type DriverVersionHit = {
  policy: EarningsPolicy;
  version: EarningsPolicyVersion;
};

/** All version windows (any policy) that list this driver. */
export function listDriverVersionAssignments(
  policies: EarningsPolicy[],
  driverId: string,
): DriverVersionHit[] {
  const hits: DriverVersionHit[] = [];
  for (const raw of policies) {
    const p = normalizePolicyVersions(raw);
    for (const v of p.versions || []) {
      if ((v.driverIds || []).includes(driverId)) {
        hits.push({ policy: p, version: v });
      }
    }
  }
  return hits;
}

/**
 * Block same driver on overlapping windows (any policy).
 * `ignoreVersionId` = version being edited.
 */
export function findDriverWindowCollision(params: {
  policies: EarningsPolicy[];
  driverIds: string[];
  effectiveFrom: string;
  effectiveUntil?: string | null;
  ignoreVersionId?: string | null;
  ignorePolicyId?: string | null;
}): { driverId: string; policyName: string; versionLabel: string } | null {
  const window = {
    effectiveFrom: params.effectiveFrom,
    effectiveUntil: params.effectiveUntil || undefined,
  };
  for (const driverId of params.driverIds) {
    for (const hit of listDriverVersionAssignments(params.policies, driverId)) {
      if (params.ignoreVersionId && hit.version.id === params.ignoreVersionId) continue;
      if (
        params.ignorePolicyId &&
        params.ignoreVersionId &&
        hit.policy.id === params.ignorePolicyId &&
        hit.version.id === params.ignoreVersionId
      ) {
        continue;
      }
      if (versionWindowsOverlap(window, hit.version)) {
        return {
          driverId,
          policyName: hit.policy.name,
          versionLabel: versionWindowLabel(hit.version),
        };
      }
    }
  }
  return null;
}

export function assertNoDriverWindowCollision(params: {
  policies: EarningsPolicy[];
  driverIds: string[];
  effectiveFrom: string;
  effectiveUntil?: string | null;
  ignoreVersionId?: string | null;
}): void {
  const hit = findDriverWindowCollision(params);
  if (!hit) return;
  throw new Error(
    `Driver already has an overlapping period on "${hit.policyName}" (${hit.versionLabel}). Pick different dates or remove them from the other version first.`,
  );
}

/**
 * Explicit version membership for this driver-week, else Default policy for the week.
 */
export function resolveDriverVersionForWeek(
  policies: EarningsPolicy[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): DriverVersionHit | undefined {
  const key = String(weekStartYmd).split('T')[0];
  if (driverId) {
    const hits = listDriverVersionAssignments(policies, driverId).filter((h) =>
      versionAppliesToWeek(h.version, key),
    );
    if (hits.length > 0) {
      hits.sort((a, b) => a.version.effectiveFrom.localeCompare(b.version.effectiveFrom));
      return hits[hits.length - 1];
    }
  }

  const defaultPolicy = policies.find((p) => p.isDefault) || policies[0];
  if (!defaultPolicy) return undefined;
  const normalized = normalizePolicyVersions(defaultPolicy);
  const version = resolveVersionForWeek(normalized, key);
  if (!version) return undefined;
  return { policy: normalized, version };
}

/**
 * Version active for a week on a single policy (among covering windows, latest from).
 * Used for Default fallback / display — ignores driverIds.
 */
export function resolveVersionForWeek(
  policy: EarningsPolicy,
  weekStartYmd: string,
): EarningsPolicyVersion | undefined {
  const normalized = normalizePolicyVersions(policy);
  const key = String(weekStartYmd).split('T')[0];
  const list =
    normalized.versions?.length
      ? normalized.versions
      : (() => {
          const synth = templateAsVersion(normalized);
          return synth ? [synth] : [];
        })();
  const applicable = list.filter((v) => versionAppliesToWeek(v, key));
  if (applicable.length === 0) return list[0];
  return applicable[applicable.length - 1];
}

/**
 * Enterprise facade: active policy for a driver-week.
 */
export function resolveActiveEarningsPolicyForDriverWeek(
  policies: EarningsPolicy[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): { policy: EarningsPolicy; version: EarningsPolicyVersion; hit: DriverVersionHit } | undefined {
  const hit = resolveDriverVersionForWeek(policies, driverId, weekStartYmd);
  if (!hit) return undefined;
  return { policy: hit.policy, version: hit.version, hit };
}

function bundleSignature(policy: EarningsPolicy): string {
  return JSON.stringify({
    tiers: (policy.tiers || []).map((t) => ({
      name: t.name,
      minEarnings: t.minEarnings,
      maxEarnings: t.maxEarnings,
      sharePercentage: t.sharePercentage,
    })).sort((a, b) => a.minEarnings - b.minEarnings),
    quotas: policy.quotas,
    personalAllowance: {
      enabled: policy.personalAllowance.enabled,
      weeklyQuotaOverrideJmd: policy.personalAllowance.weeklyQuotaOverrideJmd,
      nextWeekBonusKm: policy.personalAllowance.nextWeekBonusKm,
      bands: policy.personalAllowance.bands,
    },
  });
}

export function bundleConfigEqual(a: EarningsPolicy, b: EarningsPolicy): boolean {
  return bundleSignature(a) === bundleSignature(b);
}

/**
 * Rules tab save: name / description / template bundle only. Does not create schedule versions.
 */
export function applyPolicyTemplateSave(params: {
  previous: EarningsPolicy | null;
  next: Omit<EarningsPolicy, 'versions'> & { versions?: EarningsPolicyVersion[] };
}): EarningsPolicy {
  const { previous, next } = params;
  const bundle = {
    tiers: cloneTiers(next.tiers || []),
    quotas: cloneQuotas(next.quotas),
    personalAllowance: clonePersonalAllowance(next.personalAllowance),
  };

  if (!previous) {
    return {
      ...next,
      ...bundle,
      versions: [],
    };
  }

  const prevNorm = normalizePolicyVersions(previous);
  return {
    ...prevNorm,
    name: next.name,
    description: next.description,
    isDefault: next.isDefault,
    ...bundle,
    versions: prevNorm.versions,
  };
}

/**
 * Schedule: create or update a version window (period + drivers).
 * Freezes policy template bundle into new versions; edits keep existing frozen bundle.
 */
export function upsertPolicyVersion(params: {
  policy: EarningsPolicy;
  allPolicies: EarningsPolicy[];
  versionId?: string | null;
  effectiveFromMonday: string;
  effectiveUntilMonday?: string | null;
  driverIds: string[];
}): EarningsPolicy {
  const {
    policy,
    allPolicies,
    versionId,
    effectiveFromMonday,
    effectiveUntilMonday,
    driverIds,
  } = params;

  if (!isMondayYmd(effectiveFromMonday)) {
    throw new Error('Start period must be a Monday.');
  }
  const until =
    effectiveUntilMonday && isMondayYmd(effectiveUntilMonday)
      ? effectiveUntilMonday
      : undefined;
  if (until && until <= effectiveFromMonday) {
    throw new Error('Ending period must be after the starting Monday.');
  }

  assertNoDriverWindowCollision({
    policies: allPolicies,
    driverIds,
    effectiveFrom: effectiveFromMonday,
    effectiveUntil: until,
    ignoreVersionId: versionId || null,
  });

  const n = normalizePolicyVersions(policy);
  const now = new Date().toISOString();
  const uniqueDrivers = [...new Set(driverIds.filter(Boolean))];

  let versions = [...(n.versions || [])];
  const existingIdx = versionId ? versions.findIndex((v) => v.id === versionId) : -1;

  if (existingIdx >= 0) {
    const prev = versions[existingIdx];
    versions[existingIdx] = {
      ...prev,
      effectiveFrom: effectiveFromMonday,
      ...(until ? { effectiveUntil: until } : {}),
      driverIds: uniqueDrivers,
      // Keep frozen bundle — do not pull live template
      tiers: cloneTiers(prev.tiers),
      quotas: cloneQuotas(prev.quotas),
      personalAllowance: clonePersonalAllowance(prev.personalAllowance),
    };
    if (!until) {
      const cleaned = { ...versions[existingIdx] };
      delete cleaned.effectiveUntil;
      versions[existingIdx] = cleaned;
    }
  } else {
    // New version: freeze current template bundle
    versions.push({
      id: crypto.randomUUID(),
      effectiveFrom: effectiveFromMonday,
      ...(until ? { effectiveUntil: until } : {}),
      ...cloneBundle(n),
      driverIds: uniqueDrivers,
      createdAt: now,
    });
  }

  return {
    ...n,
    versions: sortVersions(versions),
  };
}

/** Remove one schedule version. */
export function removePolicyVersion(
  policy: EarningsPolicy,
  versionId: string,
): EarningsPolicy {
  const n = normalizePolicyVersions(policy);
  const versions = [...(n.versions || [])];
  if (versions.length <= 1) {
    throw new Error('A policy must keep at least one version.');
  }
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx < 0) {
    throw new Error('Version not found.');
  }
  versions.splice(idx, 1);
  return {
    ...n,
    versions: sortVersions(versions),
  };
}

/** Human range label for a version window. */
export function versionWindowLabel(version: EarningsPolicyVersion): string {
  const from =
    version.effectiveFrom <= LEGACY_POLICY_EFFECTIVE_FROM
      ? 'Since launch'
      : (() => {
          try {
            return format(parseISO(version.effectiveFrom), 'MMM d, yyyy');
          } catch {
            return version.effectiveFrom;
          }
        })();
  if (!version.effectiveUntil) return `${from} → Never`;
  try {
    return `${from} → ${format(parseISO(version.effectiveUntil), 'MMM d, yyyy')}`;
  } catch {
    return `${from} → ${version.effectiveUntil}`;
  }
}
