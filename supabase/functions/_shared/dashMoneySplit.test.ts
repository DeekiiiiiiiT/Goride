import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeDashCaptureSplit,
  courierDeliveryEarnings,
  courierTipEarnings,
} from "./dashMoneySplit.ts";

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
      courier_tip_net: 50,
      peak_pay_amount: 0,
      tax_food_jmd: 0,
      tax_platform_jmd: 0,
      subtotal: 2500,
      discount: 0,
    },
    3552.5,
  );
  assertEquals(split.platformFee, 724);
  assertEquals(split.courierPayable, 466);
  assertEquals(split.merchantReceivable, 2000); // 2500 - 500
});

Deno.test("Model B split — free-delivery negative platform share (merchant not charged)", () => {
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
      courier_tip_net: 0,
      tax_food_jmd: 330,
      tax_platform_jmd: 33,
      subtotal: 2000,
      discount: 0,
    },
    2563,
  );
  assertEquals(split.platformFee, 643);
  assertEquals(split.courierPayable, 320);
  assertEquals(split.merchantReceivable, 1600);
});

Deno.test("Model B — tip processing fee does not hit merchant", () => {
  // Tip 100, tip fee 4.5 → courier_tip_net 95.5; platform keeps full processing 4.5
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 150,
      processing_fee: 94.5, // order + tip portions
      merchant_commission_amount: 400,
      delivery_fee_platform_amount: 80,
      delivery_fee_courier_amount: 320,
      tip: 100,
      courier_tip_net: 95.5,
      peak_pay_amount: 0,
      tax_food_jmd: 0,
      tax_platform_jmd: 0,
      subtotal: 2000,
      discount: 0,
    },
    3000,
  );
  assertEquals(split.merchantReceivable, 1600);
  assertEquals(split.courierPayable, 415.5); // 320 + 95.5
  assertEquals(split.platformFee, 724.5); // 150+94.5+400+80
});

Deno.test("Model B — peak pay is platform cost; merchant unchanged", () => {
  const base = {
    pricing_model: "v2" as const,
    service_fee: 150,
    processing_fee: 0,
    merchant_commission_amount: 400,
    delivery_fee_platform_amount: 80,
    delivery_fee_courier_amount: 320,
    tip: 0,
    courier_tip_net: 0,
    tax_food_jmd: 0,
    tax_platform_jmd: 0,
    subtotal: 2000,
    discount: 0,
  };
  const without = computeDashCaptureSplit({ ...base, peak_pay_amount: 0 }, 2800);
  const withPeak = computeDashCaptureSplit({ ...base, peak_pay_amount: 300 }, 2800);
  assertEquals(withPeak.merchantReceivable, without.merchantReceivable);
  assertEquals(withPeak.merchantReceivable, 1600);
  assertEquals(withPeak.courierPayable, without.courierPayable + 300);
  assertEquals(withPeak.platformFee, without.platformFee - 300);
});

Deno.test("Model B — Dominant subsidy + tip + peak: merchant == food − commission", () => {
  const split = computeDashCaptureSplit(
    {
      pricing_model: "v2",
      service_fee: 360,
      processing_fee: 200,
      merchant_commission_amount: 1200,
      delivery_fee_platform_amount: -460,
      delivery_fee_courier_amount: 1210,
      tip: 500,
      courier_tip_net: 477.5,
      peak_pay_amount: 300,
      tax_food_jmd: 660,
      tax_platform_jmd: 0,
      subtotal: 4000,
      discount: 0,
    },
    6000,
  );
  assertEquals(split.merchantReceivable, 2800); // 4000 - 1200
  assertEquals(split.courierPayable, 1210 + 477.5 + 300);
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

Deno.test("courierTipEarnings prefers net", () => {
  assertEquals(courierTipEarnings({ tip: 100, courier_tip_net: 95.5 }), 95.5);
  assertEquals(courierTipEarnings({ tip: 100 }), 100);
});
