import { describe, expect, it } from "vitest";
import { analyzeMaintenanceScheduleRow } from "./maintenanceOverdueDetails.ts";

describe("maintenance due windows (L-11)", () => {
  it("marks due soon inside km window before due", () => {
    const r = analyzeMaintenanceScheduleRow(
      119_000,
      "2026-11-01",
      120_000,
      null,
      null,
      "active",
      { dueSoonKm: 1000, dueSoonDays: 14 },
    );
    expect(r.status).toBe("pending");
  });

  it("marks overdue when past km due", () => {
    const r = analyzeMaintenanceScheduleRow(
      125_000,
      "2026-11-01",
      120_000,
      null,
      null,
      "active",
      { dueSoonKm: 1000, dueSoonDays: 14 },
    );
    expect(r.status).toBe("overdue");
  });
});
