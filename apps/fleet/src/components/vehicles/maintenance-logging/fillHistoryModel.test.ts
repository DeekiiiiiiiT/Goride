import { describe, expect, it } from "vitest";
import { initialEdit, parseKm, rowProblem, rowState, rowsToSave, type HistoryPartRow } from "./fillHistoryModel";

const part = (over: Partial<HistoryPartRow> = {}): HistoryPartRow => ({
  schedule_id: "s1",
  category_name: "Brake Fluid",
  position: null,
  last_km: null,
  last_date: null,
  last_source: null,
  from_service_vendor: null,
  check_next_service: false,
  history_unknown: true,
  ...over,
});

describe("Fill in service history (step 7)", () => {
  it("the plan's test: brake fluid filled at 198,000 km on 1 Nov is sent as a dated history", () => {
    const p = part();
    expect(rowsToSave([p], { s1: { km: "198,000", date: "2026-11-01", check: false } })).toEqual([
      { schedule_id: "s1", last_km: 198000, last_date: "2026-11-01", check_next_service: false },
    ]);
  });

  it("a part nobody can date is sent as Check at next service", () => {
    expect(rowsToSave([part()], { s1: { km: "", date: "", check: true } })).toEqual([
      { schedule_id: "s1", last_km: null, last_date: null, check_next_service: true },
    ]);
  });

  it("an untouched row and a logged service are never sent", () => {
    const logged = part({ schedule_id: "s2", last_km: 180088, last_date: "2026-08-22", last_source: "work_order", history_unknown: false });
    const edits = { s1: initialEdit(part()), s2: { km: "1", date: "2026-01-01", check: false } };
    expect(rowsToSave([part(), logged], edits)).toEqual([]);
  });

  it("a km above the car's odometer or a future date is refused in plain words", () => {
    expect(rowProblem({ km: "250000", date: "", check: false }, 200932, "2026-11-27")).toBe("That is more than the car's 200,932 km.");
    expect(rowProblem({ km: "", date: "2026-12-01", check: false }, 200932, "2026-11-27")).toBe("The date can't be in the future.");
    expect(rowProblem({ km: "abc", date: "", check: false }, 200932, "2026-11-27")).toBe("Type the km as a number.");
    expect(rowProblem({ km: "196800", date: "2026-11-01", check: false }, 200932, "2026-11-27")).toBeNull();
  });

  it("the row icon follows what is filled", () => {
    expect(rowState(part(), { km: "196800", date: "", check: false })).toBe("dated");
    expect(rowState(part(), { km: "", date: "", check: true })).toBe("check");
    expect(rowState(part(), { km: "", date: "", check: false })).toBe("unknown");
    expect(parseKm("196 800")).toBe(196800);
  });
});

describe("older service rows (no source written)", () => {
  it("a part with a service date but no source is a service record, locked and never sent", () => {
    const old = part({ last_km: 156649, last_date: "2026-05-20", last_source: null, history_unknown: false });
    expect(rowsToSave([old], { s1: { km: "1", date: "2026-01-01", check: false } })).toEqual([]);
    expect(initialEdit(old).km).toBe("156,649");
  });

  it("a date a person filled in here stays editable", () => {
    const mine = part({ last_km: 198000, last_date: "2026-11-01", last_source: "manual", history_unknown: false });
    expect(rowsToSave([mine], { s1: { km: "199,000", date: "2026-11-01", check: false } })).toEqual([
      { schedule_id: "s1", last_km: 199000, last_date: "2026-11-01", check_next_service: false },
    ]);
  });
});
