/**
 * Smoke: courier login + load settings.
 * Usage: node scripts/smoke-courier-auth.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { SEED_COURIER, signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier auth & settings smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);
  console.log(`Signed in as ${SEED_COURIER.email}\n`);

  const settings = assertOk(
    'GET /courier/settings',
    await deliveryApi(anonKey, token, '/courier/settings'),
  );
  console.log(`  Settings keys: ${Object.keys(settings.settings ?? {}).length}`);

  pass('Courier can sign in and load settings');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
