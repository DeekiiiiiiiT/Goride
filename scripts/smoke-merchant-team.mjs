#!/usr/bin/env node
/** Partner smoke: team members + pending invites */
import { assertOk, deliveryApi, getApiKeys, pass, signInMerchant } from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner team smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const body = assertOk('GET /merchant/team', await deliveryApi(anonKey, token, '/merchant/team'));

  const members = body?.members ?? [];
  if (!Array.isArray(body?.pendingInvites)) {
    throw new Error('Team response missing pendingInvites array');
  }

  pass(`Team loaded — ${members.length} members, ${body.pendingInvites.length} pending invites`);
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-team:', e.message);
  process.exit(1);
});
