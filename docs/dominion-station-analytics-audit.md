# Dominion Station Analytics — rebuild audit

**Rev 1 · 2026-10-29** · Audit only. No code was changed. Project `csfllzzastacofsvcdsc`. All numbers below were read from production today.

Written for: the owner, and Cursor implementing it. Screen prompt: [stitch/station-analytics-prompt.txt](stitch/station-analytics-prompt.txt).

Page: Dominion → Fuel → **Station analytics** (page id `fuel-analytics`, Stitch row S19). Today it is [StationHealth.tsx](../apps/admin/src/components/admin/StationHealth.tsx): four count cards and a "The data is not in yet." strip.

---

## 0. READ FIRST — the Stitch screen is the spec. Port it; don't redesign it.

The owner designs this screen in Stitch. **The exported Stitch HTML is the UI to build, element for element.** This audit says where the data comes from and how it is computed. It does **not** give the implementer freedom to design the screen. A previous build "followed the audit" and produced a different screen. That counts as a failed build.

**Order of work:** the owner finishes the Stitch screen → the HTML is saved to `docs/stitch/dominion-redesign/html/S19-station-analytics.html` (and PNGs to `screenshots/`) → **only then** is the React UI written. If that HTML file isn't in the repo yet, build the backend (§6.1, §6.2) and stop. Don't write UI from the wireframe in §5.

**Who wins when they disagree:**

| Topic | Source of truth |
|---|---|
| Layout, block order, sizes, spacing, colours, fonts, icons, borders, corner radius, chart type, wording of titles, labels, buttons, captions and empty states | **Stitch HTML.** The §5 wireframe and the wording in this audit are guidance only. |
| Which number goes in which slot, how it is calculated, which API it comes from, permissions, states, tests | **This audit** |

**Porting rules:**
1. Rebuild the Stitch HTML's structure in JSX: same sections, same order, same nesting, same Tailwind classes/tokens. Copy the class lists; don't re-style.
2. Copy every heading, label, column name, button and caption **word for word**.
3. Replace only the Stitch **sample values** (numbers, station names, dates) with live data from §6. Keep the element and its styling.
4. **Don't add** blocks, cards, columns, badges, tabs or icons that aren't in Stitch. **Don't remove** any. If a Stitch element has no data source, render it with its empty state and list it in the PR description.
5. Don't swap the chart type, map style or component for "something similar". If Stitch shows a band chart, build a band chart.
6. No old UI kit (`@roam/ui`, `components/ui`) in the page shell, and no shadcn `Card`/`Badge` look-alikes in place of the Stitch markup.
7. Dark mode comes from the Stitch Dark variant, not from guessing.
8. Splitting the page into block files (§6.3) is fine. Each file still holds that block's Stitch markup unchanged.

**Proof (part of the exit checks, §8):**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for S19, not just the 80% CI floor. The README S19 row must list every React file of the page joined with ` + `, because the script only reads the files named there.
- The PR includes side-by-side screenshots at 1440 px (light and dark) and 390 px: the Stitch PNG on the left, the running page on the right. Pass = same blocks in the same order, same columns, same labels, same chart type. Only the data values differ.

---

## 1. What this page is for

Dominion is the master database. It never shows customer spending, fleets, vehicles or drivers ([[dominion-master-data-rule]]). So the outside guide's personas are re-cut for Dominion:

| Guide persona | Where it lives in Roam | On this page? |
|---|---|---|
| Consumer / driver ("cheapest near me") | Roam Plug | No |
| Fleet manager (fuel cost per route) | Fleet → Fuel Analytics | No |
| Station owner (my price vs neighbours) | No such user exists | No |
| **Market analyst / data owner** | **Dominion** | **Yes — the only persona** |

The page answers four questions, in this order:

1. **What does fuel cost at the pump this week, and how far above Petrojam is it?**
2. **How much of Jamaica can we price?** (stations with a live price, by parish and brand)
3. **Can I trust these numbers?** (age, number of reports, number of reporters)
4. **Where do I need more data?** (parishes, brands and stations with no price, and records with bad data)

