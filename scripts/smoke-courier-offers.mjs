/**
 * Smoke: read pending offers (empty list is OK when no ready orders).
 * Usage: node scripts/smoke-courier-offers.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { goCourierOnline, signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier offers poll smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);
  await goCourierOnline(anonKey, token);

  const body = assertOk(
    'GET /courier/offers',
    await deliveryApi(anonKey, token, '/courier/offers'),
  );
  const offers = body.offers ?? [];
  console.log(`  Pending offers: ${offers.length}`);
  if (offers.length) {
    const first = offers[0];
    console.log(`  First: ${first.order?.order_number ?? first.order_id} (expires ${first.expires_at})`);
  }

  pass(`Offers endpoint works (${offers.length} pending)`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
