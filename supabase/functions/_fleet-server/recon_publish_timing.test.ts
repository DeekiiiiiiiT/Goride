import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DESK_HOLD_CAP_MS, DESK_QUIET_MS, decideDeskPublish } from "./recon_publish_timing.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");

Deno.test("WRA-27: publishes when the week has been quiet for 45 s and nothing holds it", () => {
  assertEquals(
    decideDeskPublish({ nowMs: NOW, lastChangeAtMs: NOW - DESK_QUIET_MS, holdUntilMs: null, heldSinceMs: null }),
    { publish: true, reason: "quiet" },
  );
  assertEquals(
    decideDeskPublish({ nowMs: NOW, lastChangeAtMs: null, holdUntilMs: null, heldSinceMs: null }).publish,
    true,
  );
});

Deno.test("WRA-27: waits out the 45 s quiet window after a change", () => {
  const d = decideDeskPublish({ nowMs: NOW, lastChangeAtMs: NOW - 10_000, holdUntilMs: null, heldSinceMs: null });
  assertEquals(d, { publish: false, retryInSeconds: 35, reason: "recent_change" });
});

Deno.test("WRA-27: respects a user hold", () => {
  const d = decideDeskPublish({
    nowMs: NOW,
    lastChangeAtMs: NOW - 60_000,
    holdUntilMs: NOW + 90_000,
    heldSinceMs: NOW - 30_000,
  });
  assertEquals(d, { publish: false, retryInSeconds: 90, reason: "held" });
});

Deno.test("WRA-27: a hold never delays a publish past 15 minutes in a row", () => {
  const capped = decideDeskPublish({
    nowMs: NOW,
    lastChangeAtMs: NOW - 60_000,
    holdUntilMs: NOW + 120_000,
    heldSinceMs: NOW - DESK_HOLD_CAP_MS,
  });
  assertEquals(capped, { publish: true, reason: "hold_cap_reached" });

  // Near the cap, the retry lands at the cap, not at the end of the hold.
  const nearCap = decideDeskPublish({
    nowMs: NOW,
    lastChangeAtMs: NOW - 60_000,
    holdUntilMs: NOW + 120_000,
    heldSinceMs: NOW - (DESK_HOLD_CAP_MS - 30_000),
  });
  assertEquals(nearCap, { publish: false, retryInSeconds: 30, reason: "held" });
});

Deno.test("WRA-27: an expired hold does not delay", () => {
  assertEquals(
    decideDeskPublish({ nowMs: NOW, lastChangeAtMs: NOW - 60_000, holdUntilMs: NOW - 1, heldSinceMs: NOW - 200_000 }).publish,
    true,
  );
});
