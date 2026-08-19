#!/usr/bin/env node
/** Partner smoke: merchant settings + notification prefs */
import {
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signInMerchant,
  getMerchantProfile,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner settings smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const merchant = await getMerchantProfile(anonKey, token);

  assertOk('GET /merchant/settings', await deliveryApi(anonKey, token, '/merchant/settings'));
  assertOk(
    'GET /merchant/notification-settings',
    await deliveryApi(anonKey, token, '/merchant/notification-settings'),
  );

  pass(`Settings loaded for ${merchant.name}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-settings:', e.message);
  process.exit(1);
});
