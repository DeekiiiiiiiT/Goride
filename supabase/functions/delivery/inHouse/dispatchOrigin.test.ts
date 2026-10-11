import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { courierSearchOrigin } from "./dispatchOrigin.ts";

Deno.test("courier search uses the restaurant even when the customer pin exists", () => {
  assertEquals(courierSearchOrigin({
    merchantLat: 18.01,
    merchantLng: -76.8,
    deliveryLat: 18.2,
    deliveryLng: -77.1,
  }), { lat: 18.01, lng: -76.8 });
});

Deno.test("courier search falls back to the customer pin when the restaurant has no coordinates", () => {
  assertEquals(courierSearchOrigin({
    merchantLat: null,
    merchantLng: null,
    deliveryLat: 18.2,
    deliveryLng: -77.1,
  }), { lat: 18.2, lng: -77.1 });
});
