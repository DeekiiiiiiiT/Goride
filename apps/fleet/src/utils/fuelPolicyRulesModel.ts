/**
 * Fleet Policy → Rules (fuel audit Part J screens 15, 16). Pure: the six "company pays" rows of a
 * rule, the version cards, and "Add a version" (a new split from a Monday, refused when it would
 * change a locked week — the same closedScheduleChangeError the server checks).
 */
import type { FuelRule, FuelScenario, FuelScenarioVersion } from '../types/fuel';
import { getCoverageMatrixRows } from './fuelCoverageSplit';
import {
  closedScheduleChangeError,
  frozenWeeksInWindow,
  normalizeScenarioVersions,
  upsertPolicyVersion,
  versionAppliesToWeek,
} from './fuelPolicyVersion';

export type SplitKey = 'rideShare' | 'deadhead' | 'commute' | 'companyUsage' | 'personal' | 'leftover';

export const SPLIT_LABEL: Record<SplitKey, string> = {
  rideShare: 'Uber trips',
  deadhead: 'Driving to pickups',
  commute: 'Commute',
  companyUsage: 'Company errands',
  personal: 'Personal driving',
  leftover: 'Km nobody can explain',
};

const ORDER: SplitKey[] = ['rideShare', 'deadhead', 'commute', 'companyUsage', 'personal', 'leftover'];

export type SplitRow = {
  key: SplitKey;
  label: string;
  /** Company %, or null when this kind isn't a percentage (fixed allowance / fixed leftover). */
  companyPct: number | null;
  /** Plain words when companyPct is null. */
  note?: string;
};

function leftoverCompanyPct(rule: FuelRule | undefined): { pct: number | null; note?: string } {
  const l = rule?.leftoverSplit;
  if (!l || l.mode === 'company') return { pct: 100 };
  if (l.mode === 'percentage') return { pct: Math.max(0, Math.min(100, 100 - (Number(l.driverPercent) || 0))) };
  return { pct: null, note: `Driver pays up to J$${(Number(l.driverFixedAmount) || 0).toLocaleString('en-US')}` };
}

export function splitRows(rule: FuelRule | undefined): SplitRow[] {
  const matrix = getCoverageMatrixRows(rule);
  return ORDER.map((key) => {
    if (key === 'leftover') {
      const l = leftoverCompanyPct(rule);
      return { key, label: SPLIT_LABEL[key], companyPct: l.pct, note: l.note };
    }
    const m = matrix.find((r) => r.key === key);
    const pct = m && m.companyPct >= 0 ? m.companyPct : null;
    return { key, label: SPLIT_LABEL[key], companyPct: pct, note: pct == null ? 'Fixed allowance' : undefined };
  });
}

export const fuelRuleOf = (rules: FuelRule[] | undefined) => (rules || []).find((r) => r.category === 'Fuel');

/** A rule whose six kinds can be edited as percentages here. */
export function ruleEditableByPercent(rule: FuelRule | undefined): boolean {
  return Boolean(rule) && rule!.coverageType === 'Percentage' && rule!.leftoverSplit?.mode !== 'fixed';
}

/** The rule with new company percentages (leftover → driver part of the leftover split). */
export function withCompanyPercents(rule: FuelRule, pct: Partial<Record<SplitKey, number>>): FuelRule {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));
  const next: FuelRule = { ...rule };
  if (pct.rideShare != null) next.rideShareCoverage = clamp(pct.rideShare);
  if (pct.deadhead != null) next.deadheadCoverage = clamp(pct.deadhead);
  if (pct.commute != null) next.commuteCoverage = clamp(pct.commute);
  if (pct.companyUsage != null) next.companyUsageCoverage = clamp(pct.companyUsage);
  if (pct.personal != null) next.personalCoverage = clamp(pct.personal);
  if (pct.leftover != null) {
    const c = clamp(pct.leftover);
    const appliesTo = rule.leftoverSplit?.appliesTo?.length
      ? rule.leftoverSplit.appliesTo
      : (['variance', 'unattributedKm', 'noOdometerFills'] as const).slice();
    next.leftoverSplit =
      c >= 100 ? { mode: 'company', appliesTo: [...appliesTo] } : { mode: 'percentage', driverPercent: clamp(100 - c), appliesTo: [...appliesTo] };
  }
  return next;
}

