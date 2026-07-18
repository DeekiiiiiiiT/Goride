import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.218.2/assert/mod.ts";
import { mintQuoteToken, verifyQuoteToken } from "./quoteToken.ts";

const COORDS = {
  pickup_lat: 18.0179,
  pickup_lng: -76.8099,
  dropoff_lat: 18.1096,
  dropoff_lng: -77.2975,
  vehicle_type: "standard",
};

const BASE_PAYLOAD = {
  ...COORDS,
  city: "kingston",
  distance_km: 12.5,
  duration_minutes: 28,
  surge_multiplier: 1,
  fare_estimate_minor: 150000,
  currency: "JMD",
};

Deno.test("mintQuoteToken fails closed when secret missing", async () => {
  const prev = Deno.env.get("ROAM_RIDES_QUOTE_SECRET");
  Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  try {
    await assertRejects(
      () => mintQuoteToken(BASE_PAYLOAD),
      Error,
      "ROAM_RIDES_QUOTE_SECRET",
    );
  } finally {
    if (prev !== undefined) Deno.env.set("ROAM_RIDES_QUOTE_SECRET", prev);
  }
});

Deno.test("verifyQuoteToken rejects unsigned tokens even when secret is set", async () => {
  Deno.env.set("ROAM_RIDES_QUOTE_SECRET", "test-secret-for-quote-token-unit");
  try {
    const forged = `unsigned.${btoa(JSON.stringify({
      ...BASE_PAYLOAD,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }))}`;
    const result = await verifyQuoteToken(forged, COORDS);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, "unsigned_rejected");
  } finally {
    Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  }
});

Deno.test("verifyQuoteToken fails closed when secret missing", async () => {
  Deno.env.set("ROAM_RIDES_QUOTE_SECRET", "temp-mint-secret");
  const token = await mintQuoteToken(BASE_PAYLOAD);
  Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  try {
    const result = await verifyQuoteToken(token, COORDS);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, "missing_secret");
  } finally {
    Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  }
});

Deno.test("mint + verify round-trip with secret", async () => {
  Deno.env.set("ROAM_RIDES_QUOTE_SECRET", "test-secret-for-quote-token-unit");
  try {
    const token = await mintQuoteToken(BASE_PAYLOAD);
    assertEquals(token.startsWith("unsigned."), false);
    const result = await verifyQuoteToken(token, COORDS);
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.payload.fare_estimate_minor, 150000);
      assertEquals(result.payload.vehicle_type, "standard");
    }
  } finally {
    Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  }
});

Deno.test("verifyQuoteToken rejects bad signature", async () => {
  Deno.env.set("ROAM_RIDES_QUOTE_SECRET", "test-secret-for-quote-token-unit");
  try {
    const token = await mintQuoteToken(BASE_PAYLOAD);
    const tampered = token.slice(0, -4) + "xxxx";
    const result = await verifyQuoteToken(tampered, COORDS);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, "bad_signature");
  } finally {
    Deno.env.delete("ROAM_RIDES_QUOTE_SECRET");
  }
});
