import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyTollLedgerEntry, addToTollDisposition, emptyTollDisposition, isCashPaidToll } from "./driver_toll_disposition.ts";

Deno.test("cash toll → cashWash", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "cash" }), "cashWash");
});

Deno.test("tag + receipt only is NOT cashWash", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", receiptUrl: "r.jpg" }), "unresolved");
  assertEquals(isCashPaidToll({ paymentMethod: "tag_balance", receiptUrl: "r.jpg" }), false);
});

Deno.test("tag personal → personal", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "personal" }), "personal");
});

Deno.test("cash stays cashWash even when personal", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "cash", resolution: "personal" }), "cashWash");
});

Deno.test("business / write_off / refunded → fleet", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "business" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "write_off" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", resolution: "refunded" }), "fleet");
});

Deno.test("matched trip → fleet", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance", tripId: "trip1" }), "fleet");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "fleet_account", isReconciled: true }), "fleet");
});

Deno.test("unresolved tag", () => {
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "tag_balance" }), "unresolved");
  assertEquals(classifyTollLedgerEntry({ paymentMethod: "fleet_account" }), "unresolved");
});

Deno.test("accumulate buckets", () => {
  const d = emptyTollDisposition();
  addToTollDisposition(d, { paymentMethod: "cash", amount: -10 });
  addToTollDisposition(d, { paymentMethod: "tag_balance", resolution: "personal", amount: 25 });
  assertEquals(d.cashWash, 10);
  assertEquals(d.personal, 25);
});
