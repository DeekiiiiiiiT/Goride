import { describe, expect, it } from "vitest";
import {
  conflictDetailSummary,
  conflictKeepImpact,
  conflictManualWinsBanner,
  conflictRemoveImpact,
} from "./partMatchConflictCopy";

describe("partMatchConflictCopy", () => {
  it("oe_ambiguous detail from group_ids shape", () => {
    expect(
      conflictDetailSummary({
        conflict_type: "oe_ambiguous",
        vehicle_label: "Toyota Roomy M900A",
        group_code: "BRK-0012",
        matched_key: "04465-B1190",
        detail: {
          vehicle_oe_number_id: "11111111-1111-4111-8111-111111111113",
          oe_number_norm: "04465B1190",
          group_ids: ["g1", "g2"],
          position: "front",
          side: "both",
        },
      }),
    ).toBe("This car's number matches two different part groups.");
  });

  it("manual wins banner only when manual_listing_group_code is set", () => {
    expect(
      conflictManualWinsBanner({
        conflict_type: "oe_ambiguous",
        code: "CNF-8821",
        vehicle_label: "Toyota Tank M900A",
        manual_listing_group_code: "BRK-0031",
      })?.title,
    ).toContain("BRK-0031");
    expect(
      conflictManualWinsBanner({
        conflict_type: "oe_ambiguous",
        vehicle_label: "Toyota Roomy M900A",
      }),
    ).toBeNull();
  });

  it("position_side_mismatch uses expected/actual from detail", () => {
    expect(
      conflictDetailSummary({
        conflict_type: "position_side_mismatch",
        part_name: "Bosch 0 986 494 999",
        detail: {
          expected: { position: "front", side: "both" },
          actual: { position: "rear", side: "both" },
        },
      }),
    ).toContain("Rear");
  });

  it("keep/remove impact for oe_ambiguous", () => {
    const row = {
      conflict_type: "oe_ambiguous",
      group_code: "BRK-0012",
      interchange_group_id: "g1",
      detail: { group_ids: ["g1", "g2"] },
    };
    expect(conflictKeepImpact(row)).toContain("BRK-0012");
    expect(conflictRemoveImpact(row)).toContain("BRK-0012");
  });
});
