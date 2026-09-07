#!/usr/bin/env node
/** Post-deploy: fail if the fleet worker cannot boot. */
const url =
  'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/health';

/** Windows + undici: bare process.exit() can assert UV_HANDLE_CLOSING. */
function exitSoon(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 150);
}

async function once() {
  const res = await fetch(url, { headers: { apikey: process.env.SUPABASE_ANON_KEY || '' } });
  // Drain body so the connection can close cleanly before we exit.
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
  }
  return res;
}

let lastStatus = 0;
for (let i = 0; i < 8; i++) {
  try {
    const res = await once();
    lastStatus = res.status;
    if (res.status === 200 || res.status === 401) {
      console.log(`Fleet worker booted (health ${res.status})`);
      exitSoon(0);
      break;
    }
    if (res.status !== 503) {
      console.error(`Fleet health unexpected status ${res.status}`);
      exitSoon(1);
      break;
    }
  } catch (e) {
    console.warn(`Health attempt ${i + 1} failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

if (process.exitCode == null) {
  console.error(
    `Fleet worker did not become healthy (last status ${lastStatus}). Data is intact — UI will look empty until boot succeeds.`,
  );
  exitSoon(1);
}
