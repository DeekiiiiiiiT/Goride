# Dominion · Jamaica map — audit (Rev 2, 29 Oct 2026 — whole section: Part 1 Country, Part 2 Parishes · Towns · Communities · Pins · Imports)

**Page:** Dominion → Master data → Places and Maps → **Jamaica map** (`?page=world-jamaica`), plus its level tabs Parishes, Towns and Communities (`world-parishes`, `world-towns`, `world-communities`).

**Code today:** one 979-line file, [WorldMapsPage.tsx](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx). It also draws the Places (`world-places`, S15) and Imports (`world-imports`, S16) tabs. Those two keep their own screens and are not redesigned here. Only the tab bar they share changes.

**Audit only.** No code was changed. All numbers come from production (`csfllzzastacofsvcdsc`) on 29 Oct 2026, using read-only SQL.

**Stitch:** prompt at [docs/stitch/jamaica-map-prompt.txt](stitch/jamaica-map-prompt.txt). It defines two new screens:
- **S36 Jamaica map** (the page)
- **S36b Area inspector**, an edit state for one parish, town or community

S14 "World map viewer" is superseded.

---

## 0. READ FIRST — the Stitch screen is the spec

The last build "followed the audit" and still invented its own screen. This section exists to stop that.

**Order of work**
1. Build S36 and S36b in Stitch from the prompt.
2. Export the HTML to `docs/stitch/dominion-redesign/html/S36-jamaica-map.html` and `html/S36b-area-inspector.html`, with the PNGs beside them.
3. Add the README rows (§7).
4. Only then write React.

No UI code before the HTML is in the repo.

**Who wins**

| Topic | Winner |
|---|---|
| Layout, block order, spacing, colours, icons, wording, empty, loading and error text | **Stitch HTML** |
| What data loads, how it is computed, permissions, publish rules, links | **This audit** |
| Anything else | Stitch for looks, audit for data |

**Porting rules**
- Same element structure and Tailwind classes as the Stitch HTML.
- Every label copied word for word.
- Only sample values swapped for live ones.
- Nothing added, nothing removed. The wireframe in §5 is guidance only.
- The map canvas itself is Google Maps (as today). Stitch decides the overlays, controls and panels around it.

**Proof in the PR**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for S36 and S36b. CI enforces only 80%, so 100% is the bar here. Every React file must be listed in the README row, joined by ` + `.
- Side-by-side screenshots: Stitch PNG next to the live page, in light, dark and 390 px phone.

---

## 1. Who uses it

| Person | Why they open it |
|---|---|
| Owner | Check that the official map is right and see what changed recently. Publish a corrected border. |
| Data staff | Find an area by name or code. See its parent, children, size and version. See which apps and records depend on it. |
| Product teams (Rush, Fleet, Plug) | Read only: "Which parish/town is this, and what code does my app store?" |

The page answers almost none of this today. It shows a map, plus a panel that appears off-screen below it when you click.

---

## 2. Live data (29 Oct 2026)

| Fact | Value |
|---|---|
| Areas in `geo.boundaries` | 921 = 1 country + 14 parishes + 131 towns + 775 communities |
| Versions | 921 published, 10 retired, 0 drafts |
| Areas without a published shape | 0 |
| Sources | `cod-ab` (official COD-AB import) and `manual` |
| Last publish | 24 Oct 2026 (Kingston, Saint Andrew, Saint Catherine, Spanish Town) |
| Rows in `geo.publish_log` | **0** |
| Size of `/geo/shapes?levels=1,2,3` (what Country view loads) | **≈ 4.7 MB** |
| Size of parishes only (`levels=1`) | ≈ 0.49 MB |
| Map pins (`geo.places`) | 6 |
| Import runs | 0 |
| Dominion places with a pcode (`places.place`) | 217 of 217; the pcode comes from these borders |
| "PARTITION: 921" in the toolbar | This is the count of all areas, under a made-up label |

---

## 3. Findings

**Severity:**
- **High:** wrong, slow or unsafe.
- **Medium:** missing or misleading.
- **Low:** tidy-up.

### J1 — High · Country view downloads 4.7 MB of borders on every visit
- [WorldMapsPage.tsx:154](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L154) asks for levels `1,2,3` at once.
- [WorldMapsPage.tsx:152](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L152) also loads all 921 rows for a list that Country view never shows.
- The map stays blank until everything arrives.

**Fix:** load by zoom.
- Country view loads level 1 only (0.49 MB).
- Towns load when zoom ≥ 10.
- Communities load when zoom ≥ 12.
- Both deeper levels are fetched only for the visible box: `GET /geo/shapes?levels=2&bbox=w,s,e,n`.
- Shapes are simplified on the server: a new `p_tolerance` argument on `geo.list_shapes`, using `ST_SimplifyPreserveTopology`. Values: 0.0005° for parishes, 0.0002° for towns, 0.0001° for communities.
- Responses keep `STABLE_GET_CACHE`.
- The 921-row list call is removed from Country view. The new KPI strip gets its counts from the summary in J6.

