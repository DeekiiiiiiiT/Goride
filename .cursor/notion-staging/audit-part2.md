# Edge Function Audit — Roam / Fleet (continued)

## Chunk E — Rides: fare, cash settlement, scheduled rides

`supabase/functions/rides/fare`, `cashSettlement`, `scheduledRides` — where fares get calculated and real money changes hands.

### Critical

- `fare/quoteToken.ts:31–33, 78–82, 104–105, 116–121` — A fare-lock token becomes forgeable if one env var is ever unset. When `ROAM_RIDES_QUOTE_SECRET` is missing, `mintQuoteToken` falls back to an unsigned token, and `verifyQuoteToken` accepts any unsigned token with zero signature check.
- `cashSettlement/computeFinalFare.ts:36–50` (called from `rideLifecycle.ts:196–201`) — Completing a card trip wipes any existing tip to $0. `completionFinancialPatch` unconditionally sets `tip_minor: 0` and `platform_fee_minor: 0` regardless of what was already on the ride.

### High priority

- `fare/places.ts` has no request timeouts on any of its five external fetches, unlike `routing.ts`/`distanceMatrix.ts` which correctly wrap Google calls in an 8s `AbortSignal.timeout`.
- `fare/waitTime.ts:148–150` — `Math.max(1, surgeMultiplier)` propagates `NaN` straight through if the input is garbage.
- `fare/resolveLocation.ts` returns the *first* parish whose bounding box contains a point, in fixed order — Kingston and Saint Andrew's boxes genuinely overlap, so a pickup in the overlap band always resolves to Kingston even when it should be Saint Andrew.
- Cash-settlement journal lines post one RPC at a time in a loop — a mid-loop crash leaves a partial journal (there is a post-hoc check that blocks completion, so it won't look falsely done, but confirm `repairIncompleteSettlement.ts` is actually scheduled/monitored).
- `fare/driverBodyType.ts:23–39` destructures `{ data }` from two lookups and never checks the paired `error` — a transient DB error is indistinguishable from "driver has no profile."

### Cleanup & redundancy

- Route/matrix/pickup-ETA/fare-rules caches are plain `Map`s with a read-time TTL check but no eviction or size cap.
- `fare/rules.ts:55` selects every column of the fare-rules table when only ~7 fields are read.
- `fare/resolveLocation.ts:17–27` reimplements the same haversine formula already exported from `routing.ts`.

### What's actually solid

- PIN verification uses a genuine constant-time compare with thorough test coverage of every branch.
- Cash-settlement idempotency is actually enforced, not just computed: a caller-supplied idempotency key, a payload content hash, explicit conflict rejection on hash mismatch, and a dedicated RPC per journal line.
- `routing.ts` / `distanceMatrix.ts` are properly defensive around the third-party Google calls: timeouts, try/catch, and a haversine fallback.
- Quote-token expiry and coordinate/vehicle-type binding is sound whenever the HMAC secret is actually configured.

---

## Chunk F — Rides: admin, access, trip-intent core

`supabase/functions/rides/admin` + the access/identity gatekeepers the rest of the rides function depends on.

### Critical

- `resolveRoamUserByPhone.ts:48–77` — An unbounded phone-lookup scan silently drops real matches at scale. The query has no `.limit()` and no `.eq()` on phone. Once the table exceeds PostgREST's default row cap, real matches are silently dropped rather than erroring.
- `passengerInvites.ts:139–171` — A passenger-invite claim has a check-then-act race. `claimed_at` is read, checked in JS, then patched separately. Two concurrent claims of the same forwarded link can both pass the null check — last writer silently wins.

### High priority

- `commandoBodyTypes.ts` creates its own service client per request and re-paginates the vehicle catalog (up to 40 round trips) on every admin page load of near-static reference data, with no caching.
- `dashboardStats.ts:93` loads the entire `driver_locations` table with no limit on every stats call.
- `select("*")` on `ride_requests` throughout `dashboardLists.ts` and `rideOperations.ts`.
- `rideOperations.ts:415–462`'s cash-settlement release calls the shared transition function without the `expectedFrom` guard used elsewhere in the same file for geofence transitions.

### Cleanup & redundancy

- Write-role gating is hand-rolled twice on top of the shared admin gate (`appPermissions.ts` and `playStoreLaunch.ts`).
- `rideGeofence.ts:68–76`'s `detectTeleport` takes an `intervalSec` parameter that's never actually passed by its one call site.
- `canCancelRideAsRider` in `rideAccess.ts` is marked deprecated in favor of `canCancelRide` — worth confirming no remaining callers.

### What's actually solid

- `requireProductAdmin` (used by every admin route in scope) is a genuinely solid gate — validates the bearer JWT, checks both JWT role claims and a DB-resolved access table, returns proper 401 vs. 403.
- `rideAccess.ts` / `tripIntentAccess.ts` are pure, side-effect-free, well-tested gatekeepers that every consumer in scope correctly delegates to.
- `adminCashSettlement.ts` keeps all authorization logic as pure, fully unit-tested functions decoupled from I/O.
- Cash settlement idempotency (via `processCashSettlement.ts`) is real: explicit conflict codes on hash mismatch, and a safe replay path.
- Passenger invite claims require the claiming user's own verified phone to match the invited phone, and reject claims on terminal-status rides.

---

## Chunk G — Rides: lifecycle, booking, privacy, misc

The main `rides/index.ts` router plus ride lifecycle, booking, and passenger-privacy logic.

### Critical

- `index.ts:803–828` (plus call sites at `313–331, 1041–1045, 1227–1338, 2010–2017, 2238–2245`) — A debug telemetry backdoor phones home from production on nearly every request. An uncaught `fetch()` to a hardcoded `http://127.0.0.1:7418/ingest/...`, with a hardcoded session ID, fires on every PIN issuance, every matching wave, every reconcile call, and every driver-offer poll — shipping driver IDs, ride IDs, and PIN-presence flags on every request in prod. When a `persist` flag is set, it also writes permanent rows into the production audit table. Remove entirely.
- `rideLifecycle.ts:102–244` / `index.ts:432–462` — Ride status transitions have no compare-and-swap at the database layer. `applyRideTransition` validates the expected "from" status in memory, but the actual DB update filters only by `id` — never by current status. Two concurrent transitions can both pass validation and both write, double-firing ledger/audit/surge side effects.
- Matching-wave advancement and reconcile can double-write under concurrent triggers — the same ride's matching wave and driver-offer inserts are read-then-patched, and reconcile can be triggered concurrently from three different call sites racing on the same ride ID with no lock.

### High priority

- Driver decline never reaches the matching-brain delegation path — imported but never called.
- CORS is wildcard for the entire app, including the `/admin` subtree mounted on the same instance.
- Service-role clients are re-instantiated per request in 6+ files instead of reusing the shared factories already defined in `index.ts`.
- Reconcile/cancel paths do a full-row read per ride inside a loop, and the ride-transition function itself re-fetches the ride at both entry and exit.
- DB credential env vars fall back to an empty string instead of failing fast, unlike the cron-secret check elsewhere in the same file.

### Cleanup & redundancy

- ~370 lines of matching logic marked `@deprecated Phase 8 cleanup` in its own comments are still live as a fallback alongside the newer matching-brain delegation.
- Avatar/display-name resolution from auth metadata is copy-pasted near-verbatim into six different files.
- The "require passenger" auth-gate closure is redefined identically in at least seven files.
- A narrow beta-only body-type fallback shim carries a comment admitting it "zeroes out the candidate pool" if removed carelessly.

### What's actually solid

- `shadowBookerPrivacy.ts` is a clean single source of truth for redaction, fully test-covered, and consistently applied at every read path in scope.
- Driver-offer accept is the one place true race-safety was clearly engineered — atomic RPC with a legacy fallback and distinct error codes per failure mode.
- Quote tokens are re-verified server-side at booking time rather than trusting a client-supplied fare.
- Rate limiting is applied consistently across every mutation endpoint in scope, including driver location ingestion.
- `matchingBrainClient.ts` uses a real 5-second abort timeout and degrades gracefully to the legacy path on any failure.
- Connection/contact logic canonicalizes user pairs and checks blocks bidirectionally before every action, with solid test coverage.

---

## Chunk H — Driver admin, fleet-ops, platform-catalog, send-sms

Driver-facing admin tools and the SMS/OTP delivery path.

### Critical

- `complianceRoutes.ts:131–151` — An N+1 query storm in the compliance queue will time out in production. Every driver profile is fetched with no limit, then for each one a sequential Auth-API call is awaited inside the loop — before pagination is even applied.
- `driver/admin.ts:238–258` — A real authorization gap: `POST /admin/offers/:id/cancel` is gated only by the generic admin check, which admits the `driver_ops` role — but every other mutating route in the same file explicitly excludes that role via a separate write-check.
- `send-sms/index.ts:116–121` — A debug flag can print raw OTPs and phone numbers to production logs with no runtime enforcement. The only safeguard against this stub firing in prod is a code comment.

### High priority

- Every driver-admin route re-authenticates from scratch instead of reusing the result already computed by the shared middleware — 12 routes in `drivers.ts` each pay a second network round trip and DB query per request.
- Driver lifecycle transitions (approve, suspend, deactivate, reactivate) all fetch-then-blind-write with no status guard on the update itself.
- The admin driver-directory endpoint loads the entire driver base with no limit, combined with a paginated Auth-API listing loop that can run up to 5,000 users deep, on every single directory request.
- SMS sending has no idempotency guard against a webhook retry — a slow response can cause the same OTP to be sent twice.

### Cleanup & redundancy

- Service-role client construction, an `isDriverUser()` check, a vehicle-count fetcher, and a profile-shape mapper are each duplicated verbatim across 2–4 files in this chunk.
- Three separate "write roles" sets exist that should be one — including a dead, never-imported role set in `complianceLogic.ts` that duplicates a real one in `permissions.ts`.
- Raw DB error messages are returned to callers throughout.
- A driver-profile delete route doesn't check the result of its own cleanup deletes at all — a failed cleanup is silently swallowed and the endpoint still reports success.
- Wildcard CORS with no dynamic-origin allowlist across all three files in this group.
- `fleet-ops/index.ts` and `platform-catalog/index.ts` are pure health-check stubs — flagging so they aren't mistaken for "reviewed and clean" once real routes land.

### What's actually solid

- `complianceLogic.ts` is a clean, pure, well-tested module — good separation of business rules from routes.
- `send-sms/index.ts` has no hardcoded secrets, validates webhook signatures before trusting any payload, and cleanly distinguishes 401/503/502 instead of swallowing errors.
- `carrierRouter.ts` has no injection risk — phone numbers are only prefix-matched via regex, never interpolated into a shell/SQL/eval context.
- Force-approve requires both a role check and a minimum-length reason, and every sensitive mutation in scope is consistently followed by an audit-log call.

---

*Compiled from eight independent file-by-file passes across both Supabase function trees. Every finding above cites a specific file and line — worth spot-checking the highest-severity ones against the current file before acting, since a few files in Chunk B are mid-refactor locally.*

---

## Remediation status (Wave 0–6)

*Last updated: 2026-07-18*

| Finding | Severity | Status | Wave | Notes |
|---------|----------|--------|------|-------|
| Debug telemetry backdoor (`127.0.0.1:7418`) | Critical | **Fixed** | Wave 0 | Removed helper + all call sites from `rides/index.ts` |
| Quote token forgeable / unsigned accepted | Critical | **Fixed** | Wave 0 | Fail-closed mint/verify; unsigned rejected; unit tests |
| SMS OTP stub logs in prod | Critical | **Fixed** | Wave 0 | Stub requires `ENVIRONMENT` in development\|local\|test |
| Fleet client anon Bearer on money/admin | Critical | **Fixed** | Wave 1A | `authHeaders.ts`; ~259 call sites require session JWT |
| Controllers mounted with no auth | Critical | **Fixed** | Wave 1B | `requireAuth({ strict: true })` + permissions on toll/dispute/ledger/audit/safety/sync/fuel + admin-ops |
| Audit actor from body `userId` | Critical | **Fixed** | Wave 1B | Actor = JWT `rbacUser.userId` only |
| Admin reset stubs fake success | High | **Fixed** | Wave 1B | Return 501 `not_implemented` |
| RBAC anon → synthetic `fleet_owner` | Critical | **Fixed** | Wave 1C | `strict_auth` defaults ON; flag-miss/error fail-closed; money routes hard-strict |
| Audit hash forgeable (bare SHA) | Critical | **Fixed** | Wave 1C | HMAC with `AUDIT_HMAC_SECRET` |
| Ride status transitions no CAS | Critical | **Fixed** | Wave 2 | Migration `rides_patch_ride_request` + edge CAS; 409 on conflict |
| Toll charge KV double-write | Critical | **Fixed** | Wave 2 | Deterministic charge ids; reverse no longer silent-deactivate |
| Passenger invite claim race | Critical | **Fixed** | Wave 2 | Atomic `UPDATE … WHERE claimed_at IS NULL` |
| SMS OTP webhook double-send | High | **Fixed** | Wave 2 | `sendDedup` TTL keyed on webhook-id / phone+otp |
| Matching reconcile double-fire | High | **Fixed** | Wave 2 | Per-rideId single-flight coalesce |
| Card complete wipes tips | Critical | **Fixed** | Wave 3 | `completionFinancialPatch` preserves tip/fee |
| `driver_net_minor: 0` falsy bug | Critical | **Fixed** | Wave 3 | Nullish coalescing + paymentRowCount fix |
| Ledger count loads full set | Critical | **Fixed** | Wave 3 | `head: true` count query |
| Unbounded phone lookup | Critical | **Fixed** | Wave 3 | `.eq(phone)` + `.limit(10)` |
| `driver_ops` offer cancel gap | Critical | **Fixed** | Wave 3 | Write-role 403 |
| Fare NaN surge / Places timeouts / parish overlap / body-type errors | High | **Fixed** | Wave 3 | Coerce surge; 8s abort; smallest bbox; log DB errors |
| Compliance N+1 / unbounded dashboard loads | High | **Fixed** | Wave 4 | Batch Auth; date+limit on locations |
| Maintenance bootstrap N+1 | High | **Fixed** | Wave 4 | Prefetch schedules with `.in()` |
| Provider hung calls | High | **Fixed** | Wave 4 | Timeouts on Gemini/Imagen/OpenAI |
| Destructive bulk unrate-limited | High | **Fixed** | Wave 4 | Rate limit reset-period, bulk-reconcile, invite/delete |
| Ad-hoc service clients / no env boot | High | **Fixed** | Wave 5 | `getServiceClient` + `env_boot`; rides requires quote secret at boot |
| Duplicate platform-staff checks / dead fuel_entry_post | Cleanup | **Fixed** | Wave 5 | `requirePlatformStaff` / deleted dead file |
| CORS `origin: "*"` | High | **Fixed** | Wave 5 | Env `CORS_ALLOWED_ORIGINS` allowlist (dev fallback) |
| Raw 500 error leakage (money/admin) | High | **Fixed** | Wave 6 | `safeErrorResponse` / `safeAdminError` |
| bulk-reconcile legacy `transaction:*` drift | High | **Fixed** | Wave 6 | Reads `toll_ledger:*` with legacy fallback |
| Phase 8 matching fallback still live | Cleanup | **Partial** | Wave 6 | Once-only deprecation warn; removal deferred pending metrics |
| kv_store / api_pricing multi-copy | Cleanup | **Deferred** | — | No drift yet; full consolidate later |

**Legend:** Fixed = implemented in tree · Partial = mitigated · Deferred = tracked

**Ops follow-ups before prod:** set `ROAM_RIDES_QUOTE_SECRET`, `AUDIT_HMAC_SECRET`, `CORS_ALLOWED_ORIGINS`; apply migration `20260718090000_rides_patch_ride_request_cas.sql`; run [docs/edge-audit-redteam.md](edge-audit-redteam.md); if KV still has `strict_auth.enabled=false`, flip via admin feature-flag API.