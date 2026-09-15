/**
 * Improved pause route enumeration (R-9) — known gated verbs must call requireActiveCourier.
 */
import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const ROUTES_PATH = new URL("../courierConsumerRoutes.ts", import.meta.url);

const GATED_ROUTE_MARKERS = [
  'app.put("/courier/availability"',
  'app.post("/courier/offers/:id/accept"',
  'app.post("/courier/offers/stack/accept"',
];

Deno.test("pause fold: requireActiveCourier + pauseGate wired", async () => {
  const src = await Deno.readTextFile(ROUTES_PATH);
  assert(src.includes("./remittance/pauseGate.ts") || src.includes("assertCourierNotPaused"));
  assert(src.includes("async function requireActiveCourier"));
  const hits = src.split("requireActiveCourier(serviceSb,").length - 1;
  assert(hits >= 3, `expected ≥3 requireActiveCourier call sites, got ${hits}`);
  for (const marker of GATED_ROUTE_MARKERS) {
    assert(src.includes(marker), `missing gated route ${marker}`);
  }
});
