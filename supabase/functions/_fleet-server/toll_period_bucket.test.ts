import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolvePeriodBucket } from "./toll_period_bucket.ts";

Deno.test("resolvePeriodBucket: orphan personal stays personal-use", () => {
  assertEquals(
    resolvePeriodBucket({
      workflowStage: "personal_use_pending",
      matchStatus: "orphan_personal",
      matchTypeCode: "PERSONAL_MATCH",
      matchReasonCode: "ORPHAN_NEARBY_UNEXPLAINED",
    }),
    "personal-use",
  );
});

Deno.test("resolvePeriodBucket: stale personal + AMOUNT_VARIANCE → underpaid-claims", () => {
  assertEquals(
    resolvePeriodBucket({
      workflowStage: "personal_use_pending",
      matchStatus: "matched",
      matchTypeCode: "AMOUNT_VARIANCE",
      matchedTripId: "trip-1",
    }),
    "underpaid-claims",
  );
});

Deno.test("resolvePeriodBucket: stale personal + DEADHEAD_MATCH → deadhead", () => {
  assertEquals(
    resolvePeriodBucket({
      workflowStage: "personal_use_pending",
      matchStatus: "matched",
      matchTypeCode: "DEADHEAD_MATCH",
      matchedTripId: "trip-1",
    }),
    "deadhead",
  );
});

Deno.test("resolvePeriodBucket: stale personal + PERFECT_MATCH → needs-review", () => {
  assertEquals(
    resolvePeriodBucket({
      workflowStage: "personal_use_pending",
      matchStatus: "matched",
      matchTypeCode: "PERFECT_MATCH",
      matchedTripId: "trip-1",
    }),
    "needs-review",
  );
});

Deno.test("resolvePeriodBucket: stale personal + ambiguous → needs-review", () => {
  assertEquals(
    resolvePeriodBucket({
      workflowStage: "personal_use_pending",
      matchStatus: "ambiguous",
      matchTypeCode: "AMOUNT_VARIANCE",
      isAmbiguous: true,
      matchedTripId: null,
    }),
    "needs-review",
  );
});
