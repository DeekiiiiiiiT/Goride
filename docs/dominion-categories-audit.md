# Dominion · Categories (place taxonomy) — audit (Rev 1, 29 Oct 2026)

**Page:** Dominion → Master data → Places and Maps → **Categories** (`?page=places-categories`).
**Today's code:** `PlacesPage mode="categories"` → [PlaceCategories.tsx](../packages/platform-ops-ui/src/places/PlaceCategories.tsx), 108 lines. It renders five flat lists, each item with a "Retire" link.
**Server:** `explorer` → [place_admin.ts](../supabase/functions/explorer/place_admin.ts#L232) (`GET /admin/taxonomy`, `PATCH /admin/taxonomy/:table/:id`).
**Data:** `places.category_group`, `places.category`, `places.place_type`, `places.facility_type`, `places.brand`.

Audit only. No code was changed. All numbers come from production (`csfllzzastacofsvcdsc`) on 29 Oct 2026 using read-only SQL.

**Stitch:** see [docs/stitch/categories-prompt.txt](stitch/categories-prompt.txt). It defines two screens:
- **S37 Categories**
- **S37b Retire dialog**

---

## 0. READ FIRST — the Stitch screen is the spec

Last time the build "followed the audit" but still made up its own screen. These rules exist to stop that.

**Order of work**
1. Build S37 and S37b in Stitch.
2. Export the HTML to `docs/stitch/dominion-redesign/html/S37-categories.html` and `html/S37b-retire-dialog.html`, with PNGs.
3. Add the README rows (§7).
4. Only then start React. No UI code may be written before the HTML is in the repo.

**Who decides what**

| Topic | Winner |
|---|---|
| Layout, block order, spacing, colours, icons, wording, empty/loading/error text | **Stitch HTML** |
| Data, counts, rules for retire/restore, permissions, API | **This audit** |
| Anything else | Stitch for looks, audit for data |

**Porting rules**
- Use the same structure and classes as the Stitch HTML.
- Copy labels word for word.
- Swap only the sample values.
- Add nothing and remove nothing. §5 is guidance only.

**Proof in the PR**
- `node scripts/stitch-fidelity.mjs --report` at **100%** for S37 and S37b. CI enforces only 80%, so 100% is the bar here.
- Every React file is listed in the README row, joined by ` + `.
- Side-by-side Stitch PNG vs live screenshots in light, dark, and 390 px phone.

---

## 1. Why this page matters

This is not a settings page. It drives the live apps:

- **Plug** reads `GET /places/taxonomy` live (`apps/plug/src/live/ServiceGrid.tsx`, `ExploreSheet.tsx`, `maps.tsx`, `PlaceFacilities.tsx`). The Plug home grid chips come from `place_type.plug_chip`.
- **Fuel** depends on place type `gas_station` (`match_profile = fuel`). 205 stations point to it.
- **Tolls** depend on `toll_plaza` (`match_profile = toll`). 12 plazas point to it.
- **The station register** uses `places.brand`. All 17 brands are on stations: 140 stations have a brand.

A one-click mistake here changes what customers see in Plug.

---

## 2. Live data on 29 Oct 2026

| Item | Total | Retired | In use |
|---|---|---|---|
| Groups | 5 | 0 | — |
| Categories | 16 | 0 | 11 have at least one place type. **5 have none:** 2.2, 2.3, 3.2, 4.2, 4.3 |
| Place types | 17 | 0 | **2** have places: Gas station 205, Toll plaza 12. The other 15 have 0. |
| Facility types | 44 | 0 | **3** are used, across 229 place facilities |
| Brands | 17 | 0 | 17. All are fuel brands (TotalEnergies 42, Rubis 20, Cool Oasis 19, …). **0 logos.** |
| Place types with a Plug chip | 8 | — | Gas station, car wash, mechanic garage, parts store, tyre shop, roadside assistance, public restroom, toll plaza |

Other facts:
- `places.taxonomy()` returns only `active` rows. Anything retired disappears from every screen.
- There are no triggers on the five tables, so no change history is kept.
- Foreign keys: `place.place_type → place_type`, `place.brand_id → brand`, `place_facility.facility_type → facility_type`, `place_type.category_code → category`, `category.group_code → category_group`. A retired type can still have live places pointing at it.

---

## 3. Findings

**Severity**
- **High:** can break live apps or lose data.
- **Medium:** missing or misleading.
- **Low:** tidy-up.

### C1 — High · One click on "Retire" can pull Gas station out of Plug
- Every row has a "Retire" link that fires `PATCH {retire:true}` immediately. There is no confirm, no reason, and no impact shown ([PlaceCategories.tsx:29](../packages/platform-ops-ui/src/places/PlaceCategories.tsx#L29)).
- The server sets `active=false` with no checks ([place_admin.ts:600](../supabase/functions/explorer/place_admin.ts#L600)).
- Retiring **Gas station**:
  - removes the fuel chip from Plug at once;
  - leaves 205 stations pointing at a retired type.
- Retiring **Road & Automotive** leaves its 4 categories active under a retired parent.

**Fix:** make it impossible to retire something that is in use.
- New RPC `places.retire_taxonomy(p_table, p_id, p_reason, p_actor)`. It refuses (raises `in_use`) when the item has any of the following:
  - **Place type:** places > 0, or another type's `search_as_facility` points at it.
  - **Facility type:** `place_facility` rows > 0, or it is in any `place_type.default_facilities`.
  - **Category:** active place types or facility types under it.
  - **Group:** active categories under it.
  - **Brand:** places with that brand.
- The route returns **409** with `{ blocked_by: { places: 205, plug_chip: true, children: 0, … } }`.
- A reason (at least 10 characters) is required.
- The UI opens the **S37b Retire dialog**, which shows the impact counts first. When anything is in use, the dialog has no Retire button. It shows the blocking counts with links instead ("Move 205 places first").

### C2 — High · Retired items vanish; there is no undo
- `places.taxonomy()` filters `where active`. A retired row is gone from this page too, so it cannot be restored.

**Fix:**
- New admin RPC `places.taxonomy_admin()`. It returns **all** rows with `active`, plus in-use counts (§6).
- The public `places.taxonomy()` stays active-only, so Plug is unchanged.
- The page gets a **Retired** tab with a **Restore** action: `PATCH {retire:false, reason}`.
- Restore is refused when the parent is retired. The dialog says "Restore 'Road & Automotive' first".

### C3 — High · No history of who changed what
- No trigger or log exists on the five tables.

**Fix:**
- New table `places.taxonomy_change`: `id, table_name, row_key, action (create|update|retire|restore), before jsonb, after jsonb, reason, actor_id, at`.
- An `after insert or update` trigger on all five tables writes to it:
  - the actor comes from `current_setting('request.jwt.claim.sub', true)`, or the `p_actor` set by the RPC through `set_config('places.actor', …)`;
  - the reason comes from `current_setting('places.reason', true)`.
- RLS on, with no direct access; reads go through the admin route.
- The detail panel shows the last 10 changes for the selected item.

### C4 — Medium · Nothing can be added or edited from the page
- The server `PATCH` already accepts `label`, `colour`, `attribute_schema`, `default_geofence_m`, `name` and `aliases`, but the UI only offers Retire.
- There is no create route.

**Fix:**
- `POST /admin/taxonomy/:table` (owner only) creates a row. Slugs and codes are lower-case `a-z0-9_`, unique, and cannot be changed after creation.
- The detail panel gets **Edit** (a drawer using the existing `PATCH`).
- Extend the PATCH allow-list with `icon`, `sort`, `default_facilities`, `logo_url`, `searchable`, and the Plug fields `plug_chip`, `plug_label`, `plug_map_label`, `grid_icon`, `grid_sort` and `empty_hint`.
- `match_profile` stays **read-only**. It is an engine contract (`fuel`, `toll`) and is changed only by migration.
- Every write requires a reason (C3).

### C5 — Medium · Flat lists hide how things fit together
- Five separate lists. There is no group → category → place type tree.
- Place-type labels are underlined like links.
- The form preview appears at the bottom of a long page, off-screen.

**Fix:** a two-pane layout (S37):
- **Left:** a tree of group → category → place types, with facility types listed under their category.
- **Right:** a detail panel for the selected item.
- Brands get their own tab, because brands are not part of the tree.

### C6 — Medium · Empty and unused items look the same as busy ones
- 5 categories have no place types.
- 15 of 17 place types have no places.
- 41 of 44 facility types are unused.

**Fix:**
- Every tree row shows its in-use count.
- Rows with 0 show a muted "Not used yet" label. They are never hidden.
- A category with no place types shows the chip "No place types".
- The KPI strip shows "in use" next to each total.

### C7 — Medium · Brands have no scope
- All 17 brands are fuel brands, but nothing records that.
- Any future brand picker (for example on a supermarket) would offer Texaco.

**Fix:**
- Add `places.brand.place_types text[] not null default '{}'`.
- Backfill to `'{gas_station}'` for all 17 (every branded place is a gas station).
- The register's brand picker filters by the place's type.
- The Brands tab shows the scope as chips.

### C8 — Medium · The Plug chip settings are invisible
- Eight place types drive the Plug home grid (`plug_chip`, `plug_label`, `plug_map_label`, `grid_icon`, `grid_sort`, `empty_hint`). None of these fields show on this page.

**Fix:**
- The place-type detail panel has a "Plug" section showing these fields, plus a small live preview of the chip.
- A badge "In Plug" appears on the tree row.

### C9 — Low · No brand logos
- 0 of 17 brands have `logo_url`.

**Fix:**
- The Brands table shows a monogram tile when there is no logo, plus an "Add logo" action (a URL field in the Edit drawer).
- The KPI strip shows "Logos 0 / 17".

### C10 — Low · Wrong status codes
- `GET /admin/taxonomy` returns **403 for every error**, including database errors ([place_admin.ts:240](../supabase/functions/explorer/place_admin.ts#L240)).
- `requireOwner` throws, which ends up as a **400** on PATCH.

**Fix:**
- Authorisation failures → 403.
- Validation → 400.
- In use → 409.
- Anything else → 500 with "Could not load categories".

### C11 — Low · Full-row pastel backgrounds
- Group rows are painted with their hex colour (`#ffe6cc`, …). That fails contrast in dark mode and looks like a warning.

**Fix:**
- Show the colour as a 12 px swatch dot.
- Rows use Dominion surfaces.
- Dark mode uses Dominion tokens.

### C12 — Low · No header, no breadcrumb, no loading skeleton
**Fix:**
- Breadcrumb "Dominion › Master data › Places and Maps › Categories".
- Title and subtitle.
- Use the S3 states kit.

### Not a finding
- `PATCH` is owner-only (`requireOwner` throws for others) and reads are platform-admin only. That is correct.

---

## 4. Must not show
- No places, customers, drivers, or orders. Counts only.
- No "REGION" or "LOC" labels.
- No AI badges.

---

## 5. Layout (guidance; Stitch S37 wins)

```
Header  Dominion › Master data › Places and Maps › Categories        [+ Add ▾]
Categories — "The groups, categories, place types, facilities and brands every app reads."

KPI: Groups 5 · Categories 16 (11 in use) · Place types 17 (2 in use) · Facility types 44 (3 in use) · Brands 17 (logos 0)

Tabs: Tree | Brands | Retired (0) | History

Tree tab
┌ Tree (5/12) ───────────────────────┐ ┌ Detail (7/12) ──────────────────────────┐
│ [🔍 Filter]                        │ │ Gas station · gas_station · Place type   │
│ ● Road & Automotive         7 types│ │ Road & Automotive › Fuel & Energy        │
│   ▾ Fuel & Energy                  │ │ Used by: 205 places · In Plug · Fuel     │
│       Gas station   205  [In Plug] │ │ Settings: geofence 150 m · match fuel 🔒 │
│   ▸ Vehicle Maintenance  4 types   │ │ Default facilities: chips (4)            │
│   ▸ Roadside Emergency   1 type    │ │ Fields this type stores: form preview    │
│ ● Food, Drink & Social             │ │ Plug chip: preview + label, map label,   │
│   ▸ Quick Bites  1 type            │ │   icon, sort, empty hint                 │
│   ▸ Dining   No place types        │ │ Recent changes (10)                      │
│ …                                  │ │ [Edit]                  [Retire…]        │
└────────────────────────────────────┘ └──────────────────────────────────────────┘

Brands tab: table — logo/monogram · name · aliases · scope chips · places · [Edit] [Retire…]
Retired tab: same row style with [Restore…]
History tab: table — when · item · action · by · reason
```

**S37b Retire dialog**
- Title: "Retire Gas station?"
- Impact list with counts:

| Impact | Count |
|---|---|
| Places using it | 205 |
| Plug chip | 1 |
| Default facilities | — |
| Children | 0 |

- **Blocked state (anything in use):** red-free neutral panel reading "You can't retire this while it's in use", with links that open the register filtered to that type. No Retire button.
- **Allowed state:** Reason field (required) and a danger "Retire" button.

---

## 6. Data and API

| # | Change | Where |
|---|---|---|
| A1 | `places.taxonomy_admin()` returns all rows, `active`, and counts: `places`, `facilities_used`, `children`, `in_plug`, `blocked_by` | migration |
| A2 | `places.retire_taxonomy(p_table, p_id, p_reason, p_actor)` and `places.restore_taxonomy(...)`, with the in-use and parent rules (C1, C2) | migration |
| A3 | `places.taxonomy_change` table, trigger on 5 tables, RLS with no direct access (C3) | migration |
| A4 | `places.brand.place_types text[]` plus backfill `'{gas_station}'` (C7) | migration |
| A5 | `GET /admin/taxonomy` → `taxonomy_admin()`; `POST /admin/taxonomy/:table`; `PATCH` retire/restore through A2; extended allow-list (C4); `GET /admin/taxonomy/history?table=&id=`; status codes (C10) | `explorer/place_admin.ts` |
| A6 | The public `GET /places/taxonomy` is **unchanged** | — |

**Frontend**

New folder `packages/platform-ops-ui/src/places/categories/`. It stays in the shared package, where `PlacesDesk` already lives.

| File | Contents |
|---|---|
| `CategoriesPage.tsx` | Header, KPI strip, tabs |
| `TaxonomyTree.tsx` | Left pane of the Tree tab |
| `TaxonomyDetail.tsx` | Right pane, including the Plug chip preview and recent changes |
| `BrandsTable.tsx` | Brands tab |
| `RetiredList.tsx` | Retired tab |
| `TaxonomyHistory.tsx` | History tab |
| `RetireDialog.tsx` | S37b |
| `TaxonomyEditDrawer.tsx` | Uses `DominionRecordDrawer` (S5) patterns for reason-to-save |
| `categoriesApi.ts`, `categoriesFormat.ts` + `.test.ts` | API calls and formatting |

**Wiring**
- `PlacesDesk` renders `CategoriesPage` for `categories`.
- Delete `PlaceCategories.tsx`. Keep `AttributeFields.tsx`; the detail panel uses it for the form preview.
- Each file starts with `// Stitch: dominion-redesign/<S37 or S37b id>`.

---

## 7. Stitch README rows

- **Add S37:**
  `| S37 | Categories | <id> | html/S37-categories.html | places-categories | packages/platform-ops-ui/src/places/categories/CategoriesPage.tsx + …/TaxonomyTree.tsx + …/TaxonomyDetail.tsx + …/BrandsTable.tsx + …/RetiredList.tsx + …/TaxonomyHistory.tsx | Ported. Tree + detail; retire blocked while in use. |`
- **Add S37b:**
  `| S37b | Retire dialog | <id> | html/S37b-retire-dialog.html | places-categories | packages/platform-ops-ui/src/places/categories/RetireDialog.tsx | Ported. Impact first; reason required. |`

Write out the full paths in the real rows.

---

## 8. Tests

| # | Test | Where |
|---|---|---|
| T1 | Retiring `gas_station` raises `in_use`. `active` stays true. Nothing is written to `taxonomy_change`. | SQL check |
| T2 | Retiring an unused type (e.g. `beach`) works, writes 1 change row with reason and actor, and the type disappears from public `taxonomy()` | SQL check |
| T3 | Retiring group 1 is refused while its categories are active | SQL check |
| T4 | Restoring a type whose category is retired is refused | SQL check |
| T5 | `taxonomy_admin()` totals match the table counts (5/16/17/44/17); `places` for gas_station = 205 | SQL check |
| T6 | Brand backfill: every brand has `place_types = {gas_station}` | SQL check |
| T7 | Non-owner PATCH/POST → 403; in use → 409; bad slug → 400 | Deno |
| T8 | `match_profile` in a PATCH body is ignored | Deno |
| T9 | Public `GET /places/taxonomy` returns the same JSON before and after the migration (snapshot) | Deno |
| T10 | Retire dialog shows no Retire button when `blocked_by` has any count > 0 | vitest |
| T11 | No row uses its group colour as the background (only the swatch) | vitest |
| T12 | `stitch-fidelity.mjs --report` = 100% for S37 and S37b | CI + PR |

---

## 9. Build order
1. Stitch S37 and S37b → HTML, PNG, README rows.
2. Migrations A1–A4 with checks T1–T6.
3. Routes A5 with T7–T9. Deploy `explorer`, then check Plug still loads its grid.
4. The `categories/` folder, ported from Stitch, with T10–T11.
5. Fidelity at 100%, side-by-side screenshots (light, dark, phone), commit, deploy the admin site.
