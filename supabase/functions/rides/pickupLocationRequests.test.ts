import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  expirePickupLocationRequestIfNeeded,
  PICKUP_LOCATION_REQUEST_TTL_MS,
  toPickupLocationRequestDto,
} from "./pickupLocationRequests.ts";
import { normalizePhoneE164, phonesMatch } from "./rideAccess.ts";

Deno.test("PICKUP_LOCATION_REQUEST_TTL_MS is 15 minutes", () => {
  assertEquals(PICKUP_LOCATION_REQUEST_TTL_MS, 15 * 60_000);
});

Deno.test("toPickupLocationRequestDto maps shared location", () => {
  const dto = toPickupLocationRequestDto({
    id: "req-1",
    token: "abc",
    status: "shared",
    rider_name: "Alex",
    rider_phone_e164: "+18761234567",
    rider_source: "roam_tag",
    pickup_lat: 18.0,
    pickup_lng: -77.0,
    pickup_address: "Kingston",
    accuracy_meters: 12,
    expires_at: "2026-06-16T12:00:00.000Z",
    shared_at: "2026-06-16T11:50:00.000Z",
  });
  assertEquals(dto.status, "shared");
  assertEquals(dto.pickup_lat, 18);
  assertEquals(dto.url.includes("/location-share/abc"), true);
});

Deno.test("normalizePhoneE164 accepts JM 10-digit local", () => {
  assertEquals(normalizePhoneE164("8761234567"), "+18761234567");
});

Deno.test("phonesMatch compares normalized numbers", () => {
  assertEquals(phonesMatch("+18761234567", "8761234567"), true);
});

Deno.test("expirePickupLocationRequestIfNeeded marks pending as expired", async () => {
  const updates: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          updates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };

  const row = {
    id: "req-1",
    status: "pending",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };

  const fresh = await expirePickupLocationRequestIfNeeded(
    db as never,
    "pickup_location_requests",
    row,
  );

  assertEquals(fresh.status, "expired");
  assertEquals(updates[0]?.status, "expired");
});

Deno.test("TERMINAL shared status includes coordinates in dto", () => {
  const dto = toPickupLocationRequestDto({
    id: "req-2",
    token: "tok",
    status: "consumed",
    rider_name: "Sam",
    rider_phone_e164: "+18760000000",
    rider_source: "phone_contact",
    expires_at: "2026-06-16T12:00:00.000Z",
    consumed_at: "2026-06-16T12:05:00.000Z",
  });
  assertEquals(dto.status, "consumed");
});

Deno.test("expirePickupLocationRequestIfNeeded leaves shared unchanged", async () => {
  const db = {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };

  const row = {
    id: "req-1",
    status: "shared",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };

  const fresh = await expirePickupLocationRequestIfNeeded(
    db as never,
    "pickup_location_requests",
    row,
  );

  assertEquals(fresh.status, "shared");
});
