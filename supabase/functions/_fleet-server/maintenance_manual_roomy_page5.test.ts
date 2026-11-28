/**
 * The real Roomy booklet, page 5 (manual 155b08f1-d9f7-43b1-98b5-8df29d2dcd31, "Toyota Roomy — Maintenance list
 * (Japan, June 2021)"). This is the page the reader got wrong: 8 rows instead of 15, the brake hose's 15 years
 * saved as 15 months, the coolant's 〔160〕 saved as a severe km, and three part types matched to the wrong part.
 *
 * The expected rows below are the BOOKLET's, not a model's answer: every test here would fail if the reader, the
 * schema or the matching drifted back. The page's own text items are real (copied from the PDF's text layer), so
 * the line grouping and the two bracket characters are tested without shipping the PDF.
 *
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_roomy_page5.test.ts
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { DEEPSEEK_VISION_MODEL } from "./deepseek_models.ts";
import { buildDraftRows } from "./maintenance_manual_draft.ts";
import type { CategoryRow } from "./maintenance_manual_match.ts";
import {
  buildManualPagePrompt,
  parseManualPage,
  type ParsedManualRow,
} from "./maintenance_manual_prompt.ts";
import {
  callDeepSeekManualPageReader,
  DEEPSEEK_API_BASE,
  ManualReaderJsonError,
} from "./maintenance_manual_reader.ts";
import { groupTextItems, isTypedPageText } from "./maintenance_manual_text.ts";

const MANUAL_ID = "155b08f1-d9f7-43b1-98b5-8df29d2dcd31";
const PAGE_NO = 5;

// ---------------------------------------------------------------------------
// The page's own text items (real, from the PDF), and the lines they make
// ---------------------------------------------------------------------------

/**
 * A text run as pdf.js reports it: `transform[5]` is the baseline. Only the runs that matter are kept — the
 * header that carries the units, the engine oil lines (one part, two engines, one years figure), and the coolant
 * line (the two brackets that look the same but are not).
 */
function item(str: string, y: number, x = 0) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

const PAGE_ITEMS = [
  // The table's header: these two runs carry the units every number is in.
  item("定期交換部品項目", 510.84, 108.85),
  item("備考", 510.84, 353.98),
  item("年ごと交換", 510.42, 225.31),
  item("単位", 500.42, 231.3),
  item("：", 500.42, 244.34),
  item("年", 500.42, 249.38),
  item("走行キロごと", 510.42, 268.38),
  item("交換:千", 500.42, 272.08),
  item("ｋ", 500.42, 296.38),
  item("m", 500.42, 302.6),
  // The rows, exactly as the text layer has them.
  item("ブレーキホース", 489.59, 59.51),
  item(" ", 489.59, 113.41),
  item("15", 489.59, 238.27),
  item(" ", 489.59, 250.42),
  item("200", 489.59, 282.01),
  item("ブレーキ液", 478.76, 59.51),
  item(" ", 478.76, 98.16),
  item("2", 478.76, 234.27),
  item("〔3〕", 478.76, 236.34),
  item("トランスミッションオイル及び", 467.93, 58.09),
  item("トランスファオイ", 467.93, 158.68),
  item("ル", 457.93, 59.98),
  item(" ", 457.93, 67.98),
  item("100", 462.93, 282.01),
  item("ディファレンシャルオイル", 447.09, 59.74),
  item(" ", 447.09, 146.54),
  item("2", 447.09, 234.27),
  item("〔3〕", 447.09, 236.34),
  item(" ", 447.09, 258.42),
  item("40", 447.09, 285.04),
  item("オー", 430.85, 59.65),
  item("トマチック", 430.85, 73.63),
  item("トランスミッションオイル", 430.85, 107.86),
  item(" ", 430.85, 194.63),
  item("50", 436.26, 285.04),
  item(" ", 436.26, 297.18),
  item("CVT車", 436.26, 318.04),
  item("（ターボ車を除く）", 436.26, 339.66),
  item("「100」", 425.43, 274),
  item(" ", 425.43, 308.22),
  item("CVT車", 425.43, 318.04),
  item("（ターボ車）", 425.43, 339.66),
  item("エアクリーナエレメン", 414.6, 59.73),
  item("ト", 414.6, 131.69),
  item(" ", 414.6, 139.69),
  item("50", 414.6, 274.67),
  item("「25」", 414.6, 283.11),
  item("エンジンオイル", 398.35, 59.73),
  item(" ", 398.35, 113.01),
  item("1", 398.35, 241.3),
  item(" ", 398.35, 247.38),
  item("15", 403.77, 273.63),
  item("「7.5」", 403.77, 282.07),
  item(" ", 403.77, 312.29),
  item("ターボ車を除く", 403.77, 317.82),
  item("10", 392.93, 273.63),
  item("「5.0」", 392.93, 282.07),
  item(" ", 392.93, 312.29),
  item("ターボ車", 392.93, 317.82),
  item("オイルクリーナ", 376.68, 59.65),
  item(" ", 376.68, 112.49),
  item("15", 382.09, 273.63),
  item("「7.5」", 382.09, 282.07),
  item(" ", 382.09, 312.29),
  item("ターボ車を除く", 382.09, 317.82),
  item("10", 371.26, 273.63),
  item("「5.0」", 371.26, 282.07),
  item(" ", 371.26, 312.29),
  item("ターボ車", 371.26, 317.82),
  item("冷却水", 360.43, 59.87),
  item("（LLC)", 360.43, 79.87),
  item(" ", 360.43, 106.98),
  item("4", 360.43, 234.26),
  item("〔7〕", 360.43, 236.34),
  item(" ", 360.43, 258.41),
  item("80", 360.43, 271.93),
  item("〔160〕", 360.43, 280.07),
  item("タイミングベル", 349.6, 59.65),
  item("ト", 349.6, 111),
  item(" ", 349.6, 119),
  item("100", 349.6, 282),
  item("フューエルフィルター", 338.77, 59.47),
  item(" ", 338.77, 134.26),
  item("100", 338.77, 282),
  item("点火プラグ", 327.93, 59.87),
  item("（白金ﾌﾟﾗｸﾞ､ｲﾘｼﾞｳﾑﾌﾟﾗｸﾞ）", 327.93, 94.29),
  item(" ", 327.93, 194.29),
  item("200", 327.93, 282),
];

