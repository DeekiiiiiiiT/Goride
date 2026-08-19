#!/usr/bin/env node
/** Partner smoke: business hours + special hours */
import {
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signInMerchant,
  getMerchantProfile,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner hours smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const merchant = await getMerchantProfile(anonKey, token);

  const hoursBody = assertOk(
    'GET /merchants/:id/hours',
    await deliveryApi(anonKey, token, `/merchants/${merchant.id}/hours`),
  );
  assertOk(
    'GET /merchants/:id/special-hours',
    await deliveryApi(anonKey, token, `/merchants/${merchant.id}/special-hours`),
  );

  const hours = hoursBody?.hours ?? [];
  pass(`Hours loaded — ${hours.length} day entries`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-hours:', e.message);
  process.exit(1);
});
