/**
 * Diagnose partner merchant order queue vs DB rows.
 * Usage: node scripts/smoke-merchant-orders.mjs
 */
import {
  getApiKeys,
  deliveryApi,
  pass,
  signInMerchant,
  getMerchantProfile,
  listMerchantOrders,
  restDelivery,
  ISLAND_GRILL,
  SEED_MERCHANT,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Island Grill merchant orders smoke ===\n');
  const { serviceKey, anonKey } = getApiKeys();

  const merchants = await restDelivery(
    serviceKey,
    `merchants?slug=eq.${ISLAND_GRILL.slug}&select=id,slug,name,owner_id`,
  );
  const merchant = merchants?.[0];
  if (!merchant) throw new Error(`Merchant ${ISLAND_GRILL.slug} not found in DB`);
  console.log('DB merchant:', merchant.id, merchant.slug, merchant.name);

  const dbOrders = await restDelivery(
    serviceKey,
    `orders?merchant_id=eq.${merchant.id}&status=in.(placed,accepted,preparing,ready)&select=id,order_number,status,payment_method,payment_status,placed_at&order=placed_at.desc&limit=10`,
  );
  console.log(`\nDB active orders (placed/accepted/preparing/ready): ${dbOrders.length}`);
  for (const row of dbOrders) {
    console.log(
      `  - ${row.order_number} status=${row.status} payment=${row.payment_method}/${row.payment_status}`,
    );
  }

  const paidVisible = dbOrders.filter(
    (o) => !['wipay', 'paypal'].includes(String(o.payment_method)) || o.payment_status !== 'pending',
  );
  console.log(`\nDB orders visible to kitchen filter: ${paidVisible.length}`);

  const token = await signInMerchant(anonKey);
  console.log(`\nSigned in as ${SEED_MERCHANT.email}`);

  const profile = await getMerchantProfile(anonKey, token);
  console.log('Profile merchant.id:', profile.id);
  console.log('Profile merchant.slug:', profile.slug);
  console.log('Owner match:', profile.id === merchant.id ? 'YES' : 'NO — MISMATCH');

  const apiOrders = await listMerchantOrders(anonKey, token);
  console.log(`\nGET /merchant/orders → ${apiOrders.length} active orders`);
  for (const row of apiOrders) {
    console.log(`  - ${row.order_number} status=${row.status} payment=${row.payment_method}/${row.payment_status}`);
  }

  const apiPlaced = apiOrders.filter((o) => o.status === 'placed');
  const dbPlaced = paidVisible.filter((o) => o.status === 'placed');

  console.log('\n=== Summary ===');
  console.log(`DB placed (kitchen-visible): ${dbPlaced.length}`);
  console.log(`API placed (New tab):        ${apiPlaced.length}`);

  if (dbPlaced.length > 0 && apiPlaced.length === 0) {
    throw new Error('DB has placed orders but API returned none');
  }
  if (profile.id !== merchant.id) {
    throw new Error('Partner profile merchant_id does not match Island Grill DB row');
  }

  pass('Merchant orders API aligns with DB expectations');
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-orders:', e.message);
  process.exit(1);
});
