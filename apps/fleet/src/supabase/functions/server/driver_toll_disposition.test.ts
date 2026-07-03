import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyTollLedgerEntry, addToTollDisposition, emptyTollDisposition } from "./driver_toll_disposition.ts";

/**
 * Deno mirror of apps/fleet/src/utils/tollDisposition.test.ts. Same policy cases,
 * case-for-case, so any drift between the server classifier and its client mirror
 * fails here. Run: deno test driver_toll_disposition.test.ts
 */

Deno.test("cash toll → cashWash", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "cash" }), "cashWash");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", receiptUrl: "r.jpg" }), "cashWash");
});

Deno.test("personal resolution → personal (wins over cash)", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "personal" }), "personal");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "cash", resolution: "personal" }), "personal");
});

Deno.test("business / write_off / refunded → fleet", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "business" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "write_off" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "refunded" }), "fleet");
});

Deno.test("tag toll matched to trip → fleet", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", tripId: "trip1" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "fleet_account", isReconciled: true }), "fleet");
});

Deno.test("tag toll, no resolution, no trip → unresolved", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance" }), "unresolved");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "fleet_account" }), "unresolved");
});

Deno.test("addToTollDisposition sums |amount| into the right buckets", () => {
  const d = emptyTollDisposition();
  addToTollDisposition(d, { paymentMethod: "cash", amount: -10 });
  addToTollDisposition(d, { paymentMethod: "tag_balance", resolution: "personal", amount: 25 });
  addToTollDisposition(d, { paymentMethod: "tag_balance", resolution: "business", amount: 5 });
  addToTollDisposition(d, { paymentMethod: "tag_balance", amount: 3 });
  assertEquals(d, { cashWash: 10, personal: 25, fleet: 5, unresolved: 3 });
});
