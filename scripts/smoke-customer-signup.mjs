/**
 * Smoke: new customer account + first profile load (temp user cleaned up after).
 * Usage: node scripts/smoke-customer-signup.mjs
 */
import {
  assertOk,
  createConfirmedUser,
  deleteUser,
  deliveryApi,
  getApiKeys,
  pass,
  signIn,
} from './smoke/_shared.mjs';

async function main() {
  console.log('=== Customer signup smoke ===\n');
  const { anonKey, serviceKey } = getApiKeys();
  const email = `smoke-signup-${Date.now()}@roamrush.app`;
  const password = 'SmokeSignup2026!Temp';

  const user = await createConfirmedUser(serviceKey, email, password);
  const userId = user.id;
  console.log(`Created test user ${email}\n`);

  try {
    const token = await signIn(anonKey, email, password);
    const profile = assertOk(
      'GET /customer/profile (auto-provision)',
      await deliveryApi(anonKey, token, '/customer/profile'),
    );
    if (!profile.profile?.name) {
      throw new Error('Customer profile was not created for new user');
    }
    console.log(`  New profile: ${profile.profile.name}`);
    pass('New account can sign in and get a customer profile');
  } finally {
    await deleteUser(serviceKey, userId);
    console.log(`\nCleaned up test user ${email}`);
  }
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
