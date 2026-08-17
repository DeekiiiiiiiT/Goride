#!/usr/bin/env node
/** Post-deploy: fail if the fleet worker cannot boot. */
const url =
  'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/health';

async function once() {
  const res = await fetch(url, { headers: { apikey: process.env.SUPABASE_ANON_KEY || '' } });
  return res;
}

let lastStatus = 0;
for (let i = 0; i < 8; i++) {
  try {
    const res = await once();
    lastStatus = res.status;
    if (res.status === 200 || res.status === 401) {
      console.log(`Fleet worker booted (health ${res.status})`);
      process.exit(0);
    }
    if (res.status !== 503) {
      console.error(`Fleet health unexpected status ${res.status}`);
      process.exit(1);
    }
  } catch (e) {
    console.warn(`Health attempt ${i + 1} failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.error(`Fleet worker did not become healthy (last status ${lastStatus}). Data is intact — UI will look empty until boot succeeds.`);
process.exit(1);
