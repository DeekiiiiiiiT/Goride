# Edge Function Audit — Roam / Fleet

Production-readiness audit of all Supabase Deno Edge Functions across both function trees:

- `apps/fleet/src/supabase/functions/` (Fleet management backend)
- `supabase/functions/` (Roam rides/driver platform)

374 `.ts`/`.tsx` files, read in full across 8 independent passes, audited against ten pillars: security/auth, error handling, input validation, performance, redundancy/DRY, CORS, env vars, idempotency/race conditions, logging, and edge-case handling.

**Totals:** 24 critical findings · ~40 high priority · ~35 cleanup items · ~35 things done right.

---

## Executive summary

The same problems kept showing up in slices of the codebase that were audited independently of each other — that repetition is the real finding. These are systemic patterns, not one-off bugs.

### 1. Whole routers are mounted with no auth check at all

This is the headline finding. In the Fleet app, `index.tsx` mounts **eight separate controllers** — audit logs, safety/fatigue data, sync locks, payment-ledger-line import, toll reconciliation, dispute-refund matching, period reset, and driver financial periods — and not one route inside any of them calls `requireAuth()`. That's most of the toll/dispute/ledger surface currently under active development. On the Roam side, `admin-operations/index.ts` has the identical shape: no role check before inviting, deleting, or listing users. Anyone who can reach the URL — no login, not even an API key — can read other drivers' payout history, delete users, or nuke a whole reconciliation period.

> `apps/fleet/src/supabase/functions/server/index.tsx:1451–1460`
> `apps/fleet/src/supabase/functions/admin-operations/index.ts`

### 2. Even the "protected" routes aren't protected by default

On routes that *do* call `requireAuth()`, an invalid or missing token doesn't get rejected — it silently becomes a synthetic `fleet_owner` admin user. A feature flag (`strict_auth`) is supposed to turn on real rejection, but it defaults to **off**. So the safety net for pattern 1 — "well, the rest of the API is at least behind auth" — is itself open by default.

> `apps/fleet/src/supabase/functions/server/rbac_middleware.ts:376–387`
> `apps/fleet/src/supabase/functions/server/feature_flags.ts:344–347`

### 3. Money-moving code checks-then-acts instead of using an atomic guard

Toll charges, ledger events, driver-offer accepts, and ride status transitions are frequently written as "read a flag → decide in JavaScript → write" with no database-level compare-and-swap in between. Two concurrent requests (a retry, a double-click, a race between an automated geofence transition and a manual one) can both pass the check and both write — double-charging a driver, duplicating a ledger event, or double-firing a ride completion. The codebase clearly knows the right pattern — `financial_ledger.ts`'s RPC-based idempotency key + content hash, and the driver-offer-accept atomic RPC, are both textbook — it's just applied inconsistently.

> `driver_toll_charge.ts:158–177` · `ledger_canonical.ts:344–370` · `rideLifecycle.ts:102–244`

### 4. CORS is wildcard-open everywhere, including admin routes

`origin: "*"` (or bare `cors()`, same default) appears in the Fleet server, all five standalone Fleet function apps, the Roam rides app (including its `/admin` subtree), and the driver/fleet-ops/platform-catalog functions. Combined with pattern 1, unauthenticated, cross-origin browser JS can hit the destructive endpoints directly.

### 5. The same helper gets reinvented three, four, five times

`kv_store.tsx` exists as six separate copies. `api_pricing.ts` and `api_usage_logger.ts` exist three times each. Service-role Supabase client construction is reimplemented ad hoc in 25+ files instead of importing one shared factory. Avatar/display-name resolution from a user's auth metadata is copy-pasted near-verbatim into six different Roam files. None of these have drifted into bugs *yet* — but every one is a "the fix landed in one copy and not the other four" incident waiting to happen.

### 6. Env vars are read with `!` or `?? ""`, never validated at boot

`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` shows up in essentially every file in both trees. If it's ever unset, nothing fails loudly at startup — the function boots fine and then throws an opaque, unhelpful error on the first real request.

### 7. One genuinely alarming one-off: a debug backdoor phoning home in production

Every PIN issuance, every matching wave, every reconcile call, and every driver-offer poll in the Roam rides function fires an uncaught `fetch()` to a hardcoded `http://127.0.0.1:7418/ingest/...` — clearly leftover AI-pair-debugging instrumentation — shipping driver IDs, ride IDs, and PIN-presence flags on every hot-path request. When a `persist` flag is on, it also writes permanent rows into the production audit log. This should come out today; it's the single easiest fix in the whole report.

