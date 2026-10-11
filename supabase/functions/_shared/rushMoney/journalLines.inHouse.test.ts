import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  inHouseSettleLines,
  linesBalance,
  procurementCardReconLines,
  procurementPurchaseLines,
  procurementWriteoffLines,
  refundUnwindLines,
} from "./journalLines.ts";

const order = {
  merchant_id: "m1",
  courier_id: "c1",
  delivery_fee_courier_amount: 350,
  tip: 0,
  courier_tip_net: 0,
  service_fee: 150,
  delivery_fee: 400,
};

Deno.test("in-house worked example balances and never pays the restaurant", () => {
  const purchase = procurementPurchaseLines("order-1", 208000, "4412");
  const settle = inHouseSettleLines(order, "order-1", 2850, 208000);
  const recon = procurementCardReconLines(208000, "4412");
  const writeoff = procurementWriteoffLines("order-1", 208000);

  assertEquals(linesBalance(purchase), true);
  assertEquals(linesBalance(settle), true);
  assertEquals(linesBalance(recon), true);
  assertEquals(linesBalance(writeoff), true);
  assertEquals(settle.some((line) => line.kind === "merchant_payable"), false);
  assertEquals(settle.find((line) => line.kind === "platform_revenue")?.amount_minor, -42000);
  assertEquals(settle.find((line) => line.kind === "vendor_prepaid")?.amount_minor, -208000);
  assertEquals(settle.find((line) => line.kind === "courier_earnings")?.amount_minor, -35000);
});

Deno.test("a refund after delivery books the food share as Roam's cost", () => {
  const lines = refundUnwindLines({
    orderId: "order-1",
    merchantId: "m1",
    courierId: "c1",
    foodMinor: 208000,
    courierMinor: 0,
    platformMinor: 42000,
    inHouse: true,
  });
  assertEquals(linesBalance(lines), true);
  assertEquals(lines.some((line) => line.kind === "merchant_payable"), false);
  assertEquals(lines.find((line) => line.component === "procurement_refund")?.amount_minor, 208000);
});
