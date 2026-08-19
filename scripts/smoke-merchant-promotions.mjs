#!/usr/bin/env node
/** Partner smoke: promotions list */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner promotions smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk('GET /merchant/promotions', await deliveryApi(anonKey, token, '/merchant/promotions'));

  const promotions = body?.promotions ?? [];
  pass(`Promotions loaded — count=${promotions.length}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-promotions:', e.message);
  process.exit(1);
});
