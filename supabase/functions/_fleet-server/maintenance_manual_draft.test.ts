/**
 * Step 3 — a printed part name to a Roam part type, and one parsed row to one draft rule.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_draft.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildDraftRows, draftTaskCode } from "./maintenance_manual_draft.ts";
import { matchPartType, type CategoryRow } from "./maintenance_manual_match.ts";
import type { ParsedManualRow } from "./maintenance_manual_prompt.ts";

const CATEGORIES: CategoryRow[] = [
  { id: "c-oil", name: "Engine oil", code: "oil" },
  { id: "c-oil-filter", name: "Oil filter", code: "oil_filter" },
  { id: "c-brake-fluid", name: "Brake fluid", code: "brake_fluid" },
  { id: "c-spark", name: "Spark plugs", code: "spark_plugs" },
  { id: "c-spark-wires", name: "Spark Plug Wires", code: "spark_plug_wires" },
  { id: "c-coolant", name: "Coolant", code: "coolant_part" },
  { id: "c-cabin", name: "Cabin A/C filter", code: "cabin_filter" },
  { id: "c-air", name: "Air filter", code: "air_filter" },
  { id: "c-air-hose", name: "Air cleaner hose", code: "air_cleaner_hose" },
];

function row(over: Partial<ParsedManualRow> = {}): ParsedManualRow {
  return {
    partAsPrinted: "Engine oil",
    appliesTo: null,
    normalKm: 10000,
    normalMonths: 12,
    severeKm: null,
    severeMonths: null,
    oneFigure: false,
    firstKm: null,
    firstMonths: null,
    confidence: "high",
    ...over,
  };
}

Deno.test("a name the manual prints is matched exactly", () => {
  const match = matchPartType(CATEGORIES, "Engine oil");
  assertEquals(match.kind, "exact");
  assertEquals(match.categoryId, "c-oil");
});

Deno.test("a plural, a bracket or the part's code still matches exactly", () => {
  assertEquals(matchPartType(CATEGORIES, "brake fluid").kind, "exact");
  assertEquals(matchPartType(CATEGORIES, "Spark Plugs").kind, "exact");
  assertEquals(matchPartType(CATEGORIES, "Spark plug").kind, "exact");
  assertEquals(matchPartType(CATEGORIES, "Coolant (LLC)").kind, "exact");
});

Deno.test("a part named with what to do to it is still the same part", () => {
  // "replacement" says what happens to the part, not which part it is.
  const byWords = matchPartType(CATEGORIES, "Oil filter replacement");
  assertEquals(byWords.categoryId, "c-oil-filter");
  assertEquals(byWords.kind, "exact");
});

Deno.test("a part type whose name the printed name contains is a near match", () => {
  const transmission: CategoryRow[] = [{ id: "c-trans", name: "Transmission Fluid", code: "transmission" }];
  const match = matchPartType(transmission, "Automatic transmission oil");
  assertEquals(match.categoryId, "c-trans");
  assertEquals(match.kind, "near");
});

Deno.test("a word that fits several part types is no match at all, and no part is filled in", () => {
  const match = matchPartType(CATEGORIES, "filter");
  assertEquals(match.kind, "none");
  assertEquals(match.categoryId, null);
});

Deno.test("a part type that names a different part never matches", () => {
  // The Roomy page-5 mistakes: each of these shares words with the wrong part type.
  assertEquals(matchPartType(CATEGORIES, "Air cleaner element").categoryId, null);
  assertEquals(matchPartType(CATEGORIES, "Spark plug (platinum plug, iridium plug)").categoryId, "c-spark");
  const transmission = matchPartType(CATEGORIES, "Transmission oil and transfer oil");
  assertEquals(transmission.categoryId, null);
});

Deno.test("a single generic word is too broad to be a near match", () => {
  const withFluids: CategoryRow[] = [...CATEGORIES, { id: "c-fluids", name: "Fluids (Washer / Coolant)", code: "fluids" }];
  assertEquals(matchPartType(withFluids, "Differential oil").categoryId, null);
});

Deno.test("nothing that fits is 'none'", () => {
  const match = matchPartType(CATEGORIES, "Warp drive coupling");
  assertEquals(match.kind, "none");
  assertEquals(match.categoryId, null);
});

Deno.test("a matched row becomes a likely draft with the numbers the manual printed", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 214,
    parsed: [row()],
    categories: CATEGORIES,
  });

  assertEquals(built.rows.length, 1);
  const draft = built.rows[0];
  assertEquals(draft.component_id, "c-oil");
  assertEquals(draft.interval_km, 10000);
  assertEquals(draft.interval_months, 12);
  assertEquals(draft.confidence, "likely");
  assertEquals(draft.draft_note, null);
  assertEquals(draft.severe_same_as_normal, false);
});

Deno.test("a row that matches nothing is saved, marked needs checking, with a plain note", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 214,
    parsed: [row({ partAsPrinted: "Warp drive coupling", normalKm: 20000, normalMonths: 24 })],
    categories: CATEGORIES,
  });

  assertEquals(built.rows.length, 1);
  assertEquals(built.needsChecking, 1);
  assertEquals(built.rows[0].component_id, null);
  assertEquals(built.rows[0].confidence, "uncertain");
  if (!built.rows[0].draft_note?.includes("No Roam part type matched")) {
    throw new Error(`expected a plain note, got ${built.rows[0].draft_note}`);
  }
});

Deno.test("a word several part types share is saved as needs checking with the part left empty", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 20,
    parsed: [row({ partAsPrinted: "filter" })],
    categories: CATEGORIES,
  });
  assertEquals(built.rows[0].confidence, "uncertain");
  assertEquals(built.rows[0].component_id, null);
  if (!built.rows[0].draft_note?.includes("No Roam part type matched")) {
    throw new Error(`expected the missing match to be named, got ${built.rows[0].draft_note}`);
  }
});

Deno.test("a row with no normal interval needs checking even when the part matched", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 30,
    parsed: [row({ normalKm: null, normalMonths: null, severeKm: 5000, severeMonths: 6 })],
    categories: CATEGORIES,
  });
  assertEquals(built.rows[0].confidence, "uncertain");
  if (!built.rows[0].draft_note?.includes("no normal interval")) {
    throw new Error(`expected the missing interval to be named, got ${built.rows[0].draft_note}`);
  }
});

Deno.test("a one-figure row keeps the normal numbers and no severe ones", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 40,
    parsed: [row({ oneFigure: true, severeKm: 5000, severeMonths: 6 })],
    categories: CATEGORIES,
  });
  assertEquals(built.rows[0].severe_same_as_normal, true);
  assertEquals(built.rows[0].severe_interval_km, null);
  assertEquals(built.rows[0].severe_interval_months, null);
  assertEquals(built.rows[0].interval_km, 10000);
});

Deno.test("the first-time interval is carried on the draft", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 50,
    parsed: [row({ firstKm: 1000, firstMonths: 1 })],
    categories: CATEGORIES,
  });
  assertEquals(built.rows[0].first_interval_km, 1000);
  assertEquals(built.rows[0].first_interval_months, 1);
});

Deno.test("the same part twice on one page is kept once and counted", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 60,
    parsed: [row(), row({ normalKm: 15000 })],
    categories: CATEGORIES,
  });
  assertEquals(built.rows.length, 1);
  assertEquals(built.duplicates, 1);
  assertEquals(built.rows[0].interval_km, 10000);
});

Deno.test("turbo and non-turbo keep two rows, named by their remark, and neither is 'likely'", () => {
  const built = buildDraftRows({
    manualId: "0f0f0f0f-1111-4222-8333-444455556666",
    pageNo: 5,
    parsed: [
      row({ appliesTo: "Except turbo", normalKm: 15000, severeKm: 7500 }),
      row({ appliesTo: "Turbo", normalKm: 10000, severeKm: 5000 }),
    ],
    categories: CATEGORIES,
  });

  assertEquals(built.rows.length, 2);
  assertEquals(built.rows.map((r) => r.task_name), ["Engine oil (Except turbo)", "Engine oil (Turbo)"]);
  assertEquals(built.rows.map((r) => r.interval_km), [15000, 10000]);
  assertEquals(built.rows.map((r) => r.confidence), ["uncertain", "uncertain"]);
  // Two different rows must never collapse onto one task code, however long their names are.
  assertEquals(new Set(built.rows.map((r) => r.task_code)).size, 2);
  for (const draft of built.rows) {
    if (!draft.draft_note?.includes("prints \"Engine oil\" twice")) {
      throw new Error(`expected the engine split to be explained, got ${draft.draft_note}`);
    }
  }
});

Deno.test("a long part name still gets its own task code (the 28-character slug used to collide)", () => {
  const a = draftTaskCode("0f0f0f0f-1111-4222-8333-444455556666", 5, "Automatic transmission oil (CVT, except turbo)");
  const b = draftTaskCode("0f0f0f0f-1111-4222-8333-444455556666", 5, "Automatic transmission oil (CVT, turbo)");
  assertEquals(a === b, false);
  assertEquals(a.length <= 64, true);
});

Deno.test("reading the same page twice writes the same task code, so re-reading replaces", () => {
  const manualId = "0f0f0f0f-1111-4222-8333-444455556666";
  const first = buildDraftRows({ manualId, pageNo: 214, parsed: [row()], categories: CATEGORIES });
  const second = buildDraftRows({ manualId, pageNo: 214, parsed: [row()], categories: CATEGORIES });
  assertEquals(first.rows[0].task_code, second.rows[0].task_code);
  assertEquals(draftTaskCode(manualId, 215, "Engine oil") === first.rows[0].task_code, false);
});
