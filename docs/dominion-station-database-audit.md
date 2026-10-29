# Dominion Station Database — rebuild audit

**Rev 1 · 2026-10-29** · Audit only. No code was changed. Project `csfllzzastacofsvcdsc`. All numbers below were read from production today.

Written for: the owner, and Cursor implementing it. Screen prompt: [stitch/station-database-prompt.txt](stitch/station-database-prompt.txt). Sister audit: [dominion-station-analytics-audit.md](dominion-station-analytics-audit.md). Both pages read the same `places.place` rows and must agree.

Page: Dominion → Fuel → **Station database** (page id `fuel-stations`, Stitch row S17). Today it renders the shared [StationDatabaseView.tsx](../packages/platform-ops-ui/src/stations/StationDatabaseView.tsx) through [apps/admin/…/StationDatabaseView.tsx](../apps/admin/src/components/fuel/stations/StationDatabaseView.tsx). Fleet also uses that shared component ([apps/fleet/…/StationDatabaseView.tsx](../apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx)).

---

## 0. READ FIRST — the Stitch screens are the spec. Port them; don't redesign them.

The owner designs two screens in Stitch: **S17** (the list) and **S17b** (the record drawer). **The exported Stitch HTML is the UI to build, element for element.** This audit says where the data comes from, how it's computed, and how saves must work. It does **not** give the implementer freedom to design the screen. A previous build "followed the audit" and produced a different screen. That counts as a failed build.

**Order of work:**
1. Ship the two data-loss fixes S1 and S2 now. They don't depend on Stitch.
2. The owner finishes the Stitch screens. The HTML is saved to `docs/stitch/dominion-redesign/html/S17-station-database.html` and `html/S17b-station-drawer.html`, with PNGs in `screenshots/`.
3. **Only then** is the React UI written. If those HTML files aren't in the repo yet, build the backend (§6.1, §6.2) and stop. Don't write UI from the wireframe in §5.

**Who wins when they disagree:**

| Topic | Source of truth |
|---|---|
| Layout, block order, sizes, spacing, colours, fonts, icons, pills, chips, borders, corner radius, table columns and their order, drawer tabs and their order, wording of titles, labels, buttons, captions and empty states | **Stitch HTML.** The §5 wireframe and the wording in this audit are guidance only. |
| Which value goes in which slot, filters and their rules, issue flags, save behaviour (changed fields only, reason required), permissions, states, tests | **This audit** |

**Porting rules:**
1. Rebuild the Stitch HTML's structure in JSX: same sections, same order, same nesting, same Tailwind classes/tokens. Copy the class lists; don't re-style.
2. Copy every heading, label, column name, chip, button and caption **word for word**.
3. Replace only the Stitch **sample values** (station names, prices, counts, dates) with live data from §6. Keep the element and its styling.
4. **Don't add** blocks, columns, filters, chips, tabs, badges or icons that aren't in Stitch. **Don't remove** any. If a Stitch element has no data source, render it with its empty state and list it in the PR description.
5. Don't swap Stitch components for "something similar" (a dropdown for a chip row, a modal for the drawer, a different map style).
6. No old UI kit (`@roam/ui`, `components/ui`) in the page shell or drawer, and no shadcn `Table`/`Badge`/`Sheet` look-alikes in place of the Stitch markup. The **Resolution** tab is the one exception: it mounts the existing `ResolutionQueueTab` unchanged (§4). Only the tab strip around it follows Stitch.
7. Dark mode comes from the Stitch Dark variants, not from guessing.
8. Splitting into files (§6.3) is fine. Each file still holds its part of the Stitch markup unchanged.

**Proof (part of the exit checks, §8):**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for S17 and S17b, not just the 80% CI floor. Each README row must list every React file of that screen joined with ` + `, because the script only reads the files named there.
- The PR includes side-by-side screenshots: the Stitch PNG on the left, the running page on the right. Screens: the list at 1440 px (light and dark), the drawer open on the Location tab, and the list at 390 px. Pass = same blocks in the same order, same columns, same chips, same drawer tabs, same labels. Only the data values differ.

