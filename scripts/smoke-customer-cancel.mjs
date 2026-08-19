/**
 * Smoke: place order then customer-cancel (before prep).
 * Usage: node scripts/smoke-customer-cancel.mjs
 */
import {
  SEED_CUSTOMER,
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  placeCashOrder,
  signIn,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer cancel smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const { orderId, orderNumber } = await placeCashOrder(anonKey, token);
  console.log(`✓ Placed order ${orderNumber}\n`);

  const cancelled = assertOk(
    'POST /orders/:id/cancel',
    await deliveryApi(anonKey, token, `/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Smoke test cancel' }),
    }),
  );
  if (cancelled.order?.status !== 'cancelled') {
    throw new Error(`Expected cancelled, got ${cancelled.order?.status}`);
  }

  pass(`Customer can cancel a new order (${orderNumber})`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
