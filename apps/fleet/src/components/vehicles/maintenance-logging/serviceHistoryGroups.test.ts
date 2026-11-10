import { describe, expect, it } from "vitest";
import { groupJobsPreview, groupServiceHistoryRows } from "./serviceHistoryGroups";

const row = (date: string, vehicle: string, name: string, total: number, extra: Record<string, unknown> = {}) => ({
  performed_at_date: date,
  vehicle_id: vehicle,
  category_name: name,
  line_total: total,
  currency: "JMD",
  ...extra,
});

describe("service history grouping", () => {
  it("groups jobs from the same date and car, newest first", () => {
    const groups = groupServiceHistoryRows([
      row("2026-08-23", "5179KZ", "Tire Change", 17999.98, { provider: "Tyre Mac", performed_at_miles: 180300 }),
      row("2026-08-22", "5179KZ", "Wheel Alignment", 3000, { provider: "Tyre Mac", performed_at_miles: 180210 }),
      row("2026-08-22", "5179KZ", "Wheel Balancing", 4000, { provider: "Tyre Mac", performed_at_miles: 180210 }),
      row("2026-01-06", "5179KZ", "Tire Change", 16800, { provider: "Tyre Mac Distributors" }),
      row("2026-01-06", "5179KZ", "Tire Change", 16800, { provider: "Tyre Mac" }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-23", "2026-08-22", "2026-01-06"]);
    expect(groups[1].rows).toHaveLength(2);
    expect(groups[1].total).toBe(7000);
    expect(groups[1].providers).toEqual(["Tyre Mac"]);
    expect(groups[1].minKm).toBe(180210);
    expect(groups[2].providers).toEqual(["Tyre Mac Distributors", "Tyre Mac"]);
    expect(groups[2].total).toBe(33600);
  });

  it("keeps two cars serviced on the same day apart", () => {
    const groups = groupServiceHistoryRows([
      row("2026-08-22", "5179KZ", "Wheel Alignment", 3000),
      row("2026-08-22", "1505LM", "Wheel Alignment", 3000),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("previews job names", () => {
    expect(groupJobsPreview(["A", "B"])).toBe("A, B");
    expect(groupJobsPreview(["A", "B", "C", "D"])).toBe("A, B + 2 more");
  });
});
