/**
 * Step 3 — the owner's manual reader: the prompt and the strict schema for one page of a maintenance table.
 *
 * DeepSeek reads the one-page PDF itself (typed text and scanned pictures alike); Gemini can read the same page
 * as the check. Both get this prompt and go through the same `parseManualPage`, so their rows are read the same
 * way. Anything that does not fit the shape is dropped and counted; the page job keeps that count so a badly
 * scanned page is visible instead of silent.
 *
 * What the prompt has to spell out, because a real page got it wrong (Roomy, page 5):
 *   - the UNIT lives in the column header, not in the number. "15" under 単位：年 is 15 years (180 months), and
 *     "200" under 交換:千km is 200 thousand km. Turning those numbers straight into the fields was the bug.
 *   - 〔〕 and 「」 are not the same bracket: 〔x〕 is the first-time interval, 「x」 is the severe-condition one.
 *     Putting the coolant's 〔160〕 into severe_km was the bug.
 *   - one printed line is one row. A part printed twice for turbo and non-turbo cars is two rows; merging them
 *     was the bug.
 *
 * The pages are often Japanese, so the prompt asks for the part name in English: the reader's matches and the
 * owner's screen are English, and a Japanese name would land as "no part type matched".
 *
 * Keep the field names in the prompt and in `parseManualPage` in step with each other.
 */

export type ManualRowConfidence = "high" | "medium" | "low";

/** One maintenance-table row as printed, already made safe to store. */
export type ParsedManualRow = {
  /** The part name in English (a Japanese page is translated, see the prompt), trimmed, one line. */
  partAsPrinted: string;
  /**
   * The printed remark that decides which car the row is for ("Except turbo", "Turbo", "CVT, turbo"), or null.
   * It keeps the two engine lines of one part apart, and the owner sees it on the draft.
   */
  appliesTo: string | null;
  normalKm: number | null;
  normalMonths: number | null;
  severeKm: number | null;
  severeMonths: number | null;
  /** The page prints no severe figure for this row (the same interval applies to every car). */
  oneFigure: boolean;
  /** The first-service figure, when the table prints one. */
  firstKm: number | null;
  firstMonths: number | null;
  confidence: ManualRowConfidence;
};

export type ParsedManualPage = {
  rows: ParsedManualRow[];
  /** Rows the model returned that could not be used (no part name, or no number at all). */
  dropped: number;
};

/** A maintenance table page rarely prints more than this; a bigger answer is a sign of a confused read. */
export const MANUAL_MAX_ROWS_PER_PAGE = 60;
const MAX_PART_NAME = 120;
const MAX_APPLIES_TO = 60;
const MAX_KM = 1_000_000;
const MAX_MONTHS = 600;

export function buildManualPagePrompt(args: {
  pageNo: number;
  manualTitle: string;
  market: string;
}): string {
  const title = String(args.manualTitle ?? "").trim().slice(0, 160) || "this car's owner's manual";
  return [
    `You are reading page ${args.pageNo} of the maintenance table in ${title} (market ${args.market}).`,
    "Return JSON only, in this exact shape:",
    '{"rows":[{"part":"<part name in English>","applies_to":"<remark, or null>",',
    '"normal_km":<number or null>,"normal_months":<number or null>,',
    '"severe_km":<number or null>,"severe_months":<number or null>,"one_figure":<true or false>,',
    '"first_km":<number or null>,"first_months":<number or null>,"confidence":"high"|"medium"|"low"}]}',
    "",
    "Rules:",
    "- EVERY printed replacement row is one object. Read every row of every table on the page that gives a",
    "  replacement interval, including a second replacement table further down the page.",
    "- One object per printed line. When one part is printed on two lines because the remark differs (turbo /",
    "  except turbo, CVT / not CVT), return two objects, each with its own numbers and its own applies_to.",
    "  Never merge two printed lines into one row.",
    "- The unit comes from the column header, never from the number. A years column (年, 単位：年) counts",
    "  YEARS: multiply by 12 and put MONTHS in the months fields. A distance column (千km) counts THOUSANDS of",
    "  kilometres: multiply by 1000 and put KILOMETRES in the km fields. 15 in a years column is 180 months,",
    "  not 15 months. 200 in a 千km column is 200000. A decimal in a 千km column is thousands too: 7.5 is 7500.",
    "- The two brackets mean different things, as the page's own note says. They look alike, so read the",
    "  glyph: 〔x〕 is the corner bracket 乗用車初回 (first time for a passenger car) -> first_km / first_months.",
    "  「x」 is the quotation bracket シビアコンディション時 (severe conditions) -> severe_km / severe_months.",
    "  Never put a 〔x〕 number in a severe field, and never put a 「x」 number in a first field.",
    "  A first-time figure is often LARGER than the regular one (a new car's first coolant change comes later),",
    "  so a bracketed figure larger than the plain one is still a first-time figure when it is in 〔 〕.",
    "  A cell can hold a plain number and a bracketed one: 80〔160〕 is normal 80000 km and first 160000 km;",
    "  15「7.5」 is normal 15000 km and severe 7500 km; 「100」 alone is a severe 100000 km and no normal figure.",
    "- A figure printed once for a part that has two lines (level with the part name, not on either line)",
    "  applies to BOTH lines. A years figure printed once beside a two-line part is that part's interval for",
    "  the turbo line and the non-turbo line alike.",
    "- A line that holds only numbers and a bracket, with no part name, belongs to the part named on the line",
    "  above it. When a part's own line carries a years figure (for example エンジンオイル 1), that figure is",
    "  that part's interval and applies to every line of that part.",
    "- applies_to is the remark column (備考) in English and short: \"Except turbo\", \"Turbo\",",
    "  \"CVT, except turbo\", \"CVT, turbo\". Use null when the row has no remark.",
    "- Numbers are the converted whole numbers (integer km, integer months). Use null for a figure the page does",
    "  not print for that row. Never guess a number and never carry a number over from another row or page.",
    "- one_figure is true when the row prints no 「」 severe figure at all, so the same interval applies to",
    "  every car. It is false when the row prints a 「」 figure.",
    "- The page may be printed in Japanese (or another language). The part name must come back in English:",
    "  translate the maker's part name (エンジンオイル -> Engine oil, ブレーキホース -> Brake hose). Keep the",
    "  maker's own wording; do not rename the part to a different part, and keep the numbers out of the name.",
    "- Skip table headers, notes, footnotes, prices, and the tables that list inspection points or severe-driving",
    "  conditions (A-F): they print no replacement interval.",
    "- confidence is high when the page is typed and every figure is clear, medium when part of it is unclear,",
    "  and low when you had to guess.",
    "- Answer with the JSON object only: no prose, no markdown, no code fence.",
  ].join("\n");
}

