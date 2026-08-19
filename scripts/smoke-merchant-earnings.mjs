#!/usr/bin/env node
/** Partner smoke: earnings / payouts summary */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner earnings smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk('GET /merchant/earnings', await deliveryApi(anonKey, token, '/merchant/earnings'));

  if (typeof body.currentBalance !== 'number') {
    throw new Error('earnings.currentBalance missing');
  }

  pass(`Earnings loaded — currentBalance=${body.currentBalance}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-earnings:', e.message);
  process.exit(1);
});
