#!/usr/bin/env node
/**
 * Toll Reconciliation — Automated E2E Smoke Test (prod, seeded + cleaned)
 *
 * Drives the full toll-reconciliation flow against a DEPLOYED make-server edge
 * function on a real Supabase project, using a self-contained, `e2e_`-namespaced
 * dataset that is torn down in a `finally` block. Nothing touches non-`e2e_` data.
 *
 * Flow: auto-match → refund suggestions → resolve each of the 4 types →
 * undo/revert → rides→ledger bridge (dry-run, apply, idempotent re-run) →
 * automation flag off→on→off revert → teardown.
 *
 * Required env:
 *   SUPABASE_URL                e.g. https://csfllzzastacofsvcdsc.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   service role key (seed + teardown only)
 *   SUPABASE_ANON_KEY           anon key (used to call the edge endpoints, like the app)
 *
 * Flags: --no-teardown (leave seeded data for debugging), --verbose
 *
 * Prerequisite: deploy the edge functions first  →  pnpm deploy:edge
 */

import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ── Resolve @supabase/supabase-js from the pnpm store (not a root dep) ──────
const require = createRequire(import.meta.url);
function loadSupabase() {
  try { return require('@supabase/supabase-js'); } catch { /* fall through */ }
  const pnpmDir = path.resolve('node_modules/.pnpm');
  const match = fs.existsSync(pnpmDir)
    ? fs.readdirSync(pnpmDir).find((d) => d.startsWith('@supabase+supabase-js@'))
    : null;
  if (!match) throw new Error('@supabase/supabase-js not installed — run `pnpm install`');
  return require(path.join(pnpmDir, match, 'node_modules/@supabase/supabase-js'));
}
const { createClient } = loadSupabase();

// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const VERBOSE = process.argv.includes('--verbose');
const NO_TEARDOWN = process.argv.includes('--no-teardown');

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: ANON_KEY })) {
  if (!v) { console.error(`✗ Missing required env: ${k}`); process.exit(2); }
}

const FN_BASE = `${SUPABASE_URL}/functions/v1/make-server-37f42386/toll-reconciliation`;
const KV = 'kv_store_37f42386';

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sbRides = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false }, db: { schema: 'rides' } });

// ── Namespacing ─────────────────────────────────────────────────────────────
const runId = Date.now();
const ns = `e2e_${runId}`;
const driverId = `${ns}_driver`;
const vehicleId = `${ns}_veh`;
const D = '2026-06-15';
const PLAZA = { lat: 18.0, lng: -76.8 };

// Ids we create outside the ns prefix (need explicit cleanup)
const createdLedgerIds = new Set();
let rideId = null, crossingId = null, riderUserId = null, bridgeMarkerKey = null;
let originalSettings = null;

const log = (...a) => VERBOSE && console.log(...a);