/**
 * The prompt for a page whose own text we already have (see `maintenance_manual_text.ts`): the same rules, with
 * the page's characters below them. The characters matter — the printed brackets 〔 and 「 look the same in the
 * manual's font, and only the text layer says which one is which.
 */
export function appendManualPageText(prompt: string, pageText: string): string {
  const text = String(pageText ?? "").trim();
  if (!text) return prompt;
  return [
    prompt,
    "",
    "The page's own text, in reading order, is below. One printed line is one line; a row may wrap onto the",
    "next line. Read the characters exactly as they are here.",
    "--- BEGIN PAGE TEXT ---",
    text,
    "--- END PAGE TEXT ---",
  ].join("\n");
}

/** A whole number of kilometres or months, or null. Accepts "10,000", "10000 km", "6 months". */
function toCount(value: unknown, max: number): number | null {
  if (value == null) return null;
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else {
    const text = String(value).trim().toLowerCase().replace(/,/g, "");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    n = Number(match[0]);
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.round(n);
  if (whole <= 0 || whole > max) return null;
  return whole;
}

function toText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_PART_NAME);
}

/** The remark, with the "null"/"-" a model writes for an empty cell treated as absent. */
function toAppliesTo(value: unknown): string | null {
  const text = toText(value).replace(/^["']|["']$/g, "").trim();
  if (!text || /^(null|none|n\/?a|-+|—)$/i.test(text)) return null;
  return text.slice(0, MAX_APPLIES_TO);
}

function toBool(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "true" || t === "yes") return true;
    if (t === "false" || t === "no") return false;
  }
  return false;
}

function toConfidence(value: unknown): ManualRowConfidence {
  const t = String(value ?? "").trim().toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  return "low";
}

function rowsFrom(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.rows ?? obj.items ?? obj.result;
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * Turn the model's answer into rows we can store. A row is kept when it names a part and prints at least one
 * number; everything else is counted as dropped.
 *
 * `oneFigure` is kept true only when the row really prints no severe figure: a row with severe numbers is never
 * "one figure", and a row without them always is (there is nothing else a hard-use car could use). That keeps
 * the stored flag and the stored numbers from contradicting each other when the model is sloppy.
 */
export function parseManualPage(raw: unknown): ParsedManualPage {
  const list = rowsFrom(raw);
  const rows: ParsedManualRow[] = [];
  let dropped = 0;

  for (const item of list) {
    if (rows.length >= MANUAL_MAX_ROWS_PER_PAGE) {
      dropped += 1;
      continue;
    }
    if (!item || typeof item !== "object") {
      dropped += 1;
      continue;
    }
    const row = item as Record<string, unknown>;
    const partAsPrinted = toText(row.part ?? row.part_name ?? row.partName ?? row.name);
    const oneFigure = toBool(row.one_figure ?? row.oneFigure);
    const parsed: ParsedManualRow = {
      partAsPrinted,
      appliesTo: toAppliesTo(row.applies_to ?? row.appliesTo ?? row.remark ?? row.note),
      normalKm: toCount(row.normal_km ?? row.normalKm, MAX_KM),
      normalMonths: toCount(row.normal_months ?? row.normalMonths, MAX_MONTHS),
      severeKm: toCount(row.severe_km ?? row.severeKm, MAX_KM),
      severeMonths: toCount(row.severe_months ?? row.severeMonths, MAX_MONTHS),
      oneFigure,
      firstKm: toCount(row.first_km ?? row.firstKm, MAX_KM),
      firstMonths: toCount(row.first_months ?? row.firstMonths, MAX_MONTHS),
      confidence: toConfidence(row.confidence),
    };

    // One figure means one figure: the severe columns stay empty, so a hard-use car uses the normal numbers.
    if (parsed.oneFigure) {
      parsed.severeKm = null;
      parsed.severeMonths = null;
    } else if (parsed.severeKm == null && parsed.severeMonths == null) {
      // No severe figure printed for this row: the normal interval is the one every car uses.
      parsed.oneFigure = true;
    }

    const hasAnyNumber = parsed.normalKm != null || parsed.normalMonths != null ||
      parsed.severeKm != null || parsed.severeMonths != null ||
      parsed.firstKm != null || parsed.firstMonths != null;

    if (!parsed.partAsPrinted || !hasAnyNumber) {
      dropped += 1;
      continue;
    }
    rows.push(parsed);
  }

  return { rows, dropped };
}
