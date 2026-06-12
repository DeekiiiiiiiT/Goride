import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SCHEDULED_MAX_LEAD_MS,
  SCHEDULED_MIN_LEAD_MS,
  clampPickupWindowMinutes,
  parseScheduledPickupAt,
  validateScheduledPickupWindow,
} from "./validation.ts";

Deno.test("parseScheduledPickupAt accepts ISO string", () => {
  const d = parseScheduledPickupAt("2026-06-21T08:30:00.000Z");
  assertEquals(d instanceof Date, true);
});

Deno.test("validateScheduledPickupWindow rejects too soon", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const pickup = new Date(now.getTime() + 10 * 60_000);
  assertEquals(validateScheduledPickupWindow(pickup, now), "scheduled_too_soon");
});

Deno.test("validateScheduledPickupWindow accepts 2h window", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const pickup = new Date(now.getTime() + 2 * 60 * 60_000);
  assertEquals(validateScheduledPickupWindow(pickup, now), null);
});

Deno.test("validateScheduledPickupWindow rejects beyond 7 days", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const pickup = new Date(now.getTime() + SCHEDULED_MAX_LEAD_MS + 60_000);
  assertEquals(validateScheduledPickupWindow(pickup, now), "scheduled_too_far");
});

Deno.test("clampPickupWindowMinutes bounds 5-30", () => {
  assertEquals(clampPickupWindowMinutes(3), 5);
  assertEquals(clampPickupWindowMinutes(15), 15);
  assertEquals(clampPickupWindowMinutes(99), 30);
});

Deno.test("scheduled min/max constants", () => {
  assertEquals(SCHEDULED_MIN_LEAD_MS, 30 * 60_000);
  assertEquals(SCHEDULED_MAX_LEAD_MS, 7 * 24 * 60 * 60_000);
});
