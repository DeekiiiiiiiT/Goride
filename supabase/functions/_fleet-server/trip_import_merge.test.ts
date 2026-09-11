/**
 * Tests for trip import merge (preserve Toll Recon on Uber re-import).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { mergeTripForImport } from "./trip_import_merge.ts";

Deno.test("mergeTripForImport keeps cash_wash when incoming omits resolution", () => {
  const existing = {
    id: "t1",
    tollCharges: 370,
    tollRefundResolution: { status: "cash_wash", source: "admin" },
  };
  const incoming = { id: "t1", tollCharges: 370, cashCollected: 100 };
  const merged = mergeTripForImport(incoming, existing);
  assertEquals((merged.tollRefundResolution as { status: string }).status, "cash_wash");
  assertEquals(merged.cashCollected, 100);
});

Deno.test("mergeTripForImport allows explicit incoming resolution", () => {
  const existing = {
    id: "t1",
    tollRefundResolution: { status: "cash_wash" },
  };
  const incoming = {
    id: "t1",
    tollRefundResolution: { status: "phantom", source: "admin" },
  };
  const merged = mergeTripForImport(incoming, existing);
  assertEquals((merged.tollRefundResolution as { status: string }).status, "phantom");
});

Deno.test("mergeTripForImport preserves tollDetection when missing on incoming", () => {
  const existing = {
    id: "t1",
    tollDetection: { status: "detected", crossingCount: 2 },
  };
  const incoming = { id: "t1", amount: 50 };
  const merged = mergeTripForImport(incoming, existing);
  assertEquals((merged.tollDetection as { status: string }).status, "detected");
});

Deno.test("mergeTripForImport with no existing returns incoming", () => {
  const incoming = { id: "t1", amount: 10 };
  assertEquals(mergeTripForImport(incoming, null).amount, 10);
});
