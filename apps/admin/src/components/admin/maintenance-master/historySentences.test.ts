import { describe, expect, it } from "vitest";
import { buildHistoryEntries, initials, type HistoryNames } from "./historySentences";

const names: HistoryNames = {
  job: (id) => ({ j1: "Spark Plugs", j2: "Ignition coil", j3: "Fuel Pressure Test" } as Record<string, string>)[String(id)] ?? "a job",
  group: (id) => ({ eng: "Engine" } as Record<string, string>)[String(id)] ?? "a group",
  section: (id) => ({ s1: "Fuel System", s2: "Ignition System" } as Record<string, string>)[String(id)] ?? "a section",
};
const row = (entity_table: string, old_row: object, new_row: object, created_at = "2026-11-10T14:32:00Z") => ({
  id: `${entity_table}-${created_at}-${JSON.stringify(new_row)}`,
  entity_table,
  old_row,
  new_row,
  created_at,
  actor: "u1",
  actor_label: "Deeki T",
});

describe("History sentences (DM5)", () => {
  it("job added / retired / restored / renamed / edited", () => {
    const e = buildHistoryEntries(
      [
        row("maintenance_service_categories", {}, { kind: "component", name: "Fuel Pressure Test", parent_id: "eng" }),
        row("maintenance_service_categories", { kind: "component", name: "Fuel Pressure Test", status: "active" }, { kind: "component", name: "Fuel Pressure Test", status: "retired" }),
        row("maintenance_service_categories", { kind: "component", name: "A", status: "retired" }, { kind: "component", name: "A", status: "active" }),
        row("maintenance_service_categories", { kind: "component", name: "Old" }, { kind: "component", name: "New" }),
        row("maintenance_service_categories", { kind: "component", name: "Throttle Body Cleaning", description: "x" }, { kind: "component", name: "Throttle Body Cleaning", description: "y" }),
      ],
      names,
    ).map((x) => x.sentence);
    expect(e).toContain("Deeki T added Fuel Pressure Test to Engine.");
    expect(e).toContain("Deeki T retired Fuel Pressure Test.");
    expect(e).toContain("Deeki T restored A.");
    expect(e).toContain("Deeki T renamed Old to New.");
    expect(e).toContain("Deeki T changed Throttle Body Cleaning's description.");
  });

  it("skips group (system) rows and empty updates", () => {
    const e = buildHistoryEntries([row("maintenance_service_categories", { kind: "system", name: "Engine", icon_key: "oil" }, { kind: "system", name: "Engine", icon_key: "gears" })], names);
    expect(e).toEqual([]);
  });

  it("merges a saved section list into one sentence", () => {
    const t = "2026-11-10T14:15:00.100Z";
    const e = buildHistoryEntries(
      [
        row("maintenance_job_section_members", { section_id: "s1", category_id: "j1" }, {}, t),
        row("maintenance_job_section_members", {}, { section_id: "s1", category_id: "j1" }, t),
        row("maintenance_job_section_members", {}, { section_id: "s1", category_id: "j3" }, t),
      ],
      names,
    ).map((x) => x.sentence);
    expect(e).toEqual(["Deeki T put Fuel Pressure Test in Fuel System."]);
  });

  it("a pure reorder says reordered", () => {
    const t = "2026-11-10T09:20:00Z";
    const e = buildHistoryEntries(
      [
        row("maintenance_job_section_members", { section_id: "s2", category_id: "j1" }, {}, t),
        row("maintenance_job_section_members", {}, { section_id: "s2", category_id: "j1" }, t),
      ],
      names,
    );
    expect(e[0].sentence).toBe("Deeki T reordered the jobs in Ignition System.");
  });

  it("also-do links and schedules", () => {
    const e = buildHistoryEntries(
      [
        row("maintenance_job_relations", {}, { from_category_id: "j1", to_category_id: "j2", note: "Same access" }),
        row("maintenance_task_templates", {}, { task_name: "Brake Fluid", interval_km: 40000, interval_months: 24 }),
      ],
      names,
    ).map((x) => x.sentence);
    expect(e).toContain("Deeki T added 'also do': Spark Plugs → Ignition coil ('Same access').");
    expect(e.some((s) => s.startsWith("Deeki T created Brake Fluid schedule: 40,000 km"))).toBe(true);
  });

  it("never mentions Fleet cars", () => {
    const e = buildHistoryEntries([{ ...row("maintenance_task_templates", { task_name: "Oil", interval_km: 5000 }, { task_name: "Oil", interval_km: 7500 }), cars_updated: 2 }], names);
    expect(e[0].sentence).not.toMatch(/car/i);
  });

  it("initials", () => {
    expect(initials("Deeki T")).toBe("DT");
    expect(initials("Roam setup")).toBe("RS");
  });
});
