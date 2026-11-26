/**
 * R6 (docs/saved-page-parts-audit.md §4): the AI's list of rows is only a list to check. This module proves each row on
 * the page text, drops rows that are another car, and says why a row is held (P1–P6). P7 (dates cover the build per
 * place) and the save/hold decision per axle live with the route.
 */
import { type CarBuild, periodsOnLine, typedLooksLikePartNumber, wholeNumberOnLine } from "./research_browser_check.ts";

export type AiDates = { fromMonth?: number | null; fromYear: number; toMonth?: number | null; toYear?: number | null };

/** One row the AI says it saw. `lineNo` / `groupLineNo` are 1-based line numbers from saved_page_text. */
export type AiPartRow = {
  lineNo: number;
  groupLineNo: number | null;
  partType: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  number: string;
  dates: AiDates | null;
  fitNote: string | null;
};

/** A Roam part type from maintenance_service_categories (only the fields the proof uses). */
export type PartType = { id: string; name: string; scheme: string | null };

export type CarFacts = {
  make: string | null;
  model: string | null;
  frame: string | null;
  engineCode: string | null;
  grade: string | null;
  transmission: string | null;
  build: CarBuild;
};

export type HeaderFacts = { engines: Set<string>; grades: Set<string>; transmissions: Set<string>; options: Set<string> };

export type ProvenRow = {
  lineNo: number;
  groupLineNo: number | null;
  partTypeName: string;
  type: PartType | null;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  /** The number as the page writes it (never the AI's spelling when the page splits it). */
  number: string;
  from: number | null;
  to: number | null;
  datesText: string | null;
  fitNote: string | null;
  /** Why this row is held; null while it passes. */
  reason: string | null;
  /** P1 passed: the number is a whole plain number on its row. */
  numberOk: boolean;
  /** P5 passed: both reads agree on this row. */
  readsAgree: boolean;
  /** Not this car (another engine, dates outside the build): dropped, never held and never shown (SP-23). */
  dropped: boolean;
  /** The lines that prove it, for research_page_read.block_text (prices already removed). */
  evidence: string;
};

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const SIDED = new Set(["four_corners", "axle_left_right"]);

/**
 * What to look for in a catalogue's search box and row names. Ported from
 * apps/admin/src/components/admin/research-engine/researchModel.ts (partFinder) — keep the two in sync.
 */
export type PartFinder = { search: string; rowName: string | null };

