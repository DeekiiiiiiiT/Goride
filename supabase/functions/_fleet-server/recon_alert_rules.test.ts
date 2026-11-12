import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextEscalation, openAlerts, type AlertInputs } from "./recon_alert_rules.ts";
import { parseWeekHeader } from "./recon_week_version_guard.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const H = 3_600_000;
const quiet: AlertInputs = {
  nowMs: NOW,
  calculatorPaused: false,
  pausedSinceMs: null,
  oldestPendingAgeSeconds: null,
  pendingUnits: 0,
  failedUnits: 0,
  enqueueFailedSinceMs: null,
  openRunsOver14Days: 0,
  closeFailedWeeks: [],
  pendingApprovalsOver24h: 0,
  unsignedCorrectionsOver24h: 0,
  unexplainedShadowMismatch: false,
};

Deno.test("WRA-31: nothing wrong → no alerts", () => {
  assertEquals(openAlerts(quiet), []);
});

Deno.test("WRA-31: calculator paused alerts only after 1 hour", () => {
  assertEquals(openAlerts({ ...quiet, calculatorPaused: true, pausedSinceMs: NOW - 30 * 60_000 }), []);
  const [a] = openAlerts({ ...quiet, calculatorPaused: true, pausedSinceMs: NOW - 26 * H });
  assertEquals(a.kind, "calculator_paused");
  assertEquals(a.title, "Week calculator paused for 26 hours");
});

Deno.test("WRA-31: pending units alert only when the calculator is on and >15 min", () => {
  assertEquals(openAlerts({ ...quiet, pendingUnits: 3, oldestPendingAgeSeconds: 600 }), []);
  assertEquals(openAlerts({ ...quiet, calculatorPaused: true, pausedSinceMs: NOW, pendingUnits: 3, oldestPendingAgeSeconds: 3600 }), []);
  assertEquals(openAlerts({ ...quiet, pendingUnits: 3, oldestPendingAgeSeconds: 1000 })[0].kind, "unit_pending");
});

Deno.test("WRA-31: every listed condition raises its own alert, one per failed close week", () => {
  const kinds = openAlerts({
    ...quiet,
    failedUnits: 1,
    enqueueFailedSinceMs: NOW - H,
    openRunsOver14Days: 2,
    closeFailedWeeks: ["2026-09-21", "2026-09-28"],
    pendingApprovalsOver24h: 1,
    unsignedCorrectionsOver24h: 1,
    unexplainedShadowMismatch: true,
  }).map((a) => a.dedupeKey);
  assertEquals(kinds, [
    "unit_failed", "enqueue_failed", "week_overdue",
    "close_failed:2026-09-21", "close_failed:2026-09-28",
    "approval_waiting", "correction_unsigned", "shadow_mismatch",
  ]);
});

Deno.test("WRA-31: SMS steps — managers at 24 h, owner at 48 h, each once, none after Acknowledge", () => {
  const base = { nowMs: NOW, acknowledged: false, smsManagerSent: false, smsOwnerSent: false };
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 23 * H }), null);
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 24 * H }), "manager");
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 30 * H, smsManagerSent: true }), null);
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 48 * H, smsManagerSent: true }), "owner");
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 60 * H, smsManagerSent: true, smsOwnerSent: true }), null);
  assertEquals(nextEscalation({ ...base, raisedAtMs: NOW - 60 * H, acknowledged: true }), null);
});

Deno.test("WRA-27: x-recon-week header parsing", () => {
  assertEquals(parseWeekHeader(undefined), null);
  assertEquals(parseWeekHeader(""), null);
  assertEquals(parseWeekHeader("not-a-header"), "bad");
  assertEquals(
    parseWeekHeader("682072BF-3CED-420B-B38A-83DF2234BAE8@42"),
    { runId: "682072bf-3ced-420b-b38a-83df2234bae8", version: 42 },
  );
});
