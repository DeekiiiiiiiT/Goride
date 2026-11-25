/**
 * Research engine screens — pure view logic (docs/research-engine-audit.md §4 / §4b). No React, no fetches.
 * Every word shown comes from real data; nothing here invents a score, an id or a provider (§4b "Drop").
 */
import type {
  CoveragePart,
  CoverageSpec,
  PartProposal,
  ResearchCar,
  ResearchJobListItem,
  ResearchJobState,
  TrustRoute,
} from "../../../services/researchEngineService";

// ------------------------------------------------------------------ cars + places

export function yearsLabel(start: number | null | undefined, end: number | null | undefined): string {
  if (start && end) return `${start}–${end}`;
  if (start) return `${start} on`;
  if (end) return `to ${end}`;
  return "";
}

/** "Toyota Roomy 2016–2020 2WD" */
export function carLabel(car: Pick<ResearchCar, "make" | "model" | "production_start_year" | "production_end_year" | "drivetrain"> | null | undefined): string {
  if (!car) return "Car not on file";
  return [car.make, car.model, yearsLabel(car.production_start_year, car.production_end_year), car.drivetrain]
    .filter(Boolean)
    .join(" ");
}

/** "M900A · 1KR-FE" */
export function carCodes(car: { chassis_code?: string | null; engine_code?: string | null } | null | undefined): string {
  if (!car) return "";
  return [car.chassis_code, car.engine_code].filter(Boolean).join(" · ");
}

/** The place on the car, from the job's fit descriptor or the proposal's position ("front" / "rear"). */
export function placeLabel(place: string | null | undefined): string | null {
  const p = (place ?? "").trim().toLowerCase();
  if (!p) return null;
  if (p === "front") return "Front";
  if (p === "rear") return "Rear";
  return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ");
}

/** What the job is about: the part type, or the spec's label. */
export function jobItemName(job: Pick<ResearchJobListItem, "jobType" | "partTypeName" | "specLabel">): string {
  if (job.jobType === "spec") return job.specLabel || "Spec";
  return job.partTypeName || "Part";
}

// ------------------------------------------------------------------ sites

const SITE_NAMES: Record<string, string> = {
  "amayama.com": "Amayama",
  "megazip.net": "Megazip",
  "partsouq.com": "Partsouq",
  "7zap.com": "7zap",
  "masuma.parts": "Masuma",
  "sbparts.jp": "SB",
  "jnbk-brakes.com": "NiBK",
  "bremboparts.com": "Brembo",
  "rockauto.com": "RockAuto",
};

/** A short name for a catalogue site: known names first, else the first part of the address. */
export function siteName(domainOrUrl: string | null | undefined): string {
  if (!domainOrUrl) return "the catalogue";
  let host = domainOrUrl.trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(host)) host = new URL(host).hostname;
  } catch {
    /* keep as typed */
  }
  host = host.replace(/^www\./, "");
  if (SITE_NAMES[host]) return SITE_NAMES[host];
  const first = host.split(".")[0] || host;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// ------------------------------------------------------------------ job states → filters + pills

export type PartsFilter =
  | "all"
  | "needs_review"
  | "browser_check"
  | "researching"
  | "waiting"
  | "auto_added"
  | "added"
  | "not_found"
  | "closed"
  | "failed";

export const PARTS_FILTERS: Array<{ id: PartsFilter; label: string; dot?: "amber" | "blue" | "pulse" }> = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs review", dot: "amber" },
  { id: "browser_check", label: "Browser check", dot: "blue" },
  { id: "researching", label: "Researching", dot: "pulse" },
  { id: "waiting", label: "Waiting its turn" },
  { id: "auto_added", label: "Added automatically" },
  { id: "added", label: "Added" },
  { id: "not_found", label: "Couldn't find" },
  { id: "closed", label: "Closed" },
  { id: "failed", label: "Failed" },
];

export function filterForState(state: ResearchJobState | null | undefined, closedNote?: string | null): Exclude<PartsFilter, "all"> {
  // RE-73: a job the owner closed (stored as failed with a note) is Closed, not Failed.
  if (state === "failed" && closedNote) return "closed";
  switch (state) {
    case "needs_review":
      return "needs_review";
    case "browser_check":
      return "browser_check";
    case "researching":
    case "checking":
      return "researching";
    case "auto_added":
      return "auto_added";
    case "added":
      return "added";
    case "not_found":
      return "not_found";
    case "failed":
      return "failed";
    default:
      return "waiting";
  }
}

