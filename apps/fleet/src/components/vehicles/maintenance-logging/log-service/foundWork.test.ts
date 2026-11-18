import { describe, expect, it } from "vitest";
import type { MaintenanceLogLine, MaintenanceServiceCategory } from "../../../../types/maintenance";
import { sumMaintenanceLogLines } from "../../../../types/maintenance";
import {
  applyFoundDrafts,
  draftsFromLines,
  foundBannerText,
  foundCounts,
  foundDateLabel,
  foundLineFromDraft,
  groupHits,
  isFoundToday,
  openFoundCountFor,
  searchFoundJobs,
  type FoundDraft,
} from "./foundWork";
import type { JobFitState } from "./jobFit";

const cat = (id: string, name: string, parent: string, extra: Partial<MaintenanceServiceCategory> = {}) =>
  ({ id, name, code: id, parent_id: parent, icon_key: "wrench", kind: "component", ...extra }) as MaintenanceServiceCategory;

const inspection: MaintenanceLogLine = { categoryId: "insp", categoryCode: "inspection_diagnostic_fee", categoryName: "Inspection / diagnostic fee", labor: 8000 };
const tag = { found_by_job: "insp" };
const wiperToday: MaintenanceLogLine = { categoryId: "wiper", categoryCode: "wiper", categoryName: "Wiper Blades", labor: 1500, values: { found_today: true, ...tag } };
const rotorFound: MaintenanceLogLine = { id: "line-rotor", categoryId: "rotor", categoryCode: "rotor", categoryName: "Brake rotor", recommended: true, notes: "Front rotors worn", values: tag };
// Not this inspection job's: the old Digital inspection step, a declined recommendation, and a second
// inspection job's found job (IF-20, IF-22).
const oldPanel: MaintenanceLogLine = { categoryId: "pads", categoryCode: "pads", categoryName: "Brake pads", recommended: true, notes: "Recommended from inspection: Pads", values: {} };
const declined: MaintenanceLogLine = { categoryId: "belt", categoryCode: "belt", categoryName: "Drive belt", recommended: true, declined: true, values: {} };
const otherInspFound: MaintenanceLogLine = { categoryId: "muffler", categoryCode: "muffler", categoryName: "Muffler", recommended: true, values: { found_by_job: "exhaust_insp" } };

describe("found work drafts ↔ lines", () => {
  it("rebuilds the found list from saved lines (Not done yet + Done today), once per job", () => {
    const drafts = draftsFromLines([inspection, wiperToday, rotorFound, { ...rotorFound }], "insp");
    expect(drafts).toEqual([
      { jobId: "wiper", name: "Wiper Blades", mode: "today", note: "" },
      { jobId: "rotor", name: "Brake rotor", mode: "later", note: "Front rotors worn" },
    ]);
  });

  it("a declined recommendation (closed) is not an open found job", () => {
    expect(draftsFromLines([{ ...rotorFound, declined: true }], "insp")).toEqual([]);
  });

  it("only this inspection job's found jobs: not old Digital inspection lines or another inspection's", () => {
    const lines = [inspection, rotorFound, oldPanel, declined, otherInspFound];
    expect(draftsFromLines(lines, "insp").map((d) => d.jobId)).toEqual(["rotor"]);
    expect(draftsFromLines(lines, "exhaust_insp").map((d) => d.jobId)).toEqual(["muffler"]);
    expect(openFoundCountFor(lines, "insp")).toBe(1);
    expect(openFoundCountFor(lines, "exhaust_insp")).toBe(1);
  });

  it("a Not done yet line is J$ 0, carries the note and its inspection job, never items or prices", () => {
    const d: FoundDraft = { jobId: "shock", name: "Shock absorber", mode: "later", note: "  Rear left leaking " };
    const line = foundLineFromDraft(d, cat("shock", "Shock absorber", "susp", { default_action: "replace" }), cat("susp", "Suspension", ""), "insp");
    expect(line).toMatchObject({
      categoryId: "shock",
      categoryName: "Shock absorber",
      systemId: "susp",
      systemName: "Suspension",
      action: "replace",
      recommended: true,
      declined: false,
      notes: "Rear left leaking",
      values: { found_by_job: "insp" },
    });
    expect(line.items).toBeUndefined();
    expect(line.labor).toBeUndefined();
    expect(sumMaintenanceLogLines([line])).toBe(0);
  });

  it("saving the inspection swaps found lines (keeping saved ids) and drops a Done today job switched back", () => {
    const drafts: FoundDraft[] = [
      { jobId: "wiper", name: "Wiper Blades", mode: "later", note: "" },
      { jobId: "rotor", name: "Brake rotor", mode: "later", note: "Worn" },
    ];
    const newFound = drafts.map((d) => foundLineFromDraft(d, undefined, null, "insp"));
    const out = applyFoundDrafts([inspection, wiperToday, rotorFound], drafts, newFound, "insp");
    expect(out.map((l) => [l.categoryId, Boolean(l.recommended)])).toEqual([
      ["insp", false],
      ["wiper", true],
      ["rotor", true],
    ]);
    expect(out.find((l) => l.categoryId === "rotor")).toMatchObject({ id: "line-rotor", notes: "Worn" });
    expect(out.find((l) => l.categoryId === "wiper")?.id).toBeUndefined();
  });

  it("saving one inspection job keeps every other line (old Digital inspection, declined, another inspection)", () => {
    const out = applyFoundDrafts([inspection, rotorFound, oldPanel, declined, otherInspFound], [], [], "insp");
    expect(out.map((l) => l.categoryId)).toEqual(["insp", "pads", "belt", "muffler"]);
  });

  it("keeps a Done today job that is still Done today, and the bill counts it but never found jobs", () => {
    const drafts: FoundDraft[] = [{ jobId: "wiper", name: "Wiper Blades", mode: "today", note: "" }];
    const out = applyFoundDrafts([inspection, wiperToday, rotorFound], drafts, [], "insp");
    expect(out.map((l) => l.categoryId)).toEqual(["insp", "wiper"]);
    expect(isFoundToday(out[1])).toBe(true);
    expect(sumMaintenanceLogLines([...out, rotorFound])).toBe(9500);
  });

  it("counts done today vs not done yet for the summary line", () => {
    expect(
      foundCounts([
        { jobId: "a", name: "A", mode: "today", note: "" },
        { jobId: "b", name: "B", mode: "later", note: "" },
        { jobId: "c", name: "C", mode: "later", note: "" },
      ]),
    ).toEqual({ today: 1, later: 2 });
  });
});

