import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { quoteCancel } from "./cancelPolicy.ts";
import { linesBalance, captureLines, settleLines, allocatedCash, cashSettleLines, merchantShortTopUpLines, deductionReversalLines, walletDebtPayLines } from "./journalLines.ts";
import { debtAgeDaysFromMovements } from "./customerWallet.ts";
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

Deno.test("a subsidised cash order keeps the courier's full share on both books", () => {
  const subsidised = {
    total: 1000,
    subtotal: 680,
    discount: 0,
    merchant_commission_amount: 0,
    delivery_fee_courier_amount: 400,
    delivery_fee_platform_amount: -80,
    service_fee: 0,
    tip: 0,
    courier_tip_net: 0,
    tax_food_jmd: 0,
    tax_platform_jmd: 0,
    courier_id: "c1",
    merchant_id: "m1",
  };
  const full = allocatedCash(subsidised, 1000);
  const fullLines = cashSettleLines(subsidised, "order-sub", 1000);
  assertEquals(full.courierKept, 40000);
  assertEquals(full.merchant, 68000);
  assertEquals(full.platform, -8000);
  assertEquals(full.collected, full.platform + full.merchant + full.courierKept);
  assertEquals(fullLines.find((line) => line.kind === "courier_cash_earned")?.amount_minor, -full.courierKept);
  assertEquals(linesBalance(fullLines), true);

  const half = allocatedCash(subsidised, 500);
  const halfLines = cashSettleLines(subsidised, "order-sub", 500);
  assertEquals(half.courierKept, 40000);
  assertEquals(half.collected, half.platform + half.merchant + half.courierKept);
  assertEquals(half.merchant < 68000, true);
  assertEquals(halfLines.find((line) => line.kind === "merchant_payable")?.amount_minor, -68000);
  assertEquals(halfLines.find((line) => line.kind === "courier_cash_earned")?.amount_minor, -40000);
  assertEquals(halfLines.find((line) => line.kind === "platform_cost")?.amount_minor, 58000);
  assertEquals(linesBalance(halfLines), true);

  const topUp = merchantShortTopUpLines(subsidised, 11333);
  assertEquals(topUp.find((line) => line.kind === "merchant_payable")?.amount_minor, -56667);
  assertEquals(topUp.find((line) => line.kind === "platform_cost")?.amount_minor, 56667);
  assertEquals(linesBalance(topUp), true);
  assertEquals(merchantShortTopUpLines(subsidised, 68000), []);
});

Deno.test("a reversed deduction is Roam's cost and does not reopen the reserve", () => {
  const lines = deductionReversalLines([
    { kind: "courier_earnings", party_type: "courier", party_id: "c1", component: "delivery", amount_minor: 2000 },
    { kind: "chargeback_reserve", party_type: "platform", party_id: null, component: "open", amount_minor: -2000 },
  ]);
  assertEquals(lines.find((line) => line.kind === "chargeback_reserve"), undefined);
  assertEquals(lines.find((line) => line.kind === "courier_earnings")?.amount_minor, -2000);
  assertEquals(lines.find((line) => line.kind === "platform_cost")?.component, "appeal");
  assertEquals(lines.find((line) => line.kind === "platform_cost")?.amount_minor, 2000);
  assertEquals(linesBalance(lines), true);
});

Deno.test("cash below the courier share keeps the same amount on both books", () => {
  const shares = allocatedCash(order, 100);
  const lines = cashSettleLines(order, "order-1", 100);
  const courier = lines.find((line) => line.kind === "courier_cash_earned");
  assertEquals(shares.courierKept, shares.collected);
  assertEquals(shares.collected, shares.platform + shares.merchant + shares.courierKept);
  assertEquals(courier?.amount_minor, -shares.courierKept);
  assertEquals(linesBalance(lines), true);
});

Deno.test("paying a balance clears the customer wallet", () => {
  const lines = walletDebtPayLines("customer-1", 25.5);
  assertEquals(linesBalance(lines), true);
  assertEquals(lines[0].kind, "gateway_clearing");
  assertEquals(lines[1].amount_minor, -2550);
});

Deno.test("paying a balance over the limit lets the customer order again", () => {
  const stored = [{ at: "2026-09-01T00:00:00.000Z", amountMinor: 600000 }];
  const now = Date.parse("2026-09-02T00:00:00.000Z");
  assertEquals(walletDecision({
    balanceMajor: 6000,
    debtAgeDays: debtAgeDaysFromMovements(stored, now),
    completedCardOrders: 5,
    walletLive: true,
  }).orderingAllowed, false);
  const payoff = walletDebtPayLines("customer-1", 6000);
  const paid = stored.concat([{ at: "2026-09-02T00:00:00.000Z", amountMinor: payoff[1].amount_minor }]);
  const balanceMinor = paid.reduce((sum, row) => sum + row.amountMinor, 0);
  assertEquals(balanceMinor, 0);
  assertEquals(walletDecision({
    balanceMajor: balanceMinor / 100,
    debtAgeDays: debtAgeDaysFromMovements(paid, now),
    completedCardOrders: 5,
    walletLive: true,
  }).orderingAllowed, true);
  const second = walletDebtPayLines("customer-1", 6000);
  assertEquals(balanceMinor + second[1].amount_minor < 0, true);
});

Deno.test("debt age starts when the unpaid balance began", () => {
  const now = Date.parse("2026-09-10T00:00:00.000Z");
  assertEquals(debtAgeDaysFromMovements([
    { at: "2026-01-01T00:00:00.000Z", amountMinor: 100 },
    { at: "2026-02-01T00:00:00.000Z", amountMinor: -100 },
    { at: "2026-09-01T00:00:00.000Z", amountMinor: 500 },
  ], now), 9);
  assertEquals(walletDecision({ balanceMajor: 100, debtAgeDays: 31, completedCardOrders: 5, walletLive: true }).orderingAllowed, false);
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