---

## 1. What this page is for

This is the **master list of fuel stations**: the record every app matches fills and prices against. Its one user is the data owner (or a staff member they trust). The page answers five questions:

1. **Find any station fast** — by name, alias, brand, parish, address or plus code.
2. **What is wrong with this record?** — a missing brand, wrong parish, unchecked pin, possible duplicate, or not verified.
3. **Fix it safely** — edit one field without wiping the others, with a reason, and recorded in history.
4. **Move pending → verified** — the 148 pending stations are the backlog.
5. **Keep it clean** — catch duplicates and non-stations before they get matched.

Customer data (fills, vehicles, drivers, amounts) is never shown. Only anonymised counts are allowed: "12 fills · last 3 days ago" ([[dominion-master-data-rule]]).

## 2. Data that exists (production, 29 Oct)

| Fact | Value |
|---|---|
| Gas stations in `places.place` | **204**: 56 verified, 148 pending |
| Where they came from | 147 pending = CSV import (`dataSource: import`), 50 verified = Fleet, 7 manual |
| Parish code (`pcode`) | 204 / 204 present. The `place_fill_pcode` trigger fills it from the pin. |
| Parish text | 42 different spellings; **72 disagree with the pcode** (see analytics audit F3) |
| Brand | 65 have no `brand_id` (the old view shows them as "Independent"). 17 brands, 0 logos. |
| Pin check | **204 / 204 `unchecked`**, including all 56 verified stations |
| Custom geofence | 55 stations |
| Phone / website | 59 / 0 |
| Amenities | 28 stations have amenities **only** in `legacy_payload.amenities`. **0** gas stations have a `place_facility` row other than the automatic `fuel_pump`. |
| GPS aliases | 11 rows in `place_alias` |
| Possible duplicates | **10 pairs within 60 m**, 7 of them at the exact same point (0 m). Examples: "MZ HOLDINGS LTD." / "MZ HOLDINGS LTD (COOL OASIS)" / "MZ HOLDINGS GAS BWOY 2"; "TOMIJAM CO LTD T/A RICKS" / "TOMIJAM COMPANY LTD #2"; and two verified stations 49 m apart ("RUBiS Half Way Tree" / "TotalEnergies, HWT Clock Tower"). |
| Likely non-stations | 76 of the 147 imported names are company names ("… LTD", "T/A", "SRL"). At least two are not fuel stations: "RAPIDPRO PARTS & SERVICES LTD.", "CRYSTAL VISIONS LTD". |
| Same name, different place | "Michaels Service Station" / "Michael's Service Station" (both verified, 1.2 km apart). This is the pair visible in your screenshot. |
| Live prices | 10 stations (from the Price Engine) |

---

## 3. Findings

Severity: **Critical** = data loss or a false record. **High** = the page shows wrong data or blocks the rebuild. **Medium** = a quality or UX defect.