export type PillTone = "green" | "green-outline" | "amber" | "blue" | "grey" | "grey-outline" | "red";

export type StatePill = { label: string; tone: PillTone; icon?: string; pulse?: boolean };

/** RE-73: the owner's note on a job closed on their say-so ("… (owner)", stored as failed), else null. */
export function closedNoteOf(state: string | null | undefined, lastError: string | null | undefined): string | null {
  if (state !== "failed") return null;
  const m = String(lastError ?? "").trim().match(/^(.+?)\s*\(owner\)$/i);
  return m ? m[1].trim() : null;
}

export function statePill(state: ResearchJobState | null | undefined, conflictOpen = false, closedNote?: string | null): StatePill {
  if (state === "failed" && closedNote) return { label: "Closed", tone: "grey-outline" };
  if (conflictOpen && state !== "added" && state !== "auto_added") return { label: "Two makers disagree", tone: "red" };
  switch (state) {
    case "needs_review":
      return { label: "Needs review", tone: "amber", icon: "priority_high" };
    case "browser_check":
      return { label: "Browser check", tone: "blue", icon: "open_in_browser" };
    case "researching":
    case "checking":
      return { label: "Researching", tone: "blue", pulse: true };
    case "auto_added":
      return { label: "Added automatically", tone: "green-outline", icon: "check" };
    case "added":
      return { label: "Added", tone: "green", icon: "check" };
    case "not_found":
      return { label: "Couldn't find", tone: "grey-outline" };
    case "failed":
      return { label: "Failed", tone: "red" };
    default:
      return { label: "Waiting its turn", tone: "grey" };
  }
}

/** The small line under a status: which part of the source rule proved it (§0, RE-19). */
export function trustRouteLine(route: TrustRoute | null | undefined): string | null {
  switch (route) {
    case "a":
      return "Car maker's catalogue";
    case "b":
      return "Part maker's own catalogue";
    case "c":
      return "Two makers agree";
    case "owner_browser":
      return "You checked it";
    default:
      return null;
  }
}

// ------------------------------------------------------------------ proposals

export function keptSources(p: Pick<PartProposal, "sources">): Array<Required<Pick<NonNullable<PartProposal["sources"]>[number], "domain">> & NonNullable<PartProposal["sources"]>[number]> {
  return (p.sources ?? []).filter((s) => !s.dropped && typeof s.domain === "string" && Boolean(s.block)) as never;
}

export function proposalConfirmed(p: Pick<PartProposal, "checks" | "trust_route">): boolean {
  return p.checks?.trust === "confirmed" || p.trust_route === "a" || p.trust_route === "b" || p.trust_route === "c" || p.trust_route === "owner_browser";
}

/** The "how sure" line on a Roam found card. */
export function howSureLine(p: Pick<PartProposal, "checks" | "trust_route" | "sources">): string {
  switch (p.trust_route) {
    case "a":
      return "The car maker's catalogue lists it.";
    case "b":
      return "The part maker's own catalogue lists its own part.";
    case "c":
      return "Two part makers name the same factory number.";
    case "owner_browser":
      return "You checked it on the car maker's catalogue.";
    default:
      break;
  }
  const kinds = new Set((p.checks?.passes ?? []).map((x) => x.kind));
  if (kinds.has("reference")) return "Only a reference site lists it. Reference sites can suggest but never confirm.";
  if (keptSources(p).length > 0 || kinds.size > 0) {
    return "One part maker lists it. Two makers, or the car maker's catalogue, would confirm it.";
  }
  return "No trusted catalogue showed it yet.";
}

export type CheckRow = { label: string; ok: boolean };

/**
 * The Checks list. The engine only keeps a page block when the number, the car (and the place, when the part has
 * one) are in the same row, so a kept block proves all three; no kept block means none were proven.
 */
