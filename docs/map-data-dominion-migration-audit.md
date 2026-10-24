# Map Data → Roam Dominion (World Maps)

**Rev 3 · 2026-10-24** · Open items only. Rev 1–2 history is in git.
**Checked against:** working tree on `main` (uncommitted) and production (`csfllzzastacofsvcdsc`), read-only.

## The rule
Dominion owns the map, and Dominion is law. Each app is its own company: it reads Dominion's map and draws its **own** zones on top (Rush: delivery and no-go zones). Apps never edit borders and never see each other's zones. Dominion is the only copy of Jamaica.

## Status
Mostly built. The `geo` schema holds 921 borders, the Rush local copy matches the old borders exactly (0 mismatches), World Maps and the geo API are live, Rush border routes return 410, and the hard-coded Jamaica lists are gone (the CI guard passes).

**⚠ Do not press "Publish to all apps" in World Maps until O‑1 and O‑2 are fixed.** It is live, and today it would move a live merchant out of delivery.

---

## Open items

| ID | Sev | Problem | Proof | Fix |
|---|---|---|---|---|
| **O‑1** | **Critical** | **Publishing any border moves the wrong merchants.** `geo.preview_merchant_moves` checks every merchant on the island, matches them only to a *parish*, then picks that parish's first market by "live first, then A–Z". It ignores town borders and Rush zones. Publish applies those moves. | Prod, read-only: republishing **unchanged** Hanover would move 3 merchants. **Island Grill** goes from live *Spanish Town* to inactive *Constant Spring*. Code Blue and Ichiraku Ramen get assigned too. The same 3 come back for every parish. | Only look at merchants whose pin is inside the old **or** new shape of the place being published. Pick the destination with the same rule Rush uses at sign-up (`suggestMarketIdForMerchantPin`, zone-based), not parish order. Never move a merchant from a live market to an inactive one. Return 0 moves when the version equals the current one. **Test:** republishing the current version of all 921 places gives 0 moves. |
| **O‑2** | High | **The new coverage grid is built from the old shapes.** `applyGeoPublish` compiles hex cells *before* `commit_boundary_publish` copies the new border into the zones. For a town publish, the zone outline changes but the grid that checkout uses keeps the old border. Net coverage (`refresh_market_net_coverage`) and `merchant_coverage_cells` are not refreshed either. | `geoPublish.ts:130-133` runs before `commit_boundary_publish` (SQL, lines 63-69). 139 zones carry a `boundary_pcode`. | When compiling, use the new version's shape for zones linked to that place. Then refresh net coverage and merchant cells for the affected markets in the same publish. **Test (branch DB):** after a town publish, the grid matches the new zone outline. |
| **O‑3** | High | **World Maps can't edit borders, and Publish skips the preview.** The button works out the impact and publishes in the same click. It can only re-publish the *current* version. There's no way to draw or upload a new border, see versions, restore, or edit pins. The APIs for drafts and pins exist but the page doesn't use them, and restore doesn't exist. | `WorldMapsPage.tsx:150-174`. The map is a plain drawing, not the shared `@roam/geo-ui` editor. | Two steps: **Preview** (impact card + before/after map) → **Confirm publish**. Add a version list with Restore, a draft editor using `ZoneMapEditor` from `@roam/geo-ui`, and pin editing (`PUT /geo/places/:id`). Use `JamaicaOverviewMap` instead of the drawing. |
| **O‑4** | High | **The nightly safety net doesn't run.** The cron job calls `rush-cron`, but the deployed version (v6, 21 Oct) doesn't allow `/internal/geo/reconcile`. The local fix isn't deployed. Reconcile also only checks parishes, not towns or zones. | `list_edge_functions`: rush-cron last deployed 2026-10-21. Cron `geo-adopted-reconcile` 06:15 UTC. | Deploy `rush-cron`. Extend reconcile to towns: zones whose `boundary_version_id` ≠ the place's current version. |
| **O‑5** | Medium | **Rush still shows border editors that now fail.** Add parish, Delete parish, Save parish border, Import town pins, and the hidden Boundaries page are still wired up and return "Managed in Roam Dominion" (410). | `MarketsPage.tsx:2270, 2284, 2376, 2454, 2780, 2953, 3355`. `DashAdminPortal.tsx:69, 425` | Remove them and keep the "From Dominion" / "Edit in Dominion" chips. Delete `BoundaryLibraryPage`, `ImportBoundariesWizard`, `ImportParishTownPinsOverlay`. Keep the town-zone GeoJSON/CSV import, because those are Rush's own zones. The 14-day quiet period for O‑8 can't start until this is done. |
| **O‑6** | Medium | **Import doesn't import.** `POST /geo/import` only counts pcodes. With `dry_run: false` it still writes nothing but reports "created". | `geoRoutes.ts:174-214` | Either build it (each feature saved as a draft version, then published via O‑3) or call it a "check file" step and refuse `dry_run: false`. |
| **O‑7** | Medium | **Rush's bridge functions still read the old table.** `promote_boundary_to_parish`, `promote_boundary_to_market_zone`, `union_admin3_to_market_zone`, `create_inactive_town_from_boundary`, `reconcile_market_pcodes`, `upsert_admin_boundary` and the view `coverage_health_summary` read `delivery.admin_boundaries`. Publish keeps that table in sync for now. | `pg_proc` search, prod | Point them at `geo.boundaries` + `geo.boundary_versions`. Drop `upsert_admin_boundary`. Must happen before O‑8. |
| **O‑8** | Medium | **The clean-up script is wrong.** `scripts/geo-phase5-contract.sql` names tables and columns that don't exist (`parish_boundary_templates`, `town_boundary_templates`, `service_markets.outline_geom`). It would also drop `admin_boundaries` while 7 objects still use it. | The real names are `parish_outline_templates`, `town_outline_templates`. | Rewrite it after O‑5 and O‑7. Include `town_pins`, `foundation_polygon`, `parish_outline_versions`, and the 410 routes. Run only after 14 quiet days. |
| **O‑9** | Low | **Migration history doesn't match.** The repo has `20261024180000` + `20261024190000`. Prod recorded 8 entries, `20261024164532` … `20261024165733`. | `schema_migrations` | Rename or split the repo files to the prod versions before committing. Same fix as earlier audits. |
| **O‑10** | Low | **Nothing is committed**, and the working tree mixes this work with unrelated Fleet finance and Roam Plug changes. | `git status` | Commit World Maps on its own (migrations, `geo-ui`, `platform-catalog/geoRoutes.ts`, `delivery/admin/geo*`, Rides fare, CI guard). |

