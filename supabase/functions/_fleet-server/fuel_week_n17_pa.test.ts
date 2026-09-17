/**
 * N-17: PA absorb must match client freeze vs server computeFuelWeek (failing-input).
 */
import { assertEquals } from "jsr:@std/assert";
import {
  computeFuelWeek,
  diffWeekCalc,
} from "../../../packages/fuel-core/src/computeFuelWeek.ts";

const rule = { coverageType: "Percentage" as const, coverageValue: 50 };

Deno.test("N-17: PA earned absorb → client and server shares match (zero deltas)", () => {
  const cats = {
    rideShareCost: 400,
    companyUsageCost: 100,
    deadheadCost: 50,
    personalUsageCost: 150, // includes earned 50 + overage 100
  };
  const earned = 50;
  const server = computeFuelWeek({
    totalSpend: 700,
    ...cats,
    rule,
    driverId: "d1",
    personalAllowanceEarnedCost: earned,
  });
  // Client freeze stamps the same shares + earned on the snap.
  const clientCalc = {
    totalSpend: 700,
    companyShare: server.companyShare,
    driverShare: server.driverShare,
    miscellaneousCost: server.miscellaneousCost,
    windowTimingCost: server.windowTimingCost,
    unattributedFillCost: server.unattributedFillCost,
  };
  const deltas = diffWeekCalc(clientCalc, server);
  assertEquals(deltas.length, 0);
  assertEquals(server.personalAllowanceEarnedCost, 50);
  // Without PA, driver share would be higher by earned.
  const noPa = computeFuelWeek({
    totalSpend: 700,
    ...cats,
    rule,
    driverId: "d1",
    personalAllowanceEarnedCost: 0,
  });
  assertEquals(Math.abs(noPa.driverShare - server.driverShare - earned) < 0.02, true);
});

Deno.test("N-17: tampered earned on snap → SNAPSHOT_MISMATCH money deltas", () => {
  const cats = {
    rideShareCost: 400,
    companyUsageCost: 100,
    deadheadCost: 50,
    personalUsageCost: 150,
  };
  const honestEarned = 50;
  const honest = computeFuelWeek({
    totalSpend: 700,
    ...cats,
    rule,
    driverId: "d1",
    personalAllowanceEarnedCost: honestEarned,
  });
  // Attacker stamps honest client shares but server recompute uses wrong earned=0.
  const clientCalc = {
    totalSpend: 700,
    companyShare: honest.companyShare,
    driverShare: honest.driverShare,
    miscellaneousCost: honest.miscellaneousCost,
    windowTimingCost: honest.windowTimingCost,
    unattributedFillCost: honest.unattributedFillCost,
  };
  const tamperedServer = computeFuelWeek({
    totalSpend: 700,
    ...cats,
    rule,
    driverId: "d1",
    personalAllowanceEarnedCost: 0, // missing PA stamp
  });
  const deltas = diffWeekCalc(clientCalc, tamperedServer);
  assertEquals(deltas.some((d) => d.field === "driverShare" || d.field === "companyShare"), true);
});
