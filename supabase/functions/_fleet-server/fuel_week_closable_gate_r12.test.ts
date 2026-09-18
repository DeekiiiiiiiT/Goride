/**
 * R-1 / R-2 Deno fixtures — reviewed flags clear closable codes.
 */
import { assertEquals } from "jsr:@std/assert";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";

Deno.test("R-2: odometer_chain_unusable clears when reviewed (caller passes false)", () => {
  assertEquals(
    evaluateFuelWeekClosable({ odometerChainUnusable: true }).some(
      (b) => b.code === "odometer_chain_unusable",
    ),
    true,
  );
  assertEquals(evaluateFuelWeekClosable({ odometerChainUnusable: false }), []);
});

Deno.test("R-1: unattributed_unreviewed independent of under_explained", () => {
  assertEquals(
    evaluateFuelWeekClosable({
      underExplainedUnreviewed: false,
      unattributedUnreviewed: true,
    }).some((b) => b.code === "unattributed_unreviewed"),
    true,
  );
  assertEquals(
    evaluateFuelWeekClosable({
      underExplainedUnreviewed: false,
      unattributedUnreviewed: true,
    }).some((b) => b.code === "under_explained_unreviewed"),
    false,
  );
  assertEquals(evaluateFuelWeekClosable({ unattributedUnreviewed: false }), []);
});

Deno.test("undisposed_flags blocks when critical flags not dispositioned", () => {
  assertEquals(
    evaluateFuelWeekClosable({ undisposedCriticalFlags: true }).some(
      (b) => b.code === "undisposed_flags",
    ),
    true,
  );
  assertEquals(evaluateFuelWeekClosable({ undisposedCriticalFlags: false }), []);
});

Deno.test("data_quality_unreviewed blocks when flagged vehicles unreviewed", () => {
  assertEquals(
    evaluateFuelWeekClosable({ dataQualityVehiclesUnreviewed: true }).some(
      (b) => b.code === "data_quality_unreviewed",
    ),
    true,
  );
  assertEquals(evaluateFuelWeekClosable({ dataQualityVehiclesUnreviewed: false }), []);
});

Deno.test("undisposed_flags prefers over legacy exception_fills when both set", () => {
  const b = evaluateFuelWeekClosable({
    undisposedCriticalFlags: true,
    hasUnacknowledgedExceptionFills: true,
  });
  assertEquals(b.some((x) => x.code === "undisposed_flags"), true);
  assertEquals(b.some((x) => x.code === "exception_fills"), false);
});
