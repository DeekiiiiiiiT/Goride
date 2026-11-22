/**
 * F-03 / F-05 (done-tests 1, 5, 11): fuel lines are built from v3-charged reports and must add
 * up to each driver's shares; lines and statements are written before the lock; a reopen
 * reverses the lines before the week unlocks.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import { buildFuelWeekLineRows, snapshotsChargedByV3 } from "./fuel_week_lines.ts";
import { priceFuelWeekV3 } from "../../../packages/fuel-core/src/fuelEngineV3.ts";

const v3 = priceFuelWeekV3({
  spendWithOdometer: 24_500,
  spendNoOdometer: 1_000,
  odometerKm: 1_503,
  chainUsable: true,
  km: { trips: 1_320, pickups: 150, companyErrands: 0, personal: 0, commute: 18 },
  rule: { coverageType: "Percentage", rideShareCoverage: 80, deadheadCoverage: 50, companyUsageCoverage: 100, personalCoverage: 0 },
  commuteCompanyPct: 100,
  leftover: { mode: "percentage", driverPercent: 50, appliesTo: ["unattributedKm", "noOdometerFills"] },
});
for (const l of v3.lines) l.vehicleId = "5179KZ";

const kenny = {
  driverId: "kenny",
  vehicleId: "5179KZ",
  driverShare: v3.driverShare,
  companyShare: v3.companyShare,
  metadata: { chargedBy: "fuel-chain-v3", fuelV3: v3 },
};

Deno.test("lines come only from v3-charged reports", () => {
  assert(snapshotsChargedByV3([kenny]));
  const old = { ...kenny, metadata: { fuelV3: v3, engineVersion: "fuel-chain-v2.2" } };
  assert(!snapshotsChargedByV3([old]));
  assertEquals(buildFuelWeekLineRows([old]), []);
});

Deno.test("one line per car × kind of driving, adding up to the driver's charge to the cent", () => {
  const rows = buildFuelWeekLineRows([kenny]);
  assertEquals(rows.map((r) => r.purpose), ["uber_trips", "to_pickups", "commute", "unexplained_km", "no_odometer_fills"]);
  assertEquals(rows.reduce((s, r) => s + r.driver_amount_minor, 0), Math.round(kenny.driverShare * 100));
  assertEquals(rows.reduce((s, r) => s + r.company_amount_minor, 0), Math.round(kenny.companyShare * 100));
  for (const r of rows) {
    assertEquals(r.driver_id, "kenny");
    assertEquals(r.vehicle_id, "5179KZ");
    assert(r.driver_amount_minor + r.company_amount_minor > 0);
  }
  const noOdo = rows.find((r) => r.purpose === "no_odometer_fills")!;
  assertEquals(noOdo.km, 0);
  assertEquals(noOdo.cost_per_km_minor, null);
  const trips = rows.find((r) => r.purpose === "uber_trips")!;
  assert(Math.abs(trips.cost_per_km_minor! - (25_500 - 1_000) / 1_503 * 100) < 1e-6);
});

Deno.test("lines that don't match the driver's statement amount refuse the lock, naming the driver", () => {
  const off = { ...kenny, driverShare: kenny.driverShare + 0.01 };
  const err = assertThrows(() => buildFuelWeekLineRows([off]));
  assert(String((err as Error).message).startsWith("FUEL_LINES_MISMATCH"));
  assertEquals((err as Error & { driverId?: string }).driverId, "kenny");
});

const routes = Deno.readTextFileSync(new URL("./fuel_period_routes.ts", import.meta.url)).replace(/\r\n/g, "\n");

Deno.test("F-05: lines and statements are written before the period flips to locked", () => {
  const finalize = routes.slice(routes.indexOf('if (kind === "finalize") {'), routes.indexOf('} else if (kind === "reopen") {'));
  const preLock = finalize.indexOf("writeLinesAndStatementsBeforeLock({");
  const flip = finalize.indexOf('status: "locked",\n        locked_at: now,');
  assert(preLock > 0 && flip > 0, "both steps found");
  assert(preLock < flip, "statements before the lock");
  // On failure nothing locks: the refusal branch returns before the flip.
  const refusal = finalize.slice(preLock, flip);
  assert(refusal.includes("if (!preLock.ok) {"));
  assert(refusal.includes('status: "ready"'));
  assert(refusal.includes("compensateCommittedFuelMoney("));
  assert(refusal.includes("notLocked: true"));
  // After the lock the old post-lock seal is skipped (step "rebuild").
  assert(finalize.slice(flip).includes('cursor.step = "rebuild";'));
});

Deno.test("F-05: a driver with a finalized report always gets a statement (no 'no activity' skip)", () => {
  const seal = Deno.readTextFileSync(new URL("./fuel_week_seal.ts", import.meta.url));
  assert(seal.includes("if (!hasActivity && !p.fuel_finalized && !opts.amountsByDriver?.[driverId]) continue;"));
  assert(seal.includes("collectFailures"));
});

Deno.test("F-03: a reopen reverses the lines before the week unlocks", () => {
  const reopen = routes.slice(routes.indexOf('} else if (kind === "reopen") {'));
  const reverse = reopen.indexOf("reverseFuelWeekLines(");
  const unlock = reopen.indexOf('status: "reopened"');
  assert(reverse > 0 && unlock > 0 && reverse < unlock);
});
