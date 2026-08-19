#!/usr/bin/env node
/** Partner smoke: sign-in + merchant profile */
import {
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signInMerchant,
  getMerchantProfile,
  ISLAND_GRILL,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner auth smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const merchant = await getMerchantProfile(anonKey, token);

  if (merchant.id !== ISLAND_GRILL.id) {
    throw new Error(`Expected Island Grill merchant id, got ${merchant.id}`);
  }

  assertOk(
    'GET /merchant/application-status',
    await deliveryApi(anonKey, token, '/merchant/application-status'),
  );

  pass(`Partner signed in — ${merchant.name}, accepting=${merchant.is_accepting_orders}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-auth:', e.message);
  process.exit(1);
});
