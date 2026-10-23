import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blockerRowsForScope } from "./recon_week_blocker_rows.ts";
import type { CloseBlocker } from "../../../packages/finance-core/src/closeInvariants.ts";

const NOW = "2026-10-23T00:00:00.000Z";
const WEEK = { orgId: "org", weekKey: "2026-10-12", serviceLine: "rideshare" as const, driverId: null };

function blocker(code: string, extra: Partial<CloseBlocker> = {}): CloseBlocker {
  return { code, severity: "block", persisted: 0, expected: 0, delta: 0, message: code, ...extra };
}

Deno.test("R19-01: two sources with the same code keep one row each", () => {
  const rows = blockerRowsForScope(WEEK, [
    blocker("SOURCE_NO_ACTIVITY", { sourceId: "uber_trips", severity: "warn" }),
    blocker("SOURCE_NO_ACTIVITY", { sourceId: "indrive_trips", severity: "warn" }),
  ], NOW);
  assertEquals(rows.map((r) => r.source_id), ["uber_trips", "indrive_trips"]);
  assertEquals(new Set(rows.map((r) => r.fingerprint)).size, 2);
});

Deno.test("R19-01: same code on several fields merges into one row and keeps the worst severity", () => {
  const rows = blockerRowsForScope({ ...WEEK, driverId: "d1" }, [
    blocker("FUEL_ENGINE_DRIFT", { severity: "warn", message: "driver share", delta: 5 }),
    blocker("FUEL_ENGINE_DRIFT", { severity: "block", message: "fleet share", delta: -5 }),
  ], NOW);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].severity, "block");
  assertEquals(rows[0].message, "driver share; fleet share");
  assertEquals(rows[0].delta, null);
});

Deno.test("R19-01: amounts are saved so Close can say how far off a check is", () => {
  const [row] = blockerRowsForScope(WEEK, [
    blocker("SETTLEMENT_PNL_MISMATCH", { persisted: 100, expected: 90, delta: 10 }),
  ], NOW);
  assertEquals([row.persisted, row.expected, row.delta, row.source_id, row.driver_id], [100, 90, 10, null, null]);
});

Deno.test("R19-01: no blockers means no rows (the writer then deletes the old ones)", () => {
  assertEquals(blockerRowsForScope(WEEK, [], NOW), []);
});
