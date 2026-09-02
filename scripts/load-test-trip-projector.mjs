#!/usr/bin/env node
/**
 * Load-test Rush trip projector — records timing for ops sign-off.
 * Usage: node scripts/load-test-trip-projector.mjs [iterations]
 */
const iterations = Number(process.argv[2] || 50);
const sampleTrip = {
  id: `load-test-${Date.now()}`,
  platform: "Roam Rush",
  driverId: "load-test-driver",
  amount: 1200,
  status: "Completed",
  organizationId: process.env.LOAD_TEST_ORG_ID || "00000000-0000-4000-8000-000000000001",
};

const url =
  process.env.FLEET_INTERNAL_TRIPS_URL ||
  `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/functions/v1/fleet-server/make-server-37f42386/internal/trips/project`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const times = [];
for (let i = 0; i < iterations; i++) {
  const trip = { ...sampleTrip, id: `${sampleTrip.id}-${i}` };
  const start = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([trip]),
  });
  const elapsed = performance.now() - start;
  times.push(elapsed);
  if (!res.ok) {
    console.error(`Iteration ${i} failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
}

times.sort((a, b) => a - b);
const p95 = times[Math.floor(times.length * 0.95)] ?? times[times.length - 1];
console.log(JSON.stringify({
  iterations,
  minMs: times[0],
  maxMs: times[times.length - 1],
  avgMs: times.reduce((a, b) => a + b, 0) / times.length,
  p95Ms: p95,
}, null, 2));
