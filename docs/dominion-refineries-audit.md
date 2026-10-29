# Dominion Refineries (was "Fuel prices") — rebuild audit

**Rev 1 · 2026-10-29** · Audit only. No code was changed. Project `csfllzzastacofsvcdsc`. All numbers below were read from production today.

Written for: the owner, and Cursor implementing it. Screen prompt: [stitch/refineries-prompt.txt](stitch/refineries-prompt.txt). Sister audits: [dominion-station-analytics-audit.md](dominion-station-analytics-audit.md) and [dominion-station-database-audit.md](dominion-station-database-audit.md).

Page: Dominion → Fuel → **Prices** (page id `fuel-prices`, Stitch row S18). Today it is [FuelPricesPage.tsx](../apps/admin/src/components/admin/fuel-prices/FuelPricesPage.tsx): one table of Petrojam's latest week, plus sync buttons.

**The owner's decision:** this section is a list of **refineries**. Jamaica has one today (Petrojam), and more will come. Petrojam is one refinery record, not the name of the system.

---

## 0. READ FIRST — the Stitch screens are the spec. Port them; don't redesign them.

The owner designs these screens in Stitch: **S18** (Refineries page) and **S18b** (Add refinery / enter prices dialog). **The exported Stitch HTML is the UI to build, element for element.** This audit says where the data comes from, how it's stored and computed, and who can do what. It does **not** give the implementer freedom to design the screen. A previous build "followed the audit" and produced a different screen. That counts as a failed build.

**Order of work:**
1. Database and API (§6) can be built now.
2. The owner finishes the Stitch screens. The HTML is saved to `docs/stitch/dominion-redesign/html/S18-refineries.html` and `html/S18b-refinery-dialog.html`, with PNGs in `screenshots/`.
3. **Only then** is the React UI written. If those files aren't in the repo, stop after step 1. Don't write UI from the wireframe in §5.

**Who wins when they disagree:**

| Topic | Source of truth |
|---|---|
| Layout, block order, sizes, spacing, colours, fonts, icons, chips, borders, corner radius, chart type, table columns and their order, wording of titles, labels, buttons, captions and empty states | **Stitch HTML.** The §5 wireframe and the wording in this audit are guidance only. |
| Which value goes in which slot, how it's calculated, the data model, sync behaviour, revisions, permissions, states, tests | **This audit** |

**Porting rules:**
1. Rebuild the Stitch HTML's structure in JSX: same sections, same order, same nesting, same Tailwind classes/tokens. Copy the class lists; don't re-style.
2. Copy every heading, label, column name, chip, button and caption **word for word**.
3. Replace only the Stitch **sample values** (prices, dates, counts) with live data from §6. Keep the element and its styling.
4. **Don't add** blocks, columns, chips, tabs, badges or icons that aren't in Stitch. **Don't remove** any. If a Stitch element has no data source, render its empty state and list it in the PR description.
5. Don't swap Stitch components for "something similar" (a dropdown for a segmented control, a plain table for the price board, a different chart type).
6. No old UI kit (`@roam/ui`, `components/ui`, `maintenance-templates/plainUi`) in the page. Today's page imports `plainUi`; the new one must not.
7. Dark mode comes from the Stitch Dark variant, not from guessing.
8. Splitting into files (§6.4) is fine. Each file still holds its part of the Stitch markup unchanged.

**Proof (part of the exit checks, §8):**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for S18 and S18b, not just the 80% CI floor. Each README row lists every React file of that screen joined with ` + `, because the script only reads the files named there.
- The PR includes side-by-side screenshots: the Stitch PNG on the left, the running page on the right. Screens: 1440 px light and dark, the dialog open, and 390 px. Pass = same blocks in the same order, same columns, same chips, same chart type, same labels. Only the data values differ.

---

## 1. What this page is for

The refinery price is the **benchmark** every pump price in Dominion is compared against: Price Engine bounds, Station analytics "Gap above Petrojam", Fleet's retail estimate. This page answers:

1. **Which refineries exist, and which one is the benchmark?**
2. **What is each refinery charging this week, per product, and how did it move?**
3. **What is the long-run trend?** (Petrojam has 22 years of weekly prices)
4. **Is the data current?** When was the last sync, did it find a new week, and is a week missing?
5. **Did a refinery revise a past week?** (A revision must be kept, never overwritten.)

