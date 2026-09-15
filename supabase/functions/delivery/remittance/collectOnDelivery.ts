/**
 * Collect remittance on cash delivery — Layer A′.
 * Never uses Settlement Week / Log Cash vocabulary.
 */

import {
  assertCodTrialBalance,
  computeCodTrialBalance,
} from "../../_shared/dashPricing.ts";
import { classifyRemittanceError, parkException } from "./exceptions.ts";
import { postRemittanceCollected, toMinor } from "./remittanceLedger.ts";
import { toMinor as toMinorMoney } from "./money.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any };

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

function isCashOrder(order: Record<string, unknown>): boolean {
  const pm = String(order.payment_method ?? "").toLowerCase();
  return pm === "cash" || pm === "cod";
}

/** Write remittance ledger always (production authority). Kill-switch: DELIVERY_REMITTANCE_OFF=1. */
function remittanceWriteEnabled(): boolean {
  return Deno.env.get("DELIVERY_REMITTANCE_OFF") !== "1";
}

/** Legacy courier_cash_* only as emergency. Default off. */
function legacyWriteEnabled(): boolean {
  return Deno.env.get("DELIVERY_COD_LEGACY_WRITE") === "1";
}

function dualWriteEnabled(): boolean {
  return legacyWriteEnabled() && remittanceWriteEnabled();
}

/** R-1 / N-4: remittance minors with retained as residual (DB CHECK by construction). */
export function remittanceMinorsFromSplit(input: {
  totalJmd: number;
  platformDueJmd: number;
  merchantDueJmd: number;
}): {
  bagTotalMinor: number;
  platformDueMinor: number;
  merchantDueMinor: number;
  courierRetainedMinor: number;
  remitMinor: number;
} {
  const bagTotalMinor = toMinorMoney(input.totalJmd);
  const platformDueMinor = toMinorMoney(input.platformDueJmd);
  const merchantDueMinor = toMinorMoney(input.merchantDueJmd);
  const courierRetainedMinor = bagTotalMinor - platformDueMinor - merchantDueMinor;
  return {
    bagTotalMinor,
    platformDueMinor,
    merchantDueMinor,
    courierRetainedMinor,
    remitMinor: platformDueMinor + merchantDueMinor,
  };
}

export async function collectOnDelivery(
  sb: Sb,
  orderId: string,
  courierId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!courierId) return { ok: false, reason: "no_courier" };

  const db = deliveryDb(sb);
  const { data: order } = await db.from("orders").select("*").eq("id", orderId)
    .maybeSingle();
  if (!order || !isCashOrder(order as Record<string, unknown>)) {
    return { ok: false, reason: "not_cod" };
  }

  const row = order as Record<string, unknown>;
  try {
    const split = computeCodTrialBalance({
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      merchantCommissionAmount: Number(row.merchant_commission_amount ?? 0),
      serviceFee: Number(row.service_fee ?? row.platform_fee ?? 0),
      deliveryFeePlatformAmount: Number(row.delivery_fee_platform_amount ?? 0),
      deliveryFeeCourierAmount: Number(row.delivery_fee_courier_amount ?? 0),
      smallOrderFee: Number(row.small_order_fee ?? 0),
      taxFoodJmd: Number(row.tax_food_jmd ?? 0),
      taxPlatformJmd: Number(row.tax_platform_jmd ?? 0),
      tax: Number(row.tax ?? 0),
      tip: Number(row.tip ?? 0),
      courierTipNet: row.courier_tip_net != null
        ? Number(row.courier_tip_net)
        : undefined,
      total: Number(row.total ?? 0),
    });
    assertCodTrialBalance(split, Number(row.total ?? 0));

    const {
      bagTotalMinor,
      platformDueMinor,
      merchantDueMinor,
      courierRetainedMinor,
      remitMinor,
    } = remittanceMinorsFromSplit({
      totalJmd: Number(row.total ?? 0),
      platformDueJmd: split.platformDueJmd,
      merchantDueJmd: split.merchantDueJmd,
    });

    await postRemittanceCollected(sb, {
      courierId,
      orderId,
      bagTotalMinor,
      platformDueMinor,
      merchantDueMinor,
      courierRetainedMinor,
      metadata: remitMinor <= 0 ? { non_positive_remittance: true } : {},
    });
    return { ok: true };
  } catch (err) {
    await parkException(sb, orderId, courierId, classifyRemittanceError(err), err);
    return { ok: false, reason: "parked" };
  }
}

/** Feature-flag helpers for dual-write / cutover callers. */
export {
  dualWriteEnabled,
  remittanceWriteEnabled,
  legacyWriteEnabled,
  isCashOrder,
  toMinor,
};