export function proposalChecks(p: Pick<PartProposal, "sources" | "position_key">): CheckRow[] {
  const proven = keptSources(p).length > 0;
  const rows: CheckRow[] = [
    { label: "Number is on the page", ok: proven },
    { label: "This car is in the same row", ok: proven },
  ];
  const place = placeLabel(p.position_key);
  if (place) rows.push({ label: `${place} position is in the same row`, ok: proven });
  return rows;
}

/** "Read on 20 Nov 2026" */
export function readOnLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return `Read on ${shortDate(iso)}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // A plain date ("2027-02-18") is a calendar day, not a moment: never shift it into the viewer's time zone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) });
}

// ------------------------------------------------------------------ browser checks

/** What the owner looks for on the catalogue page: "M900A" and the part / spec in plain words. */
export function browserCheckTarget(car: ResearchCar | null, itemName: string): { code: string | null; item: string } {
  return { code: car?.chassis_code || car?.model || null, item: itemName.toLowerCase() };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "11.2016 – 08.2020" (months when on file, else years; "now" when still built) — the way catalogues date versions. */
/** RE-70: month names for "Changed in" (a number the car maker changed during the build). */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RE-70: the years a change can fall in — the car's build years (else the last 30 years). */
export function changeYearOptions(car: ResearchCar | null, now: Date = new Date()): number[] {
  const thisYear = now.getFullYear();
  const from = car?.production_start_year || thisYear - 30;
  const to = Math.min(car?.production_end_year || thisYear, thisYear + 1);
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

export function buildDates(car: ResearchCar | null): string {
  if (!car?.production_start_year) return "";
  const from = car.production_start_month ? `${pad2(car.production_start_month)}.${car.production_start_year}` : String(car.production_start_year);
  const to = car.production_end_year
    ? car.production_end_month
      ? `${pad2(car.production_end_month)}.${car.production_end_year}`
      : String(car.production_end_year)
    : "now";
  return `${from} – ${to}`;
}

/**
 * RE-62: the car described the way a catalogue's version list shows it, in plain words — dates, regular / turbo /
 * hybrid engine, grade, 2WD/4WD. No frame or engine codes.
 */
export function plainVersion(car: ResearchCar | null): string {
  if (!car) return "this car";
  // Only what Dominion knows: the server's plain words, else the car's own turbo / hybrid type; never a guess.
  const kind = (car.engine_type ?? "").trim().toLowerCase();
  const engine = car.engine_words ?? (/turbo/.test(kind) ? "turbo engine" : /hybrid/.test(kind) ? "hybrid engine" : "");
  return [
    `${car.make} ${car.model}`,
    buildDates(car) ? `built ${buildDates(car)}` : "",
    engine,
    (car.catalog_trim ?? "").trim() ? `grade ${car.catalog_trim!.trim()}` : "",
    (car.drivetrain ?? "").trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export function gateReasonText(
  reason: "no_car" | "no_number" | "number_not_on_line" | "wrong_years" | "wrong_engine" | "no_value" | "empty",
  jobType: "part" | "spec",
  car: ResearchCar | null = null,
): string {
  if (reason === "empty") return "Paste the line from the page.";
  if (reason === "no_car") return "That line doesn't name this car.";
  if (reason === "wrong_years") {
    const dates = buildDates(car);
    return `Those dates are for a different version${dates ? ` — this car was built ${dates}` : ""}. Open the version for those dates.`;
  }
  if (reason === "wrong_engine") return "That's a different engine (for example the turbo). Open the version with this car's engine.";
  if (reason === "number_not_on_line") return "The number you typed isn't on the pasted line.";
  if (reason === "no_number" || jobType === "part") {
    return "None of Roam's suggested numbers is on this line. If the page shows a different number, type it below.";
  }
  return "That line has no value of the right kind.";
}

// ------------------------------------------------------------------ coverage tiles (S6)

export type TileState =
  | "confirmed"
  | "needs_checking"
  | "browser_check"
  | "disagree"
  | "researching"
  | "waiting"
  | "not_started"
  | "couldnt_find"
  | "not_applicable"
  | "waiting_identity";

export type TileAction = "open" | "review" | "open_browser_check" | "choose" | "research_part" | "research_again" | null;

export const TILE_META: Record<TileState, { label: string; tone: PillTone; action: TileAction; actionLabel: string | null }> = {
  confirmed: { label: "Confirmed", tone: "green", action: "open", actionLabel: "Open" },
  needs_checking: { label: "Needs checking", tone: "amber", action: "review", actionLabel: "Review" },
  browser_check: { label: "Browser check", tone: "blue", action: "open_browser_check", actionLabel: "Open browser check" },
  disagree: { label: "Two makers disagree", tone: "red", action: "choose", actionLabel: "Choose" },
  researching: { label: "Researching", tone: "blue", action: null, actionLabel: null },
  waiting: { label: "Waiting its turn", tone: "grey", action: null, actionLabel: null },
  not_started: { label: "Not started", tone: "grey", action: "research_part", actionLabel: "Research this part" },
  couldnt_find: { label: "Couldn't find", tone: "grey-outline", action: "research_again", actionLabel: "Research again" },
  not_applicable: { label: "Not applicable", tone: "grey", action: null, actionLabel: null },
  waiting_identity: { label: "Waiting for identity", tone: "grey", action: null, actionLabel: null },
};

/** The order matters: a confirmed or not-applicable cell wins; then the latest job decides; then what is on file. */
export function partTileState(p: Pick<CoveragePart, "cell" | "jobState" | "conflictId">, identityMissing = false): TileState {
  if (identityMissing) return "waiting_identity";
  if (p.cell === "verified") return "confirmed";
  if (p.cell === "not_applicable") return "not_applicable";
  if (p.conflictId) return "disagree";
  const fromJob = jobTileState(p.jobState);
  if (fromJob) return fromJob;
  if (p.cell === "unverified") return "needs_checking";
  return "not_started";
}

export function specTileState(s: Pick<CoverageSpec, "value" | "trust" | "jobState">, identityMissing = false): TileState {
  if (identityMissing) return "waiting_identity";
  if (s.value && s.trust === "confirmed") return "confirmed";
  const fromJob = jobTileState(s.jobState);
  if (fromJob) return fromJob;
  if (s.value) return "needs_checking";
  return "not_started";
}

function jobTileState(state: ResearchJobState | null | undefined): TileState | null {
  switch (state) {
    case "needs_review":
      return "needs_checking";
    case "browser_check":
      return "browser_check";
    case "researching":
    case "checking":
      return "researching";
    case "queued":
    case "browser_check_queued":
      return "waiting";
    case "not_found":
    case "failed":
      return "couldnt_find";
    default:
      return null;
  }
}

/** "4 Confirmed · 3 Needs checking · 1 Browser check" — only states that occur, in a fixed order. */
export function tileSummary(states: TileState[]): Array<{ state: TileState; count: number }> {
  const order: TileState[] = ["confirmed", "needs_checking", "browser_check", "disagree", "researching", "waiting", "not_started", "couldnt_find", "not_applicable"];
  return order
    .map((state) => ({ state, count: states.filter((s) => s === state).length }))
    .filter((x) => x.count > 0);
}

// ------------------------------------------------------------------ specs source line (S7)

/** S7 source line: "From the old import" (CSV), "You checked it on <date>" (owner), "<site> · Read on <date>" (engine). */
export function specSourceLine(s: Pick<CoverageSpec, "trust" | "sourceNote" | "sourceUrl" | "trustRoute" | "checkedAt">): string {
  const note = (s.sourceNote ?? "").toLowerCase();
  if (note.includes("csv") || note.includes("import")) return "From the old import";
  if (s.trustRoute === "owner_browser") return s.checkedAt ? `You checked it on ${shortDate(s.checkedAt)}` : "You checked it";
  if (s.sourceUrl) return s.checkedAt ? `${siteName(s.sourceUrl)} · ${readOnLabel(s.checkedAt)}` : siteName(s.sourceUrl);
  return "No source on file";
}

// ------------------------------------------------------------------ money + dates (S4)

export function usd(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `US$${Number(n).toFixed(digits)}`;
}

export function onTrack(target: string | null | undefined, expected: string | null | undefined): boolean | null {
  if (!target || !expected) return null;
  return expected <= target;
}

// ------------------------------------------------------------------ browser-check guide (RE-63)

/** An engine code the way catalogues list it in their version tables ("1KR-FE" → "1KRFE"). */
export function catalogueEngineCode(code: string | null | undefined): string {
  return String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * `section`: the part of the catalogue to open after searching (any site). `rowContains`: the row name
 * is only part of the catalogue's name ("ABSORBER SET, SHOCK, FRONT RH" contains "SHOCK, FRONT").
 */
export type PartFinder = { search: string; rowName: string | null; section?: string | null; rowContains?: boolean };

/**
 * What to type in a Japanese maker catalogue's search box (Toyota / Daihatsu / Lexus parts catalogues), and the row's
 * name there. Only names seen in those catalogues; other parts fall back to the part's own name.
 */
export function partFinder(itemName: string, make: string | null | undefined, fitDescriptor?: string | null): PartFinder {
  const n = itemName.toLowerCase();
  const japanese = /toyota|daihatsu|lexus/i.test(String(make ?? ""));
  const plain = { search: itemName.toLowerCase(), rowName: null };
  if (!japanese) return plain;
  // Owner 25 Nov (Roomy): open the front / rear shock section (wording fits every site, not one), and Toyota
  // catalogues name the row e.g. "ABSORBER SET, SHOCK, FRONT RH" (SET or ASSY varies), so ask for the words every such row has.
  if (/shock absorber|^shocks?$/.test(n)) {
    const fit = String(fitDescriptor ?? "").toLowerCase();
    const axle = fit.includes("rear") ? "Rear" : fit.includes("front") ? "Front" : null;
    if (axle) {
      return { search: "shock absorber", section: `${axle.toLowerCase()} shock absorber`, rowName: `SHOCK, ${axle.toUpperCase()}`, rowContains: true };
    }
  }
  // Parts that only sit near these (mounts, sensors, timing belts, A/C compressors…) get no row name: better none than wrong.
  if (/mount|sensor|switch|timing|compressor|bearing|hose|cover|bracket|gasket/.test(n)) return plain;
  if (/\bcabin\b|a\/c filter|air ?con(ditioning)? filter/.test(n)) return { search: "air filter", rowName: "ELEMENT, CLEAN AIR FILTER (or AIR REFINER)" };
  if (/engine air filter|^air filter$|air cleaner/.test(n)) return { search: "air cleaner", rowName: "ELEMENT SUB-ASSY, AIR CLEANER FILTER" };
  if (/spark plug/.test(n)) return { search: "spark plug", rowName: "PLUG, SPARK" };
  if (/shock absorber|^shocks?$/.test(n)) return { search: "shock absorber", rowName: "ABSORBER ASSY, SHOCK" };
  if (/thermostat/.test(n)) return { search: "thermostat", rowName: "THERMOSTAT" };
  if (/brake pads?|^pads?$/.test(n)) return { search: "disc brake", rowName: "PAD KIT, DISC BRAKE" };
  if (/brake shoes?/.test(n)) return { search: "brake shoe", rowName: "SHOE SET, BRAKE" };
  if (/wiper blades?/.test(n)) return { search: "wiper", rowName: "BLADE ASSY, WIPER" };
  if (/serpentine belt|drive belt|fan belt|v-?ribbed belt/.test(n)) return { search: "belt", rowName: "BELT, V-RIBBED" };
  if (/oil filter/.test(n)) return { search: "oil filter", rowName: "FILTER SUB-ASSY, OIL" };
  return plain;
}

/**
 * RE-65: the version-list row in three words the catalogue shows — engine code, first build month, model name
 * (e.g. "1KRFE · 11.2016 · ROOMY"). Null when Dominion knows none of them.
 */
export function versionRowWords(car: ResearchCar | null): string | null {
  if (!car) return null;
  const start = car.production_start_year
    ? car.production_start_month
      ? `${String(car.production_start_month).padStart(2, "0")}.${car.production_start_year}`
      : String(car.production_start_year)
    : "";
  const parts = [catalogueEngineCode(car.engine_code), start, (car.model ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * RE-67 / owner 25 Nov: the car's version in words any parts site uses (Model code · Engine · Built · Grade · Gearbox), from the
 * stored catalogue words when Roam has them, else Dominion's own values; "—" when unknown.
 */
export function catalogueVersionRow(
  car: ResearchCar | null,
  known: { code?: string | null; engine?: string | null; prodPeriod?: string | null; grade?: string | null; transmission?: string | null } | null,
): Array<{ label: string; value: string }> {
  const or = (...v: Array<string | null | undefined>) => v.map((x) => String(x ?? "").trim()).find(Boolean) || "—";
  return [
    { label: "Model code", value: or(known?.code) },
    { label: "Engine", value: or(known?.engine, catalogueEngineCode(car?.engine_code)) },
    { label: "Built", value: or(known?.prodPeriod, buildDates(car)) },
    { label: "Grade", value: or(known?.grade, car?.catalog_trim) },
    { label: "Gearbox", value: or(known?.transmission, car?.transmission) },
  ];
}

export type CheckPosition = { key: string; axle: "front" | "rear"; side: "left" | "right" | null; label: string };

/**
 * RE-69: the positions a browser check asks a number for, from the part type's position scheme and the job's axle.
 * Null when the part has no positions (one number).
 */
export function checkPositions(scheme: string | null | undefined, fitDescriptor: string | null | undefined): CheckPosition[] | null {
  const s = String(scheme ?? "").trim();
  if (!["axle", "four_corners", "axle_left_right", "axle_inner_outer"].includes(s)) return null;
  const fit = String(fitDescriptor ?? "").toLowerCase();
  const axles: Array<"front" | "rear"> = fit.includes("rear") ? ["rear"] : fit.includes("front") ? ["front"] : ["front", "rear"];
  const sided = s === "four_corners" || s === "axle_left_right";
  const cap = (a: string) => a[0].toUpperCase() + a.slice(1);
  const out: CheckPosition[] = [];
  for (const axle of axles) {
    if (sided) {
      for (const side of ["left", "right"] as const) out.push({ key: `${axle}-${side}`, axle, side, label: `${cap(axle)} ${side}` });
    } else {
      out.push({ key: axle, axle, side: null, label: cap(axle) });
    }
  }
  return out;
}

/**
 * Owner 25 Nov: the dates a site shows next to one part number — year required, month only when the site shows one;
 * `none` = the site shows no dates for it. Mirrors the server's numbers list (research_browser_check.ts).
 */
export type RowDates = { fm: number; fy: number; tm: number; ty: number; none: boolean };
export const EMPTY_ROW_DATES: RowDates = { fm: 0, fy: 0, tm: 0, ty: 0, none: false };
export type BuildRange = { start: number | null; end: number | null };
export type RowCheck = "ok" | "missing" | "backwards" | "outside";

/** The car's build as month indexes (year × 12 + month); a missing month is the year's first / last. */
export function buildRange(car: ResearchCar | null): BuildRange {
  const s = car?.production_start_year;
  const e = car?.production_end_year;
  return {
    start: s ? s * 12 + (car?.production_start_month || 1) : null,
    end: e ? e * 12 + (car?.production_end_month || 12) : null,
  };
}

/** A row's dates as month indexes, or null when they're not complete (or the site shows none). */
export function rowSpan(d: RowDates): { from: number; to: number } | null {
  if (d.none || !d.fy || !d.ty) return null;
  return { from: d.fy * 12 + (d.fm || 1), to: d.ty * 12 + (d.tm || 12) };
}

/** Is one row's dates usable: both years given, end not before start, and touching the car's build. */
export function rowCheck(d: RowDates, build: BuildRange): RowCheck {
  if (d.none) return "ok";
  const span = rowSpan(d);
  if (!span) return "missing";
  if (span.to < span.from) return "backwards";
  if ((build.start != null && span.to < build.start) || (build.end != null && span.from > build.end)) return "outside";
  return "ok";
}

/**
 * Do these ranges, joined, cover the car's build? Touching ranges count (a change month is shown on both numbers).
 * Unknown build → true; no end on file → only the start and no gaps. Same rule as the server's `rangesCoverBuild`.
 */
export function rangesCoverBuild(ranges: Array<{ from: number; to: number }>, build: BuildRange): boolean {
  if (build.start == null) return true;
  let reach = build.start - 1;
  for (const r of [...ranges].sort((x, y) => x.from - y.from)) {
    if (r.from > reach + 1) {
      if (build.end != null && reach >= build.end) break;
      return false;
    }
    reach = Math.max(reach, r.to);
  }
  return reach >= build.start && (build.end == null ? true : reach >= build.end);
}
