# Query Performance Audit — Roam / Fleet / Dash

Real query call-sites — `.eq()`/`.order()`/`.ilike()`/joins — extracted from every Edge Function and cross-referenced against the actual index inventory in 240 Supabase migration files. Not a static schema review — a query-by-query match of what the code actually asks Postgres to do against what's actually indexed.

**Totals:** 14 critical findings · 21 high priority · 15 cleanup items · 30+ well-indexed queries confirmed.

---

## Executive summary

This audit turned up a bug class that's more interesting, and more dangerous, than a plain missing index: an index that *used to* match the query, or was *built specifically* to fix the exact problem it's still causing — and the connection quietly broke. Three independent reviewers found this shape without knowing the others had.

### 1. Three separate cases of "the index exists, the query just doesn't match it anymore"

A fleet trip-search index was built for `value->>'driverId'` (text extraction) sorted by `date` — the actual route code queries `value->'driverId'` (JSON extraction, a different operator entirely) sorted by `createdAt`. Neither the operator nor the field name match, so Postgres can't use the index at all — every search silently falls back to a full scan, and has been since the index was added. Separately, the ride-hailing platform already has an H3-geospatial RPC purpose-built to bound "find nearby available drivers" to a small area — and the fare-quote endpoint that needs exactly that doesn't call it, instead pulling every available driver *nationwide* into the function to filter in JavaScript on every single quote. And a fare-rules fallback index was flat-out `DROP`ped in a later migration when a newer lookup path was added, with nothing ever built to replace it for the cases that still fall through to the old path. All three are "we clearly know how to fix this — the fix just isn't wired up," not "we don't know indexing."

### 2. The single highest-frequency query in the entire passenger app — "what's my active ride" — has no index for its actual shape

This runs every time the app opens. It filters by user id *and* a small set of "still in progress" statuses, sorted by recency — a textbook composite/partial index case — and today the schema only has separate single-column indexes for user id, for status, and for the sort column. The activity-history tab one screen over has the same gap, plus its date-window filter is applied in application code after fetching instead of in the query, so Postgres has to sort a user's *entire* ride history to find the newest 100.

### 3. N+1 fan-outs are still present exactly where a prior audit already flagged them — a misleading code comment claims one is fixed, and it isn't

The driver compliance-review queue has a comment reading "paginate profiles first, then fetch enrichment only for the paginated subset" directly above code that does the opposite: it fetches every pending driver, enriches every one of them via a per-row Auth API call, and *only then* slices out the requested page. A queue of 5,000 pending drivers means 5,000 external API calls on every page load, regardless of page size. A separate, newly-found case in the passenger app's trip-history-via-invite path does up to 200 sequential single-row database fetches, one at a time, to build a single response.

### 4. The admin driver-directory page recomputes a full-history aggregation on every single load

The stats that back the admin drivers dashboard come from a plain database view — not a materialized one — that runs two `GROUP BY` aggregations over the *entire* ride-request and driver-offer history, with no date bound, every time anyone opens the page. This is the one finding in the whole report that gets worse on a curve rather than a line: the more rides the platform has ever processed, the slower every future page load gets, forever, with no amount of indexing able to fix it — it needs to become a materialized view refreshed on a schedule, or be windowed to a rolling period.

### 5. The vehicle catalog search is the textbook leading-wildcard problem, and it's comprehensive

Every catalog search/filter endpoint chains `.ilike('%term%')` across a dozen columns — make, model, trim, chassis code, engine code, and more. There is no `pg_trgm` extension and no trigram index anywhere in any of the 240 migrations. Every one of these searches is a full sequential scan of the whole vehicle catalog table today.

The counterweight: where this team built a query and an index together in the same migration, the match is usually exact — fare-rule lookups by location, scheduled-ride due-date filtering, connection-request status filtering, ride-message pagination, and the core ledger's driver+period composite are all genuinely well-indexed, several of them precisely enough to qualify as index-only scans. The gap in this report is almost entirely in queries added *after* their table's original indexing pass, not a lack of indexing skill.

---

## A — Fleet server: catalog/maintenance/parts utils

### 🚨 Critical

