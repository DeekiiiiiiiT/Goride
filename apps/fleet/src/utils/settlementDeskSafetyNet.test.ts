import { describe, expect, it } from "vitest";
import { payOutstandingAmount } from "./driverSettlementsPayAmount";
import { agingBucket, daysOverdue } from "./settlementAging";
import { CSV_UTF8_BOM, csvRow, csvSafeCell } from "./csvSafeExport";

describe("settlement desk safety net (Phase 2)", () => {
  it("payOutstandingAmount floors non-positive residuals", () => {
    // settlementAmount on company_owes is already leftover after settlement_paid
    expect(payOutstandingAmount({ settlementAmount: 100 })).toBe(100);
    expect(payOutstandingAmount({ settlementAmount: -10 })).toBe(0);
    expect(payOutstandingAmount({ settlementAmount: null } as any)).toBe(0);
  });

  it("aging buckets match receivables bands", () => {
    const asOf = new Date("2026-09-05T12:00:00Z");
    expect(agingBucket("2026-09-01", asOf)).toBe("0-30");
    expect(agingBucket("2026-07-20", asOf)).toBe("31-60");
    expect(agingBucket("2026-06-15", asOf)).toBe("61-90");
    expect(agingBucket("2026-01-01", asOf)).toBe("90+");
    expect(daysOverdue("2026-08-01", asOf)).toBeGreaterThan(30);
  });

  it("CSV export neutralises formula names", () => {
    expect(csvSafeCell("=cmd|'/c calc'!A1")).toMatch(/^"'=/);
    expect(csvRow(["id", "=evil", "Kenny"])).toContain("\"'=evil\"");
    expect(CSV_UTF8_BOM).toBe("\uFEFF");
  });
});
