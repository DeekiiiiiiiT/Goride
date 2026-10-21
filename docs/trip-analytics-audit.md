# Trip Analytics: audit and build plan

**Rev 1 · 2026-10-21** · Audit only. No code was changed. Production data was read with read-only SQL (project `GoRide`, `csfllzzastacofsvcdsc`).

Covers the current page at `/trips` ([TripLogsPage.tsx](../apps/fleet/src/components/trips/TripLogsPage.tsx)), its API (`/trips/search`, `/trips/stats`, `/trips/export`), the trip data in `fleet.trips` and `rides.ride_requests`, and a plan for a real Trip Analytics page designed in Google Stitch (project **"roam fleet APP"**).

---

## 0. Verdict

1. **The current page shows wrong numbers.** The "Cash" figure (−$228,256) adds Uber cash as negative and InDrive/Roam cash as positive. "Total Earnings" mixes net and gross amounts and includes cancelled trips. "Avg / Trip" divides that total by completed trips only. The three analysis tabs and Export only cover the 50 rows on the current page, while the KPI cards above them cover the whole period.
2. **About half the spec can't be built from the data you have.** Uber and InDrive only export trips the driver accepted. Requests, matching, arrival, wait time, unmatched demand, rider identity, ratings and complaints never reach Roam Fleet for those trips. Only Roam's own rider app (`rides.ride_requests`) records the full lifecycle, and it has 93 test rows and no completed rides.
3. **The rest can be built now, and it's worth building:** volume and trends, hour × day heatmaps, cancellation analysis, fare economics, area-level geography (Uber gives area names, not GPS) and anomaly detection.
4. **Build the page honestly.** Every section must say which trips it covers ("Map: 461 of 3,205 completed trips have GPS"). Hide a metric when its data doesn't exist. Never show it as 0.
5. **At your scale you don't need Redis, TimescaleDB, PostGIS or nightly rollup tables yet.** You have 3,805 trips and one org. Use one typed `fleet.trip_facts` table kept in sync with `fleet.trips`, plus SQL functions. Add rollups only past about 250k trips. This also fits the Disk IO plan: the current stats endpoint reads every trip's full JSON on each cache miss.

---

## 1. Data reality check

### 1.1 What's in production (2026-10-21)

| Source | Rows | Notes |
|---|---|---|
| `fleet.trips` Uber | 3,159 | 2,624 completed, 532 cancelled, 3 processing. 2025-12-08 → 2026-10-18 |
| `fleet.trips` InDrive | 437 | 372 completed, 65 cancelled |
| `fleet.trips` Roam | 209 | All completed, all cash. These are manual and live entries, not rider-app rides |
| `rides.ride_requests` | 93 | 92 cancelled, 1 scheduled, May–Jun 2026. Test data only, 0 completed |
| `rides.driver_offers` | 25 | 20 expired, 3 declined, 2 superseded |

One organisation. `organization_id` is never null.

### 1.2 Field coverage in `fleet.trips` (everything except the typed columns lives in `payload_json`)

| Field the spec needs | Uber | InDrive | Roam | Consequence |
|---|---|---|---|---|
| `requestTime` | 3,083 / 3,159 | 437 / 437 | 209 / 209 | Hour heatmap works. 76 Uber completed trips have no time. |
| accepted / arrived / started timestamps | **0** | **0** | **0** | **No funnel and no stage timing for platform trips.** |
| Requests that never became trips | not exported | not exported | n/a | **No fulfillment rate and no unmatched demand.** |
| Pickup / dropoff lat-lng | **0** | 303 / 372 | 158 / 209 | GPS map covers about 14% of completed trips |
| `pickupArea` / `dropoffArea` text | 2,548 + 532 | 0 | 0 | Uber geography has to be area-based |
| `fareBreakdown` | 2,554 (surge > 0 on 973, tips on 95) | present, all zero | present, all zero | Fare composition is meaningful for Uber only |
| `tollCharges` > 0 | 266 | 0 | 0 | |
| Promo / discount | 0 | 0 | 0 | **Drop the Discount & Promo section.** |
| `cancellationReason` | 532 / 532 (Uber codes) | 57 / 65 | n/a | Usable once normalised (see §3.3) |
| `cancelledBy` | **0** | 61 / 65 | n/a | Uber's actor has to come from the reason code |
| `tripRating` | 0 | 0 | 0 | **Drop the rating histogram.** |
| Rider id | none | none | none | **Drop repeat-rider, re-request and same-rider duplicate checks.** |
| Complaints linked to a trip | none | none | none | "Flag Issue" doesn't save anything (TA-07) |
| Deadhead (`normalizedEnrouteDistance`) | 2,559 | 0 | 0 | **Spread across trips from CSV period totals, not measured per trip.** Label it "allocated". |
| `distance` > 0 | 2,257 / 2,624 | 356 | 175 | 417 completed trips have 0 km |
| `net_to_driver` | 2,264 | 0 | 0 | InDrive net comes from `indriveNetIncome` |
| `cashCollected` sign | **negative** (908 rows, −$1,116,707.77) | positive (+$465,801.39) | positive (+$422,650.00) | Cause of TA-02 |

