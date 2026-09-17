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
  const both = evaluateFuelWeekClosable({
    underExplainedUnreviewed: false,
    unattributedUnreviewed: true,
  });
  assertEquals(both.some((b) => b.code === "unattributed_unreviewed"), true);
  assertEquals(both.some((b) => b.code === "under_explained_unreviewed"), false);
  assertEquals(evaluateFuelWeekClosable({ unattributedUnreviewed: false }), []);
});