## 2. Data that exists (production, 29 Oct)

| Fact | Value |
|---|---|
| Table | `fuel.petrojam_prices`: **wide**, one row per week, one column per product. Unique on `price_date`. RLS on: authenticated may SELECT, service_role may do anything. |
| Public views | `public.fuel_petrojam_prices` and `public.fuel_retail_price_markup` (both `security_invoker`) |
| History | **1,183 weeks, 19 Feb 2004 → 22 Oct 2026.** No gaps since 2023. All 9 products are filled in 2025–26. |
| Products | Gasolene 87, Gasolene 90, Auto diesel, ULSD, Kerosene, Propane, Butane, HFO, Asphalt |
| Week day | Thursday, except one Friday row (2025-11-14) |
| Latest (22 Oct) | 87 J$201.8128 · 90 J$210.5787 · Auto diesel J$246.9103 · ULSD J$271.5973 |
| Sync | GitHub Actions [petrojam-weekly-sync.yml](../.github/workflows/petrojam-weekly-sync.yml) (Thu 17:00 UTC) → `petrojam-prices /cron/sync-latest`. The last 6 runs report "success", even on runs that found no new week. |
| Retail markup | `fuel.retail_price_markup`: **0 rows** |
| Readers of the Petrojam table | `places.wholesale_on`, `places.latest_petrojam_date`, `places.price_engine_publish`, `places.station_analytics`, `places.latest_retail_estimate` (to be retired), `_fleet-server/fuel_retail_stamp.ts`, [apps/fleet/src/services/fuelRetailBenchmark.ts](../apps/fleet/src/services/fuelRetailBenchmark.ts), `packages/fuel-core/src/retailPriceEstimate.ts`, and the admin Price Engine and Station analytics screens (which say "Petrojam" in their labels) |

---

## 3. Findings

Severity: **High** = wrong data shown, history can be lost, or it blocks the refinery model. **Medium** = a quality or UX defect.