### J2 — High · Rush delivery terms appear on Dominion's master map
- The shared `JamaicaOverviewMap` from `@roam/geo-ui` draws a Rush legend: "Active town delivery", "Inactive town delivery", "No-delivery cutout".
- [WorldMapsPage.tsx:197](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L197) sets `is_active: true` on every town, so "Inactive" can never be true.
- Dominion is master data and must not show one product's delivery status.

**Fix:** add a prop `variant?: 'delivery' | 'master'` to `JamaicaOverviewMap`.
- The default stays `'delivery'`, so Rush Markets (`packages/dash-admin/.../MarketsPage.tsx`) is unchanged.
- `'master'` draws plain borders with a neutral legend: Parish border · Town border · Community border · Pin.
- `'master'` has no cutouts and no active/inactive states.
- Dominion passes `variant="master"` and stops sending `is_active`.

### J3 — High · Clicking an area opens a panel off-screen
- On Country view, `onPick` sets `selected`.
- The border editor (`PlacePanel`) then renders **below** a 640 px map ([WorldMapsPage.tsx:389](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L389)). The user sees nothing change.
- The editor also offers Draw, Upload and Publish on a view-only overview.

**Fix:** a right-hand **Area inspector** (S36b) that is always visible beside the map.
- It shows the area's facts: name, code, level, parent path, children, area, points, live version, source, date, and "used by".
- Its one action is "Open border editor". That goes to the matching level tab with the area selected (`?page=world-parishes&area=JM06`).
- Draw, Upload, Preview and Publish stay on the level tabs only.

### J4 — High · Border changes leave no history
- `geo.publish_log` has **0 rows**.
- Yet on 24 Oct, four areas got a new live version and older ones were retired. Those changes happened outside the publish route (migration / SQL), so nothing recorded them.
- `geo.commit_boundary_publish` only logs when the route is used.

**Fix:** add a trigger on `geo.boundaries` (after update of `current_version_id`).
- It inserts into `geo.publish_log` with:
  - `pcode` and `version_id`
  - `actor_id` from `current_setting('request.jwt.claim.sub', true)` (null when run by SQL)
  - `status = 'published'`
  - `impact = '{"via":"direct"}'` when the publish route did not already log it in the same transaction
- The route's own insert stays, so a routed publish carries its impact.
- To avoid double rows, the trigger skips when a row with the same `version_id` already exists.
- Backfill one row per area whose live version was created on 24 Oct, with `impact = {"via":"backfill"}`.

### J5 — Medium · Publish impact ignores Dominion's own records
- The impact preview only asks Rush (`callRush("/internal/geo/impact")`): markets and merchants.
- It does not count the 217 Dominion places (205 gas stations among them) whose stored `pcode` would change when a border moves.
- Station analytics groups by that pcode.

**Fix:**
- `POST …/impact` adds `places_moving`: places whose point falls in a different area under the new shape, plus a sample of up to 10 names.
- After a successful publish, `geo.commit_boundary_publish` re-runs the pcode fill for places inside the old shape and the new shape put together.
- The inspector's "Used by" shows the place count for the selected area.

### J6 — Medium · No summary of the map
- The page never says how many parishes, towns or communities exist, when the map last changed, or whether drafts are waiting.

**Fix:** new route `GET /geo/summary` in `platform-catalog/geoRoutes.ts` (same guard as other `/geo/*` reads). It returns:
- counts by level
- published and draft version counts
- `last_publish_at` (from `publish_log`, after J4)
- the open map-quality issue count (`/geo/quality` length)
- pin count
- the 5 most recent `publish_log` rows with the area name

### J7 — Medium · Search does nothing on Country view
- The search box filters a list that Country view does not render ([WorldMapsPage.tsx:166](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L166)).

**Fix:** one search field over the map that searches all levels by name or pcode.
- New route: `GET /geo/search?q=` → top 10 of `pcode, name, admin_level, parent name, center`.
- Use a `geo.boundaries` trigram index on `name`. `pg_trgm` is already installed in `public`.
- Picking a result zooms to the area and opens it in the inspector.

### J8 — Medium · Level tabs reload the whole app
- Tabs are `<a href="?page=…">` ([WorldMapsPage.tsx:272](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L272)), so each click reloads the admin app and refetches everything.

**Fix:** tabs call the portal's `onNavigate(pageId)` and update the URL with `history.pushState`.
- The selected area travels in `&area=` so the map keeps it.
- Places and Imports stay as tabs but sit after a divider, because they are separate screens (S15, S16).

