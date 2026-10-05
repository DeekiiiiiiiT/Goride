import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { quoteCancel } from "./cancelPolicy.ts";
import { linesBalance, captureLines, settleLines } from "./journalLines.ts";
import { merchantFundedAmount, reverseSplit } from "./reverseSplit.ts";
import { walletDecision, applyCreditAtCheckout } from "./walletRules.ts";
import { courierPayoutMinor, merchantPayoutMinor, twoPersonApproval } from "./payoutMath.ts";
import { riskEffects } from "./riskControls.ts";
import { protocolReady } from "./protocol.ts";
import { scaleShortCollection } from "./shortCollection.ts";

const order = {
  status: "preparing",
  total: 2622,
  subtotal: 1800,
  discount: 0,
  merchant_commission_amount: 270,
  delivery_fee_courier_amount: 450,
  delivery_fee_platform_amount: 50,
  service_fee: 150,
  tip: 100,
  courier_tip_net: 100,
  tax_food_jmd: 180,
  tax_platform_jmd: 72,
  courier_id: "c1",
  merchant_id: "m1",
};

Deno.test("policy rows — card and cash", () => {
  const placed = quoteCancel({ order: { ...order, status: "placed" }, actor: "merchant", reason: "closed" });
  assertEquals(placed.customerRefundJmd, 2622);
  assertEquals(placed.merchantReceivesJmd, 0);

  const prep = quoteCancel({ order, actor: "customer", reason: "changed mind" });
  assertEquals(prep.stage, "s2b");
  assertEquals(prep.cancelFeeJmd, 200);
  assertEquals(prep.merchantReceivesJmd, 1530);

  const vehicle = quoteCancel({ order: { ...order, status: "assigned" }, actor: "courier", reason: "vehicle_issue" });
  assertEquals(vehicle.redispatch, true);
  assertEquals(vehicle.customerRefundJmd, 0);

  const unreachable = quoteCancel({
    order: { ...order, status: "picked_up", picked_up_at: "t" },
    actor: "courier",
    reason: "customer_unavailable",
    protocolValidated: true,
    tender: "cod",
  });
  assertEquals(unreachable.customerDebtJmd > 0, true);
  assertEquals(unreachable.customerRefundJmd, 0);

  const skipped = quoteCancel({
    order: { ...order, status: "picked_up", picked_up_at: "t" },
    actor: "courier",
    reason: "customer_unavailable",
    protocolValidated: false,
    tender: "card",
  });
  assertEquals(skipped.customerRefundJmd, 2622);
  const start = "2026-10-04T12:00:00.000Z";
  const later = "2026-10-04T12:06:00.000Z";
  const drop = { latitude: 18.01, longitude: -76.79 };
  assertEquals(protocolReady([
    { attempt_type: "call", at: start, latitude: 18.01, longitude: -76.79 },
    { attempt_type: "sms", at: start, latitude: 18.01, longitude: -76.79 },
    { attempt_type: "photo", at: later, photo_url: "p", latitude: 18.01, longitude: -76.79 },
  ], drop), true);
  assertEquals(protocolReady([
    { attempt_type: "call", at: start, latitude: 18.01, longitude: -76.79 },
    { attempt_type: "sms", at: start, latitude: 18.01, longitude: -76.79 },
    { attempt_type: "wait", wait_seconds: 300 },
    { attempt_type: "photo", at: start, photo_url: "p", latitude: 18.01, longitude: -76.79 },
  ], drop), false);
  assertEquals(protocolReady([{ attempt_type: "call" }]), false);
});

Deno.test("half-paid cash still balances and the courier keeps their full share", () => {
  const scaled = scaleShortCollection({
    bagMinor: 250000,
    platformMinor: 31337,
    merchantMinor: 153001,
    courierMinor: 65662,
    collectedMinor: 125000,
  });
  assertEquals(scaled.courierMinor, 65662);
  assertEquals(scaled.bagMinor, scaled.platformMinor + scaled.merchantMinor + scaled.courierMinor);
  assertEquals(scaled.bagMinor, 125000);
});

Deno.test("a missing item charges the restaurant its food share only", () => {
  const itemFood = 900;
  const taxShare = 180 * (itemFood / 1800);
  const refund = itemFood + taxShare;
  const lines = reverseSplit({
    order,
    captureAmount: 2622,
    refundAmount: refund,
    courierAtFault: false,
    merchantAtFault: true,
  });
  const charged = merchantFundedAmount(lines);
  assertEquals(charged > 0, true);
  assertEquals(lines.filter((line) => line.fundedBy === "merchant").every((line) => line.component === "food"), true);
  assertEquals(charged < refund, true);
  const withoutFault = reverseSplit({
    order,
    captureAmount: 2622,
    refundAmount: refund,
    courierAtFault: false,
    merchantAtFault: false,
  });
  assertEquals(merchantFundedAmount(withoutFault), 0);
});

Deno.test("journals balance and tips stay with the courier", () => {
  assertEquals(linesBalance(captureLines("o1", 26.22)), true);
  assertEquals(linesBalance(settleLines(order, "o1", 2622)), true);
  const lines = reverseSplit({ order, captureAmount: 2622, refundAmount: 600, courierAtFault: false });
  assertEquals(lines.some((line) => line.component === "tip"), false);
  assertEquals(merchantFundedAmount(lines) < 600, true);
  const faulted = reverseSplit({ order, captureAmount: 2622, refundAmount: 2622, courierAtFault: true });
  assertEquals(faulted.some((line) => line.component === "tip"), true);
});

Deno.test("wallet, payout, and risk gates", () => {
  assertEquals(walletDecision({ balanceMajor: 300, debtAgeDays: 1, completedCardOrders: 5, walletLive: true }).codAllowed, false);
  assertEquals(walletDecision({ balanceMajor: 6000, debtAgeDays: 1, completedCardOrders: 5, walletLive: true }).orderingAllowed, false);
  assertEquals(walletDecision({ balanceMajor: 0, debtAgeDays: 0, completedCardOrders: 1, walletLive: false }).codAllowed, false);
  assertEquals(applyCreditAtCheckout(1000, 800, true).cardDue, 200);
  assertEquals(merchantPayoutMinor({ payableMinor: 5000, receivableMinor: 1000, reserveMinor: 500, cashAlreadyKeptMinor: 0 }), 3500);
  assertEquals(courierPayoutMinor({ payableMinor: 2000, receivableMinor: 0, reserveMinor: 0, cashAlreadyKeptMinor: 900 }), 2000);
  assertEquals(twoPersonApproval(["a"]), false);
  assertEquals(twoPersonApproval(["a", "b"]), true);
  assertEquals(riskEffects({
    debtMajor: 10,
    completedCardOrders: 4,
    autoRefunds30d: 0,
    autoRefundJmd30d: 0,
    issues7d: 0,
    merchantRejectionRate30d: 0,
    linkedToBanned: true,
  }).some((effect) => effect.control === "review_case"), true);
});
