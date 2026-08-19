/**
 * Smoke: customer login + profile read/update.
 * Usage: node scripts/smoke-customer-auth.mjs
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
  console.log('=== Customer auth & profile smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);
  console.log(`Signed in as ${SEED_CUSTOMER.email}\n`);

  const profile = assertOk(
    'GET /customer/profile',
    await deliveryApi(anonKey, token, '/customer/profile'),
  );
  const originalName = profile.profile?.name ?? SEED_CUSTOMER.name;
  console.log(`  Profile name: ${originalName}`);

  const patched = assertOk(
    'PATCH /customer/profile',
    await deliveryApi(anonKey, token, '/customer/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: originalName }),
    }),
  );
  if (!patched.profile?.name) throw new Error('Profile missing after patch');

  console.log(`  Profile OK (${patched.profile.name})`);
  pass('Customer can sign in and load/update profile');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
