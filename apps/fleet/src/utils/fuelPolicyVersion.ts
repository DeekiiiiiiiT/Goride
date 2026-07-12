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

/** Upcoming Mondays for the editor dropdown (includes this Monday + future). */
export function upcomingMondayOptions(
  count = 12,
  timezone?: string,
  from: Date = new Date(),
): { value: string; label: string }[] {
  const thisMon = mondayYmdForDate(from, timezone);
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const start = addWeeks(parseISO(thisMon), i);
    const end = endOfWeek(start, { weekStartsOn: 1 });
    const value = format(start, 'yyyy-MM-dd');
    options.push({
      value,
      label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
    });
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

/** Latest version whose effectiveFrom <= weekStart (Monday yyyy-MM-dd). */
export function resolveVersionForWeek(
  scenario: FuelScenario,
  weekStartYmd: string,
): FuelScenarioVersion | undefined {
  const normalized = normalizeScenarioVersions(scenario);
  const key = String(weekStartYmd).split('T')[0];
  const applicable = (normalized.versions || []).filter((v) => v.effectiveFrom <= key);
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

/** Pick vehicle policy then resolve for week. */
export function pickScenarioForVehicleWeek(
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
 * Persist name/description always. When coverage rules change, append a version
 * at effectiveFromMonday (must be a Monday). Does not mutate prior versions.
 */
export function applyScenarioSave(params: {
  previous: FuelScenario | null;
  next: Omit<FuelScenario, 'versions'> & { versions?: FuelScenarioVersion[] };
  /** Required when coverage rules changed vs previous. */
  effectiveFromMonday?: string;
}): FuelScenario {
  const { previous, next, effectiveFromMonday } = params;
  const now = new Date().toISOString();
  const nextRules = cloneRules(next.rules || []);

  if (!previous) {
    const from = effectiveFromMonday && isMondayYmd(effectiveFromMonday)
      ? effectiveFromMonday
      : LEGACY_POLICY_EFFECTIVE_FROM;
    const version: FuelScenarioVersion = {
      id: crypto.randomUUID(),
      effectiveFrom: from,
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

  if (!rulesChanged) {
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

  const versions = [...(prevNorm.versions || [])];
  const existingIdx = versions.findIndex((v) => v.effectiveFrom === effectiveFromMonday);
  const newVersion: FuelScenarioVersion = {
    id: crypto.randomUUID(),
    effectiveFrom: effectiveFromMonday,
    rules: nextRules,
    createdAt: now,
  };

  if (existingIdx >= 0) {
    // Same Monday re-edit before that week starts: replace that version only
    versions[existingIdx] = newVersion;
  } else {
    versions.push(newVersion);
  }

  const sorted = sortVersions(versions);
  const latest = sorted[sorted.length - 1];
  return {
    ...prevNorm,
    name: next.name,
    description: next.description,
    isDefault: next.isDefault,
    versions: sorted,
    rules: cloneRules(latest.rules),
  };
}

/** Label for cards: latest version effective date. */
export function latestEffectiveFromLabel(scenario: FuelScenario): string {
  const n = normalizeScenarioVersions(scenario);
  const latest = n.versions?.[n.versions.length - 1];
  if (!latest) return '';
  if (latest.effectiveFrom <= LEGACY_POLICY_EFFECTIVE_FROM) return 'Since launch';
  try {
    const start = parseISO(latest.effectiveFrom);
    return `Effective ${format(start, 'MMM d, yyyy')}`;
  } catch {
    return `Effective ${latest.effectiveFrom}`;
  }
}