// ── Endpoint helper (calls the deployed function with the anon key) ─────────
async function callApi(method, route, { body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${FN_BASE}${route}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

// ── KV helpers (service role) ───────────────────────────────────────────────
async function kvSet(key, value) {
  const { error } = await sb.from(KV).upsert({ key, value });
  if (error) throw new Error(`kvSet ${key}: ${error.message}`);
}
async function kvGet(key) {
  const { data, error } = await sb.from(KV).select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`kvGet ${key}: ${error.message}`);
  return data?.value ?? null;
}

// ── Seed builders ────────────────────────────────────────────────────────────
function trip(suffix, overrides) {
  const id = `${ns}_${suffix}`;
  return {
    id,
    platform: 'Uber',
    paymentMethod: 'Digital (card/Bank)',
    date: `${D}T12:00:00Z`,
    driverId,
    driverName: 'E2E Driver',
    amount: 20,
    status: 'Completed',
    pickupLocation: 'E2E Pickup',
    dropoffLocation: 'E2E Dropoff',
    vehicleId,
    ...overrides,
  };
}
function tollLedger(suffix, overrides) {
  const id = `${ns}_${suffix}`;
  const now = new Date().toISOString();
  return {
    id, createdAt: now, updatedAt: now,
    vehicleId, vehiclePlate: null, driverId, driverName: 'E2E Driver',
    tollTagId: null, tagNumber: null, plaza: 'E2E Plaza', highway: null, location: 'E2E Plaza',
    date: D, time: '10:00:00', type: 'usage', amount: -3.0, paymentMethod: 'fleet_account',
    status: 'pending', resolution: null, isReconciled: false, tripId: null,
    matchConfidence: null, matchedAt: null, matchedBy: null,
    batchId: null, batchName: null, importedAt: null, sourceFile: null,
    receiptUrl: null, referenceNumber: null, description: 'E2E toll', notes: null,
    auditTrail: [], metadata: {},
    ...overrides,
  };
}

async function seed() {
  // Active plaza with a rate + coords.
  await kvSet(`toll_plaza:${ns}_plaza`, {
    name: 'E2E Plaza',
    location: PLAZA,
    geofenceRadius: 500,
    rates: [{ vehicleClass: 'standard', amount: 3, currency: 'JMD' }],
    status: 'active',
  });

  // PERFECT_MATCH pair: wide active window avoids fleet-timezone ambiguity.
  await kvSet(`trip:${ns}_perfect`, trip('perfect', {
    tollCharges: 3.0,
    requestTime: `${D}T08:00:00Z`, startTime: `${D}T08:00:00Z`, dropoffTime: `${D}T20:00:00Z`,
    startLat: PLAZA.lat, startLng: PLAZA.lng, endLat: PLAZA.lat, endLng: PLAZA.lng,
  }));
  await kvSet(`toll_ledger:${ns}_perfect`, tollLedger('perfect', { amount: -3.0 }));

  // cash_wash: cash-settled + on-route plaza.
  await kvSet(`trip:${ns}_cashwash`, trip('cashwash', {
    platform: 'Cash', paymentMethod: 'Cash', tollCharges: 3.0,
    startLat: PLAZA.lat, startLng: PLAZA.lng, endLat: PLAZA.lat, endLng: PLAZA.lng,
  }));
  // phantom: platform-settled + far from any plaza (~111 km).
  await kvSet(`trip:${ns}_phantom`, trip('phantom', {
    tollCharges: 2.0,
    startLat: PLAZA.lat + 1.0, startLng: PLAZA.lng, endLat: PLAZA.lat + 1.0, endLng: PLAZA.lng,
  }));
  // expense_logged + pending targets.
  await kvSet(`trip:${ns}_expense`, trip('expense', { tollCharges: 4.0 }));
  await kvSet(`trip:${ns}_pending`, trip('pending', { tollCharges: 1.5 }));

  // Bridge: ephemeral auth user → ride_request → ride_toll_crossing.
  const { data: userData, error: userErr } = await sb.auth.admin.createUser({
    email: `${ns}@e2e.roam.test`, password: randomUUID(), email_confirm: true,
  });
  if (userErr) throw new Error(`createUser: ${userErr.message}`);
  riderUserId = userData.user.id;
  rideId = randomUUID();
  crossingId = randomUUID();
  bridgeMarkerKey = `toll_bridge:crossing:${crossingId}`;

  const { error: rideErr } = await sbRides.from('ride_requests').insert({
    id: rideId, rider_user_id: riderUserId,
    pickup_lat: PLAZA.lat, pickup_lng: PLAZA.lng, dropoff_lat: PLAZA.lat + 0.05, dropoff_lng: PLAZA.lng,
    fare_estimate_minor: 150000,
  });
  if (rideErr) throw new Error(`insert ride_request: ${rideErr.message}`);

  const { error: crossErr } = await sbRides.from('ride_toll_crossings').insert({
    id: crossingId, ride_request_id: rideId,
    toll_plaza_id: `${ns}_plaza`, toll_plaza_name: 'E2E Plaza',
    toll_amount_minor: 300, currency: 'JMD', crossed_at: new Date().toISOString(),
    driver_lat: PLAZA.lat, driver_lng: PLAZA.lng,
  });
  if (crossErr) throw new Error(`insert ride_toll_crossings: ${crossErr.message}`);

  originalSettings = await kvGet('toll_reconciliation:settings');
  log(`Seeded ns=${ns} rider=${riderUserId} ride=${rideId} crossing=${crossingId}`);
}

// ── Step runner ──────────────────────────────────────────────────────────────
const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

async function run() {
  console.log(`\n▶ Toll reconciliation E2E smoke (ns=${ns})\n`);

  await step('1. auto-match perfect toll', async () => {
    const res = await callApi('GET', '/unreconciled', { query: { driverId, limit: '1000' } });
    assert.ok((res.autoReconciled ?? 0) >= 1, `expected autoReconciled>=1, got ${res.autoReconciled}`);
    const ledger = await kvGet(`toll_ledger:${ns}_perfect`);
    assert.equal(ledger.status, 'reconciled', 'perfect toll should be reconciled');
    assert.equal(ledger.tripId, `${ns}_perfect`, 'perfect toll should link its trip');
  });

  await step('2. refund suggestions (cash_wash + phantom)', async () => {
    const res = await callApi('GET', '/refund-suggestions', { query: { driverId } });
    const s = res.suggestions || {};
    assert.equal(s[`${ns}_cashwash`]?.status, 'cash_wash', 'cashwash → cash_wash');
    assert.ok(s[`${ns}_cashwash`]?.confidence >= 85, 'cash_wash confidence >= 85');
    assert.equal(s[`${ns}_phantom`]?.status, 'phantom', 'phantom → phantom');
  });

  await step('3. resolve each of the 4 types', async () => {
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash`, resolution: 'cash_wash' } });
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_phantom`, resolution: 'phantom' } });
    const exp = await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_expense`, resolution: 'expense_logged', driverId } });
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_pending`, resolution: 'pending' } });

    for (const [suffix, status] of [['cashwash', 'cash_wash'], ['phantom', 'phantom'], ['expense', 'expense_logged'], ['pending', 'pending']]) {
      const t = await kvGet(`trip:${ns}_${suffix}`);
      assert.equal(t.tollRefundResolution?.status, status, `${suffix} resolution`);
    }
    const ledgerId = exp?.data?.linkedTollLedgerId;
    assert.ok(ledgerId, 'expense_logged returns linkedTollLedgerId');
    createdLedgerIds.add(ledgerId);
    const ledger = await kvGet(`toll_ledger:${ledgerId}`);
    assert.equal(ledger.paymentMethod, 'cash', 'expense ledger is cash');
    assert.equal(ledger.tripId, `${ns}_expense`, 'expense ledger linked to trip');

    const resolved = await callApi('GET', '/resolved-refunds', { query: { driverId, limit: '100' } });
    const ids = new Set((resolved.data || []).map((t) => t.id));
    for (const s of ['cashwash', 'phantom', 'expense']) assert.ok(ids.has(`${ns}_${s}`), `${s} in resolved`);

    const unclaimed = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    const uids = new Set((unclaimed.data || []).map((t) => t.id));
    assert.ok(!uids.has(`${ns}_cashwash`), 'cashwash left unclaimed list');
  });

  await step('4. undo/revert a resolution', async () => {
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_phantom`, resolution: 'pending' } });
    const unclaimed = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    const uids = new Set((unclaimed.data || []).map((t) => t.id));
    assert.ok(uids.has(`${ns}_phantom`), 'phantom returns to unclaimed after undo');
  });

  await step('5. rides→ledger bridge (dry-run, apply, idempotent)', async () => {
    const dry = await callApi('POST', '/bridge-rides', { body: { dryRun: true, limit: 5000 } });
    assert.ok((dry.bridged ?? 0) >= 1, 'dry-run bridges >= 1');

    // Safety on prod: dry.bridged counts ALL unbridged crossings. If more than
    // our single e2e crossing is unbridged, applying would bridge REAL ride
    // data we can't clean up — skip the destructive apply and warn instead.
    if ((dry.bridged ?? 0) > 1) {
      console.log(`  ⚠ ${dry.bridged} unbridged crossings present (real data) — skipping destructive apply; dry-run verified only`);
      return;
    }

    const applied = await callApi('POST', '/bridge-rides', { body: { dryRun: false, limit: 5000 } });
    assert.ok((applied.bridged ?? 0) >= 1, 'apply bridges >= 1');

    const marker = await kvGet(bridgeMarkerKey);
    assert.ok(marker?.ledgerId, 'bridge dedup marker written');
    createdLedgerIds.add(marker.ledgerId);
    const ledger = await kvGet(`toll_ledger:${marker.ledgerId}`);
    assert.equal(ledger.metadata?.source, 'roam_geofence', 'bridged ledger tagged roam_geofence');
    assert.equal(ledger.referenceNumber, crossingId, 'bridged ledger references crossing id');

    const rerun = await callApi('POST', '/bridge-rides', { body: { dryRun: false, limit: 5000 } });
    assert.equal(rerun.bridged ?? 0, 0, 're-run bridges nothing (idempotent)');
    assert.ok((rerun.skipped ?? 0) >= 1, 're-run skips already-bridged');
  });

  await step('6. automation flag off→on→off revert', async () => {
    // Fresh cash-settled refund that should auto-resolve when the flag is on.
    await kvSet(`trip:${ns}_auto1`, trip('auto1', {
      platform: 'Cash', paymentMethod: 'Cash', tollCharges: 3.0,
      startLat: PLAZA.lat, startLng: PLAZA.lng, endLat: PLAZA.lat, endLng: PLAZA.lng,
    }));
    await callApi('PUT', '/automation-settings', { body: { refundAutomationEnabled: true } });
    const on = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    assert.ok((on.autoResolved ?? 0) >= 1, 'flag ON auto-resolves the safe cash-wash refund');
    const t1 = await kvGet(`trip:${ns}_auto1`);
    assert.equal(t1.tollRefundResolution?.status, 'cash_wash', 'auto1 auto-resolved as cash_wash');
    assert.equal(t1.tollRefundResolution?.auto, true, 'auto1 marked auto');

    // Flag off → a new qualifying refund must NOT be auto-resolved.
    await callApi('PUT', '/automation-settings', { body: { refundAutomationEnabled: false } });
    await kvSet(`trip:${ns}_auto2`, trip('auto2', {
      platform: 'Cash', paymentMethod: 'Cash', tollCharges: 3.0,
      startLat: PLAZA.lat, startLng: PLAZA.lng, endLat: PLAZA.lat, endLng: PLAZA.lng,
    }));
    const off = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    assert.equal(off.autoResolved ?? 0, 0, 'flag OFF performs no auto-resolution (revert)');
    const uids = new Set((off.data || []).map((t) => t.id));
    assert.ok(uids.has(`${ns}_auto2`), 'auto2 remains unresolved with flag off');
  });
}

// ── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
  if (NO_TEARDOWN) { console.log(`\n⚠ --no-teardown: leaving seeded data (ns=${ns})`); return; }
  console.log('\n▶ Teardown');
  const del = async (label, fn) => { try { await fn(); log(`  cleaned ${label}`); } catch (e) { console.log(`  ! teardown ${label}: ${e.message}`); } };

  await del('kv trips', () => sb.from(KV).delete().like('key', `trip:${ns}_%`));
  await del('kv tolls', () => sb.from(KV).delete().like('key', `toll_ledger:${ns}_%`));
  await del('kv plazas', () => sb.from(KV).delete().like('key', `toll_plaza:${ns}_%`));
  if (bridgeMarkerKey) await del('bridge marker', () => sb.from(KV).delete().eq('key', bridgeMarkerKey));
  for (const id of createdLedgerIds) await del(`ledger ${id}`, () => sb.from(KV).delete().eq('key', `toll_ledger:${id}`));
  if (rideId) await del('ride_request (cascades crossing)', () => sbRides.from('ride_requests').delete().eq('id', rideId));
  if (riderUserId) await del('auth user', () => sb.auth.admin.deleteUser(riderUserId));
  // Restore automation settings to their pre-run value.
  await del('restore settings', async () => {
    if (originalSettings === null) await sb.from(KV).delete().eq('key', 'toll_reconciliation:settings');
    else await sb.from(KV).upsert({ key: 'toll_reconciliation:settings', value: originalSettings });
  });

  // Verify nothing e2e remains in KV.
  const { data: leftover } = await sb.from(KV).select('key').like('key', `%${ns}_%`);
  if (leftover?.length) console.log(`  ! ${leftover.length} e2e KV key(s) still present:`, leftover.map((r) => r.key));
  else console.log('  ✓ no e2e KV rows remain');
}

// ── Main ─────────────────────────────────────────────────────────────────────
let seedOk = false;
try {
  await seed();
  seedOk = true;
  await run();
} catch (e) {
  console.error(`\n✗ Fatal: ${e.message}`);
  results.push({ name: 'fatal', ok: false, err: e.message });
} finally {
  if (seedOk) await teardown();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n──────── Result: ${results.length - failed.length}/${results.length} passed ────────`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.err ? ` — ${r.err}` : ''}`);
process.exit(failed.length ? 1 : 0);
