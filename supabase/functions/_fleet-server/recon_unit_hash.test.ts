import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDriverWeekHashInput,
  statementHashLines,
  tollV2HashLine,
} from "./recon_unit_hash.ts";
import { sha256Hex } from "./recon_projection.ts";
import { statementBackedSettlement } from "../../../packages/finance-core/src/driverPeriodSettlement.ts";

Deno.test("WRA-67: earnings reseal changes statement supplement lines", () => {
  const v42 = statementHashLines([
    { kind: "earnings", version: 42, source_hash: "hash-a" },
    { kind: "fuel", version: 3, source_hash: "f" },
    { kind: "toll", version: 2, source_hash: "t" },
  ]);
  const v43 = statementHashLines([
    { kind: "earnings", version: 43, source_hash: "hash-b" },
    { kind: "fuel", version: 3, source_hash: "f" },
    { kind: "toll", version: 2, source_hash: "t" },
  ]);
  assertNotEquals(v42.join("\n"), v43.join("\n"));
  assert(v43.some((l) => l === "stmt|earnings|43|hash-b"));
});

Deno.test("WRA-67: same fleet facts, reseal changes driver_week hash", async () => {
  const facts = [{ id: "trip-1", updatedAt: "2026-10-26T12:00:00Z", amount: 100 }];
  const policy = "policy-v1";
  const shared = [tollV2HashLine(null)];
  const before = await sha256Hex(buildDriverWeekHashInput(facts, policy, [
    ...statementHashLines([
      { kind: "earnings", version: 42, source_hash: "a" },
      { kind: "fuel", version: 1, source_hash: "f" },
      { kind: "toll", version: 2, source_hash: "t" },
    ]),
    ...shared,
  ]));
  const after = await sha256Hex(buildDriverWeekHashInput(facts, policy, [
    ...statementHashLines([
      { kind: "earnings", version: 43, source_hash: "b" },
      { kind: "fuel", version: 1, source_hash: "f" },
      { kind: "toll", version: 2, source_hash: "t" },
    ]),
    ...shared,
  ]));
  assertNotEquals(before, after);
});

Deno.test("WRA-67: different driver share changes statement-backed settlement", () => {
  const base = {
    driverShare: 33889.94,
    fuelDeduction: 0,
    baseCashOwed: 0,
    baseCashPaid: 0,
    tollCashWash: 0,
    tollPersonal: 0,
  };
  const hi = statementBackedSettlement({ ...base, driverShare: 33889.94 }, { postedAdjustments: 0 });
  const lo = statementBackedSettlement({ ...base, driverShare: 31953.37 }, { postedAdjustments: 0 });
  assertNotEquals(hi.settlement, lo.settlement);
});

Deno.test("WRA-67: toll v2 line change changes hash supplement", () => {
  const a = tollV2HashLine({ chargedToDriverMinor: 1000, totalSpendMinor: 2000 });
  const b = tollV2HashLine({ chargedToDriverMinor: 1500, totalSpendMinor: 2000 });
  assertNotEquals(a, b);
});

Deno.test("WRA-67: settlement movement changes merged hash", async () => {
  const policy = "p";
  const supp = [...statementHashLines([]), tollV2HashLine(null)];
  const without = await sha256Hex(buildDriverWeekHashInput([], policy, supp));
  const withMove = await sha256Hex(
    buildDriverWeekHashInput(
      [{ id: "m1", updatedAt: "2026-10-27T10:00:00Z", amount: 50000 }],
      policy,
      supp,
    ),
  );
  assertNotEquals(without, withMove);
});

Deno.test("WRA-67 contract: seal side effects enqueues driver_week when reason set", async () => {
  const src = await Deno.readTextFile(new URL("./seal_side_effects.ts", import.meta.url));
  assert(src.includes("enqueueDriverWeekUnitsForWeek"), "seal path enqueues driver_week");
  assert(src.includes("driverWeekEnqueueReason"), "reason param exists");
});

Deno.test("WRA-67 contract: earnings seal enqueues driver_week", async () => {
  const src = await Deno.readTextFile(new URL("./week_close.ts", import.meta.url));
  const fn = src.slice(src.indexOf("export async function sealEarningsLaneForWeek"));
  const end = fn.indexOf("export ", 20);
  const body = end > 0 ? fn.slice(0, end) : fn.slice(0, 4000);
  assert(body.includes("wra67_earnings_seal"), "earnings seal reason");
  assert(body.includes("enqueueDriverWeekUnitsForWeek"), "earnings seal enqueues");
});