import { describe, expect, it } from "vitest";
import {
  buildConflictBatchResolveItems,
  firstOpenConflictType,
  openConflictsForBatch,
} from "./conflictBatchResolve";

describe("conflictBatchResolve", () => {
  const rows = [
    { id: "a", conflict_type: "oe_ambiguous", status: "open" },
    { id: "b", conflict_type: "oe_ambiguous", status: "kept" },
    { id: "c", conflict_type: "index_wear_sensor", status: "open" },
  ];

  it("collects only open rows for the selected type", () => {
    expect(openConflictsForBatch(rows, "oe_ambiguous").map((r) => r.id)).toEqual(["a"]);
  });

  it("requires a note before building batch items", () => {
    const result = buildConflictBatchResolveItems(rows, "oe_ambiguous", "keep", "  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/note/i);
  });

  it("builds keep batch items for every open conflict of the type", () => {
    const result = buildConflictBatchResolveItems(rows, "oe_ambiguous", "remove", "Batch rule note");
    expect(result).toEqual({
      ok: true,
      items: [{ id: "a", action: "remove", note: "Batch rule note" }],
    });
  });

  it("picks the first chip type with a positive open count", () => {
    expect(
      firstOpenConflictType(
        { oe_ambiguous: 0, index_wear_sensor: 2, part_type_mismatch: 1 },
        ["oe_ambiguous", "part_type_mismatch", "index_wear_sensor"],
      ),
    ).toBe("part_type_mismatch");
  });
});
