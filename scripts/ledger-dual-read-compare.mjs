/**
 * Dual-read comparison (Phase 4 / Block E).
 * Live: POST /trips/stats vs POST /ledger/stats (entryType=trip) for the same date window.
 *
 * Usage (live compare):
 *   LEDGER_COMPARE_ORG=<orgId> SUPABASE_URL=... \
 *   LEDGER_COMPARE_JWT=<user access token> \
 *   node scripts/ledger-dual-read-compare.mjs
 *
 * Or ANON key as bearer token:
 *   LEDGER_COMPARE_ORG=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   node scripts/ledger-dual-read-compare.mjs
 *
 * Optional:
 *   LEDGER_COMPARE_START=yyyy-MM-dd LEDGER_COMPARE_END=yyyy-MM-dd
 *   LEDGER_COMPARE_MAX_DELTA=5   — absolute count delta that counts as "large" (default 5)
 *   LEDGER_COMPARE_MAX_PCT=1    — percent delta that counts as "large" (default 1)
 *
 * Exit codes:
 *   0 — dry instructions, counts match, or small mismatch within thresholds
 *   1 — HTTP/auth failure, unparseable totals, or large mismatch
 *
 * Requires LEDGER_READ_MODEL=1 (or feature flag) on the edge function for /ledger/*.
 * Does not flip production defaults — keep flag/env off until promote checklist passes.
 */
const orgId = process.env.LEDGER_COMPARE_ORG;
const base = process.env.SUPABASE_URL;
const anonOrService =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const jwt = process.env.LEDGER_COMPARE_JWT || "";
/** Bearer: explicit JWT, else ANON/service key used as token. */
const bearer = jwt || anonOrService;
/** apikey header: prefer anon/service; fall back to JWT when only JWT is set. */
const apiKey = anonOrService || jwt;
const startDate = process.env.LEDGER_COMPARE_START || "";
const endDate = process.env.LEDGER_COMPARE_END || "";
const maxDelta = Number(process.env.LEDGER_COMPARE_MAX_DELTA ?? 5);
const maxPct = Number(process.env.LEDGER_COMPARE_MAX_PCT ?? 1);

function fnUrl(path) {
  return `${String(base).replace(/\/$/, "")}/functions/v1/make-server-37f42386${path}`;
}

async function postJson(path, body) {
  const res = await fetch(fnUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function printDryInstructions() {
  console.log(`
ledger-dual-read-compare (dry instructions)
-----------------------------------------
1. Apply migrations through 20260911200000_fleet_ledger_entries_period_key.sql
2. Enable feature flag ledger_read_model OR set LEDGER_READ_MODEL=1 on the edge function
   (do NOT flip the production default — keep behind flag until promote checklist passes)
3. Live compare (same org + date window):
   POST /make-server-37f42386/trips/stats
   POST /make-server-37f42386/ledger/stats  with entryType=trip
4. Assert trips.totalTrips ≈ ledger.count for entryType=trip
5. Smoke: /ledger/search, /ledger/stats, /ledger/export remain registered on the fleet server

Live env:
  LEDGER_COMPARE_ORG + SUPABASE_URL + LEDGER_COMPARE_JWT
  — or — LEDGER_COMPARE_ORG + SUPABASE_URL + SUPABASE_ANON_KEY (ANON as token)
Optional: LEDGER_COMPARE_START / LEDGER_COMPARE_END (yyyy-MM-dd)
Optional: LEDGER_COMPARE_MAX_DELTA (default 5), LEDGER_COMPARE_MAX_PCT (default 1)
See docs/LEDGERS_READ_MODEL_PROMOTE.md for the promote path.
`);
}

function tripCountFrom(json) {
  const n = Number(
    json?.totalTrips ?? json?.total ?? json?.stats?.count ?? json?.count ?? NaN,
  );
  return n;
}

function ledgerCountFrom(json) {
  const n = Number(json?.count ?? json?.total ?? json?.stats?.count ?? NaN);
  return n;
}

function isLargeMismatch(a, b) {
  const delta = Math.abs(a - b);
  if (delta === 0) return false;
  const pct = (delta / Math.max(a, b, 1)) * 100;
  // Large when absolute OR percent threshold is exceeded.
  return delta > maxDelta || pct > maxPct;
}

async function main() {
  const canLive = Boolean(orgId && base && bearer && apiKey);
  if (!canLive) {
    if (process.env.FORCE_LEDGER_DUAL_READ_DRY === "1") {
      printDryInstructions();
      process.exit(0);
    }
    console.error(`
ledger-dual-read-compare: FAIL — live env required in CI.
Need LEDGER_COMPARE_ORG + SUPABASE_URL + (LEDGER_COMPARE_JWT or SUPABASE_ANON_KEY).
Set FORCE_LEDGER_DUAL_READ_DRY=1 only for local instruction-only runs.
`);
    printDryInstructions();
    process.exit(1);
  }

  console.log(
    `[dual-read] org=${orgId} base=${base} auth=${jwt ? "jwt" : "anon+token"} window=${startDate || "…"}→${endDate || "…"}`,
  );

  const window = {
    organizationId: orgId,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const trips = await postJson("/trips/stats", { ...window });
  const ledger = await postJson("/ledger/stats", { ...window, entryType: "trip" });

  if (!trips.ok || !ledger.ok) {
    console.error("[dual-read] probe HTTP failure", {
      trips: { status: trips.status, body: trips.json },
      ledger: { status: ledger.status, body: ledger.json },
    });
    process.exit(1);
  }

  const tripTotal = tripCountFrom(trips.json);
  const ledgerTotal = ledgerCountFrom(ledger.json);

  console.log(`[dual-read] trips.totalTrips=${tripTotal} ledger.trip_count=${ledgerTotal}`);
  if (!Number.isFinite(tripTotal) || !Number.isFinite(ledgerTotal)) {
    console.error("[dual-read] Could not parse totals from responses; inspect payloads above.");
    console.error({ trips: trips.json, ledger: ledger.json });
    process.exit(1);
  }

  const delta = Math.abs(tripTotal - ledgerTotal);
  if (delta === 0) {
    console.log("[dual-read] OK — counts match");
    process.exit(0);
  }

  const denom = Math.max(tripTotal, ledgerTotal, 1);
  const pct = (delta / denom) * 100;
  console.warn(
    `[dual-read] delta=${delta} (${pct.toFixed(2)}%); thresholds abs≤${maxDelta} pct≤${maxPct}`,
  );

  if (isLargeMismatch(tripTotal, ledgerTotal)) {
    console.error(
      `[dual-read] LARGE MISMATCH: trips ${tripTotal} vs ledger ${ledgerTotal} (Δ=${delta})`,
    );
    process.exit(1);
  }

  console.warn("[dual-read] small mismatch within thresholds — treating as OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
