/**
 * Pure enterprise reader helpers (no Supabase I/O).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyBusyEtaMinutes,
  clockToMinutes,
  evaluatePlatformOpen,
  evaluateRollout,
  isWithinDayHours,
  isWithinQuietHours,
  resolveBusyModeValue,
  rolloutPercentBucket,
  substituteTemplate,
  type PlatformServiceHours,
} from "./enterpriseReaders.ts";

const openDay = { open: "07:00", close: "23:00", closed: false };
const HOURS: PlatformServiceHours = {
  monday: { ...openDay },
  tuesday: { ...openDay },
  wednesday: { ...openDay },
  thursday: { ...openDay },
  friday: { ...openDay },
  saturday: { ...openDay },
  sunday: { ...openDay },
  outsideHoursMessage: "Closed for the night.",
};

/** Fixed Jamaica local: 2026-03-15 Sunday 12:00 (UTC-5 → 17:00Z). */
const SUNDAY_NOON = new Date("2026-03-15T17:00:00.000Z");
/** Sunday 02:00 Jamaica → 07:00Z. */
const SUNDAY_EARLY = new Date("2026-03-15T07:00:00.000Z");

Deno.test("clockToMinutes parses HH:MM", () => {
  assertEquals(clockToMinutes("07:30"), 7 * 60 + 30);
  assertEquals(clockToMinutes("23:00"), 23 * 60);
});

Deno.test("isWithinDayHours open window", () => {
  assertEquals(isWithinDayHours("07:00", "23:00", false, SUNDAY_NOON), true);
  assertEquals(isWithinDayHours("07:00", "23:00", false, SUNDAY_EARLY), false);
  assertEquals(isWithinDayHours("07:00", "23:00", true, SUNDAY_NOON), false);
});

Deno.test("evaluatePlatformOpen refuses outside hours", () => {
  const r = evaluatePlatformOpen(HOURS, [], SUNDAY_EARLY);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.code, "outside_hours");
    assertEquals(r.message, "Closed for the night.");
  }
});

Deno.test("evaluatePlatformOpen allows during hours", () => {
  const r = evaluatePlatformOpen(HOURS, [], SUNDAY_NOON);
  assertEquals(r.ok, true);
});

Deno.test("evaluatePlatformOpen refuses closed holiday", () => {
  const r = evaluatePlatformOpen(
    HOURS,
    [{ date: "2026-03-15", name: "Test Day", mode: "closed", message: "Holiday closed." }],
    SUNDAY_NOON,
  );
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.code, "holiday_closed");
    assertEquals(r.message, "Holiday closed.");
  }
});

Deno.test("resolveBusyModeValue auto-ends past autoEndAt", () => {
  const past = resolveBusyModeValue({
    active: true,
    extraEtaMinutes: 15,
    pauseNewRestaurants: true,
    bannerMessage: "Busy",
    autoEndAt: "2020-01-01T00:00:00.000Z",
  }, new Date("2026-01-01T00:00:00.000Z"));
  assertEquals(past.active, false);
  assertEquals(past.extraEtaMinutes, 0);
  assertEquals(past.pauseNewRestaurants, false);

  const future = resolveBusyModeValue({
    active: true,
    extraEtaMinutes: 15,
    pauseNewRestaurants: true,
    bannerMessage: "Busy",
    autoEndAt: "2099-01-01T00:00:00.000Z",
  }, new Date("2026-01-01T00:00:00.000Z"));
  assertEquals(future.active, true);
  assertEquals(future.extraEtaMinutes, 15);
});

Deno.test("applyBusyEtaMinutes adds when active", () => {
  assertEquals(
    applyBusyEtaMinutes(30, {
      active: true,
      extraEtaMinutes: 10,
      pauseNewRestaurants: false,
      bannerMessage: "",
      autoEndAt: null,
    }),
    40,
  );
  assertEquals(
    applyBusyEtaMinutes(30, {
      active: false,
      extraEtaMinutes: 10,
      pauseNewRestaurants: false,
      bannerMessage: "",
      autoEndAt: null,
    }),
    30,
  );
});

Deno.test("evaluateRollout modes", () => {
  assertEquals(evaluateRollout({ mode: "off", percent: 100, betaUserIds: [] }, "u1"), false);
  assertEquals(evaluateRollout({ mode: "on", percent: 0, betaUserIds: [] }, "u1"), true);
  assertEquals(
    evaluateRollout({ mode: "beta_list", percent: 0, betaUserIds: ["u1"] }, "u1"),
    true,
  );
  assertEquals(
    evaluateRollout({ mode: "beta_list", percent: 0, betaUserIds: ["u1"] }, "u2"),
    false,
  );
  const bucket = rolloutPercentBucket("stable-user");
  assertEquals(
    evaluateRollout({ mode: "percent", percent: bucket + 1, betaUserIds: [] }, "stable-user"),
    true,
  );
  assertEquals(
    evaluateRollout({ mode: "percent", percent: bucket, betaUserIds: [] }, "stable-user"),
    false,
  );
});

Deno.test("isWithinQuietHours wraps midnight", () => {
  // 22:00 Jamaica = 03:00 next day UTC on a non-DST date
  const late = new Date("2026-03-15T03:00:00.000Z"); // 22:00 Jamaica previous evening? Wait:
  // America/Jamaica is UTC-5 year-round. 03:00Z = 22:00 Jamaica previous calendar day.
  // For 2026-03-15T03:00:00Z → Jamaica 2026-03-14 22:00 — quiet 21–08 → yes
  assertEquals(isWithinQuietHours({ start: "21:00", end: "08:00" }, late), true);
  assertEquals(isWithinQuietHours({ start: "21:00", end: "08:00" }, SUNDAY_NOON), false);
});

Deno.test("substituteTemplate replaces placeholders", () => {
  assertEquals(
    substituteTemplate("Order {order_number} ETA {eta}.", {
      order_number: "R-1",
      eta: "25 min",
    }),
    "Order R-1 ETA 25 min.",
  );
});
