import { describe, expect, it } from "vitest";
import { buildGroupViews, listedIn, moveId, sectionHoldingJob, sectionsOfJob } from "./jobsModel";
import type { Job, JobsPayload } from "./jobsApi";

const job = (id: string, name: string, homeGroupId: string, extra: Partial<Job> = {}): Job => ({
  id,
  code: id,
  opCode: null,
  name,
  description: "d",
  iconKey: "wrench",
  isPart: false,
  defaultAction: "replace",
  homeGroupId,
  status: "active",
  used: false,
  alsoDo: [],
  suggestedBy: [],
  ...extra,
});

const data: JobsPayload = {
  groups: [
    { id: "eng", code: "sys_engine", name: "Engine", iconKey: "gears" },
    { id: "fil", code: "sys_filters", name: "Filters", iconKey: "filter" },
  ],
  sectionGroups: [
    {
      id: "g2",
      groupId: "eng",
      code: "eng_g_top_end",
      name: "Top end",
      sortOrder: 20,
      sections: [{ id: "s3", sectionGroupId: "g2", groupId: "eng", code: "top", name: "Cylinder Head", description: "x", iconKey: "gears", sortOrder: 10, jobIds: ["hg"] }],
    },
    {
      id: "g1",
      groupId: "eng",
      code: "eng_g_external",
      name: "External",
      sortOrder: 10,
      sections: [
        { id: "s2", sectionGroupId: "g1", groupId: "eng", code: "fuel", name: "Fuel System", description: "x", iconKey: "droplet", sortOrder: 20, jobIds: [] },
        { id: "s1", sectionGroupId: "g1", groupId: "eng", code: "air", name: "Air Intake", description: "x", iconKey: "wind", sortOrder: 10, jobIds: ["af", "tb"] },
      ],
    },
  ],
  jobs: [
    job("af", "Engine Air Filter", "fil", { isPart: true }),
    job("ff", "Fuel filter", "fil", { isPart: true }),
    job("tb", "Throttle Body Cleaning", "eng", { defaultAction: "clean" }),
    job("hg", "Head Gasket", "eng", { isPart: true }),
    job("fpt", "Fuel Pressure Test", "eng", { defaultAction: "inspect" }),
    job("old", "Old Job", "eng", { status: "retired" }),
  ],
};

describe("Jobs list grouping", () => {
  const views = buildGroupViews(data, { status: "active", groupId: "all", search: "" });
  const engine = views.find((v) => v.group.id === "eng")!;

  it("orders section groups and sections by sort order", () => {
    expect(engine.sectionGroups.map((sg) => sg.name)).toEqual(["External", "Top end"]);
    expect(engine.sectionGroups[0].sections.map((s) => s.name)).toEqual(["Air Intake", "Fuel System"]);
  });

  it("shows a job from another group inside an Engine section", () => {
    expect(engine.sectionGroups[0].sections[0].jobs.map((j) => j.name)).toEqual(["Engine Air Filter", "Throttle Body Cleaning"]);
  });

  it("puts home jobs that are in no section under 'other'", () => {
    expect(engine.unsectioned.map((j) => j.name)).toEqual(["Fuel Pressure Test"]);
  });

  it("keeps retired jobs out of the active view and in the retired view", () => {
    expect(engine.homeJobs.some((j) => j.id === "old")).toBe(false);
    const retired = buildGroupViews(data, { status: "retired", groupId: "eng", search: "" });
    expect(retired[0].homeJobs.map((j) => j.id)).toEqual(["old"]);
  });

  it("counts sections per group", () => {
    expect(engine.sectionCount).toBe(3);
    expect(views.find((v) => v.group.id === "fil")!.sectionCount).toBe(0);
  });

  it("search narrows to matching jobs and hides empty groups", () => {
    const v = buildGroupViews(data, { status: "active", groupId: "all", search: "gasket" });
    expect(v.map((x) => x.group.name)).toEqual(["Engine"]);
  });
});

describe("Jobs helpers", () => {
  it("says where a job from another group is listed", () => {
    expect(listedIn(data, "af")).toEqual([{ groupName: "Engine", sectionName: "Air Intake" }]);
    expect(listedIn(data, "tb")).toEqual([]);
  });

  it("finds the section that already holds a job in a group (once-per-group rule)", () => {
    expect(sectionHoldingJob(data.sectionGroups, "eng", "tb")?.name).toBe("Air Intake");
    expect(sectionHoldingJob(data.sectionGroups, "eng", "fpt")).toBeNull();
  });

  it("lists the sections a job sits in (retire dialog)", () => {
    expect(sectionsOfJob(data, "hg").map((s) => s.name)).toEqual(["Cylinder Head"]);
  });

  it("moves ids up and down, unchanged at the ends", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
