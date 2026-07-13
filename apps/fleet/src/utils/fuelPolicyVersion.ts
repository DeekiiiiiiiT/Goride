/**
 * Effective-from Monday versioning for fuel policies.
 * Same scenario id; append versions when coverage rules change.
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

/** Next Monday after this week's Monday (fleet TZ when provided). Default for rule edits. */
export function nextMondayYmd(d: Date = new Date(), timezone?: string): string {
  const thisMon = mondayYmdForDate(d, timezone);
  return format(addWeeks(parseISO(thisMon), 1), 'yyyy-MM-dd');
}

/** Earliest Monday offered when setting policy version windows (backfill recon). */
export const POLICY_VERSION_EARLIEST_MONDAY = '2025-12-01';

/**
 * Mondays for the version Starts/Ends dropdowns:
 * from earliestMonday (default Dec 1, 2025) through `futureCount` weeks ahead of this Monday.
 * Oldest → newest so historical weeks are reachable for first-time recon setup.
 */
export function upcomingMondayOptions(
  futureCount = 16,
  timezone?: string,
  from: Date = new Date(),
  earliestMonday: string = POLICY_VERSION_EARLIEST_MONDAY,
): { value: string; label: string }[] {
  const thisMon = mondayYmdForDate(from, timezone);
  const earliest = isMondayYmd(earliestMonday)
    ? earliestMonday
    : mondayYmdForDate(parseISO(earliestMonday), timezone);
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

/**
 * Ensure versions[] exists. Legacy scenarios with only `rules` get one version
 * effective from LEGACY_POLICY_EFFECTIVE_FROM. `rules` is synced to the latest version.
 */
export function normalizeScenarioVersions(scenario: FuelScenario): FuelScenario {
  const now = new Date().toISOString();
  let versions = scenario.versions?.length
    ? sortVersions(scenario.versions.map((v) => ({ ...v, rules: cloneRules(v.rules || []) })))
    : [];

  if (versions.length === 0) {
    const rules = scenario.rules?.length ? cloneRules(scenario.rules) : [];
    versions = [
      {
        id: crypto.randomUUID?.() ?? `ver-${scenario.id}-legacy`,
        effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
        rules,
        createdAt: now,
      },
    ];
  }

  const latest = versions[versions.length - 1];
  return {
    ...scenario,
    versions,
    rules: cloneRules(latest.rules),
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

/**
 * Version active for a week: among windows covering weekStart, pick latest effectiveFrom.
 * Falls back to earliest version if none cover (legacy safety).
 */
export function resolveVersionForWeek(
  scenario: FuelScenario,
  weekStartYmd: string,
): FuelScenarioVersion | undefined {
  const normalized = normalizeScenarioVersions(scenario);
  const key = String(weekStartYmd).split('T')[0];
  const applicable = (normalized.versions || []).filter((v) => versionAppliesToWeek(v, key));
  if (applicable.length === 0) return normalized.versions?.[0];
  return applicable[applicable.length - 1];
}

/**
 * Scenario view for a week: same id/name, rules = version active that week.
 */
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

/** Pick policy by id then resolve for week (shared by vehicle dual-read + driver). */
export function pickScenarioForVehicleWeek(
  scenarios: FuelScenario[],
  fuelScenarioId: string | undefined,
  weekStartYmd: string,
): FuelScenario | undefined {
  return pickScenarioForDriverWeek(scenarios, fuelScenarioId, weekStartYmd);
}

/**
 * Driver-first policy: use driver.fuelScenarioId (or dual-read vehicle fallback id),
 * then Default, then first scenario.
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

/** Dual-read: driver policy wins; vehicle.fuelScenarioId only during cutover. */
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
 * Persist name/description always. When coverage rules change (or forceVersion),
 * append a version at effectiveFromMonday (must be a Monday). Does not mutate prior versions.
 */
export function applyScenarioSave(params: {
  previous: FuelScenario | null;
  next: Omit<FuelScenario, 'versions'> & { versions?: FuelScenarioVersion[] };
  /** Required when coverage rules changed vs previous (or forceVersion). */
  effectiveFromMonday?: string;
  /**
   * Optional exclusive end Monday. Unset / empty = never ends.
   * Must be a Monday after effectiveFrom when set.
   */
  effectiveUntilMonday?: string | null;
  /** Schedule "Add version" — append even if coverage % unchanged. */
  forceVersion?: boolean;
}): FuelScenario {
  const {
    previous,
    next,
    effectiveFromMonday,
    effectiveUntilMonday,
    forceVersion = false,
  } = params;
  const now = new Date().toISOString();
  const nextRules = cloneRules(next.rules || []);

  const until =
    effectiveUntilMonday && isMondayYmd(effectiveUntilMonday)
      ? effectiveUntilMonday
      : undefined;

  if (!previous) {
    const from = effectiveFromMonday && isMondayYmd(effectiveFromMonday)
      ? effectiveFromMonday
      : LEGACY_POLICY_EFFECTIVE_FROM;
    if (until && until <= from) {
      throw new Error('Ending period must be after the starting Monday.');
    }
    const version: FuelScenarioVersion = {
      id: crypto.randomUUID(),
      effectiveFrom: from,
      ...(until ? { effectiveUntil: until } : {}),
      rules: nextRules,
      createdAt: now,
    };
    return {
      ...next,
      rules: nextRules,
      versions: [version],
    };
  }

  const prevNorm = normalizeScenarioVersions(previous);
  const rulesChanged = !coverageRulesEqual(prevNorm.rules || [], nextRules);

  if (!rulesChanged && !forceVersion) {
    return {
      ...prevNorm,
      name: next.name,
      description: next.description,
      isDefault: next.isDefault,
      // keep versions + rules unchanged for coverage
      rules: cloneRules(prevNorm.rules || []),
      versions: prevNorm.versions,
    };
  }

  if (!effectiveFromMonday || !isMondayYmd(effectiveFromMonday)) {
    throw new Error('Effective from must be a Monday when coverage rules change.');
  }
  if (until && until <= effectiveFromMonday) {
    throw new Error('Ending period must be after the starting Monday.');
  }

  let versions = [...(prevNorm.versions || [])];
  const existingIdx = versions.findIndex((v) => v.effectiveFrom === effectiveFromMonday);
  const newVersion: FuelScenarioVersion = {
    id: crypto.randomUUID(),
    effectiveFrom: effectiveFromMonday,
    ...(until ? { effectiveUntil: until } : {}),
    rules: nextRules,
    createdAt: now,
  };

  if (existingIdx >= 0) {
    // Same Monday re-edit: replace that version only (preserve id if desired — new id ok)
    versions[existingIdx] = { ...newVersion, id: versions[existingIdx].id };
  } else {
    // Close open-ended prior versions that would overlap this start
    versions = versions.map((v) => {
      if (v.effectiveUntil) return v;
      if (v.effectiveFrom >= effectiveFromMonday) return v;
      return { ...v, effectiveUntil: effectiveFromMonday };
    });
    versions.push(newVersion);
  }

  const sorted = sortVersions(versions);
  // Prefer rules from version that covers "now" if possible, else latest by from
  const todayKey = mondayYmdForDate(new Date());
  const current = resolveVersionForWeek({ ...prevNorm, versions: sorted }, todayKey)
    || sorted[sorted.length - 1];
  return {
    ...prevNorm,
    name: next.name,
    description: next.description,
    isDefault: next.isDefault,
    versions: sorted,
    rules: cloneRules(current?.rules || nextRules),
  };
}

/**
 * Remove one coverage version. Keeps at least one version.
 * Neighbors closed at this version's start inherit its end (or reopen to Never).
 */
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
  const removed = versions[idx];
  versions.splice(idx, 1);

  const healed = versions.map((v) => {
    if (v.effectiveUntil !== removed.effectiveFrom) return v;
    const next = { ...v };
    if (removed.effectiveUntil) {
      next.effectiveUntil = removed.effectiveUntil;
    } else {
      delete next.effectiveUntil;
    }
    return next;
  });

  const sorted = sortVersions(healed);
  const todayKey = mondayYmdForDate(new Date());
  const current =
    resolveVersionForWeek({ ...n, versions: sorted }, todayKey) ||
    sorted[sorted.length - 1];
  return {
    ...n,
    versions: sorted,
    rules: cloneRules(current?.rules || n.rules || []),
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

/** Label for cards: latest / current version effective date. */
export function latestEffectiveFromLabel(scenario: FuelScenario): string {
  const n = normalizeScenarioVersions(scenario);
  const todayKey = mondayYmdForDate(new Date());
  const current = resolveVersionForWeek(n, todayKey) || n.versions?.[n.versions.length - 1];
  if (!current) return '';
  return versionWindowLabel(current);
}