Distribution of completed trips: median fare $987.68, p99 $3,608.90, max $25,000. Median 35 min and 9.17 km. Currency is JMD.

### 1.3 Spec sections mapped to what's buildable

| Spec item | Decision | Why |
|---|---|---|
| A. Total / completed trips, cancellation rate, avg fare, fare per km, avg distance and duration | **Build now** | Data exists |
| A. Requested trips, fulfillment rate, avg wait time | **Roam-native only** | Hide for platform trips |
| A. Sparkline + Δ vs prior period | **Build now** | |
| B. Daily volume, moving average, prior-period overlay, day of week, hour × day heatmap | **Build now** | Plot completed vs cancelled. "Requested vs completed" isn't possible. |
| B. Surge impact | **Build, Uber only** | Surge share per hour from `fareBreakdown.surge`. Promo half dropped. |
| C. Funnel, time per stage, unmatched reasons | **Roam-native only, behind a flag** | Source is `rides.ride_requests` + `driver_offers`. Shows an empty state until real volume exists. |
| D. Cancellation by actor, reasons, trend, heatmap, top drivers | **Build now** | After reason normalisation (§3.3) |
| D. Re-request rate | **Drop** | No rider identity |
| E. Fare breakdown | **Build, Uber only, labelled** | |
| E. Revenue vs cost per trip | **Build later, read-only from existing engines** | Cost comes from fuel cost per km and Ledgers. Don't invent a new cost model (§4.6). |
| E. Fare histogram, fare per km by hour and platform | **Build now** | |
| E. Discount & promo | **Drop** | No data |
| F. Pickup / dropoff heatmap | **Build with a coverage label** | InDrive + Roam GPS only |
| F. Popular routes, zone matrix | **Build, area-based** | Uber `pickupArea → dropoffArea`, coordinate trips mapped to the same zones |
| F. Deadhead | **Build, Uber, labelled "allocated"** | |
| F. Long-trip alerts | **Build now** | |
| G. Ratings, complaints, repeat rate | **Drop** for now | No data |
| G. Completion time vs estimate, wait distribution | **Roam-native only** | `duration_estimate_minutes`, `eta_pickup_seconds_estimate` |
| H. Anomalies | **Build now** | See §3.5. Most valuable section for your data today. |
| I. Filters, comparison, export | **Build now** | |

---

## 2. Findings on the current page

