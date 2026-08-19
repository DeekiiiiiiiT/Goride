#!/usr/bin/env node
/** Partner smoke: notifications feed */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner notifications smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk(
    'GET /merchant/notifications',
    await deliveryApi(anonKey, token, '/merchant/notifications'),
  );

  pass(`Notifications loaded — count=${(body?.notifications ?? []).length}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-notifications:', e.message);
  process.exit(1);
});
