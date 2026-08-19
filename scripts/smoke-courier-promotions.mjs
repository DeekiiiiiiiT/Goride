/**
 * Smoke: active peak-pay promotions list.
 * Usage: node scripts/smoke-courier-promotions.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier promotions smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const body = assertOk(
    'GET /courier/promotions/active',
    await deliveryApi(anonKey, token, '/courier/promotions/active'),
  );
  console.log(`  Active peak windows: ${(body.promotions ?? []).length}`);

  pass('Courier promotions endpoint works');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