export function partFinder(itemName: string, make: string | null | undefined): PartFinder {
  const n = itemName.toLowerCase();
  const plain = { search: itemName.toLowerCase(), rowName: null };
  if (!/toyota|daihatsu|lexus/i.test(String(make ?? ""))) return plain;
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

/** Words a row may carry for a part type: its own name, the catalogue search word and the catalogue row name (P4). */
export function typeWords(type: PartType, make: string | null | undefined): string[] {
  const finder = partFinder(type.name, make);
  const words = new Set<string>();
  for (const w of `${type.name} ${finder.search} ${finder.rowName ?? ""}`.toUpperCase().split(/[^A-Z0-9]+/)) {
    if (w.length >= 3) words.add(w);
  }
  return [...words];
}

/** The word lists P3 looks for. */
const AXLE_WORDS: Record<"front" | "rear", string[]> = { front: ["FRONT", "FR"], rear: ["REAR", "RR"] };
const SIDE_WORDS: Record<"left" | "right", string[]> = { left: ["LEFT", "LH"], right: ["RIGHT", "RH"] };

function hasWord(text: string, words: string[]): boolean {
  const upper = String(text ?? "").toUpperCase();
  return words.some((w) => new RegExp(`(^|[^A-Z0-9])${w}([^A-Z0-9]|$)`).test(upper));
}

export function typeFor(types: PartType[], name: string): PartType | null {
  const wanted = String(name ?? "").trim().toLowerCase();
  return types.find((t) => t.name.trim().toLowerCase() === wanted) ?? null;
}

/** The axle/side words a part type's page must carry (P3), and the words to send the AI. */
export function axleWordsFor(type: PartType): string[] {
  if (!type.scheme || !["axle", "four_corners", "axle_left_right", "axle_inner_outer", "axle_numbered"].includes(type.scheme)) return [];
  return SIDED.has(type.scheme) ? ["front", "rear", "left", "right"] : ["front", "rear"];
}

/** The group row counts only above the row, in the same table/list, with no dates of its own (SP-16). */
export function acceptedGroup(
  lines: string[],
  containers: number[],
  lineNo: number,
  groupLineNo: number | null | undefined,
): number | null {
  const g = Number(groupLineNo);
  if (!Number.isInteger(g) || g < 1 || g >= lineNo) return null;
  if (!lines[g - 1] || !lines[lineNo - 1]) return null;
  if (containers.length >= lineNo && containers[g - 1] !== containers[lineNo - 1]) return null;
  if (periodsOnLine(lines[g - 1]).length) return null;
  return g;
}

/** "11.2016" for a month index, "2016" when only a year is known. */
export function monthText(index: number): string {
  if (!Number.isFinite(index)) return "now";
  const year = Math.floor((index - 1) / 12);
  const month = index - year * 12;
  return `${String(month).padStart(2, "0")}.${year}`;
}

export function dateRangeText(from: number | null, to: number | null): string | null {
  if (from == null) return null;
  return `${monthText(from)} – ${to == null ? "now" : monthText(to)}`;
}

/** The version facts the page's own header lines state (Engine / Grade / Transmission / Options). */
export function headerFacts(headerLines: string[]): HeaderFacts {
  const facts: HeaderFacts = { engines: new Set(), grades: new Set(), transmissions: new Set(), options: new Set() };
  const put = (set: Set<string>, value: string) => {
    for (const token of String(value).split(/[^A-Za-z0-9-]+/)) {
      const n = norm(token);
      if (n.length >= 2) set.add(n);
    }
  };
  for (const line of headerLines) {
    const m = String(line ?? "").match(/^\s*(engine|grade|transmission|transmission\s*\/\s*gearbox|gearbox|options?)\s*[:\-]?\s*(.+)$/i);
    if (!m) continue;
    const label = m[1].toLowerCase();
    if (label === "engine") put(facts.engines, m[2]);
    else if (label === "grade") put(facts.grades, m[2]);
    else if (label.startsWith("transmission") || label === "gearbox") put(facts.transmissions, m[2]);
    else put(facts.options, m[2]);
  }
  return facts;
}

const ENGINE_SHAPE = /^\d{1,2}[A-Z]{2,3}[A-Z]{0,3}$/;
const GEARBOX_WORDS = new Set(["CVT", "AT", "MT", "DCT", "4AT", "5AT", "6AT", "7AT", "4MT", "5MT", "6MT"]);
const OPTION_WORDS = new Set(["2WD", "4WD", "AWD", "FF", "FR", "ABS", "TCS", "VSC", "ESC"]);

/**
 * P6 (SP-20): only engine, gearbox and option codes in the note are compared, against the page header and the car's own
 * engine / transmission. A different code of the same kind drops the row; every other note is evidence and never holds.
 */
export function fitNoteProblem(note: string | null | undefined, car: CarFacts, header: HeaderFacts): string | null {
  if (!note) return null;
  const engines = new Set([norm(car.engineCode), ...header.engines].filter((x) => x.length >= 3));
  const gearboxes = new Set([norm(car.transmission), ...header.transmissions].filter(Boolean));
  const options = header.options;
  for (const raw of String(note).toUpperCase().match(/[A-Z0-9][A-Z0-9-]*/g) ?? []) {
    const t = norm(raw);
    if (!t) continue;
    if (ENGINE_SHAPE.test(t) && t.length >= 5) {
      if (engines.size && !engines.has(t)) return `This row is for a different engine (${raw})`;
      continue;
    }
    if (GEARBOX_WORDS.has(t)) {
      if (gearboxes.size && !gearboxes.has(t)) return `This row is for a different gearbox (${raw})`;
      continue;
    }
    if (OPTION_WORDS.has(t)) {
      if (options.size && !options.has(t)) return `This row is for a different version (${raw})`;
    }
  }
  return null;
}

/** What a row's own line says about dates: one range, none, several different ones, or dates outside the build. */
type RowDates =
  | { kind: "none" }
  | { kind: "many" }
  | { kind: "outside" }
  | { kind: "one"; from: number; to: number };

/**
 * P2 (SP-48): a row's line must show exactly one date range that overlaps the car's build. More than one different
 * overlapping range is never resolved by taking the first one: the row is held.
 */
function readRowDates(line: string, build: CarBuild): RowDates {
  const ranges = periodsOnLine(line);
  if (!ranges.length) return { kind: "none" };
  const start = build.startYear ? build.startYear * 12 + (build.startMonth ?? 1) : null;
  const end = build.endYear ? build.endYear * 12 + (build.endMonth ?? 12) : null;
  const fits = ranges.filter((r) => (start == null || r.to >= start) && (end == null || r.from <= end));
  const unique = new Map<string, { from: number; to: number }>();
  for (const r of fits) unique.set(`${r.from}|${r.to}`, r);
  const different = [...unique.values()];
  if (different.length > 1) return { kind: "many" };
  if (different.length === 1) return { kind: "one", from: different[0].from, to: different[0].to };
  return { kind: "outside" };
}

const datesKey = (d: AiDates | null | undefined) =>
  d ? `${d.fromYear}-${d.fromMonth ?? ""}|${d.toYear}-${d.toMonth ?? ""}` : "";

/**
 * Prove every row the two reads name. Rows both reads agree on are checked on the page (P1–P4, P6); P5 compares the two
 * reads. A row that is another car is dropped; every other failure is a held reason.
 */
export function proveRows(input: {
  reads: [AiPartRow[], AiPartRow[]];
  lines: string[];
  containers: number[];
  types: PartType[];
  car: CarFacts;
  header: HeaderFacts;
}): ProvenRow[] {
  const { reads, lines, containers, types, car, header } = input;
  const byLine = (rows: AiPartRow[]) => {
    const map = new Map<number, AiPartRow>();
    for (const r of rows) {
      const n = Number(r?.lineNo);
      if (Number.isInteger(n) && n >= 1 && n <= lines.length) map.set(n, r);
    }
    return map;
  };
  const first = byLine(reads[0]);
  const second = byLine(reads[1]);
  const lineNos = [...new Set([...first.keys(), ...second.keys()])].sort((a, b) => a - b);
  const out: ProvenRow[] = [];

  for (const lineNo of lineNos) {
    const a = first.get(lineNo) ?? null;
    const b = second.get(lineNo) ?? null;
    const chosen = a ?? b!;
    const typeName = String(a?.partType ?? b?.partType ?? "");
    const type = typeFor(types, typeName);
    const rowLine = lines[lineNo - 1] ?? "";
    const row: ProvenRow = {
      lineNo,
      groupLineNo: null,
      partTypeName: typeName,
      type,
      axle: null,
      side: null,
      number: String(chosen.number ?? "").trim(),
      from: null,
      to: null,
      datesText: null,
      fitNote: chosen.fitNote ?? null,
      reason: null,
      numberOk: false,
      readsAgree: false,
      dropped: false,
      evidence: rowLine,
    };
    // "other" (or a name Roam doesn't know) is listed as Not a Roam part type; nothing to prove or save.
    if (!type) {
      out.push(row);
      continue;
    }

    const group = acceptedGroup(lines, containers, lineNo, chosen.groupLineNo);
    row.groupLineNo = group;
    const evidence = group ? `${lines[group - 1]}\n${rowLine}` : rowLine;
    row.evidence = evidence;
    const text = group ? `${lines[group - 1]} | ${rowLine}` : rowLine;
    const fail = (reason: string) => {
      if (!row.reason) row.reason = reason;
    };

    // P3 place: a position-aware type says front/rear (and left/right when it comes in sides) on the row or group.
    if (type.scheme && ["axle", "four_corners", "axle_left_right", "axle_inner_outer", "axle_numbered"].includes(type.scheme)) {
      row.axle = chosen.axle === "rear" ? "rear" : chosen.axle === "front" ? "front" : null;
      if (!row.axle) fail("The page doesn't say front or rear on that row");
      else if (!hasWord(text, AXLE_WORDS[row.axle])) fail("The page doesn't say front or rear on that row");
      if (SIDED.has(type.scheme)) {
        row.side = chosen.side === "left" || chosen.side === "right" || chosen.side === "both" ? chosen.side : null;
        if (!row.side) fail("The page doesn't say left or right on that row");
        else if (row.side !== "both" && !hasWord(text, SIDE_WORDS[row.side])) fail("The page doesn't say left or right on that row");
      }
    }

    // P1 number: a whole plain number on the row, not a car code or a year, and never the group's own code (SP-19).
    const asWritten = row.number ? wholeNumberOnLine(rowLine, row.number) : null;
    if (!row.number) fail("No part number on that row");
    else if (!asWritten) fail("The number isn't written on that row");
    else if (!typedLooksLikePartNumber(row.number, rowLine, [car.frame, car.engineCode, car.model, car.make].filter((x): x is string => Boolean(x)))) {
      fail("That doesn't look like a part number");
    } else if (group && wholeNumberOnLine(lines[group - 1], row.number)) {
      fail("That number is the group's own code, not a part number");
    } else {
      row.number = asWritten;
      row.numberOk = true;
    }

    // P2 dates: read from the row itself (an accepted group has no dates of its own). Dates that miss the build drop.
    if (!row.reason) {
      const dates = readRowDates(rowLine, car.build);
      if (dates.kind === "none") fail("No dates shown on the page");
      else if (dates.kind === "many") fail("This row shows more than one set of dates");
      else if (dates.kind === "outside") row.dropped = true;
      else {
        row.from = dates.from;
        row.to = dates.to;
        row.datesText = dateRangeText(dates.from, dates.to);
      }
    }

    // P4 type: the row or group carries one of the part type's catalogue words ("SHOCK", not "SPRING").
    if (!row.reason && !row.dropped) {
      const words = typeWords(type, car.make);
      if (!hasWord(text, words)) fail("The page doesn't name this part type on that row");
    }

    // P5 the two reads agree on number, type, place and dates (SP-22). Checked even when another check failed: two
    // agreeing numbers are still the page's numbers to offer in the browser check.
    const same = Boolean(a && b)
      && norm(a!.number) === norm(b!.number)
      && norm(a!.partType) === norm(b!.partType)
      && (a!.axle ?? null) === (b!.axle ?? null)
      && (a!.side ?? null) === (b!.side ?? null)
      && datesKey(a!.dates) === datesKey(b!.dates);
    if (!same) fail("The two reads don't agree");
    else row.readsAgree = true;

    // P6 fits this car: only engine/gearbox/option codes in the note are compared (SP-20).
    if (!row.reason && !row.dropped) {
      const problem = fitNoteProblem(row.fitNote, car, header);
      if (problem) {
        row.dropped = true;
        row.reason = problem;
      }
    }

    out.push(row);
  }
  return out;
}

/**
 * P7: the dates of one place's passing rows must cover the car's whole build. Returns the missing span as plain words,
 * or null when covered (rangesCoverBuild's touching months count).
 */
export function placeGap(ranges: Array<{ from: number; to: number }>, build: CarBuild): string | null {
  if (!build.startYear) return null;
  const start = build.startYear * 12 + (build.startMonth ?? 1);
  const end = build.endYear ? build.endYear * 12 + (build.endMonth ?? 12) : null;
  let reach = start - 1;
  for (const r of [...ranges].sort((x, y) => x.from - y.from)) {
    if (r.from > reach + 1) return `Dates missing ${monthText(reach + 1)} – ${monthText(r.from - 1)}`;
    reach = Math.max(reach, r.to);
  }
  if (reach < start) return `Dates missing ${monthText(start)} – ${monthText(end ?? start)}`;
  if (end != null && reach < end) return `Dates missing ${monthText(reach + 1)} – ${monthText(end)}`;
  return null;
}

/** True when the page's own version dates hold the car's whole build; a car with no end needs an open page (SP-13). */
export function versionDatesFit(periods: Array<{ from: number; to: number }>, build: CarBuild): boolean {
  if (!build.startYear) return false;
  const start = build.startYear * 12 + (build.startMonth ?? 1);
  if (!build.endYear) return periods.some((p) => p.from <= start && p.to === Number.POSITIVE_INFINITY);
  const end = build.endYear * 12 + (build.endMonth ?? 12);
  return periods.some((p) => p.from <= start && p.to >= end);
}

/**
 * The line the version is read from: the title and the lines above the first part row (SP-12). A part row is the first
 * line carrying a whole plain number; a frame number in a help link below it never counts.
 */
export function headerLineCount(lines: string[], identity: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i].split(/[\s,;|]+/)) {
      const t = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      // A part number has letters and digits and no date punctuation; a date, a year or a version code never starts
      // the parts.
      if (t.length < 5 || !/[A-Za-z]/.test(t) || !/\d/.test(t) || /[./]/.test(t)) continue;
      if (typedLooksLikePartNumber(t, lines[i], identity)) return i;
    }
  }
  return Math.min(lines.length, 20);
}
