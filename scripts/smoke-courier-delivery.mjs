/**
 * Smoke: accept offer and complete delivery (creates one test order).
 * Usage: node scripts/smoke-courier-delivery.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import {
  acceptCourierOffer,
  advanceCourierFromStatus,
  completeCourierDelivery,
  goCourierOffline,
  prepareReadyOffer,
} from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier delivery smoke ===\n');
  const { anonKey } = getApiKeys();
  const ctx = await prepareReadyOffer(anonKey);

  await acceptCourierOffer(anonKey, ctx.courierToken, ctx.offer.id);
  console.log(`  Accepted ${ctx.orderNumber}\n`);

  assertOk(
    'Courier → picked_up',
    await deliveryApi(anonKey, ctx.courierToken, `/orders/${ctx.orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'picked_up', actorType: 'courier' }),
    }),
  );

  assertOk(
    'PATCH /orders/:id/courier-location',
    await deliveryApi(anonKey, ctx.courierToken, `/orders/${ctx.orderId}/courier-location`, {
      method: 'PATCH',
      body: JSON.stringify({ lat: 18.014, lng: -76.954, client_seq: 1 }),
    }),
  );

  assertOk(
    'POST /orders/:id/courier-notes',
    await deliveryApi(anonKey, ctx.courierToken, `/orders/${ctx.orderId}/courier-notes`, {
      method: 'POST',
      body: JSON.stringify({ notes: 'Smoke test — left at door' }),
    }),
  );

  await advanceCourierFromStatus(anonKey, ctx.courierToken, ctx.orderId, 'picked_up');

  const history = assertOk(
    'GET /courier/history',
    await deliveryApi(anonKey, ctx.courierToken, '/courier/history?period=week'),
  );
  const row = (history.deliveries ?? []).find((d) => d.orderNumber === ctx.orderNumber);
  if (!row) throw new Error(`${ctx.orderNumber} missing from courier history`);

  await goCourierOffline(anonKey, ctx.courierToken);
  pass(`Full delivery completed for ${ctx.orderNumber}`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
