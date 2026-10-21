# Trip Analytics: what's left

**Rev 2 · 2026-10-21** · Checked against the code and production. Rev 1 (the full spec and build plan) is in git history.

## Done and verified

- **Data layer is live in production.** `fleet.trip_facts` has 3,806 rows, matching `fleet.trips` by count and by total amount (J$3,666,149.12). It's kept in sync by the `trip_facts_sync` trigger.
- **Cancellations are classified correctly.** The actor buckets add up to the cancelled total: 460 rider + 61 driver + 72 delivery + 4 unknown = 597.
- **No negative cash values remain.**
- **The API is deployed and locked down.** The fleet-core v99 bundle contains `/trips/analytics`. The SQL functions are callable only by the service role (`anon` and `authenticated` have no execute rights), and the new tables have RLS on.
- **The numbers add up.**
  - Completed trips for the last 30 days: 267 from the API, 267 from raw SQL.
  - Heatmap: 3,655 trips with a known time + 76 without = 3,731 rideshare trips.
  - The prior-period window is correct.
- **Search, stats, export and analytics all use the same filter** (`fleet.trip_facts_matching`), so the charts and the table can't disagree.
- **All P0 fixes are in on the old page.** Cash, gross fares and the fake Flag Issue are fixed, and it's now Trip Logs with a full filtered export.
- **The new page is built.** Trip Analytics is routed, in the nav, and has its Stitch exports in `docs/stitch/roam-fleet-app/`.
- **Checks pass.**
  - Definitions tests: 9 of 9 pass.
  - Fleet `tsc`: 496 errors, under the 500 baseline.
  - `recharts` is pinned to 3.8.1.

## Open

| # | Sev | Item | Fix |
|---|---|---|---|
| R1 | **High** | **65 test trips are in production data.** `probe-trip-0` to `probe-trip-64` are dated 2026-08-24, marked completed, J$100 each, with no time and no vehicle. They count in every KPI. They make the 65-trip spike on Aug 24. They're 65 of the 76 "missing time" and 76 "missing vehicle" anomalies. | Delete them from `fleet.trips` after checking nothing references them; the trigger removes the matching facts rows. Then make sure whatever wrote them can't write to production again. |
| R2 | **High** | **The Roam funnel can never show unmatched demand.** It filters `rides.ride_requests` by `organization_id`, but that column is only stamped when a driver is assigned or the ride completes. All 93 current rows have a null org. Requests that never get a driver will never show up for any fleet, so "Requested" can't be higher than "Accepted". | Stamp `organization_id` when the request is created (from the market/fleet the rider is booking into), or attribute requests through `driver_offers` to fleet drivers. Keep the funnel flag off until this is fixed. |
| R3 | **High** | **Retry on a failed section doesn't actually retry.** The server caches the whole response for 5 minutes, failed sections included ([trip_analytics_routes.ts:120](../supabase/functions/_fleet-server/trip_analytics_routes.ts#L120)). The Retry button only invalidates the browser query and sends `refresh: false` ([useTripAnalytics.ts:16](../apps/fleet/src/hooks/useTripAnalytics.ts#L16)), so it gets the same cached error back for up to 5 minutes. | Skip `setCache` when `errors` isn't empty, and have Retry send `refresh: true`. |
| R4 | **High** | **Migration history doesn't match the repo.** Production records `20261021192724 trip_analytics_public_api`, but the local file is `20261021203000`. `20261021190000_trip_analytics_facts.sql` isn't in production history at all, even though its objects exist. Replaying migrations on a fresh branch would break or double-apply. | Rename the local public-API file to `20261021192724_…`, and run `supabase migration repair --status applied 20261021190000`. Then commit. |
| R5 | Medium | **Any signed-in org user can change anomaly thresholds or dismiss anomalies.** `/trips/analytics/review` and `/trips/analytics/settings` only use `requireAuth({ requireOrg: true })` ([trip_analytics_routes.ts:126](../supabase/functions/_fleet-server/trip_analytics_routes.ts#L126), [:155](../supabase/functions/_fleet-server/trip_analytics_routes.ts#L155)). Trip delete in the same file uses `requirePermission('transactions.edit')`. | Add `requirePermission(...)` to both routes (e.g. `transactions.edit`). |
| R6 | Medium | **"Review" on an anomaly opens an empty dialog** unless that trip happens to be on the current table page ([TripAnalyticsPage.tsx:185-188](../apps/fleet/src/components/trips/analytics/TripAnalyticsPage.tsx#L185-L188)). It falls back to `{ id }` only. | Fetch the trip by id before opening the dialog. |
| R7 | Medium | **The fare-per-km rule is mostly noise.** It fires 48 times, mainly on Uber minimum fares for 1–2 km trips (e.g. 1.11 km for J$808.94). Real problems get buried. | Only apply it when `distance_km ≥ 2`, or compare against each platform's minimum fare. |
| R8 | Medium | **Trip Logs now hides 75 trips.** `buildTripAnalyticsFilter` defaults `population` to `rideshare`, so the 72 Uber `delivery_failed` jobs and 3 courier trips no longer appear on Trip Logs. It's an ops list, so it shouldn't hide anything. | Send `population: 'all'` from [TripLogsPage.tsx](../apps/fleet/src/components/trips/TripLogsPage.tsx). |
| R9 | Low | **The table's anomaly badges can disagree with the Anomalies section.** The trigger stamps `anomaly_flags` using fixed thresholds, while the Anomalies section reads thresholds from settings at query time. Rule names also differ (`fare_outlier_floor` vs `fare_outlier`). | Drive the badges from the same query-time rules, or re-flag all trips when settings change. |
| R10 | Low | **The cost card overstates kilometres.** It computes `avgDistance × completed`, but `avgDistance` only averages trips with distance, while `completed` includes the zero-distance ones ([TripAnalyticsPage.tsx:192-194](../apps/fleet/src/components/trips/analytics/TripAnalyticsPage.tsx#L192-L194)). | Return Σ distance from `trip_kpi_block` and use that. |
| R11 | Low | **The Data Integrity tab was removed with no replacement.** It showed how accurately trip addresses were resolved, which Anomalies doesn't cover. | Confirm you don't want it back; if you do, add it to Trip Logs. |
| R12 | Low | **New type error.** [TripLedgerWithManualAdd.tsx:49](../apps/fleet/src/components/finance/TripLedgerWithManualAdd.tsx#L49) has an implicit `any` (TS7006). | Type `d`. |

## Not yet verified

- Nobody has called `/trips/analytics` in production yet (no edge log hits in the last 24 h). Open the page once on desktop and at 390 px, then check that the KPI cards match the SQL above.
- Nothing is committed yet: the migrations, edge files, page, hook and Stitch exports are all untracked. Fix R4 before committing.

## Still not buildable (data limits, unchanged)

Platform imports have no request, accept, arrive or start times, rider ids, ratings, promos or Uber GPS. The funnel, wait time, repeat riders, re-request rate and ratings stay Roam-native only (see R2) or stay dropped.
