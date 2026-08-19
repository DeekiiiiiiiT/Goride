#!/usr/bin/env node
/** Partner smoke: menu list */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner menu smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk('GET /merchant/menu', await deliveryApi(anonKey, token, '/merchant/menu'));

  const categories = body?.categories ?? [];
  const items = body?.items ?? [];
  if (items.length < 1) throw new Error('Menu has no items');

  pass(`Menu loaded — ${categories.length} categories, ${items.length} items`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-menu:', e.message);
  process.exit(1);
});