Every block must answer one of these questions. If a block doesn't, it isn't built.

## 2. Data that actually exists (production, 29 Oct)

| Source | What's there | Usable for |
|---|---|---|
| `public.fuel_petrojam_prices` | 1,183 weekly rows, **19 Feb 2004 → 22 Oct 2026**. No gaps since 2023 (52/52/52/43 per year). Grades 87, 90, auto diesel, ULSD. | National benchmark trend, week-over-week and year-over-year change |
| `places.place` (gas_station) | 204 stations: 56 verified, 148 pending. Every one has coordinates and a `pcode` (JM01–JM14). | Coverage, parish and brand breakdowns, the map |
| `places.brand` | 17 brands, 0 logos. 65 stations have no brand. | Brand breakdown |
| `geo.boundaries` (admin_level 1) | The 14 parishes with clean names, keyed by pcode. | The parish dimension |
| `places.price_report` + `price_report_check` | 77 Fleet reports, **2 Sep → 27 Oct**. 56 accepted, 19 duplicate, 2 rejected. Plug: 0. | Pump price trend and medians |
| `places.price_current` | 11 live prices at **10 stations** (10 × E10-87, 1 × E10-90). **7 of the 11 are "May be outdated."** | The station table, lowest and highest |
| `places.price_reporter` | **2 reporter keys, both Fleet.** `top_reporter_share = 1`. | Data-trust panel |
| `public.fuel_retail_price_markup` | **0 rows** | Nothing. A retail estimate can't be computed. |
| `places.wholesale_on(grade, date)` | Existing function: grade → Petrojam price on a date | The one grade-to-Petrojam mapping |

**What this means for design:** Petrojam history is deep. Pump-price data is very thin: 10 stations, 1 grade, all from one fleet. The page has to look right and tell the truth at n = 1, and keep working unchanged at n = 10,000. **Show the sample size beside every pump-price number.** The guide's "National Average Price" headline would really be one vehicle's fills, so it is relabelled (see §5).

---

## 3. Findings — current page and the data under it

Severity: **Critical** = the page shows something false. **High** = it blocks a correct rebuild. **Medium** = a quality or UX defect.

