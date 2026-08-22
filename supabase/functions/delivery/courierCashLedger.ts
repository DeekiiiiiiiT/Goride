/**
 * COD cash ledger for Rush couriers.
 * Tracks cash collected on delivery and auto-pauses at threshold.
 */

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

  await sb.from("courier_cash_events").insert({
    courier_id: input.courierId,
    order_id: input.orderId,
    event_type: "collected",
    amount_jmd: ledgerAmount,
    balance_after: balanceAfter,
    notes: `COD collection: platform J$${input.platformDueJmd}, merchant J$${input.merchantDueJmd}`,
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

  if (paymentMethod === "cash" && paymentStatus === "pending_collection") {
    await sb
      .from("orders")
      .update({ payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (courierId) {
      const { platformDueJmd, merchantDueJmd } = computeCodLedgerAmounts(row);
      await recordCashCollection(sb, {
        courierId,
        orderId,
        collectedAmountJmd: Number(row.total ?? 0),
        platformDueJmd,
        merchantDueJmd,
      });
    }
  }
}

export function computeCodLedgerAmounts(order: Record<string, unknown>): {
  platformDueJmd: number;
  merchantDueJmd: number;
} {
  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.discount ?? 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const merchantCommission = Number(order.merchant_commission_amount ?? 0);
  const serviceFee = Number(order.service_fee ?? order.platform_fee ?? 0);
  const deliveryPlatform = Number(order.delivery_fee_platform_amount ?? 0);

  const platformDueJmd = roundMoney(serviceFee + merchantCommission + deliveryPlatform);
  const merchantDueJmd = roundMoney(Math.max(0, discountedSubtotal - merchantCommission));

  // Legacy Model A: platform fee only; merchant gets food portion
  if (order.pricing_model !== "v2") {
    const platformFee = Number(order.platform_fee ?? 0);
    const deliveryFee = Number(order.delivery_fee ?? 0);
    const tip = Number(order.tip ?? 0);
    const tax = Number(order.tax ?? 0);
    const total = Number(order.total ?? 0);
    return {
      platformDueJmd: roundMoney(platformFee),
      merchantDueJmd: roundMoney(Math.max(0, total - platformFee - deliveryFee - tip)),
    };
  }

  return { platformDueJmd, merchantDueJmd };
}
