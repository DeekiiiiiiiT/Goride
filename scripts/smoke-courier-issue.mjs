/**
 * Smoke: report a non-abort delivery issue on an active order.
 * Usage: node scripts/smoke-courier-issue.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import {
  acceptCourierOffer,
  completeCourierDelivery,
  goCourierOffline,
  prepareReadyOffer,
} from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier issue report smoke ===\n');
  const { anonKey } = getApiKeys();
  const ctx = await prepareReadyOffer(anonKey);
  await acceptCourierOffer(anonKey, ctx.courierToken, ctx.offer.id);

  assertOk(
    'POST /orders/:id/courier-issue',
    await deliveryApi(anonKey, ctx.courierToken, `/orders/${ctx.orderId}/courier-issue`, {
      method: 'POST',
      body: JSON.stringify({
        issueType: 'merchant_delay',
        notes: 'Smoke test — merchant delay note only, order continues.',
      }),
    }),
  );

  await completeCourierDelivery(anonKey, ctx.courierToken, ctx.orderId);
  await goCourierOffline(anonKey, ctx.courierToken);
  pass(`Courier issue logged on ${ctx.orderNumber} and delivery completed`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