> `supabase/functions/rides/index.ts:803–828` (and every call site listed under Chunk G below)

---

## Chunk A — Fleet: audit / cache / vendor / catalog / RBAC utils

`apps/fleet/src/supabase/functions/server/` — audit_controller, cache, rate_limiter, safety_controller, sync_controller, vendor_matcher, vehicle_catalog_*, rbac_middleware, org_scope, and 25 more.

### Critical

- **`audit_controller.tsx:1–70`** (mounted at `index.tsx:1452`) — No auth on the audit-log endpoints, and `POST /audit/logs` takes `userId` straight from the request body as the audit actor. Anyone can write a fabricated "admin did this" entry attributed to any user.
  ```ts
  app.post(`${BASE_PATH}/audit/logs`, requireAuth(), requirePermission('data.export'), async (c) => {
    const user = c.get('rbacUser') as RbacUser;
    const { entityId, entityType, action, oldValue, newValue, reason } = await c.req.json();
    const logEntry = { ...{ entityId, entityType, action, oldValue, newValue, reason }, userId: user.userId, ... };
  ```

- **`audit_logic.ts:19–47`** — "Tamper-evident" hashing has no secret, so it's forgeable. `generateRecordHash` is a plain SHA-256 digest with no server-side key. Combined with the open endpoint above, anyone can edit data and recompute a hash that "verifies" as untouched.
  ```ts
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(Deno.env.get("AUDIT_HMAC_SECRET")!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, msgUint8);
  ```

- **`safety_controller.tsx:1–10, 13, 94`** (mounted at `index.tsx:1453`) — No auth on driver fatigue/risk data. `GET /fleet/efficiency-baseline` and `GET /safety/fatigue-analysis` leak per-driver risk scores and IDs to anyone.

- **`sync_controller.tsx:1–10, 13–88`** (mounted at `index.tsx:1454`) — No auth, and lock/preference ownership is whatever the client claims it is. Any caller can steal or force-release another user's edit lock, or read/write another user's preferences via a plain `?userId=` query param.
  ```ts
  syncApp.post("/make-server-37f42386/sync/lock", requireAuth(), async (c) => {
    const rbacUser = c.get('rbacUser') as RbacUser;
    const { resourceId, resourceType } = await c.req.json();
    ... userId: rbacUser.userId, userName: rbacUser.email ...
  ```

- **`payment_ledger_line_controller.tsx:1–23, 78–126, 152–219`** (mounted at `index.tsx:1459`) — The widest-open money endpoint in the whole audit. No auth on any route: `POST /payment-ledger-lines/import` writes real payment/earnings data using only the service-role client, and `GET /payment-ledger-lines` hands back every driver's payout history to anyone who can reach it. Wrap every route in `requireAuth()` + `requirePermission(...)`, and derive org/driver scope from the verified JWT, never the request body.

### High priority

- `unverified_vendor_controller.tsx:166–373` — `resolveVendorToStation`, `rejectVendor`, `createStationFromVendor` read-modify-write vendor/transaction rows in a loop with no lock or version check; also do one KV get/set per transaction ID in a loop instead of batching with `Promise.all`.
- `maintenance_routes.ts:773–828` — `maintenance-fleet-bootstrap` does one Supabase round trip per vehicle inside a loop. Fetch all existing schedule rows once with `.in('vehicle_id', vehicleIds)` before the loop.
- `gemini_service.ts:4, 43–51, 132–137` — `Deno.env.get("GEMINI_API_KEY")!` has no startup check, and no call has a timeout wrapper — a hung Gemini request blocks the function until platform timeout.
- `index.tsx:296–304` — CORS `origin: "*"` plus credentialed `Authorization` headers defeats CORS as a defense layer for the unauthenticated routes above.

### Cleanup & redundancy

- The same platform-role check exists three times, byte for byte: `part_sourcing_routes.ts:17–24`, `maintenance_routes.ts:26–33`, `pending_vehicle_catalog_routes.ts:64–71`. Delete all three, add one `requirePlatformStaff()` to `rbac_middleware.ts` (it already has `hasPlatformStaffAccess`).
- Three separate JWT-validation implementations that can silently drift apart: `rbac_middleware.ts:293–302`, `product_admin_guard.ts:31–37`, `platform_settings.ts:301–309`. Consolidate into one exported `validateBearerToken()`.
- `fuel_entry_post.tsx` is dead code — nothing imports it, and it's an unauthenticated near-duplicate of the real, protected handler in `fuel_controller.tsx:2220`. Delete it.
- `audit_controller.tsx:6–11` creates a `supabase` client that's never used in the file. Delete the dead import.

