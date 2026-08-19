/**
 * Smoke: earnings summary for the week.
 * Usage: node scripts/smoke-courier-earnings.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier earnings smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const body = assertOk(
    'GET /courier/earnings?period=week',
    await deliveryApi(anonKey, token, '/courier/earnings?period=week'),
  );
  console.log(`  Week total: J$${body.total ?? 0}, deliveries: ${body.deliveryCount ?? 0}`);

  pass('Courier earnings endpoint works');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
