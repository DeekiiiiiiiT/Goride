import { describe, expect, it } from "vitest";
import { faresLandedOutsideTripWeek } from "./fareWeekMismatch.ts";

describe("fares that landed on the next week", () => {
  it("flags a Sunday trip whose fare was stamped the next UTC day", () => {
    const mismatches = faresLandedOutsideTripWeek({
      periodAnchor: "2026-09-28",
      periodEnd: "2026-10-04",
      trips: [
        { id: "manual_1c4f6742", date: "2026-10-04", status: "Completed", amount: 2500 },
        { id: "same-week", date: "2026-10-03", status: "Completed" },
      ],
      fares: [
        { sourceId: "manual_1c4f6742", date: "2026-10-05", grossAmount: 2500 },
        { sourceId: "same-week", date: "2026-10-03", grossAmount: 100 },
      ],
    });
    expect(mismatches).toEqual([
      { tripId: "manual_1c4f6742", tripDate: "2026-10-04", fareDate: "2026-10-05", amount: 2500 },
    ]);
  });
});
