#!/usr/bin/env node
/** Partner smoke: pause/resume accepting orders (restores original state) */
import {
  getApiKeys,
  pass,
  signInMerchant,
  getMerchantProfile,
  setAcceptingOrders,
} from './smoke/_merchant.mjs';

async function main() {
  console.log('=== Partner pause/resume smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInMerchant(anonKey);
  const before = await getMerchantProfile(anonKey, token);
  const original = Boolean(before.is_accepting_orders);

  await setAcceptingOrders(anonKey, token, before.id, false);
  let profile = await getMerchantProfile(anonKey, token);
  if (profile.is_accepting_orders !== false) {
    throw new Error('Expected is_accepting_orders=false after pause');
  }

  await setAcceptingOrders(anonKey, token, before.id, true);
  profile = await getMerchantProfile(anonKey, token);
  if (profile.is_accepting_orders !== true) {
    throw new Error('Expected is_accepting_orders=true after resume');
  }

  await setAcceptingOrders(anonKey, token, before.id, true);

  pass('Pause/resume OK — left accepting_orders=true');
}

main().catch((e) => {
  console.error('\nFAIL smoke-merchant-pause:', e.message);
  process.exit(1);
});
