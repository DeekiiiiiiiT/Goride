/**
 * Earnings policy versioning: Rules = bundle template; Version = frozen snapshot;
 * assignments = per-driver Monday windows (hire / move onto plan).
 */

import { format, parseISO } from 'date-fns';
import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../types/data';
import type {
  EarningsPolicy,
  EarningsPolicyVersion,
  EarningsPolicyDriverAssignment,
} from '../types/earningsPolicy';
import {
  isMondayYmd,
  mondayYmdForDate,
  upcomingMondayOptions,
  versionWindowsOverlap,
} from './fuelPolicyVersion';

export {
  isMondayYmd,
  mondayYmdForDate,
  upcomingMondayOptions,
  versionWindowsOverlap,
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

function cloneBundle(policy: Pick<EarningsPolicy, 'tiers' | 'quotas' | 'personalAllowance'>): {
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

function cloneAssignment(a: EarningsPolicyDriverAssignment): EarningsPolicyDriverAssignment {
  const next: EarningsPolicyDriverAssignment = {
    driverId: a.driverId,
    effectiveFrom: String(a.effectiveFrom).split('T')[0],
  };
  if (a.effectiveUntil) next.effectiveUntil = String(a.effectiveUntil).split('T')[0];
  return next;
}

/** Convert legacy version.effectiveFrom/Until + driverIds → assignments (idempotent). */
export function migrateVersionToAssignments(v: EarningsPolicyVersion): EarningsPolicyVersion {
  if (Array.isArray(v.assignments) && v.assignments.length > 0) {
    return {
      ...v,
      assignments: v.assignments.map(cloneAssignment),
    };
  }

  const legacyIds = Array.isArray(v.driverIds) ? v.driverIds.filter(Boolean) : [];
  const from = v.effectiveFrom ? String(v.effectiveFrom).split('T')[0] : '';
  if (legacyIds.length > 0 && from) {
    const until = v.effectiveUntil ? String(v.effectiveUntil).split('T')[0] : undefined;
    return {
      ...v,
      assignments: legacyIds.map((driverId) => {
        const a: EarningsPolicyDriverAssignment = { driverId, effectiveFrom: from };
        if (until) a.effectiveUntil = until;
        return a;
      }),
    };
  }

  return {
    ...v,
    assignments: Array.isArray(v.assignments) ? v.assignments.map(cloneAssignment) : [],
  };
}

function sortVersions(versions: EarningsPolicyVersion[]): EarningsPolicyVersion[] {
  return [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function normalizeVersion(v: EarningsPolicyVersion): EarningsPolicyVersion {
  const migrated = migrateVersionToAssignments(v);
  // Strip legacy fields from normalized in-memory shape (keep empty assignments)
  const {
    effectiveFrom: _ef,
    effectiveUntil: _eu,
    driverIds: _ids,
    ...rest
  } = migrated as EarningsPolicyVersion & {
    effectiveFrom?: string;
    effectiveUntil?: string;
    driverIds?: string[];
  };
  return {
    ...rest,
    tiers: cloneTiers(migrated.tiers || []),
    quotas: cloneQuotas(migrated.quotas),
    personalAllowance: clonePersonalAllowance(migrated.personalAllowance),
    assignments: (migrated.assignments || []).map(cloneAssignment),
  };
}

/**
 * Normalize policy; migrate legacy version windows → per-driver assignments.
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

/** Synthetic version from template when Schedule has no versions (Default fallback). */
export function templateAsVersion(policy: EarningsPolicy): EarningsPolicyVersion | undefined {
  if (!policy.tiers?.length) return undefined;
  return {
    id: `template-${policy.id}`,
    ...cloneBundle(policy),
    assignments: [],
    createdAt: policy.versions?.[0]?.createdAt || new Date(0).toISOString(),
  };
}

/** True when assignment window covers this Monday weekStart (until is exclusive). */
export function assignmentAppliesToWeek(
  assignment: Pick<EarningsPolicyDriverAssignment, 'effectiveFrom' | 'effectiveUntil'>,
  weekStartYmd: string,
): boolean {
  const key = String(weekStartYmd).split('T')[0];
  const from = String(assignment.effectiveFrom || '').split('T')[0];
  if (!from || from > key) return false;
  const until = assignment.effectiveUntil ? String(assignment.effectiveUntil).split('T')[0] : '';
  if (until && until <= key) return false;
  return true;
}

export type DriverAssignmentHit = {
  policy: EarningsPolicy;
  version: EarningsPolicyVersion;
  assignment: EarningsPolicyDriverAssignment;
};

export type DriverVersionHit = {
  policy: EarningsPolicy;
  version: EarningsPolicyVersion;
  assignment?: EarningsPolicyDriverAssignment;
};

/** All assignment windows (any policy/version) for this driver. */
export function listDriverAssignments(
  policies: EarningsPolicy[],
  driverId: string,
): DriverAssignmentHit[] {
  const hits: DriverAssignmentHit[] = [];
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
 * Block same driver on overlapping assignment windows (any policy/version).
 * `ignoreVersionId` + `ignoreDriverId` skips the assignment being edited.
 */
export function findDriverWindowCollision(params: {
  policies: EarningsPolicy[];
  driverId: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  ignoreVersionId?: string | null;
  ignoreDriverId?: string | null;
}): { driverId: string; policyName: string; versionLabel: string } | null {
  const window = {
    effectiveFrom: params.effectiveFrom,
    effectiveUntil: params.effectiveUntil || undefined,
  };
  for (const hit of listDriverAssignments(params.policies, params.driverId)) {
    if (
      params.ignoreVersionId &&
      hit.version.id === params.ignoreVersionId &&
      hit.assignment.driverId === (params.ignoreDriverId || params.driverId)
    ) {
      continue;
    }
    if (versionWindowsOverlap(window, hit.assignment)) {
      return {
        driverId: params.driverId,
        policyName: hit.policy.name,
        versionLabel: assignmentWindowLabel(hit.assignment),
      };
    }
  }
  return null;
}

export function assertNoDriverWindowCollision(params: {
  policies: EarningsPolicy[];
  driverId: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  ignoreVersionId?: string | null;
  ignoreDriverId?: string | null;
}): void {
  const hit = findDriverWindowCollision(params);
  if (!hit) return;
  throw new Error(
    `Driver already has an overlapping period on "${hit.policyName}" (${hit.versionLabel}). Pick different dates or remove them from the other assignment first.`,
  );
}

/**
 * Explicit assignment membership for this driver-week, else Default policy latest version.
 */
export function resolveDriverVersionForWeek(
  policies: EarningsPolicy[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): DriverVersionHit | undefined {
  const key = String(weekStartYmd).split('T')[0];
  if (driverId) {
    const hits = listDriverAssignments(policies, driverId).filter((h) =>
      assignmentAppliesToWeek(h.assignment, key),
    );
    if (hits.length > 0) {
      hits.sort((a, b) => a.assignment.effectiveFrom.localeCompare(b.assignment.effectiveFrom));
      const best = hits[hits.length - 1];
      return { policy: best.policy, version: best.version, assignment: best.assignment };
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
 * Latest version on a policy for Default fallback (by createdAt), or template synth.
 */
export function resolveVersionForWeek(
  policy: EarningsPolicy,
  _weekStartYmd?: string,
): EarningsPolicyVersion | undefined {
  const normalized = normalizePolicyVersions(policy);
  if (normalized.versions?.length) {
    return normalized.versions[normalized.versions.length - 1];
  }
  return templateAsVersion(normalized);
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
    tiers: (policy.tiers || [])
      .map((t) => ({
        name: t.name,
        minEarnings: t.minEarnings,
        maxEarnings: t.maxEarnings,
        sharePercentage: t.sharePercentage,
      }))
      .sort((a, b) => a.minEarnings - b.minEarnings),
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
 * Schedule: create or update a version (frozen content + optional name). No dates/drivers.
 */
export function upsertPolicyVersion(params: {
  policy: EarningsPolicy;
  versionId?: string | null;
  name?: string | null;
}): EarningsPolicy {
  const { policy, versionId, name } = params;
  const n = normalizePolicyVersions(policy);
  const now = new Date().toISOString();
  let versions = [...(n.versions || [])];
  const existingIdx = versionId ? versions.findIndex((v) => v.id === versionId) : -1;

  if (existingIdx >= 0) {
    const prev = versions[existingIdx];
    versions[existingIdx] = {
      ...prev,
      name: name?.trim() || prev.name,
      // Keep frozen bundle — do not pull live template
      tiers: cloneTiers(prev.tiers),
      quotas: cloneQuotas(prev.quotas),
      personalAllowance: clonePersonalAllowance(prev.personalAllowance),
      assignments: (prev.assignments || []).map(cloneAssignment),
    };
  } else {
    versions.push({
      id: crypto.randomUUID(),
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...cloneBundle(n),
      assignments: [],
      createdAt: now,
    });
  }

  return {
    ...n,
    versions: sortVersions(versions),
  };
}

/**
 * Add or update a driver's membership window on a version.
 */
export function upsertDriverAssignment(params: {
  policy: EarningsPolicy;
  allPolicies: EarningsPolicy[];
  versionId: string;
  driverId: string;
  effectiveFromMonday: string;
  effectiveUntilMonday?: string | null;
  /** When editing, same driverId on this version (skip self in collision). */
  isEdit?: boolean;
}): EarningsPolicy {
  const {
    policy,
    allPolicies,
    versionId,
    driverId,
    effectiveFromMonday,
    effectiveUntilMonday,
    isEdit,
  } = params;

  if (!driverId) throw new Error('Driver is required.');
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
    driverId,
    effectiveFrom: effectiveFromMonday,
    effectiveUntil: until,
    ignoreVersionId: isEdit ? versionId : null,
    ignoreDriverId: isEdit ? driverId : null,
  });

  const n = normalizePolicyVersions(policy);
  const versions = [...(n.versions || [])];
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx < 0) throw new Error('Version not found.');

  const version = versions[idx];
  const assignments = [...(version.assignments || [])];
  const existingA = assignments.findIndex((a) => a.driverId === driverId);
  const nextA: EarningsPolicyDriverAssignment = {
    driverId,
    effectiveFrom: effectiveFromMonday,
    ...(until ? { effectiveUntil: until } : {}),
  };

  if (existingA >= 0) {
    assignments[existingA] = nextA;
  } else {
    assignments.push(nextA);
  }

  versions[idx] = { ...version, assignments };
  return { ...n, versions: sortVersions(versions) };
}

export function removeDriverAssignment(params: {
  policy: EarningsPolicy;
  versionId: string;
  driverId: string;
}): EarningsPolicy {
  const n = normalizePolicyVersions(params.policy);
  const versions = [...(n.versions || [])];
  const idx = versions.findIndex((v) => v.id === params.versionId);
  if (idx < 0) throw new Error('Version not found.');
  const version = versions[idx];
  versions[idx] = {
    ...version,
    assignments: (version.assignments || []).filter((a) => a.driverId !== params.driverId),
  };
  return { ...n, versions: sortVersions(versions) };
}

/** Remove one schedule version. */
export function removePolicyVersion(policy: EarningsPolicy, versionId: string): EarningsPolicy {
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

export function assignmentWindowLabel(assignment: EarningsPolicyDriverAssignment): string {
  const from = (() => {
    try {
      return format(parseISO(assignment.effectiveFrom), 'MMM d, yyyy');
    } catch {
      return assignment.effectiveFrom;
    }
  })();
  if (!assignment.effectiveUntil) return `${from} → Never`;
  try {
    return `${from} → ${format(parseISO(assignment.effectiveUntil), 'MMM d, yyyy')}`;
  } catch {
    return `${from} → ${assignment.effectiveUntil}`;
  }
}

