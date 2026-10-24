# Map Data → Roam Dominion (World Maps)

**Rev 8 · 2026-10-24** · Open items only. Earlier revisions (and the Rev 5 proof table) are in git.
**Checked against:** `main` at `24d1ede7` and production (`csfllzzastacofsvcdsc`).

## The rule
Dominion owns the map, and Dominion is law. Each app is its own company: it reads Dominion's map and draws its **own** zones on top (Rush: delivery and no-go zones). Apps never edit borders and never see each other's zones. Dominion is the only copy of Jamaica.

## Status
**The code is closed.** Every item from Rev 3 to Rev 5 (O‑1…O‑10, N‑1…N‑5, G1, G2) checks out against the code and production:
- The nightly repair now really repairs.
- Only one publish runs at a time (`geo.try_begin_publish`).
- No database function or app code touches `delivery.admin_boundaries`. The precheck passes, and CI runs it plus both publish tests.
- Rides v738 is deployed and the parity doc is signed.

Live versions: delivery v899, platform-catalog v129, rush-cron v7, rides v738.

---

## Closed this pass

- **M‑1.** Production’s migration labels were renamed in place. No SQL was re-run. `geo.commit_boundary_publish` still does not mention `admin_boundaries`. Labels now match the repo files: `20261025013000` geo_publish_guard, `20261025014000` geo_publish_drops_old_border_sync, `20261024193000` expense_hub_v2_statement, `20261025170000` plug_service_readers, `20261025172000` public_station_only_verified, `20261025173000` station_origin_app, `20261025174000` explorer_user_app_metadata. `20261025171000_drop_fleet_fuel_api_schemas` was left unapplied. Older history (before this map work) still has version numbers that do not match repo filenames. Those were not relabeled: the names do not pair one-for-one, and rewriting them could reorder the wrong files.
- **M‑2.** The 24 Oct path-deploy for `24d1ede7` created production builds for roam-dominion and roam-rush-customer (hook HTTP 201). The live Dominion bundle contains “Restore this version”, “Loading the live border…”, “Draw a replacement”, and “Preview failed”. The live Rush admin bundle contains “Edit in Dominion”, “From Dominion”, and “Parish border from Dominion”. Both sites stop at the admin login, so a signed-in click through one place and one market is still needed.
- **M‑3.** `scripts/geo-phase5-precheck.mjs` now scans `apps` as well. Local run: `admin_boundaries` is gone from supabase/functions, packages, and apps.
- **G3.** A throwaway database (no production data) replayed the map, then was deleted. Nothing was published on production.
  1. One stale town: first repair healed 1 place, second repair healed 0, and nothing failed.
  2. Publishing a moved town square checked 1 store, moved 0 stores, and touched 1 live market. The market outline matched the new square, and 43 grid cells were written for it. The old border table still held only the planted row, unchanged. The publish function does not copy into that table.
  3. The store sat inside the inactive market and outside the new live border. It stayed on the live market.

  A fresh replay also needed three cron migrations to skip scheduling when the scheduler extension is missing, and the empty history row `20260421120001` filled with the vehicle-spec statements (not executed on production).

## Open

| ID | Sev | Problem | Fix |
|---|---|---|---|
| **Nightly** | Low | `geo-adopted-reconcile` is active at `15 6 * * *` and has no run yet. | After Sun 25 Oct 06:15 UTC, read `cron.job_run_details`. Pass is success with `healed: 0` and `failed` empty. |

## Checks still to run
- **First nightly repair:** Sun 25 Oct, 06:15 UTC (1:15 AM Jamaica time). Check `cron.job_run_details` for `geo-adopted-reconcile`. Expect success with `healed: 0, failed: []`.
- **G5:** the quiet period runs to **7 Nov 2026**. Then run `node scripts/geo-phase5-precheck.mjs` and the SQL pre-check, and drop the old tables only with a separate go-ahead.

## Order
M‑1 → M‑2 → M‑3 → G3 (done on a deleted throwaway database) → first nightly result (25 Oct) → G5 cleanup (after 7 Nov).
