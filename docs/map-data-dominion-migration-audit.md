# Map Data → Roam Dominion: Migration Audit

**Date:** 2026-10-24 · **Rev 2** · **Status:** Audit only. No code or data was changed. All five decisions made (§9).

> **Rev 2 changes:** section named **World Maps** · API host decided (`platform-catalog`) · no-go zones confirmed Rush-only, under a new "every app is its own company" rule · **Dominion is law**: border changes reach Rush automatically, and the one review happens in Dominion before publishing · the other copies of Jamaica in the code are now part of this plan, so Dominion ends up as the only copy.
**Scope:** The map / geography data now living in the Roam Rush admin (`roamrush.app/admin` → Coverage → **Markets**), and where each piece belongs in an ecosystem where **Roam Dominion is the master data hub** and every product app reads from it.
**Evidence:** the repo at `16e47a94` + read-only SQL against production (`csfllzzastacofsvcdsc`), 2026-10-24.

---

## 1. Verdict in one paragraph

Your instinct is right, but it is only **half** of the Markets section that is in the wrong place. Markets mixes two different kinds of data:

1. **Jamaica's geography** — the country, 14 parishes, 131 towns, 775 communities, their borders, centre points and town pins. These are *facts about the island*. They are true for Rush, Rides, Fleet, Haul and Roam Plug alike. **This belongs in Dominion**, exactly like the Station Database and the Vehicle Catalog.
2. **Rush's delivery decisions** — which towns Rush serves, the delivery zones it draws, no‑delivery zones, launch readiness, publish/versions, the H3 coverage grid, waitlists, per‑market pricing. These are *business rules of one product*. **These stay in Rush.**

Today both are stored in the `delivery` schema, edited by Rush ops roles, and partly copied into hard-coded files in three other places. The target is: **Dominion owns the map, and Dominion is law. Each app owns its own zones on that map.** Every app is treated as an independent company that buys its map data from Dominion. Apps refer to towns and parishes by their official code (`pcode`). When Dominion publishes a border change, every app picks it up automatically. Before publishing, Dominion shows exactly what the change does to each app, so that is where the one review happens.

---

## 2. The rule that decides "what goes where"

Use this test for every table, screen and route. It is the same rule already used for gas stations and vehicles.

