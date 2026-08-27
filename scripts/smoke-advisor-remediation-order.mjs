/**
 * One-off smoke: place cash order at Island Grill coords (in-market).
 * Usage: node scripts/smoke-advisor-remediation-order.mjs
 */
import {
  getApiKeys,
  pass,
  signIn,
  SEED_CUSTOMER,
  ISLAND_GRILL,
  deliveryApi,
} from './smoke/_shared.mjs';
import { randomUUID } from 'node:crypto';

async function placeNearMerchant(anonKey, token, idempotencyKey) {
  const res = await deliveryApi(anonKey, token, '/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      merchantId: ISLAND_GRILL.id,
      items: [{ menuItemId: ISLAND_GRILL.menuItemId, quantity: 1 }],
      paymentMethod: 'cash',
      deliveryAddress: 'Near Island Grill (advisor smoke)',
      deliveryLat: 18.013,
      deliveryLng: -76.779,
      customerName: SEED_CUSTOMER.name,
      phone: SEED_CUSTOMER.phone,
      tip: 0,
    }),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Place order failed (${res.status}): ${res.text}`);
  }
  const order = res.body?.order ?? res.body;
  return { orderId: String(order.id), orderNumber: String(order.order_number) };
}

async function main() {
  console.log('=== Advisor remediation order smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);
  const idempotencyKey = `advisor-smoke-${randomUUID()}`;

  const first = await placeNearMerchant(anonKey, token, idempotencyKey);
  console.log(`✓ Placed cash order ${first.orderNumber} (${first.orderId})`);

  const retry = await placeNearMerchant(anonKey, token, idempotencyKey);
  if (retry.orderId !== first.orderId) {
    throw new Error('Idempotency retry returned a different order id');
  }
  console.log('✓ Idempotency retry returned same order');

  pass(`Order + idempotency OK (${first.orderNumber})`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
