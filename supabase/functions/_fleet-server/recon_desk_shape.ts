/**
 * Week Reconciliation — pure shaping for the stored desk and the week list
 * (WRA-06, 08, 12, 14, 40). No database access, so it can be tested on its own.
 */

/** Days of a Monday week, Mon..Sun, as YYYY-MM-DD. */
export function weekDays(weekKey: string): string[] {
  const [y, m, d] = String(weekKey).slice(0, 10).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i));
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * WRA-09: statement sources are judged per week and come back as {week: status}.
 * Spread that one status over the 7 days, so today's day dots still render
 * and the day-based status roll-up gives the same answer.
 */
export function expandWeekCoverage(
  raw: Record<string, string> | null | undefined,
  weekKey: string,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  if (!Object.prototype.hasOwnProperty.call(raw, "week")) return raw;
  const status = String(raw.week || "missing");
  return Object.fromEntries(weekDays(weekKey).map((day) => [day, status]));
}

/** One hash for the whole desk: the sources' own hashes, in a fixed order. */
export function deskInputsHash(sources: Array<{ id: string; inputHash: string }>): string {
  return [...sources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => `${s.id}:${s.inputHash}`)
    .join("|");
}

export type StoredSource = {
  id: string;
  requirement: string;
  status: string;
  coverage: Record<string, string>;
};

const MISSING_LIKE = new Set(["missing", "partial", "waiting_external"]);
const DONE_LIKE = new Set(["received", "not_applicable", "attested_none", "waived"]);

/** Required sources that are not received yet. Same rule as the Upload inputs step count. */
export function requiredSourcesMissing(sources: Array<{ requirement: string; status: string }>): number {
  return sources.filter((s) => s.requirement === "required" && MISSING_LIKE.has(s.status)).length;
}

export type WeekListRun = {
  weekKey: string;
  state: string;
  closedAt: string | null;
  closedBy: string | null;
  sources: StoredSource[];
  /** The desk's own next step, when the calculator has published one. */
  nextAction: { kind: string; targetId: string; label: string } | null;
};

export type WeekListEntry = {
  weekKey: string;
  line: string;
  state: "closed" | "collecting" | "reconciling";
  closedAt: string | null;
  closedBy: string | null;
  progress: { done: number; total: number };
  nextAction: { kind: string; targetId: string; label: string };
  /** Required sources still missing (kept as `blockers` for today's screens). */
  blockers: number;
  requiredSourcesMissing: number;
  /** WRA-40: the earliest open week before this one, if any ("Close the week of … first"). */
  earlierOpenWeek: string | null;
  sources: Array<{ id: string; requirement: string; status: string; coverage: Record<string, string> }>;
};

export function weekListEntry(
  run: WeekListRun,
  line: string,
  labelFor: (sourceId: string) => string,
): Omit<WeekListEntry, "earlierOpenWeek"> {
  const missing = requiredSourcesMissing(run.sources);
  const closed = run.state === "closed";
  const firstMissing = run.sources.find((s) => s.requirement === "required" && MISSING_LIKE.has(s.status));
  const nextAction = run.nextAction ??
    (firstMissing
      ? { kind: "source", targetId: firstMissing.id, label: `Provide ${labelFor(firstMissing.id)}` }
      : { kind: "step", targetId: "sources", label: "Continue week reconciliation" });
  return {
    weekKey: run.weekKey,
    line,
    state: closed ? "closed" : missing > 0 ? "collecting" : "reconciling",
    closedAt: run.closedAt,
    closedBy: run.closedBy,
    progress: {
      done: run.sources.filter((s) => DONE_LIKE.has(s.status)).length,
      total: run.sources.length,
    },
    nextAction,
    blockers: missing,
    requiredSourcesMissing: missing,
    sources: run.sources.map(({ id, requirement, status, coverage }) => ({ id, requirement, status, coverage })),
  };
}

/**
 * Outstanding (open) weeks oldest first, then Reconciled (closed) weeks newest first.
 * Each open week names the earliest open week before it.
 */
export function sortWeekList(entries: Array<Omit<WeekListEntry, "earlierOpenWeek">>): WeekListEntry[] {
  const open = entries.filter((e) => e.state !== "closed").sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  const closed = entries.filter((e) => e.state === "closed").sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  const oldestOpen = open[0]?.weekKey ?? null;
  return [
    ...open.map((e) => ({ ...e, earlierOpenWeek: oldestOpen && oldestOpen < e.weekKey ? oldestOpen : null })),
    ...closed.map((e) => ({ ...e, earlierOpenWeek: null })),
  ];
}

export type WeekListKpis = {
  openWeeks: number;
  reconciledWeeks: number;
  requiredSourcesMissing: number;
  oldestOpenWeek: string | null;
  oldestOpenNextAction: string | null;
};

/** KPI tiles (WRA-14), from the same entries the list shows. */
export function weekListKpis(entries: WeekListEntry[]): WeekListKpis {
  const open = entries.filter((e) => e.state !== "closed");
  const oldest = [...open].sort((a, b) => a.weekKey.localeCompare(b.weekKey))[0] ?? null;
  return {
    openWeeks: open.length,
    reconciledWeeks: entries.length - open.length,
    requiredSourcesMissing: open.reduce((n, e) => n + e.requiredSourcesMissing, 0),
    oldestOpenWeek: oldest?.weekKey ?? null,
    oldestOpenNextAction: oldest?.nextAction.label ?? null,
  };
}

/**
 * Rev 24: a week with no fuel at all. When every fuel file that applies is marked
 * "no activity" (or waived), there is nothing to finalize — the fuel week cannot even
 * be prepared without fuel, so requiring Finalize fuel would keep an empty week open
 * for ever. Any fuel file actually received still needs Finalize fuel.
 */
export const FUEL_SOURCE_IDS = ["fuel_card_roam", "fuel_card_self", "cash_fuel"] as const;

export function fuelHasNothingToFinalize(
  sources: Array<{ id: string; requirement: string; status: string }>,
): boolean {
  const fuel = sources.filter((s) => (FUEL_SOURCE_IDS as readonly string[]).includes(s.id) && s.requirement !== "not_applicable");
  if (fuel.length === 0) return false;
  return fuel.every((s) => s.status === "attested_none" || s.status === "waived");
}

/**
 * Rev 25: the weeks an upload covers (its `week_keys`), worked out when the screen sends none.
 * Week Reconciliation finds a statement source's week through `week_keys[1]`, and no screen
 * sends the list, so new uploads had an empty list and the week kept showing Uber "missing".
 * The week the upload was made for wins; otherwise every Monday the covered days touch.
 */
export function uploadWeekKeys(input: {
  weekKey?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
}): string[] {
  const ymd = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null);
  const monday = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    const back = (t.getUTCDay() + 6) % 7;
    return new Date(t.getTime() - back * 86400000).toISOString().slice(0, 10);
  };
  const week = ymd(input.weekKey);
  if (week) return [monday(week)];
  const start = ymd(input.coverageStart);
  const end = ymd(input.coverageEnd);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  for (let m = monday(start); m <= end && out.length < 60; ) {
    out.push(m);
    m = new Date(Date.parse(`${m}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  }
  return out;
}
