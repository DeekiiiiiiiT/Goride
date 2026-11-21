/**
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/fleet_parts_match.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anchorWord, findPartMatches, matchesAllWords, matchWords, MATCH_LIMIT } from "./fleet_parts_match.ts";

Deno.test("matchWords: needs 4 letters/digits in all; cleans each word", () => {
  assertEquals(matchWords("NS6"), null);
  assertEquals(matchWords("  - "), null);
  assertEquals(matchWords("Interstate NS60"), ["interstate", "ns60"]);
  assertEquals(matchWords("PF-NS60L-5-INTL"), ["pfns60l5intl"]);
});

Deno.test("matchesAllWords: every word, hyphens and spaces ignored", () => {
  const fields = ["Interstate", "Interstate battery NS60L", "PF-NS60L-5-INTL"];
  assertEquals(matchesAllWords(["interstate", "ns60"], fields), true);
  assertEquals(matchesAllWords(["pfns60l"], fields), true);
  assertEquals(matchesAllWords(["interstate", "ns70"], fields), false);
});

Deno.test("anchorWord: the longest word", () => {
  assertEquals(anchorWord(["ns60", "interstate"]), "interstate");
});

type Rows = Record<string, Array<Record<string, unknown>>>;
function fakeClient(rows: Rows, seen: string[]) {
  const from = (table: string) => {
    const api = {
      select: () => api,
      eq: (c: string, v: string) => (seen.push(`${table}.eq.${c}=${v}`), api),
      in: () => api,
      or: (f: string) => (seen.push(`${table}.or.${f}`), api),
      limit: () => api,
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve(
          table === "spec_key"
            ? { data: [{ key: "battery_jis" }], error: null }
            : table === "part_type_spec_field"
            ? { data: [], error: null }
            : { data: rows[table] ?? [], error: null },
        ).then(res),
    };
    return api;
  };
  return { from } as never;
}

Deno.test("findPartMatches: job parts + by-size parts, every word, safe filter, ≤5", async () => {
  const seen: string[] = [];
  const sb = fakeClient({
    part_master: [
      { id: "p1", name: "Battery NS60L", manufacturer: "Interstate", oem_part_number: "PF-NS60L-5-INTL" },
      { id: "p2", name: "Battery 34R", manufacturer: "Interstate", oem_part_number: "MTP-34R" },
    ],
    universal_part: [
      { id: "u1", name: "Interstate NS60L standard", manufacturer: "Interstate", part_number: "NS60L", spec_value: "46B24L", extra: { battery_type: "Standard" } },
    ],
  }, seen);
  const out = await findPartMatches(sb, "34615e73-cac1-4b77-b807-fb07e305ee6f", "Interstate NS60");
  assertEquals(out.map((m) => m.key), ["p1", "size:u1"]);
  assertEquals(out[0].partId, "p1");
  assertEquals(out[1], {
    key: "size:u1", partId: null, kind: "size", name: "Interstate NS60L standard", brand: "Interstate",
    number: "NS60L", size: "46B24L", type: "Standard",
  });
  // Only this job's parts, and only the cleaned word reaches the filter.
  assertEquals(seen.includes("part_master.eq.maintenance_component_id=34615e73-cac1-4b77-b807-fb07e305ee6f"), true);
  assertEquals(seen.some((s) => s.includes("%interstate%")), true);
});

Deno.test("findPartMatches: too short → nothing asked", async () => {
  const seen: string[] = [];
  assertEquals(await findPartMatches(fakeClient({}, seen), "34615e73-cac1-4b77-b807-fb07e305ee6f", "ns6"), []);
  assertEquals(seen, []);
});

Deno.test("findPartMatches: never more than 5", async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: "Battery", manufacturer: "Bosch", oem_part_number: `S4-${i}` }));
  const out = await findPartMatches(fakeClient({ part_master: many }, []), "34615e73-cac1-4b77-b807-fb07e305ee6f", "bosch");
  assertEquals(out.length, MATCH_LIMIT);
});

Deno.test("findPartMatches: a by-size battery's part_master twin is listed once (by size, with its part id)", async () => {
  const out = await findPartMatches(
    fakeClient({
      part_master: [{ id: "pm-twin", name: "Interstate NS60L", manufacturer: "Interstate", oem_part_number: "PF-NS60L-5-INTL" }],
      universal_part: [{
        id: "u1", name: "Interstate NS60L", manufacturer: "Interstate", part_number: "PF-NS60L-5-INTL",
        spec_value: "46B24L", extra: { battery_type: "Standard", partId: "pm-twin" },
      }],
    }, []),
    "34615e73-cac1-4b77-b807-fb07e305ee6f",
    "interstate ns60",
  );
  assertEquals(out.map((m) => [m.key, m.partId]), [["size:u1", "pm-twin"]]);
});

Deno.test("candidateItems: by-size swapped to its twin (no twin → left out) + typed matches as not_listed, no repeats", async () => {
  const { candidateItems } = await import("./fleet_parts_match.ts");
  const out = candidateItems(
    [
      { partId: "pm-belt", name: "Belt", brand: "Bando", number: "6PK", place: null, fitLabel: "made_for_car" },
      { partId: "u-gs", name: "GS M-55", brand: "GS Yuasa", number: "M-55", place: null, fitLabel: "fits_by_size" },
      { partId: "u-old", name: "Old", brand: "X", number: "Y", place: null, fitLabel: "fits_by_size" },
    ],
    new Map([["u-gs", "pm-gs"]]),
    [
      { key: "size:u-int", partId: "pm-int", kind: "size", name: "Interstate NS60L", brand: "Interstate", number: "PF-NS60L-5-INTL", size: "46B24L", type: "Standard" },
      { key: "size:u-gs", partId: "pm-gs", kind: "size", name: "GS M-55", brand: "GS Yuasa", number: "M-55", size: null, type: null },
      { key: "size:u-none", partId: null, kind: "size", name: "No twin", brand: "Z", number: "Z", size: null, type: null },
    ],
  );
  assertEquals(out.map((p) => [p.partId, p.fitLabel, p.place]), [
    ["pm-belt", "made_for_car", null],
    ["pm-gs", "fits_by_size", null],
    ["pm-int", "not_listed", "46B24L · Standard"],
  ]);
});
