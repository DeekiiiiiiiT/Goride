/**
 * Smoke: report an issue on a completed/delivered order.
 * Usage: node scripts/smoke-customer-issue.mjs
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
  console.log('=== Customer issue report smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const list = assertOk(
    'GET /customer/orders',
    await deliveryApi(anonKey, token, '/customer/orders'),
  );
  const target = (list.orders ?? []).find((o) =>
    ['completed', 'delivered'].includes(String(o.status)),
  );
  if (!target) {
    throw new Error('No completed/delivered order found — run smoke-e2e-delivery.mjs first');
  }

  const orderId = String(target.id);
  const orderNumber = String(target.order_number);
  console.log(`  Using order ${orderNumber} (${target.status})\n`);

  const issue = assertOk(
    'POST /orders/:id/issue',
    await deliveryApi(anonKey, token, `/orders/${orderId}/issue`, {
      method: 'POST',
      body: JSON.stringify({
        issueType: 'other',
        notes: 'Smoke test issue report — safe to ignore in support queue.',
      }),
    }),
  );
  if (!issue.issue?.id) throw new Error('Issue id missing in response');

  pass(`Issue report filed for ${orderNumber}`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
