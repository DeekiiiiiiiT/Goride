# RoamFleet × Rush — Load test & rollback drill notes

## Load test (projector)

- Target: peak Rush order volume (estimate from matching metrics)
- Script: `node scripts/load-test-trip-projector.mjs 100` (set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Pass: p95 sync < 30s; zero recon drift after run

## Rollback drills

| Wave | Drill | Expected |
|------|-------|----------|
| 1 | Disable `rush_courier_link` | New invites blocked; existing membership intact |
| 2 | Disable `rush_trip_projection` | No new trips; existing Rush trips remain |
| 3 | Disable `rush_ui` | Rush nav hidden; data unchanged |
| 4 | Disable `rush_settlement` | COD API returns disabled payload |

Document results in Notion Audit Tracker.