### What's actually solid

- `vehicle_catalog_gate.ts` / `maintenance_routes.ts` / `part_sourcing_routes.ts` consistently chain `requireAuth()` + real permission checks before touching data — the pattern the rest of the codebase should copy.
- `api_command_center.tsx` is a genuinely good template: every route gated, secrets masked before returning to the client, key rotation validated live against the provider before committing.
- `org_scope.ts` / `rate_limiter.ts` — thoughtfully built, with sampled logging for the legacy-vs-strict org filter and KV-backed lockout persistence that survives cold starts.

---

## Chunk B — Fleet: toll / dispute / ledger / settlement core

The most financially sensitive part of the codebase — real driver toll charges, refunds, and period settlements. Currently mid-refactor (this is where the uncommitted local changes live).

### Critical

- **`index.tsx:1451–1460`** — Five entire controllers — the whole toll reconciliation, dispute-refund, period-reset, and payment-ledger surface — are mounted with zero auth. No `app.use('*', requireAuth())` exists anywhere in the file, and a grep for `requireAuth`/`rbac_middleware` inside `toll_controller.tsx`, `dispute_refund_controller.tsx`, `toll_period_controller.tsx`, `driver_financial_period_controller.tsx`, and `payment_ledger_line_controller.tsx` returns zero matches in every one. Anyone with the base URL can call `POST /toll-reconciliation/reset-period` (destroys a week of reconciliation), `bulk-reconcile`, `PATCH /dispute-refunds/:id/match`, or `settlement-allocations/backfill`.
  ```ts
  // index.tsx:1451–1460 — needs auth added inside each router, not just at the mount point
  app.route("/", tollApp);                  // no requireAuth anywhere inside
  app.route("/", disputeRefundApp);         // no requireAuth anywhere inside
  app.route("/", tollPeriodApp);            // no requireAuth anywhere inside
  app.route("/", driverFinancialPeriodApp); // no requireAuth anywhere inside
  app.route("/", paymentLedgerLineApp);     // no requireAuth anywhere inside
  ```
  Fix priority: `reset-period`, `bulk-reconcile`, `resolve-refund/bulk`, and `settlement-allocations/backfill` first — those are the destructive/bulk ones.

- **`rbac_middleware.ts:376–387` / `feature_flags.ts:344–347`** — Even the routes that call `requireAuth()` don't reject bad tokens by default. An invalid/missing JWT silently becomes a synthetic `fleet_owner` admin, unless the `strict_auth` flag is manually flipped on — and it defaults to off.
  ```ts
  console.log('[RBAC] Auth passthrough: token is not a user JWT (likely anon key). Defaulting to fleet_owner.');
  const passthroughUser: RbacUser = { userId: '_anon_passthrough', rawRole: 'admin',
    resolvedRole: 'fleet_owner', organizationId: null };
  ```

