/**
 * Smoke: search, store browse, promotions.
 * Usage: node scripts/smoke-customer-discovery.mjs
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
  console.log('=== Customer discovery smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);

  const search = assertOk(
    'GET /search?q=jerk',
    await deliveryApi(anonKey, token, '/search?q=jerk'),
  );
  console.log(
    `  Search: ${(search.merchants ?? []).length} restaurants, ${(search.items ?? []).length} dishes`,
  );
  if (!(search.items ?? []).length && !(search.merchants ?? []).length) {
    throw new Error('Search returned no results for "jerk"');
  }

  assertOk(
    `GET /merchants/${ISLAND_GRILL.slug}`,
    await deliveryApi(anonKey, token, `/merchants/${ISLAND_GRILL.slug}`),
  );

  const promos = assertOk(
    'GET /promotions',
    await deliveryApi(anonKey, token, '/promotions'),
  );
  console.log(`  Active promotions: ${(promos.promotions ?? []).length}`);

  pass('Search, store, and promotions endpoints respond');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
