/** Model B marketplace money split for Dash order captures. */

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type DashOrderFeeFields = {
  platform_fee?: number | null;
  service_fee?: number | null;
  processing_fee?: number | null;
  delivery_fee?: number | null;
  delivery_fee_platform_amount?: number | null;
  delivery_fee_courier_amount?: number | null;
  merchant_commission_amount?: number | null;
  tax_food_jmd?: number | null;
  tax_platform_jmd?: number | null;
  tip?: number | null;
  peak_pay_amount?: number | null;
  /** Platform delivery subsidy (courier pay above customer delivery fee). */
  platform_delivery_subsidy_jmd?: number | null;
  small_order_fee?: number | null;
  pricing_model?: string | null;
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
 * Model B: platform keeps service_fee + processing + merchant_commission
 * + signed delivery platform share + GCT + small-order fee;
 * courier earns delivery courier share + tip + peak_pay.
 * Negative delivery platform share (promo/subsidy) reduces platform take —
 * merchant residual must not absorb that cost.
 */
export function computeDashCaptureSplit(
  order: DashOrderFeeFields,
  captureAmount: number,
): DashCaptureSplit {
  const gross = Math.max(0, Number(captureAmount) || 0);
  const tip = Math.max(0, Number(order.tip ?? 0));
  const peakPay = Math.max(0, Number(order.peak_pay_amount ?? 0));

  const serviceFee = Math.max(0, Number(order.service_fee ?? order.platform_fee ?? 0));
  const processingFee = Math.max(0, Number(order.processing_fee ?? 0));
  const merchantCommission = Math.max(0, Number(order.merchant_commission_amount ?? 0));
  // Signed — free-delivery / subsidy can make this negative (platform marketing cost).
  const deliveryPlatform = Number(order.delivery_fee_platform_amount ?? 0) || 0;
  const deliveryCourier = Math.max(
    0,
    Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0),
  );
  const taxFood = Math.max(0, Number(order.tax_food_jmd ?? 0));
  const taxPlatform = Math.max(0, Number(order.tax_platform_jmd ?? 0));
  const smallOrderFee = Math.max(0, Number(order.small_order_fee ?? 0));

  const platformFee = roundMoney(
    serviceFee +
      processingFee +
      merchantCommission +
      deliveryPlatform +
      taxFood +
      taxPlatform +
      smallOrderFee,
  );
  const courierPayable = roundMoney(deliveryCourier + tip + peakPay);
  const merchantReceivable = roundMoney(Math.max(0, gross - platformFee - courierPayable));
  return {
    captureAmount: gross,
    platformFee,
    courierPayable,
    merchantReceivable,
    merchantId: order.merchant_id ? String(order.merchant_id) : null,
    courierId: order.courier_id ? String(order.courier_id) : null,
  };
}

/** Courier delivery earnings for an order (Model B). */
export function courierDeliveryEarnings(order: DashOrderFeeFields): number {
  return Math.max(
    0,
    Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0),
  );
}