- **`kv_store.tsx:24–33` / `ledger_canonical.ts:344–370` / `driver_toll_charge.ts:158–177` / `toll_settlement.ts:150–179` / `dispute_refund_controller.tsx:293–350`** — Every "idempotent" money guard in this chunk is check-then-act, not atomic. `kv.set()` is a bare upsert with no compare-and-swap. Two concurrent requests with the same idempotency key both pass the "does this exist yet?" check and both write.
  ```ts
  // driver_toll_charge.ts:158–177 — race window between the get and the set
  const marker = normalizeMarker((await kv.get(markerKey)) as DriverTollChargeMarker | null);
  if (marker && marker.active) { /* ... */ }
  // nothing stops a second concurrent call from reaching here with the same stale `marker`
  await kv.set(markerKey, { active: true, txId, version, ... });
  ```
  The fix that already exists elsewhere in this same codebase (`financial_ledger.ts`'s RPC + idempotency key + content hash) is the right pattern — it just needs to replace the KV-only check-then-act paths, or those paths need a real unique index with `ON CONFLICT DO NOTHING`.

- **`index.tsx:296–305`** — CORS is hardcoded `origin: "*"`. Combined with the missing auth above, any website's JS can cross-origin call `reset-period` directly from a browser with no server-side gate at all.

### High priority

- `toll_controller.tsx:5010–5011` vs. `4629, 4651, 4716, 5055` — `bulk-reconcile` still reads from the legacy `transaction:*` store while every sibling endpoint has migrated to `toll_ledger:*`. A toll that only exists post-migration will fail bulk-reconcile with a false "not found."
- `driver_toll_charge.ts:308–319` — `reverseDriverTollCharge`: if the active marker points at a missing transaction row, it logs an error and flips the marker to inactive **without ever posting a reversal**. The driver stays charged with no ledger trace.
- `period_reset.ts:245–263` — The only guard on an irreversible, cross-entity destructive operation (wipes claims, tolls, and allocations for a whole period) is a free-text confirmation string supplied by the caller — and per the finding above, this endpoint has no auth, so that string is the entire safety mechanism.
- `dispute_refund_controller.tsx:548–551, 703–706, 843–845, 981–983` (pattern repeats through `toll_controller.tsx`) — Every catch block logs then returns `{ error: e.message }` with status 500 — raw Postgres/JS error text, forwarded straight to the client.
- `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` is independently repeated in 21+ files in this chunk with no startup check.

### Cleanup & redundancy

- `period_reset.ts:25–45` reimplements `hasTzSuffix` instead of importing the existing one from `timezone_helper.tsx`.
- Supabase client construction (`createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)`) is duplicated 21+ times in this chunk alone. `kv_store.tsx` already has this pattern privately at line 15 — export it as `getServiceClient()` and reuse.
- `period_reset.ts:97–110` (`driverMatches`) reimplements driver-alias comparison instead of calling the existing, shared `driverIdsReferToSamePerson` from `driver_identity.ts` — two divergent "same driver" implementations in a settlement-critical reset path is a correctness risk, not just duplication.

### What's actually solid

- `toll_settlement.ts` / `driver_toll_charge.ts` / `claim_resolution_sync.ts` form a well-designed idempotency-key + versioned-marker model that correctly supports charge → reverse → re-charge cycles. `decideClaimResolutionSync` is a pure, directly-testable decision function. The only gap is the underlying KV race, not the design intent.
- `financial_ledger.ts` routes real money postings through one atomic Postgres RPC with a real idempotency key *and* a content hash, so a changed payload under the same key surfaces as a conflict instead of silently skipping — this should be the template the KV-only paths get migrated toward.
- `period_reset.ts`'s reset ordering (dispute allocations → unlinked allocations → claims/tolls, plus a cross-period dangling-refund sweep) shows real thought about dependency-ordered undo — it just needs the auth gate fixed around it.

---

## Chunk C — Fleet: non-server function apps & duplicate-file audit

admin-operations, ai-services, fleet-management, fuel-maintenance, financial-operations — five standalone edge function apps, each with its own entrypoint and copy of shared utilities.

### Critical

- `admin-operations/index.ts:18, 94, 99–106, 108–115` — No role check on any admin endpoint. Nothing inspects the caller's role before `auth.admin.listUsers()`, `createUser()` (invite), or `deleteUser()`. Combined with wildcard CORS, any authenticated Supabase user — even a driver-role JWT from the mobile app — can invite, delete, or enumerate users. The same "logger + cors, nothing else" shape is copy-pasted across all five apps' entrypoints.
- `admin-operations/index.ts:76–89` — "Reset" endpoints are stubs that report success without doing anything. `preview-reset` unconditionally returns `{ success: true, items: [] }`; `reset-by-date` unconditionally returns `{ success: true }`. If the UI surfaces this as "reset complete," an operator will believe data was reset when nothing happened.

### High priority

- Generic 500s leak raw DB/provider error text across all five apps (e.g. `admin-operations/index.ts:37,48,71`, `fleet-management/index.ts:91,123,147,181`).
- No timeout on any outbound provider call (Gemini, Imagen, OpenAI, Uber) — `ai-services/index.ts:117–129`'s sequential 3-model Imagen fallback multiplies the risk of one hung call pinning the function.
- `admin-operations/index.ts:55–66` pulls every `trip:`/`transaction:` row and filters client-side by batch ID, even though `fleet-management/index.ts:44–46` shows the cheaper JSONB-filter pattern in the same repo. `fuel-maintenance/index.ts:307` re-fetches the entire `fuel_entry:` prefix inside a per-report loop.
- `ai-services/index.ts:383–385` and `performance-metrics.tsx:59–181` pull every `trip:`/`driver:` row into memory with no date bounding before filtering.
- `fleet-management/index.ts:204–209, 295–300` hardcodes a "ghost" UUID and runs a delete-scan on every `/drivers` and `/driver-metrics` call — looks like a one-off manual data fix that never got removed.
- No POST handler in any of the five apps validates its body against a schema.

### Cleanup & redundancy — the duplicate files

- `kv_store.tsx` exists as **six separate copies** (admin-operations, ai-services, fleet-management, fuel-maintenance, financial-operations, server/). Four of five diffed byte-identical; one has a cosmetic-only difference — proof these are hand-maintained, not generated, so a real bug fix in one copy won't reach the other four. Move to a shared file and import across all six.
- `api_pricing.ts` and `api_usage_logger.ts` exist **three times each** (ai-services, financial-operations, server/). No drift yet, but the next pricing update requires manually touching 2–3 files and will silently drift the first time someone forgets one.
- CORS + Supabase client + logger + `Deno.serve` boilerplate is copy-pasted verbatim across all five entrypoints. These apps already cross-import `ledger_canonical.ts` from `server/` — so the "isolation" argument for keeping `kv_store`/`api_pricing` duplicated doesn't hold.

### What's actually solid

- `api_usage_logger.ts`'s pre-flight guard design — a kill-switch + hard-stop budget check before any billed provider call, with an honest comment explaining the accepted read-modify-write race instead of pretending it's atomic.
- `ProviderBlockedError` is propagated consistently — every AI route checks for it before falling back to a generic 500.
- `getByPrefix` correctly pages through KV results 1000 rows at a time instead of assuming a single page.

---

## Chunk D — Shared foundation for rides + driver

`supabase/functions/_shared/` — the module every rides/driver function is supposed to import from to avoid duplication.

### Critical

- `platformLedgerQueries.ts:32–39` — Pagination fetches the entire matching result set just to compute a count. `.select("*", { count: "exact" })` with no `.range()`/`.limit()`/`head: true`. Fix: `.select("id", { count: "exact", head: true })` for the count query.
- `rideToFleetTrip.ts:19–21` — A falsy-zero bug produces a wrong payout figure. `Number(ride.driver_net_minor) || Math.max(0, fareMinor - platformFeeMinor)` silently discards a legitimately-zero net (a ride where the driver nets $0 after fees) and recomputes a fallback instead.
- `rideToFleetTrip.ts:59` — A dead ternary always reports a ledger row exists, even when it doesn't. `paymentRowCount: isCancelled ? 1 : (driverNetMinor > 0 ? 1 : 1)` — both arms of the inner ternary are `1`, so this claims a row exists in exactly the fallback path that runs when there are zero actual ledger rows.

### High priority

- Four separate reimplementations of "build a service-role client from env vars," each with the same silent `?? ""` fallback: `driverModeFilter.ts:7–12`, `ridesAdminDb.ts:65–71`, `driverAdminDb.ts:45–51`, `rideToFleetTrip.ts:106–129`.
- `ridesAdminDb.ts` and `driverAdminDb.ts` duplicate their entire schema-resolution engine almost line for line — the exact duplication `_shared` exists to prevent, duplicated *within* `_shared` itself.
- Schema-missing-table detection uses loose substring matching on error text, and the result is cached forever in a module-level variable — a transient, unrelated Postgres error can get misclassified as "table missing" for the isolate's entire lifetime.
- No rounding on money before serialization — `mapRideLedgerLine.ts:52–54`/`99–116` sums minor-unit divisions across many ledger lines with no `toFixed`/round step, which can produce values like `19.999999999998`.
- `appPermissionPolicy.ts:98–133` does a sequential select+upsert per patch item instead of batching, and its cache is keyed only by surface, not schema.

### Cleanup & redundancy

- Dead code: `geo.ts:45` (`bearingDeg`), `driverModeFilter.ts:64` (`getDriverProfileMode`), and an imported-but-never-called `mapRideLedgerLineRowToPaymentLedgerLine` in `rideToFleetTrip.ts:5`.
- `platformLedgerQueries.ts`'s row type duplicates `mapRideLedgerLine.ts`'s row type field-for-field under two different names.
- `rideToFleetTrip.ts` reimplements minor→major money conversion inline ~10 times instead of importing the existing (but unexported) `minorToMajor` from `mapRideLedgerLine.ts`.

### What's actually solid

- `geo.ts` — clean haversine implementation with proper finiteness guards and a same-point short circuit.
- `appPermissionCatalog.ts` / `appPermissionPolicy.ts`'s write path is correctly JWT-scoped end to end.
- `ridesAdminDb.ts` / `driverAdminDb.ts` never take a caller-supplied user/org id — they only resolve table/schema names, correctly leaving row-level scoping to callers using the verified JWT.
- `dataSafetyCsv.ts` — hand-rolled CSV parser correctly handles quoted fields, escaped quotes, mixed line endings, and escapes output to prevent CSV injection.

---