/**
 * R1/R3: the sorter's rules, as plain functions (docs/part-type-auto-sort-audit.md §2, §4 R1). Made-up names and
 * numbers only, no database.
 * deno test --no-check supabase/functions/_fleet-server/saved_page_auto_sort.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PartType } from "./saved_page_proof.ts";
import type { ResultRow } from "./research_saved_page_routes.ts";
import {
  buildSortNames,
  notARealPartName,
  sortUnknownNames,
  type SavedAnswers,
} from "./saved_page_auto_sort.ts";
import { buildSuggestions } from "./saved_page_suggest.ts";

const GROUPS = [
  { id: "g-belts", name: "Belts & hoses" },
  { id: "g-engine", name: "Engine" },
  { id: "g-filters", name: "Filters" },
];

const TYPES: PartType[] = [
  { id: "t-hose", name: "Air cleaner hose", scheme: "none" },
  { id: "t-clamp", name: "Hose clamp", scheme: "none" },
];

function row(lineNo: number, groupLine: string, number: string, patch: Partial<ResultRow> = {}): ResultRow {
  const phrase = groupLine.replace(/^\S+\s*[-–—]\s+/, "");
  return {
    partType: "Example part",
    place: null,
    number,
    dates: "11.2016 – 09.2020",
    group: "not_roam_type",
    reason: null,
    jobId: null,
    groupLine,
    lineText: `${number} 11.2016 09.2020`,
    lineNo,
    groupLineNo: lineNo - 1,
    from: "2016-11-01",
    to: "2020-09-30",
    datesText: "11.2016 – 09.2020",
    numberOk: true,
    readsAgree: true,
    datesOk: true,
    placeOk: true,
    suggestion: null,
    phraseKey: phrase.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    ...patch,
  };
}

Deno.test("R1: one name per group row, built from the kept rows and not the 20-card list", () => {
  const rows = [
    row(2, "99999 - WIDGET, EXAMPLE", "99999-Z0501"),
    row(4, "99999 - WIDGET, EXAMPLE", "99999-Z0502"),
    row(6, "99998 - SENSOR, EXAMPLE", "99999-Z0503"),
    row(8, "99997 - BROKEN, EXAMPLE", "99999-Z0504", { numberOk: false }),
  ];
  const names = buildSortNames(rows, GROUPS);
  assertEquals(names.map((n) => n.key).sort(), ["SENSOREXAMPLE", "WIDGETEXAMPLE"]);
  const widget = names.find((n) => n.key === "WIDGETEXAMPLE")!;
  assertEquals([widget.name, widget.groupName, widget.rows.length], ["Example widget", "Engine", 2]);
});

Deno.test("R1 step 1: the owner's answer is absolute and is not written again", () => {
  const rows = [row(2, "99999 - PART, EXAMPLE", "99999-Z0501")];
  const names = buildSortNames(rows, GROUPS);
  const saved: SavedAnswers = new Map([["PARTEXAMPLE", {
    verdict: "skip",
    setBy: "owner",
    typeId: null,
    typeName: null,
    reason: "You said not tracked",
  }]]);
  const out = sortUnknownNames({ names, types: TYPES, saved });
  assertEquals(out.open.length, 0);
  assertEquals([out.decided[0].verdict, out.decided[0].setBy, out.decided[0].writeAnswer], ["skip", "owner", false]);
});

Deno.test("R1 step 2: a type Roam already has wins, on the page phrase or the plain name", () => {
  const rows = [row(2, "99999 - HOSE, AIR CLEANER", "99999-Z0501")];
  const names = buildSortNames(rows, GROUPS);
  const out = sortUnknownNames({ names, types: TYPES, saved: new Map() });
  assertEquals(out.open.length, 0);
  assertEquals([out.decided[0].verdict, out.decided[0].typeId, out.decided[0].setBy], ["track", "t-hose", "roam"]);
});

Deno.test("R1 step 2: a fixing is checked before 'Roam already has the type' (S1c bug 2)", () => {
  // Made-up names for the two live shapes: THING(FOR …) matched a part Roam already had and got a synonym.
  const rows = [
    row(2, "99999 - BOLT(FOR EXAMPLE PART)", "99999-Z0501"),
    row(4, "99998 - GROMMET (FOR EXAMPLE HOSE)", "99999-Z0502"),
  ];
  const names = buildSortNames(rows, GROUPS);
  const types: PartType[] = [
    { id: "t-part", name: "Example part", scheme: "none" },
    { id: "t-hose", name: "Example hose", scheme: "none" },
  ];
  const out = sortUnknownNames({ names, types, saved: new Map() });
  assertEquals(out.open.length, 0);
  assertEquals(out.decided.length, 2);
  for (const d of out.decided) {
    assertEquals([d.verdict, d.reason, d.typeId, d.setBy], ["skip", "A fixing", null, "roam"]);
  }
  // The same answer on the suggestion builder: a fixing is never an "existing" card.
  const build = buildSuggestions({ rows: [row(2, "99998 - GROMMET (FOR EXAMPLE HOSE)", "99999-Z0502")], types, groups: GROUPS });
  assertEquals([build.suggestions[0].kind, build.suggestions[0].existingTypeId], ["fixings", null]);
});

Deno.test("R1 step 2: a name that is a part still finds Roam's own type (the fixing fix is not a blanket stop)", () => {
  const rows = [row(2, "99999 - HOSE, EXAMPLE", "99999-Z0501")];
  const names = buildSortNames(rows, GROUPS);
  const types: PartType[] = [{ id: "t-hose", name: "Example hose", scheme: "none" }];
  const out = sortUnknownNames({ names, types, saved: new Map() });
  assertEquals([out.decided[0].verdict, out.decided[0].typeId], ["track", "t-hose"]);
});

Deno.test("R1 step 3: Roam's saved track is used while its type is active; a gone type falls through", () => {
  const rows = [row(2, "99999 - PART, EXAMPLE", "99999-Z0501")];
  const names = buildSortNames(rows, GROUPS);
  const active: SavedAnswers = new Map([["PARTEXAMPLE", {
    verdict: "track",
    setBy: "roam",
    typeId: "t-hose",
    typeName: "Air cleaner hose",
    reason: "Roam set this",
  }]]);
  const first = sortUnknownNames({ names, types: TYPES, saved: active });
  assertEquals([first.decided[0].verdict, first.decided[0].typeId, first.decided[0].writeAnswer], ["track", "t-hose", false]);

  const gone: SavedAnswers = new Map([["PARTEXAMPLE", {
    verdict: "track",
    setBy: "roam",
    typeId: "t-gone",
    typeName: "Gone type",
    reason: "Roam set this",
  }]]);
  const second = sortUnknownNames({ names, types: TYPES, saved: gone });
  assertEquals(second.decided.length, 0);
  assertEquals(second.open.length, 1);
});

Deno.test("R1 step 4: a fixing is the first comma segment, so Toyota's THING(FOR …) is caught", () => {
  const rows = [
    row(2, "99999 - BOLT(FOR EXAMPLE PART)", "99999-Z0501"),
    row(4, "99998 - GROMMET (FOR EXAMPLE HOSE)", "99999-Z0502"),
    row(6, "99997 - CLIP, EXAMPLE", "99999-Z0503"),
  ];
  const names = buildSortNames(rows, GROUPS);
  const out = sortUnknownNames({ names, types: [], saved: new Map() });
  assertEquals(out.open.length, 0);
  for (const d of out.decided) assertEquals([d.verdict, d.reason], ["skip", "A fixing"]);
});

Deno.test("R1 step 2: headings, whole-name generic words and number-shaped names are not types", () => {
  const rows = [
    row(2, "COMMON PARTS", "99999-Z0501"),
    row(4, "99998 - COVER", "99999-Z0502"),
    row(6, "99997 - UNIT", "99999-Z0503"),
    row(8, "99996 - PART, 12345", "99999-Z0504"),
  ];
  const names = buildSortNames(rows, GROUPS);
  for (const name of names) assert(notARealPartName(name) !== null, name.name);
  const out = sortUnknownNames({ names, types: [], saved: new Map() });
  assertEquals(out.open.length, 0);
  assertEquals(out.decided.every((d) => d.verdict === "skip"), true);
  // The reason says what was decided, never the old catch-all.
  const heading = out.decided.find((d) => d.key === "COVER")!;
  assertEquals(heading.reason, "A heading");
  const number = out.decided.find((d) => d.key === "PART12345")!;
  assertEquals(number.reason, "A part number, not a name");
  assertEquals(out.decided.some((d) => /section heading/i.test(d.reason)), false);
});

Deno.test("R1 step 2: a part whose name ends on a generic word goes to the AI (S1c bug 4)", () => {
  // Made-up names for the two live shapes: the heater core and a packing that were skipped as "A section heading".
  const rows = [
    row(2, "99999 - UNIT SUB-ASSY, EXAMPLE RADIATOR", "99999-Z0501"),
    row(4, "99998 - PACKING, EXAMPLE UNIT, NO.1", "99999-Z0502"),
  ];
  const names = buildSortNames(rows, GROUPS);
  for (const name of names) assertEquals(notARealPartName(name), null, name.name);
  const out = sortUnknownNames({ names, types: [], saved: new Map() });
  assertEquals(out.decided.length, 0);
  assertEquals(out.open.map((o) => o.name).sort(), ["Example radiator unit", "Example unit packing"]);
});

Deno.test("R1 step 5: a real, unnamed part is open for the AI with one sample line", () => {
  const rows = [row(2, "99999 - MOTOR, EXAMPLE", "99999-Z0501")];
  const names = buildSortNames(rows, GROUPS);
  const out = sortUnknownNames({ names, types: [], saved: new Map() });
  assertEquals(out.decided.length, 0);
  assertEquals([out.open[0].name, out.open[0].line], ["Example motor", "99999-Z0501 11.2016 09.2020"]);
});
