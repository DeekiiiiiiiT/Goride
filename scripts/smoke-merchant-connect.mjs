#!/usr/bin/env node
/** Partner smoke: Stripe Connect status (read-only) */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner Connect smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk(
    'GET /merchant/connect/status',
    await deliveryApi(anonKey, token, '/merchant/connect/status'),
  );

  pass(`Connect status — onboarded=${body.onboarded}, charges=${body.charges_enabled}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-connect:', e.message);
  process.exit(1);
});