## Rides (Phase 6): nearly free to finish
`rides.fare_rules` has only 4 rules in prod, all island-wide (`jamaica`). So switching Rides to Dominion borders changes **0 fares today**. Live Rides v737 was deployed at 16:26, before the `geo` schema existed, so it still runs the old code.
- Sign `docs/geo-fare-parity.md` with that fact. The Kingston/St. Andrew note there is moot: official parish borders don't overlap, and no rule uses a parish yet.
- Then deploy `rides`. Re-check parity before anyone adds the first parish- or town-level fare rule.

## Checks still to run
- **G2:** a signed-in non-owner (for example a Rush ops role) gets 403 on every `/geo` write (import, versions, publish, places).
- **G3 (branch DB, after O‑1 and O‑2):** publish a changed town border. Check that the impact counts equal what actually changed, the grid matches the new outline, a live merchant is never moved to an inactive market, and a forced failure leaves the generation and the merchants unchanged.
- **G4:** 6 Rush roles + the Dominion owner at desktop and 375 px. No border editors left in Rush.
- **G5:** 14 days with zero calls to the 410 routes. Starts after O‑5.

## Order
O‑1 → O‑2 → O‑4 (deploy) → O‑3 → G3 on a branch DB → O‑5 → O‑6 → O‑7 → O‑9/O‑10 commit → Rides sign-off + deploy → 14-day quiet period → O‑8.
