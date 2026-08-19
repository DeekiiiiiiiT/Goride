/**
 * Smoke: add/list/remove favorite restaurant.
 * Usage: node scripts/smoke-customer-favorites.mjs
 */
import {
  ISLAND_GRILL,
  SEED_CUSTOMER,
  assertOk,
  deliveryApi,
  getApiKeys,
  pass,
  signIn,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer favorites smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  assertOk(
    'POST /customer/favorites',
    await deliveryApi(anonKey, token, '/customer/favorites', {
      method: 'POST',
      body: JSON.stringify({ merchantId: ISLAND_GRILL.id }),
    }),
  );

  const list = assertOk(
    'GET /customer/favorites',
    await deliveryApi(anonKey, token, '/customer/favorites'),
  );
  const ids = list.merchantIds ?? list.favorites?.map((f) => f.merchantId) ?? [];
  if (!ids.includes(ISLAND_GRILL.id)) {
    throw new Error('Island Grill not in favorites after add');
  }
  console.log(`  Favorites count: ${ids.length}`);

  assertOk(
    'DELETE /customer/favorites/:merchantId',
    await deliveryApi(anonKey, token, `/customer/favorites/${ISLAND_GRILL.id}`, {
      method: 'DELETE',
    }),
  );

  pass('Favorites add, list, and remove work');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
