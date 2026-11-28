import { describe, expect, it } from "vitest";
import type { MaintenanceLogLine } from "../../../../types/maintenance";
import {
  followUpQueue,
  inspectionFindingsFromLines,
  isDiscountChanged,
  isDiscountProblem,
  saveBlockReason,
  saveFailureReason,
  stockWarningsText,
} from "./logServiceSave";

const line = (over: Partial<MaintenanceLogLine> = {}) =>
  ({ categoryCode: "oil", categoryName: "Engine oil", action: "replace", ...over }) as MaintenanceLogLine;

describe("Log service save rules (step 9: moved, same words and order)", () => {
  it("checks before sending, in the same order as before", () => {
    expect(saveBlockReason("", 1000, [line()])).toBe("Please fill in required fields");
    expect(saveBlockReason("2026-11-27", 0, [line()])).toBe("Odometer is required and must be greater than zero");
    expect(saveBlockReason("2026-11-27", "abc", [line()])).toBe("Odometer is required and must be greater than zero");
    expect(saveBlockReason("2026-11-27", 1000, [])).toBe("Add at least one line before saving");
    expect(saveBlockReason("2026-11-27", 1000, [line()])).toBeNull();
  });

  it("only old-style recommended lines become inspection findings", () => {
    const out = inspectionFindingsFromLines([
      line(),
      line({ recommended: true, declined: true, notes: "worn", categoryId: "c1", systemId: "s1" }),
      line({ recommended: true, values: { found_by_job: "job-1" } }),
    ]);
    expect(out).toEqual([{ itemId: null, systemId: "s1", componentId: "c1", status: "attention", notes: "worn", declined: true }]);
  });

  it("stock warnings read as one sentence", () => {
    expect(stockWarningsText([{ partName: "Brake pads", shortBy: 2 }, { shortBy: "x" }])).toBe(
      "Brake pads is short by 2 on the shelf. A part is short by 1 on the shelf",
    );
    expect(stockWarningsText(undefined)).toBeNull();
  });

  it("follow-ups: warranty questions first, then fit checks for parts on done lines", () => {
    const q = followUpQueue(
      { warrantyPrompts: [{ partId: "p1", supplierId: "s", workOrderLineId: "l1" }], item: { lines: [{ id: "l1", partId: "p1" }, { id: "l2", partId: "p2", declined: true }] } },
      [],
    );
    expect(q).toEqual([
      { kind: "warranty", partId: "p1", supplierId: "s", workOrderLineId: "l1" },
      { kind: "fit", partId: "p1", workOrderLineId: "l1" },
    ]);
  });

  it("failure words: network vs server, and discount refusals", () => {
    expect(saveFailureReason(new TypeError("Failed to fetch"))).toBe("could not reach the server — check your connection and try again");
    expect(saveFailureReason(new Error("Nope"))).toBe("Nope");
    expect(saveFailureReason("x")).toBe("");
    expect(isDiscountChanged("The discount changed since you opened this")).toBe(true);
    expect(isDiscountProblem("The discount can't be more than the total")).toBe(true);
    expect(isDiscountProblem("Something else")).toBe(false);
  });
});
