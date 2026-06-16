import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { processRiderArrearsPayment } from "./processRiderArrearsPayment.ts";

const originalSwitchToCard = Deno.env.get("CASH_SETTLEMENT_SWITCH_TO_CARD");
const originalEnabled = Deno.env.get("CASH_SETTLEMENT_ENABLED");
const originalV2 = Deno.env.get("CASH_SETTLEMENT_V2");

function restoreEnv() {
  if (originalSwitchToCard === undefined) Deno.env.delete("CASH_SETTLEMENT_SWITCH_TO_CARD");
  else Deno.env.set("CASH_SETTLEMENT_SWITCH_TO_CARD", originalSwitchToCard);
  if (originalEnabled === undefined) Deno.env.delete("CASH_SETTLEMENT_ENABLED");
  else Deno.env.set("CASH_SETTLEMENT_ENABLED", originalEnabled);
  if (originalV2 === undefined) Deno.env.delete("CASH_SETTLEMENT_V2");
  else Deno.env.set("CASH_SETTLEMENT_V2", originalV2);
}

Deno.test("processRiderArrearsPayment returns feature_disabled when flag off", async () => {
  Deno.env.delete("CASH_SETTLEMENT_SWITCH_TO_CARD");
  Deno.env.set("CASH_SETTLEMENT_ENABLED", "1");
  Deno.env.set("CASH_SETTLEMENT_V2", "1");

  const result = await processRiderArrearsPayment({} as never, {
    riderUserId: "rider-1",
    currency: "JMD",
    paymentMethodId: "visa_1212",
    idempotencyKey: "key-1",
    source: "wallet",
  });

  assertEquals(result.success, false);
  assertEquals(result.error, "feature_disabled");
  restoreEnv();
});

Deno.test("processRiderArrearsPayment rejects cash payment method", async () => {
  Deno.env.set("CASH_SETTLEMENT_ENABLED", "1");
  Deno.env.set("CASH_SETTLEMENT_V2", "1");
  Deno.env.set("CASH_SETTLEMENT_SWITCH_TO_CARD", "1");

  const result = await processRiderArrearsPayment({} as never, {
    riderUserId: "rider-1",
    currency: "JMD",
    paymentMethodId: "cash",
    idempotencyKey: "key-1",
    source: "wallet",
  });

  assertEquals(result.success, false);
  assertEquals(result.error, "invalid_payment_method");
  restoreEnv();
});

Deno.test("processRiderArrearsPayment returns no_arrears when balance clear", async () => {
  Deno.env.set("CASH_SETTLEMENT_ENABLED", "1");
  Deno.env.set("CASH_SETTLEMENT_V2", "1");
  Deno.env.set("CASH_SETTLEMENT_SWITCH_TO_CARD", "1");

  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { balance_minor: 500 },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await processRiderArrearsPayment(db as never, {
    riderUserId: "rider-1",
    currency: "JMD",
    paymentMethodId: "visa_1212",
    idempotencyKey: "key-1",
    source: "wallet",
  });

  assertEquals(result.success, false);
  assertEquals(result.error, "no_arrears");
  restoreEnv();
});
