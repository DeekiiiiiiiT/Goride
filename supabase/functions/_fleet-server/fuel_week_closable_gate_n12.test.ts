/**
 * N-12: stale closableKvCache must not hide exception fills after a fresh evaluate.
 */
import { assertEquals } from "jsr:@std/assert";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";
import {
  __closableKvCacheSizeForTest,
  __seedClosableKvCacheForTest,
  buildFuelWeekClosableInputForPeriod,
  clearFuelWeekClosableKvCache,
  weekHasUnackedExceptionFills,
} from "./fuel_week_closable_gate.ts";

const ORG = "org-n12";
const WEEK_START = "2026-08-10";
const WEEK_END = "2026-08-16";

Deno.test("N-12: invalidate-on-evaluate surfaces exception after stale empty cache", async () => {
  clearFuelWeekClosableKvCache();
  // Stale warm-isolate state: empty entries would hide a real exception fill.
  __seedClosableKvCacheForTest(ORG, WEEK_START, WEEK_END, {
    disputes: [],
    entries: [],
    transactions: [],
  });

  // A failed live fuel read must not look like a clean week. The stale empty
  // seed would have answered "no exceptions" and let the week close.
  let surfaced: unknown = null;
  try {
    await buildFuelWeekClosableInputForPeriod(
      ORG,
      {
        week_start: WEEK_START,
        week_end: WEEK_END,
        counts: { finalize: { actionable: 0 } },
        unexplained: 0,
        total_spend: 100,
        leakage_reviewed_at: new Date().toISOString(),
      },
      [],
    );
  } catch (e) {
    surfaced = e;
  }
  const message = surfaced instanceof Error ? surfaced.message : String(surfaced ?? "");
  assertEquals(message.includes("fleet read failed"), true);
  // Invalidate dropped the seed before the live read; it was not reused.
  assertEquals(__closableKvCacheSizeForTest(), 0);

  const blockers = evaluateFuelWeekClosable({
    hasUnacknowledgedExceptionFills: true,
  });
  assertEquals(blockers.some((b) => b.code === "exception_fills"), true);
});

Deno.test("N-12: seeded exception entry is visible after invalidate + reseed as live bundle", async () => {
  clearFuelWeekClosableKvCache();
  __seedClosableKvCacheForTest(ORG, WEEK_START, WEEK_END, {
    disputes: [],
    entries: [],
    transactions: [],
  });
  // Simulate post-invalidate fresh bundle containing an unacked exception.
  clearFuelWeekClosableKvCache();
  __seedClosableKvCacheForTest(ORG, WEEK_START, WEEK_END, {
    disputes: [],
    entries: [
      {
        id: "e-ex",
        date: "2026-08-12",
        organizationId: ORG,
        metadata: { signalTier: "exception" },
      },
    ],
    transactions: [],
  });
  const hit = await weekHasUnackedExceptionFills(ORG, WEEK_START, WEEK_END);
  assertEquals(hit, true);
  clearFuelWeekClosableKvCache();
});