describe("Add a job the inspection found — search", () => {
  const jobs = [
    cat("rotor", "Brake rotor", "brakes"),
    cat("caliper", "Brake caliper", "brakes"),
    cat("fluid", "Brake Fluid", "brakes"),
    cat("hv", "Brake regen check", "brakes"),
    cat("old", "Brake drum", "brakes", { status: "retired" } as Partial<MaintenanceServiceCategory>),
    cat("insp", "Brake inspection", "brakes"),
    cat("wiper", "Wiper Blades", "body"),
  ];
  const groupName = (j: MaintenanceServiceCategory) => (j.parent_id === "brakes" ? "Brakes" : "Body");
  const jobFit: JobFitState = {
    status: "known",
    powertrain: "ice",
    fuel: "petrol",
    fits: new Map([["hv", "no"]]),
  };

  it("finds by name, leaves out retired, inspection and not-for-this-car jobs", () => {
    const hits = searchFoundJobs({ query: "brake", jobs, groupName, jobFit, isInspectionJob: (id) => id === "insp" });
    expect(hits.map((h) => h.job.id).sort()).toEqual(["caliper", "fluid", "rotor"]);
    expect(hits.every((h) => h.groupName === "Brakes")).toBe(true);
  });

  it("matches the group name too, and nothing for an empty query", () => {
    expect(searchFoundJobs({ query: "body", jobs, groupName, jobFit, isInspectionJob: () => false }).map((h) => h.job.id)).toEqual([
      "wiper",
    ]);
    expect(searchFoundJobs({ query: "  ", jobs, groupName, jobFit, isInspectionJob: () => false })).toEqual([]);
  });

  it("groups hits under their group name in ranked order", () => {
    const groups = groupHits([
      { job: jobs[0], groupName: "Brakes" },
      { job: jobs[6], groupName: "Body" },
      { job: jobs[1], groupName: "Brakes" },
    ]);
    expect(groups.map((g) => [g.groupName, g.hits.map((h) => h.job.id)])).toEqual([
      ["Brakes", ["rotor", "caliper"]],
      ["Body", ["wiper"]],
    ]);
  });
});

describe("Log it now banner", () => {
  it("reads like the Stitch banner", () => {
    expect(foundDateLabel("2026-11-17")).toBe("17 Nov 2026");
    expect(
      foundBannerText({ foundDate: "2026-11-17", inspectionJobName: "Inspection / diagnostic fee", garage: "Northside Auto" }),
    ).toBe("From inspection on 17 Nov 2026 · Inspection / diagnostic fee at Northside Auto");
    expect(foundBannerText({ foundDate: "2026-11-17", inspectionJobName: null, garage: null })).toBe(
      "From inspection on 17 Nov 2026",
    );
  });
});
