# Dominion Vehicles home dashboard

**Rev 2 · 8 Nov 2026 · Ported; database live; code not committed or deployed.**

**Goal:** the first page of Dominion → Vehicles shows the state of the car database at a glance: how big it is, how complete it is, what changed, and what needs a person. Database only: nothing from Roam Fleet or any other app.

- **Stitch prompt:** `docs/stitch/vehicles-home-dashboard-dominion-prompt.txt`
- **Stitch exports:** `docs/stitch/dominion-vehicles-home-dashboard/` (`screen.png` = Stitch, `live.png` = our port)

---

## What was built

| Piece | File |
|---|---|
| Database function `admin_vehicles_dashboard(p_car_ids)`: completeness buckets, specs counts, top 20 most complete cars, readiness for given cars, rows waiting for approval, last 5 parts, last 5 car/spec edits. Read-only; the public is refused. | `supabase/migrations/20261108155655_admin_vehicles_dashboard.sql` |
| Route `GET admin/catalog/vehicles-dashboard?ids=` (staff only) | `supabase/functions/_fleet-server/catalog_routes.ts` |
| Screen | `apps/admin/src/components/admin/vehicle-catalog/vehicles-stitch/VehiclesHomeScreen.tsx` |
| Wiring, page links, Needs attention fixes | `apps/admin/src/components/admin/vehicle-catalog/VehiclesStitchFlow.tsx` |
| Capture sample data | `apps/admin/src/components/admin/vehicle-catalog/vehiclesCaptureFixtures.ts` |

Sources of every number:
- **Tiles:** `admin_parts_overview` (versions, cars with parts, parts on file, waiting) and the makers list.
- **Completeness:** `variant_parts_readiness.components_ready` per active version (8–10 / 4–7 / 1–3 / 0).
- **Specs:** `catalog_spec_value` at version, platform (incl. parent) or engine level.
- **Recently changed cars:** `platform_revision` for `vehicle_catalog` and `catalog_spec_value`.
- **Recently added parts:** newest `part_master` rows with the cars from `part_listing`.

---

## Keep / Drop / Add

### Light (`vehicles_home_dashboard_light_database_view`)
- **Keep:** header + 2 buttons, search + Try chips, 4 tiles, completeness bar + legend + specs line, Most complete cars, Makers (6 + "All N makers"), Recently opened with readiness bar, Needs attention, Recently added parts, Recently changed cars.
- **Drop:**
  - the microphone icon in the search box (no voice search);
  - the "Activity log" button on Recently changed cars (the flow can't open that page);
  - Stitch's sidebar "CORE MODULES / Master Sync Active v2.4" (the real Dominion sidebar stays).
- **Change:**
  - Needs attention text wraps instead of being cut off with "…".
  - "12 cars have no specs yet" now reads "N cars have no engine or frame code yet", because that is what the row counts.
  - Legend counts and spec counts are plain labels, not buttons: no filtered list of versions exists yet.

### Dark (`vehicles_home_dashboard_dark_mode`)
- **Keep:** same layout in the dark tokens.
- **Drop:** "MASTER DB" pill, "1,833 TOTAL EDITIONS", "telemetry", part codes like "#47311", "Action pending review", "WORKSPACE HISTORY", the SPECS / PARTS / CHASSIS tags, "12m ago" style times (we show the date).

### Phone 390px (`vehicles_home_dashboard_phone_390px`)
- **Keep:** one column in this order: header, search, tiles 2 × 2, Needs attention, completeness, Recently opened, Makers 2 across, Recently added parts, Recently changed cars.
- **Drop:** "Vehicle Detail" top bar, barcode icon, "Updated live", "Frame: … · Engine: …" lines, OEM numbers and category tags on parts, "Staged from live crawler".

### States (`vehicles_dashboard_states_edge_cases`)
- **Keep:** skeleton blocks while loading; red banner "Could not load the vehicles dashboard. Nothing was changed." + Try again; the empty texts ("No car has key parts on file yet." + Add a part, "No parts saved yet." + Add a part, "Cars you open will show here.", "No edits yet."); a tile shows "Not loaded" + Retry when its numbers fail.
- **Drop:** "DIAGNOSTICS & SANDBOX", frame toggles, "HTTP 503", the offline cached view and its buttons, every Frame D sample car (Prius, CX-5, Forester…).

---

## Fixed along the way
- "Review" for duplicates always opened Toyota Roomy; it now opens the model of the first duplicate.
- "Review" for missing codes opened the first car in the list; it now opens the first car that is missing codes.
- "Add logos" opened the first maker; it now opens the first maker with no logo.
- "Recently opened" showed random cars when you had opened none; it now says "Cars you open will show here."
- The Vehicles pages no longer sit inside an extra white box (only the old Import & tools view keeps it).
- Dark mode: maker letter circles were washed out.

## Checks (8 Nov)
- Real data on the test copy (owner login): every card loads; no errors from the new route; the public role cannot run the function.
- Light, dark and 390px screenshots vs Stitch: `live.png` in each folder.
- Admin typecheck: no errors in the changed files.

## Open
1. ~~Run the migrations on live~~ **Done 8 Nov.** Both are live. The function and both views exist, and the public role can't use them. Live split of 1,833 versions: 0 have 8–10 key parts, 4 have 4–7, 48 have 1–3, 1,781 have none. 23 versions have specs.
2. **Deploy:** fleet-core plus the Dominion site; then the page works on your normal Dominion.
3. **Playwright can't load any test file right now** ("did not expect test() to be called here"), the old specs too. `e2e/dominion-vehicles-home-dashboard-capture.spec.ts` is ready for when that is fixed.
