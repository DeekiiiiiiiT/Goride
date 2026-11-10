import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSystemSections, type CategoryRow } from "./maintenance_system_sections.ts";

const SYS = "00000000-0000-4000-8000-000000000001";
const FILTERS = "00000000-0000-4000-8000-000000000002";

function job(
  id: string,
  name: string,
  parent: string,
  extra: Partial<CategoryRow> = {},
): CategoryRow {
  return {
    id,
    name,
    code: name.toLowerCase().replace(/\s/g, "_"),
    parent_id: parent,
    status: "active",
    sort_order: 0,
    default_action: "replace",
    description: `${name} desc`,
    ...extra,
  };
}

const systems = new Map([
  [SYS, { id: SYS, name: "Engine" }],
  [FILTERS, { id: FILTERS, name: "Filters" }],
]);

const SG = "sg1";
const S1 = "sec1";

Deno.test("buildSystemSections orders by sort_order then name", () => {
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "ext", name: "External", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "fuel",
      name: "Fuel",
      description: "d",
      icon_key: "droplet",
      sort_order: 10,
    }],
    [
      { section_id: S1, category_id: "j2", sort_order: 20 },
      { section_id: S1, category_id: "j1", sort_order: 10 },
    ],
    [
      job("j1", "Alpha", SYS),
      job("j2", "Beta", SYS),
    ],
    [],
    systems,
    new Map([
      ["j1", job("j1", "Alpha", SYS)],
      ["j2", job("j2", "Beta", SYS)],
    ]),
  );
  const names = result.groups[0].sections[0].jobs.map((j) => j.name);
  assertEquals(names, ["Alpha", "Beta"]);
});

Deno.test("buildSystemSections lists cross-group member in section", () => {
  const air = job("air", "Engine Air Filter", FILTERS);
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "ext", name: "External", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "intake",
      name: "Air Intake",
      description: "d",
      icon_key: "wind",
      sort_order: 10,
    }],
    [{ section_id: S1, category_id: "air", sort_order: 10 }],
    [job("throttle", "Throttle", SYS)],
    [],
    systems,
    new Map([
      ["air", air],
      ["throttle", job("throttle", "Throttle", SYS)],
    ]),
  );
  assertEquals(result.groups[0].sections[0].jobs[0].name, "Engine Air Filter");
  assertEquals(result.otherJobs.length, 1);
});

Deno.test("buildSystemSections drops retired jobs", () => {
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "g", name: "G", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "s",
      name: "S",
      description: "d",
      icon_key: "wrench",
      sort_order: 10,
    }],
    [
      { section_id: S1, category_id: "active", sort_order: 10 },
      { section_id: S1, category_id: "retired", sort_order: 20 },
    ],
    [],
    [],
    systems,
    new Map([
      ["active", job("active", "Active", SYS)],
      ["retired", job("retired", "Retired", SYS, { status: "retired" })],
    ]),
  );
  assertEquals(result.groups[0].sections[0].jobs.length, 1);
});

Deno.test("buildSystemSections puts unsectioned home jobs in otherJobs", () => {
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "g", name: "G", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "s",
      name: "S",
      description: "d",
      icon_key: "wrench",
      sort_order: 10,
    }],
    [{ section_id: S1, category_id: "in", sort_order: 10 }],
    [job("in", "In section", SYS), job("out", "Other", SYS)],
    [],
    systems,
    new Map([
      ["in", job("in", "In section", SYS)],
      ["out", job("out", "Other", SYS)],
    ]),
  );
  assertEquals(result.otherJobs.map((j) => j.name), ["Other"]);
});

Deno.test("buildSystemSections with no sections returns empty groups and all in otherJobs", () => {
  const result = buildSystemSections(
    SYS,
    [],
    [],
    [],
    [job("a", "A", SYS), job("b", "B", SYS)],
    [],
    systems,
    new Map([
      ["a", job("a", "A", SYS)],
      ["b", job("b", "B", SYS)],
    ]),
  );
  assertEquals(result.groups, []);
  assertEquals(result.otherJobs.length, 2);
});

Deno.test("buildSystemSections carries default_action and recommendedWith", () => {
  const spark = job("spark", "Spark Plugs", SYS, { default_action: "replace" });
  const coil = job("coil", "Ignition coil", SYS);
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "g", name: "G", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "s",
      name: "S",
      description: "d",
      icon_key: "spark",
      sort_order: 10,
    }],
    [{ section_id: S1, category_id: "spark", sort_order: 10 }],
    [spark],
    [{ from_category_id: "spark", to_category_id: "coil", note: "Same access" }],
    systems,
    new Map([
      ["spark", spark],
      ["coil", coil],
    ]),
  );
  const j = result.groups[0].sections[0].jobs[0];
  assertEquals(j.default_action, "replace");
  assertEquals(j.recommendedWith.length, 1);
  assertEquals(j.recommendedWith[0].name, "Ignition coil");
  assertEquals(j.recommendedWith[0].note, "Same access");
});

Deno.test("buildSystemSections drops retired relation targets", () => {
  const from = job("from", "From", SYS);
  const to = job("to", "To", SYS, { status: "retired" });
  const result = buildSystemSections(
    SYS,
    [{ id: SG, code: "g", name: "G", sort_order: 10 }],
    [{
      id: S1,
      group_id: SG,
      code: "s",
      name: "S",
      description: "d",
      icon_key: "wrench",
      sort_order: 10,
    }],
    [{ section_id: S1, category_id: "from", sort_order: 10 }],
    [from],
    [{ from_category_id: "from", to_category_id: "to", note: "n" }],
    systems,
    new Map([
      ["from", from],
      ["to", to],
    ]),
  );
  assertEquals(result.groups[0].sections[0].jobs[0].recommendedWith.length, 0);
});