### J9 — Medium · Write permission is checked differently on each side
- The client shows edit buttons when `canWriteWorldMapsFromUser` sees `platform.geo.write`, `platform_owner` or `superadmin` ([WorldMapsPage.tsx:49](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L49)).
- The server allows writes when `dominionCan(role, "maps.publish")` ([productAdmin.ts:252](../supabase/functions/_shared/productAdmin.ts#L252)).
- Staff can see buttons that fail with 403, or miss buttons they are allowed to use.

**Fix:** the client uses `dominionCan(role, 'maps.publish')` from `packages/auth-client/src/dominionPermissions.ts` over the same role list, and `canWriteWorldMapsFromUser` is deleted.

### J10 — Medium · Version list order hides the live version
- Versions are sorted by number, newest first.
- The live version is **v1**, created 24 Oct. The retired v2–v4 are older templates (27 Aug and 24 Oct).
- So the live border sits at the bottom, and "Restore this version" is offered on old templates.

**Fix:**
- Sort by `created_at` descending.
- Show a "Live" chip on the published one.
- Retired rows whose notes start with "Retired … template" or "Pre-promote snapshot" get the tag "Old template". They show a confirm step ("This border was replaced on 24 Oct. Restore it?") before Preview.

### J11 — Low · Fake or stale labels
Remove all of these:
- "REGION: JM-KGN" ([L252](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L252))
- "PARTITION: 921" (it becomes "921 areas" in the KPI strip)
- The footer "The data is not in yet. · LOC: KINGSTON / PARISH REGISTRY JMD", which shows even when data loaded ([L395](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L395))

### J12 — Low · Loading and error states
- While loading, the page is blank.
- Errors are one red line of text.

**Fix:** use the S3 kit (`DominionStates`):
- skeleton for the KPI strip and inspector
- a map placeholder with "Loading the map…"
- error card "Could not load the map. Nothing was changed." with Retry

### J13 — Low · Colours are hard-coded; no dark mode
- The page uses `bg-white` while the shell uses `bg-slate-50`, and there is no dark variant.
- The legend's radio dots and the "Streets" button look disabled (greyed) in light mode.

**Fix:**
- Use Dominion tokens as Stitch sets them.
- The legend becomes a static list with colour swatches.
- Layer toggles are checkboxes.
- The base map uses one segmented control "Map · Satellite".

### Out of scope (noted)
- The Places and Maps home cards (Waiting 0, Quality 100, Records "—", Verified "—") have the same "dash" problem fixed for Fuel in [dominion-fuel-home-audit.md](dominion-fuel-home-audit.md). They get their own audit.
- Publish goes through the Rush `delivery` function because `geo.commit_boundary_publish` updates Rush coverage in the same transaction. Keep it that way: atomic is correct.

---

## 4. Must not show
- Rush delivery states, merchants, markets or coverage cells on the master map. The inspector's "Used by" shows **counts only**.
- Any customer, driver, vehicle or order data.
- "REGION", "LOC", "PARTITION" or AI badges.

---

## 5. Layout (guidance — Stitch S36 wins)

```
Header: Dominion › Master data › Places and Maps › Jamaica map
Jamaica map — "The official map of Jamaica, from the country down to communities."
                                                   [Published · updated 24 Oct]

Tabs: Country | Parishes | Towns | Communities  ┆  Places · Imports

KPI strip: Parishes 14 · Towns 131 · Communities 775 · Drafts 0 · Quality issues 0 · Last change 24 Oct

┌───────────────────────── map (8/12) ─────────────┐ ┌── Area inspector (4/12) ──┐
│ [🔍 Search a parish, town, community or code]   │ │ Nothing selected:         │
│                                  [Map|Satellite]│ │  Jamaica · JM             │
│                                                 │ │  14 parishes list with    │
│      (borders by zoom; selected area outlined   │ │  towns / communities each │
│       in blue, parent in grey)                  │ │ Selected (S36b):          │
│ Layers: ☑ Parishes ☑ Towns ☐ Communities ☐ Pins │ │  Half Way Tree · JM0601…  │
│ Legend: ─ Parish ─ Town ┄ Community • Pin       │ │  Jamaica › Saint Andrew › │
└─────────────────────────────────────────────────┘ │  Level, area km², points, │
                                                    │  Live v1 · COD-AB · 24 Oct│
Recent changes (full width): area · level ·        │  Children, Used by counts │
version · source · when · by                        │  [Open border editor]     │
                                                    └───────────────────────────┘
```

---

## 6. Data and API

| # | Change | Where |
|---|---|---|
| A1 | `geo.list_shapes(p_levels int[], p_tolerance float default null, p_bbox float[] default null)`. Simplify and bbox-filter on the server. Keep the old call shape working. | migration |
| A2 | `GET /geo/shapes?levels=&bbox=&tolerance=` passes through (J1) | `platform-catalog/geoRoutes.ts` |
| A3 | `GET /geo/summary` (J6) | same |
| A4 | `GET /geo/search?q=` with a trigram index on `geo.boundaries(name)` (J7) | same + migration |
| A5 | `GET /geo/boundaries/:pcode` adds `children` (count by level), `area_sqkm`, `vertex_count`, `used_by.places` (count of `places.place` with that pcode prefix), `used_by.pins` (count of `geo.places` with that pcode prefix). It keeps the existing `rush_markets`. | same |
| A6 | Trigger `geo.log_boundary_change` plus backfill (J4) | migration |
| A7 | Impact adds `places_moving`; publish refills place pcodes (J5) | `delivery` impact handler + `geo.commit_boundary_publish` |
| A8 | `variant: 'master'` prop on `JamaicaOverviewMap` (J2) | `packages/geo-ui/src/JamaicaOverviewMap.tsx` |
| A9 | Client permission from `dominionCan` (J9) | admin |

**Frontend:** a new folder `apps/admin/src/components/admin/world-maps/jamaica-map/`.

| File | Contains |
|---|---|
| `JamaicaMapPage.tsx` | Page, header, tabs, KPI strip |
| `MapCanvas.tsx` | `JamaicaOverviewMap variant="master"`, zoom-based loading, search overlay, layer toggles |
| `AreaInspector.tsx` | Nothing-selected and selected states |
| `RecentChanges.tsx` | Recent-changes table |
| `jamaicaMapApi.ts` | API calls |
| `jamaicaMapFormat.ts` + `.test.ts` | Formatting, plus their tests |

**Wiring:**
- `WorldMapsPage.tsx` renders `JamaicaMapPage` for `world-jamaica`.
- The level tabs share the new `MapLevelTabs.tsx`.
- `PlacePanel`, `PinList` and `ImportPanel` stay where they are (S15/S16 unchanged). Only `PlacePanel`'s version order changes (J10).
- Each new file starts with `// Stitch: dominion-redesign/<S36 or S36b id>`.

---

## 7. Stitch README rows
- **Add S36:** `| S36 | Jamaica map | <id> | html/S36-jamaica-map.html | world-jamaica | apps/admin/src/components/admin/world-maps/jamaica-map/JamaicaMapPage.tsx + …/MapCanvas.tsx + …/RecentChanges.tsx + apps/admin/src/components/admin/world-maps/MapLevelTabs.tsx | Ported. Master borders only; no Rush delivery states. |`
- **Add S36b:** `| S36b | Area inspector | <id> | html/S36b-area-inspector.html | world-jamaica | apps/admin/src/components/admin/world-maps/jamaica-map/AreaInspector.tsx | Ported. Facts + "Open border editor"; no editing here. |`
- **Change S14** to: `Superseded by S36 — do not build.`

Write out the full paths in the real rows.

---

## 8. Tests

| # | Test | Where |
|---|---|---|
| T1 | Country view's first request is `levels=1` and is under 600 kB | Playwright network check |
| T2 | No request for `levels=3` until zoom ≥ 12 | Playwright |
| T3 | `geo.list_shapes` with tolerance returns the same pcodes as without, and every ring is still valid (`ST_IsValid`) | SQL check |
| T4 | Updating `current_version_id` writes exactly one `publish_log` row. A routed publish also writes exactly one. | SQL check |
| T5 | Backfill gives 4 rows for 24 Oct | SQL check |
| T6 | Impact includes `places_moving`. After publish, every `places.place.pcode` matches `ST_Within` on the new shape. | Deno + SQL |
| T7 | `/geo/search?q=half` returns Half Way Tree first. Results include all three levels. | Deno |
| T8 | The `master` variant renders no "delivery" or "cutout" text. Rush Markets snapshot is unchanged. | vitest (geo-ui) |
| T9 | The edit-button rule equals the server rule for every role in `dominionPermissions.ts` | vitest |
| T10 | Version list puts the Live version first and tags old templates | vitest |
| T11 | No "REGION", "LOC:" or "PARTITION" strings in `world-maps/**` | grep in CI |
| T12 | `stitch-fidelity.mjs --report` = 100% for S36 and S36b | CI + PR |

---

## 9. Build order
1. Stitch S36 and S36b → HTML, PNG and README rows (§0, §7).
2. Migrations A1, A4, A6 (+ backfill). Run SQL checks T3–T5.
3. Routes A2, A3, A5 and the search route; deploy `platform-catalog`.
4. A7 impact + pcode refill. Deploy `delivery`, run T6, and do one test publish on a draft.
5. A8 geo-ui variant + T8.
6. The `jamaica-map/` folder, ported from Stitch, + A9, J10, T7, T9–T11.
7. Fidelity at 100%, side-by-side screenshots (light, dark, phone), commit, deploy the admin site.


---
---

# PART 2 — Rev 2 (29 Oct 2026): the rest of the section

Rev 1 covered only the **Country** tab. That was wrong: the Jamaica map section has six tabs.

The owner has now built Country (S36/S36b, `jamaica-map/`). Part 2 covers the other five:

| Tab | Page id | Code today | New Stitch screen |
|---|---|---|---|
| Parishes | `world-parishes` | `WorldMapsPage` level view: Directory list + `PlacePanel` | **S36c Level browser** |
| Towns | `world-towns` | same | **S36c** (same screen, level = Towns) |
| Communities | `world-communities` | same | **S36c** (same screen, level = Communities) |
| — border editor inside the three tabs above | `&area=` | `PlacePanel` | **S36d Border editor** + **S36e Publish dialog** |
| Places → renamed **Pins** | `world-places` | `PinList` | **S36f Map pins** (replaces S15) |
| Imports (also `world-quality`) | `world-imports` | `ImportPanel` | **S36g Imports and checks** (replaces S16) |

§0 of Part 1 applies to every screen here:
- **The Stitch HTML is the spec. Port it; don't redesign it.**
- Each screen must reach 100% on `stitch-fidelity.mjs --report`.
- Each screen gets side-by-side PNGs (light, dark, phone).

All five tabs share the S36 header, tab bar and KPI strip, so the section reads as one. Country's components are reused, not copied.

Stitch prompt: [docs/stitch/jamaica-map-tabs-prompt.txt](stitch/jamaica-map-tabs-prompt.txt).

## P2.1 Live data for these tabs (29 Oct 2026, read-only SQL)

| Fact | Value |
|---|---|
| Parishes / towns / communities | 14 / 131 / 775 |
| Border points per area | Parishes 1,638–4,627 · towns 22–3,040 · communities 16–3,040 |
| Names shared by more than one area at the same level | **71** name groups |
| Towns with no communities | 0 |
| Communities whose parent is not a town | 0 |
| Children more than 2% outside their parent | 0 |
| Map-quality issues (`geo.quality_issues`) | 0. The view has only 3 checks: invalid shape, missing parent, more than 8,000 points (country excluded) |
| `geo.publish_log` rows | 4 (the J4 backfill is in) |
| Map pins (`geo.places`) | **6**. All are `kind=town_centre` and `source=town_pins`, and **all have `pcode = JM08`** — the parish code, not their town's code |
| Import runs | 0 |
| Draft versions | 0 |

## P2.2 Findings — level tabs (Parishes, Towns, Communities)

### L1 — High · The impact preview hides Dominion's own records
- The server now returns `places_moving` and `places_sample` ([geoPublish.ts:234](../supabase/functions/delivery/admin/geoPublish.ts#L234)).
- The UI's `Impact` type has neither field ([WorldMapsPage.tsx:26](../apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx#L26)), and the preview prints only Rush markets and merchants.
- So the owner can publish a border that moves gas stations into a different parish without seeing it.

**Fix:**
- The S36e Publish dialog shows `places_moving` with up to 10 names from `places_sample`, next to the Rush counts.
- "Confirm publish" is enabled only after the preview has loaded for that exact version.

### L2 — High · 775 communities in one list, with no parent and no filter
- The Directory shows only name and code, in one long list.
- 71 names repeat at the same level, so "which Bellevue?" can't be answered without reading codes.

**Fix (S36c):** replace the list with a table.
- **Columns:** Name · Code · Parent (parish for towns; town › parish for communities) · Area km² · Points · Children · Live version · Updated.
- **Filters:** chips for parish (all levels) and for town (communities only).
- **Search:** by name or code.
- **Duplicates:** a "Same name ×N" chip on rows whose name repeats.
- **Sorting:** on every column.
- **Data:** a new `GET /geo/boundaries?level=&parent=&with=metrics`. One RPC, `geo.list_boundaries_admin(p_level, p_parent)`, adds `area_sqkm`, `vertex_count`, `children`, `version`, `published_at` and `parent_name` in one call (no N+1).

### L3 — High · The selected border is shown alone, without its neighbours
- The border editor map (`ZoneMapEditor`, view mode) draws only the chosen ring and the live ring.
- When fixing a shared edge, you can't see the parish or town next door. New gaps and overlaps are invisible.

**Fix (S36d):**
- The editor map also draws the parent border (grey) and the siblings (thin grey, labelled), from `GET /geo/shapes?levels=<level>&bbox=` (A2, already built).
- Draft vs live is drawn as blue dashed vs solid, with a legend.

### L4 — Medium · A new shape is never checked
- Saving a draft (drawn or uploaded) runs no geometry checks.

**Fix:** `geo.save_draft_border` runs these checks and stores the results on the version as `checks jsonb`:

| Check | Rule | Result |
|---|---|---|
| Valid shape | `ST_IsValid` | Refuses to save if invalid |
| Inside parent | More than 2% outside | Warning |
| Sibling overlap | More than 1% of area | Warning |
| Area change vs live | — | Shown as a % |
| Point count | Above 8,000 | Warning |

- The Publish dialog lists the warnings.
- Warnings never block (capture, never gate), but each needs an "I've checked this" tick before Confirm.

### L5 — Medium · Upload GeoJSON silently takes the first feature
- A file with several features saves `features[0]` and drops the rest (`PlacePanel` upload handler).
- A file with no geometry fails with a raw JSON error.

**Fix:**
- More than 1 feature → refuse with "This file has N areas. Use Imports for more than one."
- No geometry, or a type other than Polygon/MultiPolygon → "This file has no area shape."

### L6 — Medium · Drafts can't be discarded, and there is no list of drafts
- A saved draft stays forever; there is no delete.
- The "Drafts" KPI counts them, but nowhere lists them.

**Fix:**
- New `DELETE /geo/boundaries/:pcode/versions/:id`. It accepts only `status='draft'` and sets the status to `discarded`; nothing is removed.
- New "Has a draft" filter chip on S36c. The Drafts KPI tile links to it.

### L7 — Medium · The version list sorts wrongly after an action
- `sortBoundaryVersions` runs on first load, but not inside `reloadVersions` (after save or publish).
- So after publishing, the live version drops back to the bottom.

**Fix:**
- `reloadVersions` calls `sortBoundaryVersions`.
- Add a test: publish, reload, and check that Live is first.

### L8 — Medium · Drawing starts from up to 4,627 points
- "Draw a replacement" loads the full live ring into the editor. Parishes have 1,638–4,627 points, too many handles to edit by hand.

**Fix:**
- The editor opens with a "Detail" control: Full · Medium (0.0001°, about 11 m) · Light (0.0003°).
- Medium is the default.
- The chosen detail level is saved in the draft notes.
- The draft is saved from what was edited, and the L4 checks show the area change.

### L9 — Low · These tabs still use the old look
- `bg-white` and `slate-*` classes.
- An uppercase "Directory" heading.
- "The data is not in yet." as the empty text.

**Fix:** port S36c and S36d, and use the S3 states kit.

### L10 — Low · Communities open in the "town" editor mode
- `foundationScope={adminLevel === 1 ? 'parish' : 'town'}` treats communities as towns, so the toolbar wording says "town".

**Fix:**
- Pass the real level.
- Add `'community'` to `ZoneMapEditor`'s `foundationScope`.
- Toolbar labels come from the level.

## P2.3 Findings — Places tab (map pins)

### P1 — High · The "Kind" column shows the status
- The header says **Kind**, but the cell prints `pin.status`. All 6 rows read "active".

**Fix:**
- The Kind cell shows `kind` (e.g. "Town centre").
- Status gets its own column.

### P2 — High · Editing a pin can move it to 0,0
- Latitude and longitude are free text boxes passed through `Number(value)`, so an empty box becomes `0`.
- `PUT /geo/places/:id` stores any number. A pin at 0,0 sits off the coast of Africa.

**Fix:**
- **Server:** refuse lat/lng outside Jamaica's box (lat 17.6–18.6, lng −78.5 to −76.1) with 400 "That point is outside Jamaica."
- **UI (S36f):** move a pin by dragging it on a map. The number fields stay for precision and are checked as you type.

### P3 — High · Pins carry the wrong area code
- All 6 town-centre pins have `pcode = JM08` (the parish), not their town. For example, Spanish Town should be `JM0807`.
- The pcode is never recalculated when a pin moves.

**Fix:**
- New trigger `geo.places_fill_pcode` (before insert, or before update of lat/lng). It sets `pcode` to the deepest area that contains the point: community, else town, else parish.
- Backfill the 6 pins.
- The table shows the path, e.g. "Spanish Town › Saint Catherine".

### P4 — Medium · Two different things are both called "Places"
- This tab lists `geo.places` (6 map pins).
- The Places register (`places-register`) lists `places.place` (217 records).
- Same word, different data.

**Fix:**
- Rename the tab **"Pins"** and the page title to "Map pins".
- Subtitle: "Points on the map, such as town centres. Business places live in the Places register." Include a link to the register.

### P5 — Medium · No way to add pins, and no history of changes
- There is no create route.
- Edits leave no trace.

**Fix:**
- `POST /geo/places`, behind the same write guard. Fields: name, kind (fixed list: `town_centre`, `landmark`, `junction`), lat, lng.
- New table `geo.pin_change` (before, after, actor_id, reason, at).
- A reason is required on every save.

### P6 — Low · The pins tab has no map
**Fix (S36f):**
- Split view: the table on the left, a map with every pin on the right.
- Clicking a row selects it and zooms to the pin.
- In edit mode the pin can be dragged.

## P2.4 Findings — Imports tab (and world-quality)

### I1 — High · "Publish" doesn't publish, and "Dry run" isn't a dry run
- Both buttons open the same file picker.
- `input.dataset.mode = 'dry'` is set but never read.
- After a file is picked, a browser `window.confirm` decides what happens: OK saves drafts, Cancel does a dry run.
- So "Publish" never publishes, and "Dry run" can save drafts.

**Fix (S36g):** a three-step flow.
1. **Choose file.**
2. **Check.** Always a dry run, ending in a results table.
3. **Save as drafts.** Enabled only after a check of the same file (matched by file hash) with 0 broken.

Other rules:
- Remove `window.confirm`.
- Publishing happens per area in the border editor (S36d), or through "Publish drafts from this import" (I5).

### I2 — High · Every run shows a green "Dry run passed"
- The chip is always green, even when `unknown` or `broken` is above 0.
- The `errors` list is saved in `geo.import_runs.errors` but never shown.

**Fix:**
- Chip colours: broken > 0 → red "N broken"; else unknown > 0 → amber "N unknown"; else green "All matched".
- Clicking a run opens a drawer with matched, unknown and broken lists, plus the error text.
- `GET /geo/imports/:id` returns `errors`.

### I3 — Medium · The check is shallow and slow
- The route makes one database round trip per feature. A 775-community file means 775 lookups in a row, close to the edge-function time limit.
- It only checks that the code exists. It never checks shape validity, level, parent or area change.

**Fix:**
- Move the check into one RPC, `geo.check_import(p_features jsonb)`. For each feature it returns `pcode`, `matched`, `level`, `valid`, `area_change_pct`, `outside_parent_pct` and `overlap_pct` (same rules as L4).
- Saving drafts runs in one RPC too: `geo.save_import_drafts(p_run_id)`.

### I4 — Medium · Map quality checks only 3 things, with raw labels
- It doesn't check sibling overlaps, children outside their parent, or duplicate names.
- Labels show as `invalid_shape`.
- Rows don't link to the area.

**Fix:**
- **New checks:** `outside_parent` (more than 2%), `sibling_overlap` (more than 1% of area), and `same_name` (same level). `same_name` has severity "info"; 71 today, shown and never hidden.
- **Plain labels:** "Shape is broken", "Parent missing", "Too many points", "Sticks out of its parent", "Overlaps a neighbour", "Same name as another area".
- **Links:** each row opens the border editor at `?page=world-<level>&area=<pcode>`.
- **Speed:** overlap checks on 775 communities are heavy, so the view becomes a materialised view, `geo.quality_issues_mv`. It is refreshed by `pg_cron` nightly at 06:20 UTC, and after each publish (`commit_boundary_publish` calls `refresh materialized view concurrently`).

### I5 — Medium · Drafts from an import can only be published one by one
- After saving 14 parish drafts, you have to open and publish each one.

**Fix:** "Publish drafts from this import" on the run drawer.
1. Preview the impact of every draft: the L1 counts summed, and the L4 warnings listed.
2. Require the typed word `PUBLISH`.
3. Call the existing publish route once per area, in order: parishes, then towns, then communities.
4. Stop at the first failure and report which areas went live.

Each area's publish stays atomic.

### I6 — Low · `world-quality` is a second page id for the same screen
**Fix:** keep `world-quality` as an alias that opens Imports scrolled to the "Checks" section.

## P2.5 New and changed API (Part 2)

| # | Change | Where |
|---|---|---|
| B1 | `geo.list_boundaries_admin(p_level, p_parent)` + `GET /geo/boundaries?with=metrics` (L2) | migration + `geoRoutes.ts` |
| B2 | `checks jsonb` on `boundary_versions`; checks run inside `save_draft_border` (L4) | migration |
| B3 | `DELETE /geo/boundaries/:pcode/versions/:id` → status `discarded` (L6) | migration (status check) + route |
| B4 | `'community'` scope in `ZoneMapEditor`; Detail control (L8, L10) | `packages/geo-ui` |
| B5 | Pin bounds check; `POST /geo/places`; trigger `places_fill_pcode` + backfill; `geo.pin_change` (P2, P3, P5) | migration + route |
| B6 | `geo.check_import`, `geo.save_import_drafts`, `GET /geo/imports/:id` (I2, I3) | migration + route |
| B7 | `geo.quality_issues_mv` with 3 new checks, nightly cron and refresh on publish (I4) | migration |
| B8 | Bulk publish from a run: run by the client, one area at a time (I5) | admin |

## P2.6 Frontend files

| Folder | Files |
|---|---|
| `world-maps/levels/` | `LevelBrowserPage.tsx` (S36c), `BoundaryTable.tsx`, `LevelFilters.tsx`, `BorderEditor.tsx` (S36d), `VersionList.tsx`, `PublishDialog.tsx` (S36e), `levelsApi.ts`, `levelsFormat.ts` + `.test.ts` |
| `world-maps/pins/` | `PinsPage.tsx` (S36f), `PinTable.tsx`, `PinMap.tsx`, `PinEditDrawer.tsx`, `pinsApi.ts` + `.test.ts` |
| `world-maps/imports/` | `ImportsPage.tsx` (S36g), `ImportStepper.tsx`, `ImportRunsTable.tsx`, `ImportRunDrawer.tsx`, `QualityChecks.tsx`, `importsApi.ts` + `.test.ts` |

Other changes:
- `WorldMapsPage.tsx` becomes a router of about 40 lines over `JamaicaMapPage`, `LevelBrowserPage`, `PinsPage` and `ImportsPage`.
- Delete `PlacePanel`, `PinList` and `ImportPanel`.
- Every page renders the shared S36 header, `MapLevelTabs` and KPI strip.
- The "Places" tab label becomes **"Pins"** (P4).

## P2.7 Stitch README rows (add or change)
- **S36c** Level browser → `world-parishes`, `world-towns`, `world-communities` → `levels/LevelBrowserPage.tsx + levels/BoundaryTable.tsx + levels/LevelFilters.tsx`
- **S36d** Border editor → same pages → `levels/BorderEditor.tsx + levels/VersionList.tsx`
- **S36e** Publish dialog → same pages → `levels/PublishDialog.tsx`
- **S36f** Map pins → `world-places` → `pins/PinsPage.tsx + pins/PinTable.tsx + pins/PinMap.tsx + pins/PinEditDrawer.tsx`
- **S36g** Imports and checks → `world-imports` → `imports/ImportsPage.tsx + imports/ImportStepper.tsx + imports/ImportRunsTable.tsx + imports/ImportRunDrawer.tsx + imports/QualityChecks.tsx`
- **S15** and **S16** → `Superseded by S36f / S36g — do not build.`

Write the full paths (`apps/admin/src/components/admin/world-maps/...`) in the real rows.

## P2.8 Tests (Part 2)

| # | Test | Where |
|---|---|---|
| U1 | The Publish dialog renders `places_moving` and the sample names | vitest |
| U2 | `list_boundaries_admin(3, null)` returns 775 rows, each with a non-null `parent_name` | SQL |
| U3 | Saving an invalid shape is refused; a shape outside its parent saves with a warning in `checks` | SQL |
| U4 | Discard works only on drafts; a published version → 400 | Deno |
| U5 | After publish + reload, the Live version is first | vitest |
| U6 | An upload with 2 features is refused with the "Use Imports" message | vitest |
| U7 | A pin PUT with lat 0 → 400, and the pin is unchanged | Deno |
| U8 | After the backfill, the Spanish Town pin's pcode starts with `JM0807` | SQL |
| U9 | The Kind column shows "Town centre", not "active" | vitest |
| U10 | Imports: "Save as drafts" stays disabled until a check of the same file passes with 0 broken | vitest |
| U11 | `check_import` on a 775-feature file finishes in one call, under 10 s | Deno (timed) |
| U12 | Run chip: broken → red, unknown → amber, otherwise green | vitest |
| U13 | `quality_issues_mv` has the 3 old checks + 3 new ones; the `same_name` count is 71 today | SQL |
| U14 | Bulk publish stops at the first failure and reports what went live | vitest |
| U15 | `stitch-fidelity.mjs --report` = 100% for S36c–S36g | CI + PR |

## P2.9 Build order (Part 2)
1. Stitch S36c–S36g → HTML, PNG and README rows (mark S15/S16 superseded).
2. Migrations B1, B2, B3, B5, B6 and B7, plus SQL checks U2, U3, U8 and U13.
3. Routes, plus the `geo-ui` change (B4). Deploy `platform-catalog`, then run U4, U7 and U11.
4. `levels/` folder, with U1, U5 and U6. Do one test publish on a draft in a quiet parish.
5. `pins/` folder with U9. `imports/` folder with U10, U12 and U14.
6. Fidelity at 100%, side-by-side screenshots, commit, and deploy the admin site.
