import {
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  calculateWaitTimeFee,
  isGracePeriodExpired,
  getGraceRemainingSeconds,
  formatWaitTimeFee,
  getWaitTimeGraceAnchor,
  buildWaitTimeInfo,
} from "./waitTime.ts";

Deno.test("calculateWaitTimeFee - within grace period", () => {
  const arrivedAt = new Date("2026-01-15T10:00:00Z");
  const tripStartAt = new Date("2026-01-15T10:01:30Z"); // 1.5 minutes later
  
  const result = calculateWaitTimeFee({
    graceStartedAt: arrivedAt.toISOString(),
    tripStartedAt: tripStartAt.toISOString(),
    graceMinutes: 2,
    ratePerMinMinor: 50,
    surgeMultiplier: 1,
  });
  
  assertEquals(result.feeMinor, 0);
  assertEquals(result.billableMinutes, 0);
  assertEquals(result.isGraceExpired, false);
  assertAlmostEquals(result.totalWaitMinutes, 1.5, 0.01);
});

Deno.test("calculateWaitTimeFee - grace period expired", () => {
  const arrivedAt = new Date("2026-01-15T10:00:00Z");
  const tripStartAt = new Date("2026-01-15T10:05:00Z"); // 5 minutes later
  
  const result = calculateWaitTimeFee({
    graceStartedAt: arrivedAt.toISOString(),
    tripStartedAt: tripStartAt.toISOString(),
    graceMinutes: 2,
    ratePerMinMinor: 50,
    surgeMultiplier: 1,
  });
  
  assertEquals(result.feeMinor, 150); // 3 minutes * 50 cents
  assertEquals(result.billableMinutes, 3);
  assertEquals(result.isGraceExpired, true);
  assertEquals(result.totalWaitMinutes, 5);
});

Deno.test("calculateWaitTimeFee - with surge multiplier", () => {
  const arrivedAt = new Date("2026-01-15T10:00:00Z");
  const tripStartAt = new Date("2026-01-15T10:05:00Z"); // 5 minutes later
  
  const result = calculateWaitTimeFee({
    graceStartedAt: arrivedAt.toISOString(),
    tripStartedAt: tripStartAt.toISOString(),
    graceMinutes: 2,
    ratePerMinMinor: 50,
    surgeMultiplier: 1.5,
  });
  
  assertEquals(result.feeMinor, 225); // 3 minutes * 50 cents * 1.5 surge = 225 (rounded)
  assertEquals(result.billableMinutes, 3);
});

Deno.test("calculateWaitTimeFee - with live calculation (no trip started)", () => {
  const arrivedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
  
  const result = calculateWaitTimeFee({
    graceStartedAt: arrivedAt.toISOString(),
    tripStartedAt: null,
    graceMinutes: 2,
    ratePerMinMinor: 50,
    surgeMultiplier: 1,
  });
  
  assertEquals(result.isGraceExpired, true);
  assertAlmostEquals(result.billableMinutes, 1, 0.1);
  assertEquals(result.feeMinor, Math.round(result.billableMinutes * 50));
});

Deno.test("calculateWaitTimeFee - invalid arrival timestamp", () => {
  const result = calculateWaitTimeFee({
    graceStartedAt: "invalid-date",
    tripStartedAt: null,
    graceMinutes: 2,
    ratePerMinMinor: 50,
    surgeMultiplier: 1,
  });
  
  assertEquals(result.feeMinor, 0);
  assertEquals(result.billableMinutes, 0);
  assertEquals(result.isGraceExpired, false);
});

Deno.test("calculateWaitTimeFee - zero rate", () => {
  const arrivedAt = new Date("2026-01-15T10:00:00Z");
  const tripStartAt = new Date("2026-01-15T10:05:00Z");
  
  const result = calculateWaitTimeFee({
    graceStartedAt: arrivedAt.toISOString(),
    tripStartedAt: tripStartAt.toISOString(),
    graceMinutes: 2,
    ratePerMinMinor: 0,
    surgeMultiplier: 1,
  });
  
  assertEquals(result.feeMinor, 0);
  assertEquals(result.isGraceExpired, true);
});

Deno.test("isGracePeriodExpired - not expired", () => {
  const arrivedAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
  assertEquals(isGracePeriodExpired(arrivedAt.toISOString(), 2), false);
});

Deno.test("isGracePeriodExpired - expired", () => {
  const arrivedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
  assertEquals(isGracePeriodExpired(arrivedAt.toISOString(), 2), true);
});

Deno.test("getGraceRemainingSeconds - has remaining", () => {
  const arrivedAt = new Date(Date.now() - 30 * 1000); // 30 seconds ago
  const remaining = getGraceRemainingSeconds(arrivedAt.toISOString(), 2);
  assertEquals(remaining > 80 && remaining <= 90, true);
});

Deno.test("getGraceRemainingSeconds - expired", () => {
  const arrivedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
  assertEquals(getGraceRemainingSeconds(arrivedAt.toISOString(), 2), 0);
});

Deno.test("formatWaitTimeFee - formats currency", () => {
  const formatted = formatWaitTimeFee(15000, "JMD");
  assertEquals(formatted.includes("150"), true);
});

Deno.test("formatWaitTimeFee - returns empty for zero", () => {
  assertEquals(formatWaitTimeFee(0, "JMD"), "");
  assertEquals(formatWaitTimeFee(-10, "JMD"), "");
});

Deno.test("getWaitTimeGraceAnchor prefers geofence start over arrived", () => {
  const anchor = getWaitTimeGraceAnchor({
    status: "driver_arrived_pickup",
    wait_time_started_at: "2026-01-15T10:00:00Z",
    arrived_pickup_at: "2026-01-15T10:00:20Z",
  });
  assertEquals(anchor, "2026-01-15T10:00:00Z");
});

Deno.test("buildWaitTimeInfo exposes grace countdown", () => {
  const started = new Date(Date.now() - 30_000).toISOString();
  const info = buildWaitTimeInfo(started, {
    wait_time_charge_enabled: true,
    wait_time_grace_minutes: 2,
    wait_time_rate_per_min_minor: 50,
  });
  assertEquals(info.wait_time_grace_expired, false);
  assertEquals(info.wait_time_grace_remaining_seconds > 80, true);
});
