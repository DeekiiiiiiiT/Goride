import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readRateStamp, shouldStampRate } from "./toll_rate_provenance.ts";

Deno.test("a settled toll reads its frozen price instead of today's rate card", () => {
  const stamp = readRateStamp({
    status: "reconciled",
    rateScheduleVersionId: "trv_abc",
    officialAmount: 380,
    officialEffectiveFrom: "2026-01-01",
  });

  assertEquals(stamp, {
    officialAmount: 380,
    rateScheduleVersionId: "trv_abc",
    officialEffectiveFrom: "2026-01-01",
  });
});

Deno.test("an unstamped toll has no frozen price and must resolve live", () => {
  assertEquals(readRateStamp({ status: "reconciled" }), null);
  assertEquals(readRateStamp(null), null);
});

Deno.test("a zero official amount is an incomplete card, not a price", () => {
  // Guards against freezing a toll at $0 and then reporting it as fully priced.
  assertEquals(readRateStamp({ rateScheduleVersionId: "trv_abc", officialAmount: 0 }), null);
  assertEquals(readRateStamp({ rateScheduleVersionId: "trv_abc", officialAmount: null }), null);
});

Deno.test("closing a toll is what triggers the price freeze", () => {
  for (const status of ["reconciled", "approved", "resolved", "rejected"]) {
    assertEquals(shouldStampRate({ status }), true, `${status} should stamp`);
  }
});

Deno.test("an open toll is left to track the current rate card", () => {
  assertEquals(shouldStampRate({ status: "pending" }), false);
  assertEquals(shouldStampRate({ status: "voided" }), false);
});

Deno.test("a toll flagged reconciled without a closing status still freezes", () => {
  assertEquals(shouldStampRate({ status: "pending", isReconciled: true }), true);
});

Deno.test("re-saving a settled toll never re-prices it", () => {
  // The several reconciliation paths all funnel into one save, so this has to
  // be idempotent — and a back-dated publish must not get a second chance.
  const settled = {
    status: "reconciled",
    isReconciled: true,
    rateScheduleVersionId: "trv_abc",
    officialAmount: 380,
  };
  assertEquals(shouldStampRate(settled), false);
});

Deno.test("a half-written stamp does not lock a toll out of being priced", () => {
  // Version id present but no usable amount: leaving this unstampable would
  // strand the row with neither a frozen price nor a live one.
  assertEquals(
    shouldStampRate({ status: "reconciled", rateScheduleVersionId: "trv_abc", officialAmount: 0 }),
    false,
  );
  assertEquals(readRateStamp({ rateScheduleVersionId: "trv_abc", officialAmount: 0 }), null);
});
