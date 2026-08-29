/**
 * COD cash ledger for Rush couriers.
 * Tracks cash collected on delivery and auto-pauses at threshold.
 */

import { computeCodTrialBalance, assertCodTrialBalance } from "../_shared/dashPricing.ts";
import { recordOrderOutputTax } from "../_shared/gctLedger.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (t: string) => any };

export type CashCollectionInput = {
  courierId: string;
  orderId: string;
  /** Full customer payment collected in cash */
  collectedAmountJmd: number;
  /** Platform + merchant portion courier must remit */
  platformDueJmd: number;
  merchantDueJmd: number;
  /** Full split for audit metadata */
  split?: CodTrialBalance;
};

export type CodTrialBalance = {
  platformDueJmd: number;
  merchantDueJmd: number;
  courierRetainedJmd: number;
  gctDueJmd: number;
};

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Record cash collection on delivery and update courier balance. */
export async function recordCashCollection(
  sb: Sb,
  input: CashCollectionInput,
): Promise<{ balanceAfter: number; isPaused: boolean }> {
  const ledgerAmount = roundMoney(input.platformDueJmd + input.merchantDueJmd);
  if (ledgerAmount <= 0) {
    return { balanceAfter: 0, isPaused: false };
  }

  const { data: existing } = await sb
    .from("courier_cash_balances")
    .select("*")
    .eq("courier_id", input.courierId)
    .maybeSingle();

  const currentBalance = Number(existing?.balance_jmd ?? 0);
  const threshold = Number(existing?.pause_threshold_jmd ?? 10000);
  const balanceAfter = roundMoney(currentBalance + ledgerAmount);
  const isPaused = balanceAfter >= threshold;

  if (existing) {
    await sb
      .from("courier_cash_balances")
      .update({
        balance_jmd: balanceAfter,
        is_paused: isPaused,
        paused_at: isPaused ? new Date().toISOString() : existing.paused_at,
        updated_at: new Date().toISOString(),
      })
      .eq("courier_id", input.courierId);
  } else {
    await sb.from("courier_cash_balances").insert({
      courier_id: input.courierId,
      balance_jmd: balanceAfter,
      pause_threshold_jmd: threshold,
      is_paused: isPaused,
      paused_at: isPaused ? new Date().toISOString() : null,
    });
  }

  const meta = input.split
    ? JSON.stringify({
      platform_due_jmd: input.split.platformDueJmd,
      merchant_due_jmd: input.split.merchantDueJmd,
      courier_retained_jmd: input.split.courierRetainedJmd,
      gct_due_jmd: input.split.gctDueJmd,
    })
    : null;

  await sb.from("courier_cash_events").insert({
    courier_id: input.courierId,
    order_id: input.orderId,
    event_type: "collected",
    amount_jmd: ledgerAmount,
    balance_after: balanceAfter,
    notes: `COD collection: platform J$${input.platformDueJmd}, merchant J$${input.merchantDueJmd}`,
    metadata: meta,
  });

  return { balanceAfter, isPaused };
}

