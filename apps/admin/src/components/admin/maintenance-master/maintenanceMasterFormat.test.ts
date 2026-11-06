import { describe, expect, it } from "vitest";
import { historyPlainSentence } from "./maintenanceMasterFormat";

describe("historyPlainSentence", () => {
  it("uses Roam setup when no actor", () => {
    const s = historyPlainSentence({
      old_row: {},
      new_row: { task_name: "Engine oil", interval_km: 5000, interval_months: 3 },
    });
    expect(s).toMatch(/^Roam setup created Engine oil/);
  });

  it("formats retired with old interval only", () => {
    const s = historyPlainSentence({
      actor_label: "Deeki T",
      old_row: { task_name: "Brake fluid", status: "active", interval_km: 5000, interval_months: 3 },
      new_row: { task_name: "Brake fluid", status: "retired" },
    });
    expect(s).toContain("Deeki T changed Brake fluid");
    expect(s).toContain("retired: 5,000 km or 3 months");
    expect(s).not.toContain("interval from");
    expect(s).not.toContain("to —");
  });

  it("keeps added wording for new rules", () => {
    const s = historyPlainSentence({
      actor_label: "Deeki T",
      old_row: {},
      new_row: { task_name: "Coolant", interval_km: 40000, interval_months: 24, status: "active" },
      cars_updated: 2,
    });
    expect(s).toContain("added:");
    expect(s).toContain("2 cars updated");
  });
});
