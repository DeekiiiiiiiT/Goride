/**
 * Smoke: rate a completed order (skips if none eligible).
 * Usage: node scripts/smoke-customer-review.mjs
 */
import {
  SEED_CUSTOMER,
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signIn,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer review smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const list = assertOk(
    'GET /customer/orders',
    await deliveryApi(anonKey, token, '/customer/orders'),
  );
  const target = (list.orders ?? []).find(
    (o) => ['completed', 'delivered'].includes(String(o.status)) && o.customer_rating == null,
  );
  if (!target) {
    console.log('  No unrated completed order — skipping review step');
    pass('Review smoke skipped (no eligible order)');
    return;
  }

  const orderId = String(target.id);
  const orderNumber = String(target.order_number);
  console.log(`  Rating order ${orderNumber}\n`);

  const review = assertOk(
    'POST /orders/:id/review',
    await deliveryApi(anonKey, token, `/orders/${orderId}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating: 5, review: 'Smoke test — great meal!' }),
    }),
  );
  if (Number(review.order?.customer_rating) !== 5) {
    throw new Error('Rating was not saved');
  }

  pass(`Review submitted for ${orderNumber}`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
