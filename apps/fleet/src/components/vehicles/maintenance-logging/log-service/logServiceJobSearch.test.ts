import { describe, expect, it } from "vitest";
import { dedupeSuggestedOps, searchLogServiceJobs } from "./LogServiceWhatWasDoneStep";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

const cat = (p: Partial<MaintenanceServiceCategory> & { id: string; name: string }) =>
  ({ code: p.id, icon_key: "wrench", kind: "component", ...p }) as MaintenanceServiceCategory;

const tires = cat({ id: "sys_tires", name: "Tires & wheels", kind: "system" });
const brakesSys = cat({ id: "sys_brakes", name: "Brakes", kind: "system" });
const lighting = cat({ id: "sys_lighting", name: "Lighting & visibility", kind: "system" });
const carSpecs = cat({ id: "imp-car-specs", name: "Car specs", kind: "system" });
const jobs = [
  cat({ id: "wheel_alignment", name: "Wheel Alignment", parent_id: "sys_tires", description: "Adjusting the wheel angles" }),
  cat({ id: "wheel_balancing", name: "Wheel Balancing", parent_id: "sys_tires" }),
  cat({ id: "brakes", name: "Brakes", parent_id: "sys_brakes", description: "The pads that squeeze the brake disc" }),
  cat({ id: "wipers", name: "Wiper Blades", parent_id: "sys_lighting" }),
];
const base = {
  jobs,
  systems: [tires, brakesSys, lighting, carSpecs],
  pickableGroups: [tires, brakesSys, lighting],
  packages: [],
  dueOps: [],
};

describe("Log service job search", () => {
  it("finds a job that is not due", () => {
    expect(searchLogServiceJobs({ ...base, query: "alignment" }).map((h) => h.categoryId)).toEqual(["wheel_alignment"]);
  });

  it("finds jobs by description words (brake pads → Brakes)", () => {
    const ids = searchLogServiceJobs({ ...base, query: "brake pads" }).map((h) => h.categoryId);
    expect(ids).toContain("brakes");
  });

  it("matches singular against plural (wiper → Wiper Blades)", () => {
    expect(searchLogServiceJobs({ ...base, query: "wiper" })[0]?.categoryId).toBe("wipers");
  });

  it("never offers internal groups like Car specs", () => {
    expect(searchLogServiceJobs({ ...base, query: "car" }).map((h) => h.categoryId)).not.toContain("imp-car-specs");
  });

  it("shows the group name next to a job", () => {
    expect(searchLogServiceJobs({ ...base, query: "balancing" })[0]?.systemName).toBe("Tires & wheels");
  });

  it("returns nothing for an empty query", () => {
    expect(searchLogServiceJobs({ ...base, query: "  " })).toEqual([]);
  });
});

describe("dedupeSuggestedOps", () => {
  it("collapses one row per wheel into one row per job, keeping Overdue", () => {
    const op = { categoryId: "brakes", categoryName: "Brakes", systemName: "Brakes", iconKey: null };
    const out = dedupeSuggestedOps([
      { ...op, status: "due_soon" },
      { ...op, status: "overdue" },
      { ...op, status: "due_soon" },
      { ...op, status: "due_soon" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("overdue");
  });
});