| # | Sev | Finding | Fix |
|---|---|---|---|
| R1 | High | **Petrojam is the schema, not a record.** The table name, the per-product columns, the `price_date` unique key and every reader are hard-wired to one refinery. A second refinery can't be stored without a new table and changes to every reader. | A long-format model: `fuel.refinery`, `fuel.refinery_product`, `fuel.refinery_price` (§6.1). Petrojam becomes refinery #1 with `is_benchmark = true`. |
| R2 | High | **A revised week overwrites history.** `upsertScraped` does `upsert … onConflict: price_date` ([petrojam-prices/index.ts:96](../supabase/functions/petrojam-prices/index.ts#L96)). If Petrojam corrects a past week, the old value is gone, and the fills that were checked against it can no longer be explained. This breaks "capture, never discard" ([[feedback-dominion-capture-not-gate]]). | `refinery_price` keeps every version. A changed value inserts a new row with `revision = n+1` and sets `superseded_at` on the old one. Only the current row (`superseded_at is null`) is used. An unchanged value only updates `last_seen_at`. |
| R3 | High | **The "Ex-refinery JMD" column can never fill.** It is hardcoded to "The data is not in yet" ([FuelPricesPage.tsx:246](../apps/admin/src/components/admin/fuel-prices/FuelPricesPage.tsx#L246)), and the number shown is labelled "Wholesale". Petrojam publishes one price per product per week. Two columns imply two prices that don't exist. | One price column, labelled **"Ex-refinery price"**. The word "wholesale" is removed from Dominion's UI and comments. |
| R4 | High | **1,183 stored weeks can't be seen.** The page shows only `prices[0]`. There's no chart, no week picker and no history table. The year/month filters only change which week becomes "latest". | §5: price board with week-on-week change and sparklines, a trend chart (12 weeks → all years), and a paged weekly history table. |
| R5 | High | **Sync "success" means nothing.** The workflow passes on any HTTP 200. Nothing records how many weeks were new, nothing flags a missing Thursday, and the page shows no sync history. A stale benchmark makes every price check stale. | `fuel.refinery_sync_run` logs every run: who or what started it, mode, pages, weeks found / new / unchanged / revised, error, timing. The page shows the last 10 runs and a freshness chip: **Current** (latest week ≤ 7 days old), **Due** (Thursday has passed and no new week yet), **Late** (> 8 days). The workflow fails when the run returns `error`. |
| R6 | Medium | **Units are not stored.** The UI prints "JMD $201.8128" with no unit, and asphalt, HFO and LPG may not be per litre. (Petrojam's site returned 403 to an automated read, so this audit doesn't state their units.) | `refinery_product.unit` per product. It's seeded "per litre" for the 4 motor fuels (Price Engine, Station analytics and Fleet already compare them per litre). The other 5 are left "unit not set" and shown as such until the owner sets them in the product list (§5, block E). Prices show 2 decimals in the board, and 4 in the history table and tooltips. |
| R7 | Medium | **The refinery name is hardcoded in other screens.** The Station analytics and Price Engine UIs say "Petrojam" in their labels. | The benchmark's name comes from the API (`benchmark.name`) and is shown wherever "Petrojam" is written today. The words "Gap above Petrojam" become "Gap above {benchmark}". |
| R8 | Medium | **Public views grant anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE.** This isn't exploitable today: both views are `security_invoker`, and the base tables only allow authenticated SELECT. But one option change would open them. | `revoke insert, update, delete, truncate, trigger, references on public.fuel_petrojam_prices, public.fuel_retail_price_markup from anon, authenticated;`. The new tables grant only SELECT to `authenticated`. |
| R9 | Medium | **Fake labels.** "REGION: JM-KGN", "LOC: KINGSTON / PETROJAM REFINERY JMD" and a "The data is not in yet." footer are hardcoded. | Removed. (Same sweep as the station database audit §10.) |
| R10 | Medium | **The sync form's Year and Month boxes render blank** (see the screenshot), though state holds 2026 / October. The `plainUi` `Select` doesn't show the current value. | Fixed by the rebuild (rule 6: no `plainUi`). |
| R11 | Medium | **Year range mismatch.** The UI offers 2010+, and the scraper's server filter only covers 2010–2021 (`PETROJAM_YEAR_FILTER_MAX = 2021`, [scrape.ts:68](../supabase/functions/petrojam-prices/scrape.ts#L68)), but stored data starts in 2004. | Year choices come from the data: `min(effective_date)` → the current year. The Petrojam adapter keeps using its own server filter where Petrojam supports one, and falls back to a page scan elsewhere (as today). |
| R12 | Medium | **Filter query params leak across pages.** `grade=e10_87&week=…` from Station analytics stay on `fuel-home` and `fuel-prices` (see the screenshots). | When the page changes, keep only that page's own params. Each page declares its param names, and the router drops the rest. |
| R13 | Medium | No dark mode. The page is hardcoded light. | From the Stitch Dark variant. |

---

## 4. What stays

- The sync modes (latest, one year, one month, full archive) stay. They move into the **Sync** panel, owner/`catalog.write` only, as today.
- The weekly GitHub workflow stays. Its URL `petrojam-prices/cron/sync-latest` stays and now syncs **every active refinery with an automatic source**.
- `places.wholesale_on(grade, date)` keeps its name and signature, so Price Engine and Station analytics don't change. It now reads the **benchmark** refinery's current price.

---

## 5. The page — layout and every block

Nav label "Refineries". Page id stays `fuel-prices` so links and permissions keep working. Hub card ([DominionHomes.tsx](../apps/admin/src/components/admin/DominionHomes.tsx)): title "Refineries", detail "Refineries and their ex-refinery prices. Petrojam is the benchmark." The benchmark name is live.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb · "Refineries" · subtitle                 [+ Add refinery]     │
├───────────────────────────────────────────────────────────────────────────┤
│ A REFINERY CARDS (horizontal row; one per refinery; selected = ring)      │
│   [Petrojam · Benchmark · Kingston · Active · Week 22 Oct · Current]      │
│   [ + Add a refinery  (dashed) ]                                          │
├───────────────────────────────────────────────────────────────────────────┤
│ SELECTED REFINERY HEADER: name, Benchmark chip, source, cadence,          │
│   freshness chip, "Next expected Thu 29 Oct", [Sync now ▾]                │
├───────────────────────────────────────────────────────────────────────────┤
│ B PRICE BOARD — week picker ‹ 22 Oct 2026 ›                               │
│   Motor fuels: 87 · 90 · Auto diesel · ULSD   (4 large tiles)             │
│   Other products: Kerosene · Propane · Butane · HFO · Asphalt (compact)   │
├────────────────────────────────────────────┬──────────────────────────────┤
│ C TREND CHART (8 cols)                      │ D SYNC & HEALTH (4 cols)     │
├────────────────────────────────────────────┴──────────────────────────────┤
│ E WEEKLY HISTORY TABLE (paged; year filter; export)                       │
├───────────────────────────────────────────────────────────────────────────┤
│ F PRODUCTS & UNITS (collapsible)                                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### A — Refinery cards
One card per refinery: name, operator, location, status (Active / Planned / Closed), a **Benchmark** chip on exactly one, the latest effective week, and the freshness chip (R5). Selecting a card sets `?refinery=<slug>`. A dashed "+ Add a refinery" card opens **S18b** (owner only). With one refinery the row still shows. The add card is what tells the owner more can come.

### Selected refinery header
Name, Benchmark chip, source ("petrojam.com/price · automatic, weekly on Thursdays" or "Entered by hand"), freshness chip, "Next expected: Thu 29 Oct", and a split button **Sync now** (latest week) with a menu: Sync a year…, Sync a month…, Sync full archive… (confirm dialog). Owner/`catalog.write` only. Hidden for refineries entered by hand, which get **"+ Enter week's prices"** (opens S18b on the prices step).

### B — Price board
- A week picker (‹ week ›, plus a date popover limited to stored weeks). Default: the latest week.
- **Motor fuels** (87, 90, Auto diesel, ULSD) as 4 tiles. Each tile: product name, price "J$201.81 /L", change vs the previous stored week "▼ J$4.50 (−2.2%)", a 12-week sparkline, a thin 52-week low–high bar with a marker for this week, and the effective date. If the shown value is a revision: a "Revised" chip with a tooltip showing the old value and the revision date.
- **Other products** (Kerosene, Propane, Butane, HFO, Asphalt) as a compact 5-column strip with the same data and no sparkline. When `unit` is null, the unit reads "unit not set".
- Colour: a price rise uses the neutral text plus ▲, never alarm red. A refinery price going up is information, not an error.

### C — Trend chart
- A line chart, weekly points. Range control: 12w · 26w · 52w (default) · 5y · All (2004→).
- Product chips toggle series. Motor fuels are on by default, the others off. Max 5 series on at once.
- Tooltip: week, then each product's price and week-on-week change.
- With 2+ refineries: a "Compare refineries" switch shows one product across all refineries. With one refinery the switch is disabled, with the caption "Add a second refinery to compare".

### D — Sync & health
- Freshness chip, plus "Latest week 22 Oct 2026 · synced 22 Oct, 20:28".
- **Last 10 runs** from `refinery_sync_run`: when, trigger (Schedule / Owner name / Manual entry), mode, result ("1 new week", "No new week", "1 revised", or the error text), duration.
- **Gaps:** the count of expected weeks with no price, since 2023 (today 0). The list expands.
- **Revisions:** the count of weeks with more than one version, with a link that filters block E to them.

### E — Weekly history table
Rows are weeks (newest first), columns are products in the board order, then "Revised" and "Source". 52 rows per page, a year filter (from the data, R11), **Export CSV** (the current filter, all products, 4 decimals, and a units header row). Click a cell: a popover with the version history for that week and product.

### F — Products & units
A small table: product, code, unit, which Price Engine grade it backs (`e10_87 → gasolene_87`, …), and shown on the board (yes/no). The owner can edit the unit and the label. The grade mapping is read-only here; it lives in SQL (§6.1).

### S18b — Add refinery / enter prices dialog (owner only)
- Step 1 "Refinery": name, operator, country (default Jamaica), location (pick a place, optional), website, status, source (Automatic: Petrojam page format / Entered by hand), and "Use as benchmark" (switching it asks for a reason; exactly one benchmark at a time).
- Step 2 "Prices" (for hand entry, or to add a missed week): effective date, one input per product with its unit, a source link or document upload (required), and a reason. Saving creates `refinery_price` rows with `source = 'manual'`. A changed value on an existing week creates a revision (R2). Nothing is overwritten.

### States
Loading skeleton cards and tiles. Error with Retry (S3 kit). A refinery with no prices yet: "No prices yet" with "Enter week's prices" / "Sync now". Read-only for users without `catalog.write`: the sync and add controls are hidden, with the note "You can view prices. Only the owner can sync or add refineries."

---

## 6. Backend

### 6.1 One migration

```sql
create table fuel.refinery (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- 'petrojam'
  name text not null,                        -- 'Petrojam'
  operator text, country text not null default 'JM',
  place_id text references places.place(id), -- optional pin
  website text, price_source_url text,
  source_kind text not null check (source_kind in ('petrojam_html','manual')),
  cadence text not null default 'weekly_thu',
  status text not null default 'active' check (status in ('active','planned','closed')),
  is_benchmark boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index refinery_one_benchmark_per_country on fuel.refinery(country) where is_benchmark;

create table fuel.refinery_product (
  code text primary key,           -- gasolene_87, gasolene_90, auto_diesel, ulsd, kerosene, propane, butane, hfo, asphalt
  label text not null, unit text,  -- 'per litre' for the 4 motor fuels, null for the rest (R6)
  engine_grade text unique,        -- e10_87, e10_90, diesel, ulsd; null for the rest
  board_group text not null check (board_group in ('motor','other')),
  sort int not null
);

create table fuel.refinery_price (
  id uuid primary key default gen_random_uuid(),
  refinery_id uuid not null references fuel.refinery(id),
  product_code text not null references fuel.refinery_product(code),
  effective_date date not null,
  price_jmd numeric(12,4) not null,
  revision int not null default 1,
  superseded_at timestamptz,
  source text not null check (source in ('scrape','manual','backfill')),
  source_url text, sync_run_id uuid, entered_by uuid, reason text,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create unique index refinery_price_current on fuel.refinery_price(refinery_id, product_code, effective_date) where superseded_at is null;
create index refinery_price_lookup on fuel.refinery_price(product_code, effective_date desc) where superseded_at is null;

create table fuel.refinery_sync_run (
  id uuid primary key default gen_random_uuid(),
  refinery_id uuid references fuel.refinery(id),
  trigger text not null,           -- 'schedule' | 'owner' | 'manual_entry'
  actor uuid, mode text,           -- latest | year | month | all
  pages int, weeks_found int, weeks_new int, weeks_unchanged int, weeks_revised int,
  error text, started_at timestamptz default now(), finished_at timestamptz
);
```

- **RLS** on all four tables. `authenticated`: SELECT. `service_role`: all. No anon access.
- **Seed:** Petrojam (`petrojam_html`, `price_source_url = 'https://www.petrojam.com/price/'`, `is_benchmark = true`, status active) and the 9 products.
- **Backfill:** unpivot `fuel.petrojam_prices` → `refinery_price` (`source = 'backfill'`, revision 1). That's 1,183 × 9 minus nulls. Check: `count(*)` per product equals the non-null count per column in the old table.
- **Compatibility:** rename `fuel.petrojam_prices` → `fuel.petrojam_prices_legacy` (kept, read-only). Create a view `fuel.petrojam_prices` (`security_invoker`) that pivots the **benchmark** refinery's current rows back into the old wide shape. `public.fuel_petrojam_prices` keeps working unchanged, so Fleet, `fuel_retail_stamp`, `fuel-core` and every `places.*` function still read the same columns. Apply R8's revoke in the same migration.
- **`places.wholesale_on`:** rewrite to read `refinery_price` joined to the benchmark refinery and `refinery_product.engine_grade = p_grade` (no more `case` mapping). Same name and signature. `places.latest_petrojam_date` → max current `effective_date` of the benchmark.
- **`fuel.benchmark()`** returns `(id, name, slug)`. Price Engine, Station analytics and Fleet labels use it (R7).

### 6.2 Sync function

`supabase/functions/petrojam-prices` keeps its name and URLs, and becomes refinery-aware:

- `scrape.ts` is the `petrojam_html` adapter. It's unchanged except that it returns `{ product_code, effective_date, price_jmd }[]` (the wide → long mapping lives in one place in the adapter).
- New `writeRefinerySnapshot(refineryId, rows, run)`. For each row: no current row → insert (`weeks_new`); same price → update `last_seen_at` (`weeks_unchanged`); different price → set `superseded_at = now()` on the old row and insert `revision + 1` (`weeks_revised`). This replaces `upsertScraped` (R2).
- Every call writes one `refinery_sync_run` (R5). `/cron/sync-latest` loops over active refineries with `source_kind <> 'manual'`. It returns `{ runs: [...] }` and status 500 if any run errored, so the workflow fails visibly.

### 6.3 API (same function, guarded with `requirePlatformAdmin` for reads; `dominionCan(role, 'catalog.write')` for writes, as today)

| Route | Returns / does |
|---|---|
| `GET /admin/refineries` | Refinery list, each with latest week, freshness, product count and benchmark flag |
| `GET /admin/refineries/:slug/board?week=` | For the week (default latest): every product with price, previous price, change, 52-week low/high, 12-week sparkline, revision info, unit |
| `GET /admin/refineries/:slug/series?products=&from=&to=` | Weekly series for the chart. "All" uses every stored week; nothing is down-sampled in the browser. |
| `GET /admin/refineries/:slug/history?year=&page=` | Wide weekly rows for block E, plus a revision flag per cell |
| `GET /admin/refineries/:slug/versions?product=&week=` | Every version of one cell |
| `GET /admin/refineries/:slug/runs?limit=10` | Sync log, gap count, revision count |
| `POST /admin/refineries` · `PATCH /admin/refineries/:slug` | Create / edit a refinery. Benchmark changes need `reason` and are written to `fleet.master_change_log`. |
| `POST /admin/refineries/:slug/prices` | Hand entry: `{ effective_date, prices: {code: value}, source_url, reason }` → `writeRefinerySnapshot` with `trigger = 'manual_entry'` |
| `POST /admin/refineries/:slug/sync` | `{ mode, year?, month? }` (today's `/admin/sync`, now per refinery) |
| `PATCH /admin/refinery-products/:code` | Edit `label` / `unit` |

Keep `/admin/prices` and `/admin/sync` as thin aliases for one release, then remove them with [petrojamPricesService.ts](../apps/admin/src/services/petrojamPricesService.ts).

### 6.4 Frontend

New folder `apps/admin/src/components/admin/refineries/`: `RefineriesPage.tsx` (shell, `?refinery=&week=&range=` in the URL, states; Stitch marker), `RefineryCards.tsx`, `RefineryHeader.tsx`, `PriceBoard.tsx`, `RefineryTrendChart.tsx`, `SyncHealthCard.tsx`, `WeeklyHistoryTable.tsx`, `ProductsUnitsTable.tsx`, `RefineryDialog.tsx` (S18b), `refineriesApi.ts`, `useRefineries.ts`, `refineryFormat.ts` (pure: `formatJmd(value, unit, decimals)`, `formatChange`, `freshnessOf(latestWeek, today)`; unit-tested).

- Recharts and `@tanstack/react-query` are already in admin. No new dependencies.
- **All maths in SQL or the function** (changes, low/high, gaps, freshness inputs). The browser formats only.
- [AdminPortal.tsx](../apps/admin/src/components/admin/AdminPortal.tsx): `fuel-prices` renders `RefineriesPage`. Nav label "Refineries" in [adminNavConfig.ts](../apps/admin/src/components/admin/adminNavConfig.ts). Add an alias `fuel-refineries → fuel-prices`. Delete `FuelPricesPage.tsx` once ported.
- R7: replace hardcoded "Petrojam" labels in `station-analytics/*` and `fuel-prices/PriceEngine*` with the benchmark name from their APIs (add `benchmark: {name}` to `station_analytics` meta and `price_engine_overview`).
- Accessibility: price tiles are a `<dl>`, changes have text ("down J$4.50") as well as arrows, the chart has a hidden data table, the week picker is keyboard-operable, and the dialog traps focus.

---

## 7. Design contract (Stitch)

1. Build **S18** and **S18b** in **Dominion Redesign** (`7083594865949473827`), light and dark, with [stitch/refineries-prompt.txt](stitch/refineries-prompt.txt).
2. Export the HTML to `html/S18-refineries.html` (this replaces `S18-fuel-prices.html`) and `html/S18b-refinery-dialog.html`. Put the PNGs in `screenshots/`.
3. README row **S18** → new id. React files = `RefineriesPage.tsx` first, then `RefineryCards.tsx + RefineryHeader.tsx + PriceBoard.tsx + RefineryTrendChart.tsx + SyncHealthCard.tsx + WeeklyHistoryTable.tsx + ProductsUnitsTable.tsx`. Status: "Ported. Refineries; Petrojam is the benchmark." Add an **S18b** row: `RefineryDialog.tsx`. Add both ids to `screens.json`.
4. `node scripts/stitch-contract.mjs` exits 0, and `node scripts/stitch-fidelity.mjs --report` shows S18 and S18b at 100% (§0).

## 8. Tests and exit checks

| # | Check | Pass when |
|---|---|---|
| T1 | SQL: backfill counts | Per product, `refinery_price` (current) = non-null count in `petrojam_prices_legacy`. Totals match. |
| T2 | SQL: the compat view | `select * from public.fuel_petrojam_prices order by price_date desc limit 3` equals the same query on `fuel.petrojam_prices_legacy`, column for column. |
| T3 | SQL: `wholesale_on` | `wholesale_on('e10_87','2026-10-22') = 201.8128`, `('ulsd', …) = 271.5973`, and a date before 2004 returns null. |
| T4 | SQL: one benchmark | Inserting a second `is_benchmark` refinery for JM fails. |
| T5 | Deno: revision | Writing week W at 200.00, then 200.00 again (unchanged, `last_seen_at` moves), then 201.00 leaves 2 rows: revision 1 superseded, revision 2 current. `weeks_revised = 1`. |
| T6 | Deno: cron | With a fake adapter that throws, `/cron/sync-latest` returns 500, and a `refinery_sync_run` row has `error` set. |
| T7 | Grants | `anon` has no privilege on the four new tables or the two public views beyond what §6.1 grants. Checked in `information_schema.role_table_grants`. |
| T8 | Vitest | `refineryFormat.ts`: units, "unit not set", 2 vs 4 decimals, freshness at 6 / 8 / 10 days. |
| T9 | `npx tsc --noEmit -p apps/admin` | No new errors over baseline. |
| T10 | `node scripts/stitch-contract.mjs` and `node scripts/stitch-fidelity.mjs --report` | Exit 0. S18 and S18b at 100%. |
| T11 | Side-by-side screenshots (§0) attached to the PR | Same blocks, order, columns, chips, chart type and labels. Only the data values differ. |
| T12 | Live | The page lists Petrojam as Benchmark. The board shows 22 Oct with 87 = J$201.81 /L and "▼ J$4.50" vs 15 Oct (206.3128). "All" on the chart starts in Feb 2004. Station analytics and Price Engine show "Petrojam" via the API, not hardcoded. After Thursday's run, the sync log shows one row with "1 new week" or "No new week". |
| T13 | Phone 390px | Cards scroll sideways, tiles stack 1-up, the history table scrolls inside its card, no page-level horizontal scroll. |

## 9. Build order

1. Migration §6.1 (with R8), then T1–T4, T7.
2. Sync function §6.2 and API §6.3, then T5, T6. Deploy `petrojam-prices`. Update the workflow so it fails on an `error` run.
3. Stitch S18/S18b (§7). **The UI isn't started until both Stitch HTML files are in the repo (§0).**
4. Frontend §6.4 + R7 + R12, then T8–T11.
5. Live checks T12, T13. Then remove the `/admin/prices` and `/admin/sync` aliases and `petrojamPricesService.ts`.

## 10. Out of scope (noted)

- Retail markup (`fuel.retail_price_markup`, 0 rows). Whether Dominion keeps a markup model belongs in the Price Engine audit.
- Dropping `fuel.petrojam_prices_legacy`: 30 days after T12, and only after the compat view has been the only reader in logs.
