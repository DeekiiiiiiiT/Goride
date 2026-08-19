/**
 * Smoke: customer cash checkout (places one real test order).
 * Usage: node scripts/smoke-customer-checkout.mjs
 */
import {
  getApiKeys,
  pass,
  placeCashOrder,
  signIn,
  SEED_CUSTOMER,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer checkout smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const { orderNumber, orderId, idempotencyKey } = await placeCashOrder(anonKey, token);
  console.log(`✓ Placed cash order ${orderNumber} (${orderId})`);

  const retry = await placeCashOrder(anonKey, token, { idempotencyKey });
  if (retry.orderId !== orderId) {
    throw new Error('Idempotency retry returned a different order id');
  }
  console.log('✓ Idempotency retry returned same order');

  pass(`Cash checkout works (${orderNumber})`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
