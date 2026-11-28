import { describe, expect, it } from "vitest";
import { HARD_USE_FIELDS, baselineLine, fieldText, fieldValue, logChanges } from "./hardUseRuleModel";
import type { HardUsePolicy } from "./maintenanceMasterApi";

const POLICY: HardUsePolicy = {
  baseline_km_per_year: 10000,
  high_use_multiple: 2,
  window_days: 90,
  min_span_days: 30,
  short_trip_km: 8,
  short_trip_share: 0.3,
  min_trips: 20,
  clear_days: 60,
  kept_normal_days: 90,
  kept_hard_days: 90,
};

const field = (k: keyof HardUsePolicy) => HARD_USE_FIELDS.find((f) => f.key === k)!;

describe("Hard use rule card (step 16e)", () => {
  it("shows short trips as a percentage and stores a share", () => {
    expect(fieldText(field("short_trip_share"), POLICY)).toBe("30");
    expect(fieldValue(field("short_trip_share"), "35")).toBe(0.35);
    expect(fieldValue(field("baseline_km_per_year"), "12,000")).toBe(12000);
    expect(fieldValue(field("baseline_km_per_year"), "")).toBeNull();
    expect(fieldValue(field("baseline_km_per_year"), "lots")).toBeNull();
  });

  it("says the baseline per day, week and month", () => {
    expect(baselineLine(10000)).toBe("27 km a day · 192 a week · 833 a month");
    expect(baselineLine(null)).toBeNull();
  });

  it("writes one line per changed limit", () => {
    expect(logChanges(POLICY, { ...POLICY, baseline_km_per_year: 12000, high_use_multiple: 1.5 })).toEqual([
      "Normal use: 10,000 → 12,000 km a year",
      "Hard use starts at: 2 → 1.5 × normal",
    ]);
    expect(logChanges(POLICY, POLICY)).toEqual([]);
  });
});