const PAGE_TEXT = groupTextItems(PAGE_ITEMS).join("\n");

// ---------------------------------------------------------------------------
// The booklet's rows
// ---------------------------------------------------------------------------

type BookletRow = [
  part: string,
  remark: string | null,
  km: number | null,
  months: number | null,
  severeKm: number | null,
  firstKm: number | null,
  firstMonths: number | null,
];

/** The 15 printed lines of 点検整備方式（交換時期）, already converted: years ×12, 千km ×1000. */
const BOOKLET: BookletRow[] = [
  ["Brake hose", null, 200000, 180, null, null, null],
  ["Brake fluid", null, null, 24, null, null, 36],
  ["Transmission oil and transfer oil", null, 100000, null, null, null, null],
  ["Differential oil", null, 40000, 24, null, null, 36],
  ["Automatic transmission oil", "CVT, except turbo", 50000, null, null, null, null],
  ["Automatic transmission oil", "CVT, turbo", null, null, 100000, null, null],
  ["Air cleaner element", null, 50000, null, 25000, null, null],
  ["Engine oil", "Except turbo", 15000, 12, 7500, null, null],
  ["Engine oil", "Turbo", 10000, 12, 5000, null, null],
  ["Oil cleaner", "Except turbo", 15000, null, 7500, null, null],
  ["Oil cleaner", "Turbo", 10000, null, 5000, null, null],
  ["Coolant (LLC)", null, 80000, 48, null, 160000, 84],
  ["Timing belt", null, 100000, null, null, null, null],
  ["Fuel filter", null, 100000, null, null, null, null],
  ["Spark plug (platinum plug, iridium plug)", null, 200000, null, null, null, null],
];

function bookletRow(row: BookletRow): ParsedManualRow {
  const [part, remark, km, months, severeKm, firstKm, firstMonths] = row;
  return {
    partAsPrinted: part,
    appliesTo: remark,
    normalKm: km,
    normalMonths: months,
    severeKm,
    severeMonths: null,
    // A row with no severe figure is one figure: the same interval applies to every car.
    oneFigure: severeKm == null,
    firstKm,
    firstMonths,
    confidence: "high",
  };
}

