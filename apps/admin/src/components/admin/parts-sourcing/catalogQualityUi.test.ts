import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_DRAWER_ROWS,
  formatActiveLogsLabel,
  formatErrorCount24hLabel,
  historyAuditTrail,
  lastError24hMessage,
  normalizerLabelFromHealth,
  parseRemapSelectValue,
  positionReasonNarrative,
  remapBodyFromSelect,
  scheduleIntervalChip,
  specSheetCoveragePercent,
  tierRangeHint,
} from "./catalogQualityUi";

describe("catalogQualityUi", () => {
  it("tier hint is empty when breakdown is empty", () => {
    expect(tierRangeHint({})).toBe("");
    expect(tierRangeHint(undefined)).toBe("");
  });

  it("tier hint spans min–max tier keys", () => {
    expect(tierRangeHint({ "3": 1, "1": 8, "2": 3 })).toBe("T1–T3");
  });

  it("schedule chip avoids Interval · Interval · …", () => {
    expect(scheduleIntervalChip("Interval · 6h", null)).toBe("Interval · 6h");
    expect(scheduleIntervalChip("Daily at 03:00 UTC", "0 3 * * *")).toBe("Interval · Daily at 03:00 UTC");
  });

  it('remap "Any" saves null position and side', () => {
    const parsed = parseRemapSelectValue("any", {});
    expect(parsed).toEqual({ kind: "any" });
    expect(remapBodyFromSelect(parsed!)).toEqual({ position: null, side: null });
  });

  it("confirm merge select parses survivor_id", () => {
    const parsed = parseRemapSelectValue(
      "merge:11111111-1111-4111-8111-111111111111",
      {},
    );
    expect(parsed).toEqual({
      kind: "merge",
      survivorId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("fixed history audit uses resolution_source / resolved_by", () => {
    expect(
      historyAuditTrail(
        { resolution_source: "manual", resolved_by: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
        "Deeki T",
      ),
    ).toBe("Fixed by Deeki T");
    expect(historyAuditTrail({ resolution_source: "listing_edit" }, null)).toBe(
      "Auto-resolved on listing edit",
    );
  });

  it("completeness drawer uses labels not raw keys in row config", () => {
    expect(COMPLETENESS_DRAWER_ROWS.every((r) => r.label && r.key)).toBe(true);
    expect(COMPLETENESS_DRAWER_ROWS.find((r) => r.key === "vehicleCount")?.label).toContain("Vehicles");
  });

  it("position reason narrative is readable for unmapped rows", () => {
    const out = positionReasonNarrative({ reason: "unmapped", original_position: "XYZ" });
    expect(out.text).toContain("XYZ");
    expect(out.text).toMatch(/unrecognized|Any position/i);
  });

  it("spec sheet coverage percent uses partsWithSpecAttributes / parts", () => {
    expect(specSheetCoveragePercent(null)).toBeNull();
    expect(
      specSheetCoveragePercent({ parts: 200, partsWithSpecAttributes: 183 }),
    ).toBe(91.5);
  });

  it("normalizer label comes from server normVersion and normMode", () => {
    expect(normalizerLabelFromHealth(1, "strict")).toBe("Normalizer: v1 strict");
    expect(normalizerLabelFromHealth(null, null)).toBe("Normalizer: v— strict");
  });

  it("error and active log labels use singular when count is 1", () => {
    expect(formatErrorCount24hLabel(1)).toBe("1 error in 24h");
    expect(formatErrorCount24hLabel(3)).toBe("3 errors in 24h");
    expect(formatActiveLogsLabel(1)).toBe("1 active log");
    expect(formatActiveLogsLabel(2)).toBe("2 active logs");
  });

  it("last error 24h message prefers health lastError24h payload", () => {
    expect(
      lastError24hMessage({ kind: "nightly", error: "worker timed out" }, null),
    ).toBe("nightly: worker timed out");
  });
});
