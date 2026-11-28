import { describe, expect, it } from "vitest";
import { mmCanLogThis, mmCountingFromText, mmOverdueText, mmSourceText } from "./maintenanceMasterFleetUi";

describe("due line (maintenance step 10)", () => {
  it("says where the number comes from", () => {
    expect(mmSourceText({ source_type: "maker_manual", source_page: { page: 412, doc: "schedule" } })).toBe("Car maker · page 412");
    expect(mmSourceText({ source_type: "maker_manual" })).toBe("Car maker");
    expect(mmSourceText({ source_type: "roam_policy" })).toBe("Roam policy — no manual yet");
    expect(mmSourceText({ source_type: "roam_policy", custom_interval_km: 5000, custom_reason: "Taxi work" })).toBe("Fleet override — Taxi work");
  });

  it("says where the clock started", () => {
    expect(mmCountingFromText({ counting_from_source: "service", counting_from_date: "2026-08-22", counting_from_km: 180088 })).toBe(
      "Counted from your service on 22 Aug 2026 at 180,088 km",
    );
    expect(mmCountingFromText({ counting_from_source: "filled_in", counting_from_date: "2026-11-01", counting_from_km: 198000 })).toBe(
      "Counted from the history you filled in on 1 Nov 2026 at 198,000 km",
    );
    expect(mmCountingFromText({ counting_from_source: null })).toBeNull();
  });

  it("overdue amount, and Log this only where something is due (never OK or retired)", () => {
    expect(mmOverdueText({ due_status: "overdue", km_overdue: 10844 })).toBe("10,844 km overdue");
    expect(mmOverdueText({ due_status: "overdue", km_overdue: 0, days_overdue: 3 })).toBe("3 days overdue");
    expect(mmOverdueText({ due_status: "ok" })).toBeNull();
    expect(mmCanLogThis({ due_status: "overdue" })).toBe(true);
    expect(mmCanLogThis({ due_status: "history_unknown" })).toBe(true);
    expect(mmCanLogThis({ due_status: "ok" })).toBe(false);
    expect(mmCanLogThis({ due_status: "overdue", schedule_status: "retired" })).toBe(false);
  });
});