/** A correct read of the page, as the reader must answer it (the JSON the prompt asks for). */
const GOOD_ANSWER = {
  rows: BOOKLET.map((row) => ({
    part: row[0],
    applies_to: row[1],
    normal_km: row[2],
    normal_months: row[3],
    severe_km: row[4],
    severe_months: null,
    one_figure: row[4] == null,
    first_km: row[5],
    first_months: row[6],
    confidence: "high",
  })),
};

/** The part types that exist in Roam for this family, by the names the page uses. */
const CATEGORIES: CategoryRow[] = [
  { id: "brake-hose", name: "Brake hose", code: "brake_hose" },
  { id: "brake-fluid", name: "Brake Fluid", code: "brake_fluid" },
  { id: "transmission", name: "Transmission Fluid", code: "transmission" },
  { id: "engine-oil", name: "Engine oil", code: "oil" },
  { id: "oil-filter", name: "Oil filter", code: "oil_filter" },
  { id: "timing-belt", name: "Timing Belt", code: "timing_belt" },
  { id: "fuel-filter", name: "Fuel filter", code: "fuel_filter" },
  { id: "spark-plugs", name: "Spark Plugs", code: "spark_plugs" },
  { id: "spark-plug-wires", name: "Spark Plug Wires", code: "spark_plug_wires" },
  { id: "coolant", name: "Coolant", code: "coolant_part" },
  { id: "air-cleaner-hose", name: "Air cleaner hose", code: "air_cleaner_hose" },
  { id: "air-cleaner-housing", name: "Air cleaner housing", code: "air_cleaner_housing" },
  { id: "air-cleaner-inlet", name: "Air cleaner inlet", code: "air_cleaner_inlet" },
  { id: "engine-air-filter", name: "Engine Air Filter", code: "air_filter" },
  { id: "fluids", name: "Fluids (Washer / Coolant)", code: "fluids" },
];

// ---------------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------------

Deno.test("the page's own text keeps 〔 first-time 〕 and 「 severe 」 apart", () => {
  // In the manual's font those two characters are drawn as the same corner. Only the text layer says which is
  // which, which is why the reader is given the text and not a picture of the table.
  if (!PAGE_TEXT.includes("冷却水（LLC) 4〔7〕 80〔160〕")) {
    throw new Error(`the coolant line was not read as printed:\n${PAGE_TEXT}`);
  }
  if (!PAGE_TEXT.includes("15「7.5」 ターボ車を除く")) {
    throw new Error(`the engine oil line was not read as printed:\n${PAGE_TEXT}`);
  }
  if (PAGE_TEXT.includes("〔160」") || PAGE_TEXT.includes("「160〕")) {
    throw new Error("the two brackets were mixed up");
  }
});

Deno.test("the header that carries the units is in the text, so the reader can see 年 and 千km", () => {
  if (!PAGE_TEXT.includes("単位：年")) throw new Error(`the years unit is missing:\n${PAGE_TEXT}`);
  if (!PAGE_TEXT.includes("交換:千ｋm")) throw new Error(`the distance unit is missing:\n${PAGE_TEXT}`);
});

Deno.test("a typed page is read as text; a page with no text layer is not", () => {
  assertEquals(isTypedPageText(PAGE_TEXT), true);
  assertEquals(isTypedPageText(""), false);
  assertEquals(isTypedPageText("Page 5"), false);
});

Deno.test("all 15 rows of the booklet are read, with the booklet's numbers", () => {
  const parsed = parseManualPage(GOOD_ANSWER);
  assertEquals(parsed.dropped, 0);
  assertEquals(parsed.rows, BOOKLET.map(bookletRow));
});

Deno.test("the brake hose's 15 years is 180 months, not 15", () => {
  const row = parseManualPage(GOOD_ANSWER).rows.find((r) => r.partAsPrinted === "Brake hose")!;
  assertEquals(row.normalMonths, 180);
  assertEquals(row.normalKm, 200000);
});

Deno.test("the coolant's 〔160〕 is a first-time km, never a severe one", () => {
  const row = parseManualPage(GOOD_ANSWER).rows.find((r) => r.partAsPrinted.startsWith("Coolant"))!;
  assertEquals(row.firstKm, 160000);
  assertEquals(row.severeKm, null);
  assertEquals(row.normalKm, 80000);
  assertEquals(row.firstMonths, 84);
  assertEquals(row.normalMonths, 48);
});

