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

Deno.test("F-1: disposed integrity_critical does not re-block via legacy fallback", async () => {
  const { entryBlocksFinalizeForFlags } = await import("./fuel_week_closable_gate.ts");
  const entryId = "91aff97e-8e26-42ac-b383-2922819b58c0";
  const entry = {
    id: entryId,
    metadata: {
      integrityStatus: "critical",
      signalTier: "observe",
      anomalyReason: "Odometer Regression",
    },
  };
  const disposed = new Set([`${entryId}::integrity_critical`]);
  assertEquals(entryBlocksFinalizeForFlags(entry, disposed), false);
});

Deno.test("F-1: undisposed integrity_critical still blocks", async () => {
  const { entryBlocksFinalizeForFlags } = await import("./fuel_week_closable_gate.ts");
  const entry = {
    id: "e-open",
    metadata: { integrityStatus: "critical", signalTier: "observe" },
  };
  assertEquals(entryBlocksFinalizeForFlags(entry, new Set()), true);
});

Deno.test("F-1: legacy signal_exception without integrity still blocks when undisposed", async () => {
  const { entryBlocksFinalizeForFlags } = await import("./fuel_week_closable_gate.ts");
  const entry = {
    id: "e-legacy",
    metadata: { signalTier: "exception" },
  };
  assertEquals(entryBlocksFinalizeForFlags(entry, new Set()), true);
  assertEquals(
    entryBlocksFinalizeForFlags(entry, new Set(["e-legacy::signal_exception"])),
    false,
  );
});

Deno.test("disposition_load_failed blocks distinctly from undisposed_flags", () => {
  const b = evaluateFuelWeekClosable({ dispositionLoadFailed: true });
  assertEquals(b.some((x) => x.code === "disposition_load_failed"), true);
  assertEquals(b.some((x) => x.code === "undisposed_flags"), false);
});

Deno.test("disposition_load_failed prefers over undisposed_flags when both set", () => {
  const b = evaluateFuelWeekClosable({
    dispositionLoadFailed: true,
    undisposedCriticalFlags: true,
  });
  assertEquals(b.some((x) => x.code === "disposition_load_failed"), true);
  assertEquals(b.some((x) => x.code === "undisposed_flags"), false);
});
