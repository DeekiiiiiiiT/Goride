import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeDistanceTierAmount,
  computeRateCardAmountMinor,
} from "./rateBill.ts";

Deno.test("flat strategy uses amount_minor", () => {
  const r = computeRateCardAmountMinor({
    card: { amount_minor: 250000, pricing_strategy: "flat" },
    origin: { lat: 18, lng: -77 },
    destination: { lat: 18.1, lng: -77.1 },
    stopCount: 2,
  });
  assertEquals(r.amountMinor, 250000);
});

Deno.test("distance_tier picks band", () => {
  assertEquals(
    computeDistanceTierAmount(8, [
      { upToKm: 5, amountMinor: 1000 },
      { upToKm: 20, amountMinor: 2500 },
    ]),
    2500,
  );
});

Deno.test("distance_tier bills via card", () => {
  const r = computeRateCardAmountMinor({
    card: {
      amount_minor: 999,
      pricing_strategy: "distance_tier",
      rules: {
        tiers: [
          { upToKm: 5, amountMinor: 1000 },
          { upToKm: 100, amountMinor: 5000 },
        ],
      },
    },
    origin: { lat: 18.0, lng: -77.0 },
    destination: { lat: 18.05, lng: -77.0 }, // ~5.5km
    stopCount: 2,
  });
  assertEquals(r.amountMinor, 5000);
});

Deno.test("per_stop bills base + stops", () => {
  const r = computeRateCardAmountMinor({
    card: {
      amount_minor: 0,
      pricing_strategy: "per_stop",
      rules: { baseMinor: 1000, perStopMinor: 500 },
    },
    origin: null,
    destination: null,
    stopCount: 3,
  });
  assertEquals(r.amountMinor, 2500);
});
