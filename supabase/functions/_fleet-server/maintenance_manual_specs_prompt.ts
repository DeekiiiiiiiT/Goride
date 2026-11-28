/**
 * Step 6b — DOC-06: reading the values out of an owner's manual page.
 *
 * A Japanese owner's manual prints almost no service intervals; its value is the specifications chapter —
 * capacities, grades, tyre pressures, battery size, bulbs. So an owner's-manual page is read with this prompt
 * instead of the interval prompt, and it answers with two lists:
 *   - `specs`: one value per row, with the page's own remark that says which cars it fits ("4WD", "Turbo",
 *     "with the electric parking brake"),
 *   - `intervals`: any replacement interval the page prints (tyre rotation, cabin filter). Those become the same
 *     draft rules a maintenance sheet produces.
 *
 * Every value keeps the shape it was printed in, and every key is one Roam already knows: a made-up key would be
 * a value with nowhere to live, which is the problem this step exists to fix. Anything that does not fit is
 * dropped and counted — never guessed at.
 */
import type { ManualRowConfidence, ParsedManualRow } from "./maintenance_manual_prompt.ts";
import { parseManualPage } from "./maintenance_manual_prompt.ts";

export const SPEC_KINDS = ["fluid", "tyre", "battery", "bulb", "fuel"] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

/** The numeric columns the catalogue already has, so these are written to the car itself. */
export const CATALOGUE_COLUMN_KEYS = [
  "engine_oil_capacity_l",
  "coolant_capacity_l",
  "fuel_tank_capacity",
] as const;

/**
 * The keys a page may name. This is the spec_key table plus the three catalogue columns: a key outside this list
 * has no home in Roam, so it is dropped rather than stored in a column nobody reads.
 */
export const SPEC_KEYS = new Set([
  // the three catalogue columns
  "engine_oil_capacity_l",
  "coolant_capacity_l",
  "fuel_tank_capacity",
  // G3: the six fluid keys
  "transmission_fluid_capacity_l",
  "transfer_oil_grade",
  "transfer_oil_capacity_l",
  "differential_oil_grade",
  "differential_oil_capacity_l",
  "washer_capacity_l",
  // keys that already existed
  "engine_oil_capacity_with_filter_l",
  "engine_oil_grade",
  "coolant_type",
  "transmission_fluid",
  "washer_fluid",
  "brake_fluid",
  "fuel_grade",
  "battery_jis",
  "battery_type",
  "tire_size",
]);

/** A tyre position, as the tyre table and the screens use it. */
export const TYRE_POSITIONS = ["front", "rear", "spare"] as const;

export type ParsedSpecRow = {
  kind: SpecKind;
  key: string;
  value: Record<string, unknown>;
  /** The page's remark that decides which cars the value fits, or null. */
  appliesTo: string | null;
  confidence: ManualRowConfidence;
};

export type ParsedSpecPage = {
  rows: ParsedSpecRow[];
  /** Intervals the page also prints (tyre rotation, cabin filter), read by the interval reader's own parser. */
  intervals: ParsedManualRow[];
  /** Rows the model returned that could not be used. */
  dropped: number;
};

/** A specifications page prints a dozen values; a bigger answer is a confused read. */
export const MAX_SPEC_ROWS_PER_PAGE = 120;
const MAX_APPLIES_TO = 80;

function textOf(value: unknown, max = 120): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanAppliesTo(value: unknown): string | null {
  const t = textOf(value, MAX_APPLIES_TO);
  if (!t || /^(null|none|n\/?a|-+|—)$/i.test(t)) return null;
  return t;
}

