/** Model A marketplace money split for Dash order captures. */

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type DashOrderFeeFields = {
  platform_fee?: number | null;
  delivery_fee?: number | null;
  tip?: number | null;
  courier_id?: string | null;
  merchant_id?: string | null;
};

export type DashCaptureSplit = {
  captureAmount: number;
  platformFee: number;
  courierPayable: number;
  merchantReceivable: number;
  merchantId: string | null;
  courierId: string | null;
};

/**
 * Platform keeps platform_fee; courier earns delivery_fee + tip;
 * merchant gets the remainder of the customer payment.
 */
export function computeDashCaptureSplit(
  order: DashOrderFeeFields,
  captureAmount: number,
): DashCaptureSplit {
  const gross = Math.max(0, Number(captureAmount) || 0);
  const platformFee = Math.max(0, Number(order.platform_fee ?? 0));
  const deliveryFee = Math.max(0, Number(order.delivery_fee ?? 0));
  const tip = Math.max(0, Number(order.tip ?? 0));
  const courierPayable = roundMoney(deliveryFee + tip);
  const merchantReceivable = roundMoney(Math.max(0, gross - platformFee - courierPayable));
  return {
    captureAmount: gross,
    platformFee: roundMoney(platformFee),
    courierPayable,
    merchantReceivable,
    merchantId: order.merchant_id ? String(order.merchant_id) : null,
    courierId: order.courier_id ? String(order.courier_id) : null,
  };
}
