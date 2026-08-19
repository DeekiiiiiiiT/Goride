/**
 * Smoke: decline a delivery offer (creates one ready test order).
 * Usage: node scripts/smoke-courier-decline.mjs
 */
import { assertOk, deliveryApi, getApiKeys, pass } from './smoke/_shared.mjs';
import { goCourierOffline, prepareReadyOffer } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier decline offer smoke ===\n');
  const { anonKey } = getApiKeys();
  const ctx = await prepareReadyOffer(anonKey);
  console.log(`  Offer ${ctx.offer.id} for ${ctx.orderNumber}\n`);

  assertOk(
    'Decline offer',
    await deliveryApi(anonKey, ctx.courierToken, `/courier/offers/${ctx.offer.id}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reasonId: 'smoke_test' }),
    }),
  );

  const after = await deliveryApi(anonKey, ctx.courierToken, '/courier/offers');
  const stillPending = (after.body?.offers ?? []).some((o) => o.id === ctx.offer.id);
  if (stillPending) throw new Error('Declined offer still appears as pending');

  await goCourierOffline(anonKey, ctx.courierToken);
  pass(`Declined offer for ${ctx.orderNumber}`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
