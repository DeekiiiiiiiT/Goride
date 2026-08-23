/** Model A + Model B marketplace money split for Dash order captures. */

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
  tip?: number | null;
  peak_pay_amount?: number | null;
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

function isModelB(order: DashOrderFeeFields): boolean {
  return order.pricing_model === "v2";
}

/**
 * Model A: platform keeps platform_fee; courier earns delivery_fee + tip.
 * Model B: platform keeps service_fee + merchant_commission + delivery platform share;
 * courier earns delivery courier share + tip + peak_pay.
 */
export function computeDashCaptureSplit(
  order: DashOrderFeeFields,
  captureAmount: number,
): DashCaptureSplit {
  const gross = Math.max(0, Number(captureAmount) || 0);
  const tip = Math.max(0, Number(order.tip ?? 0));
  const peakPay = Math.max(0, Number(order.peak_pay_amount ?? 0));

  if (isModelB(order)) {
    const serviceFee = Math.max(0, Number(order.service_fee ?? order.platform_fee ?? 0));
    const processingFee = Math.max(0, Number(order.processing_fee ?? 0));
    const merchantCommission = Math.max(0, Number(order.merchant_commission_amount ?? 0));
    const deliveryPlatform = Math.max(
      0,
      Number(order.delivery_fee_platform_amount ?? 0),
    );
    const deliveryCourier = Math.max(
      0,
      Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0),
    );
    const platformFee = roundMoney(serviceFee + processingFee + merchantCommission + deliveryPlatform);
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

  // Legacy Model A
  const platformFee = Math.max(0, Number(order.platform_fee ?? 0));
  const deliveryFee = Math.max(0, Number(order.delivery_fee ?? 0));
  const courierPayable = roundMoney(deliveryFee + tip + peakPay);
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

/** Courier delivery earnings for an order (Model A or B). */
export function courierDeliveryEarnings(order: DashOrderFeeFields): number {
  if (isModelB(order)) {
    return Math.max(
      0,
      Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0),
    );
  }
  return Math.max(0, Number(order.delivery_fee ?? 0));
}
