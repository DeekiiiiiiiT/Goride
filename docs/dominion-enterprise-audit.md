# Roam Dominion — Enterprise Rebuild Audit (open items only)

**Rev 2 · 2026-10-26** · Audit only — no code changed. Done items are removed.

**Rule:** Dominion is the brain. It holds shared reference data (vehicles, parts, stations, fuel prices, tolls, maps, GCT rules, vendors), runs the shared engines (Fuel, Toll, Matching Brain), manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records. Customer screens live in each product's own admin.

**Status:** most of Rev 1 is built and checks pass locally: new menu, page guard, real URLs, moved notices, dead code removed (tsc 254 → 20, none in Dominion's own files), server two-step gate, owner-only GCT books and identity search, Rides live tolls page, Fleet admin customer pages, CI checks. Admin build passes; 30/30 admin tests, 5/5 MFA gate tests, catalog contract OK.
**But nothing is committed, the migration is not applied, and the Dominion, Fleet and Rides sites are still the old versions.**

---

## 1. Ship order (do these in this order)

| # | Step | Why the order matters |
|---|---|---|
| 1 | Fix **R-1** (Fleet admin encoding) and **R-2** (product admin two-step login) | R-2 blocks the moved screens for you. |
| 2 | Commit everything | 256 changed files, all uncommitted. |
| 3 | Apply `20261026190000_master_data_columns.sql` **and** `20261026200000_toll_org_default_source.sql` to prod | Neither is applied (checked: no tables, no columns, no cron job). |
| 4 | Then rebuild + deploy `fleet-core`, `fleet-ops`, `fleet-toll`, `platform-catalog`, `gct-admin` | New station/toll/vendor writer code (`fleet_domains.ts`) writes columns that only exist after step 3. **Deploying before step 3 breaks every station, toll and vendor save.** Live fleet-core today has the two-step gate but not the writer code (checked the downloaded bundle). `gct-admin` live is from 2026-10-21 (no owner-only check yet). `platform-catalog` live has no `/v1` routes yet. |
| 5 | Deploy frontends: Dominion, Fleet admin, Rides admin, Enterprise admin | Confirmed old: roamdominion.co still shows "Business Segments" and "Registered Riders"; roam-s.co has no live-tolls page. |
| 6 | Run the exit checks in §5 | |
| 7 | Write the deploy date here. **30 days later**, do §3 (delete the old copies). | |

---

## 2. Open findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| **R-1** | High | `apps/fleet/src/admin/FleetProductAdminPortal.tsx` was saved with a BOM and broken encoding: "—" is now "â€”" in two places (subtitle text and the empty customer count). It will show garbage on roamfleet.co/admin. Only file affected. | Re-save as UTF-8 without BOM and restore the "—" characters. |
| **R-2** | High | **Moved screens will refuse you on the product admins.** Fleet-core's `/admin/*` routes (customers, team, ledgers, books) now require platform staff **with two-step login (aal2)**, and the aal2 gate is already live. None of the product admins (Fleet, Rides, Driver, Enterprise) has a two-step login step. A `platform_owner` password login on roamfleet.co/admin gets "Two-step login required". A `fleet_admin` (allowed to sign in there by `FleetProductAdminPortal.tsx:236`) gets "platform role required" from `/admin/customers` (`register_residual_monolith_routes.tsx:13032`). The Fleet admin's existing customer count may already be failing live. | Add the shared `StaffMfaStep` to product admin logins for platform roles, and decide whether `fleet_admin` may read these routes (then allow it server-side). Test by signing in to roamfleet.co/admin as owner. |
| **R-3** | Med | Dashboard still shows the wrong verified count. The card now reads "`stationVerified` verified of `total`", but `admin-stats` never returns `stationVerified`, so the page falls back to the total and shows "204 verified of 204". Prod: 56 verified of 206. (`AdminDashboard.tsx:96`, `register_residual_monolith_routes.tsx:11091`.) | Return a verified count from `fleet.stations` (`status = 'verified'`) in `admin-stats`. |
| **R-4** | Med | Rides "Live tolls" lost features compared to the Dominion monitor. `LiveTollPage.tsx` sets every toll total to 0, leaves GPS age blank, has no 30-second refresh, and clicking a ride does nothing (`onSelectTrip={() => undefined}`). Old page used `actual_tolls_minor`, `last_driver_location_at`, `fetchRideTollCrossingsAdmin` and a 30s timer (`apps/admin/src/pages/TollLiveMonitorPage.tsx:34–108`). | Port those four pieces before the Dominion copy is deleted. |
| **R-5** | Med | Dominion still downloads customer data in the background. On every login it prefetches the Fleet and Enterprise customer lists (`AdminPortal.tsx`, `prefetchQuery(['adminCustomers'…])`). Opening Stations loads every customer fuel fill (`fuelService.getFuelEntries()`). The Gas Cards page shows only Programs and Import, but still loads every customer, every card and the unmatched queue (`GasCardsPage.tsx:153–168`). | Remove the prefetch; give the station screen a server-side per-station summary; load cards only in `scope="org"`. |
| **R-6** | Med | New database pieces are half-wired: (a) writers never set `publish_state`, so new stations/tolls/vendors get `null` and apps can't filter on "published"; (b) the change log has no **who** or **reason**, because the trigger can't see the signed-in user; (c) quality scoring covers stations only; (d) nothing ever writes `catalog_consumers.last_sync_at`, so the Apps page will always say "Not connected yet". | (a) set `publish_state` in `fleet_domains.ts`; (b) pass the actor through a session setting (`set_config('app.actor', …)`) and store it; (c) add tolls, vendors, vehicles, maps, GCT rates to `score_master_data()`; (d) record the last request per app key in `platform-catalog`. |
| **R-7** | Low | Dashboard is still the old layout with three cards, not the planned health board. Missing: the "needs attention" row (pending vehicles, pending vendors, unverified stations, places to review), one health card per dataset, recent changes, and API/nightly-job status. One Quick Action ("Fuel Analytics") opens a moved page. | Build those rows from `/admin/quality`, `/v1/changes` and the queue counts; drop the moved link. |
| **R-8** | Low | Anyone with a platform role, including analysts, can still **change** GCT rates and resolver flags on the server (`gct-admin/index.ts:111, 555` use `requirePlatformAdmin`). The menu hides it, but the server doesn't block it. | Use owner (or owner + support) for those two writes. |
| **R-9** | Low | Dominion app chunk is 3.35 MB (was 2.97 MB). Pages still aren't lazy-loaded. | Route table with `lazy()` per page; it can also drive the menu and the guard. |
| **R-10** | Low | Leftovers: deprecated `SETTINGS_CHILDREN`, `ROAM_*_CHILDREN`, `SECTION_META.businessSegments`, the `LEGACY_PAGE_REDIRECTS` toll entries pointing at a moved page, `services/platform/driverPlatformService.ts` (still uses the undefined `API_ENDPOINTS.driver`), unused `components/ui/*` kit (~3,600 lines), `styles/globals.css`. | Delete with §3. |

---

## 3. After the 30-day notice (deploy date + 30 days)

Delete from Dominion, then rerun reachability, typecheck and build:
- Screens behind moved notices: `CustomerAccounts`, `TeamMembers`, `OrganizationDetail`, `product-users/*`, `product-overviews/*`, `roam-dash/*`, `components/database/*`, `UnifiedLedgerFeed`, `fuel-cost-analytics`, `fuel-evidence-bridge`, `pages/TollLiveMonitorPage` (after R-4), Fleet/Enterprise `PlatformSettings` segments, and their `MOVED_NOTICES` entries.
- The "keep on reachability graph" imports in `components/admin/fuel/AdminJaaGasCardsPage.tsx` (`ReconExternalQueuePanel`, `AdminJaaCsvImportWizard`, `jaaRawFuelCsvParser`).
- Fleet-core `/admin/*` routes that only Dominion called (check the Fleet, Rides and Enterprise admins first).
- `apps/admin/CLEANUP_AFTER_MIGRATION.md`.

---

## 4. Not started (next phase, after §1–§3)

1. **Dominion's own backend.** Master-data writes still go through `fleet-core`. Move them to `platform-catalog` admin routes (geo already does this) or a `dominion` function.
2. **Per-action permissions on the server** (`catalog.write`, `stations.verify`, `gct.ledger.read`…), shared with the client menu. Today the server only knows "platform staff" vs "owner".
3. **Apps on the data API.** Only Plug uses `/v1`. Move Fleet, Driver, Rush and Haul off direct table and `fleet-core` reads. Give each app its own key (this also fixes R-6d). Paginate `/tolls` and `/vehicle-catalog` like `/stations`.
4. **Retire the old key-value reads** for stations (`kv.getByPrefix("station:")` in `fuel_controller.tsx` and `admin-stats`) once every reader uses the typed columns; then drop `payload_json` duplicates and the empty `organization_id` column on `fleet.stations`.
5. **Stronger contract test.** `scripts/catalog-contract.mjs` only greps the source. Add a test that calls each public endpoint and checks the response has no ids of customers or orgs.

---

## 5. Exit checks (after §1)

| Check | Pass |
|---|---|
| Prod migrations | `20261026190000` and `20261026200000` recorded; `fleet.master_change_log`, `fleet.catalog_consumers`, `fleet.dataset_quality` exist; cron `dominion-score-master-data` exists. |
| Saves still work | Edit one station, one toll plaza, one vendor in Dominion → each saves, and a row appears in `fleet.master_change_log`. |
| Live bundles | Downloaded `fleet-core` contains `parishPcode`; `platform-catalog` contains `/v1/changes`; `gct-admin` contains `requirePlatformOwner`. |
| Dominion site | Menu shows Master data / Engines / Distribution / Platform / Back office; `?page=driver-users` shows the moved notice; refresh keeps the page; a support login opening `?page=gct-ledger` sees "Not allowed". |
| Dashboard | Stations card reads "56 verified of 206" (or current prod numbers). |
| Product admins | Owner signs in to roamfleet.co/admin with the authenticator → Customers, Team, Customer books, Station analytics, Fuel cost, Evidence, Gas cards, Combined ledger all load. Rides admin → Live tolls shows real toll totals. |
| Network | Dominion login makes no `/admin/customers` call (browser network tab). |
| CI | Reachability 0, admin typecheck ≤ 20, MFA gate test, catalog contract all green. |
