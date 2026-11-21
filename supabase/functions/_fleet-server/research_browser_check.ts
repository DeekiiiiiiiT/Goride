import { containsToken } from "./research_recipes.ts";
/**
 * Browser-check confirm gate (docs/research-engine-audit.md RE-01 / RE-29, round-2 review item 2).
 * The owner pastes one line from a catalogue page. Confirm is allowed only when that line names the car and:
 *   - part job → a part number;
 *   - spec job → a value of that spec's shape (battery code/type, oil grade, litres, mm, tyre size, fluid/colour text).
 * The value read is echoed back as "Detected:".
 */

export type GateResult =
  | { ok: true; detected: string }
  | { ok: false; reason: "no_car" | "no_number" | "number_not_on_line" | "wrong_years" | "wrong_engine" | "no_value" | "empty" };


/** Value shapes per spec key; keys not listed accept any short text after the car is named. */
export const SPEC_VALUE_SHAPES: Record<string, RegExp> = {
  battery_jis: /\b(\d{2,3}[A-H]\d{2}[LR]?|[A-Z]-\d{2}[A-Z]?|[A-Z]{1,2}-?\d{2,3}[A-Z]?)\b/i,
  battery_type: /\b(EFB|AGM|flooded|standard|SLI|lithium)\b/i,
  engine_oil_grade: /\b\d{1,2}W-?\d{2}\b/i,
  engine_oil_capacity_with_filter_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  engine_oil_capacity_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  coolant_capacity_l: /\b\d+(\.\d+)?\s*(L|litres?|liters?)\b/i,
  wiper_driver_mm: /\b\d{3}\s*mm\b/i,
  wiper_passenger_mm: /\b\d{3}\s*mm\b/i,
  wiper_rear_mm: /\b\d{3}\s*mm\b/i,
  tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  front_tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  rear_tire_size: /\b\d{3}\/\d{2}\s?Z?R\s?\d{2}\b/i,
  bolt_pattern: /\b\d\s?[x×]\s?\d{3}(\.\d)?\b/i,
  brake_fluid: /\b(DOT\s?[345](\.1)?|BF\s?\w+|\w+\s+2500H-?A)\b/i,
  coolant_type: /\b(LLC|SLLC|super long life|long life|OAT|HOAT|[A-Za-z]+\s+(pink|green|blue))\b/i,
  headlight_low_bulb: /\b(H\d{1,2}|HB\d|HIR\d|D\dS|LED)\b/i,
  headlight_high_bulb: /\b(H\d{1,2}|HB\d|HIR\d|D\dS|LED)\b/i,
  fog_bulb: /\b(H\d{1,2}|HB\d|PSX\d+W|LED)\b/i,
  tail_bulb: /\b(T\d{2}|W\d+W|P21\/5W|LED)\b/i,
  indicator_bulb: /\b(T\d{2}|WY\d+W|PY21W|LED)\b/i,
};

const normNum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// ---------------------------------------------------------------- RE-60: right version of the car

export type CarBuild = { startYear: number | null; startMonth?: number | null; endYear: number | null; endMonth?: number | null };

/** Build periods a catalogue line states: "11.2016 - 09.2020", "09.2020 - ...", "Production years 2016 2017 2018". */
export function periodsOnLine(line: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const re = /\b(\d{1,2})[./](\d{4})\s*[-–—~]\s*(?:(\d{1,2})[./](\d{4})|\.{2,3}|…|now|present)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const from = Number(m[2]) * 12 + Number(m[1]);
    const to = m[4] ? Number(m[4]) * 12 + Number(m[3]) : Number.POSITIVE_INFINITY;
    if (Number(m[1]) >= 1 && Number(m[1]) <= 12) out.push({ from, to });
  }
  // Year-only ranges: "2016-2020", "2020—2024", "2020 - now".
  const yr = /(?<![\d./-])((?:19|20)\d{2})\s*[-–—~]\s*((?:19|20)\d{2}|now|present|\.{2,3}|…)(?![\d./-])/gi;
  while ((m = yr.exec(line))) {
    const end = /^\d{4}$/.test(m[2]) ? Number(m[2]) * 12 + 12 : Number.POSITIVE_INFINITY;
    out.push({ from: Number(m[1]) * 12 + 1, to: end });
  }
  const years = line.match(/production\s+years?\s*:?\s*((?:(?:19|20)\d{2}[\s,]*)+)/i);
  if (years) {
    const ys = years[1].match(/(19|20)\d{2}/g)!.map(Number);
    out.push({ from: Math.min(...ys) * 12 + 1, to: Math.max(...ys) * 12 + 12 });
  }
  return out;
}

