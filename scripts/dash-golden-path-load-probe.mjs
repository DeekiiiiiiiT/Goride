/**
 * Lightweight load probe for Dash golden-path endpoints (Phase 3).
 * Usage: DELIVERY_URL=https://... SERVICE_ROLE=... node scripts/dash-golden-path-load-probe.mjs
 *
 * Does not place real orders — hammers health + redispatch with concurrency.
 */
const base = process.env.DELIVERY_URL || process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE;
const concurrency = Number(process.env.CONCURRENCY || 10);
const rounds = Number(process.env.ROUNDS || 5);

if (!base || !serviceRole) {
  console.error('Set DELIVERY_URL (functions base …/functions/v1/delivery) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const healthUrl = `${base.replace(/\/$/, '')}/health/dash-golden-path`;
const redispatchUrl = `${base.replace(/\/$/, '')}/courier/offers/redispatch`;

async function hit(url) {
  const started = Date.now();
  const res = await fetch(url, {
    method: url.includes('redispatch') ? 'POST' : 'GET',
    headers: {
      'x-service-role': serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });
  return { status: res.status, ms: Date.now() - started };
}

async function main() {
  const results = [];
  for (let r = 0; r < rounds; r++) {
    const batch = Array.from({ length: concurrency }, () =>
      Promise.all([hit(healthUrl), hit(redispatchUrl)]),
    );
    const round = await Promise.all(batch);
    results.push(...round.flat());
  }
  const ok = results.filter((r) => r.status < 500).length;
  const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
  console.log(JSON.stringify({ total: results.length, ok, avgMs: Math.round(avg) }, null, 2));
  if (ok < results.length) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
