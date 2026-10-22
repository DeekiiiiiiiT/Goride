/**
 * Run: deno test supabase/functions/_fleet-server/trip_week_guard.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appLoggedWriteAnchors,
  deleteTripDecision,
  tripPayAnchor,
  writeBlockedReason,
} from "./trip_week_guard.ts";

const logged = {
  id: "manual_1c4f6742",
  batchId: "live_driver_app",
  driverId: "driver-1",
  date: "2026-10-04",
  amount: 2500,
};

Deno.test("a late Sunday ride uses the Jamaica day, not the UTC date", () => {
  assertEquals(
    tripPayAnchor({ ...logged, date: "2026-10-05T02:18:00.000Z" }),
    "2026-09-28",
  );
  assertEquals(tripPayAnchor(logged), "2026-09-28");
});

Deno.test("delete refuses imports and closed weeks, and does not call a missing week locked", () => {
  assertEquals(deleteTripDecision(null, "open").allow, false);
  assertEquals(deleteTripDecision({ id: "uber-1", batchId: "uber_csv" }, "open"), {
    allow: false,
    status: 409,
    error: "Imported trips stay in the ledger.",
  });
  assertEquals(deleteTripDecision(logged, "frozen").allow, false);
  const missing = deleteTripDecision(logged, "missing");
  assertEquals(missing.allow, true);
  if (missing.allow) {
    assertEquals(missing.weekMissing, true);
    assertEquals(missing.rebuild, false);
  }
  const open = deleteTripDecision(logged, "open");
  assertEquals(open.allow, true);
  if (open.allow) assertEquals(open.rebuild, true);
});

Deno.test("csv saves are not gated; an app-logged edit checks both weeks", () => {
  assertEquals(
    appLoggedWriteAnchors({ id: "uber-1", batchId: "uber_csv", date: "2026-10-04", driverId: "d" }, null),
    null,
  );
  const pairs = appLoggedWriteAnchors(
    { ...logged, date: "2026-10-06" },
    { ...logged, date: "2026-10-04" },
  );
  assertEquals(pairs?.length, 2);
  assertEquals(writeBlockedReason(pairs, ["open", "frozen"]), "That pay week is closed, so this trip cannot be changed.");
  assertEquals(writeBlockedReason(pairs, ["open", "open"]), null);
});