/** Record manual settlement (Lynk/WiPay/bank). */
export async function recordCashSettlement(
  sb: Sb,
  courierId: string,
  amountJmd: number,
  settlementMethod: string,
  notes: string | null,
  actorId: string | null,
): Promise<{ balanceAfter: number }> {
  const { data: existing } = await sb
    .from("courier_cash_balances")
    .select("*")
    .eq("courier_id", courierId)
    .maybeSingle();

  const currentBalance = Number(existing?.balance_jmd ?? 0);
  const balanceAfter = roundMoney(Math.max(0, currentBalance - amountJmd));

  if (existing) {
    await sb
      .from("courier_cash_balances")
      .update({
        balance_jmd: balanceAfter,
        is_paused: false,
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("courier_id", courierId);
  }

  await sb.from("courier_cash_events").insert({
    courier_id: courierId,
    event_type: "settled",
    amount_jmd: -amountJmd,
    balance_after: balanceAfter,
    settlement_method: settlementMethod,
    notes,
    created_by: actorId,
  });

  return { balanceAfter };
}

/** Check if courier is paused from COD threshold. */
export async function isCourierCashPaused(
  sb: Sb,
  courierId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("courier_cash_balances")
    .select("is_paused")
    .eq("courier_id", courierId)
    .maybeSingle();
  return Boolean(data?.is_paused);
}

/** Handle post-delivery side effects: COD cash ledger + payment status. */
export async function handleOrderDelivered(
  sb: Sb,
  orderId: string,
  courierId: string | null,
): Promise<void> {
  const { data: order } = await sb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const row = order as Record<string, unknown>;
  const paymentMethod = String(row.payment_method ?? "cash");
  const paymentStatus = String(row.payment_status ?? "");

  // Shadow-write GCT output tax at delivery tax point (Workstream E)
  const taxFood = Number(row.tax_food_jmd ?? 0);
  const taxPlatform = Number(row.tax_platform_jmd ?? 0);
  if (taxFood > 0 || taxPlatform > 0) {
    const discountedSubtotal = Math.max(
      0,
      Number(row.subtotal ?? 0) - Number(row.discount ?? 0),
    );
    const platformBase =
      Math.max(0, Number(row.service_fee ?? 0)) +
      Math.max(0, Number(row.delivery_fee_platform ?? row.platform_delivery_fee ?? 0)) +
      Math.max(0, Number(row.small_order_fee ?? 0));
    await recordOrderOutputTax(sb, {
      orderId,
      merchantId: row.merchant_id ? String(row.merchant_id) : null,
      taxFoodJmd: taxFood,
      taxPlatformJmd: taxPlatform,
      foodBaseJmd: discountedSubtotal,
      platformBaseJmd: platformBase,
      foodRatePercent: Number(row.tax_rate_food_percent ?? row.tax_rate_percent ?? 0),
      platformRatePercent: Number(row.tax_rate_platform_percent ?? row.tax_rate_percent ?? 0),
      invoiceAt: row.created_at ? String(row.created_at) : null,
      paymentAt: paymentStatus === "paid" ? new Date().toISOString() : null,
      deliveryAt: row.delivered_at ? String(row.delivered_at) : new Date().toISOString(),
    });
  }

  if (paymentMethod === "cash" && paymentStatus === "pending_collection") {
    await sb
      .from("orders")
      .update({ payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (courierId) {
      const split = computeCodLedgerAmounts(row);
      await recordCashCollection(sb, {
        courierId,
        orderId,
        collectedAmountJmd: Number(row.total ?? 0),
        platformDueJmd: split.platformDueJmd,
        merchantDueJmd: split.merchantDueJmd,
        split,
      });
    }
  }
}

export function computeCodLedgerAmounts(order: Record<string, unknown>): CodTrialBalance {
  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.discount ?? 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const total = Number(order.total ?? 0);

  const balance = computeCodTrialBalance({
    subtotal,
    discount,
    merchantCommissionAmount: Number(order.merchant_commission_amount ?? 0),
    serviceFee: Number(order.service_fee ?? order.platform_fee ?? 0),
    deliveryFeePlatformAmount: Number(order.delivery_fee_platform_amount ?? 0),
    deliveryFeeCourierAmount: Number(order.delivery_fee_courier_amount ?? 0),
    smallOrderFee: Number(order.small_order_fee ?? 0),
    taxFoodJmd: Number(order.tax_food_jmd ?? 0),
    taxPlatformJmd: Number(order.tax_platform_jmd ?? 0),
    tax: Number(order.tax ?? 0),
    tip: Number(order.tip ?? 0),
    courierTipNet: order.courier_tip_net != null ? Number(order.courier_tip_net) : undefined,
    total,
    pricingModel: order.pricing_model === "v2" ? "v2" : "legacy",
    platformFee: Number(order.platform_fee ?? 0),
    deliveryFee: Number(order.delivery_fee ?? 0),
  });

  assertCodTrialBalance(balance, total);

  return balance;
}

/** Backfill ledger for delivered cash orders missing events (one-time ops). */
export async function backfillCashLedgerForOrder(
  sb: Sb,
  order: Record<string, unknown>,
): Promise<boolean> {
  const paymentMethod = String(order.payment_method ?? "");
  const status = String(order.status ?? "");
  const courierId = order.courier_id ? String(order.courier_id) : null;
  if (paymentMethod !== "cash" || !courierId) return false;
  if (status !== "delivered" && status !== "completed") return false;

  const orderId = String(order.id);
  const { data: existing } = await sb
    .from("courier_cash_events")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) return false;

  const split = computeCodLedgerAmounts(order);
  await recordCashCollection(sb, {
    courierId,
    orderId,
    collectedAmountJmd: Number(order.total ?? 0),
    platformDueJmd: split.platformDueJmd,
    merchantDueJmd: split.merchantDueJmd,
    split,
  });
  return true;
}
