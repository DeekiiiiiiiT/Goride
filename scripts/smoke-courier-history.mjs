/**
 * Smoke: activity / delivery history for the week.
 * Usage: node scripts/smoke-courier-history.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier history smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const body = assertOk(
    'GET /courier/history?period=week',
    await deliveryApi(anonKey, token, '/courier/history?period=week'),
  );
  const rows = body.deliveries ?? [];
  console.log(`  History rows (week): ${rows.length}`);
  if (rows.length) {
    console.log(`  Latest: ${rows[0].orderNumber} — ${rows[0].status}`);
  }

  pass('Courier history endpoint works');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
