import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hardUseKeepColumns,
  hardUseOverrideRefusal,
  hardUseView,
  parseHardUseBody,
  validateHardUsePolicyPatch,
} from "./maintenance_hard_use_routes.ts";

Deno.test("step 16c: both keeps need a reason of at least 10 characters; auto never does", () => {
  assertEquals(hardUseOverrideRefusal("keep_normal", ""), "Say why (at least 10 characters).");
  assertEquals(hardUseOverrideRefusal("keep_hard", "busy"), "Say why (at least 10 characters).");
  assertEquals(hardUseOverrideRefusal("keep_normal", "Car moved to private use"), null);
  assertEquals(hardUseOverrideRefusal("keep_hard", "Tows a trailer every day"), null);
  assertEquals(hardUseOverrideRefusal("auto", undefined), null);
});

Deno.test("step 16c: the old Fleet body still works (off = keep normal, on = keep shorter)", () => {
  assertEquals(parseHardUseBody({ mode: "auto" }), { mode: "auto", reason: "" });
  assertEquals(parseHardUseBody({ severe_duty: false, reason: "Private car now" }), { mode: "keep_normal", reason: "Private car now" });
  assertEquals(parseHardUseBody({ severe_duty: true }), { mode: "keep_hard", reason: "Shorter schedules chosen in Fleet" });
  assertEquals("error" in parseHardUseBody({}), true);
  assertEquals("error" in parseHardUseBody({ mode: "off" }), true);
});

Deno.test("step 16c: a keep lasts the policy's days and sets the matching columns", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  const normal = hardUseKeepColumns("keep_normal", { kept_normal_days: 90, kept_hard_days: 30 }, now);
  assertEquals(normal.severe_duty, false);
  assertEquals(normal.severe_duty_source, "fleet_kept_normal");
  assertEquals(normal.severe_duty_kept_normal_until, "2027-02-26T12:00:00.000Z");
  assertEquals(normal.severe_duty_kept_hard_until, null);
  assertEquals(normal.severe_duty_why, "Kept on normal schedules by the fleet until 26 Feb 2027.");
  const hard = hardUseKeepColumns("keep_hard", { kept_normal_days: 90, kept_hard_days: 30 }, now);
  assertEquals(hard.severe_duty, true);
  assertEquals(hard.severe_duty_source, "fleet_kept_hard");
  assertEquals(hard.severe_duty_kept_hard_until, "2026-12-28T12:00:00.000Z");
  assertEquals(hard.severe_duty_kept_normal_until, null);
});

Deno.test("step 16e: Dominion limits are range-checked", () => {
  assertEquals(validateHardUsePolicyPatch({ baseline_km_per_year: 12000, high_use_multiple: 1.5 }), {
    patch: { baseline_km_per_year: 12000, high_use_multiple: 1.5 },
  });
  assertEquals("error" in validateHardUsePolicyPatch({ high_use_multiple: 0.5 }), true);
  assertEquals("error" in validateHardUsePolicyPatch({ clear_days: 2.5 }), true);
  assertEquals("error" in validateHardUsePolicyPatch({ window_days: 30, min_span_days: 60 }), true);
  assertEquals("error" in validateHardUsePolicyPatch({}), true);
});

Deno.test("step 16c: the drawer view reads the car's decision", () => {
  const v = hardUseView(
    { severe_duty: true, severe_duty_source: "auto", severe_duty_why: "19,262 km in 88 days, 8.0× the normal 10,000 km a year" },
    { baseline_km_per_year: 10000, high_use_multiple: 2, window_days: 90, kept_normal_days: 90, kept_hard_days: 90 },
  );
  assertEquals(v.hardUse, true);
  assertEquals(v.source, "auto");
  assertEquals(v.policy?.highUseMultiple, 2);
  assertEquals(hardUseView(null, null).hardUse, false);
});
