
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
