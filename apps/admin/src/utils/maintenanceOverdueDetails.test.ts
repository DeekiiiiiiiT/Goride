import { describe, expect, it } from "vitest";
import {
  analyzeMaintenanceScheduleRow,
  diffCalendarDaysUtc,
  sortFleetServiceAttention,
} from "./maintenanceOverdueDetails.ts";

describe("diffCalendarDaysUtc", () => {
  it("counts days between UTC calendar dates", () => {
    expect(diffCalendarDaysUtc("2026-01-01", "2026-01-05")).toBe(4);
  });
});

describe("analyzeMaintenanceScheduleRow", () => {
  const today = "2026-04-17";

  it("returns calendar days when overdue by date", () => {
    const a = analyzeMaintenanceScheduleRow(
      100_000,
      today,
      200_000,
      null,
      "2026-04-10",
      "active",
    );
    expect(a.status).toBe("overdue");
    expect(a.calendarDaysOverdue).toBe(7);
    expect(a.kmOverdue).toBeNull();
  });

  it("returns km overdue when past mileage window end", () => {
    const a = analyzeMaintenanceScheduleRow(
      155_000,
      today,
      150_000,
      152_000,
      null,
      "active",
    );
    expect(a.status).toBe("overdue");
    expect(a.calendarDaysOverdue).toBeNull();
    expect(a.kmOverdue).toBe(3000);
  });

  it("returns km overdue when past single threshold without upper band", () => {
    const a = analyzeMaintenanceScheduleRow(160_000, today, 150_000, null, null, "active");
    expect(a.status).toBe("overdue");
    expect(a.kmOverdue).toBe(10_000);
  });
});

describe("sortFleetServiceAttention", () => {
  it("sorts overdue before due_soon then by name", () => {
    const sorted = sortFleetServiceAttention([
      { kind: "due_soon", taskName: "Brake fluid" },
      { kind: "overdue", taskName: "Oil" },
      { kind: "overdue", taskName: "Air filter" },
    ]);
    expect(sorted.map((x) => x.taskName)).toEqual(["Air filter", "Oil", "Brake fluid"]);
  });
});