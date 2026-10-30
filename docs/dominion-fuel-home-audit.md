# Dominion · Fuel home — audit (Rev 1, 29 Oct 2026)

Page: Dominion → Master data → **Fuel** (`?page=fuel-home`). Today it is `FuelHome` in [DominionHomes.tsx](../apps/admin/src/components/admin/DominionHomes.tsx#L210). It uses the shared S7 "Section home" layout: four count cards and five link rows.

Audit only. No code was changed. Every number below was read from production (`csfllzzastacofsvcdsc`) on 29 Oct 2026 with read-only SQL.

Stitch prompt: [docs/stitch/fuel-home-prompt.txt](stitch/fuel-home-prompt.txt). The new screen is **S35 Fuel home**.

---

## 0. READ FIRST — the Stitch screen is the spec

The last build "followed the audit" and still produced a different screen. That must not happen again.

**Order of work**
1. Build S35 in Stitch from the prompt.
2. Export the HTML to `docs/stitch/dominion-redesign/html/S35-fuel-home.html` and the PNG next to it.
3. Add the S35 row to `docs/stitch/dominion-redesign/README.md` (see §7).
4. Only then write React.

No UI code may be written before the HTML is in the repo.

**Who wins**

| Topic | Winner |
|---|---|
| Layout, spacing, order of blocks, colours, icons, wording, empty/loading/error text | **Stitch HTML** |
| Which numbers, where they come from, how they are computed, permissions, links | **This audit** |
| Anything the two disagree on that is not in this table | Stitch for looks, audit for data |

**Porting rules**
- Same element structure and Tailwind classes as the Stitch HTML.
- Copy every label word for word.
- Swap only the sample values for live ones.
- Add nothing, remove nothing. The wireframe in §5 is guidance only.

**Proof in the PR**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for S35. CI only enforces 80%; 100% is the bar here. Every React file in the S35 README row is listed, joined by ` + `.
- Side-by-side screenshots: the Stitch PNG next to the live page, in light, dark and 390 px phone.

**Keep the S7 layout for the other homes.** Vehicles, Places, Tolls and Tax homes stay on S7 exactly as they are. Only Fuel moves to S35.

---

## 1. Who uses this page and what they need in 5 seconds

| Person | Question they open the page with |
|---|---|
| Owner | "Is anything broken or waiting for me in fuel?" |
| Data staff | "What should I fix next: stations, pins, brands or prices?" |
| Ops / pricing | "Are pump prices current, and how far are they above the refinery price?" |

Today the page answers none of these. It shows four bare numbers, one of them a dash, and five links.

---

## 2. Live data on 29 Oct 2026

| Fact | Value |
|---|---|
| Gas stations (`places.place`, `place_type='gas_station'`) | 205 |
| Verified / pending | 57 / 148 |
| Stations failing the quality check | **205 of 205** (score 0) |
| — pin not checked (`pin_state='unchecked'`) | 205 |
| — no brand | 65 |
| — parish text disagrees with the map | 73 |
| Price reports waiting in Price Engine review | 1 (since 20:55 today) |
| Review rows by status | accepted 56 · duplicate 19 · rejected 2 · review 1 |
| Live published pump prices (`valid_until > now()`) | **5**, all Gasolene 87, from **4 stations** (2% of 205) |
| Average live 87 pump price vs benchmark | J$224.35 vs J$201.81 → **+J$22.54 (+11.2%)** |
| Share of reports from the top reporter | **100%** (one reporter) |
| Share of published prices that are outdated | 64% |
| Reports in the last 7 days | 7 |
| Last report / last publish | 29 Oct 20:55 / 29 Oct 14:36 |
| Refineries | 1: Petrojam, active, benchmark |
| Latest refinery week | 22 Oct 2026 |
| Refinery sync runs logged (`fuel.refinery_sync_run`) | **0** |
| Gas-card programs (`kv_store_37f42386`, key `jaa_program:*`) | 1, Roam-managed |

---

## 3. Findings

Severity: **High** = the page states something wrong or hides a problem that needs action. **Medium** = missing or misleading information. **Low** = tidy-up.

### F1 — High · "Quality 0" is true, but the page gives no reason
- `fleet.score_master_data()` scores a station as complete only if all three rules pass: brand set, pin checked, and parish matching the map (`fleet.station_quality.complete`).
- No station has had its pin checked, so all 205 fail. The score is 0 even though 140 have a brand and 132 have the right parish.
- The card shows a bare "0" with no unit and no cause. It reads as broken.

**Fix:** the overview endpoint (F3) returns the score plus a count for each rule. The Quality tile shows "0%" with the line "205 pins not checked", naming the rule with the most failures. Under it are three mini bars, one per rule. The scoring rule itself stays as it is.

### F2 — High · "Waiting" is hard-coded to a dash
- [DominionHomes.tsx:221](../apps/admin/src/components/admin/DominionHomes.tsx#L221) passes `'—'`.
- Right now 148 stations are pending and 1 price report is waiting for review.

**Fix:** the overview returns the count of each waiting item. The page shows them in the "Needs you" block (§5 C), each with its own link. The KPI row drops the generic "Waiting" tile.

### F3 — High · One home page fires five unrelated requests and hides errors
- `useMasterStats()` is shared by every home. It calls catalog quality, `admin-stats` (a Fleet monolith route that also counts riders), vehicle pending, vendors and places coverage, all on every home.
- A failed call shows "—", which looks the same as "still loading" and as "no data".

**Fix:**
- Add one RPC, `places.fuel_overview() returns jsonb`, and one route, `GET /admin/fuel/overview`, on the `explorer` function behind `requirePlatformAdmin` (§6).
- `FuelHome` calls only this route, with `@tanstack/react-query` (stale time 60 s).
- Loading, error and empty use the S3 states kit (`DominionStates`), with error text "Could not load fuel overview. Nothing was changed." and Retry.
- The other homes keep `useMasterStats()` unchanged.

### F4 — High · The page hides the most important fuel facts
- Only 4 of 205 stations (2%) have a live pump price.
- Every live price is Gasolene 87.
- One reporter supplies 100% of reports.
- 64% of published prices are outdated.

None of this is on the hub.

**Fix:**
- A "Price coverage" KPI tile.
- A "Pump vs benchmark" card with a trust line for each warning (§5 B, D).
- Warnings are shown as amber notes and never hide the numbers ("capture, never gate").

### F5 — Medium · Refinery freshness cannot come from the sync log yet
- `fuel.refinery_sync_run` has 0 rows, yet the 22 Oct week exists.
- A freshness chip based on runs would say "never synced".

**Fix:** freshness is computed from the benchmark's latest `effective_date` and its cadence (weekly, Thursday):

| State | Rule |
|---|---|
| **Current** | The latest week is the most recent Thursday, or newer |
| **Due** | Up to 7 days late |
| **Stale** | More than 7 days late |

The hub also shows "Last sync run: none logged" from the run table, so the gap stays visible. Run-log writing belongs to the Refineries audit (R5).

### F6 — Medium · "Petrojam" is hard-coded in the link text
The Station analytics row says "Pump prices against Petrojam". **Fix:** the text uses `benchmark.name` from the overview, e.g. "Pump prices against the benchmark (Petrojam)…".

### F7 — Medium · The links tell you nothing about each area's state
**Fix:** each link becomes a section card with one live status line from the overview:

| Card | Live status line |
|---|---|
| Stations | "148 pending · 205 pins unchecked" |
| Refineries | "1 refinery · week 22 Oct · Current" |
| Price Engine | "1 waiting · 5 live prices" |
| Station analytics | "Coverage 2% · +11.2% vs benchmark" |
| Gas-card programs | "1 program" |

Each card keeps its existing title and description wording.

### F8 — Low · Number format
"205", "57" and "0" show without context. **Fix:**
- Every tile shows a unit or a "of N" sub-line.
- Percentages are whole numbers with "%".
- Money is J$ with 2 decimals.
- Use mono tabular figures, as Stitch sets them.

### F9 — Low · No "as of" time
**Fix:** the header shows "Updated 20:58" from `generated_at` in the overview, plus a refresh icon button.

### Not a finding
- The page shows no customer, fleet, driver or card-holder data, and it must stay that way.
- Gas-card shows the program count only. Customer cards stay in Fleet admin.

---

## 4. What the page must not show
- Customer cards, drivers, vehicles, fleets or any org names.
- AI badges, fake trends, made-up live tickers, or "REGION"/"LOC" labels.
- The word "wholesale". Use "benchmark" or "ex-refinery".

---

## 5. Page layout (guidance — Stitch S35 wins)

```
Header: Dominion › Master data › Fuel        [Updated 20:58 ⟳]
Fuel — "Stations, pump prices, refineries and gas-card programs."

B  KPI row (4 tiles)
   Stations 205 | Data quality 0% | Price coverage 2% | Benchmark 87 J$201.81
   57 verified  | 205 pins not   | 4 of 205 stations | Petrojam · week 22 Oct
   ▓▓░░░ 28%    | checked        | 5 live prices     | [Current]

C  Needs you (8/12)                       D  Pump vs benchmark (4/12)
   1 price report waiting      [Review]      Gasolene 87  J$224.35 vs 201.81
   148 stations pending        [Open]        +J$22.54 · +11.2%
   205 pins not checked        [Open]        Based on 5 prices · 4 stations
   73 parish mismatches        [Open]        ⚠ One reporter sends 100%
   65 stations without brand   [Open]        ⚠ 64% of prices outdated
   Refinery sync: none logged  [Open]        Other grades: no live price yet
                                            Recent activity (4 rows)

E  Sections (3-column cards)
   Stations · Refineries · Price Engine · Station analytics · Gas-card programs
```

**"Needs you" rows**
- Sorted by urgency: price review first (it blocks publishing), then data fixes by count.
- Rows with a zero count are hidden.
- If every row is zero, show the empty state "Nothing waiting. Fuel data is up to date."

**Deep links** (the page ids exist today)

| Row | Opens |
|---|---|
| Price review | `fuel-price-engine` |
| Pending, pins, parish, brand | `fuel-stations`, with the matching issue filter that the Station database audit defines (`?issue=pin_unchecked` etc.) |
| Refinery sync | `fuel-prices` |

**Recent activity** — up to 4 rows, newest first:
- Last report
- Last publish
- Latest refinery week
- Last station edit (`max(places.place.updated_at)`)

---

## 6. Data and API

### 6.1 RPC `places.fuel_overview()`
`security definer`, `set search_path = places, fuel, fleet, geo, public`. Revoke execute from `public` and `anon`; grant execute to `service_role` only.

It returns `jsonb`:

```json
{
  "generated_at": "2026-10-29T20:58:00Z",
  "stations": { "total": 205, "verified": 57, "pending": 148 },
  "quality": {
    "score": 0, "failing": 205,
    "rules": [
      { "key": "pin_checked",   "label": "Pin checked",        "pass": 0,   "fail": 205 },
      { "key": "brand_set",     "label": "Brand set",          "pass": 140, "fail": 65 },
      { "key": "parish_match",  "label": "Parish matches map", "pass": 132, "fail": 73 }
    ],
    "checked_at": "2026-10-29T18:02:23Z"
  },
  "prices": {
    "live": 5, "priced_stations": 4, "coverage_pct": 2,
    "by_grade": [ { "grade": "e10_87", "label": "Gasolene 87", "live": 5, "avg_pump": 224.35, "benchmark": 201.81, "diff": 22.54, "diff_pct": 11.2 } ],
    "review_waiting": 1, "oldest_review_at": "2026-10-29T20:55:09Z",
    "top_reporter_share": 1.0, "outdated_share": 0.64,
    "reports_7d": 7, "last_report_at": "...", "last_published_at": "..."
  },
  "benchmark": {
    "slug": "petrojam", "name": "Petrojam", "refineries": 1,
    "latest_week": "2026-10-22", "freshness": "current",
    "headline": { "product": "gasolene_87", "label": "Gasolene 87", "price": 201.81 },
    "last_run_at": null
  },
  "gas_cards": { "programs": 1 },
  "activity": [ { "kind": "report", "at": "..." }, { "kind": "publish", "at": "..." }, { "kind": "refinery_week", "at": "2026-10-22" }, { "kind": "station_edit", "at": "..." } ]
}
```

**Rules**
- **Quality:** `quality.score`, `failing` and `checked_at` come from `fleet.dataset_quality` (dataset `stations`), so the hub and the Overview board never disagree. The per-rule counts use the same three tests as `fleet.station_quality`.
- **Live prices:** `prices.*` counts only rows with `valid_until > now()`. `coverage_pct = round(priced_stations * 100 / stations.total)`.
- **Benchmark price:** `benchmark` is computed with `places.wholesale_on(grade, current_date)`. After the Refineries rebuild, use `fuel.benchmark()`.
- **Grades:** `by_grade` lists every motor grade. A grade with no live price returns `live: 0` and nulls, and the UI shows "no live price yet".
- **Freshness:** follows F5.
- **Gas cards:** `gas_cards.programs` counts KV keys with the prefix `jaa_program:` where `value->>'mode'` is `roam_managed` or `self_serve`. It returns a count only.

### 6.2 Route
In `supabase/functions/explorer/`, next to `price_engine_admin.ts`:
- `GET /admin/fuel/overview`
- `requirePlatformAdmin`
- Calls the RPC with the service client.
- `Cache-Control: private, max-age=30`.
- Errors return `{ error: "Could not load fuel overview" }` with status 500.

### 6.3 Frontend files
New folder `apps/admin/src/components/admin/fuel-home/`:

| File | Content |
|---|---|
| `FuelHomePage.tsx` | Page, header, data hook |
| `FuelKpiRow.tsx` | Block B |
| `NeedsYouPanel.tsx` | Block C |
| `PumpVsBenchmarkCard.tsx` | Block D, including Recent activity |
| `FuelSectionCards.tsx` | Block E |
| `fuelHomeApi.ts` | Typed fetch for `/admin/fuel/overview` |
| `fuelHomeFormat.ts` + `fuelHomeFormat.test.ts` | Freshness, percent, J$ and "needs you" ordering |

**Wiring**
- `AdminPortal.tsx` lazy-loads `FuelHomePage` for `fuel-home`.
- `FuelHome` in `DominionHomes.tsx` is deleted. `SectionHome` and the other four homes are not touched.
- Each S35 file starts with `// Stitch: dominion-redesign/<S35 id>`.
- Dark mode uses the Dominion dark tokens, as Stitch defines them.

---

## 7. Stitch README rows
- Add: `| S35 | Fuel home | <id> | html/S35-fuel-home.html | fuel-home | apps/admin/src/components/admin/fuel-home/FuelHomePage.tsx + …/FuelKpiRow.tsx + …/NeedsYouPanel.tsx + …/PumpVsBenchmarkCard.tsx + …/FuelSectionCards.tsx | Ported. Live fuel overview; no customer data. |` (write out the full paths in the real row).
- Change the S7 row's note from "Same layout on Places, Fuel, Tolls, and Tax homes" to "Same layout on Places, Tolls, and Tax homes. Fuel uses S35."

---

## 8. Tests
| # | Test | Where |
|---|---|---|
| T1 | `fuel_overview()` station totals equal `fleet_station_counts()` | SQL check |
| T2 | `quality.score` equals `fleet.dataset_quality` row `stations` | SQL check |
| T3 | Rule counts: each `pass + fail = stations.total` | SQL check |
| T4 | `prices.live` counts only `valid_until > now()` rows | SQL check |
| T5 | `anon` and `authenticated` cannot execute `places.fuel_overview` | SQL grants check |
| T6 | Route returns 401 with no token and 403 for non-platform staff | Deno test |
| T7 | Freshness: Current / Due / Stale at 0, 3 and 8 days after the expected Thursday | `fuelHomeFormat.test.ts` |
| T8 | "Needs you" ordering puts price review first, hides zero rows, and shows the empty state when all are zero | `fuelHomeFormat.test.ts` |
| T9 | No string "Petrojam" in `fuel-home/*.tsx` (it comes from data) | grep in CI |
| T10 | Payload has no customer fields: no `organization`, `driver`, `vehicle`, `card_number` keys | Deno test |
| T11 | `stitch-fidelity.mjs --report` = 100% for S35 | CI + PR |
| T12 | Vehicles, Places, Tolls and Tax homes render unchanged (S7 fidelity still passes) | CI |

---

## 9. Build order
1. Stitch S35: export the HTML and PNG and add the README row (§0).
2. RPC `places.fuel_overview()` and SQL checks T1–T5.
3. Route `GET /admin/fuel/overview` and tests T6 and T10. Deploy `explorer`.
4. The `fuel-home/` folder, ported from the Stitch HTML, plus T7–T9.
5. Wire it up in `AdminPortal.tsx` and remove `FuelHome` from `DominionHomes.tsx`.
6. Run fidelity at 100%, take side-by-side screenshots (light, dark, phone), commit, and deploy the admin site.
