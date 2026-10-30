# Dominion · Places register — audit (Rev 1, 29 Oct 2026, whole section)

**Page:** Dominion → Master data → Places and Maps → **Places register** (`?page=places-register`).

This audit covers **the whole section**: every view and dialog reachable from the page.

| Part | Code today | New Stitch screen |
|---|---|---|
| List, filters, pagination | [PlacesRegister.tsx](../packages/platform-ops-ui/src/places/PlacesRegister.tsx) | **S38 Register** |
| Bulk actions bar (checkboxes) | same file | **S38d Bulk action bar + confirm** |
| Export / Import CSV | same file | **S38e Import places** (export lives in S38) |
| Place record (opened by clicking a name) | [PlaceRecord.tsx](../packages/platform-ops-ui/src/places/PlaceRecord.tsx) | **S38b Place drawer** (view) |
| Edit place | [PlaceEditor.tsx](../packages/platform-ops-ui/src/places/PlaceEditor.tsx) | **S38b Place drawer** (edit) |
| Add a place | `PlaceEditor` with no id | **S38c Add a place** |
| Possible duplicates → Merge | `PlaceEditor` side panel | **S38f Merge dialog** |

**Wiring today:**
- [PlacesDesk.tsx](../packages/platform-ops-ui/src/places/PlacesDesk.tsx) swaps between `list`, `record` and `edit` views.
- The data comes from `explorer` → [place_admin.ts](../supabase/functions/explorer/place_admin.ts#L250). The routes are:
  - `GET /admin/register`
  - `GET /admin/register/:id`
  - `POST /admin/register`
  - `PATCH /admin/register/:id`
  - `POST /admin/register/:id/verify`
  - `POST /admin/register/bulk`
  - `POST /admin/register/import`
  - `GET /admin/register/nearby`

Audit only. No code was changed. Every number comes from production (`csfllzzastacofsvcdsc`) on 29 Oct 2026, read with read-only SQL.

Stitch prompt: [docs/stitch/places-register-prompt.txt](stitch/places-register-prompt.txt). In Stitch the screens are simply numbered. Map them to the README ids like this:

| Stitch | README id |
|---|---|
| Screen 1 | S38 |
| Screens 2–3 | S38b |
| Screen 4 | S38c |
| Screen 5 | S38d |
| Screen 6 | S38e |
| Screen 7 | S38f |
| Screens 8–9 | states and phone variants of S38/S38b |

---

## 0. READ FIRST — the Stitch screen is the spec

**Order of work**
1. Build S38, S38b, S38c, S38d, S38e and S38f in Stitch.
2. Export the HTML to `docs/stitch/dominion-redesign/html/` with PNGs.
3. Add the README rows (§7).
4. Only then write React.

**Who wins**

| Topic | Winner |
|---|---|
| Layout, order, spacing, colours, icons, wording, states | **Stitch HTML** |
| Data, rules, permissions, API | **This audit** |

**Porting rules**
- Same structure and classes as Stitch.
- Copy the text word for word.
- Swap only the sample values.
- Add nothing and remove nothing. §5 is guidance only.

**Proof in the PR**
- `node scripts/stitch-fidelity.mjs --report` at **100%** for every S38 screen. CI enforces only 80%.
- Every React file is listed in the README row, joined with ` + `.
- Side-by-side Stitch PNG vs live, in light, dark and 390 px phone.

---

## 1. Who uses it and how it relates to Station database

| Person | Job |
|---|---|
| Owner | Add, correct, verify and merge places. Bulk-fix brands, pins and facilities. |
| Data staff | Find a place fast, see what is missing, and send it to the owner. |

**One record, one editor.** 205 of the 217 places are gas stations, and those already have a full editor in **Station database** (S17/S17b, `station-database/StationDrawer.tsx`). The register must not become a second, weaker station editor.

**Fix rule:**
- A **gas station** row in the register opens the S17b `StationDrawer`.
- **Every other type** opens the new S38b Place drawer.
- Both drawers save through the same `PATCH /admin/register/:id`, which merges only the keys that are present (`placePatchFromBody`, already fixed).

---

## 2. Live data on 29 Oct 2026

| Fact | Value |
|---|---|
| Places | **217**: gas station 205 (57 verified, 148 pending), toll plaza 12 (all verified) |
| Pins | **217 of 217 unchecked**, including **69 verified** places |
| Public on Plug (`public_place`) | 69 (= verified) |
| Origin | `manual` 165, `roam_fleet` 52 |
| Names in ALL CAPS | **151** |
| Address that also contains a plus code | **49**, so the Location column shows the plus code twice |
| `parish` text | 41 distinct values. Real parishes are mixed with towns ("Albion", "May Pen") and broken CSV fragments: **"6 Old Hope Rd"**, **"1140 Morgan Rd\""**, **"West Indies\""**. 5 are null. |
| Geofence override | 67 places |
| Phone / website | 59 / 0 |
| Aliases / evidence rows | 11 / 0 |
| Change-log rows (`fleet.master_change_log`, dataset `place`) | 780, all with a reason |

---

## 3. Findings

**Severity:** High = wrong data or unsafe action · Medium = missing or misleading · Low = tidy-up.

### R1 — High · Bulk actions skip the change log, the reason and the public refresh
In `POST /admin/register/bulk` ([place_admin.ts:403](../supabase/functions/explorer/place_admin.ts#L403)), three actions write straight to the tables:
- `type`
- `add-facility`
- `remove-facility`

So these changes:
- leave no history and no reason;
- never call `refresh_public_place`, so Plug keeps showing the old type or facilities.

Bulk `verify` also writes directly. It does refresh the public place, but it writes no history row. The UI applies all of these with **no confirm**.

**Fix:**
- Every bulk action goes through `applyRegisterUpdate` (the same path as a single edit) with a required `reason`.
- Each touched id then gets `refresh_public_place`.
- The UI shows the **S38d confirm** first: what will change, how many places, a reason field, then "Apply to N places".
- Bulk "Set type" across match profiles is refused with 409 "Changing a gas station to another type moves it out of fuel matching. Change these one at a time." This applies whenever the old and new types have different `match_profile` values (fuel, toll, none).

### R2 — High · CSV import corrupts data
- The client splits each line on `,` ([PlacesRegister.tsx:~107](../packages/platform-ops-ui/src/places/PlacesRegister.tsx)), so a quoted address with commas spills into the next columns. That is where `parish = "6 Old Hope Rd"`, `"1140 Morgan Rd\""` and `"West Indies\""` came from.
- An empty lat/lng becomes `Number("") = 0`. That passes the server's `row.lat == null` check ([place_admin.ts:~486](../supabase/functions/explorer/place_admin.ts)) and saves a place at 0,0.
- There is no dry run, no duplicate check, and the actor is `null`.
- Export has the same bug the other way round: unquoted names with commas, and it only exports the **current page of 50**.

**Fix (S38e):**
- Parse with a real CSV parser that handles quotes (`papaparse`: already used by `apps/admin`, `apps/fleet` and `apps/enterprise`; add it to `packages/platform-ops-ui/package.json`).
- Use a three-step flow: **Choose file → Check → Save**.
- `POST /admin/register/import` takes `dry_run: true` and returns per-row results:
  - matched type and facilities;
  - lat/lng inside Jamaica (lat 17.6–18.6, lng −78.5 to −76.1), otherwise "Pin outside Jamaica";
  - duplicates within the type's geofence (the existing `duplicateHits`);
  - the parish worked out from the pin (`pcode`), not taken from the file.
- "Save" is enabled only after a check with 0 errors. Saving passes the owner's id as actor and the reason "Imported from <file>".
- Export calls a new `GET /admin/register/export?<same filters>` that streams **all** matching rows as properly quoted CSV.

**Data clean-up:** reset the 3 corrupted `parish` values from the pin. See R3.

### R3 — High · Parish is free text, so it disagrees with the map
- The editor has a plain "Parish" text box. The list shows that text.
- It holds towns, street fragments and nulls (§2), while the real parish is already known from the pin through `pcode`.

**Fix:**
- Remove the Parish input.
- Parish is **read-only**, shown from `pcode` → `geo.boundaries` name. It updates live as the pin moves.
- The Location column shows `address · <town from pcode> · <parish from pcode>`.
- Keep the `parish` column for the Station analytics compat view until that view reads `pcode`. A trigger sets it from `pcode` on every insert and update, and a backfill fixes all 217 rows.

### R4 — High · Verify ignores the pin check
- `missingChecklist` checks type, name, that a pin exists, and duplicates ([place_admin.ts:194](../supabase/functions/explorer/place_admin.ts#L194)).
- It does **not** check `pin_state`. So 69 places are "verified" and public on Plug with unchecked pins, while Dominion's own quality score treats an unchecked pin as failing.

**Fix:**
- Add "Pin checked" (`pin_state in ('confirmed','offset')`) to `missingChecklist`. This covers single verify, save-and-verify, and bulk verify.
- The drawer's "Verify" checklist shows it as a step, with a "Confirm pin" action on the map.
- The 69 already-verified places stay verified (capture, never gate). They get the issue chip "Pin not checked" until confirmed.

### R5 — High · A new place starts with a pin already in Kingston
- `PlaceEditor` sets lat/lng to `18.0179, -76.8099` by default ([PlaceEditor.tsx:~43](../packages/platform-ops-ui/src/places/PlaceEditor.tsx)).
- The "Pin" requirement is therefore met before anyone places it, and a forgotten pin saves the place in downtown Kingston.

**Fix (S38c):**
- The pin starts **empty**. The map is centred on Jamaica with the hint "Click the map or search an address to drop the pin".
- Save is disabled until a pin is placed.
- Pins outside the Jamaica box are refused on the server too: 400 "Pin outside Jamaica" in `savePlace`.

### R6 — Medium · No way back from a record
- `PlacesDesk` replaces the list with the record or editor view. Neither has a back control.
- Filters and page survive only in the URL.

**Fix:**
- The record and editor become a right-side drawer over the list (S38b), so the list stays in place.
- Esc or the close button returns to the same scroll position.
- The URL carries `&place=<id>` so a record can be linked.

### R7 — Medium · Changing the type in the editor wipes the facilities
- `chooseType` replaces `facilities` with the new type's defaults ([PlaceEditor.tsx:~104](../packages/platform-ops-ui/src/places/PlaceEditor.tsx)), even when editing an existing place with saved facilities.

**Fix:**
- On an existing place, changing the type **adds** missing defaults and keeps the existing facilities.
- A note lists any facility that doesn't belong to the new type's categories, with a "Remove" link.

### R8 — Medium · One-click Merge with no confirm
- "Merge" in Possible duplicates marks the current place `duplicate` of the other immediately, with no reason ([PlaceEditor.tsx:~229](../packages/platform-ops-ui/src/places/PlaceEditor.tsx)).

**Fix (S38f):** a Merge dialog.
- It shows both records side by side (name, brand, pin, distance, status, facilities, prices count, aliases).
- You choose which one to keep.
- A reason is required.
- On save: the other place becomes `duplicate_of` the kept one; its aliases and facilities are copied to the kept one (no duplicates); `refresh_public_place` runs on both.
- This uses a new RPC, `places.merge_place(p_keep, p_drop, p_reason, p_actor)`.

### R9 — Medium · The list wastes space and repeats itself
- **Plus code shown twice:** 49 addresses already start with the short plus code, and the full plus code is appended again.
- **Geofence column:** every row says "(type default)" or "(override)".
- **Status:** shown with raw symbols ("… pending").
- **Type chip:** a letter on a pastel group colour.
- **Facilities:** a comma list. For stations it is just "Fuel".
- **Missing columns:** no Updated column and no Issues column.

**Fix (S38):**

| Column | Content |
|---|---|
| Place | Name in title case for display only (the stored name is unchanged); brand under it in grey |
| Type | Icon chip, neutral |
| Location | Address with a leading plus code stripped · town · parish (from `pcode`) |
| Status | Chip: Verified, Pending, Learnt, Rejected, Duplicate, Closed, Anomaly |
| Issues | Chips: Pin not checked, No brand, No phone, Parish text differs, Outside Jamaica |
| Facilities | Count with a tooltip |
| Geofence | Number only; "override" as a small dot |
| Updated | Date |

Sort by Name, Type, Status or Updated.

### R10 — Medium · Filters miss statuses and issues
- The status dropdown lists 5 of the 7 statuses; "duplicate" and "anomaly" are missing.
- There is no filter for brand, parish, pin state, source (`origin_app`) or issue.

**Fix:**
- A filter bar with chips: Group › Category › Type, Status (all 7), Brand, Parish (from `pcode`), Pin, Source (Manual / Roam Fleet), Issue.
- All filters live in the URL.
- **Server:** `GET /admin/register` accepts `brand`, `pcode`, `pin`, `source`, `issue` and `sort` for all types. Today only `gas_station` gets these, via `loadGasStations`. Generalise `places.station_list_row` into `places.place_list_row` (same columns plus `place_type`). The station path keeps using its view.

### R11 — Medium · Search fires on every keystroke, and categories reload with each filter
- `load()` runs on every change of `filters.q` with no debounce.
- Each call also re-fetches `/admin/taxonomy`.

**Fix:**
- Debounce search by 300 ms.
- Load taxonomy once per page visit with react-query (stale time 10 min).

### R12 — Medium · The record view hides the basics
- The Overview tab shows status, address, plus code and phone only.
- It has no map, coordinates, pcode, geofence, pin state, source, verified date or updated date.
- The Evidence tab is always empty (0 rows) but still shows.
- Prices show raw grade codes (`e10_87`).

**Fix (S38b):**
- **Overview:** a small map with the pin and geofence circle, and every field above.
- **Tabs:** Overview · Facilities · Aliases · Prices (fuel only) · History.
- **Evidence:** shown only when rows exist.
- **Grades:** shown with labels (Gasolene 87).
- **History:** shows actor name, action, reason and date.

### R13 — Medium · Editor saves carry no reason
- `PlaceEditor` never sends `reason`, so single edits are logged with the default reasons only.

**Fix:**
- The drawer's Save asks for a short reason (S5 drawer pattern).
- Verify uses "Verified".

### R14 — Low · Facility picker shows all 44 types as chips
**Fix:** show the facility types for the place type's categories first, then "More facilities" collapsed, with a search.

### R15 — Low · Coloured group backgrounds, no header, no dark mode
**Fix:**
- Dominion tokens.
- Breadcrumb "Dominion › Master data › Places and Maps › Places register".
- S3 states kit.

### R16 — Low · Error status codes
- `GET` routes return 400 for every error.

**Fix:** 403 for auth, 400 for validation, 404 for not found, 409 for in-use or duplicate, and 500 otherwise.

---

## 4. Must not show
- Customer, driver, order or fleet data.
- Who reported a price.
- AI badges.
- "REGION" or "LOC" labels.

---

## 5. Layout (guidance; Stitch wins)

```
Header: Dominion › Master data › Places and Maps › Places register
Places register — "Every place every app can find, with its type, pin and facilities."
                                  [Import] [Export] [+ Add a place]
KPI: Places 217 · Verified 69 · Pending 148 · Pins checked 0 · On Plug 69 · Issues 217
Filter bar: [Search] Type ▾ Status ▾ Brand ▾ Parish ▾ Pin ▾ Source ▾ Issue ▾   (Clear)
Table (S38) with checkbox column; sticky header; 50 per page
Bulk bar (S38d) slides up when rows are ticked:
  "3 selected · Set brand · Confirm pins · Add facility · Remove facility · Set type · Verify · Mark duplicate · Clear"
Drawer (S38b) from the right: header, issue chips, tabs, footer [Edit] [Verify]
```

---

## 6. Data and API

| # | Change | Where |
|---|---|---|
| A1 | Bulk actions through `applyRegisterUpdate` + reason + refresh; cross-profile type change → 409 (R1) | `place_admin.ts` |
| A2 | Import `dry_run`, per-row results, Jamaica box, duplicates, actor; `GET /admin/register/export` (R2) | `place_admin.ts` |
| A3 | Trigger: `parish` from `pcode`, plus backfill of 217 rows (R3) | migration |
| A4 | `missingChecklist` adds Pin checked (R4) | `place_admin.ts` |
| A5 | `savePlace` refuses pins outside Jamaica (R5) | `place_admin.ts` |
| A6 | `places.merge_place` RPC + `POST /admin/register/:id/merge` (R8) | migration + route |
| A7 | `places.place_list_row` view + generic filters and sort on `GET /admin/register` (R10) | migration + route |
| A8 | Status codes (R16) | `place_admin.ts` |

**Frontend:** new folder `packages/platform-ops-ui/src/places/register/`.

| File | Contents |
|---|---|
| `RegisterPage.tsx` | Page |
| `RegisterTable.tsx` | Table |
| `RegisterFilters.tsx` | Filter bar |
| `RegisterBulkBar.tsx` | Bulk bar |
| `BulkConfirmDialog.tsx` | Bulk confirm |
| `ImportDialog.tsx` | CSV import |
| `PlaceDrawer.tsx` | Drawer shell |
| `PlaceOverviewTab.tsx` | Overview tab |
| `PlaceFacilitiesTab.tsx` | Facilities tab |
| `PlaceAliasesTab.tsx` | Aliases tab |
| `PlacePricesTab.tsx` | Prices tab |
| `PlaceHistoryTab.tsx` | History tab |
| `PlaceEditForm.tsx` | Edit form |
| `AddPlaceDialog.tsx` | Add a place |
| `MergeDialog.tsx` | Merge |
| `registerApi.ts` | API calls |
| `registerFormat.ts` + `.test.ts` | Formatting |

**Wiring:**
- `PlacesDesk` renders `RegisterPage` for `register`.
- Gas station rows open the existing S17b `StationDrawer`, not `PlaceDrawer`.
- Delete `PlacesRegister.tsx`, `PlaceRecord.tsx` and `PlaceEditor.tsx` after the port.
- Keep `AttributeFields.tsx`.
- Move `PlacePinMap` into `register/PlacePinMap.tsx`.
- Each file starts with `// Stitch: dominion-redesign/<id>`.

---

## 7. Stitch README rows
- **S38** Places register → `places-register` → `register/RegisterPage.tsx + register/RegisterTable.tsx + register/RegisterFilters.tsx`
- **S38b** Place drawer → `register/PlaceDrawer.tsx + register/PlaceOverviewTab.tsx + register/PlaceFacilitiesTab.tsx + register/PlaceAliasesTab.tsx + register/PlacePricesTab.tsx + register/PlaceHistoryTab.tsx + register/PlaceEditForm.tsx`
- **S38c** Add a place → `register/AddPlaceDialog.tsx`
- **S38d** Bulk bar + confirm → `register/RegisterBulkBar.tsx + register/BulkConfirmDialog.tsx`
- **S38e** Import places → `register/ImportDialog.tsx`
- **S38f** Merge → `register/MergeDialog.tsx`

Write the full `packages/platform-ops-ui/src/places/register/...` paths in the real rows.

---

## 8. Tests

| # | Test | Where |
|---|---|---|
| T1 | Bulk type, add-facility and remove-facility write one `master_change_log` row per place with the reason, and refresh `public_place` | Deno + SQL |
| T2 | Bulk type from `gas_station` to `beach` → 409 | Deno |
| T3 | CSV with a quoted comma address imports the address intact; parish comes from the pin | vitest + Deno |
| T4 | CSV row with empty lat → "Pin outside Jamaica", nothing saved | Deno |
| T5 | Export returns all matching rows (217 with no filters), correctly quoted | Deno |
| T6 | After the backfill, no `parish` value is outside the 14 parish names | SQL |
| T7 | Verify with `pin_state='unchecked'` → missing includes "Pin checked" | Deno |
| T8 | `savePlace` with lat 0 → 400 | Deno |
| T9 | New-place form has no pin, and Save is disabled until a pin is dropped | vitest |
| T10 | Changing the type on an existing place keeps saved facilities | vitest |
| T11 | `merge_place` copies aliases and facilities, marks the dropped place duplicate, refreshes both | SQL |
| T12 | Location strips a leading short plus code (49 rows) | vitest |
| T13 | Gas station row opens `StationDrawer`; toll plaza opens `PlaceDrawer` | vitest |
| T14 | `stitch-fidelity.mjs --report` = 100% for S38–S38f | CI + PR |

---

## 9. Build order
1. Stitch S38–S38f → HTML, PNG, README rows.
2. Migrations A3, A6, A7, plus SQL checks T6 and T11.
3. Routes A1, A2, A4, A5, A8, plus tests T1–T5, T7 and T8. Deploy `explorer`.
4. The `register/` folder ported from Stitch, plus T9, T10, T12 and T13.
5. Fidelity at 100%, side-by-side screenshots, commit, deploy the admin site.
