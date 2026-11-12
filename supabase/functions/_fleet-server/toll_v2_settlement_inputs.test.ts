import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findDriverTollLineInWeek,
  getCachedWeekDrivers,
  resolveTollInputs,
  shouldPassEOverrideTollStatement,
  v2DriverTollInputs,
  type DriverTollSettlementInputs,
  type WeekDriversBundle,
} from "./toll_v2_settlement_inputs.ts";

const legacy: DriverTollSettlementInputs = {
  tollChargedToDriver: 99,
  tollCashWashEligible: 88,
  tollSpend: 77,
  tollCashSpend: 66,
  tollTagSpend: 55,
  tollReimbursed: 44,
};

Deno.test("shouldPassEOverrideTollStatement — v2 skips statement override", () => {
  assertEquals(shouldPassEOverrideTollStatement("toll_v2"), false);
  assertEquals(shouldPassEOverrideTollStatement("legacy"), true);
});

Deno.test("getCachedWeekDrivers — one fetch for two drivers", async () => {
  let fetches = 0;
  const cache = new Map<string, WeekDriversBundle>();
  const bundle: WeekDriversBundle = {
    state: "open",
    weekKey: "2024-06-03",
    drivers: [
      { driverId: "drv-a", spendMinor: 100 },
      { driverId: "drv-b", spendMinor: 200 },
    ],
  };
  const fetch = async () => {
    fetches++;
    return bundle;
  };
  await getCachedWeekDrivers(cache, "org", "2024-06-03", fetch);
  await getCachedWeekDrivers(cache, "org", "2024-06-03", fetch);
  assertEquals(fetches, 1);
  assertEquals(findDriverTollLineInWeek(bundle, "drv-a")?.spendMinor, 100);
  assertEquals(findDriverTollLineInWeek(bundle, "drv-z"), null);
});

Deno.test("v2DriverTollInputs — null line yields zeros", () => {
  const out = v2DriverTollInputs(null);
  assertEquals(out.tollChargedToDriver, 0);
  assertEquals(out.tollCashWashEligible, 0);
  assertEquals(out.tollSpend, 0);
});

Deno.test("v2DriverTollInputs — minor to major rounding", () => {
  const out = v2DriverTollInputs({
    owesFleetMinor: 12345,
    fleetOwesMinor: 50,
    spendMinor: 20000,
    cashSpendMinor: 5000,
    tagSpendMinor: 15000,
    platformMinor: 333,
  });
  assertEquals(out.tollChargedToDriver, 123.45);
  assertEquals(out.tollCashWashEligible, 0.5);
  assertEquals(out.tollSpend, 200);
  assertEquals(out.tollCashSpend, 50);
  assertEquals(out.tollTagSpend, 150);
  assertEquals(out.tollReimbursed, 3.33);
});

Deno.test("resolveTollInputs — non-v2 never fetches driver week tolls", async () => {
  let fetched = false;
  const out = await resolveTollInputs(
    "00000000-0000-4000-8000-000000000099",
    "drv-1",
    "2024-06-03",
    legacy,
    {
      isTollsV2On: async () => false,
      fetchDriverWeekTolls: async () => {
        fetched = true;
        return { line: null };
      },
    },
  );
  assertEquals(fetched, false);
  assertEquals(out.tollSource, "legacy");
  assertEquals(out.tollChargedToDriver, 99);
});

Deno.test("resolveTollInputs — v2 uses RPC line", async () => {
  const out = await resolveTollInputs(
    "00000000-0000-4000-8000-000000000001",
    "drv-1",
    "2024-06-03",
    legacy,
    {
      isTollsV2On: async () => true,
      fetchDriverWeekTolls: async () => ({
        line: { owesFleetMinor: 1000, fleetOwesMinor: 2000, spendMinor: 3000, cashSpendMinor: 1000, tagSpendMinor: 2000, platformMinor: 400 },
      }),
    },
  );
  assertEquals(out.tollSource, "toll_v2");
  assertEquals(out.tollChargedToDriver, 10);
  assertEquals(out.tollCashWashEligible, 20);
});

Deno.test("resolveTollInputs — v2 lookup failure throws", async () => {
  await assertRejects(
    () =>
      resolveTollInputs("org", "drv", "2024-06-03", legacy, {
        isTollsV2On: async () => true,
        fetchDriverWeekTolls: async () => {
          throw new Error("permission denied");
        },
      }),
    Error,
    "permission denied",
  );
});