| # | Sev | Finding | Fix |
|---|---|---|---|
| S1 | **Critical** | **Editing a station from this list wipes its data.** The page loads stations with `fields=list`. That projection ([fuel_controller.tsx:6298](../supabase/functions/_fleet-server/fuel_controller.tsx#L6298)) drops `parish`, `plusCode`, `geofenceRadius`, `contactInfo`, `amenities`, `pinConfirmed`, `gpsAliases`, `verifiedAt`, `city` and `category`. Every save from the page (`updateStationDetails`, the star toggle, the Verified tab's geofence pencil) spreads that cut-down record and POSTs it. `POST /stations` then does `kv.set` with the body as-is ([:6673](../supabase/functions/_fleet-server/fuel_controller.tsx#L6673)). The trigger `places.apply_station_row` overwrites **every** column and `legacy_payload`. Result: parish, geofence, phone, amenities, GPS aliases and verified date are erased, and `pin_state` resets to `unchecked`. Only `pcode` survives (trigger). **No station is damaged yet**: all 204 were last written by the 28 Oct migration. Fleet's copy of the page has the same path. | In `POST /stations`, merge before writing: read `station:${id}`, then `kv.set(key, { ...existing, ...incoming })`, so a field missing from the body keeps its stored value, and only an explicit `null` or `""` clears it. Add a Deno test: POST `{id, isPreferred: true}` for a station with parish, geofence and aliases → all three are unchanged. |
| S2 | **Critical** | **The same full-overwrite bug is in the Places register.** `PATCH /admin/register/:id` → `savePlace` ([place_admin.ts:431](../supabase/functions/explorer/place_admin.ts#L431)) builds every column from the body and sets missing ones to `null`. `pin_state` defaults to `unchecked` and `attributes` to `{}`. The new page (§6) writes through this route, so it must be safe first. | For an update (`id` given), build the row only from keys **present** in the body (`'phone' in body`, …), then `update(row)`. Create keeps the current full row. Add a Deno test: PATCH `{ name }` leaves `phone`, `geofence_m`, `pin_state` and `attributes` unchanged. |
| S3 | High | **Every row says "Unknown Parish."** The list projection has no `parish`, and `buildContext` fills in `'Unknown Parish'` ([StationDatabaseView.tsx:380](../packages/platform-ops-ui/src/stations/StationDatabaseView.tsx#L380)). Searching by parish therefore finds nothing. | The new page reads `places.place` through `/admin/register` (§6). It shows the parish from `pcode` → `geo.boundaries` and the stored text only as a "Parish text" field in the drawer. |
| S4 | High | **"Regional Efficiency" column is the geofence.** In [VerifiedStationsTab.tsx:438](../packages/platform-ops-ui/src/stations/VerifiedStationsTab.tsx#L438) the header says "Regional Efficiency", but the cell (line 514) shows the geofence radius. And because the list projection drops `geofenceRadius`, all 56 show the **default** radius, even though 55 stations have a custom one. | In the new page the column is **Geofence**, read from `geofence_m`, with "default" in muted text when it's null. |
| S5 | High | **The drawer shows a fake price and an always-empty tab.** [StationDetailView.tsx:288](../packages/platform-ops-ui/src/stations/StationDetailView.tsx#L288) shows `stats.lastPrice` as the headline, and "Avg Price" uses `stats.avgPrice`. Both are old KV figures (present on only 35 stations), so most show `$0.00`, and they disagree with the Price Engine. "Transaction History" is built from `logs`, which Dominion passes as `[]`, so it always reads (0). In Fleet it lists vehicle ids, which is customer data and must never show in Dominion. | The Dominion drawer shows **Price Engine prices** (`price_current` via `/admin/register/:id`, already returned as `prices`) with confidence, reports and age. Instead of transactions it shows the anonymised **Fills: N · last X ago** from `station-fill-summary`. No transaction list in Dominion. |
| S6 | High | **The page runs data migrations every time it opens.** `fetchData` runs `migrateStationStatuses` (behind a server flag) and **writes every station in `localStorage.station_overrides` to the server** ([:178–203](../packages/platform-ops-ui/src/stations/StationDatabaseView.tsx#L178)). A stale browser can push old station copies back over the master list just by opening the page, through the S1 overwrite. | The Dominion page runs no migrations and never reads `localStorage` for data. (Both legacy migrations stay in the shared component for Fleet until Fleet's own audit.) |
| S7 | High | **Wrong permission level.** `fuel-stations` is `standard` in [permissions.ts:533](../apps/admin/src/utils/permissions.ts#L533), but every `/admin/register*` route calls `requireOwner`. | Reads (`GET /admin/register`, `/admin/register/:id`, `/admin/taxonomy`) use `requirePlatformAdmin`. Writes stay `requireOwner`. For staff the page is read-only: edit buttons are disabled with the tooltip "Only the owner can change master data." |
| S8 | High | **Duplicates are invisible.** There are 10 pairs within 60 m, 7 at the exact same point. Imported company names are mixed in with real stations. Nothing on the page flags either. | Add a "Possible duplicate" flag (another active gas station within 60 m, or the same normalised name within 2 km), computed in SQL (§6.1). The drawer shows the other station(s) with a **Merge** button, using the existing D3 merge (`body.duplicateOf` → `status = 'duplicate'`). |
| S9 | Medium | **Amenities were never migrated.** 28 stations have amenities only in `legacy_payload`. `place_facility` has none, so Plug and the new drawer show none. | One migration: for each `legacy_payload->'amenities'` value, insert a `place_facility` row using the facility slug that matches the label (unmatched labels go into `attributes.unmapped_amenities`; nothing is dropped). After it runs, the drawer reads `place_facility` only. |
| S10 | Medium | **Fake labels.** "REGION: JM-KGN", "LOC: KINGSTON / PARISH REGISTRY JMD" and two "The data is not in yet." lines are hardcoded. One of them sits under a fully loaded list. | Remove them from this page. Empty states say what is empty ("No stations match these filters"). (The same labels are on about 25 other Dominion pages; see §9.) |
| S11 | Medium | **Errors look like success.** Load failure only shows a toast, and the table then shows "The data is not in yet." | Use the S3 states kit: loading skeleton, error card with Retry, and a filtered-empty state. |
| S12 | Medium | **No filters, sorting, paging, flags or bulk actions.** Only free-text search, and all 204 rows are rendered at once. | See §5: filters, sort, 50 per page, a flag column and a bulk bar. The register route already pages at the server. |
| S13 | Medium | **"Verified" is a second copy of the same list.** The tab re-renders the same stations filtered by status, with its own columns. | Make Verified a **filter chip** on the one list. The Verified tab's unique tools (GPS aliases, Sync Master Pin, geofence) move into the drawer's **Location** tab. |
| S14 | Medium | **"Preferred" star.** Preferring a station is a customer (Fleet) choice. 0 stations use it in Dominion. | Not on the Dominion page. |
| S15 | Medium | **`verified_at` is missing on 52 of 56 verified stations.** | Covered by analytics audit F8 (backfill). The list shows "Verified" with the date when it exists, and the drawer's history shows who verified it from `master_change_log` from now on. |
| S16 | Medium | No dark mode. The page hardcodes light colours; the shell has a dark toggle. | Build on Dominion tokens from the new Stitch screen. |

---

## 4. What stays

| Item | Where in the new page |
|---|---|
| **Resolution** tab (Unresolved stops, Spatial review, Fuel places, Silent attach) | It stays as the page's second tab, unchanged. It is the matching workflow, not the master list ([[feedback-preserve-existing-ui]]). |
| Add station (AddStationModal with the duplicate check) | The "+ Add station" button opens the register editor, `POST /admin/register` with `placeType: gas_station`. The nearby-duplicate check (`/admin/register/nearby`) runs before save. |
| Demote verified → pending | Drawer action, owner only, with a reason. |
| GPS aliases, Sync Master Pin, geofence edit | Drawer → Location tab |
| CSV import / export | Import uses the existing `/admin/register/import`. Export downloads the current filtered list. |

---

## 5. The page — layout and every block

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb · "Station database" · subtitle      [Export CSV] [+ Add station]│
│ SUMMARY STRIP: 204 stations · 56 verified · 148 pending · 10 priced ·      │
│                4 issue types → "View issues"                               │
├───────────────────────────────────────────────────────────────────────────┤
│ TABS: [ Stations 204 ] [ Resolution 7 ]                                    │
├───────────────────────────────────────────────────────────────────────────┤
│ SEARCH [name, alias, brand, address, plus code]                            │
│ FILTERS: Status ▾  Parish ▾  Brand ▾  Pin ▾  Source ▾  Issue ▾   Reset     │
│ CHIPS:   Verified · Pending · Possible duplicate · No brand · Pin unchecked│
├───────────────────────────────────────────────────────────────────────────┤
│ ☐ Station / address │ Brand │ Parish │ Status │ Pin │ Geofence │ Price │   │
│   Fills │ Issues │ Updated                                        │ ›    │
│ … 50 rows …                                       ‹ 1 2 3 4 5 ›            │
├───────────────────────────────────────────────────────────────────────────┤
│ BULK BAR (when rows ticked): Set brand · Mark pin checked · Verify ·       │
│                              Mark duplicate of… · Export selected          │
└───────────────────────────────────────────────────────────────────────────┘
  DRAWER (S5) → tabs: Details · Location · Prices · History
```

### Summary strip
These are counts, not KPI cards. This is a working list; the analytics page has the charts. Each number is a link that sets the matching filter. "4 issue types" opens the Issue filter.

### Filters (URL-held: `?page=fuel-stations&status=pending&pcode=JM06&issue=duplicate&p=2`)

| Filter | Values | Source |
|---|---|---|
| Status | Verified, Pending, Duplicate, Closed | `place.status` |
| Parish | The 14 from `geo.boundaries` | `left(pcode,4)` — never the text |
| Brand | 17 brands + "No brand set" | `brand_id` |
| Pin | Unchecked, Confirmed, Offset | `pin_state` |
| Source | Fleet, Plug, Manual, CSV import | `origin_app` + `legacy_payload->>'dataSource'` |
| Issue | Possible duplicate, No brand, Parish text mismatch, Pin unchecked, Company-style name, Not verified | Computed (§6.1) |

### Table columns

| Column | Content |
|---|---|
| ☐ | Bulk select (owner only) |
| Station / address | Name in bold, address below in muted text. Click opens the drawer. |
| Brand | Brand name, or "No brand set" in muted text |
| Parish | Parish name from the pcode. A small amber dot if the stored text disagrees (tooltip shows the text). |
| Status | Pill: Verified (green) / Pending (amber) / Duplicate (grey) |
| Pin | Unchecked (grey) / Confirmed (green) / Offset (amber) |
| Geofence | "150 m", or "default" in muted text |
| Price | E10-87 price from the Price Engine, or "—". A hollow dot if outdated. |
| Fills | Anonymised count, e.g. "12 · 3d ago" (`station-fill-summary`) |
| Issues | Up to 3 chips, then "+2" |
| Updated | Relative time |

Default sort: Issues (most first), then name. Every column header sorts. 50 rows per page.

### Drawer (S5 record editor) — 4 tabs

1. **Details**: name, brand (select), address, phone, website, status, parish (read-only from the pin, with the stored text shown below with a "Use map parish" button when it differs), and amenities (`place_facility`, chip picker). Saving needs a reason and writes to `master_change_log` (S5 rule). Only changed fields are sent (S2).
2. **Location**: a Leaflet map with the pin (drag to move, owner only), plus code, geofence slider (10–2000 m) with its circle drawn, pin state buttons (Confirmed / Offset), GPS aliases list (add/remove), Sync Master Pin, and nearby stations within 200 m with distances and **Merge into this** buttons.
3. **Prices**: one row per grade from `price_current`: price, Gap above Petrojam, confidence, reports, age (`last_report_at`, analytics F4), and an "Outdated" label. A link: "Open in Price Engine".
4. **History**: `master_change_log` rows (who, what, reason, when) and `place_evidence` rows (Plug pin reports). Fills appear here only as anonymised counts.

Drawer footer: Verify / Demote / Mark duplicate / Close (owner only), each asking for a reason.

### Resolution tab
Unchanged. Its count badge stays.

### States
Loading skeleton rows. Error card with Retry. "No stations match these filters" with a "Reset filters" button. A read-only banner for staff: "You can view stations. Only the owner can change them."

---

## 6. Backend

### 6.1 Extend `GET /admin/register` (one route, one SQL view)

New view `places.station_list_row` (security invoker; read by service role only):

| Column | Rule |
|---|---|
| `id, name, address, status, pin_state, geofence_m, plus_code, origin_app, updated_at, verified_at` | From `places.place` |
| `brand_id, brand_name` | Join `places.brand` |
| `pcode1, parish_name` | `left(pcode,4)` → `geo.boundaries` (admin_level 1) |
| `parish_text_mismatch` | Stored parish text normalised ("Saint"/"St.", strip " Parish") ≠ `parish_name` and not null |
| `source` | `fleet` / `plug` / `manual` / `import` |
| `possible_duplicate_ids text[]` | Other active gas stations within 60 m (`st_dwithin(geog, …, 60)`), or with the same normalised name within 2 000 m |
| `company_style_name` | `name ~ '\m(LTD|LIMITED|T/A|SRL|CO\.)\M'` |
| `price_e10_87, price_outdated` | `places.price_current` |
| `issue_count` | Sum of the issue flags |

`GET /admin/register` gains `type=gas_station` plus `pcode`, `brand` (uuid or `none`), `pin`, `source`, `issue`, `sort`, `dir`. When `type=gas_station` it reads from `station_list_row`; other types read `place` as today. It returns `{ rows, total, page, summary: { total, verified, pending, priced, issues: {…} } }`. Fill counts are joined in the same response from `fleet_station_fill_summary` (already anonymised), so the page makes one call.

Rows are never hidden: a duplicate or non-station still lists, with its flag ([[feedback-dominion-capture-not-gate]]).

### 6.2 Writes
- **S2 first**, then the page uses `PATCH /admin/register/:id` (changed fields only), `POST /admin/register/:id/verify`, `POST /admin/register/bulk` and `POST /admin/register/import`.
- Bulk actions call the existing `/admin/register/bulk`. Add `set_brand`, `pin_confirmed` and `duplicate_of` to it if missing, each writing one `master_change_log` row per station with the shared reason.
- **S1** is fixed in `fleet-fuel` for Fleet's sake. Dominion no longer writes through `/stations`.

### 6.3 Frontend
New folder `apps/admin/src/components/admin/station-database/`:

| File | Job |
|---|---|
| `StationDatabasePage.tsx` | Shell, tabs, filters ↔ URL, states. Carries the new `// Stitch:` marker. Wraps `DominionMasterList` (S6) for the frame. |
| `stationRegisterApi.ts` | `listStations(filters)`, `getStation(id)`, `patchStation(id, changed, reason)`, `bulk(action, ids, reason)`. Throws on `!ok`. |
| `useStationList.ts` | `useQuery(['station-register', filters])`, `keepPreviousData`. Mutations invalidate the list and the drawer. |
| `StationTable.tsx`, `StationFilters.tsx`, `StationIssueChips.tsx`, `StationBulkBar.tsx` | List parts |
| `StationDrawer.tsx` + `DrawerDetails.tsx`, `DrawerLocation.tsx`, `DrawerPrices.tsx`, `DrawerHistory.tsx` | Built on `DominionRecordDrawer` (S5) |

- [AdminPortal.tsx:239](../apps/admin/src/components/admin/AdminPortal.tsx#L239): render `StationDatabasePage` for `fuel-stations`, keeping `defaultTab` / `resolutionSubTab` deep links. The Resolution tab mounts the existing `ResolutionQueueTab` with Silent attach and `FuelPlacesReview`, unchanged.
- Delete [apps/admin/src/components/fuel/stations/StationDatabaseView.tsx](../apps/admin/src/components/fuel/stations/StationDatabaseView.tsx). The shared package component stays for Fleet.
- No new dependencies: Leaflet 1.9.4, `@tanstack/react-query` and `date-fns` are already in admin.
- Accessibility: table headers are sort buttons with `aria-sort`, the drawer traps focus and closes on Esc, filter chips are toggle buttons with `aria-pressed`, the map pin can be moved with arrow keys, and every status has text, not just colour.

---

## 7. Design contract (Stitch)

1. Build the screen in **Dominion Redesign** (`7083594865949473827`) with the Dominion design system, light and dark, using [stitch/station-database-prompt.txt](stitch/station-database-prompt.txt).
2. Export the HTML to `docs/stitch/dominion-redesign/html/S17-station-database.html` (this replaces the old one) and the drawer to `html/S17b-station-drawer.html`. Put the PNGs in `screenshots/`.
3. Update README row **S17**: new id; React files = `StationDatabasePage.tsx` **first**, then `StationTable.tsx + StationFilters.tsx + StationIssueChips.tsx + StationBulkBar.tsx` (all under `apps/admin/src/components/admin/station-database/`, joined with ` + `); status "Ported. One list with filters and issues; Resolution tab unchanged." Add an **S17b** row for the drawer with React files `StationDrawer.tsx` first, then `DrawerDetails.tsx + DrawerLocation.tsx + DrawerPrices.tsx + DrawerHistory.tsx`. Add both ids to `screens.json`.
4. `node scripts/stitch-contract.mjs` exits 0, and `node scripts/stitch-fidelity.mjs --report` shows S17 and S17b at 100% (§0).
5. No Stitch sample value ships. Every number on the live page comes from the API.

---

## 8. Tests and exit checks

| # | Check | Pass when |
|---|---|---|
| T1 | Deno test for S1 (`fleet-fuel`): POST a partial station body. | Parish, geofence, aliases, phone, amenities and pin state are unchanged. |
| T2 | Deno test for S2 (`explorer`): PATCH `{ name }`. | `phone`, `geofence_m`, `pin_state` and `attributes` are unchanged. |
| T3 | SQL test: `station_list_row` with two stations 20 m apart, one with parish text "Kingston" and pcode JM06, one with no brand. | `possible_duplicate_ids`, `parish_text_mismatch`, `parish_name = 'Saint Andrew'` and the no-brand issue are all set. |
| T4 | SQL check after the S9 migration. | `place_facility` rows exist for all 28 stations. Unmatched labels are kept in `attributes.unmapped_amenities`. |
| T5 | Route test: staff user GET → 200; staff PATCH → 403; owner PATCH → 200; bad `pcode` → 400. | As stated. |
| T6 | `npx tsc --noEmit -p apps/admin` | No new errors over today's baseline. |
| T7 | `node scripts/stitch-contract.mjs` | Exit 0 |
| T8 | Live check after deploy. | No row says "Unknown Parish". Kingston filter shows 14 stations (JM03), Saint Andrew 61. The Possible duplicate chip shows 10 pairs' worth of rows. The geofence column shows 55 custom values. A geofence edit on one station leaves its phone and parish unchanged (check the row in SQL before and after). The drawer price matches the Price Engine → Published screen. |
| T9 | Phone width 390px. | The table becomes cards, filters open in a bottom sheet, and there's no horizontal scroll. |
| T10 | `node scripts/stitch-fidelity.mjs --report` | S17 = 100% and S17b = 100%, and no old UI kit is in the shell or drawer. |
| T11 | Side-by-side screenshots (Stitch PNG vs running page): list at 1440 light and dark, drawer on the Location tab, list at 390. Attached to the PR. | Same blocks, order, columns, chips, drawer tabs and labels. Only the data values differ (§0). |

## 9. Build order

1. **S1 and S2** (the two overwrite bugs), with T1 and T2. Deploy `fleet-fuel` and `explorer`. **Do this before anything else**, even if the rest waits: S1 can erase data today.
2. S9 amenities migration and the `station_list_row` view, with T3 and T4.
3. Extend `/admin/register` and the permission split (S7), with T5.
4. Stitch screens (§7), with T7. **The UI isn't started until both Stitch HTML files are in the repo (§0).**
5. Frontend: port the Stitch HTML (§0, §6.3), with T6, T10, T11.
6. Live checks T8 and T9.

## 10. Out of scope (noted)

- **Fake "REGION: JM-KGN" / "LOC: KINGSTON / PARISH REGISTRY JMD" / "KGN-DC-01 · JMD READY" labels are on about 25 Dominion files**, including the sidebar footer in [AdminLayout.tsx:189](../apps/admin/src/components/admin/AdminLayout.tsx#L189) and Price Engine, Toll, GCT, Parts and World Maps pages. They came in from Stitch sample chrome. One sweep should remove them everywhere. `grep -rn "JM-KGN\|PARISH REGISTRY\|KGN-DC-01" apps/admin/src packages` lists them.
- Fleet's copy of the Station database (same shared component) keeps the legacy migrations and the `fields=list` load. S1 protects its data. Its UI belongs in a Fleet audit.
- Reviewing the 147 imported stations (company names, same-point clusters) is data work for the owner, using the Issue filter once the page ships.
