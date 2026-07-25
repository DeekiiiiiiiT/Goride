import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { allocateTripRefundShare } from "./dispute_match_toll_enrichment.ts";
import { isFullyReimbursedViaTrip } from "./dispute_refund_eligibility.ts";

Deno.test("allocateTripRefundShare splits pool across sibling tolls in time order", () => {
  const siblings = [
    { id: "toll-a", date: "2026-06-30", time: "06:00:00", amount: 20 },
    { id: "toll-b", date: "2026-06-30", time: "12:58:00", amount: 380 },
  ];
  assertEquals(allocateTripRefundShare(380, "toll-a", siblings), 20);
  assertEquals(allocateTripRefundShare(380, "toll-b", siblings), 360);
});

Deno.test("later toll on shared trip is not fully reimbursed when pool exhausted", () => {
  const allocated = allocateTripRefundShare(380, "toll-b", [
    { id: "toll-a", date: "2026-06-30", time: "06:00:00", amount: 20 },
    { id: "toll-b", date: "2026-06-30", time: "12:58:00", amount: 380 },
  ]);
  assertEquals(isFullyReimbursedViaTrip(380, allocated), false);
});
