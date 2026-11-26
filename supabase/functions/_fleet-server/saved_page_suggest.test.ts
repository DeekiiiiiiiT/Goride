/**
 * R2 (docs/part-type-learning-audit.md §3): the suggestion builder, as plain rules — naming, grouping, fixings,
 * position scheme, the duplicate check and the cap. Made-up part words only.
 * deno test --no-check --allow-read supabase/functions/_fleet-server/saved_page_suggest.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PartType, ProvenRow } from "./saved_page_proof.ts";
import {
  buildSuggestions,
  existingTypeFor,
  isFixingsName,
  positionSchemeOf,
  suggestedGroupName,
  typeRoamAlreadyHas,
} from "./saved_page_suggest.ts";
import { headNoun, normalisePhrase, plainNameFromPhrase } from "./saved_page_phrases.ts";

const TYPES: PartType[] = [
  { id: "t-hose", name: "Air cleaner hose", scheme: "none" },
  { id: "t-clamp", name: "Hose clamp", scheme: "none" },
  { id: "t-filter", name: "Air filter", scheme: "none" },
];

const GROUPS = [{ id: "g-belts", name: "Belts & hoses" }, { id: "g-engine", name: "Engine" }];

/** One unknown, proved row: only the fields the suggestion builder reads matter. */
function row(lineNo: number, groupLine: string, number: string, extra: Partial<ProvenRow> = {}): ProvenRow {
  return {
    lineNo,
    groupLineNo: lineNo - 1,
    partTypeName: "other",
    type: null,
    groupLine,
    pageName: null,
    lineText: `${number} 11.2016 09.2020`,
    axle: null,
    side: null,
    number,
    from: 2016 * 12 + 11,
    to: 2020 * 12 + 9,
    datesText: "11.2016 – 09.2020",
    fitNote: null,
    reason: null,
    numberOk: true,
    readsAgree: true,
    datesOk: true,
    placeOk: true,
    dropped: false,
    evidence: groupLine,
    ...extra,
  };
}

Deno.test("R2.4: the page's words become a plain name, head noun last, sentence case", () => {
  assertEquals(plainNameFromPhrase("17881 - HOSE, AIR CLEANER, NO.1"), "Air cleaner hose");
  assertEquals(plainNameFromPhrase("17751 - INLET, AIR CLEANER, NO.1"), "Air cleaner inlet");
  assertEquals(plainNameFromPhrase("12229 - PIPE, VENTILATION"), "Ventilation pipe");
  assertEquals(plainNameFromPhrase("12345 - PAD KIT, DISC BRAKE"), "Disc brake pad kit");
  // Catalogue filler is dropped.
  assertEquals(plainNameFromPhrase("12345 - HOSE, AIR CLEANER, SET"), "Air cleaner hose");
  // MAX 60 characters (the screen's box and R5's check).
  assert(plainNameFromPhrase("12345 - " + "X".repeat(80)).length <= 60);
});

Deno.test("R2.4: the trailing NO.n is dropped, unless the page has another NO. of the same thing", () => {
  const hose1 = "10001 - HOSE, AIR CLEANER, NO.1";
  const hose2 = "10002 - HOSE, AIR CLEANER, NO.2";
  const onlyOne = row(2, hose1, "99999-Z0301");
  const withoutOther = buildSuggestions({
    rows: [onlyOne],
    types: [],
    groups: GROUPS,
  });
  assertEquals(withoutOther.suggestions[0].name, "Air cleaner hose");

  const withOther = buildSuggestions({
    rows: [row(2, hose1, "99999-Z0301"), row(4, hose2, "99999-Z0302")],
    types: [],
    groups: GROUPS,
  });
  const names = withOther.suggestions.map((s) => s.name).sort();
  assertEquals(names, ["Air cleaner hose no. 1", "Air cleaner hose no. 2"]);
  // Two different NO.s are two suggestions, not one.
  assertEquals(withOther.suggestions.length, 2);
});

Deno.test("R2.2: rows sharing a group row are one suggestion; numbers stay in page order and unique", () => {
  const build = buildSuggestions({
    rows: [row(2, "10001 - HOSE, AIR CLEANER, NO.1", "99999-Z0301"), row(4, "10001 - HOSE, AIR CLEANER, NO.1", "99999-Z0302"), row(6, "10001 - HOSE, AIR CLEANER, NO.1", "99999-Z0301")],
    types: [],
    groups: GROUPS,
  });
  assertEquals(build.suggestions.length, 1);
  assertEquals(build.suggestions[0].rowCount, 3);
  assertEquals(build.suggestions[0].numbers, ["99999-Z0301", "99999-Z0302"]);
  assertEquals(build.suggestions[0].numberCount, 2);
});