Severity: **C** = shows wrong money or wrong conclusions, **H** = misleads the operator, **M** = broken or misleading behaviour, **L** = polish.

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| TA-01 | C | Cancellation Analysis, Route Analytics, Data Integrity, the search box and Export Report all run on `trips`, which is the current page of at most 50 rows. The KPI cards above them cover the whole filtered period, so the same screen mixes two different populations. The server already has a full-set export (`api.exportTripsFiltered`, capped at 10k), but nothing in the fleet app calls it. | [TripLogsPage.tsx:184](../apps/fleet/src/components/trips/TripLogsPage.tsx#L184), [:368](../apps/fleet/src/components/trips/TripLogsPage.tsx#L368), [:422](../apps/fleet/src/components/trips/TripLogsPage.tsx#L422), [:776-786](../apps/fleet/src/components/trips/TripLogsPage.tsx#L776-L786) |
| TA-02 | C | **"Cash −$228,256.38" is nonsense.** `/trips/stats` sums `cashCollected` across platforms with opposite sign conventions: Uber −$1,116,707.77, InDrive +$465,801.39, Roam +$422,650.00. "Payout" is then `earnings − cash`, which turns into +$3.83M. | [register_residual_monolith_routes.tsx:1247](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L1247), [TripStatsCard.tsx:145-146](../apps/fleet/src/components/trips/TripStatsCard.tsx#L145-L146) |
| TA-03 | C | "Total Earnings" uses `net_to_driver`/`indriveNetIncome` where known and gross `amount` otherwise, so one number mixes two definitions. It also includes cancelled trips. "Avg / Trip" divides it by completed trips only, so the average is inflated. `avgAmount` (completed-only gross) is computed but never shown. | [register_residual_monolith_routes.tsx:1245](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L1245), [:1267](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L1267) |
| TA-04 | H | The Advanced Filters `minEarnings`, `maxEarnings`, `minDistance`, `hasTip` and `hasSurge` are sent to the server, which ignores all five in search, stats and export. The filter looks applied but nothing changes. | [TripLogsPage.tsx:130-134](../apps/fleet/src/components/trips/TripLogsPage.tsx#L130-L134), [trip_search_filters.ts:36-45](../supabase/functions/_fleet-server/trip_search_filters.ts#L36-L45) |
| TA-05 | H | Cancellation actor is a guess: a reason containing "driver" or "car" counts as driver, and everything else counts as rider. In production, `cancelledBy` is null on 536 of 597 cancellations. The 72 `delivery_failed` rows are counted as rider cancellations. "Estimated loss" = cancelled count × average completed fare, which treats every cancellation as lost revenue. | [CancellationAnalysis.tsx:30-36](../apps/fleet/src/components/trips/CancellationAnalysis.tsx#L30-L36), [:24-25](../apps/fleet/src/components/trips/CancellationAnalysis.tsx#L24-L25) |
| TA-06 | H | `/trips/stats` loads every matching trip row (full `value`, including route polylines) in 1,000-row pages up to 100k, then aggregates in the edge function. It runs on every cache miss (5-min TTL) and for every filter combination. The new page will make many more of these queries, so it must not copy this pattern (see the Supabase Disk IO plan). | [register_residual_monolith_routes.tsx:1158-1265](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L1158-L1265) |
| TA-07 | M | **"Flag Issue" is fake.** It waits 500 ms, shows a success toast saying a ticket was created, and saves nothing. "Contact Driver" only shows a toast. | [TripLogsPage.tsx:248-268](../apps/fleet/src/components/trips/TripLogsPage.tsx#L248-L268) |
| TA-08 | M | An analytics page offers Edit and Delete on trips that feed settlements, tolls and Ledgers. Edit saves the trip again with the same id. Delete leaves dependent rows behind (see the toll usage orphan events memory: `toll_usage` events outlive their ledger row). | [TripLogsPage.tsx:321-349](../apps/fleet/src/components/trips/TripLogsPage.tsx#L321-L349), [:730-735](../apps/fleet/src/components/trips/TripLogsPage.tsx#L730-L735) |
| TA-09 | M | The service-line scope is applied in the browser after the server returns a page, so a page can come back short and `hasMore` (`length === 50`) can be wrong. | [TripLogsPage.tsx:184-185](../apps/fleet/src/components/trips/TripLogsPage.tsx#L184-L185) |
| TA-10 | M | Date presets: there's no Last 7 / Last 30 days and no prior-period comparison. The default is **All Time**, the most expensive query. The "WEEK – Select week period" picker and "This Week" overlap. | [TripLogsPage.tsx:76](../apps/fleet/src/components/trips/TripLogsPage.tsx#L76), [TripFilters.tsx](../apps/fleet/src/components/trips/TripFilters.tsx) |
| TA-11 | L | Times are formatted in the browser's timezone, not `America/Jamaica`. In 10 completed trips the `requestTime` date doesn't match the `date` column, so a trip can land in a different day or hour bucket depending on which field you read. | [TripLogsPage.tsx:550-553](../apps/fleet/src/components/trips/TripLogsPage.tsx#L550-L553) |
| TA-12 | L | The "Eff." column only has data for Uber, so it shows "–" for InDrive and Roam. Obvious outliers aren't flagged anywhere: a Roam trip of 8.4 km, 80 min and $5,300 sits at the top of the list. There are 13 completed trips over $5,000 (max $25,000). | screenshot, §3.5 |
| TA-13 | L | The subtitle says "Real-time trip analytics", but platform trips arrive through CSV imports. The banner also calls the page "soft-decommissioned", which contradicts the page title. | [vocabulary.ts:75-76](../apps/fleet/src/utils/vocabulary.ts#L75-L76), [TripLogsPage.tsx:50-58](../apps/fleet/src/components/trips/TripLogsPage.tsx#L50-L58) |
| TA-14 | L | The platform filter only offers Uber, InDrive and Roam, which matches the data. "Roam" also matches the legacy `GoRide` value. Keep this mapping in the new page. | [trip_search_filters.ts:88-94](../supabase/functions/_fleet-server/trip_search_filters.ts#L88-L94) |

**What to do with the current page:** keep it, renamed **Trip Logs** (ops: manual trips, maps, edit, integrity). Build Trip Analytics as a **new, additive page** and don't remove views you already use. Fix TA-02, TA-03 and TA-07 on the current page anyway, because people read those numbers today.

---

## 3. Metric definitions (single source of truth)

These are the rules the API, the UI and the tests all follow. Put them in one shared module, e.g. `packages/finance-core/src/tripAnalyticsDefinitions.ts`. Edge functions can't import shared packages directly, so mirror it into `_fleet-server` with a "Keep in sync" header and a Deno drift test, the same pattern you already use.

### 3.1 Population and time

- **Trip day and hour** = `requestTime` converted to `America/Jamaica` (UTC−5, no daylight saving). Fall back to `date` at 12:00 only when `requestTime` is missing, and count those trips as "time unknown" (they're excluded from the hour heatmap and shown in the coverage strip).
- **Period filter** uses that local trip day. It does not use `created_at` (the import time).
- **Prior period** = a window of the same length ending the day before the current start. For "This month", use the same days of the previous month.
- **Status buckets:** `Completed`; `Cancelled`; `In progress` = `Processing` / `In Progress` / `In_Progress` / `started`. In-progress trips are counted in total trips but excluded from every rate's numerator and denominator.

### 3.2 Core KPIs (completed trips unless stated)

| KPI | Formula | Notes |
|---|---|---|
| Trips completed | count(status = Completed) | |
| Cancellation rate | cancelled / (completed + cancelled) | Show the split by actor (§3.3) |
| Gross fares | Σ `amount` over completed | Label it **"Gross fares (platform-reported)"**. This is not profit. |
| Fare + cancel fees | Gross fares + Σ `amount` over cancelled | Uber cancelled `amount` = $8,152.02 of cancellation fees |
| Avg fare | Gross fares / completed | Use the median in the subtitle, because fares are heavily skewed |
| Fare per km | Σ amount / Σ distance over completed trips with distance > 0 | Show "n trips with distance" |
| Avg distance, avg duration | Mean over trips where the value > 0 | Never average in the zeros. Show n. |
| Cash share | cash-paid completed trips / completed | **Use `payment_method`, not the sign of `cashCollected`** |
| Cash collected | Σ abs(`cashCollected`) per platform convention | See 3.4 |
| Platform fee | Uber: amount − `net_to_driver` when both known. InDrive: `indriveServiceFee` | Shown per platform, never blended with gross |

### 3.3 Cancellation normalisation (fixes TA-05)

Map the existing values to `cancel_actor` and `cancel_reason_code`:

| Raw `cancellationReason` / `uberTripStatus` / `cancelledBy` | actor | reason code |
|---|---|---|
| `rider_cancelled` | rider | `rider_cancelled` |
| `driver_cancelled` | driver | `driver_cancelled` |
| `delivery_failed` | **delivery** (own bucket) | `delivery_failed` |
| `Other (Driver)` or `cancelledBy = driver` | driver | `other` |
| `Other (Rider)` or `cancelledBy = rider` | rider | `other` |
| `Wait time too long` | use `cancelledBy`, else unknown | `wait_too_long` |
| null | **unknown** | `unknown` |
| `ride_requests.cancelled_by = system` / offer expiry | system | `unmatched` / `timeout` |

The actor buckets must add up to the cancelled count, with **unknown** shown as its own slice. The 72 `delivery_failed` rows are Uber delivery jobs with `service_line = rideshare`, so treat them as a known data issue. They also need a decision: are they rideshare? (Q2.)

### 3.4 Cash sign (fixes TA-02)

Uber's `payments_transaction.csv` reports cash the driver kept as a negative balance movement. InDrive and Roam store it as a positive amount collected. Normalise to `cash_collected_abs = abs(cashCollected)` in `trip_facts`. Add a test that, per platform, Σ `cash_collected_abs` ≤ Σ amount for cash trips.

> Don't change how `cashCollected` is stored. Settlement and recon code reads it with the current signs (see the Financial integrity audit memory). Normalise only in the analytics projection.

### 3.5 Anomaly rules (each one is a SQL predicate on `trip_facts`)

Counts are completed trips in production today.

| Rule | Predicate (defaults go in a settings row) | Today |
|---|---|---|
| Zero fare | amount = 0 | 5 |
| Zero distance | distance is null or 0 | 417 |
| Very long distance | distance > 100 km | 4 |
| Very long duration | duration > 180 min | 7 |
| Fare outlier | amount > 5,000 **or** amount > p99 × 1.5 for that platform | 13 (> 5,000) |
| Fare per km outlier | amount / distance > 500 | 41 |
| Speed implausible | distance / (duration/60) > 120 km/h or < 3 km/h with distance > 2 | to measure |
| Duplicate | same driver + same `requestTime` | 7 groups |
| Missing time | no `requestTime` | 76 |
| Missing vehicle | no vehicle | 76 |
| GPS endpoints equal | pickup ≈ dropoff (< 50 m) with fare > 2× median | to measure |

Every anomaly row links to the trip details. A reviewer can **dismiss** an anomaly with a reason, which needs a small `fleet.trip_anomaly_reviews` table. Otherwise the feed fills up with the same items forever.

---

## 4. Architecture

### 4.1 Shape

```
fleet.trips (source of truth, unchanged)
   │  AFTER INSERT/UPDATE/DELETE trigger  (+ one-off backfill)
   ▼
fleet.trip_facts  (typed, slim, one row per trip, no polylines)
   │  SQL functions (STABLE, SECURITY INVOKER, org from JWT)
   ▼
fleet-core route  POST /trips/analytics   ← same auth + filter parity as /trips/search
   ▼
useTripAnalytics() hook (TanStack Query, URL-synced filters)
   ▼
TripAnalytics page (new) — sections in §5
```

`rides.ride_requests` + `rides.driver_offers` feed **only** the Roam-native funnel section, through a separate function.

### 4.2 `fleet.trip_facts` (suggested columns)

```
trip_id text PK  (= fleet.trips.id), organization_id, driver_id, vehicle_id,
platform text (GoRide→Roam), service_line, service_category, is_manual bool, is_live bool,
status_bucket text  ('completed'|'cancelled'|'in_progress'),
request_at timestamptz null, local_date date, local_hour smallint null, local_dow smallint null,
amount numeric, net_to_driver numeric null, platform_fee numeric null,
cash_collected_abs numeric null, payment_method text,
distance_km numeric null, duration_min numeric null,
fare_base, fare_surge, fare_tips, fare_wait, fare_airport, fare_taxes, tolls numeric null,
has_surge bool, has_tip bool,
cancel_actor text null, cancel_reason_code text null, cancellation_fee numeric null,
pickup_lat, pickup_lng, dropoff_lat, dropoff_lng double precision null,
pickup_zone text null, dropoff_zone text null,
deadhead_km_allocated numeric null,
anomaly_flags text[]  -- computed by the same trigger from §3.5
updated_at timestamptz
```

Indexes: `(organization_id, local_date)`, `(organization_id, driver_id, local_date)`, `(organization_id, vehicle_id, local_date)`, `(organization_id, status_bucket, local_date)`, plus a GIN index on `anomaly_flags`.

Why a trigger-maintained table and not generated columns or a view:
- Converting `requestTime` text to `timestamptz` and then to local time isn't immutable, so a generated column can't do it.
- A view would still read the full `payload_json`, which is exactly the TA-06 cost.
- The trigger also handles edits and deletes, so there are no stale rollups. Lesson from the settlement audit: "an SQL check is only as good as the writers that maintain its input." Every writer to `fleet.trips` goes through the trigger, so none of them can skip it.

Add a parity check, `trip_facts` count vs `fleet.trips` count per org, and Σ amount vs Σ amount. Run it as a recon control.

### 4.3 Aggregation

**Don't build `daily_trip_stats`, `hourly_trip_stats` or `zone_route_stats` yet.** With about 4k rows, SQL over `trip_facts` returns in milliseconds and can never drift from the source. Add rollups when either:
- any analytics function's p95 goes over 300 ms, or
- `trip_facts` passes about 250k rows.

When you do add them, refresh them incrementally from the same trigger (dirty-day queue) with pg_cron, not as a full nightly rebuild.

**Redis, TimescaleDB and PostGIS aren't needed.** Your edge server already has a cache module (`cache.getCache` / `setCache` with a version bump). Reuse it with a 5-min TTL, keyed by org + filters + `trip_facts` max(`updated_at`).

### 4.4 SQL functions (one per section, all taking the same filter record)

```
fleet.trip_analytics_kpis(f)          → current + prior period KPIs + 7-point sparklines
fleet.trip_analytics_volume(f, grain) → [{bucket, completed, cancelled, in_progress}] + prior-period series
fleet.trip_analytics_heatmap(f, measure) → 7×24 grid  (measure: completed|cancelled|surge_share|fare_per_km)
fleet.trip_analytics_cancellations(f) → by_actor, by_reason, trend, heatmap, top_drivers (min n=20)
fleet.trip_analytics_economics(f)     → fare composition (Uber), histogram bins, fare/km by hour & platform, fee by platform, cash vs digital
fleet.trip_analytics_geo(f, kind)     → grid cells (round 3 dp) with counts, top areas, zone matrix, deadhead
fleet.trip_analytics_anomalies(f)     → counts per rule + paged feed
fleet.trip_analytics_coverage(f)      → per-platform counts of trips with time, GPS, distance, fare breakdown
fleet.roam_ride_funnel(f)             → requested → offered → accepted → arrived → started → completed + stage medians + unmatched reasons
```

Security rules (see the Supabase RLS exposure audit memory):
- Create the functions in schema `fleet`. Don't put them in `public`, and don't make them callable by `anon`.
- `REVOKE EXECUTE ... FROM anon, public`.
- Call them only from the edge route with the user's JWT. Org scope comes from the claim, **never** from a request parameter. Keep the existing `organizationId` override only for super admins.

### 4.5 API

One route: `POST /trips/analytics` with body `{ filters, sections: ['kpis','volume',...] }`. It returns `{ coverage, kpis, volume, ... , generatedAt, cacheHit }`.
- Filters: `startDate, endDate, compare, platform[], serviceLine, driverIds[], vehicleIds[], status, paymentMethod, zone, isManual, hour?, dow?`.
- **Filter parity:** extend `describeTripFilters` / `trip_search_filters.ts` so `/trips/search`, `/trips/export` and the analytics route share one predicate builder. Add a parity test so the table under the charts always shows the same trips as the charts.
- The trip table keeps using `/trips/search` with keyset paging. Wire the existing `/trips/export` for "Export filtered trips (CSV, up to 10,000)".
- Add `minEarnings / maxEarnings / minDistance / hasTip / hasSurge` to the shared builder (fixes TA-04), using `trip_facts` columns.

### 4.6 Money boundaries

- Trip Analytics shows **operational fare metrics**. It is not the books. Every money card is labelled "platform-reported". Add a footer line: *"Ledger net for this period: $X → open Ledgers"*, read from the existing Ledgers source, so the two numbers can be compared rather than merged.
- **Revenue vs cost per trip** (phase 6): cost = fuel cost per km from the fuel engine × trip km (or allocated deadhead + trip km), plus the platform fee (§3.2). Read-only. Don't add a cost model to finance code, and don't change any finance engine.
- Keep the Statement Summary toll-refund issue (see the Ledgers audit memory) out of this page. Tolls here are trip-level `tollCharges` only.

### 4.7 Geography

- Zones: create `fleet.trip_zones (id, name, parish, centroid_lat, centroid_lng, aliases text[])`, seeded from distinct Uber `pickupArea` values (normalise "Kingston", "Kingston, Jamaica", "Jamaica"). Coordinate trips get the nearest centroid within 3 km.
- **Don't use the H3 code** (H3 spatial index memory: the path is dead code and the resolution knob is a footgun).
- Heatmap: `leaflet` + `leaflet.heat` are already installed. The server returns grid cells rounded to 3 decimals with counts, never raw points.
- Always show "GPS on N of M trips" on the map card. Uber trips appear in the area list and zone matrix, not on the heat layer.

### 4.8 Front end

- Charts: `recharts` is already installed. **Pin its version** in [apps/fleet/package.json](../apps/fleet/package.json); it's currently `"*"`. Don't add Nivo or ECharts. Build the 7×24 heatmap as a CSS grid (the existing [CancellationAnalysis.tsx](../apps/fleet/src/components/trips/CancellationAnalysis.tsx) already has one), and the funnel as horizontal bars.
- Structure: copy the Fuel, Driver and Vehicle Analytics layout. One hook (`useTripAnalytics`) plus components `TripAnalyticsToolbar`, `TripAnalyticsKpiGrid`, `TripAnalyticsCoverageStrip`, `TripAnalyticsVolume`, `TripAnalyticsHeatmap`, `TripAnalyticsCancellations`, `TripAnalyticsEconomics`, `TripAnalyticsGeo`, `TripAnalyticsAnomalies`, `TripAnalyticsTable`, `RoamRideFunnel`.
- **Don't copy the `fetchAllPeriodTrips` pattern** from `useDriverAnalytics` / `useVehicleAnalytics`, which downloads every trip into the browser. This page uses server aggregates only.
- Filters live in the URL (`?from=&to=&cmp=1&platform=Uber&driver=…`) so a view can be shared and the back button works.
- Follow the FuelAnalytics state pattern: **load error ≠ zero data ≠ no data in period.** Each one gets its own message.
- Clicking a heatmap cell, a bar or an anomaly count filters the trip table and scrolls to it. A chip such as "Hour: Fri 17:00 ×" shows the drill-down so it can be cleared.

---

## 5. UI/UX specification

### 5.1 Information architecture

`Analytics → Trip Analytics` (new). `Fleet Operations → Trip Logs` (the current page, renamed). The analytics page has no edit, delete or manual-trip actions; "Open in Trip Logs" covers ops actions.

### 5.2 Page layout (desktop, top to bottom)

1. **Header:** "Trip Analytics", with the subtitle "Trips imported from Uber and InDrive, plus Roam manual and live trips." Right side: Last updated time · Refresh · Export.
2. **Toolbar (sticky):** presets `Today · Yesterday · Last 7 days · Last 30 days · This month · Custom` + a "Compare to previous period" toggle (on by default). Filters: Platform (multi) · Driver · Vehicle · Status · Payment (Cash / Digital) · Zone · Type (Platform / Manual). Default range: **Last 30 days**, not All Time.
3. **Coverage strip** (one line, muted): "1,042 trips · Uber 870 · InDrive 112 · Roam 60 · GPS on 14% · time missing on 3". Click it to see per-field coverage.
4. **KPI row:** 8 cards in a 4 × 2 grid. Each card has a label, value, Δ vs prior (green or red, **with the arrow direction defined per KPI**, since a higher cancellation rate is bad), a 7-point sparkline and an info tooltip with the formula from §3.2.
   Cards: Trips completed · Cancellation rate (rider / driver / other split under it) · Gross fares · Avg fare (median under it) · Fare per km · Avg distance · Avg duration · Cash share.
5. **Demand:** daily line of completed + cancelled, 7-day moving average, and a dashed prior-period line. Next to it, a day-of-week column chart with weekends tinted. Full width below: a **7 × 24 heatmap** with a measure switch (Trips / Cancellations / Surge share / Fare per km).
6. **Cancellations:** donut by actor (rider, driver, delivery, unknown) · horizontal bars by reason · cancellation-rate trend with spike markers (> mean + 2σ) · top drivers by cancel rate (min 20 trips), each linking to Driver Analytics.
7. **Trip economics:** fare histogram with p50 and p99 markers, where outliers click through to anomalies · Uber fare composition stacked bar (base, surge, tips, wait, airport, taxes, tolls) · fare per km by hour line, split by platform · platform fee table (gross, fee, net, fee %) · cash vs digital by platform.
8. **Where trips happen:** map (pickup / dropoff toggle, with a "GPS on N of M" badge) · top 10 pickup areas · top 10 area → area routes (trips, avg fare, avg duration) · zone matrix (top 8 × 8, cells show trips, hover shows avg fare and duration) · Uber deadhead, allocated, km per trip.
9. **Anomalies:** a card per rule with a count, plus a feed (trip, rule, value, driver, date, Review / Dismiss). Rule thresholds in a settings popover.
10. **Roam app requests (funnel):** horizontal step bars Requested → Offered → Accepted → Arrived → Started → Completed, with the drop-off count and conversion % on each step, median time per stage and unmatched reasons. **Shows an empty state until `rides.ride_requests` has completed rides in range:** "Roam rider app requests will appear here. Uber and InDrive don't share request or matching data."
11. **Trips table:** server-paginated and sortable. Columns: Time, Driver / vehicle, Route (area → area), km, min, Fare, Payment, Status (+ cancel actor), anomaly badges. Clicking a row opens the existing `TripDetailsDialog` in a side drawer.

### 5.3 States

| State | Behaviour |
|---|---|
| Loading | Skeleton per section. Sections load independently. |
| Error | Section-level error card with Retry. Never show 0. |
| No trips in range | One page-level empty state with "Try Last 30 days". |
| Partial coverage | The section renders with an amber coverage badge. |
| Metric not available for this platform | The card shows "—" with the tooltip "Uber doesn't export X". |
| Stale cache | "Updated 4 min ago" plus Refresh. |

### 5.4 Mobile (390 px)

KPI cards in 2 columns with no sparkline. Charts are full width. The heatmap scrolls horizontally inside its card (the page itself never scrolls horizontally) with the day labels sticky. Filters go in a bottom sheet. The table becomes cards (reuse the current mobile card). Touch targets are at least 44 px.

### 5.5 Accessibility and copy

- Colour is never the only signal: Δ arrows plus text, and the heatmap has a legend with values.
- Every chart has a "View as table" toggle.
- Currency: `J$` with thousands separators and 0 decimals for totals, 2 decimals for per-trip values.
- Use the same terms everywhere: "Gross fares", "Cancellation rate", "Rider-cancelled". Never say "Earnings" for gross.

---

## 6. Google Stitch (project "roam fleet APP")

> The Stitch MCP wasn't connected in this session, so no screens were generated. Paste the prompts below into the **roam fleet APP** project. Put exports in `docs/stitch/roam-fleet-app/html/` with a README table (screen, file, Stitch screen id), the same convention as [docs/stitch/roam-rush-admin-design/README.md](stitch/roam-rush-admin-design/README.md). **Never put them under an app's `public/` folder.**

**Shared context (paste first):**
> Roam Fleet admin web app, light theme, matching the existing Fuel Analytics and Driver Analytics screens in this project: white cards, slate text, indigo primary, emerald good / rose bad, rounded-xl cards, top navigation. Jamaican fleet operator; currency J$. Data comes from Uber and InDrive CSV imports plus Roam manual trips. Every money number is labelled "platform-reported".

**Screen 1: Trip Analytics, desktop 1440.**
> Build "Trip Analytics" following this order: sticky toolbar (Last 7 / Last 30 / This month / Custom presets, compare-to-previous toggle, Platform, Driver, Vehicle, Status, Payment, Zone filters); muted one-line coverage strip "1,042 trips · Uber 870 · InDrive 112 · Roam 60 · GPS on 14%"; 4×2 KPI cards (Trips completed, Cancellation rate with rider/driver/other split, Gross fares, Avg fare with median, Fare per km, Avg distance, Avg duration, Cash share), each with Δ vs previous period and a 7-point sparkline; Demand section with daily completed-vs-cancelled line + dashed prior period and a day-of-week column chart; full-width 7×24 heatmap with a measure switch; Cancellations section (donut by actor, reasons bar, rate trend with spike dots, top drivers table); Trip economics (fare histogram with p50/p99 markers, Uber fare composition stacked bar, fee-by-platform table); Where trips happen (map with "GPS on 461 of 3,205" badge, top areas list, area→area routes table, 8×8 zone matrix); Anomalies (rule cards with counts + feed with Review/Dismiss); Roam app requests funnel shown in its empty state; trips table at the bottom.

**Screen 2: the same page at 390 px.** 2-column KPIs without sparklines, filters in a bottom sheet, horizontally scrolling heatmap card, trip cards instead of a table.

**Screen 3: Funnel with data.** Roam app requests: horizontal step bars Requested 120 → Offered 112 → Accepted 96 → Arrived 90 → Started 88 → Completed 85, drop-off and conversion % per step, median minutes per stage, unmatched reasons list (no driver nearby, all declined, offer expired).

**Screen 4: States.** Section error with Retry, page empty state, and a KPI card showing "—" with a tooltip reading "Uber doesn't export wait time".

**Screen 5: Anomaly review drawer.** Trip summary, which rule fired and why (value vs threshold), mini map if there's GPS, and actions: Open in Trip Logs, Dismiss with reason, Keep flagged.

Wire the React components from the chosen HTML exports. Treat Stitch output as layout reference only: the real data, states and filters come from §4–5.

---

## 7. Build sequence and acceptance gates

Each phase ends with a check you can run. "Done" means the gate passes, not that the code exists.

| # | Phase | Scope | Gate |
|---|---|---|---|
| P0 | Stop the wrong numbers (current page) | TA-02 abs cash per platform; TA-03 show gross completed-only + avg fare from `avgAmount`; TA-07 remove the fake Flag Issue / Contact Driver or wire them for real; TA-01 label tabs "This page (50 trips)" until the new page replaces them | Cash KPI ≥ 0; Avg fare = Σ completed amount / completed (spot-check in SQL) |
| P1 | `trip_facts` | Table + trigger + backfill + §3.3 / §3.4 normalisation + anomaly flags + parity control | Row count and Σ amount match `fleet.trips` exactly; actor buckets sum to cancelled (597); `cash_collected_abs` ≥ 0 |
| P2 | Definitions + API | Shared definitions module + edge mirror + drift test; `POST /trips/analytics` (kpis, volume, coverage); filter-parity test with `/trips/search` | Completed for the last 30 days via the API = SQL count; parity test green; fleet `tsc` stays at baseline (500) |
| P3 | Page shell + KPIs + demand | New route + nav entry, toolbar with URL state, coverage strip, KPI grid with prior period, volume, day of week | Changing a filter changes KPIs and table identically; error state ≠ 0 |
| P4 | Heatmap + cancellations | 7×24 with measures, click-to-filter; cancellation section | Σ heatmap cells = trips with time known; donut Σ = cancelled |
| P5 | Economics + anomalies | Histogram, Uber composition, fee table, anomaly rules + feed + dismiss table | Uber composition Σ = Uber gross within 1% (or show the gap); anomaly counts match §3.5 SQL |
| P6 | Geography | Zone table + seed, map grid, areas, routes, matrix, deadhead labelled allocated | Map badge N matches the coverage function |
| P7 | Table + export | `/trips/search` table under charts, drill-down chips, full filtered export | Export row count = table total (≤ 10k) |
| P8 | Roam-native funnel (flagged) | `fleet.roam_ride_funnel`, section behind a flag, empty state | On test data: stages decrease monotonically; Σ drop-offs = requested − completed |
| P9 | Cost per trip (optional) | Fuel cost per km × km + platform fee, read-only | Matches Fuel Analytics cost per km for the same period |

Remove the old tabs from Trip Logs only after P7, and only once you've confirmed you don't want them kept.

---

## 8. Test plan (identities that must hold)

- `completed + cancelled + in_progress = total` for every filter combination.
- Σ daily `completed` over the range = KPI `completed`.
- Σ heatmap cells (time known) + time-unknown count = total.
- Σ cancellation actor buckets = cancelled. Σ reason buckets = cancelled.
- Σ by-platform gross = gross.
- Uber fare composition Σ vs Uber gross: either within tolerance or the gap is shown on screen.
- Filter parity: for 20 random filter sets, `/trips/search` total = analytics completed + cancelled + in progress.
- Prior-period window has the same length and ends at `start − 1 day`.
- Timezone: a trip at 2026-03-01T04:30Z lands on Feb 28, 23:00 local.
- Security: `anon` calling any `fleet.trip_analytics_*` function gets permission denied, and a user from org A can't read org B.
- Remember that vitest strips types, so gate on `tsc` as well as tests.

---

## 9. Open questions (yours to decide)

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Should Trip Analytics replace the current `/trips` page, or sit beside it as a new page? | Beside it. Current page renamed Trip Logs. |
| Q2 | Are Uber `delivery_failed` jobs (72) and the 3 `courier` trips part of rideshare analytics? | Exclude them from rates and show them as a separate "Delivery" bucket |
| Q3 | Fare outlier threshold: fixed J$5,000 or per-platform p99 × 1.5? | Per-platform p99 × 1.5, with a fixed floor of 5,000 |
| Q4 | Should Roam manual trips (209, all cash) count in the KPIs by default? | Yes, with a Type filter to exclude them |
| Q5 | Which money number belongs on the KPI row, gross fares or net to driver/fleet? | Gross on the card, net per platform in the economics table, Ledgers figure in the footer |
| Q6 | Should Flag Issue create a real record (needs a `trip_issues` table), or be removed? | Remove until there's a review workflow |
