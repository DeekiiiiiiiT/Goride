/**
 * Fuel policy versioning: Rules = % template; Schedule = period + drivers.
 */

import { addWeeks, endOfWeek, format, getDay, parseISO, startOfWeek } from 'date-fns';
import type { FuelRule, FuelScenario, FuelScenarioVersion } from '../types/fuel';
import { fleetTzDateKey, ymdToLocalDate } from './timezoneDisplay';

/** Known Monday — used when migrating legacy scenarios with no versions. */
export const LEGACY_POLICY_EFFECTIVE_FROM = '2000-01-03';

export function isMondayYmd(ymd: string): boolean {
  const d = ymdToLocalDate(String(ymd).split('T')[0]);
  if (isNaN(d.getTime())) return false;
  return getDay(d) === 1;
}

/** Monday yyyy-MM-dd for a calendar day (fleet TZ when provided). */
export function mondayYmdForDate(d: Date = new Date(), timezone?: string): string {
  let day = d;
  if (timezone) {
    const ymd = fleetTzDateKey(d, timezone);
    const parsed = ymd ? ymdToLocalDate(ymd) : d;
    day = isNaN(parsed.getTime()) ? d : parsed;
  }
  return format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/** Next Monday after this week's Monday (fleet TZ when provided). */
export function nextMondayYmd(d: Date = new Date(), timezone?: string): string {
  const thisMon = mondayYmdForDate(d, timezone);
  return format(addWeeks(parseISO(thisMon), 1), 'yyyy-MM-dd');
}

/** @deprecated Prefer passing activity-based earliestMonday into upcomingMondayOptions. */
export const POLICY_VERSION_EARLIEST_MONDAY = '2025-12-01';

/**
 * Mondays for the version Starts/Ends dropdowns:
 * from earliestMonday (default: this Monday) through `futureCount` weeks ahead.
 * Pass earliestMonday from first fuel activity when backdating schedules.
 */
export function upcomingMondayOptions(
  futureCount = 16,
  timezone?: string,
  from: Date = new Date(),
  earliestMonday?: string,
): { value: string; label: string }[] {
  const thisMon = mondayYmdForDate(from, timezone);
  const rawEarliest = earliestMonday || thisMon;
  const earliest = isMondayYmd(rawEarliest)
    ? rawEarliest
    : mondayYmdForDate(parseISO(rawEarliest), timezone);
  const startYmd = earliest <= thisMon ? earliest : thisMon;
  const endYmd = format(addWeeks(parseISO(thisMon), Math.max(0, futureCount - 1)), 'yyyy-MM-dd');

  const options: { value: string; label: string }[] = [];
  let cursor = parseISO(startYmd);
  const last = parseISO(endYmd);
  while (cursor.getTime() <= last.getTime()) {
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    const value = format(cursor, 'yyyy-MM-dd');
    options.push({
      value,
      label: `${format(cursor, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
    });
    cursor = addWeeks(cursor, 1);
  }
  return options;
}

function cloneRules(rules: FuelRule[]): FuelRule[] {
  return rules.map((r) => ({
    ...r,
    conditions: r.conditions ? { ...r.conditions } : undefined,
  }));
}

function sortVersions(versions: FuelScenarioVersion[]): FuelScenarioVersion[] {
  return [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function normalizeVersion(v: FuelScenarioVersion): FuelScenarioVersion {
  return {
    ...v,
    rules: cloneRules(v.rules || []),
    driverIds: Array.isArray(v.driverIds) ? [...v.driverIds] : [],
  };
}

/**
 * Ensure version.driverIds arrays exist. Does not invent schedule versions —
 * empty versions means Rules-only until Schedule adds a window.
 */
export function normalizeScenarioVersions(scenario: FuelScenario): FuelScenario {
  const templateRules = scenario.rules?.length ? cloneRules(scenario.rules) : [];
  const versions = scenario.versions?.length
    ? sortVersions(scenario.versions.map(normalizeVersion))
    : [];

  return {
    ...scenario,
    rules:
      templateRules.length > 0
        ? templateRules
        : cloneRules(versions[versions.length - 1]?.rules || []),
    versions,
  };
}

/** Synthetic open window from template when Schedule has no versions yet (Default fallback). */
function templateAsVersion(scenario: FuelScenario): FuelScenarioVersion | undefined {
  const rules = scenario.rules?.length ? cloneRules(scenario.rules) : [];
  if (!rules.length) return undefined;
  return {
    id: `template-${scenario.id}`,
    effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
    rules,
    driverIds: [],
    createdAt: scenario.versions?.[0]?.createdAt || new Date(0).toISOString(),
  };
}

/** True when version window covers this Monday weekStart (until is exclusive). */
export function versionAppliesToWeek(
  version: FuelScenarioVersion,
  weekStartYmd: string,
): boolean {
  const key = String(weekStartYmd).split('T')[0];
  const from = String(version.effectiveFrom || '').split('T')[0];
  if (!from || from > key) return false;
  const until = version.effectiveUntil ? String(version.effectiveUntil).split('T')[0] : '';
  if (until && until <= key) return false;
  return true;
}

/** Half-open [from, until) windows overlap. */
export function versionWindowsOverlap(
  a: Pick<FuelScenarioVersion, 'effectiveFrom' | 'effectiveUntil'>,
  b: Pick<FuelScenarioVersion, 'effectiveFrom' | 'effectiveUntil'>,
): boolean {
  const aFrom = String(a.effectiveFrom || '').split('T')[0];
  const bFrom = String(b.effectiveFrom || '').split('T')[0];
  const aUntil = a.effectiveUntil ? String(a.effectiveUntil).split('T')[0] : '9999-12-31';
  const bUntil = b.effectiveUntil ? String(b.effectiveUntil).split('T')[0] : '9999-12-31';
  if (!aFrom || !bFrom) return false;
  return aFrom < bUntil && bFrom < aUntil;
}

export type DriverVersionHit = {
  scenario: FuelScenario;
  version: FuelScenarioVersion;
};

/** All version windows (any policy) that list this driver. */
export function listDriverVersionAssignments(
  scenarios: FuelScenario[],
  driverId: string,
): DriverVersionHit[] {
  const hits: DriverVersionHit[] = [];
  for (const raw of scenarios) {
    const s = normalizeScenarioVersions(raw);
    for (const v of s.versions || []) {
      if ((v.driverIds || []).includes(driverId)) {
        hits.push({ scenario: s, version: v });
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
  scenarios: FuelScenario[];
  driverIds: string[];
  effectiveFrom: string;
  effectiveUntil?: string | null;
  ignoreVersionId?: string | null;
  ignoreScenarioId?: string | null;
}): { driverId: string; policyName: string; versionLabel: string } | null {
  const window = {
    effectiveFrom: params.effectiveFrom,
    effectiveUntil: params.effectiveUntil || undefined,
  };
  for (const driverId of params.driverIds) {
    for (const hit of listDriverVersionAssignments(params.scenarios, driverId)) {
      if (params.ignoreVersionId && hit.version.id === params.ignoreVersionId) continue;
      if (
        params.ignoreScenarioId &&
        params.ignoreVersionId &&
        hit.scenario.id === params.ignoreScenarioId &&
        hit.version.id === params.ignoreVersionId
      ) {
        continue;
      }
      if (versionWindowsOverlap(window, hit.version)) {
        return {
          driverId,
          policyName: hit.scenario.name,
          versionLabel: versionWindowLabel(hit.version),
        };
      }
    }
  }
  return null;
}

export function assertNoDriverWindowCollision(params: {
  scenarios: FuelScenario[];
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
  scenarios: FuelScenario[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): DriverVersionHit | undefined {
  const key = String(weekStartYmd).split('T')[0];
  if (driverId) {
    const hits = listDriverVersionAssignments(scenarios, driverId).filter((h) =>
      versionAppliesToWeek(h.version, key),
    );
    if (hits.length > 0) {
      hits.sort((a, b) => a.version.effectiveFrom.localeCompare(b.version.effectiveFrom));
      return hits[hits.length - 1];
    }
  }

  const defaultPolicy =
    scenarios.find((s) => s.isDefault) || scenarios[0];
  if (!defaultPolicy) return undefined;
  const normalized = normalizeScenarioVersions(defaultPolicy);
  const version = resolveVersionForWeek(normalized, key);
  if (!version) return undefined;
  return { scenario: normalized, version };
}

/**
 * Version active for a week on a single policy (among covering windows, latest from).
 * Used for Default fallback / display — ignores driverIds.
 */
export function resolveVersionForWeek(
  scenario: FuelScenario,
  weekStartYmd: string,
): FuelScenarioVersion | undefined {
  const normalized = normalizeScenarioVersions(scenario);
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

/** Scenario view for a week: same id/name, rules = version active that week. */
export function resolveScenarioForWeek(
  scenario: FuelScenario,
  weekStartYmd: string,
): FuelScenario {
  const normalized = normalizeScenarioVersions(scenario);
  const version = resolveVersionForWeek(normalized, weekStartYmd);
  return {
    ...normalized,
    rules: cloneRules(version?.rules || normalized.rules || []),
  };
}

/** Pick policy by id then resolve for week (legacy vehicle path). */
export function pickScenarioForVehicleWeek(
  scenarios: FuelScenario[],
  fuelScenarioId: string | undefined,
  weekStartYmd: string,
): FuelScenario | undefined {
  return pickScenarioForDriverWeek(scenarios, fuelScenarioId, weekStartYmd);
}

/**
 * Legacy: policy id → week rules. Prefer resolveDriverVersionForWeek for recon.
 */
export function pickScenarioForDriverWeek(
  scenarios: FuelScenario[],
  fuelScenarioId: string | undefined,
  weekStartYmd: string,
): FuelScenario | undefined {
  const raw =
    scenarios.find((s) => s.id === fuelScenarioId) ||
    scenarios.find((s) => s.isDefault) ||
    scenarios[0];
  if (!raw) return undefined;
  return resolveScenarioForWeek(raw, weekStartYmd);
}

/**
 * Resolve coverage for a driver-week via version membership (Default if none).
 */
export function pickScenarioForDriverMembership(
  scenarios: FuelScenario[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): FuelScenario | undefined {
  const hit = resolveDriverVersionForWeek(scenarios, driverId, weekStartYmd);
  if (!hit) return undefined;
  return {
    ...hit.scenario,
    rules: cloneRules(hit.version.rules || hit.scenario.rules || []),
  };
}

/**
 * Enterprise facade: active policy for a driver-week (money + UI must agree).
 * Prefer this over legacy pickScenarioForDriverWeek / vehicle.fuelScenarioId.
 */
export function resolveActiveFuelPolicyForDriverWeek(
  scenarios: FuelScenario[],
  driverId: string | undefined | null,
  weekStartYmd: string,
): { scenario: FuelScenario; version: FuelScenarioVersion; hit: DriverVersionHit } | undefined {
  const hit = resolveDriverVersionForWeek(scenarios, driverId, weekStartYmd);
  if (!hit) return undefined;
  const scenario: FuelScenario = {
    ...hit.scenario,
    rules: cloneRules(hit.version.rules || hit.scenario.rules || []),
  };
  return { scenario, version: hit.version, hit };
}

/** @deprecated Dual-read cutover — recon should use resolveDriverVersionForWeek. */
export function resolveDriverFuelScenarioId(
  driver: { fuelScenarioId?: string } | null | undefined,
  vehicle?: { fuelScenarioId?: string } | null,
): string | undefined {
  return driver?.fuelScenarioId ?? vehicle?.fuelScenarioId;
}

function rulesSignature(rules: FuelRule[]): string {
  return JSON.stringify(
    (rules || [])
      .map((r) => ({
        category: r.category,
        coverageType: r.coverageType,
        coverageValue: r.coverageValue,
        rideShareCoverage: r.rideShareCoverage,
        companyUsageCoverage: r.companyUsageCoverage,
        deadheadCoverage: r.deadheadCoverage,
        personalCoverage: r.personalCoverage,
        miscCoverage: r.miscCoverage,
        conditions: r.conditions,
      }))
      .sort((a, b) => a.category.localeCompare(b.category)),
  );
}

export function coverageRulesEqual(a: FuelRule[], b: FuelRule[]): boolean {
  return rulesSignature(a) === rulesSignature(b);
}

/**
 * Rules tab save: name / description / template % only. Does not create schedule versions.
 */
export function applyPolicyTemplateSave(params: {
  previous: FuelScenario | null;
  next: Omit<FuelScenario, 'versions'> & { versions?: FuelScenarioVersion[] };
}): FuelScenario {
  const { previous, next } = params;
  const nextRules = cloneRules(next.rules || []);

  if (!previous) {
    return {
      ...next,
      rules: nextRules,
      // No schedule yet — Schedule tab adds versions + drivers
      versions: [],
    };
  }

  const prevNorm = normalizeScenarioVersions(previous);
  return {
    ...prevNorm,
    name: next.name,
    description: next.description,
    isDefault: next.isDefault,
    rules: nextRules,
    versions: prevNorm.versions,
  };
}

/**
 * Schedule: create or update a version window (period + drivers).
 * Freezes policy template rules into new versions; edits keep existing frozen rules.
 */
export function upsertPolicyVersion(params: {
  scenario: FuelScenario;
  allScenarios: FuelScenario[];
  versionId?: string | null;
  effectiveFromMonday: string;
  effectiveUntilMonday?: string | null;
  driverIds: string[];
}): FuelScenario {
  const {
    scenario,
    allScenarios,
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
    scenarios: allScenarios,
    driverIds,
    effectiveFrom: effectiveFromMonday,
    effectiveUntil: until,
    ignoreVersionId: versionId || null,
  });

  const n = normalizeScenarioVersions(scenario);
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
      // Keep frozen % — do not pull live template
      rules: cloneRules(prev.rules || n.rules),
    };
    if (!until) {
      const cleaned = { ...versions[existingIdx] };
      delete cleaned.effectiveUntil;
      versions[existingIdx] = cleaned;
    }
  } else {
    versions.push({
      id: crypto.randomUUID(),
      effectiveFrom: effectiveFromMonday,
      ...(until ? { effectiveUntil: until } : {}),
      rules: cloneRules(n.rules),
      driverIds: uniqueDrivers,
      createdAt: now,
    });
  }

  return {
    ...n,
    versions: sortVersions(versions),
  };
}

/**
 * @deprecated Use applyPolicyTemplateSave (Rules) or upsertPolicyVersion (Schedule).
 * Kept for older call sites: template-only when not forceVersion.
 */
export function applyScenarioSave(params: {
  previous: FuelScenario | null;
  next: Omit<FuelScenario, 'versions'> & { versions?: FuelScenarioVersion[] };
  effectiveFromMonday?: string;
  effectiveUntilMonday?: string | null;
  forceVersion?: boolean;
}): FuelScenario {
  const { previous, next, effectiveFromMonday, effectiveUntilMonday, forceVersion } = params;
  if (forceVersion && previous) {
    return upsertPolicyVersion({
      scenario: { ...previous, ...next, versions: previous.versions },
      allScenarios: [previous],
      effectiveFromMonday: effectiveFromMonday || mondayYmdForDate(new Date()),
      effectiveUntilMonday,
      driverIds: [],
    });
  }
  return applyPolicyTemplateSave({ previous, next });
}

/** Remove one schedule version. Keeps at least one when any exist with drivers history — allow empty list. */
export function removeScenarioVersion(
  scenario: FuelScenario,
  versionId: string,
): FuelScenario {
  const n = normalizeScenarioVersions(scenario);
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
export function versionWindowLabel(version: FuelScenarioVersion): string {
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

/** Label for cards: current week's version window on this policy. */
export function latestEffectiveFromLabel(scenario: FuelScenario): string {
  const n = normalizeScenarioVersions(scenario);
  const todayKey = mondayYmdForDate(new Date());
  const current = resolveVersionForWeek(n, todayKey) || n.versions?.[n.versions.length - 1];
  if (!current) return '';
  return versionWindowLabel(current);
}

/**
 * One-time: move driver.fuelScenarioId onto the covering (or latest) version.driverIds.
 * Returns scenarios that changed.
 */
export function migrateFuelScenarioIdOntoVersions(
  scenarios: FuelScenario[],
  drivers: Array<{ id: string; fuelScenarioId?: string }>,
  asOf: Date = new Date(),
): FuelScenario[] {
  const week = mondayYmdForDate(asOf);
  const byId = new Map(scenarios.map((s) => [s.id, normalizeScenarioVersions(s)]));

  for (const d of drivers) {
    if (!d.fuelScenarioId) continue;
    const policy = byId.get(d.fuelScenarioId);
    if (!policy) continue;
    const versions = [...(policy.versions || [])];
    if (versions.length === 0) continue;

    let target =
      versions.find((v) => versionAppliesToWeek(v, week)) ||
      versions[versions.length - 1];
    if ((target.driverIds || []).includes(d.id)) continue;

    // Prefer a version that does not collide for this driver elsewhere
    const others = Array.from(byId.values()).filter((s) => s.id !== policy.id);
    const collision = findDriverWindowCollision({
      scenarios: others,
      driverIds: [d.id],
      effectiveFrom: target.effectiveFrom,
      effectiveUntil: target.effectiveUntil,
    });
    if (collision) continue;

    target = {
      ...target,
      driverIds: [...(target.driverIds || []), d.id],
    };
    const idx = versions.findIndex((v) => v.id === target.id);
    versions[idx] = target;
    byId.set(policy.id, { ...policy, versions: sortVersions(versions) });
  }

  return Array.from(byId.values());
}
