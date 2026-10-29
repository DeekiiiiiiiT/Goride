import { describe, expect, it } from "vitest";
import { formatChange, formatJmd, formatUnit, freshnessOf } from "./refineryFormat";

describe("refinery format", () => {
  it("prints money, a missing unit, and 2 versus 4 decimals", () => {
    expect(formatJmd(201.8128, 2)).toBe("J$201.81");
    expect(formatJmd(201.8128, 4)).toBe("J$201.8128");
    expect(formatUnit(null)).toBe("unit not set");
    expect(formatUnit("per litre")).toBe("per litre");
  });

  it("names a rise without calling it an error", () => {
    expect(formatChange(-4.5, -2.2, "2026-10-15")).toContain("▼");
    expect(formatChange(1.59, 0.6, "2026-10-15")).toContain("▲");
    expect(formatChange(1.59, 0.6, "2026-10-15")).not.toMatch(/error|red/i);
  });

  it("calls a week current at 6 days, due at 8, and late at 10", () => {
    expect(freshnessOf("2026-10-23", "2026-10-29")).toBe("Current");
    expect(freshnessOf("2026-10-21", "2026-10-29")).toBe("Due");
    expect(freshnessOf("2026-10-19", "2026-10-29")).toBe("Late");
  });
});