| # | Sev | Finding | Fix |
|---|---|---|---|
| F1 | Critical | **"Quality 100" is false.** `fleet.score_master_data()` scores stations using `fleet.station_quality`. That view counts a station complete when brand, coordinates and (pcode **or** parish text) are present. The `fleet.stations` view fills a missing brand with `"Independent"` (65 stations). Every station has a pcode. Pins are never checked. So all 204 pass, while 65 have no real brand, 72 have the wrong parish text, and 204/204 pins are `unchecked`. | Redefine `complete` in `fleet.station_quality` as: `places.place.brand_id is not null` **and** the parish text matches the pcode's parish (or is null) **and** `pin_state <> 'unchecked'`. The score then shows the real figure. The new page shows the three failure counts separately (§5, block G). |
| F2 | Critical | **Fake labels on the page.** "REGION: JM-KGN" and "LOC: KINGSTON / PARISH REGISTRY JMD" are hardcoded. "The data is not in yet." shows even when data loaded. | Remove all three. Every label on the new page comes from data. |
| F3 | Critical | **The parish text is wrong for 35% of stations.** `places.place.parish` has 42 different values for 14 parishes, including towns ("Browns Town", "May Pen"), street addresses ("6 Old Hope Rd"), `"West Indies\""` and "… Parish" suffixes. **72 of 204** disagree with the station's own pcode. **32 stations say "Kingston" but sit in another parish** (mostly St Andrew). A parish chart built from that text would be wrong. | All parish grouping uses `left(pcode,4)` joined to `geo.boundaries` (admin_level 1). The text column is never read by analytics. Block G lists the 72 mismatches so the owner can correct them. |
| F4 | High | **"Last updated" would be wrong.** `price_current.observed_at` holds the **publish time**: all 11 rows say 29 Oct 14:36, but the newest pump report is from 27 Oct 17:22. A freshness label built on it says "today" for a price seen weeks ago. | Add `last_report_at timestamptz` to `places.published_fuel_price` and `places.price_current`. `price_engine_publish` sets it to `max(reported_at)` of the reports it counted. Analytics uses `last_report_at` for every age and freshness label, and never uses `observed_at`. |
| F5 | High | **Wrong permission level.** The page is `standard` in [permissions.ts:535](../apps/admin/src/utils/permissions.ts#L535), but every `/admin/prices/*` route in `explorer` calls `requireOwner`. Any staff member who isn't the owner would get errors on every price block. | The new analytics route uses `requirePlatformAdmin` from `_shared/platformAdmin.ts`, the same as `platform-catalog /admin/quality`. It is read-only and returns no reporter identities. |
| F6 | High | **No price history to chart.** `published_fuel_price` is a republish log: 15 rows covering 7 Petrojam weeks, rewritten every recalculation. It isn't a time series. | The pump trend is computed from **accepted** reports (`price_report_check.status = 'accepted'` and `weight > 0`), grouped by the Petrojam week each report falls in. See the RPC in §6. |
| F7 | High | **Errors look the same as "no data".** The page treats `!res.ok` as an empty body and swallows network failures (`.catch(() => {})`). A failed call shows "—", just like loading. | Use the S3 states kit ([DominionStates.tsx](../apps/admin/src/components/admin/DominionStates.tsx)) for loading, error (with Retry), and empty. Each block also has its own empty message (§5). |
| F8 | Medium | **`verified_at` is missing on 52 of the 56 verified stations.** `status = 'verified'` on 56, `verified_at` on 4. | Analytics counts verified by `status`. Backfill `verified_at = updated_at` where `status = 'verified' and verified_at is null`, with a note in `place_legacy_archive`, so "verified on" dates exist from now on. |
| F9 | Medium | **Confidence reads "medium" on one report.** Every live price has `report_count = 1` (one has 2) and `confidence = 'medium'`. | Wherever confidence is shown, show the report count and reporter count beside it ("Medium · 1 report · 1 reporter"). The engine's rule isn't changed here; that belongs to the Price Engine audit. |
| F10 | Medium | **No retail markup exists** (0 rows), so "vs retail estimate" can't be computed. | The benchmark is the raw **pump − Petrojam gap** (J$/L), labelled "Gap above Petrojam (includes taxes and margins)". It never says "markup". |
| F11 | Medium | **Brand "Independent" and "unknown" look the same.** 65 stations have `brand_id is null`, and the compat view shows them all as "Independent". | Analytics shows a "No brand set" bucket from `brand_id is null`. It never reads the view's text. |
| F12 | Medium | **No dark mode.** The page hardcodes light `slate-*` colours, but the shell has a dark toggle. | Build on the Dominion design-system tokens from the new Stitch screen. Every colour, including chart colours, works in both themes. |
| F13 | Medium | **Overlap with existing screens.** Parish coverage is already on D4/D5 (Places review → Coverage), and live prices are on P4 (Price Engine → Published). Copying those would create two sources of truth. | This page shows **analysis** (price levels, gaps, trends, trust). For counts and queues it links out: "Review places" → `plug-places`, "Review prices" → `fuel-price-engine`, "Open station" → the station drawer. It reuses `places.coverage_count` and never recounts. |
| F14 | Medium | **The Fuel hub card's text is out of date.** [DominionHomes.tsx:227](../apps/admin/src/components/admin/DominionHomes.tsx#L227) says "How complete the station list is." | Change it to "Pump prices against Petrojam, coverage and data trust by parish and brand." |
| F15 | Medium | Grade names differ: the engine uses `e10_87 / e10_90 / …` and Petrojam uses `gasolene_87 / auto_diesel / ulsd`. | Analytics only ever calls `places.wholesale_on(grade, date)`. No grade mapping is written in TypeScript. |

---

## 4. Parts of the guide that are not built

| Guide item | Reason |
|---|---|
| A separate warehouse or star schema (BigQuery/Snowflake), Airflow, Power BI/Superset | `places.*` already is the star: `price_report` is the fact table, and `place`, `brand`, `geo.boundaries` and the Petrojam week are the dimensions. A second copy would break the master-data rule. |
| Pre-aggregated materialized views and new crons | At 204 stations and 77 reports, one SQL function answers in milliseconds. Disk IO is a known constraint ([[supabase-disk-io-plan]]): no new crons, no MVs. |
| Real-time streams | Prices move weekly with Petrojam. The 5-minute response cache is enough. |
| "Best day to buy" | One reporter and a weekly price cycle make it meaningless. Plug's job anyway. |
| Consumer map "near me", fleet route costs | Plug and Fleet own these (§1). |
| A gate or band that hides odd prices | Dominion captures and labels; it never hides data ([[feedback-dominion-capture-not-gate]]). Odd prices show with their Price Engine label. |

---

## 5. The page — layout and every block

Desktop is 12 columns. On phones the blocks stack in the same order. The most important number is above the fold at 1366×768.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb · Title · one-line subtitle                     [Export CSV]   │
│ FILTERS: Grade [E10-87 ▾]  Week [22 Oct ▾]  Parish [All ▾]  Brand [All ▾] │
│ FRESHNESS STRIP: Petrojam week 22 Oct · newest pump report 27 Oct 17:22 · │
│                  2 reporters · 1 source (Fleet)                           │
├──────────────┬──────────────┬──────────────┬──────────────┬───────────────┤
│ A1 Pump      │ A2 Petrojam  │ A3 Gap above │ A4 Price     │ A5 Stations   │
│ median       │ ex-refinery  │ Petrojam     │ range        │ priced        │
├──────────────┴──────────────┴──────────────┴──────────────┴───────────────┤
│ B Narrative line (one sentence, generated from the same numbers)          │
├────────────────────────────────────────────┬──────────────────────────────┤
│ C Price trend (8 cols)                     │ D Data trust (4 cols)        │
├────────────────────────────────────────────┼──────────────────────────────┤
│ E Parish table + bar (7 cols)              │ F Map (5 cols)               │
├────────────────────────────────────────────┴──────────────────────────────┤
│ H Brand comparison (full width, compact)                                  │
├───────────────────────────────────────────────────────────────────────────┤
│ I Station table (sortable, searchable, drill-through)                     │
├───────────────────────────────────────────────────────────────────────────┤
│ G Data to fix (collapsible; counts + links)                               │
└───────────────────────────────────────────────────────────────────────────┘
```

### Global rules

- **Filters** apply to every block, and the URL holds them (`?page=fuel-analytics&grade=e10_87&week=2026-10-22&pcode=JM06&brand=<id>`) so a view can be shared. Grade options are the grades that have Petrojam data. Default grade: E10-87. Default week: `places.latest_petrojam_date()`. The Parish list is always the 14 from `geo.boundaries`. The Brand list is the 17 brands plus "No brand set".
- **Currency:** `J$` with 2 decimals and thousand separators, "per litre" (e.g. `J$225.40/L`). Deltas are signed, e.g. `+J$4.50 (+2.0%)`.
- **Sample size on every pump figure:** "n = 10 stations · 11 reports". A pump figure with n < 3 stations gets a neutral "Few reports" chip. It is never hidden.
- **Outdated prices** (`outdated = true`, or a Petrojam week older than the selected week) are included in counts but drawn hollow or striped, labelled "May be outdated". The KPIs use current-week prices only and say so in the caption.
- **Colour:** neutral for 90% of the page. One accent for the pump series and one muted colour for Petrojam. Red/amber only for things to fix. Colour is never the only signal: every status also has text.
- **Every block has three states:** loading skeleton, error with Retry (S3 kit), and a specific empty message (below).

### A — KPI row (5 cards)

Each card has: label, value, comparison line, sample line, and a 12-week sparkline where history exists.

| Card | Value | Comparison | Sample line | Empty |
|---|---|---|---|---|
| A1 **Pump median** | Median `price_per_litre` of current-week live prices for the grade/filters | vs previous Petrojam week's median of accepted reports | "n = X stations · Y reports" | "No pump price this week" + link "Review prices" |
| A2 **Petrojam ex-refinery** | `wholesale_on(grade, week)` | WoW change and YoY change (same week last year) | "Petrojam · effective {date}" | "No Petrojam price for this grade" |
| A3 **Gap above Petrojam** | A1 − A2, in J$/L and % | vs last week's gap | Caption: "Includes taxes, distributor and retailer margins" | "—" when A1 is empty |
| A4 **Price range** | Lowest – highest current price | Station names under each, clickable → station drawer | "n = X stations" | "Need 2 priced stations" |
| A5 **Stations priced** | Stations with any live price for the grade ÷ stations in scope (e.g. "10 / 204 · 4.9%") | vs last week's priced count | "Verified: 56" | Always shows (0 / 204 is a real answer) |

### B — Narrative line

One sentence built from the A-row numbers. No AI call. Example:

> "This week E10-87 is J$225.40/L at the pump (median of 4 stations, 1 reporter), J$23.59 above Petrojam's J$201.81. Lowest: FESCO Beechwood, J$221.66."

If n < 3 the sentence ends with "Few reports — treat as indicative." It is hidden only when A1 is empty.

### C — Price trend (answers Q1)

- A line chart with weekly points. X axis: Petrojam weeks. Default range 26 weeks, switchable to 12w / 26w / 52w / 5y (5y shows Petrojam only).
- Series: **Petrojam** (solid, muted), **Pump median** (accent, with markers only on weeks that have reports), and **Pump min–max** (light band). Weeks without pump data leave a gap; they are never interpolated.
- Tooltip: week, Petrojam, pump median, gap, n reports, n stations.
- Under the chart: the latest WoW and YoY change, in words.
- Empty pump series: the chart still shows Petrojam, with the note "No pump reports in this range".

### D — Data trust (answers Q3)

A small stacked card, with no chart:

- **Newest pump report:** relative time plus exact timestamp (from `last_report_at`, F4).
- **Reports this week:** accepted / duplicate / rejected / in review, with a link to review.
- **Reporters:** count, and the largest reporter's share ("1 reporter supplies 100% of prices"). An amber chip when the share is over 50%.
- **Sources:** Fleet n, Plug n.
- **Live prices that may be outdated:** X of Y (from `price_engine_health.outdated_share`).
- **Petrojam synced:** `latest_petrojam_date()`. Amber when it's more than 8 days old.

Reporter keys are never shown here. Only counts and shares.

### E — Parish breakdown (answers Q2 and Q4)

A table with all **14 parishes, always**, named from `geo.boundaries`:

| Parish | Stations | Verified | Priced | Coverage % | Median price | Gap above Petrojam | vs national median |
|---|---|---|---|---|---|---|---|

- An inline bar in "Coverage %". "Median price" is "—" with "no price" when unpriced.
- Sorted by stations by default; any column can be sorted.
- Click a row → sets the Parish filter (every block updates).
- Footer link: "Coverage queue" → `plug-places` (D4/D5) for review counts.

### F — Map (answers Q2 and Q4)

- Leaflet 1.9.4 (already in admin) with the same OSM tiles as D2/S14.
- Every station is a dot. Fill = price quintile for the grade (sequential, 5 steps). Grey hollow = no price. Striped = outdated price. Squares for verified, circles for pending.
- Banner: "Pins not yet checked: 204 / 204". Pins are drawn but labelled (see F1).
- Click a dot → popover with name, brand, parish, price, report count, age, and "Open station".
- The map follows the Parish filter (zooms to it).
- Legend in the corner. Phones show the list (block I) above the map and the map collapses to 240px.

### H — Brand comparison

- A horizontal bar per brand: median price (bar) and stations priced / total (text). "No brand set" is a real row.
- Bars only for brands with ≥ 1 price. Brands with 0 prices are listed below as "No prices yet: Texaco (7), Petcom (6), …".
- Click a brand → sets the Brand filter.

### I — Station table (Tier 3)

Columns: Station · Brand · Parish (from pcode) · Status (Verified / Pending) · Price (selected grade) · Gap above Petrojam · vs parish median · Reports · Confidence · Newest report · Flags.

- Flags are chips: "May be outdated", "Few reports", "Pin unchecked", "Parish text mismatch", "No brand set".
- Search by name or address. Sort any column. Default sort: priced first, then by price ascending.
- 50 rows per page. All 204 are reachable, including unpriced stations ("no price" in muted text).
- Row click → the existing station drawer (P5 / StationDetailView). It never opens a new page.
- **Export CSV** (header button) exports this table with the current filters, plus a header row of filters and generated time.

### G — Data to fix (answers Q4; replaces the "Quality 100" card)

Collapsed by default, with a summary: "4 data issues affecting 341 records". Expanded, each line has a count and a link to the screen where it is fixed:

| Issue | Today | Link |
|---|---|---|
| Parish text disagrees with map location | 72 | Station database, filtered |
| No brand set | 65 | Station database, filtered |
| Pin not checked | 204 | Places review |
| Verified but no verified date | 52 | (cleared by the F8 backfill) |
| Reports waiting in Price Engine review | live | Price Engine → Review |

---

## 6. Backend — one read path

### 6.1 One SQL function

New migration: `places.station_analytics(p_grade text, p_week date, p_pcode text default null, p_brand uuid default null) returns jsonb`. It is `security definer`, `stable`, `search_path = places, public, geo`. `revoke all … from public, anon, authenticated; grant execute … to service_role`. Its shape:

```jsonc
{
  "meta": { "grade": "e10_87", "week": "2026-10-22", "prevWeek": "2026-10-15",
            "petrojam": 201.8128, "petrojamPrev": 206.3128, "petrojamYearAgo": 0,
            "latestPetrojamDate": "2026-10-22", "lastReportAt": "…", "generatedAt": "…" },
  "kpis":   { "pumpMedian": 0, "pumpMedianPrev": 0, "nStations": 0, "nReports": 0,
            "min": {"placeId":"…","name":"…","price":0}, "max": {…},
            "stationsPriced": 0, "stationsInScope": 0, "stationsPricedPrev": 0, "verified": 0 },
  "trust":  { "reporters": 0, "topReporterShare": 1, "fleet": 0, "plug": 0,
            "accepted": 0, "duplicate": 0, "rejected": 0, "review": 0, "outdatedShare": 0 },
  "trend":  [ { "week": "…", "petrojam": 0, "pumpMedian": null, "pumpMin": null, "pumpMax": null,
              "reports": 0, "stations": 0 } ],
  "parishes": [ { "pcode": "JM01", "name": "Clarendon", "stations": 0, "verified": 0,
                "priced": 0, "median": null } ],
  "brands": [ { "brandId": null, "name": "No brand set", "stations": 65, "priced": 0, "median": null } ],
  "stations": [ { "placeId": "…", "name": "…", "brand": "…", "pcode": "JM06", "parish": "Saint Andrew",
                "status": "verified", "price": null, "reportCount": 0, "confidence": null,
                "lastReportAt": null, "outdated": null, "pinState": "unchecked",
                "parishTextMismatch": false, "lat": 0, "lng": 0 } ],
  "quality": { "parishMismatch": 72, "noBrand": 65, "pinUnchecked": 204, "verifiedNoDate": 52 }
}
```

Rules inside the function:

- **Station scope:** `places.place where place_type = 'gas_station' and duplicate_of is null`, filtered by `left(pcode,4) = p_pcode` and `brand_id is not distinct from p_brand` when those are given.
- **Parish:** `geo.boundaries` admin_level 1 on `left(pcode,4)`. All 14 rows are always returned (left join from boundaries).
- **Petrojam:** `places.wholesale_on(p_grade, week)` only. Year-ago = `wholesale_on(p_grade, p_week - 364)`.
- **Live price:** `places.price_current` for `(place_id, p_grade)`. "Current week" means `petrojam_week = p_week`.
- **Trend pump points:** reports joined to `price_report_check` with `status = 'accepted' and weight > 0`, bucketed to the Petrojam week via `max(price_date) <= reported_at::date`. Median is `percentile_cont(0.5)`. Duplicates (weight 0) are never counted, matching the engine.
- **Medians**, not means, everywhere (robust to the odd fill the owner chose to keep).
- **Ages** use `last_report_at` (F4), never `observed_at`.
- **Trend length:** 260 weeks maximum (5y). Pump points exist only from 2 Sep 2026.

Add `places.station_analytics` to the existing SQL check file `scripts/sql/price_engine_checks.sql` (see §8).

### 6.2 One route

In `supabase/functions/explorer/price_engine_admin.ts`, add `GET /admin/analytics/stations?grade=&week=&pcode=&brand=`:

- Guard: `requirePlatformAdmin` (F5), not `requireOwner`.
- Validate `grade` against the grades `wholesale_on` knows. `week` is `YYYY-MM-DD` (default: the latest Petrojam date). `pcode` must match `^JM\d{2}$`. `brand` must be a UUID or `none`.
- Calls the RPC and returns its JSON.
- `Cache-Control: private, max-age=300`.
- Errors are `{ error }` with status 400 or 403, and they're never turned into an empty 200.

### 6.3 Frontend structure

New folder `apps/admin/src/components/admin/station-analytics/`:

| File | Job |
|---|---|
| `StationAnalyticsPage.tsx` | Page shell, filters ↔ URL, states. Carries the `// Stitch: dominion-redesign/<new id>` marker. |
| `stationAnalyticsApi.ts` | One `fetchStationAnalytics(filters, token)`. Throws on `!ok`. Types match §6.1. |
| `useStationAnalytics.ts` | `useQuery(['station-analytics', grade, week, pcode, brand])`, `staleTime` 5 min, `keepPreviousData` so filters don't flash. |
| `AnalyticsKpiRow.tsx`, `AnalyticsNarrative.tsx`, `PriceTrendChart.tsx`, `DataTrustCard.tsx`, `ParishTable.tsx`, `StationPriceMap.tsx`, `BrandBars.tsx`, `StationPriceTable.tsx`, `DataToFixPanel.tsx` | One block each (§5). Each takes typed props and does no fetching. |
| `stationAnalyticsFormat.ts` | `formatJmdPerLitre`, `formatDelta`, `sampleLabel`, `narrativeSentence`. Pure, unit-tested. |

- Charts use **Recharts** (already in admin). The map uses **Leaflet 1.9.4** (already in admin). No new dependencies.
- **All maths is in SQL.** The frontend formats and draws only. It never sums, averages or takes a median over rows. (This is the defect pattern in Fleet's Fuel Analytics, which aggregates raw rows in the browser.)
- Remove [StationHealth.tsx](../apps/admin/src/components/admin/StationHealth.tsx). In [AdminPortal.tsx:35](../apps/admin/src/components/admin/AdminPortal.tsx#L35) and [:252](../apps/admin/src/components/admin/AdminPortal.tsx#L252), lazy-load `StationAnalyticsPage` for `fuel-analytics`. The nav label is "Station Analytics" in [adminNavConfig.ts:69](../apps/admin/src/components/admin/adminNavConfig.ts#L69). Keep the redirects at lines 248–249.
- Accessibility: every chart has a visually hidden data table (or `aria-describedby` with the narrative), and the KPI cards are a `<dl>`. Filters are keyboard-reachable, the table headers are sort buttons with `aria-sort`, map dots have labels, and focus is visible in both themes.

---

## 7. Design contract (Stitch)

1. Build the screen in the Stitch project **Dominion Redesign** (`7083594865949473827`) with the Dominion design system. Use the prompt in [stitch/station-analytics-prompt.txt](stitch/station-analytics-prompt.txt), and make light and dark variants.
2. Export the HTML to `docs/stitch/dominion-redesign/html/S19-station-analytics.html` (this replaces the old one), and the PNG to `screenshots/`.
3. In [README.md](stitch/dominion-redesign/README.md), update row **S19**: new Stitch id; React files = `StationAnalyticsPage.tsx` **first**, then every block file from §6.3, joined with ` + ` (all under `apps/admin/src/components/admin/station-analytics/`); status "Ported. Prices vs Petrojam, coverage and trust. No customer data." Add the new id to `screens.json`.
4. `node scripts/stitch-contract.mjs` must pass, and `node scripts/stitch-fidelity.mjs --report` must show S19 at 100% (§0).
5. Stitch sample numbers are placeholders only. The React page shows live data, and it never ships Stitch sample values (README rule: no fake widgets).

---

## 8. Tests and exit checks

| # | Check | Pass when |
|---|---|---|
| T1 | SQL test in `scripts/sql/price_engine_checks.sql`: seed 3 stations in 2 parishes, Petrojam for 2 weeks, 4 accepted reports + 1 duplicate (weight 0) + 1 rejected. | Median, n, gap, the 14 parish rows, the duplicate counted 0 times and the rejected excluded all match hand-computed values. |
| T2 | SQL test: a station with parish text "Kingston" and pcode JM06. | It appears under Saint Andrew, and `parishMismatch` = 1. |
| T3 | SQL test: a station with no price. | It is in `stations` with `price: null`, and counted in `stationsInScope`, not in `stationsPriced`. |
| T4 | Deno route test: a staff user (non-owner platform admin) gets 200, an anon user gets 401/403, and a bad `pcode` gets 400. | As stated. |
| T5 | Vitest for `stationAnalyticsFormat.ts`: currency, signed deltas, the "Few reports" label at n = 1/2/3, and the narrative with an empty A1. | Snapshot strings match. |
| T6 | `npx tsc --noEmit -p apps/admin` | No new errors over today's admin baseline. |
| T7 | `node scripts/stitch-contract.mjs` | Exit 0. |
| T8 | F1 re-score: run `select fleet.score_master_data()` after the view change. | The stations score drops below 100 and `failing` equals the count of stations that fail any of the three rules. |
| T9 | Live check after deploy: open the page as owner and as a staff member, in light and dark. | A1 shows J$ with "n = …", A2 matches `fuel_petrojam_prices` for 22 Oct (E10-87 → 201.81), the parish table has 14 rows, the map shows 204 dots, and the newest report reads 27 Oct, not today. |
| T10 | Phone width 390px. | No horizontal scroll, KPIs stack 1-up, the table scrolls inside its card. |
| T11 | `node scripts/stitch-fidelity.mjs --report` | S19 = 100%, and no old UI kit is used. |
| T12 | Side-by-side screenshots (Stitch PNG vs running page) at 1440 light, 1440 dark and 390, attached to the PR. | Same blocks, order, columns, labels and chart types. Only the data values differ (§0). |

## 9. Build order

1. **SQL migration:** F4 (`last_report_at` columns and publish change), F1 (`station_quality`), F8 (backfill), and the `station_analytics` function. Then T1–T3 and T8.
2. **Route** (§6.2), then T4. Deploy `explorer`.
3. **Stitch screen** (§7), then T7. **The UI isn't started until the Stitch HTML is in the repo (§0).**
4. **Frontend**: port the Stitch HTML (§0, §6.3), then T5, T6, T11, T12.
5. **Hub card text** (F14). Remove `StationHealth.tsx`.
6. **Live checks** T9 and T10.

## 10. Out of scope (noted for other audits)

- Fleet → Fuel Analytics (customer spending) keeps its own page. While reading it for this audit, two problems turned up. Its "Recent Refueling Activity Log" shows raw `amount`/`liters`, while the KPIs above use `fuelOpsSpendAmount`/`fuelOpsLiters`. And its "Fuel Price Tracking" chart labels a period average as the market line. Both belong in a Fleet audit.
- Price Engine confidence rules (F9) and the open items in [fuel-price-engine-plan.md](fuel-price-engine-plan.md).
