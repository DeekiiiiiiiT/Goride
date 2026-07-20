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
 * automation flag off→on→off revert → dispute-refund→claim/trip cascade
 * (flag off baseline, flag on match, already-resolved "Charge Driver"
 * reimbursement reversal, unmatch round trip) → toll P&L offset (cash_wash/
 * phantom/expense_logged/Personal emit compensating events, reinstate on
 * revert-to-pending) → dispute match/unmatch driver-charge symmetry with the
 * trip-sync flag OFF → teardown.
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
import { randomUUID, createHash } from 'node:crypto';
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
const DISPUTE_BASE = `${SUPABASE_URL}/functions/v1/make-server-37f42386/dispute-refunds`;
const CLAIMS_BASE = `${SUPABASE_URL}/functions/v1/make-server-37f42386/claims`;
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
async function callApi(method, route, { body, query, base = FN_BASE } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${base}${route}${qs}`, {
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

// Mirrors ledger_canonical.ts's sha256Hex — used to look up a canonical
// ledger_event by its idempotencyKey without needing the authenticated
// GET /ledger/canonical-events endpoint.
function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
async function getCanonicalEventByIdemKey(idemKey) {
  const pointer = await kvGet(`ledger_event_idem:${sha256Hex(idemKey)}`);
  if (!pointer?.id) return null;
  return kvGet(`ledger_event:${pointer.id}`);
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

  // ── Dispute-refund → claim/trip cascade fixtures ──────────────────────────
  // Case A: an open (never-resolved) claim linked to a trip, matched via a
  // bare toll (no createClaim) — the common "Review a dispute" path.
  await kvSet(`toll_ledger:${ns}_disputetoll`, tollLedger('disputetoll', { amount: -10, tripId: null }));
  await kvSet(`trip:${ns}_disputetrip`, trip('disputetrip', { tollCharges: 10 }));
  await kvSet(`claim:${ns}_disputeclaim`, {
    id: `${ns}_disputeclaim`, type: 'Toll_Refund', status: 'Sent_to_Driver',
    driverId, driverName: 'E2E Driver', transactionId: `${ns}_disputetoll`, tripId: `${ns}_disputetrip`,
    amount: 10, expectedAmount: 10, subject: 'E2E dispute claim',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await kvSet(`dispute-refund:${ns}_disputerefund`, {
    id: `${ns}_disputerefund`, supportCaseId: `${ns}-case-1`, amount: 10, date: D,
    driverId, driverName: 'E2E Driver', platform: 'Uber', source: 'csv',
    status: 'unmatched', matchedTollId: null, matchedClaimId: null,
    importedAt: new Date().toISOString(), resolvedAt: null, resolvedBy: null,
  });

  // Case B: a claim ALREADY resolved "Charge Driver" (driver previously
  // charged) with an active driver-charge projection — matching a dispute
  // refund to it must reverse that charge, not silently skip it.
  await kvSet(`toll_ledger:${ns}_disputetoll2`, tollLedger('disputetoll2', { amount: -12, tripId: null }));
  await kvSet(`trip:${ns}_disputetrip2`, trip('disputetrip2', { tollCharges: 12 }));
  const chargeTxId = `${ns}_chargetx`;
  await kvSet(`transaction:${chargeTxId}`, {
    id: chargeTxId, driverId, date: `${D}T00:00:00Z`, description: 'E2E prior charge',
    category: 'Toll Charge', type: 'Adjustment', amount: -12, status: 'Completed',
    paymentMethod: 'Cash', metadata: { tollId: `${ns}_disputetoll2`, source: 'claim_resolution', version: 1 },
  });
  await kvSet(`toll_charge_projection:${ns}_disputetoll2`, { active: true, txId: chargeTxId, version: 1 });
  await kvSet(`claim:${ns}_disputeclaim2`, {
    id: `${ns}_disputeclaim2`, type: 'Toll_Refund', status: 'Resolved', resolutionReason: 'Charge Driver',
    driverId, driverName: 'E2E Driver', transactionId: `${ns}_disputetoll2`, tripId: `${ns}_disputetrip2`,
    amount: 12, expectedAmount: 12, subject: 'E2E prior-charge claim', resolutionTransactionId: chargeTxId,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await kvSet(`dispute-refund:${ns}_disputerefund2`, {
    id: `${ns}_disputerefund2`, supportCaseId: `${ns}-case-2`, amount: 12, date: D,
    driverId, driverName: 'E2E Driver', platform: 'Uber', source: 'csv',
    status: 'unmatched', matchedTollId: null, matchedClaimId: null,
    importedAt: new Date().toISOString(), resolvedAt: null, resolvedBy: null,
  });

  originalSettings = await kvGet('toll_reconciliation:settings');
  log(`Seeded ns=${ns} rider=${riderUserId} ride=${rideId} crossing=${crossingId}`);
}

async function assertGeofenceCrossingRow() {
  const { data, error } = await sbRides
    .from('ride_toll_crossings')
    .select('id, ride_request_id, toll_plaza_id')
    .eq('ride_request_id', rideId)
    .maybeSingle();
  assert.ok(!error, error?.message);
  assert.ok(data?.id, 'ride_toll_crossings row must exist for seeded test ride');
  assert.equal(data.toll_plaza_id, `${ns}_plaza`, 'crossing links to seeded plaza');
}

// ── Step runner ──────────────────────────────────────────────────────────────
const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

async function run() {
  console.log(`\n▶ Toll reconciliation E2E smoke (ns=${ns})\n`);

  await step('0. geofence crossing row exists for test ride', assertGeofenceCrossingRow);

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

  await step('7. dispute-refund match: flag OFF baseline (no cascade)', async () => {
    const res = await callApi('PATCH', `/${ns}_disputerefund/match`, {
      base: DISPUTE_BASE,
      body: { tollTransactionId: `${ns}_disputetoll`, claimId: `${ns}_disputeclaim` },
    });
    assert.equal(res.data?.status, 'auto_resolved', 'refund marked auto_resolved (claim path taken)');

    const claim = await kvGet(`claim:${ns}_disputeclaim`);
    assert.equal(claim.status, 'Resolved', 'claim resolved (unconditional today)');
    assert.equal(claim.resolutionReason, 'Reimbursed', 'claim resolutionReason set (unconditional today)');

    const toll = await kvGet(`toll_ledger:${ns}_disputetoll`);
    assert.equal(toll.resolution ?? null, null, 'flag OFF: toll_ledger.resolution untouched');

    const trip = await kvGet(`trip:${ns}_disputetrip`);
    assert.equal(trip.tollRefundResolution ?? null, null, 'flag OFF: trip cascade did not fire');

    await callApi('PATCH', `/${ns}_disputerefund/unmatch`, { base: DISPUTE_BASE });
    const refundAfter = await kvGet(`dispute-refund:${ns}_disputerefund`);
    assert.equal(refundAfter.status, 'unmatched', 'refund reset to unmatched');
    const claimAfter = await kvGet(`claim:${ns}_disputeclaim`);
    assert.equal(claimAfter.status, 'Sent_to_Driver', 'claim restored to pre-match status');
  });

  await step('8. dispute-refund match: flag ON cascades to claim + trip + toll_ledger', async () => {
    await callApi('PUT', '/automation-settings', { body: { disputeRefundTripSyncEnabled: true } });

    await callApi('PATCH', `/${ns}_disputerefund/match`, {
      base: DISPUTE_BASE,
      body: { tollTransactionId: `${ns}_disputetoll`, claimId: `${ns}_disputeclaim` },
    });

    const claim = await kvGet(`claim:${ns}_disputeclaim`);
    assert.equal(claim.resolutionReason, 'Reimbursed', 'claim reimbursed');
    assert.equal(claim.preDisputeStatus, 'Sent_to_Driver', 'preDisputeStatus stashed');

    const toll = await kvGet(`toll_ledger:${ns}_disputetoll`);
    assert.equal(toll.resolution, 'refunded', 'toll_ledger.resolution synced to refunded');

    const trip = await kvGet(`trip:${ns}_disputetrip`);
    assert.equal(trip.tollRefundResolution?.status, 'expense_logged', 'trip cascaded to expense_logged');
    assert.equal(
      trip.tollRefundResolution?.source, `system:dispute_refund_sync:${ns}_disputerefund`,
      'trip resolution stamped with cascade ownership marker',
    );
    assert.equal(trip.tollRefundResolution?.linkedTollLedgerId, `${ns}_disputetoll`, 'reuses the matched toll, no duplicate ledger row');

    const unclaimed = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    const uids = new Set((unclaimed.data || []).map((t) => t.id));
    assert.ok(!uids.has(`${ns}_disputetrip`), 'trip no longer in Unlinked Refunds');
  });

  await step('9. dispute-refund matched to an already-Resolved "Charge Driver" claim reverses the charge', async () => {
    await callApi('PUT', '/automation-settings', { body: { driverTollChargeSyncEnabled: true } });

    const markerBefore = await kvGet(`toll_charge_projection:${ns}_disputetoll2`);
    assert.equal(markerBefore.active, true, 'sanity: prior charge marker starts active');

    await callApi('PATCH', `/${ns}_disputerefund2/match`, {
      base: DISPUTE_BASE,
      body: { tollTransactionId: `${ns}_disputetoll2`, claimId: `${ns}_disputeclaim2` },
    });

    const claim2 = await kvGet(`claim:${ns}_disputeclaim2`);
    assert.equal(claim2.resolutionReason, 'Reimbursed', 'previously-resolved "Charge Driver" claim now reimbursed (was silently skipped before this fix)');
    assert.equal(claim2.preDisputeResolutionReason, 'Charge Driver', 'prior reason stashed for exact unmatch restore');

    const markerAfter = await kvGet(`toll_charge_projection:${ns}_disputetoll2`);
    assert.equal(markerAfter.active, false, 'prior driver charge reversed');
  });

  await step('10. unmatch reverses the flag-ON round trip (claim, charge, trip)', async () => {
    await callApi('PATCH', `/${ns}_disputerefund/unmatch`, { base: DISPUTE_BASE });
    const claim = await kvGet(`claim:${ns}_disputeclaim`);
    assert.equal(claim.status, 'Sent_to_Driver', 'claim status restored');
    assert.equal(claim.resolutionReason ?? null, null, 'claim resolutionReason cleared');
    const toll = await kvGet(`toll_ledger:${ns}_disputetoll`);
    assert.equal(toll.resolution ?? null, null, 'toll_ledger.resolution cleared');
    const trip = await kvGet(`trip:${ns}_disputetrip`);
    assert.equal(trip.tollRefundResolution?.status ?? 'pending', 'pending', 'trip reverted to pending');
    const unclaimed = await callApi('GET', '/unclaimed-refunds', { query: { driverId, limit: '100' } });
    const uids = new Set((unclaimed.data || []).map((t) => t.id));
    assert.ok(uids.has(`${ns}_disputetrip`), 'trip reappears in Unlinked Refunds');

    await callApi('PATCH', `/${ns}_disputerefund2/unmatch`, { base: DISPUTE_BASE });
    const claim2 = await kvGet(`claim:${ns}_disputeclaim2`);
    assert.equal(claim2.status, 'Resolved', 'claim2 restored to Resolved');
    assert.equal(claim2.resolutionReason, 'Charge Driver', 'claim2 restored to exact prior reason');
    const marker2 = await kvGet(`toll_charge_projection:${ns}_disputetoll2`);
    assert.equal(marker2.active, true, 're-charged on flip back to Charge Driver');

    // Revert flags back off for a clean slate (also restored wholesale in teardown).
    await callApi('PUT', '/automation-settings', { body: { disputeRefundTripSyncEnabled: false, driverTollChargeSyncEnabled: false } });
  });

  await step('11. toll P&L offset — cash_wash/phantom/expense_logged/Personal emit compensating events (flag ON)', async () => {
    await callApi('PUT', '/automation-settings', { body: { tollPnlOffsetEnabled: true } });

    // Trip-level toll_charge canonical events only exist for Uber trips
    // (canonical_from_ops.ts gates them on isUber) — cash_wash/phantom offsets
    // need an Uber trip to have anything to offset. Uses a fresh trip so this
    // doesn't collide with the Cash-platform `${ns}_cashwash` fixture below.
    await kvSet(`trip:${ns}_cashwash_uber`, trip('cashwash_uber', { tollCharges: 3.0 }));
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash_uber`, resolution: 'cash_wash' } });
    const cashwashOffset = await getCanonicalEventByIdemKey(`trip:${ns}_cashwash_uber|toll_charge_offset:v1`);
    assert.ok(cashwashOffset, 'cash_wash offset event written for an Uber trip (has a real toll_charge to offset)');
    assert.equal(cashwashOffset.direction, 'inflow', 'cash_wash offset is inflow (neutralizes the charge)');
    assert.equal(cashwashOffset.metadata?.reason, 'cash_wash', 'offset reason recorded');

    // Idempotent re-post: resolving cash_wash again must not create a v2.
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash_uber`, resolution: 'cash_wash' } });
    const cashwashOffsetV2 = await getCanonicalEventByIdemKey(`trip:${ns}_cashwash_uber|toll_charge_offset:v2`);
    assert.equal(cashwashOffsetV2, null, 'repeat cash_wash resolution does not create a second offset version');

    // Regression guard: `${ns}_cashwash` is Cash-platform (seeded in step 2) —
    // it has NO trip-level toll_charge event to offset. Resolving it as
    // cash_wash must NOT write an orphan offset (this is the exact bug found
    // in production: an offset with nothing on the "gross" side to net
    // against inflates "recovered" and can push a period's Tolls negative).
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash`, resolution: 'cash_wash' } });
    const noOriginalChargeOffset = await getCanonicalEventByIdemKey(`trip:${ns}_cashwash|toll_charge_offset:v1`);
    assert.equal(noOriginalChargeOffset, null, 'no offset written for a trip with no original toll_charge event (non-Uber)');

    // phantom: trip is currently 'pending' (reverted in step 4) — resolve again.
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_phantom`, resolution: 'phantom' } });
    const phantomOffset = await getCanonicalEventByIdemKey(`trip:${ns}_phantom|toll_charge_offset:v1`);
    assert.ok(phantomOffset, 'phantom offset event written');
    assert.equal(phantomOffset.metadata?.reason, 'phantom', 'phantom offset reason recorded');

    // expense_logged: fresh trip so we don't duplicate the step-3 ledger row.
    await kvSet(`trip:${ns}_expense2`, trip('expense2', { tollCharges: 5.0 }));
    const exp2 = await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_expense2`, resolution: 'expense_logged', driverId } });
    if (exp2?.data?.linkedTollLedgerId) createdLedgerIds.add(exp2.data.linkedTollLedgerId);
    const expense2Offset = await getCanonicalEventByIdemKey(`trip:${ns}_expense2|toll_charge_offset:v1`);
    assert.ok(expense2Offset, 'expense_logged offsets the original trip-level toll_charge (no double count)');
    assert.equal(expense2Offset.metadata?.reason, 'superseded_by_expense_logged', 'expense_logged offset reason recorded');

    // Personal (toll_ledger /resolve endpoint) — a separate code path from applyRefundResolution.
    // This fixture is seeded via a raw kvSet (bypassing saveTollLedgerEntry's
    // dual-write), so it needs its own canonical toll_charge event written by
    // hand — otherwise the same no-original-charge guard would (correctly)
    // skip it too, same as the regression case above.
    await kvSet(`toll_ledger:${ns}_personaltoll`, tollLedger('personaltoll', { amount: -7.5, paymentMethod: 'fleet_account' }));
    const personalChargeEventId = randomUUID();
    const personalChargeIdemKey = `toll_ledger:${ns}_personaltoll|toll_charge`;
    await kvSet(`ledger_event:${personalChargeEventId}`, {
      id: personalChargeEventId, idempotencyKey: personalChargeIdemKey,
      date: D, driverId, eventType: 'toll_charge', direction: 'outflow',
      netAmount: 7.5, grossAmount: 7.5, currency: 'JMD',
      sourceType: 'transaction', sourceId: `${ns}_personaltoll`, platform: 'Roam',
      description: 'Toll charge', createdAt: new Date().toISOString(),
    });
    await kvSet(`ledger_event_idem:${sha256Hex(personalChargeIdemKey)}`, { id: personalChargeEventId, idempotencyKey: personalChargeIdemKey });

    await callApi('POST', '/resolve', { body: { transactionId: `${ns}_personaltoll`, resolution: 'Personal' } });
    const personalOffset = await getCanonicalEventByIdemKey(`toll_ledger:${ns}_personaltoll|toll_charge_offset:v1`);
    assert.ok(personalOffset, 'Personal resolution offsets the toll (recovered via driver payout deduction)');
    assert.equal(personalOffset.metadata?.reason, 'personal', 'personal offset reason recorded');
  });

  await step('12. toll P&L offset — reverting a resolution reinstates the charge', async () => {
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash_uber`, resolution: 'pending' } });
    const reinstate = await getCanonicalEventByIdemKey(`trip:${ns}_cashwash_uber|toll_charge_reinstate:v1`);
    assert.ok(reinstate, 'reinstate event written on revert to pending');
    assert.equal(reinstate.direction, 'outflow', 'reinstate is outflow (brings the charge back)');

    // Re-resolving as cash_wash again after a reinstate must bump to v2, not reuse v1.
    await callApi('POST', '/resolve-refund', { body: { tripId: `${ns}_cashwash_uber`, resolution: 'cash_wash' } });
    const reoffset = await getCanonicalEventByIdemKey(`trip:${ns}_cashwash_uber|toll_charge_offset:v2`);
    assert.ok(reoffset, 'cycling offset -> reinstate -> offset again bumps the version');

    // Revert flag back off for a clean slate (also restored wholesale in teardown).
    await callApi('PUT', '/automation-settings', { body: { tollPnlOffsetEnabled: false } });
  });

  await step('13. orphan repair — finds and undoes an offset with no original charge', async () => {
    // Simulates the exact bad state found in production: an offset + active
    // marker written (e.g. by a pre-fix backfill run) for a source with no
    // matching toll_charge event. The guard in step 11 now prevents this from
    // happening going forward — this seeds it by hand to test the cleanup path.
    await kvSet(`trip:${ns}_orphan`, trip('orphan', { platform: 'Cash', paymentMethod: 'Cash', tollCharges: 4.25 }));
    const orphanOffsetIdemKey = `trip:${ns}_orphan|toll_charge_offset:v1`;
    const orphanEventId = randomUUID();
    await kvSet(`ledger_event:${orphanEventId}`, {
      id: orphanEventId, idempotencyKey: orphanOffsetIdemKey,
      date: D, driverId, eventType: 'toll_charge_offset', direction: 'inflow',
      netAmount: 4.25, grossAmount: 4.25, currency: 'JMD',
      sourceType: 'trip', sourceId: `${ns}_orphan`, platform: 'Roam',
      description: 'Toll not a fleet loss (cash_wash)',
      metadata: { reason: 'cash_wash', offsetsIdempotencyKey: `trip:${ns}_orphan|toll_charge`, version: 1 },
      createdAt: new Date().toISOString(),
    });
    await kvSet(`ledger_event_idem:${sha256Hex(orphanOffsetIdemKey)}`, { id: orphanEventId, idempotencyKey: orphanOffsetIdemKey });
    await kvSet(`toll_pnl_offset_marker:trip:${ns}_orphan`, {
      active: true, version: 1, reason: 'cash_wash', offsetIdempotencyKey: orphanOffsetIdemKey, at: new Date().toISOString(),
    });

    const status = await callApi('GET', '/toll-pnl-offset-backfill/orphans-status');
    const found = (status.sample || []).find((o) => o.sourceId === `${ns}_orphan`);
    assert.ok(found, 'orphans-status detects the seeded orphan');

    const applied = await callApi('POST', '/toll-pnl-offset-backfill/repair-orphans', { body: { dryRun: false } });
    assert.ok((applied.reinstated ?? 0) >= 1, 'repair-orphans reinstates at least the seeded orphan');

    const marker = await kvGet(`toll_pnl_offset_marker:trip:${ns}_orphan`);
    assert.equal(marker.active, false, 'orphan marker deactivated after repair');

    const statusAfter = await callApi('GET', '/toll-pnl-offset-backfill/orphans-status');
    const stillFound = (statusAfter.sample || []).find((o) => o.sourceId === `${ns}_orphan`);
    assert.ok(!stillFound, 'repaired orphan no longer appears in orphans-status');
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
  await del('kv claims', () => sb.from(KV).delete().like('key', `claim:${ns}_%`));
  await del('kv dispute-refunds', () => sb.from(KV).delete().like('key', `dispute-refund:${ns}_%`));
  await del('kv charge projections', () => sb.from(KV).delete().like('key', `toll_charge_projection:${ns}_%`));
  await del('kv legacy transactions', () => sb.from(KV).delete().like('key', `transaction:${ns}_%`));
  await del('kv toll P&L offset markers', () => sb.from(KV).delete().like('key', `toll_pnl_offset_marker:%${ns}_%`));
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
