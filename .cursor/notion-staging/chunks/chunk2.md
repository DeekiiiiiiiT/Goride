
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