Deno.test("turbo and non-turbo stay two rows, each with its own engine note and numbers", () => {
  const oil = parseManualPage(GOOD_ANSWER).rows.filter((r) => r.partAsPrinted === "Engine oil");
  assertEquals(oil.map((r) => r.appliesTo), ["Except turbo", "Turbo"]);
  assertEquals(oil.map((r) => [r.normalKm, r.severeKm]), [[15000, 7500], [10000, 5000]]);
  // The single years figure beside the part name belongs to both lines.
  assertEquals(oil.map((r) => r.normalMonths), [12, 12]);
});

Deno.test("a row with no severe figure is stored as one figure, so a hard-use car still has an interval", () => {
  const brakeFluid = parseManualPage(GOOD_ANSWER).rows.find((r) => r.partAsPrinted === "Brake fluid")!;
  assertEquals(brakeFluid.oneFigure, true);
  assertEquals(brakeFluid.severeKm, null);
});

// ---------------------------------------------------------------------------
// The rows on the owner's screen
// ---------------------------------------------------------------------------

function drafts() {
  return buildDraftRows({
    manualId: MANUAL_ID,
    pageNo: PAGE_NO,
    parsed: parseManualPage(GOOD_ANSWER).rows,
    categories: CATEGORIES,
  });
}

function draftFor(name: string) {
  const found = drafts().rows.filter((row) => row.task_name === name);
  if (found.length !== 1) throw new Error(`expected one draft named ${name}, got ${found.length}`);
  return found[0];
}

Deno.test("every printed row becomes a draft: none is dropped for sharing a part type", () => {
  const built = drafts();
  assertEquals(built.rows.length, 15);
  assertEquals(built.duplicates, 0);
  // The two engine-oil lines and the two oil-filter lines would have collided on a truncated task code.
  assertEquals(new Set(built.rows.map((row) => row.task_code)).size, 15);
});

Deno.test("a spark plug is Spark Plugs, never Spark Plug Wires", () => {
  const draft = draftFor("Spark plug (platinum plug, iridium plug)");
  assertEquals(draft.component_id, "spark-plugs");
  assertEquals(draft.interval_km, 200000);
});

Deno.test("an air cleaner element is not an air cleaner hose: the part is left empty and needs checking", () => {
  const draft = draftFor("Air cleaner element");
  assertEquals(draft.component_id, null);
  assertEquals(draft.confidence, "uncertain");
  if (!draft.draft_note?.includes("No Roam part type matched")) {
    throw new Error(`expected no-part note, got ${draft.draft_note}`);
  }
});

Deno.test("transmission oil is Transmission Fluid, never Engine oil", () => {
  assertEquals(draftFor("Transmission oil and transfer oil").component_id, "transmission");
  assertEquals(draftFor("Automatic transmission oil (CVT, except turbo)").component_id, "transmission");
  assertEquals(draftFor("Automatic transmission oil (CVT, turbo)").component_id, "transmission");
});

Deno.test("an oil cleaner is the oil filter, and it keeps the book's 15,000/7,500 and 10,000/5,000", () => {
  const exceptTurbo = draftFor("Oil cleaner (Except turbo)");
  const turbo = draftFor("Oil cleaner (Turbo)");
  assertEquals(exceptTurbo.component_id, "oil-filter");
  assertEquals(turbo.component_id, "oil-filter");
  assertEquals([exceptTurbo.interval_km, exceptTurbo.severe_interval_km], [15000, 7500]);
  assertEquals([turbo.interval_km, turbo.severe_interval_km], [10000, 5000]);
});

Deno.test("a part the page splits by engine is never 'likely' (the owner picks the engine)", () => {
  for (const name of ["Engine oil (Except turbo)", "Engine oil (Turbo)", "Oil cleaner (Except turbo)", "Oil cleaner (Turbo)"]) {
    assertEquals(draftFor(name).confidence, "uncertain");
  }
});

Deno.test("the coolant draft carries the first-time 160,000 km as a first interval", () => {
  const draft = draftFor("Coolant (LLC)");
  assertEquals(draft.interval_km, 80000);
  assertEquals(draft.interval_months, 48);
  assertEquals(draft.first_interval_km, 160000);
  assertEquals(draft.first_interval_months, 84);
  assertEquals(draft.severe_interval_km, null);
  assertEquals(draft.severe_same_as_normal, true);
});

