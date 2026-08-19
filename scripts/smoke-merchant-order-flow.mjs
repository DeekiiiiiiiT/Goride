#!/usr/bin/env node
/** Partner smoke: accept → preparing → ready on a freshly placed cash order */
import {
  getApiKeys,
  pass,
  signInMerchant,
  signInCustomer,
  preparePlacedOrder,
  advanceMerchantOrder,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner order flow smoke ===\n');
  const { anonKey } = getApiKeys();
  const merchantToken = await signInMerchant(anonKey);
  const customerToken = await signInCustomer(anonKey);

  const { orderId, placed } = await preparePlacedOrder(anonKey, merchantToken, customerToken);
  console.log(`  Placed order ${placed.orderNumber}`);

  const finalStatus = await advanceMerchantOrder(anonKey, merchantToken, orderId, 'ready');
  if (finalStatus !== 'ready') throw new Error(`Expected ready, got ${finalStatus}`);

  pass(`Order ${placed.orderNumber} advanced to ready`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-order-flow:', e.message);
  process.exit(1);
});
