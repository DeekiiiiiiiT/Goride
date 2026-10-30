# Dominion · Places and Maps home — audit (Rev 1, 29 Oct 2026)

Page: Dominion → Master data → **Places and Maps** (`?page=places-home`). Today it is `PlacesHome` in [DominionHomes.tsx:180](../apps/admin/src/components/admin/DominionHomes.tsx#L180). It uses the shared S7 "Section home" layout: four count cards and four link rows.

This is an audit only; no code was changed. Every number below comes from production (`csfllzzastacofsvcdsc`), read on 29 Oct 2026 with read-only SQL.

Stitch prompt: [docs/stitch/places-home-prompt.txt](stitch/places-home-prompt.txt). It follows the same pattern as the Fuel home ([dominion-fuel-home-audit.md](dominion-fuel-home-audit.md)), which is already built in `fuel-home/`.

---

## 0. READ FIRST — the Stitch screen is the spec

**Order of work**
1. Build the screens in Stitch from the prompt.
2. Export the HTML and PNG to `docs/stitch/dominion-redesign/html/S39-places-home.html`.
3. Add the S39 row to the README (§7).
4. Only then write React. No UI code may be written before the HTML is in the repo.

**Who wins**

| Topic | Winner |
|---|---|
| Layout, spacing, order, colours, icons, wording, state text | **Stitch HTML** |
| Which numbers, where they come from, permissions, links | **This audit** |

**Porting rules**
- Use the same element structure and classes as the Stitch HTML.
- Copy the labels word for word.
- Swap only the sample values.
- Add nothing and remove nothing.

**Proof**
- `node scripts/stitch-fidelity.mjs --report` must show **100%** for S39.
- Provide side-by-side screenshots in light, dark and 390 px phone.

**Stitch screen numbers → README ids** (the prompt uses plain numbers only)

| Prompt screen | README id |
|---|---|
| Screen 1 — Places and Maps home | S39 |
| Screen 2 — Loading, error, empty, staff view | S39 (states frame) |
| Screen 3 — Phone (390 px) | S39 (phone frame) |

The Vehicles, Tolls and Tax homes stay on S7, unchanged. Only Places moves to S39; Fuel already uses S35.

---

## 1. Who uses this page and what they need in 5 seconds

| Person | Question |
|---|---|
| Owner | "Is the map healthy, and what is waiting for me?" |
| Data staff | "Which places do I fix next: pins, brands, pending ones?" |
| Anyone | "What does Plug show right now?" |

Today the page answers none of these. It shows two numbers that are wrong for different reasons and two dashes.

---

## 2. Live data on 29 Oct 2026

| Fact | Value |
|---|---|
| Places (`places.place`) | **217** |
| Verified / pending / learnt | 69 / 148 / 0 |
| By type | Gas station 205 · Toll plaza 12 |
| Types in use / active types | 2 of 17 |
| Pins checked (`pin_state='checked'`) | **0 of 217** |
| Verified places whose pin was never checked | 69 |
| Places with no brand | 77 (65 gas stations + all 12 toll plazas; plazas have no brand by design) |
| Visible on Plug (`places.public_place`) | 69 |
| Source | Manual 165 · Roam Fleet 52 |
| Place area code depth | **All 217 at parish level** (level 1); none tagged to a town or community |
| Pending change proposals (`place_change_proposal`) | 0 |
| Place evidence rows | 0 |
| Last place edit | 29 Oct 21:01 |
| Map areas (`geo.boundaries`) | Country 1 · Parishes 14 · Towns 131 · Communities 775 = 921 |
| Border versions | 921 published · 10 retired · 0 drafts |
| Map publishes logged (`geo.publish_log`) | 4, last on 24 Oct 16:45 |
| Map pins (`geo.places`) | 6 |
| Import runs (`geo.import_runs`) | 0 |
| Map check issues (`geo.quality_issues`) | 0 |
| `fleet.dataset_quality` row `maps` | score **100**, failing 0, checked 29 Oct 18:02 |

---

## 3. Findings

Severity:
- **High**: the page states something wrong, or hides work that needs doing.
- **Medium**: information is missing or misleading.
- **Low**: tidy-up.

### H1 — High · "Quality 100" ignores the 217 places
- The `maps` score in `fleet.score_master_data()` checks two things only:
  - each of the 921 borders has a published shape;
  - each of the 6 `geo.places` map pins has a name and coordinates.
- It never looks at `places.place`. That table holds 217 places, none with a checked pin and 65 gas stations with no brand, so the tile says 100 while every place still needs work.

**Fix:**
- The home shows **two** scores, each with its reason.
- **Map quality** keeps the `maps` row as it is today: borders plus map pins.
- **Places quality** is a new `places` row in `fleet.dataset_quality`, written by `fleet.score_master_data()`.
  - A place passes only when all three hold: pin checked, area code present, and brand set (brand applies only to types that have brands, i.e. gas stations).
  - Today's score would be 0, with the reason line "217 pins not checked".
  - The Overview board picks up the new row automatically.

### H2 — High · "Waiting 0" counts the wrong queue
- The tile reads `pending` from `GET /admin/coverage`, which counts only `place_change_proposal` rows (0).
- The Review page (`places-review`) also lists every place with status pending or learnt: **148 today**.
- So the hub says nothing is waiting while Review holds 148 items.

**Fix:** the overview (H4) returns one count per review lane, matching the chips in `GET /admin/review`:

| Lane | Today |
|---|---|
| New places pending | 148 |
| Learnt places | 0 |
| Hand edits and facility suggestions | 0 |
| Evidence | 0 |

These counts appear as rows in "Needs you".

### H3 — High · Staff see dashes because the route is owner-only
- `GET /admin/coverage` uses `requireOwner`, so a staff member gets a 403.
- `useMasterStats` then shows "—", which looks the same as "still loading" and as "nothing there".

**Fix:** the new overview route uses `requirePlatformAdmin`, as Fuel does. Its counts are read-only. Write buttons stay owner-only on the pages they lead to.

### H4 — High · Five unrelated requests, and two dashes
- `useMasterStats()` fires 5 requests on every home: catalog quality, `admin-stats`, vehicle pending, vendors and coverage.
- "Records" and "Verified" are hard-coded `'—'` ([DominionHomes.tsx:190-191](../apps/admin/src/components/admin/DominionHomes.tsx#L190-L191)).

**Fix:**
- Add one RPC, `places.places_overview() returns jsonb`, and one route, `GET /admin/places/overview`, on `explorer` (§6).
- The page calls only that route, through react-query with a 60 s stale time.
- Loading, error and empty states come from `DominionStates`. The error text is "Could not load Places and Maps. Nothing was changed.", with a Retry button.
- The other homes keep `useMasterStats()`.

### M1 — Medium · Map health is invisible
The hub never says:
- that 921 areas are live;
- that the last border publish was on 24 Oct;
- that there are no drafts;
- that no import has ever run.

**Fix:** add a "Jamaica map" card holding:
- a small static parish outline;
- a count per level (1 / 14 / 131 / 775);
- the last publish date;
- drafts waiting;
- open map checks.

The card links to `world-jamaica`. It uses the `JamaicaOverviewMap` `variant="master"` from the Jamaica map audit, never the Rush legend.

### M2 — Medium · Places are only tagged to a parish
- All 217 places carry a parish code (level 1). None carries a town or community code.
- So Plug's "near this town" filtering, and any town-level analytics, have nothing to use.

**Fix:**
- The overview returns `places.area_depth`, a count of places by deepest area level.
- "Needs you" shows "217 places tagged to parish only", linking to the Register's `?issue=area_parish_only` filter.
- The data fix belongs to the Places register audit's pcode trigger (A5): it must set the **deepest** containing area, not the parish.

### M3 — Medium · No view of what Plug can see
Only 69 of 217 places are on Plug, yet the page never says so.

**Fix:** add an "On Plug" KPI tile: "69 of 217", with the sub-line "Only verified places show on Plug".

### M4 — Medium · Link rows say nothing about their area's state
**Fix:** each link becomes a section card with one live status line. Each card keeps its existing title and description, except Jamaica map (L1).

| Card | Live status line |
|---|---|
| Jamaica map | "921 areas · last publish 24 Oct · 0 drafts" |
| Places register | "217 places · 148 pending · 0 pins checked" |
| Categories | "2 of 17 types in use · 65 stations without brand" |
| Review | "148 waiting · oldest 29 Oct" |
| Map pins | "6 pins" (opens `world-places`) |
| Imports and checks | "No imports yet · 0 checks open" (opens `world-imports`) |

### L1 — Low · "The shipped country map" is jargon
**Fix:** change the description to "Country, parish, town and community borders."

### L2 — Low · Numbers lack units, and there is no "as of" time
**Fix:**
- Every tile shows "of N" or "%".
- Use mono tabular figures.
- The header shows "Updated 21:05" from `generated_at`, with a refresh icon.

### Not a finding
- The page shows no customer, fleet or driver data, and it must stay that way.
- Rush delivery zones are not shown. They belong to Rush Markets, not to master data.

---

## 4. What the page must not show
- Customer places, saved addresses, trips, drivers or org names.
- Rush delivery legend terms ("Serviceable", "Paused", "Delivery zone").
- AI badges, fake trends, "REGION" badges or "LOC:" footers.

---

## 5. Page layout (guidance; the Stitch screen wins)

```
Header: Dominion › Master data › Places and Maps        [Updated 21:05 ⟳]
Places and Maps — "Jamaica's map and every place the apps can find."

KPI row (4 tiles)
 Places 217        | Places quality 0%      | On Plug 69       | Map quality 100%
 69 verified ·     | ! 217 pins not checked | of 217 places    | 921 areas live
 148 pending       | Pin checked  0/217     | ▓▓░░ 32%         | Borders  921/921
 ▓▓░░ 32% verified | Area code  217/217     |                  | Map pins   6/6
                   | Brand set  140/205     |                  |

Needs you (8/12)                              Jamaica map (4/12)
 New places waiting for review 148 [Review]    [parish outline]
 Pins not checked              217 [Open]      Country 1 · Parishes 14
 Verified but pin not checked   69 [Open]      Towns 131 · Communities 775
 Stations without a brand        65 [Open]      Last publish 24 Oct · 0 drafts
 Tagged to parish only          217 [Open]      Imports: none yet · Checks 0
                                               Recent activity (4 rows)

Sections (3-column cards)
 Jamaica map · Places register · Categories · Review · Map pins · Imports and checks
```

**"Needs you" rows**
- Review lanes come first, because they block Plug; data fixes follow, largest count first.
- Hide any row whose count is zero.
- If every row is zero, show: "Nothing waiting. Places and the map are up to date."

**Deep links**

| Row | Opens |
|---|---|
| New places / learnt / suggestions | `places-review` with the matching chip |
| Pins, brand, area depth, verified-unchecked | `places-register?issue=<key>` (keys from the Places register audit) |
| Map drafts / checks | `world-jamaica` / `world-imports` |

**Recent activity** — up to 4 rows, newest first:
- last place edit;
- last border publish;
- last import;
- last review decision.

---

## 6. Data and API

### 6.1 RPC `places.places_overview()`
- `security definer`, with `set search_path = places, geo, fleet, public`.
- Revoke execute from `public`, `anon` and `authenticated`; grant it to `service_role` only.

```json
{
  "generated_at": "2026-10-29T21:05:00Z",
  "places": {
    "total": 217, "verified": 69, "pending": 148, "learnt": 0,
    "on_plug": 69, "types_used": 2, "types_active": 17,
    "by_type": [ { "type": "gas_station", "label": "Gas station", "count": 205 },
                 { "type": "toll_plaza",  "label": "Toll plaza",  "count": 12 } ],
    "area_depth": { "parish": 217, "town": 0, "community": 0 }
  },
  "places_quality": {
    "score": 0, "failing": 217, "checked_at": "...",
    "rules": [
      { "key": "pin_checked", "label": "Pin checked", "pass": 0,   "fail": 217 },
      { "key": "area_code",   "label": "Area code",   "pass": 217, "fail": 0 },
      { "key": "brand_set",   "label": "Brand set",   "pass": 140, "fail": 65, "applies_to": 205 }
    ]
  },
  "map": {
    "score": 100, "checked_at": "...",
    "areas": { "country": 1, "parish": 14, "town": 131, "community": 775 },
    "drafts": 0, "last_publish_at": "2026-10-24T16:45:32Z", "publishes": 4,
    "pins": 6, "imports": 0, "last_import_at": null, "open_checks": 0
  },
  "review": { "new_places": 148, "learnt": 0, "suggestions": 0, "evidence": 0, "oldest_at": "..." },
  "issues": { "pin_unchecked": 217, "verified_pin_unchecked": 69, "no_brand": 65, "area_parish_only": 217 },
  "activity": [ { "kind": "place_edit", "at": "..." }, { "kind": "border_publish", "at": "..." },
                { "kind": "import", "at": null }, { "kind": "review", "at": null } ]
}
```

**Rules**
- `map.score` and `places_quality.score` are read from `fleet.dataset_quality` (rows `maps` and `places`), so the hub and the Overview board always agree.
- The per-rule counts use the same tests as the new `places` score (H1).
- Brand checks apply only to place types that have brands. Toll plazas do not count against the brand rule.
- `review.*` uses the same filters as `GET /admin/review`.
- `area_depth` joins `places.place.pcode` to `geo.boundaries.admin_level`.

### 6.2 Route
In `supabase/functions/explorer/`, as `places_overview_admin.ts` next to `fuel_overview_admin.ts`:
- `GET /admin/places/overview`, behind `requirePlatformAdmin`.
- Reuse the `customerKeys` guard from `fuel_overview_admin.ts`, adding the banned keys `organization`, `driver`, `vehicle`, `user_id` and `saved_place`.
- Send `Cache-Control: private, max-age=30`.
- On error, return `{ error: "Could not load Places and Maps" }` with status 500.

### 6.3 Frontend
Add a new folder, `apps/admin/src/components/admin/places-home/`, mirroring `fuel-home/`:

| File | Content |
|---|---|
| `PlacesHomePage.tsx` | Page, header and data hook |
| `PlacesKpiRow.tsx` | The 4 tiles |
| `PlacesNeedsYouPanel.tsx` | Needs you |
| `JamaicaMapCard.tsx` | Map card and recent activity |
| `PlacesSectionCards.tsx` | Section cards |
| `placesHomeApi.ts` | Typed fetch |
| `placesHomeFormat.ts` + `.test.ts` | Row ordering, zero hiding, percentages, dates |

**Wiring**
- `AdminPortal.tsx` lazy-loads `PlacesHomePage` for `places-home`.
- Delete `PlacesHome` from `DominionHomes.tsx`. Do not touch `SectionHome` or the other homes.
- Start each file with `// Stitch: dominion-redesign/<S39 id>`.

---

## 7. Stitch README row
- Add the row `| S39 | Places and Maps home | <id> | html/S39-places-home.html | places-home | <full paths of the 5 tsx files joined by " + "> | Ported. Live places + map overview; no customer data. |`
- Change the S7 note to: "Same layout on Tolls and Tax homes. Fuel uses S35, Places uses S39."

---

## 8. Tests

| # | Test | Where |
|---|---|---|
| T1 | `places.total = verified + pending + learnt` + other statuses | SQL check |
| T2 | `map.score` equals `fleet.dataset_quality` row `maps`, and `places_quality.score` equals row `places` | SQL check |
| T3 | For each rule, `pass + fail` = its `applies_to` (or `total`) | SQL check |
| T4 | `review.new_places + learnt` equals the place rows that `/admin/review` returns with no chip | Deno test |
| T5 | `anon` and `authenticated` cannot execute `places.places_overview` | SQL grants check |
| T6 | 401 with no token, 403 for non-staff, **200 for staff** (not only the owner) | Deno test |
| T7 | The payload has no customer keys | Deno test |
| T8 | "Needs you" ordering, zero hiding and the empty state | `placesHomeFormat.test.ts` |
| T9 | Fidelity is 100% for S39 | CI + PR |
| T10 | Vehicles, Tolls and Tax homes still pass S7 fidelity | CI |

---

## 9. Build order
1. In Stitch: build the screens, export the HTML and PNG, and add the README row.
2. Add the `places` quality row to `fleet.score_master_data()` (H1) and re-run it.
3. Add the RPC `places.places_overview()` and the checks T1–T3 and T5.
4. Add the route, with tests T4, T6 and T7, then deploy `explorer`.
5. Build the `places-home/` folder by porting the Stitch HTML, with T8.
6. Wire it into `AdminPortal.tsx` and delete `PlacesHome`.
7. Check fidelity is 100%, take screenshots, commit, and deploy the admin site.