Deno.test("the brake hose draft is 200,000 km / 180 months", () => {
  const draft = draftFor("Brake hose");
  assertEquals(draft.interval_km, 200000);
  assertEquals(draft.interval_months, 180);
  assertEquals(draft.component_id, "brake-hose");
  assertEquals(draft.confidence, "likely");
});

// ---------------------------------------------------------------------------
// The reader: the page's text goes to DeepSeek instead of a picture of it
// ---------------------------------------------------------------------------

function fakeFetch(answer: unknown) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: String(init?.method ?? "GET").toUpperCase(), body: init?.body });
    return Promise.resolve(new Response(JSON.stringify(answer), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

Deno.test("a typed page is read from its text: no upload, and the prompt carries the page's characters", async () => {
  const { fetchImpl, calls } = fakeFetch({
    choices: [{ message: { content: JSON.stringify(GOOD_ANSWER) } }],
    usage: { prompt_tokens: 2031, completion_tokens: 962 },
  });
  const reader = callDeepSeekManualPageReader("sk-test", {
    fetchImpl,
    readText: () => Promise.resolve(PAGE_TEXT),
    guards: () => Promise.resolve(),
    log: () => Promise.resolve(),
  });

  const prompt = buildManualPagePrompt({ pageNo: PAGE_NO, manualTitle: "Toyota Roomy", market: "JP" });
  const raw = await reader({
    model: "unused",
    prompt,
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pageNo: PAGE_NO,
  });
  assertEquals(parseManualPage(raw).rows.length, 15);

  // Nothing was uploaded: the page's text is already exact, so there is no page parse to pay for.
  assertEquals(calls.filter((c) => c.url === `${DEEPSEEK_API_BASE}/files`).length, 0);
  const chat = calls.find((c) => c.url === `${DEEPSEEK_API_BASE}/chat/completions`)!;
  const body = JSON.parse(String(chat.body)) as {
    model: string;
    messages: Array<{ content: unknown }>;
    temperature: number;
    response_format: { type: string };
  };
  assertEquals(body.model, DEEPSEEK_VISION_MODEL);
  assertEquals(body.temperature, 0);
  assertEquals(body.response_format, { type: "json_object" });
  const content = body.messages[0].content;
  if (typeof content !== "string") throw new Error("a text page is sent as text, not as a file block");
  if (!content.includes(PAGE_TEXT)) throw new Error("the page's own text must be in the prompt");
  if (!content.includes("80〔160〕")) throw new Error("the coolant's exact brackets must reach the model");
  if (!content.includes("JSON only")) throw new Error("the prompt's rules must still be there");
});

Deno.test("a page with no text layer still goes through the uploaded PDF", async () => {
  const { fetchImpl, calls } = fakeFetch({ id: "file-api-9" });
  // One answer for the upload, one for the chat: the fake is told apart by URL below.
  const fetchWithChat = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${DEEPSEEK_API_BASE}/chat/completions`) {
      return Promise.resolve(new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(GOOD_ANSWER) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    }
    return fetchImpl(input, init);
  }) as typeof fetch;

  const reader = callDeepSeekManualPageReader("sk-test", {
    fetchImpl: fetchWithChat,
    readText: () => Promise.resolve(""),
    guards: () => Promise.resolve(),
    log: () => Promise.resolve(),
  });
  await reader({ model: "unused", prompt: "Read the page.", pdfBytes: new Uint8Array([1]), pageNo: PAGE_NO });

  assertEquals(calls.filter((c) => c.url === `${DEEPSEEK_API_BASE}/files`).length, 1);
});

Deno.test("an empty answer on a typed page is asked again, then the page falls back", async () => {
  const { fetchImpl, calls } = fakeFetch({ choices: [{ message: { content: "{\"rows\":[]}" } }] });
  const reader = callDeepSeekManualPageReader("sk-test", {
    fetchImpl,
    readText: () => Promise.resolve(PAGE_TEXT),
    guards: () => Promise.resolve(),
    log: () => Promise.resolve(),
  });

  const err = await assertRejects(() =>
    reader({ model: "unused", prompt: "Read the page.", pdfBytes: new Uint8Array([1]), pageNo: PAGE_NO })
  );
  if (!(err instanceof ManualReaderJsonError)) throw new Error(`expected a JSON problem, got ${err}`);
  assertEquals(calls.filter((c) => c.url === `${DEEPSEEK_API_BASE}/chat/completions`).length, 2);
});
