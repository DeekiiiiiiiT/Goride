import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDashCaptureSplit, courierDeliveryEarnings } from "./dashMoneySplit.ts";

Deno.test("Model B split — normal", () => {
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 120,
      merchant_commission_amount: 500,
      delivery_fee: 520,
      delivery_fee_platform_amount: 104,
      delivery_fee_courier_amount: 416,
      tip: 50,
      peak_pay_amount: 0,
      tax_food_jmd: 0,
      tax_platform_jmd: 0,
    },
    3552.5,
  );
  assertEquals(split.platformFee, 724);
  assertEquals(split.courierPayable, 466);
  assertEquals(split.merchantReceivable, 2362.5);
});

Deno.test("Model B split — free-delivery negative platform share (merchant not charged)", () => {
  // Customer paid food+service+tax only; courier still earns base share.
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 200,
      processing_fee: 0,
      merchant_commission_amount: 400,
      delivery_fee: 0,
      delivery_fee_platform_amount: -320,
      delivery_fee_courier_amount: 320,
      tip: 0,
      tax_food_jmd: 330,
      tax_platform_jmd: 33,
    },
    2563, // discountedSubtotal 2000 + service 200 + tax 363
  );
  // platform = 200 + 400 + (-320) + 330 + 33 = 643
  assertEquals(split.platformFee, 643);
  assertEquals(split.courierPayable, 320);
  // merchant = 2563 - 643 - 320 = 1600 (= food - commission)
  assertEquals(split.merchantReceivable, 1600);
});

Deno.test("Model B split — GCT attributed to platform", () => {
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 150,
      merchant_commission_amount: 300,
      delivery_fee_platform_amount: 80,
      delivery_fee_courier_amount: 320,
      tax_food_jmd: 247.5,
      tax_platform_jmd: 37.95,
      tip: 0,
    },
    3000,
  );
  assertEquals(split.platformFee, 815.45);
  assertEquals(split.courierPayable, 320);
  assertEquals(split.merchantReceivable, roundMoney(3000 - 815.45 - 320));
});

Deno.test("Model B split — small-order fee in platform take", () => {
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 150,
      merchant_commission_amount: 135,
      delivery_fee_platform_amount: 80,
      delivery_fee_courier_amount: 320,
      small_order_fee: 400,
      tax_food_jmd: 0,
      tax_platform_jmd: 0,
    },
    2000,
  );
  assertEquals(split.platformFee, 765);
  assertEquals(split.courierPayable, 320);
  assertEquals(split.merchantReceivable, 915);
});

Deno.test("courierDeliveryEarnings Model B", () => {
  assertEquals(
    courierDeliveryEarnings({
      pricing_model: "v2",
      delivery_fee: 520,
      delivery_fee_courier_amount: 416,
    }),
    416,
  );
});

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
