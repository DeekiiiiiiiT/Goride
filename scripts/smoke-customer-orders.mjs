/**
 * Smoke: customer order history + track single order.
 * Usage: node scripts/smoke-customer-orders.mjs
 */
import {
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signIn,
  SEED_CUSTOMER,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer orders & tracking smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const list = assertOk(
    'GET /customer/orders',
    await deliveryApi(anonKey, token, '/customer/orders'),
  );
  const orders = list.orders ?? [];
  console.log(`  Order history count: ${orders.length}`);
  if (!orders.length) {
    throw new Error('No orders in history — run smoke-customer-checkout.mjs first');
  }

  const latest = orders[0];
  const orderId = String(latest.id);
  const orderNumber = String(latest.order_number);
  console.log(`  Latest: ${orderNumber} (${latest.status})`);

  const detail = assertOk(
    'GET /orders/:id (track)',
    await deliveryApi(anonKey, token, `/orders/${orderId}`),
  );
  if (!detail.order?.id || String(detail.order.id) !== orderId) {
    throw new Error('Track order returned wrong order');
  }
  console.log(`  Timeline events: ${(detail.events ?? []).length}`);

  pass(`Order list + track works (${orderNumber})`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