function confidenceOf(value: unknown): ManualRowConfidence {
  const t = String(value ?? "").trim().toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  return "low";
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A fluid, fuel or battery value: one main figure plus what it is in. */
function scalarValue(raw: Record<string, unknown>): Record<string, unknown> | null {
  const main = raw.value ?? raw.litres ?? raw.liters ?? raw.capacity ?? raw.grade ?? raw.size ?? raw.spec;
  const text = textOf(main, 80);
  if (!text) return null;

  const out: Record<string, unknown> = { value: text };
  const unit = textOf(raw.unit, 20);
  if (unit) out.unit = unit;
  const note = textOf(raw.note, 200);
  if (note) out.note = note;
  const also = raw.also ?? raw.alternatives ?? raw.acceptable;
  if (Array.isArray(also) && also.length) {
    const list = also.map((v) => textOf(v, 60)).filter(Boolean);
    if (list.length) out.also = list;
  }
  // "3.1 L with filter" is a different key, not a note on 2.9 L; keep it if the page printed both.
  const withFilter = numberOrNull(raw.with_filter ?? raw.withFilter);
  if (withFilter != null) out.with_filter = withFilter;

  return out;
}

function tyreValue(raw: Record<string, unknown>): Record<string, unknown> | null {
  const size = textOf(raw.size, 40);
  if (!size) return null;
  const out: Record<string, unknown> = { size };
  const load = textOf(raw.load_speed_index ?? raw.load_index ?? raw.loadSpeedIndex, 20);
  if (load) out.load_speed_index = load;
  const wheel = textOf(raw.wheel_size ?? raw.wheel, 20);
  if (wheel) out.wheel_size = wheel;
  const pressure = numberOrNull(raw.pressure_kpa ?? raw.pressure ?? raw.kpa);
  if (pressure != null) out.pressure_kpa = Math.round(pressure);
  if (raw.is_optional === true) out.is_optional = true;
  const note = textOf(raw.note, 200);
  if (note) out.note = note;
  return out;
}

function bulbValue(raw: Record<string, unknown>): Record<string, unknown> | null {
  const ref = textOf(raw.bulb_ref ?? raw.bulb ?? raw.ref ?? raw.size, 40);
  const isLed = raw.is_led === true || /^(led)$/i.test(ref);

  // A lamp the page prints as LED has no replaceable bulb: that is a real row ("LED"), not a missing value.
  // A lamp with no number and no LED note is still a real position: it is kept as "Unknown" so the owner is
  // asked, instead of the position disappearing because the page left the cell blank.
  if (!ref && !isLed) {
    return {
      bulb_ref: "Unknown",
      grade_note: textOf(raw.grade_note ?? raw.note, 200) || "The page prints no bulb number for this lamp.",
    };
  }

  const out: Record<string, unknown> = { bulb_ref: ref || "LED" };
  if (isLed) out.is_led = true;
  const watts = textOf(raw.wattage_w ?? raw.watts ?? raw.wattage, 20);
  if (watts) out.wattage_w = watts;
  const note = textOf(raw.grade_note ?? raw.note, 200);
  if (note) out.grade_note = note;
  return out;
}

/** The key a row carries: a spec_key, a tyre position, or the maker's own lamp position. */
function keyOf(kind: SpecKind, raw: Record<string, unknown>, fallback: string): string {
  const given = textOf(raw.key ?? raw.spec_key ?? raw.position ?? raw.name, 80);
  const candidate = given || fallback;
  if (kind === "fluid" || kind === "fuel" || kind === "battery") {
    return SPEC_KEYS.has(candidate) ? candidate : "";
  }
  if (kind === "tyre") {
    const position = candidate.toLowerCase();
    return (TYRE_POSITIONS as readonly string[]).includes(position) ? position : "";
  }
  // bulb: the maker's position wording, kept as printed ("Headlamp", "Front turn signal").
  return candidate.length >= 2 ? candidate : "";
}

/**
 * Turn the model's answer into rows we can store. A row is kept when its kind is known, its key has a home in
 * Roam, and it carries a value; everything else is counted as dropped.
 */
export function parseSpecsPage(raw: unknown): ParsedSpecPage {
  const obj = asObject(raw);
  const specList = Array.isArray(obj.specs)
    ? obj.specs
    : Array.isArray(obj.rows)
    ? obj.rows
    : Array.isArray(raw)
    ? (raw as unknown[])
    : [];

  const rows: ParsedSpecRow[] = [];
  let dropped = 0;

  for (const item of specList) {
    if (rows.length >= MAX_SPEC_ROWS_PER_PAGE) {
      dropped += 1;
      continue;
    }
    const entry = asObject(item);
    const kind = textOf(entry.kind ?? entry.type, 20).toLowerCase() as SpecKind;
    if (!(SPEC_KINDS as readonly string[]).includes(kind)) {
      dropped += 1;
      continue;
    }

    // The value is its own object; when the model puts the fields straight on the row, the row is the value.
    // An EMPTY value object is still a value object: it must not fall back to the row and become "[object Object]".
    const hasValue = entry.value !== undefined && entry.value !== null;
    const valueRaw = asObject(entry.value);
    const flatValue = hasValue ? valueRaw : entry;

    let key = keyOf(kind, entry, textOf(flatValue.position, 40));
    if (!key) {
      dropped += 1;
      continue;
    }

    let value: Record<string, unknown> | null = null;
    if (kind === "tyre") value = tyreValue(flatValue);
    else if (kind === "bulb") value = bulbValue(flatValue);
    else value = scalarValue(flatValue);

    if (!value) {
      dropped += 1;
      continue;
    }

    const unknownBulb = kind === "bulb" && String(value.bulb_ref ?? "") === "Unknown";
    const readConfidence = confidenceOf(entry.confidence);
    let appliesTo = cleanAppliesTo(entry.applies_to ?? entry.appliesTo ?? entry.remark);

    // Six interior lamps share one position name ("Interior"), and a bulb table stores one row per position: the
    // page's own location remark becomes part of the position, so six lamps stay six rows instead of one.
    if (kind === "bulb" && appliesTo) {
      key = `${key} — ${appliesTo}`.slice(0, 80);
      appliesTo = null;
    }

    rows.push({
      kind,
      key,
      value,
      appliesTo,
      // A lamp the page prints nothing for is a question for the owner, whatever the model's own confidence.
      confidence: unknownBulb ? "medium" : readConfidence,
    });
  }

  // An owner's manual page may also print an interval (tyre rotation, cabin filter): the interval reader's own
  // parser reads that list, so the two kinds of row are stored the same way they always were.
  const intervalRaw = Array.isArray(obj.intervals) ? { rows: obj.intervals } : null;
  const parsedIntervals = intervalRaw ? parseManualPage(intervalRaw) : { rows: [], dropped: 0 };

  return {
    rows,
    intervals: parsedIntervals.rows,
    dropped: dropped + parsedIntervals.dropped,
  };
}

export function buildSpecsPagePrompt(args: { pageNo: number; manualTitle: string; market: string }): string {
  const title = String(args.manualTitle ?? "").trim().slice(0, 160) || "this car's owner's manual";
  return [
    `You are reading page ${args.pageNo} of ${title} (market ${args.market}).`,
    "This is an OWNER'S MANUAL. Pull out the car's numbers: fluids and their capacities, fuel, tyres and",
    "pressures, the battery, and every bulb. Also return any replacement interval the page prints.",
    "",
    "Return JSON only, in this exact shape:",
    '{"specs":[{"kind":"fluid"|"tyre"|"battery"|"bulb"|"fuel","key":"<see the key list>",',
    '"value":{...},"applies_to":"<the page\'s own remark, or null>","confidence":"high"|"medium"|"low"}],',
    '"intervals":[{"part":"<part name in English>","normal_km":<number or null>,',
    '"normal_months":<number or null>,"severe_km":<number or null>,"severe_months":<number or null>,',
    '"one_figure":<true or false>,"first_km":<number or null>,"first_months":<number or null>,',
    '"confidence":"high"|"medium"|"low"}]}',
    "",
    "Keys, and what their value looks like:",
    '- fluid "engine_oil_capacity_l": {"value":2.9,"unit":"L"}. Oil only, without the filter.',
    '- fluid "engine_oil_capacity_with_filter_l": {"value":3.1,"unit":"L"}. With the filter changed.',
    '- fluid "engine_oil_grade": {"value":"0W-20","also":["5W-30"]}. The maker\'s grade first, then any grade',
    "  it allows. If the page gives a different grade per engine or per market, return one row per grade with",
    '  applies_to saying which (for example "1KR-FE").',
    '- fluid "coolant_capacity_l": {"value":4.4,"unit":"L"}. One row per engine when the page gives two.',
    '- fluid "coolant_type": {"value":"Toyota Super Long Life Coolant"}.',
    '- fluid "transmission_fluid_capacity_l", "transfer_oil_capacity_l", "differential_oil_capacity_l",',
    '  "washer_capacity_l": {"value":5.8,"unit":"L"}.',
    '- fluid "transmission_fluid", "transfer_oil_grade", "differential_oil_grade", "washer_fluid",',
    '  "brake_fluid": {"value":"CVT Fluid FE"} / {"value":"Hypoid Gear Oil SX 85W-90"} /',
    '  {"value":"Toyota Super Long Life Coolant"} / {"value":"DOT 3"}.',
    '- fuel "fuel_tank_capacity": {"value":36,"unit":"L"}. One row per drive when the page gives two, with',
    '  applies_to "2WD" or "4WD".',
    '- fuel "fuel_grade": {"value":"Regular unleaded"}.',
    '- battery "battery_jis": {"value":"M-42","note":"N-55 on cars with the electric parking brake"}.',
    '  When the page prints two sizes, the main value is the one for the ordinary car and the note names the',
    "  other and what selects it.",
    '- battery "battery_type": {"value":"EFB"} only when the page prints the type.',
    '- tyre "front" / "rear" / "spare": {"size":"165/65R14","load_speed_index":"79S","wheel_size":"14x5J",',
    '  "pressure_kpa":260,"is_optional":false}. One row per size. The optional size is is_optional true; the',
    "  spare is its own row with its own pressure.",
    '- bulb "<the maker\'s lamp position>": {"bulb_ref":"H4","wattage_w":"60/55","is_led":false}. One row per',
    "  lamp position the page lists. Keep the maker's position words in English (Headlamp, Front turn signal,",
    '  Side turn signal, Rear turn signal, Back-up lamp, Licence plate lamp, Interior).',
    "",
    "Rules:",
    "- The unit lives in the column header, never in the number. 2.9 in a リットル column is 2.9 L.",
    "- One printed row is one object. When a value is printed twice for two engines or two drives, return two",
    "  objects with different applies_to.",
    '- applies_to is the page\'s remark in English and short: "2WD", "4WD", "1KR-FE", "1KR-VET", "Turbo",',
    '  "Except turbo", "with the electric parking brake". Use null when the row has no remark.',
    "- A lamp position printed with NO bulb number (a dash or an empty cell): keep the row, with bulb_ref null",
    "  and is_led true, because on these pages an unlisted lamp is an LED. Do not drop the position.",
    '- A page that says every other lamp is LED: say so in the row\'s grade_note ("Any lamp not listed is LED").',
    "- Intervals: only rows that print a replacement interval. The unit comes from the column header; convert",
    "  years to months and thousand-km to km. Use the same rules as a maintenance table.",
    "- Skip feature descriptions, warnings, fuse layouts, and anything that is not a number for this car.",
    "- confidence is high when the page is typed and clear, medium when part of it is unclear, low when you had",
    "  to guess.",
    "- Answer with the JSON object only: no prose, no markdown, no code fence.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Which versions a value is pre-ticked for (DOC-10)
// ---------------------------------------------------------------------------

export type SpecVersion = {
  id: string;
  /** The catalogue row in plain words, e.g. "2021-2024 · 2WD · 1KR-FE". */
  label: string;
  /** First and last model year of the version (null end = still made). */
  yearFrom?: number | null;
  yearTo?: number | null;
  drivetrain?: string | null;
  engineType?: string | null;
  trim?: string | null;
};

function flat(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function wordsOf(version: SpecVersion): string {
  return flat([version.label, version.drivetrain, version.engineType, version.trim].filter(Boolean).join(" "));
}

/**
 * The versions a printed remark points at, so the check screen opens with the right boxes ticked. A remark Roam
 * cannot place ticks every version of the family — the owner can always change it — and says it was unsure.
 */
export function tickVersions(
  appliesTo: string | null,
  versions: SpecVersion[],
): { ids: string[]; resolved: boolean } {
  const all = versions.map((v) => v.id);
  const note = flat(appliesTo);
  if (!note) return { ids: all, resolved: true };
  if (!versions.length) return { ids: [], resolved: false };

  const matching = (test: (words: string) => boolean) =>
    versions.filter((v) => test(wordsOf(v))).map((v) => v.id);

  if (/\b4wd\b|\bawd\b|four wheel/.test(note)) {
    const ids = matching((w) => /\b4wd\b|\bawd\b|four wheel/.test(w));
    return ids.length ? { ids, resolved: true } : { ids: all, resolved: false };
  }
  if (/\b2wd\b|\bfwd\b|front wheel/.test(note)) {
    const ids = matching((w) => /\b2wd\b|\bfwd\b|front wheel/.test(w));
    return ids.length ? { ids, resolved: true } : { ids: all, resolved: false };
  }

  if (/turbo/.test(note)) {
    const exceptTurbo = /except|without|non turbo|non-turbo/.test(note);
    const ids = matching((w) => (/turbo/.test(w) ? !exceptTurbo : exceptTurbo));
    return ids.length ? { ids, resolved: true } : { ids: all, resolved: false };
  }

  // An engine code or a trim the label already carries ("1KR-FE", "Facelift"). Every word of the remark has to
  // be in the version's own words, so "1KR-VET" never ticks a 1KR-FE car just because both start with 1KR.
  const noteWords = note.split(" ").filter((w) => w.length >= 3);
  if (noteWords.length) {
    const ids = matching((w) => noteWords.every((word) => w.includes(word)));
    if (ids.length) return { ids, resolved: true };
  }

  return { ids: all, resolved: false };
}

/**
 * The rows the page-spec writer stores: the parsed value, the versions pre-ticked from the page's own remark, and
 * a plain note when a person still has to decide. A value whose remark could not be placed is `uncertain`, so
 * "approve all" leaves it alone.
 */
export function buildSpecDraftRows(args: {
  parsed: ParsedSpecRow[];
  versions: SpecVersion[];
}): Array<ParsedSpecRow & { version_ids: string[]; draft_note: string | null }> {
  const out: Array<ParsedSpecRow & { version_ids: string[]; draft_note: string | null }> = [];
  const seen = new Set<string>();

  for (const row of args.parsed) {
    const fingerprint = JSON.stringify([row.kind, row.key, row.appliesTo, row.value]);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    // A tyre size and a lamp position belong to the whole family until the owner narrows them: the page's remark
    // on those rows ("Standard tyre", "Halogen headlamp equipped vehicles") is information, not a version.
    const tick = row.kind === "tyre" || row.kind === "bulb"
      ? { ids: args.versions.map((v) => v.id), resolved: true }
      : tickVersions(row.appliesTo, args.versions);
    const notes: string[] = [];
    if (!tick.resolved) {
      notes.push(
        `The page says "${row.appliesTo}" - Roam could not tell which versions that is, so every version is ticked.`,
      );
    }
    if (row.confidence === "low") notes.push("The page was hard to read - check this value.");

    out.push({
      ...row,
      version_ids: tick.ids,
      // `confidence` arrives as high/medium/low; the spec row stores likely/uncertain.
      confidence: tick.resolved && row.confidence !== "low" ? "likely" : "uncertain",
      draft_note: notes.length ? notes.join(" ") : null,
    } as unknown as ParsedSpecRow & { version_ids: string[]; draft_note: string | null });
  }

  return out;
}

/**
 * The versions a document's years cover: a version counts when it STARTS inside the document's years, so a
 * 2021 book (2020 onward) never ticks the 2016–2020 cars that merely end in 2020. No years on the document, or
 * nothing left after the filter: every version stays, and the owner narrows it on the check screen.
 */
export function versionsInYears(versions: SpecVersion[], yearFrom: number | null, yearTo: number | null): SpecVersion[] {
  if (yearFrom == null && yearTo == null) return versions;
  const kept = versions.filter((v) => {
    if (v.yearFrom == null) return true;
    if (yearFrom != null && v.yearFrom < yearFrom) return false;
    if (yearTo != null && v.yearFrom > yearTo) return false;
    return true;
  });
  return kept.length ? kept : versions;
}
