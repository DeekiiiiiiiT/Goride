import { describe, expect, it } from "vitest";
import { homeSectionNameByJob, recommendedByJob, visibleSections, type SystemSections } from "./systemSections";
import { searchLogServiceJobs } from "./LogServiceWhatWasDoneStep";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

const job = (id: string, name: string, parent: string, extra: Record<string, unknown> = {}) =>
  ({ id, code: id, name, parent_id: parent, icon_key: "wrench", kind: "component", ...extra }) as unknown as MaintenanceServiceCategory;

const engine: SystemSections = {
  groups: [
    {
      code: "eng_g_external",
      name: "External bolt-on & induction",
      sections: [
        {
          code: "eng_air_intake",
          name: "Air Intake & Induction",
          description: "Air in.",
          iconKey: "wind",
          jobs: [job("af", "Engine Air Filter", "fil"), job("tb", "Throttle Body Cleaning", "eng", { default_action: "clean" })],
        },
        { code: "empty", name: "Empty", description: "x", iconKey: "wrench", jobs: [] },
      ],
    },
    {
      code: "eng_g_bottom_end",
      name: "Bottom end",
      sections: [
        {
          code: "eng_crank",
          name: "Crankshaft & Rotating Assembly",
          description: "Pan off.",
          iconKey: "gears",
          jobs: [
            job("mb", "Main Bearing Replacement", "eng", {
              default_action: "replace",
              recommendedWith: [{ categoryId: "rb", name: "Connecting Rod Bearing Replacement", note: "Same area.", homeSystemId: "eng", homeSystemName: "Engine" }],
            }),
          ],
        },
      ],
    },
    { code: "ghost", name: "Ghost group", sections: [] },
  ],
  otherJobs: [job("old", "Old", "eng", { status: "retired" })],
};

describe("Fleet engine sections", () => {
  it("hides empty sections, empty section groups and retired jobs (F1)", () => {
    const v = visibleSections(engine)!;
    expect(v.groups.map((g) => g.name)).toEqual(["External bolt-on & induction", "Bottom end"]);
    expect(v.groups[0].sections.map((s) => s.name)).toEqual(["Air Intake & Induction"]);
    expect(v.otherJobs).toEqual([]);
  });

  it("returns null for a group with no sections → flat grid", () => {
    expect(visibleSections({ groups: [], otherJobs: [] })).toBeNull();
  });

  it("maps a job to a section only inside its own home group (★ jobs keep their home group in search)", () => {
    const m = homeSectionNameByJob(new Map([["eng", engine]]));
    expect(m.get("tb")).toBe("Air Intake & Induction");
    expect(m.get("af")).toBeUndefined();
  });

  it("collects 'also do' links per job", () => {
    expect(recommendedByJob(new Map([["eng", engine]])).get("mb")?.[0].name).toBe("Connecting Rod Bearing Replacement");
  });

  it("labels search results Group · Section · Action (F3)", () => {
    const sectionNameByJob = homeSectionNameByJob(new Map([["eng", engine]]));
    const hits = searchLogServiceJobs({
      query: "bearing",
      jobs: [job("mb", "Main Bearing Replacement", "eng", { default_action: "replace" }), job("af", "Engine Air Filter", "fil", { default_action: "replace" })],
      systems: [job("eng", "Engine", "", { kind: "system" }), job("fil", "Filters", "", { kind: "system" })],
      pickableGroups: [],
      packages: [],
      dueOps: [],
      sectionNameByJob,
    });
    expect(hits[0].systemName).toBe("Engine · Crankshaft & Rotating Assembly · Replace");
    const air = searchLogServiceJobs({
      query: "air filter",
      jobs: [job("af", "Engine Air Filter", "fil", { default_action: "replace" })],
      systems: [job("fil", "Filters", "", { kind: "system" })],
      pickableGroups: [],
      packages: [],
      dueOps: [],
      sectionNameByJob,
    });
    expect(air[0].systemName).toBe("Filters · Replace");
  });
});
