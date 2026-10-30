import type { FuelOverview, GradePrice, QualityRule } from "./fuelHomeApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TZ = "America/Jamaica";

export type Freshness = "current" | "due" | "stale";

export type NeedKey = "review" | "pending" | "pins" | "parish" | "brand" | "sync";

function utcDay(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function thursdayOnOrBefore(day: number): number {
  const dow = new Date(day).getUTCDay();
  return day - ((dow + 3) % 7) * 86_400_000;
}

/** Current on the expected Thursday, Due up to 7 days late, Stale after that. */
export function fuelFreshness(latestWeek: string | null, todayIso: string): Freshness {
  if (!latestWeek) return "stale";
  const expected = thursdayOnOrBefore(utcDay(todayIso));
  const late = Math.round((expected - utcDay(latestWeek)) / 86_400_000);
  if (late <= 0) return "current";
  if (late <= 7) return "due";
  return "stale";
}

export function freshnessLabel(value: string): string {
  if (value === "due") return "Due";
  if (value === "stale") return "Stale";
  return "Current";
}

export function formatJmd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `J$${Number(value).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function wholePercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function signedPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const amount = Number(value);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${Math.abs(amount).toFixed(1)}%`;
}

export function sharePercent(share: number): string {
  return `${Math.round(Number(share) * 100)}%`;
}

function monthDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]}`;
}

export function weekOfLabel(iso: string | null): string {
  if (!iso) return "No week yet";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return `Week of ${day} ${MONTHS[month - 1]} ${year}`;
}

export function jamaicaDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function clockLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function updatedLabel(iso: string): string {
  return `Updated ${clockLabel(iso)}`;
}

export function activityWhen(at: string, todayIso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return monthDay(at);
  if (jamaicaDate(at) === todayIso.slice(0, 10)) return clockLabel(at);
  return monthDay(at);
}

export function oldestReviewLine(iso: string | null, todayIso: string): string {
  if (!iso) return "Waiting for review";
  if (jamaicaDate(iso) === todayIso.slice(0, 10)) return `Oldest from today, ${clockLabel(iso)}`;
  return `Oldest from ${monthDay(iso)}`;
}

export function ruleByKey(rules: QualityRule[], key: string): QualityRule | undefined {
  return rules.find((rule) => rule.key === key);
}

export function worstRuleLine(rules: QualityRule[]): string {
  const worst = [...rules].sort((a, b) => b.fail - a.fail)[0];
  if (!worst || worst.fail <= 0) return "";
  if (worst.key === "pin_checked") return `${worst.fail} pins not checked`;
  if (worst.key === "brand_set") return `${worst.fail} without a brand`;
  return `${worst.fail} parish mismatches`;
}

export function barPercent(pass: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((pass * 100) / total)));
}

export function orderNeeds(input: {
  review: number;
  pending: number;
  pins: number;
  parish: number;
  brand: number;
  syncLogged: boolean;
}): NeedKey[] {
  const rows: Array<{ key: NeedKey; show: boolean }> = [
    { key: "review", show: input.review > 0 },
    { key: "pending", show: input.pending > 0 },
    { key: "pins", show: input.pins > 0 },
    { key: "parish", show: input.parish > 0 },
    { key: "brand", show: input.brand > 0 },
    { key: "sync", show: !input.syncLogged },
  ];
  return rows.filter((row) => row.show).map((row) => row.key);
}

export function headlineGrade(overview: FuelOverview): GradePrice | undefined {
  return overview.prices.by_grade.find((grade) => grade.grade === "e10_87")
    ?? overview.prices.by_grade[0];
}

export function benchmarkName(overview: FuelOverview): string {
  return overview.benchmark.name?.trim() || "the benchmark";
}

export function coverageOnlyLine(overview: FuelOverview): string {
  const liveGrades = overview.prices.by_grade.filter((grade) => grade.live > 0);
  if (liveGrades.length === 1) return `${overview.prices.live} live prices · ${liveGrades[0].label} only`;
  return `${overview.prices.live} live prices`;
}

export function programsLine(count: number): string {
  return count === 1 ? "1 program" : `${count} programs`;
}

export function refineryCountLine(count: number, week: string | null): string {
  const noun = count === 1 ? "1 refinery" : `${count} refineries`;
  const weekBit = week ? `week ${monthDay(week)}` : "no week yet";
  return `${noun} · ${weekBit} ·`;
}
