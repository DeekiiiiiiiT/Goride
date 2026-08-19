/**
 * Smoke: turn-by-turn route estimate between two points.
 * Usage: node scripts/smoke-courier-route.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { COURIER_GPS, signInCourier } from './smoke/_courier.mjs';
import { DROP_OFF } from './smoke/_shared.mjs';

async function main() {
  console.log('=== Courier route smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const q = new URLSearchParams({
    fromLat: String(COURIER_GPS.lat),
    fromLng: String(COURIER_GPS.lng),
    toLat: String(DROP_OFF.lat),
    toLng: String(DROP_OFF.lng),
  });

  const body = assertOk(
    'GET /courier/route',
    await deliveryApi(anonKey, token, `/courier/route?${q}`),
  );
  const route = body.route;
  if (!route || !Number.isFinite(Number(route.distanceKm))) {
    throw new Error('Route response missing distanceKm');
  }
  console.log(
    `  Route: ${route.distanceKm} km, ~${route.durationMinutes} min (${route.source})`,
  );

  pass('Courier route estimate works');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
