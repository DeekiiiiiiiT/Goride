import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDashCaptureSplit, courierDeliveryEarnings } from "./dashMoneySplit.ts";

Deno.test("Model A split", () => {
  const split = computeDashCaptureSplit(
    { platform_fee: 50, delivery_fee: 400, tip: 100, pricing_model: "legacy" },
    2000,
  );
  assertEquals(split.platformFee, 50);
  assertEquals(split.courierPayable, 500);
  assertEquals(split.merchantReceivable, 1450);
});

Deno.test("Model B split", () => {
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
    },
    3552.5,
  );
  assertEquals(split.platformFee, 724);
  assertEquals(split.courierPayable, 466);
  assertEquals(split.merchantReceivable, 2362.5);
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

Deno.test("courierDeliveryEarnings legacy", () => {
  assertEquals(courierDeliveryEarnings({ delivery_fee: 350 }), 350);
});
