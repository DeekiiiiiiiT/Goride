/** Post-deploy: fail if fleet-fuel worker cannot boot. */
const url =
  'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-fuel/health';

function exitSoon(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 150);
}

async function once() {
  // Prefer real anon JWT so /health can return 200 (basePath + verify_jwt).
  const key = process.env.SUPABASE_ANON_KEY || "";
  const res = await fetch(url, {
    headers: key
      ? { apikey: key, Authorization: `Bearer ${key}` }
      : {},
  });
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
    // 200 = app health OK; 401 = gateway/JWT without key (worker still booted)
    if (res.status === 200 || res.status === 401) {
      console.log(`fleet-fuel worker booted (health ${res.status})`);
      exitSoon(0);
      break;
    }
    if (res.status !== 503) {
      console.error(`fleet-fuel health unexpected status ${res.status}`);
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
    `fleet-fuel worker did not become healthy (last status ${lastStatus}).`,
  );
  exitSoon(1);
}