// ---------------------------------------------------------------- version cards

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function weekOf(ymd: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return y && m && d ? `${d} ${MON[m - 1]} ${y}` : ymd;
}

function addDays(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000));
}

export type VersionCard = {
  version: FuelScenarioVersion;
  number: number;
  state: 'current' | 'starts' | 'ended';
  chip: string;
  appliesLine: string;
  /** "Uber trips: company pays 75%" with the old value when it changed. */
  changes: Array<{ label: string; now: string; was?: string }>;
  lockedWeeks: number;
  activeDays: number | null;
  drivers: number;
};

const pctText = (n: number | null, note?: string) => (n == null ? note || '—' : `${Math.round(n * 100) / 100}%`);

export function versionCards(
  scenario: FuelScenario,
  opts: { thisMonday: string; todayYmd: string; frozenMondays: readonly string[] },
): VersionCard[] {
  const versions = normalizeScenarioVersions(scenario).versions || [];
  const out: VersionCard[] = versions.map((v, i) => {
    const from = String(v.effectiveFrom).slice(0, 10);
    const until = v.effectiveUntil ? String(v.effectiveUntil).slice(0, 10) : null;
    const current = versionAppliesToWeek(v, opts.thisMonday);
    const state: VersionCard['state'] = current ? 'current' : from > opts.thisMonday ? 'starts' : 'ended';
    const rows = splitRows(fuelRuleOf(v.rules));
    const prev = i > 0 ? splitRows(fuelRuleOf(versions[i - 1].rules)) : null;
    const changes = prev
      ? rows
          .filter((r, k) => r.companyPct !== prev[k].companyPct || r.note !== prev[k].note)
          .map((r) => {
            const p = prev.find((x) => x.key === r.key)!;
            return { label: r.label, now: `company pays ${pctText(r.companyPct, r.note)}`, was: pctText(p.companyPct, p.note) };
          })
      : rows.slice(0, 1).map((r) => ({ label: r.label, now: `company pays ${pctText(r.companyPct, r.note)}` }));
    const lastWeek = until ? addDays(until, -7) : null;
    const appliesLine = until
      ? `Week of ${weekOf(from)} → week of ${weekOf(lastWeek!)}`
      : `Applies from the week of ${weekOf(from)}`;
    const activeEnd = until && until < opts.todayYmd ? until : opts.todayYmd;
    return {
      version: v,
      number: i + 1,
      state,
      chip: state === 'current' ? 'Current' : state === 'starts' ? `Starts ${weekOf(from)}` : `Ended ${weekOf(lastWeek || from)}`,
      appliesLine,
      changes,
      lockedWeeks: frozenWeeksInWindow(from, until, opts.frozenMondays).length,
      activeDays: state === 'starts' ? null : daysBetween(from, activeEnd),
      drivers: (v.driverIds || []).length,
    };
  });
  return out.reverse();
}

// ---------------------------------------------------------------- add a version

export type AddVersionPlan =
  | { ok: true; scenario: FuelScenario }
  | { ok: false; field: 'from' | 'split'; error: string };

/** The first Monday after every locked week (where a new open-ended split can start). */
export function firstOpenMonday(frozenMondays: readonly string[], fallback: string): string {
  const last = [...frozenMondays].map((m) => String(m).slice(0, 10)).sort().at(-1);
  if (!last) return fallback;
  const next = addDays(last, 7);
  return next > fallback ? next : fallback;
}

/**
 * New split from `fromMonday`: the window running then ends there; the new window keeps its
 * drivers. Refused when it would change a locked week (closedScheduleChangeError).
 */