**Every vehicle-catalog search endpoint uses leading-wildcard `.ilike('%term%')` across ~12 columns** (make, model, trim_series, chassis/generation code, body type, drivetrain, transmission, fuel type/grade, engine code/type — `pending_vehicle_catalog_routes.ts:198,224,283-321`) — **zero `pg_trgm` or trigram index exists anywhere in the schema.** Every search is a full sequential scan.
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicle_catalog_make_trgm ON public.vehicle_catalog USING gin (make gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicle_catalog_model_trgm ON public.vehicle_catalog USING gin (model gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicle_catalog_trim_series_trgm ON public.vehicle_catalog USING gin (trim_series gin_trgm_ops);
```

Org-wide maintenance-log listing (`maintenance_routes.ts:613-618`) sorts by date across up to 5,000 rows with no index covering both the org filter and the sort — forces a large in-memory sort on every request.
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mr_org_performed ON public.maintenance_records (organization_id, performed_at_date DESC);
```

A fuel-entry lookup (`canonical_vehicle_odometer.ts:49-50`) filters a JSONB field with no supporting index, and critically **isn't scoped to the requesting organization** — it scans every org's fuel-entry rows platform-wide on every call, filtering by org afterward in application code. Cost scales with total platform volume, not the caller's own data.

### 📊 Run this

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.vehicle_catalog
WHERE make ILIKE '%toyota%' AND model ILIKE '%corolla%'
ORDER BY make, model LIMIT 40;
-- If you see "Seq Scan" on vehicle_catalog: that's the whole table being read for every search box keystroke.
```

### ✅ What's solid

Vehicle-catalog listing sort, maintenance-schedule composite lookups, and the pending-requests admin queue all match their supporting indexes exactly.

---

## B — Fleet server: toll/dispute/ledger/settlement core

Most of this chunk runs on a generic key-value table (a different performance model entirely, out of scope here) — the newer real relational ledger tables are where the findings are.

### 🚨 Critical

Evidence-file bucket-size and "deleted" queries (`evidence_routes.ts:78-83, 55-100`) have zero index support at all — these grow with every fuel/toll/odometer upload and will slow down the admin storage dashboard as volume grows.
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_files_bucket_active
  ON public.evidence_files (bucket_id) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_files_deleted_at
  ON public.evidence_files (deleted_at DESC) WHERE status = 'deleted';
```

### ⚠️ High priority

The financial-outbox drain query — which runs on *every single* driver-financial-periods list request, not just a background job — filters on one column but sorts on a different, unindexed one, forcing a sort of every matched row each time.

### 🧹 Cleanup

One health-check query checks `IS NULL` on a column that's declared `NOT NULL` in the schema — it can never match anything and will always silently report zero, regardless of real data state.

### ✅ What's solid

The core ledger's driver+period composite index is an exact match for the dominant read pattern — genuinely well-designed. Evidence-file 14-day retention sweep, financial-period status health-checks, and the toll/fuel policy singleton lookups are all correctly indexed.

---

## C — Fleet non-server function apps

Nine of ten files here are entirely KV-store based with no relational query surface at all. The one exception is where the audit's most distinctive finding lives.

### 🚨 Critical

**A composite index was built specifically for the trip-search query — and the query doesn't match it.** (`fleet-management/index.ts:38-64` vs. migration `20260804120000`.) The index extracts `driverId`/`date` as text (`->>`); the query filters `driverId` as JSON (`->`) and sorts by a field called `createdAt`, which doesn't exist in the index at all. Postgres requires an exact expression match to use an expression index — neither the operator nor the field name lines up, so this index has silently never been used since it was added.

This isn't "add an index" — the index is already there. The fix is rewriting the query to use the same `->>` text-extraction operator and the same field name (`date`, not `createdAt`) that the index was actually built for.

The dashboard-stats endpoint (`fleet-management/index.ts:370-397`) filters on a *third* different date-field name and a status field with no index support at all.

### 📊 Run this

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT value FROM kv_store_37f42386
WHERE key LIKE 'trip:%'
  AND value->'driverId' = '"D123"'::jsonb
ORDER BY value->'createdAt' DESC LIMIT 20;
-- Expect: a scan, NOT an index scan on idx_kv_trip_driver_date, despite that index existing.
```

---

## D — Shared module: foundation for every rides/driver request

Imported by nearly every function on the Roam side — a gap here has the widest blast radius of anything in this report.

### 🚨 Critical

The admin ledger-line listing (`platformLedgerQueries.ts:33-52`) falls back to a full sequential scan whenever neither a driver nor a rider filter is supplied — reachable from both the rides and driver admin surfaces, on a table that grows with every completed ride.

### ⚠️ High priority

Every permission check fires the same 3-table role/permission join up to three times per request (once via the auth wrapper, then twice more inside the permission check itself) — this guard runs on nearly every admin route.

### 🧹 Cleanup — corrects an earlier audit

`platform.user_roles` — confirmed well-indexed in a prior security audit — does still carry one genuinely redundant duplicate index on `user_id` (a unique constraint already covers it). Small write-overhead cost, worth dropping. The same exact pattern exists on `driver_profiles.user_id`, a table queried on nearly every dispatch-matching cycle.

### ✅ What's solid

The ledger-line composite indexes for single-user lookups are exact matches for the common access pattern. No leading-wildcard search anywhere in this module. The app-permission-policy table's primary key doubles as a genuinely covering index, backed by an in-process cache that mostly avoids touching Postgres at all.

---

## E — Rides: fare calculation, cash settlement

### 🚨 Critical

**Every fare quote pulls every available driver nationwide into the function to filter in JavaScript** (`fare/pickupEta.ts:52-73`) — with no geographic bound and no row limit. The platform already built the fix: a geospatial index and a purpose-built RPC (`rides_drivers_in_h3_cells`) that bounds this exact lookup to a small area. This code calls neither.

This is the same "the fix already exists, it's just not wired up" pattern as chunk C's search bug — the RPC and its supporting index were built specifically to solve this, and the fare-quote code path was never switched over to use them.

The fare-rules legacy "city" fallback lookup (`fare/rules.ts:60-61` vs. migration `20260518100000`) had its supporting index **dropped** by a later migration when a newer location-key index was added — and nothing was ever built to replace it. Every quote that falls through to the city-based path (any request without a matching location key) now does a full scan of the fare-rules table.

### 📊 Run this

```sql
EXPLAIN ANALYZE
SELECT user_id, lat, lng, updated_at FROM rides.driver_locations
WHERE updated_at >= now() - interval '2 minutes' AND available_for_rides = true;
-- Expect: every available driver nationwide, not just nearby ones.

EXPLAIN ANALYZE
SELECT * FROM rides.fare_rules
WHERE vehicle_type = 'roam-standard' AND is_active = true AND city = 'jamaica' LIMIT 1;
-- Expect: Seq Scan — the index this needs was dropped and never rebuilt.
```

### ✅ What's solid

The primary fare-lookup path (by location key), scheduled-ride due-date filtering, and service/body-type matching are all exact index matches — several are index-only-scan candidates. No leading-wildcard search anywhere; all "search" here is external API or in-memory bounding-box math.

---

## F — Rides admin dashboards

### 🚨 Critical

The phone-lookup query shape (`resolveRoamUserByPhone.ts:54-57`) was already fixed since a prior audit (it's bounded now), but `rider_profiles.phone` still has no index at all — every lookup is still a full scan, just capped to return at most 10 rows instead of unbounded.
```sql
CREATE INDEX CONCURRENTLY idx_rides_rider_profiles_phone ON rides.rider_profiles(phone) WHERE phone IS NOT NULL;
```

Both admin "online drivers" queries (`dashboardLists.ts:123-126`, `dashboardStats.ts:95-98`) sort/filter on `updated_at`, which has no index anywhere on the driver-locations table — a full sort of every driver-location row on every dashboard load.
```sql
CREATE INDEX CONCURRENTLY idx_rides_driver_locations_available_updated
  ON rides.driver_locations(available_for_rides, updated_at DESC);
```

### ⚠️ High priority

No index covers the near-universal admin dashboard shape of "status filter + timestamp range/sort" on ride_requests — every status-scoped dashboard tab pays for a bitmap merge of two separate single-column indexes instead of one purpose-built composite. The audit log table has no time-based index and no partitioning strategy despite being a constantly-growing append-only table.

### ✅ What's solid

Base ride_requests indexes cover the bulk of rider/driver-scoped lookups. Scheduled-ride due-date filtering, contact lookups, and ride-message pagination are all textbook index matches — no N+1, no missing coverage.

---

## G — Rides lifecycle/booking: the main router

The highest-traffic file set in the platform — every finding here runs at real scale.

### 🚨 Critical

"What's my active ride" — the single most-called query shape in the passenger app (`rideHubQueries.ts:33-45`, runs on every app open) — filters by user id and a small set of in-progress statuses, sorted by recency. No composite or partial index covers this exact shape; today it's served by three separate single-column indexes bitmap-merged together.
```sql
CREATE INDEX CONCURRENTLY idx_ride_requests_rider_active_created
  ON rides.ride_requests(rider_user_id, created_at DESC)
  WHERE status IN ('matching','driver_assigned','driver_en_route_pickup','driver_arrived_pickup','on_trip');
```

Activity/trip history (`passengerActivityHistory.ts:244-277,440-441`) sorts by `updated_at`, which has zero index anywhere — and the day-window filter (e.g. "last 30 days") is applied in application code *after* fetching, not pushed into the query. Postgres has to sort a user's entire lifetime ride history to find the newest 100 every time this tab opens.

**Confirmed N+1: up to 200 sequential single-row database fetches, one at a time, to build one response.** (`passengerActivityHistory.ts:314-370`.) The trip-history-via-invite path collects up to 100+100 candidate ride ids from two separate queries, then fetches each one individually in a plain `for` loop instead of one batched `.in("id", ids)` call — a pattern the same codebase already uses correctly elsewhere.

### ⚠️ High priority

The contacts list does a full-table fetch with search/group filtering done in application memory instead of SQL, then fans out up to 4 additional queries per contact returned — up to 4N queries for one page load.

### ✅ What's solid

Connection-request status filtering, saved-places singleton slots, and the activity feed's cursor-based pagination (not offset-based, avoiding deep-pagination blowup) are all well-designed — the gaps here are specifically in the two highest-frequency read paths, not a general pattern.

---

## H — Driver admin + misc functions

### 🚨 Critical

**A code comment claims this route paginates before enriching — it doesn't.** (`complianceRoutes.ts:110-116`.) It fetches every pending driver, unbounded, then runs a per-row external Auth API call for every single one of them, and only slices out the requested page at the very end. A queue of 5,000 pending drivers means 5,000 external API calls on every page load, regardless of what page size was requested. Flagged in a prior audit and still not actually fixed — only relabeled.

**The single worst-scaling finding in this entire audit.** (`drivers.ts:197-207` · migration `20260519120000`.) The admin driver-directory page's stats come from a plain (non-materialized) database view that runs two full `GROUP BY` aggregations over the *entire* history of ride requests and driver offers — no date bound — every single time the page loads. This can't be fixed with an index; it needs to become a materialized view on a refresh schedule, or be windowed to a rolling period (e.g. last 180 days).

### ⚠️ High priority

Every successful payment webhook (WiPay and PayPal both) does a sequential scan looking up the payment intent — the column it filters on has no index, on a table that only grows.
```sql
CREATE INDEX CONCURRENTLY idx_payment_intents_provider_intent_id
  ON payments.payment_intents(provider_intent_id);
```

### ✅ What's solid

Every single-driver lookup by user id, vehicle-count batch lookups, and the pending-offers partial index are all correctly designed — the gaps in this chunk are specifically the two unpaginated admin-list endpoints and one webhook lookup column, not a general pattern.

---

*Compiled from eight independent passes, each extracting real query call-sites from the edge functions and checking them against the actual index definitions in the migrations — not a static schema review, a query-by-query match. Fix pattern 1 first (the three "index exists, doesn't match anymore" cases) since those are the cheapest possible wins: the index work is already done, only the query needs to change.*

---

## Remediation status (2026-07-18)

Applied live on `csfllzzastacofsvcdsc`. Migrations: `supabase/migrations/20260718230000`–`20260718230300`.

### Wave 0 — Wire existing indexes / RPCs

| Fix | Change |
|---|---|
| Fleet trip search | `value->>driverId` + `value->>date` (matches `idx_kv_trip_driver_date`) |
| Fleet dashboard stats | trips by `value->>date`; drivers by `value->>status` |
| Fare pickup ETA | calls `rides_drivers_in_h3_cells` first (legacy nationwide fallback only if H3 fails) |
| Fare rules city | rebuilt `idx_rides_fare_rules_city_vehicle_active` |

### Wave 1 — Hot indexes

Active-ride `(rider|passenger)_user_id, created_at DESC` partials; history `updated_at` composites; status+time admin composites; rider phone; driver_locations available+updated; payment_intents.provider_intent_id; maintenance org+date; outbox pending+created_at. Evidence indexes skipped if table absent on prod.

Note: Schema audit Wave 4 already had `(rider_user_id, status)` partial — these add the `created_at` ORDER BY cover the hub query needs.

### Wave 2 — Catalog search

`pg_trgm` + GIN on `make` / `model` / `trim_series` (+ chassis/engine when columns exist).

### Wave 3 — App query fixes

- Compliance: Auth-enrich **only** the page slice after sort/paginate
- Activity history: batched `.in("id", …)` ride load; day window pushed into SQL via `updated_at >= windowStart`
- Fuel odometer maps: filter `organizationId` in the KV query when org is known

### Wave 4 — Driver directory stats

`rides.driver_directory_stats` is now a **materialized view** (public wrapper view preserved). Hourly `pg_cron` job `refresh_driver_directory_stats_hourly`. Admin UI may lag up to ~1 hour.

### Deferred (later)

Contacts 4N fan-out, permission-join caching, redundant `user_id` duplicate indexes, admin ledger full-scan with no driver/rider filter.