/** True when every period on the line overlaps the car's build (months when on file, else the whole year). */
export function periodsFitCar(line: string, car: CarBuild): boolean {
  if (!car.startYear) return true;
  const from = car.startYear * 12 + (car.startMonth ?? 1);
  const to = car.endYear ? car.endYear * 12 + (car.endMonth ?? 12) : Number.POSITIVE_INFINITY;
  return periodsOnLine(line).every((p) => p.from <= to && p.to >= from);
}

/**
 * RE-63: the catalogue's own name for the version the owner pasted from — the car's frame followed by the
 * catalogue's suffix, e.g. "M900A-AGBVE" on "Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020". Null when absent.
 */
export function versionCodeOnLine(pasted: string, frame: string | null | undefined): string | null {
  // The stored frame may be "M900A", "DBA-M900A" or "M900A/M910A": try each frame, without an emissions prefix.
  const frames = String(frame ?? "")
    .toUpperCase()
    .split(/[\s/,;]+/)
    .map((x) => x.replace(/^[A-Z0-9]{2,3}-(?=[A-Z])/, "").replace(/[^A-Z0-9]/g, ""))
    .filter((x) => x.length >= 3);
  const text = String(pasted ?? "").toUpperCase();
  const found = new Set<string>();
  for (const f of frames) {
    // The page may write it with its emissions prefix too ("DBA-M900A-AGBVE").
    const re = new RegExp(`(?<![A-Z0-9])(?:[A-Z0-9]{2,3}-)?(${f}-[A-Z0-9]{3,8})(?![A-Z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) found.add(m[1]);
  }
  // Only one version named → that's the one used; several (or none) → remember nothing.
  return found.size === 1 ? [...found][0] : null;
}

/** RE-67: the first build period as the catalogue writes it ("11.2016 - 09.2020", "09.2020 - ..."), else null. */
export function periodTextOnLine(pasted: string): string | null {
  const m = String(pasted ?? "").match(/\b\d{1,2}[./]\d{4}\s*[-–—~]\s*(?:\d{1,2}[./]\d{4}|\.{2,3}|…)/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/** RE-63: the version's own start page from the page the owner used (Amayama EPC `…/<frame>/<id>`), else null. */
export function versionPageUrl(url: string | null | undefined): string | null {
  try {
    const u = new URL(String(url ?? ""));
    if (u.protocol !== "https:" || u.hostname.replace(/^www\./, "") !== "amayama.com") return null;
    const m = u.pathname.match(/^((?:\/[a-z]{2})?\/genuine-catalogs\/epc\/[^/]+\/[^/]+\/[^/]+\/\d+)(\/|$)/i);
    return m ? `${u.origin}${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * A catalogue link that points at one version of a frame (Amayama EPC `/genuine-catalogs/epc/<make>/<model>/<frame>/<id>/…`)
 * is cut back to that frame's version list, because Roam can't read the page to know the version fits (RE-60).
 * Other links are returned unchanged.
 */
export function versionListLink(url: string | null): string | null {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") === "amayama.com") {
      const m = u.pathname.match(/^((?:\/[a-z]{2})?\/genuine-catalogs\/epc\/[^/]+\/[^/]+\/[^/]+)\/\d+(\/|$)/i);
      if (m) return `${u.origin}${m[1]}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * The number as the page writes it, when `number` is a whole number on the line: one token, or 2–3 neighbouring tokens
 * joined (a page that splits "0446 5B1190"). Punctuation is ignored; a number that is only part of a longer one never
 * counts ("90919-0125" is not on "90919-01253").
 */
export function wholeNumberOnLine(line: string, number: string): string | null {
  const want = normNum(number);
  if (want.length < 4) return null;
  const tokens = line.split(/[\s,;|]+/).map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let k = 0; k < 3 && i + k < tokens.length; k++) {
      joined += normNum(tokens[i + k]);
      // One token → as the page writes it; a number the page split → the number's own spelling, never with the gap.
      if (joined === want) return k === 0 ? tokens[i].toUpperCase() : number.trim().toUpperCase();
      if (joined.length >= want.length) break;
    }
  }
  return null;
}

/**
 * Frame codes with an emissions prefix (DBA-M910A) and model years are never a typed part number. A bare frame code
 * (M910A) is caught when the page lists it after "Frame"; bare shapes like VCH16 are real part numbers, so allowed.
 */
const FRAME_SHAPE = /^[A-Z0-9]{2,3}-[A-Z]{1,3}\d{2,3}[A-Z]{0,2}$/;
const YEAR_SHAPE = /^(19|20)\d{2}$/;

export function typedLooksLikePartNumber(typed: string, line: string, identity: string[]): boolean {
  const t = typed.trim().toUpperCase();
  const n = normNum(t);
  if (n.length < 5 || !/\d/.test(n) || !/^[A-Z0-9][A-Z0-9 .\-/]*$/.test(t)) return false;
  if (YEAR_SHAPE.test(n) || FRAME_SHAPE.test(t)) return false;
  if (identity.map(normNum).filter(Boolean).some((c) => n === c || n.includes(c))) return false;
  // Codes the page lists after "Frame", "Engine" or "Model" describe the car, not the part.
  const carWords = line.match(/\b(?:frame|engine|model)\b[:\s]+((?:[A-Z0-9][A-Z0-9-]*\s*){1,4})/gi) ?? [];
  for (const w of carWords) {
    for (const code of w.split(/\s+/).slice(1)) if (normNum(code) === n) return false;
  }
  return true;
}

// ---------------------------------------------------------------- RE-68: answers instead of pasted text

export type CheckAnswers = {
  /** "Does the top say <model>?" (or the model typed when Roam didn't know it). */
  versionOk?: boolean;
  versionCode?: string | null;
  /** "Do you see <row name>?" */
  partFound?: boolean;
  /** Part number tapped or typed (part jobs), or the value shown (spec jobs). */
  value?: string | null;
  /** The same value typed a second time — required when it isn't one of Roam's suggestions. */
  valueAgain?: string | null;
  /** "Do its dates include the car's build?" */
  datesOk?: boolean;
  /** "Is it for the front/rear?" — only asked when the job has a side. */
  sideOk?: boolean | null;
  /**
   * RE-69: parts that come in positions (shocks, bearings, brakes…) — one number per position the owner filled.
   * When present, these replace `value`.
   */
  positions?: Array<{
    axle: "front" | "rear";
    side?: "left" | "right" | null;
    value?: string | null;
    valueAgain?: string | null;
    /** RE-70: when the number changed during the build — the number for cars built before / from `changeAt`. */
    period?: "before" | "from" | null;
  }> | null;
  /**
   * RE-70: the car maker changed the number during the car's build ("To frame …0255546 / From …0255547"): the month it
   * changed. Then `value` is the number for cars built before it and `valueFrom` the number from it (parts without
   * positions), or each position says its `period`.
   */
  changeAt?: { month: number; year: number } | null;
  valueFrom?: string | null;
  valueFromAgain?: string | null;
};

export type PositionItem = {
  detected: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | null;
  /** RE-70: the build years this number is for (whole years; a change mid-year lists both numbers for that year). */
  yearFrom?: number | null;
  yearTo?: number | null;
  /** RE-70: "built before 11.2018" / "built from 11.2018". */
  periodText?: string | null;
};

/**
 * RE-70: years for a number that changed during the build. A change in month M of year Y: the old number is for cars
 * built up to Y (up to Y-1 when it changed in January), the new one from Y. Whole years only, so a car built in the
 * change year is shown both numbers.
 */
export function changeYears(
  changeAt: { month: number; year: number },
  period: "before" | "from",
): { yearFrom: number | null; yearTo: number | null } {
  return period === "before"
    ? { yearFrom: null, yearTo: changeAt.month === 1 ? changeAt.year - 1 : changeAt.year }
    : { yearFrom: changeAt.year, yearTo: null };
}

/** RE-70: a change month must fall inside the car's build (after its first month, not after its last). */
export function changeAtFits(changeAt: unknown, build: CarBuild | null | undefined): { month: number; year: number } | null {
  const c = changeAt as { month?: unknown; year?: unknown } | null;
  const month = Number(c?.month);
  const year = Number(c?.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1950 || year > 2100) return null;
  const at = year * 12 + month;
  if (build?.startYear && at <= build.startYear * 12 + (build.startMonth ?? 1)) return null;
  if (build?.endYear && at > build.endYear * 12 + (build.endMonth ?? 12)) return null;
  return { month, year };
}

export type AnswersResult =
  | { ok: true; detected: string; versionCode: string | null; evidence: string; items?: PositionItem[] }
  | {
    ok: false;
    reason:
      | "version_no"
      | "part_not_found"
      | "dates_no"
      | "side_no"
      | "no_value"
      | "bad_number"
      | "bad_version"
      | "retype_mismatch"
      | "bad_position"
      | "needs_positions"
      | "bad_change_date";
  };

/**
 * The owner's answers to the check's questions → the value to save and the evidence text (RE-68). Every "No" stops
 * Confirm; a part number can't be a year, frame or engine code; a spec value must have the spec's shape.
 */
export function answersGate(input: {
  jobType: "part" | "spec";
  answers: CheckAnswers;
  identity: string[];
  frame?: string | null;
  specKey?: string | null;
  needsSide?: string | null;
  site: string;
  rowName?: string | null;
  buildText?: string | null;
  /** The version Roam already remembers for this car (server's own record; named in the evidence). */
  knownCode?: string | null;
  /** Roam's suggested values for this job (server's own record). */
  suggestions?: string[];
  /** RE-69: the part type's position scheme and the job's own axle (server's own records). */
  positionScheme?: string | null;
  jobAxle?: "front" | "rear" | null;
  /** RE-70: when the car was built (server's own record) — a change month must fall inside it. */
  build?: CarBuild | null;
}): AnswersResult {
  const a = input.answers ?? {};
  // A remembered version is checked with Yes/No; otherwise the owner types the model shown at the top.
  if (input.knownCode ? a.versionOk !== true : !String(a.versionCode ?? "").trim()) return { ok: false, reason: "version_no" };
  if (a.partFound !== true) return { ok: false, reason: "part_not_found" };
  if (a.datesOk !== true) return { ok: false, reason: "dates_no" };
  const positioned = input.jobType === "part" && Array.isArray(a.positions) && a.positions.length > 0;
  // RE-69: positions only for part types that have them; sided types (four corners, left/right) always need them.
  const scheme = String(input.positionScheme ?? "");
  const hasPositions = ["axle", "four_corners", "axle_left_right", "axle_inner_outer"].includes(scheme);
  const sided = scheme === "four_corners" || scheme === "axle_left_right";
  if (positioned && !hasPositions) return { ok: false, reason: "bad_position" };
  if (!positioned && input.jobType === "part" && sided) return { ok: false, reason: "needs_positions" };
  if (!positioned && input.needsSide && a.sideOk !== true) return { ok: false, reason: "side_no" };

  let versionCode: string | null = null;
  if (!input.knownCode && a.versionCode && String(a.versionCode).trim()) {
    const typed = String(a.versionCode).trim().toUpperCase();
    // With a frame on file the model must be "<frame>-<suffix>"; without one, any model-like text is kept as typed.
    versionCode = input.frame ? versionCodeOnLine(typed, input.frame) : /^[A-Z0-9][A-Z0-9-]{3,39}$/.test(typed) ? typed : null;
    if (!versionCode) return { ok: false, reason: "bad_version" };
  }

  const normV = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isSuggested = (raw: string) => (input.suggestions ?? []).some((x) => normV(x) && normV(x) === normV(raw));
  // One value: its shape, then — when it isn't one of Roam's suggestions — typed twice (no typo becomes a number).
  const check = (rawIn: unknown, again: unknown): { ok: true; detected: string } | { ok: false; reason: "no_value" | "bad_number" | "retype_mismatch" } => {
    const raw = String(rawIn ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!raw) return { ok: false, reason: "no_value" };
    let detected = raw;
    if (input.jobType === "part") {
      if (!typedLooksLikePartNumber(raw, "", input.identity)) return { ok: false, reason: "bad_number" };
      detected = raw.toUpperCase();
    } else {
      const shape = input.specKey ? SPEC_VALUE_SHAPES[input.specKey] : undefined;
      if (shape) {
        const m = raw.match(shape);
        if (!m) return { ok: false, reason: "no_value" };
        detected = m[0].trim();
      }
    }
    if (!isSuggested(raw) && normV(again) !== normV(raw)) return { ok: false, reason: "retype_mismatch" };
    return { ok: true, detected };
  };

  // RE-70: a number that changed during the build — the change month must fall inside the car's build.
  const split = a.changeAt != null && input.jobType === "part";
  const changeAt = split ? changeAtFits(a.changeAt, input.build) : null;
  if (split && !changeAt) return { ok: false, reason: "bad_change_date" };
  const changeText = changeAt ? `${String(changeAt.month).padStart(2, "0")}.${changeAt.year}` : "";
  const periodOf = (period: "before" | "from" | null): Pick<PositionItem, "yearFrom" | "yearTo" | "periodText"> =>
    changeAt && period ? { ...changeYears(changeAt, period), periodText: `built ${period} ${changeText}` } : {};

  let detected = "";
  let items: PositionItem[] | undefined;
  let valueText = "";
  const itemText = (i: PositionItem) =>
    [`${i.axle ?? ""}${i.side ? ` ${i.side}` : ""}`.trim(), i.detected, i.periodText ?? ""].filter(Boolean).join(" ");
  if (positioned) {
    // RE-69: one number per filled position; empty positions are simply not saved.
    type Raw = { axle: "front" | "rear"; side: "left" | "right" | null; period: "before" | "from" | null; detected: string };
    const raws: Raw[] = [];
    for (const p of a.positions!) {
      if (!String(p?.value ?? "").trim()) continue;
      const axle = p.axle === "rear" ? "rear" : p.axle === "front" ? "front" : null;
      if (!axle) return { ok: false, reason: "no_value" };
      const side = p.side === "left" || p.side === "right" ? p.side : null;
      const period = p.period === "before" || p.period === "from" ? p.period : null;
      // RE-70: with a change date every number says before/from; without one, none may.
      if (changeAt ? !period : period) return { ok: false, reason: "bad_position" };
      if (input.jobAxle && axle !== input.jobAxle) return { ok: false, reason: "bad_position" };
      if (sided ? !side : side) return { ok: false, reason: "bad_position" };
      if (raws.some((x) => x.axle === axle && x.side === side && x.period === period)) return { ok: false, reason: "bad_position" };
      const r = check(p.value, p.valueAgain);
      if (!r.ok) return { ok: false, reason: r.reason };
      raws.push({ axle, side, period, detected: r.detected });
    }
    items = [];
    for (const r of raws) {
      // RE-70: a place whose number didn't change (same before and from) is saved once, for every year.
      const twin = r.period
        ? raws.find((x) => x !== r && x.axle === r.axle && x.side === r.side && normV(x.detected) === normV(r.detected))
        : undefined;
      if (twin && r.period === "from") continue;
      items.push({ detected: r.detected, axle: r.axle, side: r.side, ...(twin ? {} : periodOf(r.period)) });
    }
    if (!items.length) return { ok: false, reason: "no_value" };
    detected = items[0].detected;
    valueText = items.map(itemText).join(", ");
  } else if (changeAt) {
    // RE-70: one number for cars built before the change, another from it (either may be left empty, not both).
    const axle = input.jobAxle ?? null;
    items = [];
    const pairs: Array<["before" | "from", unknown, unknown]> = [
      ["before", a.value, a.valueAgain],
      ["from", a.valueFrom, a.valueFromAgain],
    ];
    for (const [period, v, again] of pairs) {
      if (!String(v ?? "").trim()) continue;
      const r = check(v, again);
      if (!r.ok) return { ok: false, reason: r.reason };
      items.push({ detected: r.detected, axle, side: null, ...periodOf(period) });
    }
    if (!items.length) return { ok: false, reason: "no_value" };
    if (items.length === 2 && normV(items[0].detected) === normV(items[1].detected)) {
      items = [{ detected: items[0].detected, axle, side: null }];
    }
    detected = items[0].detected;
    valueText = items.map(itemText).join(", ");
  } else {
    const r = check(a.value, a.valueAgain);
    if (!r.ok) return { ok: false, reason: r.reason };
    detected = r.detected;
    valueText = detected;
  }

  const evidence = [
    `Owner checked on ${input.site}`,
    versionCode ?? input.knownCode ?? null,
    input.rowName ?? null,
    valueText,
    changeAt
      ? `changed ${changeText}; dates together cover ${input.buildText || "the car's build"}`
      : input.buildText
      ? `dates include ${input.buildText}`
      : "dates include the car's build",
    !positioned && input.needsSide ? `for the ${input.needsSide}` : null,
  ].filter(Boolean).join(" · ");
  return { ok: true, detected, versionCode, evidence: evidence.slice(0, 2000), ...(items ? { items } : {}) };
}

export function lineNamesCar(line: string, identity: string[]): boolean {
  const upper = line.toUpperCase();
  return identity.some((t) => t.trim().length >= 2 && containsToken(upper, t));
}

export function browserCheckGate(input: {
  jobType: "part" | "spec";
  pasted: string;
  identity: string[];
  specKey?: string | null;
  expectedNumber?: string | null;
  /** Every open number Roam suggested for this job (part checks). */
  candidates?: string[];
  /** The number the owner typed because the page shows a different one (part checks). */
  typedNumber?: string | null;
  /** RE-60: when the car was built; dates on the pasted text must fit it. */
  build?: CarBuild | null;
  /** RE-60: this car's engine code, and the other engine codes of the same make + model (e.g. the turbo). */
  engineCode?: string | null;
  otherEngines?: string[];
}): GateResult {
  const line = String(input.pasted ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!line) return { ok: false, reason: "empty" };
  if (!lineNamesCar(line, input.identity)) return { ok: false, reason: "no_car" };
  // RE-60: the right version — dates that don't fit the car, or only a sister engine (the turbo), are refused.
  if (input.build && !periodsFitCar(line, input.build)) return { ok: false, reason: "wrong_years" };
  // Engine codes as whole tokens ("1KR-FE" = "1KRFE.."), never inside a part number or joined text.
  const mine = String(input.engineCode ?? "").trim();
  const others = (input.otherEngines ?? []).map((e) => e.trim()).filter((e) => normNum(e).length >= 4 && normNum(e) !== normNum(mine));
  if (normNum(mine).length >= 4 && !containsToken(line, mine) && others.some((e) => containsToken(line, e))) {
    return { ok: false, reason: "wrong_engine" };
  }

  if (input.jobType === "part") {
    // RE-57: never guess a number from the line (a sister car's frame code, "DBA-M910A", was read as the part number).
    // A number counts only when it is a WHOLE number on the pasted text (one token, or 2–3 neighbouring tokens for a
    // number the page splits, "0446 5B1190"), punctuation ignored. Roam's suggestions are tried first, then the number
    // the owner typed. Detected = the number as the page writes it.
    const typed = String(input.typedNumber ?? "").trim();
    const candidates = [input.expectedNumber, ...(input.candidates ?? [])].filter((n): n is string => Boolean(n && n.trim()));
    for (const n of candidates) {
      const hit = wholeNumberOnLine(line, n);
      if (hit) return { ok: true, detected: hit };
    }
    if (typed) {
      if (!typedLooksLikePartNumber(typed, line, input.identity)) return { ok: false, reason: "number_not_on_line" };
      const hit = wholeNumberOnLine(line, typed);
      return hit ? { ok: true, detected: hit } : { ok: false, reason: "number_not_on_line" };
    }
    return { ok: false, reason: "no_number" };
  }

  const shape = input.specKey ? SPEC_VALUE_SHAPES[input.specKey] : undefined;
  if (shape) {
    // the car's own codes (frame, engine) are never the value
    const valueText = input.identity.reduce((acc, t) => (t ? acc.split(t).join(" ") : acc), line);
    const m = valueText.match(shape);
    return m ? { ok: true, detected: m[0].trim() } : { ok: false, reason: "no_value" };
  }
  // No value shape: the value is the last pasted line (the row) — not the version line — without codes and dates.
  const lines = String(input.pasted ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const row = lines.length > 1 ? lines[lines.length - 1] : line;
  const rest = input.identity
    .reduce((s, t) => (t ? s.split(t).join(" ") : s), row)
    .replace(/\b\d{1,2}[./]\d{4}\s*[-–—~]\s*(?:\d{1,2}[./]\d{4}|\.{2,3}|…)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length >= 2 ? { ok: true, detected: rest.slice(0, 120) } : { ok: false, reason: "no_value" };
}
