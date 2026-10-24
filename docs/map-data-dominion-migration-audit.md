# Map Data → Roam Dominion (World Maps)

**Rev 9 · 2026-10-24** · Open items only. Earlier revisions and proofs are in git (Rev 8 has the G3 and click-through evidence).
**Checked against:** `main` at `de18efdf` and production (`csfllzzastacofsvcdsc`), read-only.

## The rule
Dominion owns the map, and Dominion is law. Each app is its own company: it reads Dominion's map and draws its **own** zones on top (Rush: delivery and no-go zones). Apps never edit borders and never see each other's zones. Dominion is the only copy of Jamaica.

## Status
**Built, live and proven.** Every code item is closed. Production's migration history matches the repo for all the map work. Production is in step:
- 0 parish or zone copies differ from Dominion.
- The publish lock is free.
- `commit_boundary_publish` has no old-table sync.
- The precheck is clean across functions, packages and apps.

Only two dated checks are left.

## Open

| ID | When | Pass rule |
|---|---|---|
| **Nightly** | After Sun 25 Oct 2026, 06:15 UTC (1:15 AM Jamaica time) | `geo-adopted-reconcile` succeeds in `cron.job_run_details`, **and** its request in `net._http_response` is HTTP 200 with `healed: 0` and `failed: []`. A green cron row alone is not a pass. Don't call the route by hand before then. |
| **G5** | On or after 7 Nov 2026 | Zero signed-in calls to the 7 old write routes (the 24 Oct 401 curl to `POST /admin/boundaries/import` stays on record). Then run `node scripts/geo-phase5-precheck.mjs` and the SQL check in `scripts/geo-phase5-contract.sql`. Drop the old tables **only after a separate written yes**. The tables are `admin_boundaries`, `parish_outline_templates`, `town_outline_templates`, `parish_outline_versions`, and `service_parishes.town_pins` + `foundation_polygon`. |