Deno.test("R2.1 + R2.3: an existing type wins — same head noun and every meaningful word of the shorter name", () => {
  assertEquals(existingTypeFor("air cleaner hose", TYPES)?.id, "t-hose");
  assertEquals(existingTypeFor("hose clamp", TYPES)?.id, "t-clamp");
  // A different qualifier is a new type, not a twin (PT-04).
  assertEquals(existingTypeFor("radiator hose", TYPES), null);
  assertEquals(existingTypeFor("air cleaner inlet", TYPES), null);

  const build = buildSuggestions({ rows: [row(2, "17881 - HOSE, AIR CLEANER, NO.1", "99999-Z0301")], types: TYPES, groups: GROUPS });
  assertEquals(build.suggestions[0].kind, "existing");
  assertEquals(build.suggestions[0].existingTypeId, "t-hose");
  // The card offers the existing type's own name.
  assertEquals(build.suggestions[0].name, "Air cleaner hose");
});

Deno.test("R2.3: 'DAMPER, MODE SERVO' is not 'Damper for airmix servo', either way round (S1c bug 3)", () => {
  // The live pair, with the catalogue's own wording. Two names are one part only when the shorter name's
  // meaningful words (beyond the head noun) are all in the longer one — "for" alone is never a match.
  const AIRMIX = [{ id: "t-airmix", name: "Damper for airmix servo", scheme: "none" }];
  const MODE = [{ id: "t-mode", name: "Damper for mode servo", scheme: "none" }];
  assertEquals(existingTypeFor("damper for mode servo", AIRMIX), null);
  assertEquals(existingTypeFor("damper for airmix servo", MODE), null);
  // The same part, written in another order or with fewer words, still matches both ways.
  assertEquals(existingTypeFor("damper for airmix servo", AIRMIX)?.id, "t-airmix");
  assertEquals(existingTypeFor("airmix damper servo", AIRMIX)?.id, "t-airmix");
  assertEquals(existingTypeFor("damper for mode servo", MODE)?.id, "t-mode");
  assertEquals(existingTypeFor("mode damper servo", MODE)?.id, "t-mode");
  // A bare word is not every longer name's twin.
  assertEquals(existingTypeFor("filter", [{ id: "t-cabin", name: "Cabin filter", scheme: "none" }]), null);
  assertEquals(existingTypeFor("filter", [{ id: "t-cabin", name: "Filter", scheme: "none" }])?.id, "t-cabin");
});

Deno.test("R2.1: a name whose head noun is hardware is a fixing, never a suggestion card", () => {
  assert(isFixingsName("hose clip"));
  assert(isFixingsName("flange bolt"));
  assert(!isFixingsName("air cleaner hose"));
  const build = buildSuggestions({
    rows: [row(2, "17875C - CLIP, HOSE", "99999-Z0303")],
    types: TYPES,
    groups: GROUPS,
  });
  assertEquals(build.suggestions.length, 1);
  assertEquals(build.suggestions[0].kind, "fixings");
  assertEquals(build.suggestions[0].name, "Hose clip");
});

Deno.test("R2.1: a fixing never resolves to the part its words happen to name (S1c bug 2)", () => {
  // The live shapes, with made-up words: the fixing word is the catalogue's first segment, the part word second.
  const types: PartType[] = [
    { id: "t-hose", name: "Example hose", scheme: "none" },
    { id: "t-valve", name: "Example valve", scheme: "none" },
  ];
  assertEquals(typeRoamAlreadyHas("BOLT(FOR EXAMPLE VALVE)", "Bolt for example valve", types), null);
  assertEquals(typeRoamAlreadyHas("GROMMET (FOR EXAMPLE HOSE)", "Grommet for example hose", types), null);
  // The same part written as a part is still found, so the fixing check is not a blanket stop.
  assertEquals(typeRoamAlreadyHas("HOSE, EXAMPLE", "Example hose", types)?.id, "t-hose");
  // And the suggestion the page makes for a fixing is a fixing line even though the words match a type on file.
  const build = buildSuggestions({
    rows: [row(2, "17882 - GROMMET (FOR EXAMPLE HOSE)", "99999-Z0304")],
    types,
    groups: GROUPS,
  });
  assertEquals(
    [build.suggestions[0].kind, build.suggestions[0].name, build.suggestions[0].existingTypeId],
    ["fixings", "Grommet for example hose", null],
  );
});

