/**
 * Smoke: active delivery stack legs (empty is OK).
 * Usage: node scripts/smoke-courier-stack.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier stack smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const body = assertOk(
    'GET /courier/stack',
    await deliveryApi(anonKey, token, '/courier/stack'),
  );
  console.log(`  Active stack legs: ${(body.legs ?? []).length}`);

  pass('Courier stack endpoint works');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
