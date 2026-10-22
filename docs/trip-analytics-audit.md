# Trip Analytics: what's left

**Rev 3 · 2026-10-22** · Earlier revisions are in git history. R1–R12 from Rev 2 are all closed and verified in production. This file lists only what's still open.

| # | Sev | Item | Fix |
|---|---|---|---|
| T1 | **High** | **Trips can no longer be edited or deleted from the app.** Commit `09dad77b` deleted Trip Logs, and `/trips` now redirects to Trip Analytics. Manual logging moved to Ledgers → Trips, but nothing replaced Edit, Delete or Map Route. The duplicate the audit found is still in production: `manual_664e9f4d` and `manual_dee530d3` are both J$2,500 for the same driver at Oct 3, 13:06. That counts J$2,500 twice in analytics. If the Oct 3 week used trip totals, check the settlement too. | Choose one: (a) add Edit/Delete to the Ledgers → Trips row menu, behind `requirePermission('transactions.edit')` like the existing `DELETE /trips/:id`, or (b) delete the duplicate yourself and accept that trips can't be fixed from the UI. |
| T2 | Low | **The duplicate rule fires 8 times but there's only 1 real duplicate.** It pairs a completed trip with any other trip at the same `request_at`, including cancelled ones (a rider cancels and rebooks in the same minute). | In `fleet.trip_live_anomaly_flags`, only match against other completed trips. |
| T3 | Low | **The funnel's time-per-stage is always empty.** `roam_ride_funnel` returns `stageMinutes` as all nulls. | Compute medians from `created_at → en_route_at → arrived_pickup_at → trip_started_at → completed_at`. This can wait until real Roam rides exist. Keep the funnel flag off until then. |
| T4 | — | **Nobody has opened the page in production yet.** There are no edge log hits for `/trips/analytics` in the last 24 h. | Open it once on desktop and at 390 px. The KPI cards for Sep 22–Oct 21 should show 3,068.03 km, which matches SQL. |

## Verified this pass

- **Test trips removed.** The 65 probe trips are gone. `fleet.trips` and `fleet.trip_facts` both have 3,742 rows and J$3,660,899.12.
- **Funnel attribution works.** Requests are matched to a fleet through offers made to its fleet drivers. Your org has 3 fleet driver profiles. The current test rides were only offered to independent drivers, so an empty funnel is the right answer.
- **Migrations match.** Production history now has `190000`, `192724` and `220000`, the same as the repo. All trip analytics work is committed.
- **Server fixes are in.**
  - A response with a failed section isn't cached, and Retry forces a fresh load.
  - Review and settings require `transactions.edit`.
  - The anomaly Review button loads the trip by id.
- **Anomaly fixes work.**
  - Fare-per-km fires 7 times instead of 48.
  - "Missing time" fires 11 times instead of 76.
  - Badges and the Anomalies section use the same live rules, and the old flag name is gone.
- **Cost card uses real distance.** Its kilometres equal Σ distance (3,068.03 = SQL).
- **Fleet `tsc` is down to 484 errors** (was 496), with none in the new files.

## Data limits (unchanged)

Uber and InDrive imports have no request, accept, arrive or start times, no rider ids, ratings or promos, and Uber has no GPS. The funnel, wait time and repeat-rider metrics stay Roam-only.
