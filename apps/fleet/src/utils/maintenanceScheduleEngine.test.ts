import { describe, expect, it } from "vitest";
import { advanceAfterService, computeInitialScheduleRow } from "./maintenanceScheduleEngine.ts";

describe("maintenanceScheduleEngine", () => {
  it("stores next_due_km_max when template has interval band", () => {
    const t = {
      frequency_kind: "recurring",
      interval_km: 5000,
      interval_km_max: 7500,
      interval_months: 3,
    };
    const row = computeInitialScheduleRow(t, 100000, "2026-01-01");
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.next_due_km).toBe(105000);
    expect(row.next_due_km_max).toBe(107500);
    expect(row.next_due_date).toBe("2026-04-01");
  });

  it("advanceAfterService rolls window after service", () => {
    const t = {
      frequency_kind: "recurring",
      interval_km: 5000,
      interval_km_max: 7500,
      interval_months: 3,
    };
    const adv = advanceAfterService(t, 105200, "2026-04-15");
    expect(adv.next_due_km).toBe(110200);
    expect(adv.next_due_km_max).toBe(112700);
  });
});
