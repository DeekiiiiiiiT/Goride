import { describe, expect, it } from "vitest";
import { logServiceOemMatchSummary } from "./logServiceOemMatchSummary.ts";
import type { MaintenanceLogLine } from "../../../../types/maintenance";

function line(partial: Partial<MaintenanceLogLine> & Pick<MaintenanceLogLine, "categoryCode" | "categoryName">): MaintenanceLogLine {
  return {
    categoryCode: partial.categoryCode,
    categoryName: partial.categoryName,
    ...partial,
  };
}

describe("logServiceOemMatchSummary", () => {
  it("clears when there are no replace lines", () => {
    expect(logServiceOemMatchSummary([line({ categoryCode: "x", categoryName: "X", action: "inspect" })])).toEqual({
      cleared: true,
      missingVerifiedCount: 0,
      replaceLineCount: 0,
    });
  });

  it("clears when every replace line has confirmed fit", () => {
    const summary = logServiceOemMatchSummary([
      line({
        categoryCode: "flt",
        categoryName: "Filter",
        action: "replace",
        partId: "p1",
        partConfirmedFit: true,
      }),
    ]);
    expect(summary.cleared).toBe(true);
    expect(summary.missingVerifiedCount).toBe(0);
  });

  it("counts replace lines without verified part", () => {
    const summary = logServiceOemMatchSummary([
      line({ categoryCode: "a", categoryName: "A", action: "replace", partId: "p1", partConfirmedFit: false }),
      line({ categoryCode: "b", categoryName: "B", action: "replace" }),
    ]);
    expect(summary.cleared).toBe(false);
    expect(summary.missingVerifiedCount).toBe(2);
  });

  it("ignores recommended lines", () => {
    const summary = logServiceOemMatchSummary([
      line({ categoryCode: "r", categoryName: "R", action: "replace", recommended: true }),
    ]);
    expect(summary.replaceLineCount).toBe(0);
    expect(summary.cleared).toBe(true);
  });
});
