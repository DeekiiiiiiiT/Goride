// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import type { PlacesOverview, QualityRule } from "./placesHomeApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TZ = "America/Jamaica";

export type NeedKey =
  | "new_places"
  | "learnt"
  | "suggestions"
  | "evidence"
  | "pin_unchecked"
  | "verified_pin_unchecked"
  | "no_brand"
  | "area_parish_only";

const NEED_ORDER: NeedKey[] = [
  "new_places",
  "learnt",
  "suggestions",
  "evidence",
  "pin_unchecked",
  "verified_pin_unchecked",
  "no_brand",
  "area_parish_only",
];

export const EMPTY_NEEDS = "Nothing waiting. Places and the map are up to date.";

export function orderNeeds(counts: Record<NeedKey, number>): NeedKey[] {
  return NEED_ORDER.filter((key) => counts[key] > 0);
}

export function needCounts(data: PlacesOverview): Record<NeedKey, number> {
  return {
    new_places: data.review.new_places,
    learnt: data.review.learnt,
    suggestions: data.review.suggestions,
    evidence: data.review.evidence,
    pin_unchecked: data.issues.pin_unchecked,
    verified_pin_unchecked: data.issues.verified_pin_unchecked,
    no_brand: data.issues.no_brand,
    area_parish_only: data.issues.area_parish_only,
  };
}

export function wholePercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value))}%`;
}

export function barPercent(pass: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((pass * 100) / total)));
}

export function ruleByKey(rules: QualityRule[], key: string): QualityRule | undefined {
  return rules.find((rule) => rule.key === key);
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

function monthDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]}`;
}

export function updatedLabel(iso: string): string {
  return `Updated ${clockLabel(iso)}`;
}

export function activityWhen(at: string | null, todayIso: string): string {
  if (!at) return "—";
  if (jamaicaDate(at) === todayIso.slice(0, 10)) return clockLabel(at);
  return monthDay(at);
}

export function oldestReviewLine(iso: string | null, todayIso: string): string {
  if (!iso) return "Waiting for review";
  if (jamaicaDate(iso) === todayIso.slice(0, 10)) return `Oldest from today, ${clockLabel(iso)}`;
  return `Oldest from ${monthDay(iso)}`;
}

export function oldestShort(iso: string | null, todayIso: string): string {
  if (!iso) return "oldest —";
  if (jamaicaDate(iso) === todayIso.slice(0, 10)) return "oldest today";
  return `oldest ${monthDay(iso)}`;
}

export function itemsLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

export function areaTotal(data: PlacesOverview): number {
  const areas = data.map.areas;
  return areas.country + areas.parish + areas.town + areas.community;
}

export function mapStatusLine(data: PlacesOverview): string {
  const publish = data.map.last_publish_at ? monthDay(data.map.last_publish_at) : "—";
  return `${areaTotal(data)} areas · last publish ${publish} · ${data.map.drafts} drafts`;
}

export function registerStatusLine(data: PlacesOverview): string {
  const pins = ruleByKey(data.places_quality.rules, "pin_checked")?.pass ?? 0;
  return `${data.places.total} places · ${data.places.pending} pending · ${pins} pins checked`;
}

export function categoriesStatusLine(data: PlacesOverview): string {
  return `${data.places.types_used} of ${data.places.types_active} types in use · ${data.issues.no_brand} stations without brand`;
}

export function reviewStatusLine(data: PlacesOverview, todayIso: string): string {
  const waiting = data.review.new_places + data.review.learnt + data.review.suggestions + data.review.evidence;
  return `${waiting} waiting · ${oldestShort(data.review.oldest_at, todayIso)}`;
}

export function pinsStatusLine(data: PlacesOverview): string {
  return data.map.pins === 1 ? "1 pin" : `${data.map.pins} pins`;
}

export function importsStatusLine(data: PlacesOverview): string {
  const imports = data.map.imports === 0 ? "No imports yet" : `${data.map.imports} imports`;
  return `${imports} · ${data.map.open_checks} checks open`;
}

export function importsMeta(count: number): string {
  return count === 0 ? "None yet" : String(count);
}

export function qualityReason(data: PlacesOverview): string {
  const pinFail = ruleByKey(data.places_quality.rules, "pin_checked")?.fail ?? 0;
  if (pinFail > 0) return `${pinFail} pins not checked`;
  const brandFail = ruleByKey(data.places_quality.rules, "brand_set")?.fail ?? 0;
  if (brandFail > 0) return `${brandFail} stations without a brand`;
  return "Up to date";
}

export function activityTitle(kind: string): string {
  if (kind === "place_edit") return "Place edited";
  if (kind === "border_publish") return "Borders published";
  if (kind === "import") return "Import run";
  if (kind === "review") return "Review decision";
  return kind;
}
