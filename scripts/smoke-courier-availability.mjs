/**
 * Smoke: go online / go offline with GPS.
 * Usage: node scripts/smoke-courier-availability.mjs
 */
import { getApiKeys, pass } from './smoke/_shared.mjs';
import { goCourierOffline, goCourierOnline, signInCourier } from './smoke/_courier.mjs';

async function main() {
  console.log('=== Courier availability smoke ===\n');
  const { anonKey } = getApiKeys();
  const token = await signInCourier(anonKey);

  const online = await goCourierOnline(anonKey, token);
  if (!online.availability?.is_online) {
    throw new Error('Courier not marked online after PUT');
  }
  console.log(`  Online at ${online.availability.current_lat}, ${online.availability.current_lng}`);

  await goCourierOffline(anonKey, token);
  pass('Courier can go online and offline');
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
