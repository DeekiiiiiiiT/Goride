/**
 * Step 3 — the manual page prompt and its strict schema.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_prompt.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildManualPagePrompt, parseManualPage } from "./maintenance_manual_prompt.ts";

Deno.test("a good row keeps its numbers, page part name, remark and confidence", () => {
  const parsed = parseManualPage({
    rows: [{
      part: "Engine oil and oil filter",
      applies_to: "Except turbo",
      normal_km: 10000,
      normal_months: 12,
      severe_km: 5000,
      severe_months: 6,
      one_figure: false,
      first_km: null,
      first_months: null,
      confidence: "high",
    }],
  });

  assertEquals(parsed.dropped, 0);
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0], {
    partAsPrinted: "Engine oil and oil filter",
    appliesTo: "Except turbo",
    normalKm: 10000,
    normalMonths: 12,
    severeKm: 5000,
    severeMonths: 6,
    oneFigure: false,
    firstKm: null,
    firstMonths: null,
    confidence: "high",
  });
});

Deno.test("an empty remark is no remark, however the model writes it", () => {
  const parsed = parseManualPage({
    rows: [
      { part: "Brake hose", applies_to: null, normal_km: 200000, normal_months: 180 },
      { part: "Brake fluid", applies_to: "", normal_months: 24 },
      { part: "Fuel filter", applies_to: "null", normal_km: 100000 },
      { part: "Timing belt", applies_to: "-", normal_km: 100000 },
    ],
  });
  assertEquals(parsed.rows.map((row) => row.appliesTo), [null, null, null, null]);
});

Deno.test("numbers written the way a manual prints them are read", () => {
  const parsed = parseManualPage({
    rows: [{
      part: "Brake fluid",
      normal_km: "40,000 km",
      normal_months: "24 months",
      confidence: "MEDIUM",
    }],
  });

  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].normalKm, 40000);
  assertEquals(parsed.rows[0].normalMonths, 24);
  assertEquals(parsed.rows[0].confidence, "medium");
});

Deno.test("a junk row is dropped and counted, never saved as a blank rule", () => {
  const parsed = parseManualPage({
    rows: [
      { part: "", normal_km: 10000, normal_months: 12 },
      { part: "Maintenance table", note: "km or months, whichever comes first" },
      { part: "Oil filter", normal_km: "not a number" },
      { part: "Spark plugs", normal_km: 100000, normal_months: 60 },
      "this is not an object",
    ],
  });

  assertEquals(parsed.dropped, 4);
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].partAsPrinted, "Spark plugs");
});

Deno.test("a one-figure row carries no severe numbers, so a hard-use car uses the normal ones", () => {
  const parsed = parseManualPage({
    rows: [{
      part: "Engine oil",
      normal_km: 15000,
      normal_months: 12,
      severe_km: 7500,
      severe_months: 6,
      one_figure: true,
      confidence: "high",
    }],
  });

  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].oneFigure, true);
  assertEquals(parsed.rows[0].severeKm, null);
  assertEquals(parsed.rows[0].severeMonths, null);
});

Deno.test("a first-time row keeps the first-service figures apart from the normal ones", () => {
  const parsed = parseManualPage({
    rows: [{
      part: "Manual transmission oil",
      normal_km: 40000,
      normal_months: 24,
      first_km: 1000,
      first_months: 1,
      one_figure: false,
      confidence: "high",
    }],
  });

  assertEquals(parsed.rows[0].firstKm, 1000);
  assertEquals(parsed.rows[0].firstMonths, 1);
  assertEquals(parsed.rows[0].normalKm, 40000);
});

Deno.test("an answer with no rows at all is empty, not an error", () => {
  assertEquals(parseManualPage({ rows: [] }).rows.length, 0);
  assertEquals(parseManualPage(null).rows.length, 0);
  assertEquals(parseManualPage("not json").rows.length, 0);
});

Deno.test("a bare array is accepted (some answers skip the wrapper)", () => {
  const parsed = parseManualPage([{ part: "Coolant", normal_km: 50000, normal_months: 48 }]);
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].partAsPrinted, "Coolant");
});

Deno.test("the prompt names the page, asks for JSON only and forbids guessing", () => {
  const prompt = buildManualPagePrompt({ pageNo: 214, manualTitle: "Roomy owner's manual", market: "JM" });
  if (!prompt.includes("page 214")) throw new Error("the page number must be in the prompt");
  if (!prompt.includes("JSON only")) throw new Error("the answer must be JSON only");
  if (!prompt.toLowerCase().includes("never guess")) throw new Error("the prompt must forbid guessing");
  if (!prompt.includes("one_figure")) throw new Error("the one-figure flag must be asked for");
  if (!prompt.includes("first_km")) throw new Error("the first-time interval must be asked for");
});

Deno.test("the prompt says the unit comes from the column header, with both brackets spelled out", () => {
  const prompt = buildManualPagePrompt({ pageNo: 5, manualTitle: "Roomy owner's manual", market: "JP" });
  if (!prompt.includes("単位：年")) throw new Error("the prompt must name the years header");
  if (!prompt.includes("千km")) throw new Error("the prompt must name the 千km header");
  if (!prompt.includes("multiply by 12")) throw new Error("years must be turned into months");
  if (!prompt.includes("multiply by 1000")) throw new Error("千km must be turned into kilometres");
  if (!prompt.includes("〔x〕")) throw new Error("the first-time bracket must be named");
  if (!prompt.includes("「x」")) throw new Error("the severe bracket must be named");
  if (!prompt.includes("first_km")) throw new Error("a first-time number must have somewhere to go");
});

Deno.test("the prompt asks for one row per printed line and a remark per row", () => {
  const prompt = buildManualPagePrompt({ pageNo: 5, manualTitle: "Roomy owner's manual", market: "JP" });
  if (!prompt.includes("One object per printed line")) throw new Error("two printed lines must stay two rows");
  if (!prompt.includes("applies_to")) throw new Error("the printed remark must be asked for");
  if (!prompt.includes("Never merge")) throw new Error("merging two printed lines must be forbidden");
});

Deno.test("a row with no severe figure becomes one figure, whatever the model said", () => {
  const parsed = parseManualPage({
    rows: [{
      part: "Brake fluid",
      normal_months: 24,
      severe_km: null,
      severe_months: null,
      one_figure: false,
      first_months: 36,
    }],
  });
  assertEquals(parsed.rows[0].oneFigure, true);
});

Deno.test("the prompt says the page may be Japanese and the part names must come back in English", () => {
  const prompt = buildManualPagePrompt({ pageNo: 4, manualTitle: "Roomy owner's manual", market: "JP" });
  if (!prompt.includes("Japanese")) throw new Error("the prompt must say the page may be Japanese");
  if (!prompt.includes("English")) throw new Error("the prompt must ask for English part names");
  if (!prompt.includes("translate")) throw new Error("the prompt must ask for the name to be translated");
  if (!prompt.includes("エンジンオイル")) throw new Error("the prompt must show a Japanese-to-English example");
});

Deno.test("a Japanese name that the model leaves untranslated is kept, not silently dropped", () => {
  // The reader is told to answer in English; if it disobeys, the row is still stored so the owner sees it and the
  // match step marks it needs checking, instead of the page looking empty.
  const parsed = parseManualPage({
    rows: [{ part: "エンジンオイル", normal_km: 10000, normal_months: 12, one_figure: true, confidence: "high" }],
  });
  assertEquals(parsed.dropped, 0);
  assertEquals(parsed.rows[0].partAsPrinted, "エンジンオイル");
});