| Question | If YES → | If NO → |
|---|---|---|
| Would this still be true if Rush did not exist? | **Dominion** (reference data) | Product app |
| Does it describe the *world* (a place, a border, a name, a point)? | **Dominion** | Product app |
| Does it describe a *choice one product made* (serve / don't serve / price / launch)? | Product app | — |
| Does it hold customer, merchant, courier or order data? | **Never Dominion** (see `dominion-master-data-rule`) | — |

**How the gas-station example maps onto this**

| Gas stations (already done) | Map data (this audit) |
|---|---|
| Station master list lives in Dominion → *Fuel Management → Station Database* | Parishes, towns, communities, pins live in Dominion → *World Maps* (new) |
| Global rows have `organization_id = NULL`; Dominion writes them via `fleet-fuel /stations` | Geography rows have no product or org id; Dominion writes them via one geography API |
| RoamFleet reads stations; a fleet's *own* fuel logs and approvals stay in Fleet | Rush reads towns/parishes; Rush's *own* zones, launches and pricing stay in Rush |

**One improvement over the station pattern:** stations live in the `fleet` schema as a JSON blob (`fleet.stations.payload_json`), which makes Fleet look like the owner. Geography should go into a **neutral schema** (proposed: `geo`) so no single product appears to own it.

---

## 3. What exists today (inventory)

### 3.1 Production tables (all in `delivery`, all RLS on)

| Table | Rows (prod) | What it really is |
|---|---|---|
| `admin_boundaries` | 921 (1 country · 14 parishes · 131 towns · 775 communities), all `source = cod-ab` | **Pure national geography** (UN OCHA COD‑AB). No Rush meaning at all. |
| `service_parishes` | 14 | Hybrid: parish name, border (`foundation_geom`/`foundation_polygon`), centre, `town_pins` (**geography**) + `coverage_mode` (**Rush rule**) |
| `parish_outline_versions` | 6 | History of parish border edits (**geography**) |
| `parish_outline_templates` | 3 | Hand-drawn parish borders (**geography**, legacy) |
| `town_outline_templates` | 2 | Hand-drawn town borders (**geography**, legacy) |
| `service_markets` | 131 (all from COD‑AB, **1 active**) | Hybrid: town name, `pcode`, `parent_pcode`, `boundary_source` (**geography**) + `is_active`, `waitlist_enabled`, readiness minimums, publish state, `net_coverage_geom` (**Rush rule**) |
| `service_zone_polygons` | 142 (132 include, 10 exclude) | Rush delivery / no-delivery zones (**Rush**) |
| `zone_schedules` | — | Hours on Rush zones (**Rush**) |
| `scoped_exclusion_zones` | 1 (parish, `safety`) | Rush no-go areas (**Rush**, see decision D‑3) |
| `scoped_zone_schedules` | — | Hours on those (**Rush**) |
| `service_coverage_versions` | 5 | Rush publish history (**Rush**) |
| `coverage_cells` | 1,154 (H3 res 7 + 8) | Compiled Rush coverage grid (**Rush**) |
| `zone_waitlist`, `demand_events` | — | Rush customers wanting service (**Rush**, customer data → never Dominion) |
| `parish_pricing_profiles`, `market_pricing_profiles`, `pricing_change_log` | — | Rush pricing (**Rush**) — FK to `service_parishes` / `service_markets` |
| `merchants.market_id` | — | Which Rush market a merchant is in (**Rush**) |

### 3.2 Database functions and views

| Object | Touches | Belongs |
|---|---|---|
| `upsert_admin_boundary` | admin_boundaries | **Dominion** |
| `overview_community_shapes`, `overview_parish_shapes`, `overview_town_shapes` | admin_boundaries (+ service_*) | **Dominion** (shapes) — Rush adds its own "is this live" colouring on top |
| `promote_boundary_to_parish` | admin_boundaries → service_parishes | Bridge: Dominion → Rush |
| `promote_boundary_to_market_zone`, `union_admin3_to_market_zone`, `create_inactive_town_from_boundary`, `reconcile_market_pcodes` | admin_boundaries → service_markets/zones | Bridge: Dominion → Rush (stay in Rush, read from `geo`) |
| `parish_foundation_parts`, `point_in_parish_foundation` | service_parishes | **Rush runtime** — used live by customer discovery (`resolveMarketForPoint`) and merchant pin → market suggestion. Must keep working on a Rush-owned snapshot. |
| `point_in_zone_geom`, `zone_geom_parts`, `resolve_containing_zones`, `refresh_market_net_coverage`, `market_launch_facts`, `inactive_waitlist_at_point`, `admin_console_day_stats` | zones / markets | **Rush** |
| `coverage_health_summary` (view) | all of the above | **Split** — geometry quality → Dominion; zone drift / coverage → Rush |
| `legacy_jsonb_zone_drift`, `v_expired_active_exclusions` | zones | **Rush** |
| `public.delivery_coverage_cells`, `public.delivery_merchant_coverage_cells` (views) | coverage_cells | **Rush** |

### 3.3 Edge API (`supabase/functions/delivery/admin/`)

| Route | File | Belongs |
|---|---|---|
| `GET /admin/markets/boundaries` | `boundaryRoutes.ts:92` | **Dominion** |
| `POST /admin/markets/boundaries/import` | `boundaryRoutes.ts:159` | **Dominion** |
| `GET /admin/markets/overview-shapes` | `boundaryRoutes.ts:125` | **Dominion** (shapes) + Rush overlay |
| `GET /admin/markets/coverage-health` | `boundaryRoutes.ts:144` | **Split** |
| `GET/POST /parishes/:id/outline-versions…/restore` | `boundaryRoutes.ts:419,431` | **Dominion** |
| `PUT /parishes/:id/outline` | `marketRoutes.ts:560` | **Dominion** |
| `PUT /parishes/:id/town-pins` | `marketRoutes.ts:624` | **Dominion** |
| `POST/PATCH/DELETE /parishes…` (create, rename, delete a parish) | `marketRoutes.ts:494–660` | **Dominion** (Jamaica's parishes are not Rush's to create or delete) |
| `POST /parishes/:id/promote-boundary`, `/markets/:id/promote-boundary`, `/markets/:id/union-communities`, `/parishes/:id/towns-from-boundary` | `boundaryRoutes.ts:266–338` | **Rush** (consume Dominion geography) |
| Everything else under `/admin/markets` (markets, zones, publish, versions, diff, cells, readiness, GeoJSON import of *zones*, check-point, waitlist, backfill) | `marketRoutes.ts` | **Rush** |
| `/scoped-exclusions*` | `scopedExclusionRoutes.ts` | **Rush** |
| Public `GET /geo/delivery-zones`, `GET /geo/pin-status`, `POST /geo/zone-waitlist` | `marketRoutes.ts:1507–1622` | **Rush** (customer app) |

### 3.4 Rush admin UI (`packages/dash-admin/src/pages/markets/`)

| File | Lines | Belongs |
|---|---|---|
| `BoundaryLibraryPage.tsx` (Boundaries tab) | 205 | **Dominion** |
| `ImportBoundariesWizard.tsx` + `coverageIo.ts` | 324 + 562 | **Dominion** (boundary import); keep the zone-GeoJSON part of `coverageIo` in Rush |
| `ImportParishTownPinsOverlay.tsx` | 147 | **Dominion** |
| `ImportTownBorderOverlay.tsx` | 175 | **Dominion** |
| `CoordinateEntryOverlay.tsx` | 389 | **Shared tool** (both need "type coordinates") |
| `ZoneMapEditor.tsx` | 1,857 | **Shared tool** — Dominion needs it to draw borders, Rush to draw zones |
| `JamaicaOverviewMap.tsx` + `overviewViewport.ts` | 565 + 67 | **Shared tool** — keep it visible in Rush (you like this view, see `feedback-preserve-existing-ui`) and add it to Dominion |
| `HexCellsMapOverlay.tsx`, `coverageGeo.ts` | 54 + 202 | **Rush** |
| `CoverageHealthPage.tsx` | 187 | **Split** ("Has geom / Vertices / With pcode" → Dominion; zone drift → Rush) |
| `MarketsPage.tsx` | 3,419 | **Split** — parish border editing, town pins, "Parish border", "Import boundaries", parish create/rename/delete → Dominion; town cards, zones, launch, publish, versions → Rush |
| `ManageZonesOverlay.tsx`, `PlatformExclusionsPanel.tsx`, `ExclusionDetailSheet.tsx`, `MarketsHubPage.tsx` | — | **Rush** |
| `courier-shared/CourierPresenceMap.tsx`, `pricing/SimStorePinMap.tsx` | — | **Rush** (live ops, not reference) |

### 3.5 Copies of Jamaica geography outside Rush (drift risk)

| Copy | What | Problem |
|---|---|---|
| `supabase/functions/rides/fare/jamaicaLocations.ts` (340 lines, ~121 places) | counties → parishes → towns with hand-made lat/lng boxes | A **second, different** list of Jamaica. Rides fares use it. Will drift from the COD‑AB data. |
| `packages/business-config/src/jamaicaLocations.ts` | Front-end copy of the above | Third copy |
| `packages/business-config/src/townOutlines.ts` (69) + `supabase/functions/delivery/admin/townOutlines.ts` (136) | Hard-coded town borders | Fourth/fifth copy; same data as `town_outline_templates` |
| `apps/rides-passenger/src/admin/components/JamaicaLocationPicker.tsx` | Picker on the Rides list | Reads the Rides copy |

---

## 4. Findings

Severity: **Critical** = can break or corrupt live behaviour · **High** = wrong architecture with real risk · **Medium** = drift / cost · **Low** = tidy-up.

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **M‑01** | High | **National geography is owned by one product.** The 921 official boundaries sit in `delivery.admin_boundaries` and can only be managed from the Rush console. Rides, Fleet, Haul and Roam Plug cannot use them without reaching into Rush's schema. | §3.1, `boundaryRoutes.ts:92–215` |
| **M‑02** | High | **Rush ops can rewrite Jamaica.** Importing national boundaries, editing parish borders, creating/deleting parishes and editing town pins only need `dash.users.write` (any Rush admin who can manage users). In Dominion this should be a platform-owner-only permission. | `dashPermissions.ts:7–13`, `requireDashWrite` on every boundary route |
| **M‑03** | High | **Two tables mix facts with decisions.** `service_parishes` and `service_markets` each hold both geography (name, pcode, border, pins) and Rush policy (coverage mode, active, readiness, publish). This is the root cause of the "it feels like it's in the wrong app" feeling. | column lists §3.1 |
| **M‑04** | **Critical (for the migration)** | **Live checkout depends on the parish border.** Customer discovery and merchant onboarding call `point_in_parish_foundation` / `parish_foundation_parts` on `service_parishes`. If the migration moves the border and Rush reads it *live* from Dominion, a Dominion edit would instantly change who Rush delivers to — with no publish step, no diff, no version. | `coverageZones.ts:150–197`, used by `discoveryMarketFilter.ts`, `merchantRoutes.ts:48`, `merchant_application_routes.ts:32` |
| **M‑05** | Medium | **Five copies of "what is Jamaica"** (COD‑AB table, Rides list, business-config list, two hard-coded town-outline files). They already disagree (Rides uses rough boxes, Rush uses real polygons). | §3.5 |
| **M‑06** | Medium | **Copies of borders are made without a link back.** `promote_boundary_to_market_zone` copies a boundary into a Rush zone; the zone keeps `boundary_pcode` but not the boundary *version*, so nobody can tell when the upstream border changed. | `service_zone_polygons.boundary_pcode`, no version column |
| **M‑07** | Medium | **Naming confusion.** Rush calls a *town* a "market", and calls the parish border a "foundation". Dominion should use plain place words (Parish, Town, Community); Rush keeps "Market" only for "a town Rush has decided to serve". | UI labels in `MarketsPage.tsx` |
| **M‑08** | Low | Dominion already has Leaflet (`apps/admin/package.json`), so the map tools can move without a new map library. The 1,857-line `ZoneMapEditor` is too big to copy — it must become a shared package, not a second copy. | package.json |
| **M‑09** | Low | `platform-catalog` edge function exists but only serves `/health` (33 lines). It is the natural neutral home for the geography API. | `supabase/functions/platform-catalog/index.ts` |
| **M‑10** | Low | `parish_outline_templates` (3) and `town_outline_templates` (2) are legacy hand-drawn borders superseded by COD‑AB. | §3.1 |

---

## 5. Target architecture

### 5.1 Picture

```
                 ┌──────────────────────────────────────────────┐
                 │            ROAM DOMINION  (roamdominion.co)  │
                 │  World Maps: parishes · towns · communities  │
                 │  places/pins · imports · versions · quality  │
                 └───────────────┬──────────────────────────────┘
                                 │ writes (platform owner only)
                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │   geo schema  (neutral, master reference)    │
                 │   geo.boundaries · geo.boundary_versions     │
                 │   geo.places · geo.import_runs               │
                 └───┬───────────────┬───────────────┬──────────┘
          read (pcode + version)     │ read          │ read
                     ▼               ▼               ▼
   ┌───────────────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ ROAM RUSH (delivery)  │ │ ROAM RIDES   │ │ Fleet / Haul /   │
   │ markets = towns Rush  │ │ fare areas + │ │ Roam Plug (later)│
   │ serves; Rush's OWN    │ │ Rides' OWN   │ │ each with its    │
   │ zones + no-go zones   │ │ zones        │ │ OWN zones        │
   │ local copy of border, │ └──────────────┘ └──────────────────┘
   │ auto-refreshed        │
   └───────────────────────┘
   Apps never read each other's zones. Each one only reads from Dominion.
```

### 5.2 Principles

1. **Single writer.** Only Dominion writes to `geo`. No product edge function gets write access.
2. **Stable key = `pcode`.** The official COD‑AB code (`JM01`, `JM0101`, …) is the join key every app stores. Never a Rush UUID. (Already present on `service_markets.pcode` and `service_parishes.pcode`.)
3. **Versioned, never edited in place.** Every border change creates a new `geo.boundary_versions` row. Apps store *which version* they are using.
4. **Dominion is law. Changes arrive automatically, and the review happens once, at the source.** Apps never get a "review this change" step, because that would let an app disagree with Dominion and cause confusion. To keep that safe for live checkout (M‑04):
   - **Impact preview before publishing.** When the owner publishes a new border in Dominion, Dominion first shows what it changes for each app. For example: *"Rush: 1 live market affected, 3 merchants move from Half Way Tree to Liguanea, 0.4 km² of delivery area lost."* Publish happens only after you confirm.
   - **Automatic, all-at-once switch.** On publish, each app's local copy (`adopted_geom`) and its compiled coverage (net coverage + H3 cells) are rebuilt in one transaction. Checkout never sees half a change.
   - **Apps keep a local copy for speed, not for review.** Rush still checks addresses against its own copy, so checkout is never slowed down or broken by Dominion being busy. The copy is refreshed by the system, never by a person.
   - **Undo = restore in Dominion.** Restoring the previous version is published the same way, so every app rolls back together.
   - **Apps are told, not asked.** Rush shows an information line: *"Border updated by Roam Dominion · St. Andrew v3 · 24 Oct"*, with no buttons.
   (This closes M‑04 and M‑06.)
5. **Every app is its own company.** Each app (Rush, Rides, Haul, Fleet, Roam Plug) buys the same map from Dominion and draws its **own** zones on top: delivery areas, no-go/safety zones, fare areas, hours. Zones are never shared between apps, never stored in Dominion, and one app never reads another app's zones.
6. **No product data flows up.** Dominion never stores which towns Rush serves, merchants, couriers, orders or waitlists. It may show anonymised counts like "used by Rush" for the impact preview. Same rule as the Vehicle Database.
7. **Dominion is the only copy of Jamaica.** No app keeps its own hand-written list of parishes, towns or borders in code. Every such list found in §3.5 gets deleted and replaced by a read from Dominion.
8. **Neutral home.** Schema `geo`, API on the `platform-catalog` edge function (decision D‑2). Not `delivery`, not `fleet`.

### 5.3 Proposed `geo` data model

| Table | Key columns | Notes |
|---|---|---|
| `geo.boundaries` | `pcode` PK, `admin_level` (0 country, 1 parish, 2 town, 3 community), `parent_pcode`, `name`, `slug`, `current_version_id`, `status` (`active`/`retired`), `center_lat`, `center_lng` | One row per place. Replaces `delivery.admin_boundaries` identity + parish/town names. |
| `geo.boundary_versions` | `id`, `pcode`, `version`, `geom`, `geom_display`, `area_sqkm`, `source` (`cod-ab`/`manual`/`import`), `source_version`, `valid_on`, `notes`, `created_by`, `created_at` | Append-only. Absorbs `parish_outline_versions`, the parish `foundation_geom`, and the two `*_outline_templates`. |
| `geo.places` | `id`, `kind` (`town_centre`, `landmark`, later `poi`), `name`, `lat`, `lng`, `pcode` (containing area), `source`, `status` | Replaces `service_parishes.town_pins` JSON. Also the future home for Roam Plug pins (owner-approved). |
| `geo.import_runs` | `id`, `kind`, `file_name`, `counts`, `errors`, `dry_run`, `created_by`, `created_at` | Audit trail of every import (today imports leave no record). |
| `geo.quality_issues` (view) | invalid geometry, too many vertices, missing parent, overlaps | Powers Dominion's Data quality tab. |

Rules: RLS on, no anon access; reads through `security_invoker` views or the service-role API (matches `supabase-rls-exposure-audit`). Geometry in SRID 4326.

### 5.4 What Rush keeps (slimmed)

| Rush table | Change |
|---|---|
| `delivery.service_parishes` | Keep `id` (pricing FKs depend on it), `pcode` (FK → `geo.boundaries`), `coverage_mode`, `sort_order`. **Add** `adopted_version_id` + `adopted_geom` (the local copy used by `point_in_parish_foundation`, which only the system refreshes, on Dominion publish). **Retire** `name`*, `foundation_polygon`, `town_pins`, centre columns, `boundary_*` columns (*name can be a view join). |
| `delivery.service_markets` | Keep all launch/publish/readiness/net-coverage columns. `pcode` becomes FK → `geo.boundaries`. **Retire** `parent_pcode`, `boundary_source` (derived from geo). |
| `delivery.service_zone_polygons` | Add `boundary_version_id` next to `boundary_pcode` so "promoted from boundary" zones know their source version. |
| Everything else in §3.1 marked Rush | Unchanged. |

### 5.5 Geography API contract (Dominion-owned)

| Method & path | Who | Purpose |
|---|---|---|
| `GET /geo/boundaries?level=&parent=&fields=list` | any authenticated app server | List places (light) |
| `GET /geo/boundaries/:pcode?version=` | app server | One place + geometry (current or pinned version) |
| `GET /geo/shapes?levels=1,2,3&simplified=1` | app server / admin UIs | Map overlay shapes (replaces `overview_*_shapes`) |
| `GET /geo/boundaries/:pcode/versions` | admin UIs | History |
| `GET /geo/changes?since=` | app server | "What changed" feed. Safety net: each app checks it nightly and re-syncs anything a publish missed |
| `POST /geo/boundaries/:pcode/versions/:id/impact` | **Dominion only** | Impact preview: asks each subscribed app "what would this change do to you?" (counts only) |
| `POST /geo/boundaries/:pcode/versions/:id/publish` | **Dominion only** | Makes the version current and triggers every app's refresh in one step; refuses if any app's refresh fails (nothing half-applied) |
| `POST /geo/import` (`dry_run`) | **Dominion only** | Replace `/admin/markets/boundaries/import` |
| `POST /geo/boundaries/:pcode/versions` | **Dominion only** | New border version (draw / upload / restore) |
| `PUT /geo/places…` | **Dominion only** | Town pins / landmarks |

New permission: `platform.geo.write` (platform owner only). `dash.users.write` loses all geography writes.

Because edge functions can't import `roam-shared`, the shared response types follow the existing **mirror + Keep‑in‑sync + Deno drift test** pattern (`edge-shared-code-mirror-pattern`).

---

## 6. UI / UX design

### 6.1 Dominion — new sidebar group **"World Maps"**

Placed next to *Fuel Management* and *Vehicle Database* so it reads as one more master database.

| Item | What you do there | Built from |
|---|---|---|
| **Jamaica map** | Whole-island view; toggle Parishes / Towns / Communities / Places layers; click any shape to open it | `JamaicaOverviewMap` (shared) |
| **Parishes** | 14 cards. Open one → border on map, version history, "Draw new version", "Restore" | Parish border parts of `MarketsPage` + `parish_outline_versions` UI |
| **Towns** | 131 towns, searchable, grouped by parish. Open → border, centre pin, communities inside, versions | `BoundaryLibraryPage` (level 2) |
| **Communities** | 775 communities, searchable, read-mostly | `BoundaryLibraryPage` (level 3) |
| **Places & pins** | Town centres today; landmarks/Roam Plug pins later. Approve / edit / retire | `ImportParishTownPinsOverlay` |
| **Imports & versions** | Upload GeoJSON → dry run → diff on map → confirm. Every run logged | `ImportBoundariesWizard`, `ImportTownBorderOverlay` |
| **Data quality** | Invalid shapes, too many points, missing parent, overlaps | Geometry half of `CoverageHealthPage` |
| **Used by** (column on each place) | "Used by: Rush (snapshot v2)" — counts only, no customer data | from product snapshot tables |

UX rules for Dominion:
- **Draft → impact preview → publish** for every border change: a before/after map diff (same pattern Rush already uses for coverage) plus a per-app impact card ("Rush: 1 live market, 3 merchants move"). This is the only review in the whole system. No direct overwrite.
- Publish button wording: **"Publish to all apps"**, so it is clear the change becomes law everywhere.
- Show source on every shape: `COD‑AB 2024` / `Manual v3 by <name>` chips (reuse `ProvenanceBadge`).
- Plain words: Parish, Town, Community, Pin. No "foundation", no "market".
- 375 px: lists collapse to cards, map opens full-screen (Rush pattern).

### 6.2 Rush — Markets after the move

| Today | After |
|---|---|
| Tabs: Markets · Exclusion zones · Boundaries · Health | Tabs: **Markets · Exclusion zones · Health** (Boundaries tab removed) |
| Parish card: edit border, import town pins, rename, delete | Parish card: read-only border with chip **"From Dominion · v2"** and link **"Edit in Dominion →"**; Rush keeps only *Coverage mode* |
| "Import boundaries" button | Removed; replaced by **"Add a town from the map"** that lists Dominion towns not yet a Rush market |
| Town rename | Removed (name comes from Dominion) |
| Jamaica overview map | **Stays** (you like it) — shapes now come from Dominion; Rush still colours live / draft / not served |
| — | Information line only (no buttons, no choice) on the affected parish/town card and in Coverage activity: **"Border updated by Roam Dominion · St. Andrew v3 · 24 Oct"** |
| Exclusion zones tab | **Unchanged and Rush-only.** Rush keeps full control of its no-go/safety zones and delivery zones, drawn on top of Dominion's map |
| Health tab: geometry + coverage | Health tab: coverage only (zone drift, expired exclusions); geometry issues link to Dominion |

### 6.3 Shared UI package

Create `packages/geo-ui` (name is a suggestion) holding `ZoneMapEditor`, `JamaicaOverviewMap`, `overviewViewport`, `CoordinateEntryOverlay`, `ProvenanceBadge`. Both Dominion and Rush import it. Do **not** copy the 1,857-line editor into `apps/admin`.

---

## 7. Migration plan (expand → migrate → contract)

Each phase is shippable on its own and reversible until Phase 5. Nothing in Rush's live checkout path changes until Phase 3, and then only to read a Rush-owned snapshot.

### Phase 0 — Decisions & freeze (no code)
- D‑1 … D‑5 answered (§9).
- Freeze boundary imports and parish border edits in Rush admin (by agreement) for the migration window.
- Record baselines (see §8 gate G0).

### Phase 1 — Expand: build `geo` and copy data (Rush untouched)
1. Migration: create `geo` schema, tables in §5.3, RLS on, indexes (`GIST` on geom, unique `pcode`).
2. Copy `delivery.admin_boundaries` → `geo.boundaries` + one `geo.boundary_versions` row per pcode (`version = 1`, `source = cod-ab`).
3. For each of the 14 parishes where `service_parishes.foundation_geom` differs from COD‑AB, add it as version 2 (`source = manual`) and copy the 6 `parish_outline_versions` as history.
4. Copy `service_parishes.town_pins` → `geo.places (kind = town_centre)`.
5. Load the 2+3 outline templates as `manual` versions marked `retired` (kept for history only).
6. Add `geo.import_runs` and the quality view.
**Gate G1** (§8).

### Phase 2 — Dominion read-only, then write
1. Geography API (§5.5) on `platform-catalog`; `platform.geo.write` permission.
2. `packages/geo-ui` extracted from `dash-admin` (Rush imports it too, so the screens look the same).
3. Dominion **World Maps** section, read-only first (Jamaica map, Parishes, Towns, Communities).
4. Then turn on writes: Imports & versions, draw new version, Places & pins, Data quality.
5. Rush boundary write routes now return `410 Gone — managed in Roam Dominion` (UI already hidden behind a flag).
**Gate G2.**

### Phase 3 — Re-point Rush to Dominion (the careful one)
1. Add `adopted_version_id` + `adopted_geom` to `service_parishes`; fill from the current `foundation_geom` (so the snapshot is *identical* to today).
2. Change `point_in_parish_foundation` / `parish_foundation_parts` to read `adopted_geom`. Behaviour must be byte-for-byte the same (G3).
3. Re-point the bridge RPCs (`promote_boundary_to_parish`, `promote_boundary_to_market_zone`, `union_admin3_to_market_zone`, `create_inactive_town_from_boundary`, `reconcile_market_pcodes`) and `overview_*_shapes` to read `geo.boundary_versions`; record `boundary_version_id` on zones.
4. `coverage_health_summary` split: geometry checks move to `geo.quality_issues`.
5. Add FK `service_markets.pcode` and `service_parishes.pcode` → `geo.boundaries(pcode)`.
6. Build Rush's **refresh hook**: given a new boundary version, rebuild `adopted_geom`, re-run `refresh_market_net_coverage`, recompile `coverage_cells`, and re-check `merchants.market_id`, all in one transaction. Plus an **impact function** that runs the same thing as a dry run and returns counts only. Dominion's publish calls both.
7. Nightly safety net: Rush compares its `adopted_version_id` with `/geo/changes` and re-runs the refresh if a publish was missed.
**Gate G3.**

### Phase 4 — Slim the Rush UI
Remove Boundaries tab, import wizard, town-pins import, town-border import, parish create/rename/delete, border editing. Add Dominion chips, deep links and the "Border updated by Roam Dominion" information line (§6.2). Keep the overview map and the Exclusion zones tab.
**Gate G4** (6-role browser pass, as in the Ops Console audit).

### Phase 5 — Contract (after a 14-day soak with zero calls to the old routes)
- Drop `delivery.admin_boundaries` (or leave a read-only compatibility view for one more release), `parish_outline_templates`, `town_outline_templates`, the retired `service_parishes` / `service_markets` columns, both `townOutlines.ts` files, and the 410 routes.
**Gate G5.**

### Phase 6 — Make Dominion the only copy (Rides and the rest)
Today Dominion is **not** yet the only copy of Jamaica. Rides was built with its own list of parishes and towns typed straight into its code (`rides/fare/jamaicaLocations.ts`, ~121 places with rough rectangles instead of real borders), and two more copies exist in shared code (§3.5). Rides does not read Rush's data or Dominion's. It reads its own list. This phase deletes those lists so every app reads from Dominion:
- **Rides:** fare areas look up the parish/town from `geo` by `pcode`. Rides' own fare rules and zones stay in Rides (principle 5). Fares depend on this, so run a **fare-parity test** first: price ~200 sample trips old way vs new way and explain every difference before switching.
- Delete `packages/business-config/src/jamaicaLocations.ts`, both `townOutlines.ts` files, and repoint `JamaicaLocationPicker` to `/geo/boundaries`.
- Roam Plug pins → `geo.places`.
- Fleet fuel/toll "which parish is this" → `geo` lookup.
- **CI guard:** a check that fails the build if a new hard-coded list of Jamaica places appears in any app.
Timing: start right after Phase 5 (Rush done and soaked). It is part of this programme, not optional.

---

## 8. Verification gates (run, don't assume)

| Gate | Check | Pass |
|---|---|---|
| **G0** baseline | `select admin_level, count(*) from delivery.admin_boundaries group by 1`; md5 of `ST_AsBinary(geom)` per pcode; count of active markets / zones / coverage cells; 20 sample addresses through `/geo/pin-status` | Saved to the doc |
| **G1** copy | Same counts in `geo` (1/14/131/775 = 921); per-pcode md5 of version-1 geometry = G0 md5; 14 parishes have a current version; pins count = sum of `town_pins` | All equal |
| **G2** Dominion | Non-owner role gets 403 on every `/geo` write; Rush boundary routes return 410; Dominion import dry-run on the original COD‑AB file reports 0 created / 921 unchanged | All true |
| **G3** Rush parity | For every parish, `ST_Equals(adopted_geom, old foundation_geom)`; the 20 G0 addresses give **identical** pin-status and market; `market_launch_facts` and coverage diff for the 1 active market = no change; `coverage_cells` count unchanged. On a **branch** DB: publish a test border, check that the impact preview counts match what actually changed, and that a forced refresh failure blocks the publish completely | All identical / all-or-nothing |
| **G4** UI | 6 Rush roles + Dominion owner at desktop and 375 px; overview map still renders all layers; information line appears after a test publish; Rush has no Adopt/Review buttons anywhere | Pass |
| **G6** only copy | Fare-parity report signed off; CI guard finds 0 hard-coded Jamaica lists | Pass |
| **G5** contract | 14 days of logs show 0 hits on old routes / tables; Rush `tsc` and Deno tests at baseline | Pass |

Live-check reminder (from past incidents): after any role/permission change, make a real REST request straight away (`feedback-verify-live-after-db-config`), and confirm deploys by downloading the live bundle, not by timestamps.

---

## 9. Decisions (all made, 2026-10-24)

| ID | Decision | Outcome |
|---|---|---|
| **D‑1** | Name of the Dominion section | **"World Maps"** (owner) |
| **D‑2** | Where the geography API lives | **`platform-catalog` edge function + new `geo` schema** (decided by Claude at the owner's request). Why: it is the only backend piece that belongs to no app (today it only answers a health check), so map data doesn't end up looking like Rush's or Fleet's. It deploys on its own, so a busy Rush function can't slow Dominion down. And it is where future master data (vehicles, stations) can move too. |
| **D‑3** | No-go / safety zones | **Rush-only, permanently** (owner). New rule, principle 5: every app is its own company that buys map data from Dominion and draws its own zones on top. Dominion never holds any app's zones. |
| **D‑4** | Does Rush adopt Dominion border changes automatically? | **Yes. Dominion is law** (owner). Apps get no review step, to avoid confusion. Safety comes from an impact preview *in Dominion* before publishing, an all-or-nothing switch, and undo by restoring in Dominion (principle 4). |
| **D‑5** | Rides' own Jamaica list | **Delete it and make Rides read from Dominion** (Phase 6, right after Rush). The owner's intent is that Dominion is the only copy. Today it isn't: Rides and shared code still carry hand-typed lists (§3.5, Phase 6). |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| A border change changes who Rush delivers to without anyone noticing | Impact preview in Dominion before every publish; all-or-nothing refresh; undo by restore (principle 4, Phase 3); G3 parity |
| A Dominion mistake goes live everywhere at once (the price of "Dominion is law") | Only the platform owner can publish; impact preview is required; any border that moves a **live** market's area by more than 10% needs typed confirmation; one-click restore |
| Pricing breaks because `parish_pricing_profiles` / `pricing_change_log` FK to `service_parishes.id` | Keep `service_parishes.id`; only drop geography columns |
| Merchant markets re-assign unexpectedly | `merchants.market_id` untouched; run `backfill-merchant-markets` in dry-run before and after Phase 3 and compare |
| Map overlay gets slow when shapes come from another API | `geom_display` is already simplified; cache `/geo/shapes` by version (it changes rarely) |
| Two copies of the editor drift | Shared `packages/geo-ui`, not copies |
| Disk IO (see `supabase-disk-io-plan`) | Copy is one-time (~10 MB); no new crons; `/geo/changes` is a cheap indexed read |
| Fresh-branch migration replay is broken today | Test Phase 1–3 on a branch only after that is fixed, or on a manual schema dump |

---

## 11. Do-not-move list (stays in Rush, on purpose)

Delivery / no-delivery zones and their hours · scoped exclusion zones · market launch, readiness, publish, versions, diff, restore · H3 coverage grid · waitlist and demand events · per-parish / per-market pricing · merchant → market assignment · courier presence map · store-pin pricing simulator · the customer `/geo/*` endpoints · the Jamaica overview map *as a view in Rush* (it reads Dominion shapes but stays where you use it).

---

## 12. Glossary (so both apps use the same words)

| Word | Means | Owner |
|---|---|---|
| **Parish / Town / Community** | An official place with a border (COD‑AB levels 1 / 2 / 3) | Dominion |
| **pcode** | The official code of a place, e.g. `JM01` | Dominion |
| **Border version** | One saved shape of a place; never overwritten | Dominion |
| **Pin / Place** | A point: town centre, landmark, later Roam Plug spots | Dominion |
| **Market** | A town Rush has chosen to serve | Rush |
| **Zone** | A Rush delivery or no-delivery area drawn inside/around a market | Rush |
| **Local copy / adopted version** | The current Dominion border, copied into an app by the system for fast checks; always equal to Dominion's latest published version | System (refreshed by Dominion publish) |
