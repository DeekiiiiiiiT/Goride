/**
 * Fuel audit F-32a (done-test 21a): Reset period, Reopen and the per-driver report delete
 * need fuel.reopen, refuse a settled week, need a reason of at least 10 characters
 * (checked on the server), and the lock writes a `lock` audit row.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkFuelReopenReason,
  FUEL_REOPEN_REASON_MIN,
  fuelWeekSettled,
  type SettledLookups,
} from "./fuel_reopen_guard.ts";

const here = new URL(".", import.meta.url);
const read = (f: string) => Deno.readTextFileSync(new URL(f, here));

function lookups(over: Partial<Record<keyof SettledLookups, boolean>> = {}, seen: string[] = []): SettledLookups {
  return {
    financeLock: (o, w) => (seen.push(`finance:${o}:${w}`), Promise.resolve(over.financeLock ?? false)),
    driverPeriodClosed: (o, w) => (seen.push(`driver:${o}:${w}`), Promise.resolve(over.driverPeriodClosed ?? false)),
    reconRunClosed: (o, w, l) => (seen.push(`recon:${o}:${w}:${l}`), Promise.resolve(over.reconRunClosed ?? false)),
  };
}

Deno.test("reason: under 10 characters is refused, 10 or more passes trimmed", () => {
  assertEquals(FUEL_REOPEN_REASON_MIN, 10);
  for (const bad of [undefined, null, "", "   ", "sfsdfsdfs", "  123456789  "]) {
    const r = checkFuelReopenReason(bad);
    assertEquals(r.ok, false, String(bad));
    if (!r.ok) assertEquals(r.error, "reason_too_short");
  }
  const ok = checkFuelReopenReason("  Odometer fixed  ");
  assertEquals(ok, { ok: true, reason: "Odometer fixed" });
  assertEquals(checkFuelReopenReason("sfsdfsdfsd").ok, true); // exactly 10 — the length rule only
});

Deno.test("settled: open week is not settled", async () => {
  const seen: string[] = [];
  const r = await fuelWeekSettled("org1", "2026-11-16T00:00:00Z", "rideshare", lookups({}, seen));
  assertEquals(r, { settled: false });
  assertEquals(seen, ["finance:org1:2026-11-16", "driver:org1:2026-11-16", "recon:org1:2026-11-16:rideshare"]);
});

Deno.test("settled: each closed record refuses, and names itself", async () => {
  assertEquals(await fuelWeekSettled("o", "2026-11-09", null, lookups({ financeLock: true })), {
    settled: true,
    by: "finance_period_lock",
  });
  assertEquals(await fuelWeekSettled("o", "2026-11-09", null, lookups({ driverPeriodClosed: true })), {
    settled: true,
    by: "driver_settlement_closed",
  });
  assertEquals(await fuelWeekSettled("o", "2026-11-09", null, lookups({ reconRunClosed: true })), {
    settled: true,
    by: "week_reconciliation_closed",
  });
});

Deno.test("routes: F-32b — Reset and report delete are gone; reopen uses fuel.reopen and the guard", () => {
  const ctl = read("fuel_controller.tsx");
  assert(!ctl.includes("/finalized-reports/reset-period`"), "reset-period route removed");
  assert(!ctl.includes("/finalized-reports/:weekStart/:identityId`"), "report delete route removed");

  const routes = read("fuel_period_routes.ts");
  const reopen = routes.slice(routes.indexOf("`${BASE}/fuel/periods/:id/reopen`"));
  assert(reopen.startsWith("`${BASE}/fuel/periods/:id/reopen`,\n    requirePermission(\"fuel.reopen\")") ||
    reopen.replace(/\r\n/g, "\n").startsWith("`${BASE}/fuel/periods/:id/reopen`,\n    requirePermission(\"fuel.reopen\")"));
  const reopenBody = reopen.slice(0, reopen.indexOf("fuel_period_job"));
  assert(reopenBody.includes("checkFuelReopenReason(body.reason)"));
  assert(reopenBody.includes("fuelWeekSettled("));

  // The reopen job reverses (never deletes) and reinstates the P&L offsets of fills it unmarks.
  const src = routes.replace(/\r\n/g, "\n");
  const job = src.slice(src.indexOf("} else if (kind === \"reopen\") {"));
  assert(job.includes("reverseEnterpriseFuelSyncForSnapshot(snap, (entry) => unmarkedFills.push(entry))"));
  assert(job.indexOf("reinstateFuelPnlOffsetsForEntries") > 0 && job.indexOf("reinstateFuelPnlOffsetsForEntries") < job.indexOf("status: \"reopened\""));
  assert(!job.slice(0, job.indexOf("status: \"reopened\"")).includes("kv.del(`transaction:"), "reopen never deletes money rows");
});

Deno.test("lock: the finalize job and the backfill write a `lock` audit row", () => {
  const routes = read("fuel_period_routes.ts");
  const flip = routes.indexOf('status: "locked",\n        locked_at: now,') >= 0
    ? routes.indexOf('status: "locked",\n        locked_at: now,')
    : routes.replace(/\r\n/g, "\n").indexOf('status: "locked",\n        locked_at: now,');
  assert(flip > 0, "finalize job lock flip found");
  const src = routes.replace(/\r\n/g, "\n");
  const afterFlip = src.slice(src.indexOf('status: "locked",\n        locked_at: now,'));
  assert(afterFlip.slice(0, 900).includes('"lock",'), "lock audit right after the job's lock flip");
  const backfill = src.slice(src.indexOf("`${BASE}/fuel/periods/backfill`"));
  assert(backfill.slice(0, 5000).includes('source: "periods/backfill"'), "backfill writes a lock audit row");
});