export function planAddVersion(input: {
  scenario: FuelScenario;
  allScenarios: FuelScenario[];
  fromMonday: string;
  percents: Partial<Record<SplitKey, number>>;
  frozenMondays: readonly string[];
  thisMonday: string;
}): AddVersionPlan {
  const base = normalizeScenarioVersions(input.scenario);
  const versions = base.versions || [];
  const latest = versions[versions.length - 1];
  const baseRule = fuelRuleOf(latest?.rules) || fuelRuleOf(base.rules);
  if (!baseRule || !ruleEditableByPercent(baseRule)) {
    return { ok: false, field: 'split', error: "This rule isn't split by percentages. Change it with Edit splits." };
  }
  const newRule = withCompanyPercents(baseRule, input.percents);
  if (JSON.stringify(splitRows(newRule)) === JSON.stringify(splitRows(baseRule))) {
    return { ok: false, field: 'split', error: 'Change at least one split.' };
  }
  if (latest && input.fromMonday <= String(latest.effectiveFrom).slice(0, 10)) {
    return {
      ok: false,
      field: 'from',
      error: `Choose a week after the week of ${weekOf(String(latest.effectiveFrom))}, when the latest version starts.`,
    };
  }

  // End the window(s) still running on the new start, then add the new one with their drivers.
  const ended = versions.map((v) => {
    const until = v.effectiveUntil ? String(v.effectiveUntil).slice(0, 10) : null;
    if (until && until <= input.fromMonday) return v;
    return { ...v, effectiveUntil: input.fromMonday };
  });
  const drivers = latest?.driverIds || [];
  const endedScenario: FuelScenario = { ...base, versions: ended };
  let next: FuelScenario;
  try {
    next = upsertPolicyVersion({
      scenario: endedScenario,
      allScenarios: input.allScenarios.map((s) => (s.id === base.id ? endedScenario : s)),
      effectiveFromMonday: input.fromMonday,
      effectiveUntilMonday: null,
      driverIds: drivers,
    });
  } catch (e) {
    return { ok: false, field: 'from', error: e instanceof Error ? e.message : String(e) };
  }
  const priorIds = new Set(versions.map((v) => v.id));
  next = {
    ...next,
    versions: (next.versions || []).map((v) =>
      priorIds.has(v.id) ? v : { ...v, rules: [newRule, ...(v.rules || []).filter((r) => r.category !== 'Fuel')] },
    ),
  };

  const locked = closedScheduleChangeError(versions, next.versions || [], input.frozenMondays);
  if (locked) {
    return {
      ok: false,
      field: 'from',
      error: `That week is already locked. Choose the week of ${weekOf(firstOpenMonday(input.frozenMondays, input.thisMonday))} or later.`,
    };
  }
  return { ok: true, scenario: next };
}

// ---------------------------------------------------------------- how Roam sorts the km (F-30)

export type BrainPolicy = {
  deadhead_gap_max_minutes?: number | null;
  personal_gap_min_minutes?: number | null;
  peak_hours_start?: number | null;
  peak_hours_end?: number | null;
  prefer_odo_gaps?: boolean | null;
};

const hour = (h: number) => {
  const n = ((Math.round(h) % 24) + 24) % 24;
  return `${n % 12 === 0 ? 12 : n % 12}:00 ${n < 12 ? 'AM' : 'PM'}`;
};

export function brainLines(p: BrainPolicy | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.prefer_odo_gaps !== false) {
    out.push('When the odometer was read at both trips, the km between them come from the odometer.');
  }
  const dh = Number(p.deadhead_gap_max_minutes);
  const pers = Number(p.personal_gap_min_minutes);
  if (dh > 0) out.push(`Otherwise, a wait of up to ${dh} minutes between trips counts as driving to a pickup.`);
  if (pers > 0) out.push(`A wait of more than ${pers} minutes counts as personal driving.`);
  if (dh > 0 && pers > dh) out.push('A wait in between stays unexplained and is split by "Km nobody can explain".');
  if (p.peak_hours_start != null && p.peak_hours_end != null) {
    out.push(`Peak hours: ${hour(Number(p.peak_hours_start))} to ${hour(Number(p.peak_hours_end))}.`);
  }
  return out;
}