Deno.test("R2.5: the group table is tried in the plan's order, first match wins", () => {
  assertEquals(suggestedGroupName("Air cleaner hose"), "Belts & hoses");
  assertEquals(suggestedGroupName("Ventilation pipe"), "Belts & hoses");
  assertEquals(suggestedGroupName("Air cleaner inlet"), "Engine");
  assertEquals(suggestedGroupName("Engine mount"), "Engine");
  assertEquals(suggestedGroupName("Exhaust pipe"), "Exhaust & emissions");
  assertEquals(suggestedGroupName("Brake pad"), "Brakes");
  assertEquals(suggestedGroupName("Coil spring"), "Suspension & steering");
  assertEquals(suggestedGroupName("Stabilizer bar bush"), "Suspension & steering");
  assertEquals(suggestedGroupName("Headlight assembly"), "Lighting & visibility");
  assertEquals(suggestedGroupName("Clutch kit"), "Transmission");
  assertEquals(suggestedGroupName("Cabin filter"), "Filters");
  assertEquals(suggestedGroupName("Wheel"), "Tires & wheels");
  // A group that is not on file carries a null id but the suggested name.
  const build = buildSuggestions({ rows: [row(2, "17881 - HOSE, AIR CLEANER, NO.1", "99999-Z0301")], types: [], groups: GROUPS });
  assertEquals([build.suggestions[0].groupName, build.suggestions[0].groupId], ["Belts & hoses", "g-belts"]);
});

Deno.test("R2.6: the position scheme comes from the places the page printed", () => {
  assertEquals(positionSchemeOf([{ axle: null, side: null }]), "none");
  assertEquals(positionSchemeOf([{ axle: "front", side: null }]), "axle");
  assertEquals(positionSchemeOf([{ axle: "front", side: "left" }, { axle: "rear", side: "both" }]), "axle_left_right");
  const build = buildSuggestions({
    rows: [row(2, "17881 - HOSE, AIR CLEANER, NO.1", "99999-Z0301", { axle: "front", side: "left" })],
    types: [],
    groups: GROUPS,
  });
  assertEquals(build.suggestions[0].positionScheme, "axle_left_right");
});

Deno.test("R2: a dismissed phrase is never suggested again", () => {
  const rows = [row(2, "17881 - HOSE, AIR CLEANER, NO.1", "99999-Z0301"), row(4, "17751 - INLET, AIR CLEANER, NO.1", "99999-Z0302")];
  const build = buildSuggestions({
    rows,
    types: [],
    groups: GROUPS,
    dismissed: new Set([normalisePhrase("HOSE, AIR CLEANER, NO.1")]),
  });
  assertEquals(build.suggestions.length, 1);
  assertEquals(build.suggestions[0].key, normalisePhrase("INLET, AIR CLEANER, NO.1"));
  // The dismissed phrase's row is still listed (D1) but carries no suggestion.
  assertEquals(build.keyByLine.get(2), undefined);
  assertEquals(build.keyByLine.get(4), build.suggestions[0].key);
});

Deno.test("R2.7: at most 20 cards, fixings still listed, the rest only counted", () => {
  const cards = Array.from({ length: 23 }, (_, i) => row(i * 2 + 2, `1000${i} - WIDGET, TEST ${i}`, `99999-Z04${String(i).padStart(2, "0")}`));
  const fixing = row(100, "20000 - CLIP, HOSE", "99999-Z0500");
  const build = buildSuggestions({ rows: [...cards, fixing], types: [], groups: GROUPS });
  const cardCount = build.suggestions.filter((s) => s.kind !== "fixings").length;
  const fixingCount = build.suggestions.filter((s) => s.kind === "fixings").length;
  assertEquals(cardCount, 20);
  assertEquals(fixingCount, 1);
  // 3 cards dropped, one row each.
  assertEquals(build.moreUnknownRows, 3);
  // Order is page order; a fixing is still in the list (the screen shows it as one line).
  assertEquals(build.suggestions[0].key, normalisePhrase("WIDGET, TEST 0"));
});

Deno.test("R2: rows held or dropped at upload never become suggestions", () => {
  const build = buildSuggestions({
    rows: [
      row(2, "10001 - WIDGET, TEST", "99999-Z0301", { reason: "No dates shown on the page" }),
      row(4, "10002 - WIDGET, TEST", "99999-Z0302", { dropped: true }),
      row(6, "10003 - WIDGET, TEST", "99999-Z0303"),
    ],
    types: [],
    groups: GROUPS,
  });
  assertEquals(build.suggestions.length, 1);
  assertEquals(build.suggestions[0].key, normalisePhrase("WIDGET, TEST"));
});

Deno.test("R2.4: head nouns are taken from the name, not the page's noise", () => {
  assertEquals(headNoun("Air cleaner hose no. 1"), "1");
  assertEquals(headNoun("Air cleaner hose"), "hose");
  assertEquals(plainNameFromPhrase("12345 - HOSE, AIR CLEANER"), "Air cleaner hose");
});
