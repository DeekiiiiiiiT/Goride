import { describe, expect, it } from "vitest";
import { formatEverydayCarLabel, ROOMY_DISPLAY_LABEL } from "./everydayCarLabel";

describe("formatEverydayCarLabel", () => {
  it("converts ctx label year-first to Make Model Year", () => {
    expect(formatEverydayCarLabel({ ctxLabel: "2019 Toyota Roomy" })).toBe("Toyota Roomy 2019");
  });

  it("falls back to Roomy capture plate", () => {
    expect(formatEverydayCarLabel({ plate: "5179KZ" })).toBe(ROOMY_DISPLAY_LABEL);
  });
});
