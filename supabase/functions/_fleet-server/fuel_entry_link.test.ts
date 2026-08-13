import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canReuseLinkedFuelEntry,
  fuelEntryBelongsToTransaction,
  fuelEntryOwnerTxIds,
} from "./fuel_entry_link.ts";

const FEB_ENTRY = {
  id: "0067b4c7-677a-41b6-9d87-d38ed39f4208",
  transactionId: "98e3951e-0a5f-4e45-ad2e-dc205ae0b95b",
  metadata: { originalTransactionId: "98e3951e-0a5f-4e45-ad2e-dc205ae0b95b" },
};

const NEW_TX = "2ec149cc-d289-4beb-a26f-bba6af8fd467";

Deno.test("owner ids include top-level and metadata links", () => {
  assertEquals(fuelEntryOwnerTxIds(FEB_ENTRY).sort(), [
    "98e3951e-0a5f-4e45-ad2e-dc205ae0b95b",
  ]);
});

Deno.test("stale first-row fuel_entry is not owned by a new expense", () => {
  assertEquals(fuelEntryBelongsToTransaction(FEB_ENTRY, NEW_TX), false);
  assertEquals(canReuseLinkedFuelEntry(FEB_ENTRY, NEW_TX), false);
});

Deno.test("owned fuel_entry can be reused", () => {
  const owned = {
    id: "new-log",
    transactionId: NEW_TX,
    metadata: { sourceId: NEW_TX },
  };
  assertEquals(fuelEntryBelongsToTransaction(owned, NEW_TX), true);
  assertEquals(canReuseLinkedFuelEntry(owned, NEW_TX), true);
});

Deno.test("unlinked row is never reused (prevents first-row false match)", () => {
  assertEquals(canReuseLinkedFuelEntry({ id: "orphan" }, NEW_TX), false);
  assertEquals(canReuseLinkedFuelEntry(null, NEW_TX), false);
});
