#!/usr/bin/env node
/** Partner smoke: analytics dashboard data */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner analytics smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk('GET /merchant/analytics', await deliveryApi(anonKey, token, '/merchant/analytics'));

  if (typeof body.totalOrders !== 'number') {
    throw new Error('analytics.totalOrders should be a number');
  }

  pass(`Analytics loaded — totalOrders=${body.totalOrders}`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-analytics:', e.message);
  process.exit(1);
});
