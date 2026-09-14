import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFuelTxCascadePlan,
  collectRelatedTxIdsForEntry,
  explicitFuelEntryIdFromTx,
  fuelCreditIdFor,
  txMatchesFuelEntryFingerprint,
} from "./fuel_tx_cascade.ts";

Deno.test("fuelCreditIdFor prefixes primary expense id", () => {
  assertEquals(fuelCreditIdFor("abc"), "fuel-credit-abc");
});

Deno.test("explicitFuelEntryIdFromTx reads metadata.fuelEntryId first", () => {
  assertEquals(
    explicitFuelEntryIdFromTx({
      metadata: { fuelEntryId: "fe1", sourceId: "fe2" },
    }),
    "fe1",
  );
});

Deno.test("buildFuelTxCascadePlan includes primary, credit, and entry links", () => {
  const plan = buildFuelTxCascadePlan({
    primaryId: "exp-1",
    parentEntry: {
      id: "fe-1",
      transactionId: "exp-1",
      metadata: { originalTransactionId: "exp-1" },
    },
    relatedTxIds: ["settlement-child"],
  });
  assertEquals(plan.fuelEntryId, "fe-1");
  assertEquals(
    plan.transactionIds.sort(),
    ["exp-1", "fuel-credit-exp-1", "fuel-credit-fe-1", "settlement-child"].sort(),
  );
});

Deno.test("fingerprint matches same vehicle/date/amount fuel category", () => {
  const entry = { id: "fe", vehicleId: "v1", date: "2026-09-01", amount: 40 };
  const tx = {
    id: "t1",
    vehicleId: "v1",
    date: "2026-09-01T12:00:00Z",
    amount: -40,
    category: "Fuel",
  };
  assertEquals(txMatchesFuelEntryFingerprint(tx, entry), true);
  assertEquals(
    txMatchesFuelEntryFingerprint({ ...tx, vehicleId: "v2" }, entry),
    false,
  );
});

Deno.test("collectRelatedTxIdsForEntry merges explicit and fingerprint", () => {
  const entry = {
    id: "fe-1",
    transactionId: "exp-1",
    vehicleId: "v1",
    date: "2026-09-01",
    amount: 40,
  };
  const ids = collectRelatedTxIdsForEntry(entry, [
    { id: "exp-1", vehicleId: "v1", date: "2026-09-01", amount: 40, category: "Fuel" },
    {
      id: "orphan-sig",
      vehicleId: "v1",
      date: "2026-09-01",
      amount: 40,
      category: "Fuel Reimbursement",
      metadata: {},
    },
    {
      id: "linked",
      metadata: { sourceId: "fe-1" },
      vehicleId: "x",
      date: "2020-01-01",
      amount: 1,
      category: "Other",
    },
  ]);
  assertEquals(ids.sort(), ["exp-1", "linked", "orphan-sig"].sort());
});
