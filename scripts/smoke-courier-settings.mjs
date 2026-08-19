/**
 * Smoke: load and patch cloud-synced app settings.
 * Usage: node scripts/smoke-courier-settings.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier settings smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  assertOk(
    'GET /courier/settings',
    await deliveryApi(anonKey, token, '/courier/settings'),
  );

  const patched = assertOk(
    'PATCH /courier/settings',
    await deliveryApi(anonKey, token, '/courier/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        settings: {
          smokeTestCheckedAt: new Date().toISOString(),
        },
      }),
    }),
  );

  if (!patched.settings || typeof patched.settings !== 'object') {
    throw new Error('Settings patch did not return settings object');
  }
  console.log(`  Settings keys: ${Object.keys(patched.settings).length}`);

  pass('Courier settings load and save work');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
