import { describe, expect, it } from "vitest";
import { catalogOptionsFromScheduleRows, scheduleRowsWithPackages } from "./maintenanceCatalogOptions";

const cat = (id: string, name: string) => ({ id, name, code: id, kind: "component" });

describe("scheduleRowsWithPackages (step 15, MER-22)", () => {
  it("adds Dominion packages not on the car, after the car's own rows", () => {
    const sch = {
      schedule: [{ template_id: "t1", template: { task_name: "Oil & safety check", categories: [cat("c1", "Engine oil")] } }],
      packages: [{ template_id: "t2", template: { task_name: "Basic Service", categories: [cat("c2", "Oil filter")] } }],
    };
    const opts = catalogOptionsFromScheduleRows(scheduleRowsWithPackages(sch));
    expect(opts.map((o) => o.label)).toEqual(["Oil & safety check", "Basic Service"]);
    expect(opts[1].checklistLines).toEqual(["Oil filter"]);
  });

  it("works when the server sends no packages", () => {
    expect(scheduleRowsWithPackages({ schedule: [] })).toEqual([]);
    expect(scheduleRowsWithPackages({ schedule: null, packages: null })).toEqual([]);
  });
});
