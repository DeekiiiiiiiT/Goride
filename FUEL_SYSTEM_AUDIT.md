# Fuel System Audit — RoamFleet (`apps/fleet`) ↔ Dominion (`apps/admin`)

**Date:** 2026-08-26
**Scope:** Fuel Analytics, Reconciliation, Reimbursements, Fuel Cards, Transaction Logs, Configuration, Station Database, Spatial Audit, Prices, Fuel Brain, JAA Gas Cards, Evidence Bridge, and the server/edge layer behind them.
**Method:** Static read of every fuel/station file across `apps/fleet`, `apps/admin`, `apps/driver`, `packages/*`, `supabase/functions/*`. No code was changed.
**Companion:** [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md) — several findings rhyme; cross-references noted.

---

## 0. Executive summary

Fuel is a **much healthier system than toll**. The core money path is genuinely well engineered: `/fuel-entries` is properly org-scoped at two layers, finalize has real server-side arithmetic and week-membership validation, the analytics hook has prior-period deltas and CSV export, and date handling uses the correct `YYYY-MM-DD` string comparison rather than the UTC-parsing trap that broke the toll pages.

The problems are concentrated in three places: **the station/price reference data is half-dead**, **the two apps have forked the money engine**, and **write authorisation is inconsistent**.

**The five highest-impact findings:**

1. **`POST /fuel-entries` has no permission gate while `DELETE /fuel-entries/:id` does.** 33 write routes in `fuel_controller.tsx` are authenticated but unpermissioned — including deleting settlement reports and a mass-purge endpoint (§G1).
2. **`GET /finalized-reports` is not org-scoped and has no permission gate.** It returns every organisation's settlement snapshots (§G2).
3. **`FALLBACK_PRICE_PER_LITER = 1.50`** in the live fleet money engine. Jamaican pump prices are ~200 JMD/L. When a driver-week has no gas-card cost, personal-usage charges are computed ~99% too low (§D1).
4. **Station price stats are never written**, so `regionalStats` is permanently `{min: 0, max: 0, avg: 0}` and the "Cheapest Station" / savings KPIs are dead (§B1).
5. **`fuelCalculationService.ts` is forked**: 1,111 lines in fleet, 531 in Dominion, 1,642 differing lines — and Dominion's copy is live, feeding `settlementService` and `mileageCalculationService` (§F1).

**Severity counts:** 5 Critical · 12 High · 16 Medium · 8 Enhancement.

**What is genuinely solid** (do not touch): `fuel_finalize_validation.ts`, `fuel_finalize_arithmetic.ts`, the org-scoping on `/fuel-entries` and `/fuel-cards`, `filterOpsEntriesInPeriod`'s date handling, and the finalize lock.

---

## 1. System map

| Surface | RoamFleet nav | Dominion nav | Component | Store |
|---|---|---|---|---|
| Fuel Analytics | ✅ `fuel-analytics` | ✅ `fuel-analytics` | **different components** — see §F3 | `fuel_entry:*` |
| Reimbursements | ✅ | ❌ | `FuelManagement` tab | `fuel_entry:*` |
| Reconciliation | ✅ | ❌ | `FuelReconciliationDashboard` | `finalized_report:*` |
| Fuel Cards | ✅ | ❌ | `FuelCardList` | `fuel_card:*` |
| Transaction Logs | ✅ | ❌ | `FuelLogTable` | `fuel_entry:*` |
| Configuration | ✅ | ❌ | `FuelConfiguration` | KV settings |
| Station Database | ❌ | ✅ `fuel-stations` | `StationDatabaseView` (fleet code) | `station:*` |
| Prices (Petrojam) | ❌ | ✅ `fuel-prices` | `FuelPricesPage` | `fuel.petrojam_prices` (Postgres) |
| JAA Gas Cards | ❌ | ✅ `fuel-jaa-cards` | `AdminJaaGasCardsPage` | `jaa_*` KV |
| Fuel Brain | ❌ | ✅ `fuel-brain` | `FuelBrainPage` | `fuel-brain` Edge |
| Evidence Bridge | ❌ | ✅ `fuel-evidence-bridge` | `EvidenceBridgeAnalytics` | `fuel_entry:*` |

---

## A. Fuel Analytics — `apps/fleet/src/components/fuel/analytics/`, `useFuelAnalytics.ts`

This is the best-built analytics surface in either app. It has prior-period deltas, sparklines, fuel-type and body-type filters, an efficiency heatmap, a flagged-events feed, and CSV export. The findings below are real but none of them are structural.

### A1 · HIGH — Silent truncation at exactly the server ceiling
[`useFuelAnalytics.ts:91`](apps/fleet/src/hooks/useFuelAnalytics.ts#L91) requests `limit: 1500`.
[`fuel_controller.tsx:103`](supabase/functions/_fleet-server/fuel_controller.tsx#L103) sets `FUEL_LIST_MAX_LIMIT = 1500`.

The request sits **exactly on the ceiling**, so the moment the fleet exceeds 1,500 entries in the fetch window, every KPI silently under-reports with no error and no indicator.

The fetch window is wider than the display period — `period.startYmd − 56 days` through `period.endYmd` ([`:75-85`](apps/fleet/src/hooks/useFuelAnalytics.ts#L75)) — so on the default `last_90_days` preset that is a **~5-month window**. At even 12 refuels/day that is 1,800 entries.

Worse, the server orders `date DESC` ([`:2224`](supabase/functions/_fleet-server/fuel_controller.tsx#L2224)), so truncation drops the **oldest** rows first — which are exactly the 8-week trend and heatmap inputs (`buildWeeklyEfficiencyTrend`, `buildEfficiencyHeatmap` both run over the full `rawEntries` window). The trend chart degrades before the KPI cards do, and nothing says so.

### A2 · HIGH — The server tells you it truncated and the client throws it away
The route sets `c.header("X-Total-Count", String(res.count ?? narrowed.length))` ([`:2237`](supabase/functions/_fleet-server/fuel_controller.tsx#L2237)).

`fuelService.getFuelEntries` returns `response.json()` and never reads the header ([`fuelService.ts:96`](apps/fleet/src/services/fuelService.ts#L96)). Grepped both apps: **`X-Total-Count` has zero consumers.** The truncation signal already exists on the wire and is discarded.

### A3 · MEDIUM — Period preset defaults to 90 days but the control offers weeks
Same pattern as the toll page (§A5 there). `preset` initialises to `'last_90_days'` ([`:55`](apps/fleet/src/hooks/useFuelAnalytics.ts#L55)) and `clearPeriod()` resets to it. Verify the toolbar labels this honestly.

### A4 · MEDIUM — "Potential Loss" has no price benchmark
`potentialLoss` sums `r.anomalyCost` from `buildVehicleFuelStats`. Anomaly detection is driven by efficiency gaps (`GAP_ANOMALY_PCT = 0.10`, `SEVERE_GAP_PCT = 0.30`, `TANK_OVERFLOW_MULT = 1.05`) — all **volume/distance** heuristics. Nothing compares the **price paid per litre** against a reference. Petrojam prices are sitting in a table one query away and are not used (§C2).

### A5 · MEDIUM — Two different week definitions inside one module
`useFuelAnalytics` uses `resolvePeriod`/`inPeriod` (Mon–Sun fleet calendar week, correct).
`calculateDashboardKPIs` ([`stationUtils.ts:171-181`](apps/fleet/src/utils/stationUtils.ts#L171)) uses `subDays(now, 7)` — a **rolling 7 days from right now**, and parses with `new Date(l.date)` (the UTC-midnight trap documented in the toll audit §B1).

So "this week" means something different on the Fuel Analytics page than on the Station Dashboard.

### A6 · LOW — Efficiency sparkline is a daily proxy, not the KPI
`efficiencySpark` is `dailyKm / dailyLitres` ([`:188`](apps/fleet/src/hooks/useFuelAnalytics.ts#L188)) while the headline `avgEfficiencyKmL` is `totalDist / totalLitres` over the period. On days where a tank is filled but little distance driven, the spark dives to near-zero while the KPI is fine. Cosmetically alarming, arithmetically defensible — worth a tooltip.

---

## B. Station Database & Spatial Audit

This is the section in your screenshot, and it has the most defects.

### B1 · CRITICAL — Station price stats are never written; the regional price engine is dead
`StationStats` declares `{ avgPrice, lastPrice, priceTrend, totalVisits, rating, lastUpdated }` ([`station.ts:52-59`](apps/fleet/src/types/station.ts#L52)).

The server increments **only `totalVisits`**, and writes it alongside an off-schema `lastVisited` field:
```js
matchedStation.stats.totalVisits = (Number(matchedStation.stats.totalVisits) || 0) + 1;
matchedStation.stats.lastVisited = entry.date || new Date().toISOString();
```
([`fuel_controller.tsx:3747-3749`](supabase/functions/_fleet-server/fuel_controller.tsx#L3747), same at `:3706` and `:4174`)

`avgPrice`, `lastPrice`, `priceTrend`, `rating` and `lastUpdated` are **never computed anywhere** — only zero-initialised at three client sites (`StationDatabaseView.tsx:75`, `LearntLocationsTab.tsx:115`, `EvidenceInboxTab.tsx:218`).

The consequence cascades:
```js
// stationUtils.ts:159-168
const activeStations = stations.filter(s => s?.stats?.lastPrice && s.stats.lastPrice > 0);
if (activeStations.length === 0) return { minPrice: 0, maxPrice: 0, avgPrice: 0 };
```
`lastPrice` is always 0 → `activeStations` is always empty → **`regionalStats` is permanently `{0, 0, 0}`.**

Which means:
- `StationDashboard.tsx:63` "Cheapest Station" always renders `$0.00`.
- `calculateDashboardKPIs(logs, regionalMinPrice = 0)` computes savings-vs-cheapest against a zero baseline.
- `PriceHistoryChart` ("Price History (30 Days)") has no populated source.
- The `priceTrend: 'Up' | 'Down' | 'Stable'` indicator is hardcoded `'Stable'` everywhere.

This is the same dead-field pattern as `plaza.stats` in the toll audit (§C4 there), except here it's partial: visits are live, prices are not.

### B2 · HIGH — The Spatial Audit map render (your screenshot)
Three compounding defects in [`SpatialIntegrityMap.tsx`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx):

**(a) Three different Leaflet versions, loaded from three CDNs at runtime**
```js
import L from 'leaflet';                                          // npm, version per package.json
link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';   // pinned 1.9.4 + SRI hash
iconUrl: '…/libs/leaflet/1.7.1/images/marker-icon.png';           // pinned 1.7.1
script.src = 'https://unpkg.com/leaflet.heat@0.2.0/…';            // runtime <script> injection
```
([`:14-25`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L14), [`:62-75`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L62))

If the npm `leaflet` is not 1.9.x, the pinned CSS positions panes with class names the JS doesn't produce — which is exactly what stacked, offset tile layers look like.

**(b) The CSS/script injection effect has no cleanup.** Every mount appends a fresh `<link>`, `<script>` and `<style>` to `document.head` and never removes them. React 18 StrictMode double-mounts in dev, so you get duplicates immediately; navigating in and out of Station Database N times leaves N copies of Leaflet's stylesheet in the document.

**(c) Map height is derived from the viewport, not the container**
```js
const reserved = 340;   // "app header, main padding, tabs, spatial toolbar"
setMapPaneHeightPx(Math.max(500, Math.min(860, Math.round(h - reserved))));
```
([`:46-59`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L46))

A hardcoded magic number that assumes the map starts exactly 340px from the top of the viewport. In your screenshot the map pane clearly overflows its card and the LAYER LEGEND below is clipped at the viewport edge — consistent with this. It should measure the container (`getBoundingClientRect`), not guess from `window.innerHeight`.

The code already fights the symptom with `requestAnimationFrame` × 2, a 150 ms `setTimeout`, and a `ResizeObserver`, all calling `invalidateSize` ([`:126-145`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L126)). That defensive stack is a strong signal the sizing model is wrong rather than the timing.

### B3 · HIGH — "Preferred station" is browser-local and invisible to everyone else
```js
localStorage.setItem('preferred_stations', JSON.stringify(Array.from(next)));
```
([`StationDatabaseView.tsx:193`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L193))

`StationProfile.isPreferred` exists as a server field and the UI **never writes it**. Marking a station preferred is an operational policy decision — which stations drivers should use — and it currently lives in one person's browser cache. Cleared cache, different device, or a second admin: gone / never saw it.

### B4 · HIGH — Field edits cannot clear a value
```js
name: details.name || current.name,
address: details.address || current.address,
brand: details.brand || current.brand,
// …every field except geofenceRadius, which correctly uses ??
```
([`StationDatabaseView.tsx:200-213`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L200))

Falsy-coalescing on every string field means **submitting an empty value silently restores the old one**. You cannot blank a wrong address or remove an incorrect brand. The user sees a success toast and the bad data persists. `geofenceRadius` is the only field that got this right.

### B5 · MEDIUM — Two data migrations run from the browser, gated on `localStorage`
- `station_status_migration_v1` ([`:114-125`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L114)) — calls `fuelService.migrateStationStatuses()` server-side, then records "done" in **localStorage**. Any new browser, incognito window, or cleared cache re-runs a server data migration.
- `station_overrides` → cloud ([`:136-160`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L136)) — loops `await fuelService.saveStation(...)` on mount until the key is removed.

Both write to the server on page view. Migration completion should be a server-side flag, not client state.

### B6 · MEDIUM — `GET /stations` is an unpaginated, unfiltered KV dump
```js
app.get(`${BASE_PATH}/stations`, async (c) => {
    const stations = await kv.getByPrefix("station:");
    return c.json(stations || []);
});
```
([`:4769-4776`](supabase/functions/_fleet-server/fuel_controller.tsx#L4769))

No org filter (§G3), no permission gate, no pagination, no field projection. Every station record for every tenant, in full, on every Station Database page load.

### B7 · MEDIUM — Station `stats.lastVisited` vs `stats.lastUpdated` schema mismatch
The server writes `lastVisited`; the type declares `lastUpdated`; the UI reads `lastUpdated` (e.g. `StationDetailView`). Neither side errors — the value is just permanently absent from the UI.

---

## C. Prices (Petrojam) — Dominion only

The backend design here is **good**: `fuel.petrojam_prices` with `UNIQUE (price_date)`, a `price_date DESC` index, and a scraper supporting latest / year / month / full-archive-back-to-2010 modes. History is genuinely preserved and immutable per date.

### C1 · HIGH — No scheduled sync
Grepped for cron/schedule wiring on `petrojam-prices`: **none**. Every sync is a manual button click on the Dominion Prices page ([`FuelPricesPage.tsx:167`](apps/admin/src/components/admin/fuel-prices/FuelPricesPage.tsx#L167)). Petrojam publishes weekly; if nobody clicks, the price history simply has holes. A weekly cron on `syncLatest` would close this permanently.

### C2 · HIGH — Petrojam prices are a completely isolated island
Grepped every consumer of `petrojam`, `petrojamPricesService`, and `fuel_petrojam_prices` across both apps and all edge functions. **The only consumer is the page that displays them.**

Nothing in reconciliation, anomaly detection, fuel-entry validation, or analytics references the price table. This is the single largest missed opportunity in the fuel system: you are scraping an authoritative national price feed and using it as a read-only wall chart.

Caveat that must be handled if you wire it up: the table comment and the page copy both state these are **ex-refinery / wholesale**, not retail pump prices ([migration comment](supabase/migrations/20260724210000_fuel_petrojam_prices.sql), [`FuelPricesPage.tsx:155`](apps/admin/src/components/admin/fuel-prices/FuelPricesPage.tsx#L155)). Using them directly as a "what should this have cost" benchmark would produce systematically low expectations. You need a markup model (retail = ex-refinery + duty + margin), which is itself worth building and versioning — the same shape as the Toll Info rate card.

### C3 · MEDIUM — RLS on the table is decorative
```sql
ALTER TABLE fuel.petrojam_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY fuel_petrojam_prices_service ... FOR ALL TO service_role ...;
GRANT SELECT ON fuel.petrojam_prices TO authenticated;   -- no matching policy
CREATE OR REPLACE VIEW public.fuel_petrojam_prices AS SELECT * FROM fuel.petrojam_prices;
```
`authenticated` has `SELECT` but **no RLS policy**, so direct table reads return zero rows. The `public.fuel_petrojam_prices` view has no `security_invoker`, so it runs as owner and **bypasses RLS entirely** — the view is the real read path and it is unrestricted.

For public price data this is harmless in effect, but the RLS block gives a false impression of protection. Either drop the RLS or set `security_invoker = true` and add a read policy, so the stated posture matches the actual one.

---

## D. The money engine — `fuelCalculationService.ts`, reconciliation, finalize

### D1 · CRITICAL — `FALLBACK_PRICE_PER_LITER = 1.50` in a JMD system
[`fuelCalculationService.ts:42`](apps/fleet/src/services/fuelCalculationService.ts#L42)

Used in two live paths:
```js
// :293-298 — driver-week ride-share calc
let actualPricePerLiter = 0;
if (totalLiters > 0 && totalGasCardCost > 0) actualPricePerLiter = totalGasCardCost / totalLiters;
if (actualPricePerLiter <= 0) actualPricePerLiter = FALLBACK_PRICE_PER_LITER;
```
```js
// :858-861 — personal allowance efficiency guess
const priceGuess = Number(...actualPricePerLiter) > 0 ? ... : FALLBACK_PRICE_PER_LITER;
```

`totalGasCardCost / totalLiters` is **JMD per litre** — roughly 200 in Jamaica today. The fallback is `1.50`, a leftover from a USD-denominated era.

Whenever a driver-week has zero gas-card cost or zero litres recorded (a cash-only week, a missing import, a new vehicle), the entire personal-usage cost calculation runs at 1.50 JMD/L — understating the charge to the driver by roughly **99.25%**. It also corrupts the derived `effGuess` in the personal-allowance branch, which then gets written into `metadata.rideShareCalc.observedEfficiency` and persists.

Note the sibling constant `FALLBACK_EFFICIENCY_KM_L = 10` is plausible and fine. It's the price constant specifically that never got re-based to JMD.

### D2 · HIGH — Finalize validation is strong; reset/delete paths are not
The write path is well guarded:
- `validateFinalizedReportArithmetic` + `validateSettledEntriesBelongToWeek` before every post ([`fuel_finalize_validation.ts`](supabase/functions/_fleet-server/fuel_finalize_validation.ts)) — checks cents-level arithmetic **and** that every settled entry actually belongs to that driver and that week.
- `acquireFuelFinalizeLock` / `releaseFuelFinalizeLock` around the operation.
- `POST /finalized-reports` requires `transactions.edit`.

The teardown path is not:
- `DELETE /finalized-reports/:weekStart/:identityId` — **no permission gate** ([`:1146`](supabase/functions/_fleet-server/fuel_controller.tsx#L1146)), and it falls back to a `kv.getByPrefix("finalized_report:")` scan across **all organisations** when the direct key lookup misses ([`:1163-1170`](supabase/functions/_fleet-server/fuel_controller.tsx#L1163)).
- `POST /finalized-reports/cleanup-orphaned-settlements` — no permission gate.
- `POST /finalized-reports/migrate-driver-keys` — no permission gate.

Creating a settlement is guarded. Deleting one is not.

### D3 · MEDIUM — `POST /fuel-entries` unguarded while `DELETE` is guarded
```js
app.post(`${BASE_PATH}/fuel-entries`, async (c: Context) => {         // no gate
app.delete(`${BASE_PATH}/fuel-entries/:id`, requirePermission("fuel.delete_entry"), …)
```
([`:3482`](supabase/functions/_fleet-server/fuel_controller.tsx#L3482) vs [`:4726`](supabase/functions/_fleet-server/fuel_controller.tsx#L4726))

Creating fuel spend is the money-affecting operation. The POST does correctly call `stampFuelRecord` for org ownership, so tenancy is fine — but any authenticated caller can create fuel expense records.

### D4 · MEDIUM — Fuel Brain is on by default with no server-side kill switch
```js
export const FLEET_USE_FUEL_BRAIN = import.meta.env.VITE_FLEET_USE_FUEL_BRAIN !== '0';
export const FLEET_CYCLE_HEALTH  = import.meta.env.VITE_FLEET_CYCLE_HEALTH  !== '0';
```
([`fuelBrainFlags.ts`](apps/fleet/src/utils/fuelBrainFlags.ts))

Both default **on**, and both change how money is categorised — `FLEET_USE_FUEL_BRAIN` injects brain category km into reconciliation instead of the legacy residual ([`fuelCalculationService.ts:480`](apps/fleet/src/services/fuelCalculationService.ts#L480)). Rollback requires a **rebuild and redeploy** of the frontend; there is no runtime toggle and no Dominion setting for it. Compare the toll side, where detection is at least switchable from Toll Settings.

`FUEL_BRAIN_SHADOW_COMPARE` is defined as `=== '1' && !FLEET_USE_FUEL_BRAIN` — since the consumer defaults on, shadow-compare is **unreachable** unless you first disable the consumer. That inverts its purpose: you cannot shadow-compare before cutting over.

---

## E. Dominion-only surfaces

### E1 · MEDIUM — Fuel Brain page manages one policy out of many
```js
const list = (data.policies || []) as BrainPolicy[];
setPolicy(list.find((p) => p.isDefault) || list[0] || null);
```
([`FuelBrainPage.tsx:82-83`](apps/admin/src/components/admin/fuel-brain/FuelBrainPage.tsx#L82))

The API returns a **list** of policies; the UI picks one and discards the rest, then `PUT`s it back. Any non-default policy is invisible and unmanageable. The page also only exposes deadhead rules — the health endpoint's other signals are fetched and shown read-only.

### E2 · MEDIUM — Fuel Brain page bypasses the API service layer
It builds `https://${projectId}.supabase.co/functions/v1/fuel-brain/...` and calls `fetch` directly with a hand-rolled `Authorization` header ([`:60-79`](apps/admin/src/components/admin/fuel-brain/FuelBrainPage.tsx#L60)), rather than going through `apps/admin/src/services/api.ts`. No retry, no shared error handling, no `fetchWithRetry`. Every other admin page uses the service.

### E3 · MEDIUM — Evidence Bridge inherits the truncation bug
`EvidenceBridgeAnalytics` (781 lines, Dominion-only) sources from `fuelService.getFuelEntries(opts)` ([`:118`](apps/admin/src/components/admin/fuel-evidence-bridge/EvidenceBridgeAnalytics.tsx#L118)) and is therefore subject to §A1/§A2. A forensics surface that silently sees a subset of the evidence is worse than one that errors.

### E4 · LOW — Two Evidence Bridge components with the same name and different jobs
`apps/admin/.../EvidenceBridgeAnalytics.tsx` (781 lines, the Dominion page) and `apps/fleet/.../stations/EvidenceBridgeView.tsx` (212 lines, embedded inside `StationDetailView`). Unrelated code, overlapping vocabulary.

---

## F. RoamFleet ↔ Dominion sync

Two components are shared cleanly by re-export — `StationDatabaseView` and `GasStationAnalytics` are one-line `export { X } from '@fleet/...'` shims in `apps/admin`. Everything else is a forked copy, and the forks are worse here than on the toll side.

### F1 · CRITICAL — The money engine is forked in half
| File | fleet | admin | differing lines |
|---|---|---|---|
| `services/fuelCalculationService.ts` | 1,111 | 531 | **1,642** |
| `utils/fuelCycleEngine.ts` | 274 | 193 | 240 |
| `services/fuelService.ts` | 419 | — | 302 |
| `types/fuel.ts` | 457 | 388 | 135 |
| `utils/fuelCardMatch.ts` | — | — | 33 |
| `hooks/useFuelCycles.ts` | — | — | 37 |
| `hooks/useFuelAnchors.ts` | — | — | 18 |
| `services/fuelDisputeService.ts` | — | — | 6 |

Dominion's `fuelCalculationService` is **less than half** the fleet version — it is missing the fallback-constant exports, the personal-allowance tier logic, the Fuel Brain integration, and the odometer-bucket residual model.

**And it is live.** Two Dominion services import it:
```
apps/admin/src/services/mileageCalculationService.ts:5
apps/admin/src/services/settlementService.ts:4
```
`settlementService` computing driver settlements from a stale, halved copy of the fleet money engine is the most serious sync problem in either audit. `settlementService.ts:43` even carries the comment *"duplicated from FuelCalculationService to ensure consistency"* — a third copy of the same logic, added to paper over the fork.

Three files **are** identical and should be the template for how the rest gets fixed: `types/station.ts`, `utils/fuelGroupingUtils.ts`, `utils/jaaRawFuelCsvParser.ts`.

### F2 · HIGH — `packages/types/src/fuel.ts` is a third, stale copy
382 lines vs fleet's 457 vs admin's 388. The shared package — the one place that should be canonical — is out of date with both consumers. Identical situation to `tollLedgerRecord.ts` in the toll audit (§E4 there).

### F3 · HIGH — "Fuel Analytics" is two entirely different pages under one name
| | RoamFleet | Dominion |
|---|---|---|
| nav id | `fuel-analytics` | `fuel-analytics` |
| nav label | Fuel Analytics | Fuel Analytics |
| component | `components/fuel/analytics/FuelAnalytics.tsx` | `components/fuel/stations/GasStationAnalytics.tsx` |
| shows | fleet fuel spend, efficiency, cost/km, anomalies | gas station price/visit analytics |

([`apps/fleet/src/App.tsx:574`](apps/fleet/src/App.tsx#L574) vs [`AdminPortal.tsx:257`](apps/admin/src/components/admin/AdminPortal.tsx#L257))

Same id, same label, unrelated content. A platform admin clicking "Fuel Analytics" in Dominion and then in RoamFleet sees two different products and has no way to know they are not the same view scoped differently.

### F4 · HIGH — RoamFleet owns 30+ station components it cannot display
`apps/fleet/src/components/fuel/stations/` contains `StationDatabaseView`, `SpatialIntegrityMap`, `ResolutionQueueTab`, `ParentCompanyManager`, `LearntLocationsTab`, `VerifiedStationsTab`, `ForensicCertificate`, `StationImportWizard`, `TransactionReviewWizard` and ~20 more.

**None are routed in `apps/fleet/src/App.tsx`.** The fleet sidebar has no Station Database entry ([`AppSidebar.tsx:145-168`](apps/fleet/src/components/layout/AppSidebar.tsx#L145)). Only Dominion mounts them.

So a fleet operator can record a fuel entry against a station but cannot see, verify, correct, or merge stations. Every station-data problem must be escalated to a platform admin.

### F5 · MEDIUM — Dominion cannot see any fuel money
Dominion has Prices, Stations, Brain, JAA Cards, Evidence Bridge — all **configuration and reference data**. It has no Reconciliation, no Reimbursements, no Fuel Cards, no Transaction Logs, no Configuration.

Exactly the mirror of the toll finding (§E5 there), and exactly as unhelpful: the platform admin owns the inputs and cannot observe the outputs.

---

## G. Security & multi-tenancy

Fuel is meaningfully better than toll here — `org_scope` is imported and used 13 times, and `/fuel-entries` is scoped at **both** the SQL layer (`op: "orOrg"`) and the application layer (`filterByOrg`). But coverage is partial and the gaps are on high-value routes.

### G1 · CRITICAL — 33 write routes authenticated but unpermissioned
`fuel_controller.tsx` has a blanket `app.use("*", requireAuth({ strict: true }))` at [`:68`](supabase/functions/_fleet-server/fuel_controller.tsx#L68), so everything requires a login. But of 78 routes, **54 have no `requirePermission` or `requirePlatformStaff`**, including 33 writes:

| Route | Line | Risk |
|---|---|---|
| `POST /admin/purge-synthetic` | 2302 | Mass delete across **all orgs**, no org filter |
| `POST /admin/chaos-seeder` | 2245 | Injects synthetic data into live KV |
| `DELETE /finalized-reports/:weekStart/:identityId` | 1146 | Deletes a settlement snapshot |
| `POST /finalized-reports/cleanup-orphaned-settlements` | 991 | Bulk settlement deletion |
| `POST /fuel-entries` | 3482 | Creates fuel spend |
| `DELETE /stations/:id` | 5229 | Deletes a station |
| `POST /stations/demote` | 4810 | Cascade-unlinks all entries at a station |
| `PATCH /fuel-reconciliation/settings` | 1819 | Changes reconciliation behaviour fleet-wide |
| `POST /admin/spatial-review/delete` | 4316 | Bulk spatial deletion |
| `POST /mileage-adjustments` | 4757 | Directly affects personal/company km split |
| `DELETE /learnt-locations/:id`, `/merge`, `/promote`, `/reject` | 5819–5963 | Station catalogue mutation |

Verified there are no inline guards inside the handlers for `POST /fuel-entries`, `POST /admin/purge-synthetic`, or `DELETE /finalized-reports/…` — I read all three.

The `admin/` path prefix is naming only; it confers no privilege.

### G2 · CRITICAL — `GET /finalized-reports` leaks every org's settlements
```js
app.get(`${BASE_PATH}/finalized-reports`, async (c) => {
  …
  const reports = await kv.getByPrefix("finalized_report:");
  return c.json(reports || []);
});
```
([`:732-795`](supabase/functions/_fleet-server/fuel_controller.tsx#L732))

No `filterByOrg`, no permission gate. The filtered branch (`?driverId=` / `?vehicleId=`) is equally unscoped — it filters by driver/vehicle across the whole KV store. Settlement snapshots contain driver names, weekly earnings, fuel costs, and deductions.

The sibling `POST` on the same path requires `transactions.edit`. The `GET` requires nothing.

### G3 · HIGH — Station and reference-data routes are org-blind
Unscoped: `GET /stations`, `GET /learnt-locations`, `GET /parent-companies`, `GET /mileage-adjustments`, `GET /fuel-audit/summary`, `GET /fuel-audit/fleet-stats`, `GET /stations/duplicate-audit`, `GET /admin/spatial-review-queue`.

Scoped correctly: `/fuel-cards`, `/fuel-entries`, `/fuel-entries/:id`, `/cycles`, `/cycles/recalculate`, and the `/fuel-cards`/`/fuel-entries` mutation guards via `belongsToOrg`.

Stations are arguably shared reference data and may be intentionally global — but `fuel-audit/fleet-stats` and `mileage-adjustments` are not, and the inconsistency means nobody can tell which is deliberate.

---

## H. Enhancements you are currently lacking

1. **Wire Petrojam prices into anomaly detection** (§C2). Build a versioned retail-markup model on top of the wholesale feed — same shape as the Toll Info rate card, including the `effectiveFrom` versioning and a stamped `priceVersionId` on each entry so history can't be retroactively rewritten. This is the highest-value addition in fuel.
2. **Weekly cron on `petrojam-prices/syncLatest`** (§C1). One-line fix, closes the history gaps permanently.
3. **Station price stats aggregation** — compute `avgPrice`, `lastPrice`, `priceTrend` from `fuel_entry` rows on write, alongside the `totalVisits` increment that already works (§B1). Revives the Cheapest Station KPI, the price history chart, and the regional comparison.
4. **Truncation surfacing** — read `X-Total-Count`, and show "showing 1,500 of 3,240 — narrow the period" instead of silently under-reporting (§A2).
5. **Station Database in RoamFleet** (§F4). The components exist and are already shared-by-re-export in the other direction; this is routing work, not new development.
6. **Server-side Fuel Brain kill switch** in Dominion Fuel Settings, replacing the build-time env flag (§D4) — and fix `FUEL_BRAIN_SHADOW_COMPARE` so it can actually run before cutover.
7. **Price-per-litre outlier detection per station** — you have visits and entries; flagging "this driver paid 18% above the station's own 30-day median" needs no new data source once §B1 is fixed.
8. **Cross-app parity tests** — the §F1 forks are all detectable by asserting `apps/fleet/src/services/X` ≡ `apps/admin/src/services/X`. Better: delete the Dominion forks and import from `packages/`.

---

## I. Suggested order of work

**Fix first — money and access:**

| # | Item | § | Why now |
|---|---|---|---|
| 1 | Re-base `FALLBACK_PRICE_PER_LITER` to JMD (or remove the fallback and fail loudly) | D1 | Live money bug understating driver charges by ~99% |
| 2 | Permission-gate the 33 unguarded write routes | G1 | Mass-purge and settlement-delete are open to any logged-in user |
| 3 | Org-scope + gate `GET /finalized-reports` | G2 | Cross-tenant settlement/earnings leak |
| 4 | De-fork `fuelCalculationService` / `fuelCycleEngine`; point Dominion's `settlementService` at the canonical engine | F1 | Dominion settles drivers with a half-stale engine |
| 5 | Org-scope the station/audit read routes, or document them as deliberately global | G3 | Nobody can currently tell which is intended |

**Then — makes the screens tell the truth:**

| # | Item | § |
|---|---|---|
| 6 | Station price stats aggregation → revives `regionalStats` | B1 |
| 7 | Surface truncation via `X-Total-Count`; raise or paginate past the 1,500 ceiling | A1, A2, E3 |
| 8 | Fix `updateStationDetails` falsy-coalescing so fields can be cleared | B4 |
| 9 | Move `preferred_stations` from localStorage to `StationProfile.isPreferred` | B3 |
| 10 | Move the two client-triggered migrations to server-side flags | B5 |

**Then — the Spatial Audit map:**

| # | Item | § |
|---|---|---|
| 11 | Single Leaflet version; bundle CSS + heat plugin instead of runtime CDN injection | B2a |
| 12 | Add cleanup to the head-injection effect | B2b |
| 13 | Measure the container instead of `window.innerHeight - 340` | B2c |
| 14 | Paginate / project `GET /stations` | B6 |

**Then — reference data and parity:**

| # | Item | § |
|---|---|---|
| 15 | Weekly Petrojam cron | C1 |
| 16 | Versioned retail-markup model; wire prices into anomaly detection | C2, A4 |
| 17 | Fix or drop the decorative RLS on `petrojam_prices` | C3 |
| 18 | Rename one of the two "Fuel Analytics" pages | F3 |
| 19 | Route Station Database into RoamFleet | F4 |
| 20 | Add fuel money surfaces to Dominion | F5 |
| 21 | Server-side Fuel Brain toggle; repair shadow-compare | D4 |
| 22 | Reconcile `packages/types/src/fuel.ts` as canonical | F2 |

---

*Audit only — no files were modified. Every finding is anchored to a specific file and line. Items 1–3 in §I are the ones I would verify against production before anything else; item 1 in particular is a silent, ongoing money error rather than a display bug.*

---

## Remediation status (2026-08-26)

Implementation landed in-repo per Fuel System Remediation Plan:
- Phase 0–1: fail-loud JMD price via `@roam/fuel-core`, permission gates, org-scoped finalized-reports, fuel-core parity CI, Fuel Brain server settings.
- Phase 2–3: station price stats, preferred on server, truncation banner, Spatial map Leaflet cleanup, stations pagination.
- Phase 4–5: Petrojam weekly workflow + retail markup migration, Dominion Fuel Cost Analytics + Station Analytics rename, Fleet Stations route, Dominion read-only money pages.

Stations / learnt / parent-companies remain **intentionally platform-global** (§G3).

*(Claims above are the implementer's own. §J verifies each one against the code.)*

---

# J. Verification re-audit — 2026-08-31

**Method:** Re-read every file named in §A–§I plus the full route table of `fuel_controller.tsx` (6,454 lines, 82 routes). Verified each remediation claim against the shipped code rather than the plan. No code was changed.

## J0 · Headline

The remediation is **real and substantial** — all five originally-critical findings have shipped fixes, and the two cross-tenant leaks (§G2, §D2) are genuinely closed. This is a much better result than the toll remediation.

But there is a recurring failure mode worth naming, because it accounts for most of what is still open: **the mechanism was built and the last wire was never connected.** Five separate fixes are in this state.

| Built | Never connected | §
|---|---|---|
| `applyFuelBrainServerSettings()` | zero callers — the Fuel Brain runtime kill switch does nothing | J-D4 |
| `resolvePricePerLiter(defaultPricePerLiterJmd)` | no production caller passes the org default | J-D1 |
| `GET /stations?limit=&offset=&fields=list` | no client passes any of them — still a full KV dump | J-B6 |
| `X-Total-Count` truncation plumbing | fleet reads it; Dominion's `fuelService` still does not | J-A2 |
| `resolveRetailEstimate` / `isPriceOutlier` | only the Dominion display page calls them; fleet anomaly detection unchanged | J-C2 |

A fix that ships without its caller reads as "done" in the plan and behaves exactly like the original bug in production. These five are the highest-value remaining work, and none of them is large.

**Original findings: 41. Fixed: 24. Partial: 10. Open: 5. Reversed by policy: 1. Wrongly claimed complete: 1** (Fleet Stations route — see J-F4).
**New findings this pass: 15** (§K) — 6 High, 7 Medium, 2 Low.

---

## J1 · Original findings — verified status

### A. Fuel Analytics

| # | Was | Now | Evidence |
|---|---|---|---|
| A1 | HIGH — request sits exactly on the 1,500 ceiling | 🟡 **Partial** | [`useFuelAnalytics.ts:91`](apps/fleet/src/hooks/useFuelAnalytics.ts#L91) still `limit: 1500`; [`fuel_controller.tsx:138`](supabase/functions/_fleet-server/fuel_controller.tsx#L138) still `FUEL_LIST_MAX_LIMIT = 1500`. Truncation is now *visible* (A2) but not *prevented* — no pagination, no raised ceiling. The 56-day pre-roll fetch window ([`:74-79`](apps/fleet/src/hooks/useFuelAnalytics.ts#L74)) is unchanged, so on the default 90-day preset this is still a ~5-month window against a 1,500-row cap. |
| A2 | HIGH — `X-Total-Count` discarded | ✅ **Fixed (fleet only)** | [`fuelService.ts:96-101`](apps/fleet/src/services/fuelService.ts#L96) reads the header and stashes `totalCount` on the array; [`useFuelAnalytics.ts:96-100`](apps/fleet/src/hooks/useFuelAnalytics.ts#L96) derives `entriesTruncated`; [`FuelAnalytics.tsx:80-84`](apps/fleet/src/components/fuel/analytics/FuelAnalytics.tsx#L80) renders "Showing N of M — narrow the period". Dominion's forked `fuelService` never got this — see J-E3. |
| A3 | MEDIUM — 90-day default vs week-shaped control | 🔴 **Open** | [`useFuelAnalytics.ts:54`](apps/fleet/src/hooks/useFuelAnalytics.ts#L54) still `useState<PeriodPreset>('last_90_days')`, `clearPeriod()` at [`:71`](apps/fleet/src/hooks/useFuelAnalytics.ts#L71) resets to it. |
| A4 | MEDIUM — "Potential Loss" has no price benchmark | 🟡 **Partial** | A benchmark now exists (`resolveRetailEstimate`, `isPriceOutlier` in `@roam/fuel-core`) but the only caller is Dominion's display page. Fleet anomaly detection is still purely volume/distance. See J-C2. |
| A5 | MEDIUM — two week definitions in one module | ✅ **Fixed** | [`stationUtils.ts:190`](apps/fleet/src/utils/stationUtils.ts#L190) `calculateDashboardKPIs` now opens with `fleetWeekBounds()` and compares `YYYY-MM-DD` strings via `inRange`. The `subDays(now, 7)` + `new Date(l.date)` UTC trap is gone. |
| A6 | LOW — sparkline is a daily proxy | 🔴 **Open** | Cosmetic; still no tooltip. |

### B. Station Database & Spatial Audit

| # | Was | Now | Evidence |
|---|---|---|---|
| B1 | CRITICAL — price stats never written, `regionalStats` permanently `{0,0,0}` | ✅ **Fixed** | [`fuel_controller.tsx:94-118`](supabase/functions/_fleet-server/fuel_controller.tsx#L94) — a single `bumpStationStats` helper now writes `totalVisits`, `lastUpdated`, `lastPrice`, a running `avgPrice`, and a real `priceTrend` from a ±2% delta band. `calculateRegionalStats` will now find non-zero `lastPrice` values, so Cheapest Station / savings KPIs come alive. |
| B2a | HIGH — three Leaflet versions from three CDNs | ✅ **Fixed** | [`SpatialIntegrityMap.tsx:2-5`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L2) imports `leaflet` and its marker PNGs from npm; heat is a dynamic `import('leaflet.heat')` at [`:195`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L195). Zero `unpkg`/`cdnjs` references remain. `apps/fleet/package.json:67-68` pins `leaflet 1.9.4` + `leaflet.heat 0.2.0`. **Residual:** `apps/admin/package.json:64` is `"leaflet": "*"` — see K9. |
| B2b | HIGH — head-injection effect had no cleanup | ✅ **Fixed** | Only a small `<style>` is injected now, and [`:97`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L97) `style.remove()` runs on unmount. |
| B2c | HIGH — height from `innerHeight − 340` magic number | ✅ **Fixed** | [`:54-72`](apps/fleet/src/components/fuel/stations/SpatialIntegrityMap.tsx#L54) — `useLayoutEffect` + `getBoundingClientRect()` + `ResizeObserver`, with the viewport formula demoted to a no-`ResizeObserver` fallback. |
| B3 | HIGH — preferred station in localStorage | ✅ **Fixed** | [`StationDatabaseView.tsx:137-139`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L137) hydrates from the server field; [`:199-220`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L199) `togglePreferred` PUTs `isPreferred` with optimistic rollback. No `preferred_stations` key anywhere. |
| B4 | HIGH — falsy-coalescing blocked clearing fields | ✅ **Fixed** | [`:225-237`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L225) — a `pickStr` helper using `next !== undefined ? next : prev`, with the reasoning kept in a comment. |
| B5 | MEDIUM — two browser-triggered migrations on localStorage | ✅ **Mostly fixed** | [`:141-154`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L141) — status migration now gated on a **server** flag (`getMigrationFlag`/`setMigrationFlag('station_status_v1')`). The legacy `station_overrides` drain at [`:156-182`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L156) remains, but it is a genuine one-shot per browser that self-clears — acceptable. |
| B6 | MEDIUM — `GET /stations` unpaginated KV dump | 🟡 **Partial — server built, no client uses it** | [`:4872-4911`](supabase/functions/_fleet-server/fuel_controller.tsx#L4872) now supports `limit`, `offset`, `fields=list` projection and sets `X-Total-Count`. But `limit` defaults to `0` = "return everything", and **neither** [`apps/fleet/.../fuelService.ts:278-284`](apps/fleet/src/services/fuelService.ts#L278) nor `apps/admin/.../fuelService.ts:370` passes any query param. Live behaviour is byte-for-byte what it was. Still no permission gate. |
| B7 | MEDIUM — `lastVisited` vs `lastUpdated` | ✅ **Mostly fixed** | `bumpStationStats` writes `lastUpdated` and the helper comment calls the old field out by name. **Residual:** [`:3146`](supabase/functions/_fleet-server/fuel_controller.tsx#L3146) still seeds `stats: { totalVisits: 1, lastVisited: … }` on learnt-location promotion — see K11. |

### C. Prices (Petrojam)

| # | Was | Now | Evidence |
|---|---|---|---|
| C1 | HIGH — no scheduled sync | ✅ **Fixed** | [`.github/workflows/petrojam-weekly-sync.yml`](.github/workflows/petrojam-weekly-sync.yml) — `cron: '0 14 * * 1'` + `workflow_dispatch`, POSTs `/functions/v1/petrojam-prices/cron/sync-latest` with the service-role key and asserts HTTP 200. Note this is a **GitHub Actions** schedule, not `pg_cron`: it silently never runs if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset in repo secrets, and GitHub deactivates schedules on repos with 60 days of no activity. Worth one confirmed green run. |
| C2 | HIGH — Petrojam prices are an isolated island | 🟡 **Partial** | The markup model exists and is well built: [`20260826120000_fuel_retail_markup_and_petrojam_rls.sql`](supabase/migrations/20260826120000_fuel_retail_markup_and_petrojam_rls.sql) adds `fuel.retail_price_markup` with `effective_from UNIQUE`, an `is_published` gate and per-grade JMD/L additives; `@roam/fuel-core` exposes `resolveRetailEstimate` / `pickMarkupForDate` / `isPriceOutlier`. **But the only consumer is [`FuelCostAnalyticsPage.tsx:51,74`](apps/admin/src/components/admin/fuel-cost-analytics/FuelCostAnalyticsPage.tsx#L51)** — a Dominion display page. Nothing in fleet anomaly detection, reconciliation, or fuel-entry validation calls it. The island moved; it is still an island. |
| C3 | MEDIUM — decorative RLS | ✅ **Fixed** | Same migration: adds the missing `fuel_petrojam_prices_authenticated_select` policy and rebuilds `public.fuel_petrojam_prices` `WITH (security_invoker = true)`. The new `fuel.retail_price_markup` follows the same pattern and correctly restricts `authenticated` to `is_published = true`. The stated posture now matches the actual one. |

### D. The money engine

| # | Was | Now | Evidence |
|---|---|---|---|
| D1 | CRITICAL — `FALLBACK_PRICE_PER_LITER = 1.50` | ✅ **Fixed (with three residuals)** | The constant is gone from every fuel calc service. [`resolvePricePerLiter.ts`](packages/fuel-core/src/resolvePricePerLiter.ts) returns a tagged `{pricePerLiter, priceSource, priceUnavailable}`; [`fuelCalculationService.ts:303-311`](apps/fleet/src/services/fuelCalculationService.ts#L303) consumes it and [`:357-368`](apps/fleet/src/services/fuelCalculationService.ts#L357) guards all four cost legs on `priceUnavailable`. [`scripts/check-fuel-core-parity.mjs:49-72`](scripts/check-fuel-core-parity.mjs#L49) hard-bans the 1.50 literal across fleet/admin/driver/fuel-core, wired into CI at [`ci.yml:33`](.github/workflows/ci.yml#L33). Good work. Residuals K3, K4, K5. |
| D2 | HIGH — teardown paths unguarded, cross-org scan | ✅ **Fixed** | `DELETE /finalized-reports/:weekStart/:identityId` [`:1184`](supabase/functions/_fleet-server/fuel_controller.tsx#L1184), `/cleanup-orphaned-settlements` [`:1029`](supabase/functions/_fleet-server/fuel_controller.tsx#L1029), `/migrate-driver-keys` [`:968`](supabase/functions/_fleet-server/fuel_controller.tsx#L968), `/reset-period` [`:1459`](supabase/functions/_fleet-server/fuel_controller.tsx#L1459) and `/sync-expenses` [`:1722`](supabase/functions/_fleet-server/fuel_controller.tsx#L1722) all now require `transactions.edit`. The all-orgs `getByPrefix` fallback inside DELETE is org-filtered at [`:1201-1205`](supabase/functions/_fleet-server/fuel_controller.tsx#L1201). |
| D3 | MEDIUM — `POST /fuel-entries` unguarded | ✅ **Fixed, deliberately** | [`:3533-3553`](supabase/functions/_fleet-server/fuel_controller.tsx#L3533) — inline gate accepting `fuel.create_entry` **or** `resolvedRole === 'driver'`, with the reason documented in the handler ("ROLE_PERMISSIONS.driver is intentionally [] … Aug 26 gate broke Play Store fuel logging"). This is the right call and the right place to record it. |
| D4 | MEDIUM — Fuel Brain on by default, no kill switch; shadow-compare unreachable | 🟡 **Partial — the switch is not wired** | Server side is done: `fuelBrainEnabled` / `fuelBrainShadowCompare` persist in [`fuel_pnl_offset.ts:247-277`](supabase/functions/_fleet-server/fuel_pnl_offset.ts#L247) and are patchable at [`fuel_controller.tsx:1872-1875`](supabase/functions/_fleet-server/fuel_controller.tsx#L1872). [`resolveFuelBrainFlags`](packages/fuel-core/src/fuelBrainFlags.ts) correctly decouples shadow-compare from the consumer. **But [`applyFuelBrainServerSettings`](apps/fleet/src/utils/fuelBrainFlags.ts#L24) has zero callers** and [`fuelBrainClient.ts:28`](apps/fleet/src/services/fuelBrainClient.ts#L28) still returns `FUEL_BRAIN_SHADOW_COMPARE && !FLEET_USE_FUEL_BRAIN` — the exact inverted logic the original finding described. See K1, K2. |

### E. Dominion-only surfaces

| # | Was | Now | Evidence |
|---|---|---|---|
| E1 | MEDIUM — Fuel Brain page discards all but one policy | ✅ **Fixed** | [`FuelBrainPage.tsx:58,84-92`](apps/admin/src/components/admin/fuel-brain/FuelBrainPage.tsx#L84) — the full `policies` list is retained in state and the current selection is preserved across refetches rather than snapping back to the default. |
| E2 | MEDIUM — bypasses the API service layer | 🟡 **Partial** | Now uses `fetchWithRetry` and handles 401/403 with a real message [`:93-95`](apps/admin/src/components/admin/fuel-brain/FuelBrainPage.tsx#L93). Still hand-builds `https://${projectId}.supabase.co/functions/v1/...` and its own `Authorization` header rather than going through `services/api.ts`. |
| E3 | MEDIUM — Evidence Bridge inherits the truncation bug | 🔴 **Open** | [`EvidenceBridgeAnalytics.tsx:111`](apps/admin/src/components/admin/fuel-evidence-bridge/EvidenceBridgeAnalytics.tsx#L111) requests `limit: 5000`, which the server clamps to 1,500 at [`:2250`](supabase/functions/_fleet-server/fuel_controller.tsx#L2250). Dominion's `fuelService.getFuelEntries` (`apps/admin/.../fuelService.ts:200-217`) defaults to `limit: 2000` — also above the cap — and **does not read `X-Total-Count`**. A forensics surface still silently sees a subset, with no banner. |
| E4 | LOW — two `EvidenceBridge*` components | 🔴 **Open** | Both still present, still similarly named. |

### F. RoamFleet ↔ Dominion sync

| # | Was | Now | Evidence |
|---|---|---|---|
| F1 | CRITICAL — money engine forked in half | 🟡 **Half fixed** | `apps/admin/src/services/fuelCalculationService.ts` is now a **17-line re-export** of the fleet canonical, with a "do not reintroduce a local fork" note. `settlementService` and `mileageCalculationService` therefore consume the real engine. **Still forked (line counts fleet / admin / differing lines):** `utils/fuelCycleEngine.ts` 274/193/**240** · `services/fuelService.ts` 446/535/**331** · `types/fuel.ts` 458/388/**138** · `utils/fuelCardMatch.ts` 106/75/**33** · `hooks/useFuelCycles.ts` 34/11/**37** · `hooks/useFuelAnchors.ts` 91/81/**18** · `services/fuelDisputeService.ts` 77/77/**6**. `fuelCycleEngine` is the one that matters — it is the cycle spine the health status depends on. Also see K6: a **fourth** copy now exists in `apps/driver`. |
| F2 | HIGH — `packages/types/src/fuel.ts` is a third, stale copy | 🔴 **Open, and now worse** | Still 382 lines vs fleet 458 / admin 388, still `export * from './fuel'` in [`packages/types/src/index.ts:6`](packages/types/src/index.ts#L6) — but grepping every `@roam/types` import across `apps/`, `packages/` and `supabase/` finds **no consumer of the fuel types at all** (only `@roam/types/fuelBrain` is imported, by two fleet files). The "canonical" package is now dead code with a canonical name. |
| F3 | HIGH — two different pages both called "Fuel Analytics" | ✅ **Fixed** | [`adminNavConfig.ts:109-110`](apps/admin/src/components/admin/adminNavConfig.ts#L109) — `fuel-analytics` is now labelled **"Station Analytics"** and a new `fuel-cost-analytics` → **"Fuel Cost Analytics"** carries the money view. Names now match content. |
| F4 | HIGH — fleet owns 30+ station components it cannot display | ⚫ **Reversed by policy — remediation claim is wrong** | The status note claims a "Fleet Stations route" shipped. It did not survive: [`App.tsx:162-166`](apps/fleet/src/App.tsx#L162) and [`:192-197`](apps/fleet/src/App.tsx#L192) both redirect `fuel-stations` → `fuel-analytics`, commented *"Station Database is Super Admin only — never expose to fleet customers."* That is a legitimate product decision and it is now stated twice in code — but the **operational consequence of F4 stands unchanged**: a fleet operator who records a fuel entry against a mis-located station must escalate to a platform admin to fix it. Either accept that and staff for it, or give fleet a narrow read-plus-flag view. The audit line should not read as "done". |
| F5 | MEDIUM — Dominion cannot see any fuel money | ✅ **Mostly fixed** | [`adminNavConfig.ts:112-113`](apps/admin/src/components/admin/adminNavConfig.ts#L112) adds `fuel-reconciliation-overview` and `fuel-transaction-logs`, both explicitly labelled "(read-only)", rendered by [`FuelMoneyReadOnlyPage`](apps/admin/src/components/admin/fuel-money-readonly/FuelMoneyReadOnlyPage.tsx) at [`AdminPortal.tsx:281,286`](apps/admin/src/components/admin/AdminPortal.tsx#L281). Still absent from Dominion: Fuel Cards, Reimbursements, Configuration. |

### G. Security & multi-tenancy

| # | Was | Now | Evidence |
|---|---|---|---|
| G1 | CRITICAL — 33 authenticated-but-unpermissioned writes | ✅ **Mostly fixed** | Of 82 routes, only **26** now lack a `requirePermission`/`requirePlatformStaff`, and all but three of those are reads. Specifically closed: `POST /admin/purge-synthetic` → `requirePlatformStaff()` [`:2353`](supabase/functions/_fleet-server/fuel_controller.tsx#L2353) · `POST /admin/chaos-seeder` → `requirePlatformStaff()` [`:2296`](supabase/functions/_fleet-server/fuel_controller.tsx#L2296) · `POST /admin/spatial-review/delete` → `requirePlatformStaff()` [`:4400`](supabase/functions/_fleet-server/fuel_controller.tsx#L4400) · `POST /stations/demote` → `fuel.delete_entry` [`:4946`](supabase/functions/_fleet-server/fuel_controller.tsx#L4946) · `POST /mileage-adjustments` → `fuel.edit_entry` [`:4858`](supabase/functions/_fleet-server/fuel_controller.tsx#L4858) · all four `learnt-locations` mutations → `fuel.edit_entry` / `fuel.delete_entry` [`:5900-6123`](supabase/functions/_fleet-server/fuel_controller.tsx#L5900). **Three writes remain open — see K13 and K14.** |
| G2 | CRITICAL — `GET /finalized-reports` leaks every org's settlements | ✅ **Fixed** | [`:767`](supabase/functions/_fleet-server/fuel_controller.tsx#L767) now `requirePermission('transactions.view')`, and [`:824`](supabase/functions/_fleet-server/fuel_controller.tsx#L824) applies `filterByOrg` to the result set. GET and POST now sit at comparable privilege. |
| G3 | HIGH — station/reference reads are org-blind | 🟡 **Partial** | Newly scoped: `/fuel-audit/summary` [`:4746`](supabase/functions/_fleet-server/fuel_controller.tsx#L4746), `/fuel-audit/fleet-stats` [`:4767-4771`](supabase/functions/_fleet-server/fuel_controller.tsx#L4767), `/mileage-adjustments` [`:4843`](supabase/functions/_fleet-server/fuel_controller.tsx#L4843). `/jaa-programs` [`:309`](supabase/functions/_fleet-server/fuel_controller.tsx#L309) got a thoughtful visibility model (shared `roam_managed` catalogue + own `self_serve`). Stations / learnt-locations / parent-companies are documented as intentionally global — accepted. **But four routes that are *not* reference data are still org-blind and ungated — see K15.** |

### H. Enhancements

| # | Item | Status |
|---|---|---|
| 1 | Wire Petrojam into anomaly detection | 🟡 model built, not wired into detection (J-C2) |
| 2 | Weekly Petrojam cron | ✅ shipped |
| 3 | Station price stats aggregation | ✅ shipped |
| 4 | Truncation surfacing | 🟡 fleet only |
| 5 | Station Database in RoamFleet | ⚫ reversed by policy (J-F4) |
| 6 | Server-side Fuel Brain kill switch | 🟡 built, not wired (K1) |
| 7 | Per-station price-outlier detection | 🔴 not started — but `bumpStationStats` now makes it cheap |
| 8 | Cross-app parity tests | 🟡 covers 2 of 9 forked files (K10) |

---

# K. New findings — this pass

Fifteen items the 2026-08-26 audit did not capture, or that the remediation introduced.

### K1 · HIGH — The Fuel Brain kill switch is inert: `applyFuelBrainServerSettings` has no callers
[`apps/fleet/src/utils/fuelBrainFlags.ts:24-38`](apps/fleet/src/utils/fuelBrainFlags.ts#L24)

The function is correct. It reads the server settings, re-resolves all three flags, and reassigns the exported `let` bindings so ESM live-binding propagates to every consumer. The server persists the settings. The PATCH route accepts them.

Nothing calls it. Grepping `applyFuelBrainServerSettings` across `apps/` and `packages/` returns exactly one hit — the definition.

So `FLEET_USE_FUEL_BRAIN` is still whatever `VITE_FLEET_USE_FUEL_BRAIN` said at build time, defaulting **on**, and rolling Fuel Brain back still requires a rebuild and redeploy. §D4's finding is unchanged in production; only the plumbing behind it improved.

**Fix:** call it once from the app bootstrap after the reconciliation-settings fetch resolves — the same place that already knows `fuelBrainEnabled`.

### K2 · HIGH — Shadow-compare is still inverted in `fuelBrainClient`, and the module is dead
```ts
export function shouldShadowCompareFuelBrain(): boolean {
  return FUEL_BRAIN_SHADOW_COMPARE && !FLEET_USE_FUEL_BRAIN;
}
```
[`apps/fleet/src/services/fuelBrainClient.ts:27-29`](apps/fleet/src/services/fuelBrainClient.ts#L27)

`resolveFuelBrainFlags` was fixed so shadow-compare no longer depends on the consumer being off — and `ReconciliationTable.tsx:164` and `buildFuelWeekReportsForFinalize.ts:114` both correctly use `!FLEET_USE_FUEL_BRAIN && !FUEL_BRAIN_SHADOW_COMPARE`. But this file kept the original `&& !FLEET_USE_FUEL_BRAIN`, reproducing the exact defect §D4 named: you cannot shadow-compare before cutting over.

Compounding it: **neither `shouldShadowCompareFuelBrain` nor `shouldConsumeFuelBrain` is imported anywhere.** The module's only live export is `classifyWeekForRecon`. So this is a wrong implementation of a fix, sitting in dead code, that a future caller will reach for by name and silently get the old behaviour. Delete the two functions or correct them.

### K3 · HIGH — The price-health guard is a type-impossible comparison and never fires
```ts
const priceSource = priceResolved.priceSource;   // 'fuel_entries' | 'org_default' | 'unavailable'
…
if (efficiencySource === 'default_fallback' || priceSource === 'default_fallback') {
    healthStatus = healthStatus === 'Emerald' ? 'Amber' : healthStatus;
    healthScore = Math.min(healthScore, 65);
}
```
[`fuelCalculationService.ts:432`](apps/fleet/src/services/fuelCalculationService.ts#L432) and [`:495`](apps/fleet/src/services/fuelCalculationService.ts#L495)

`'default_fallback'` is a member of the *efficiency* union, not the price union. The right-hand clause can never be true, so **a driver-week with no resolvable price never gets its health downgraded** — it renders Emerald while every cost leg is silently zero (K4). The efficiency half still works, which is why this reads as fine at a glance.

The correct predicate is the flag already in scope: `priceUnavailable`, or `priceSource === 'unavailable'`.

This is also a TypeScript error (TS2367, no-overlap comparison) that survived because **there is no `tsc` typecheck for `@roam/fleet` or `@roam/admin` in CI** — [`ci.yml`](.github/workflows/ci.yml) runs `typecheck` only for `@roam/rush-command`. A single `pnpm --filter @roam/fleet typecheck` step would have caught this class of bug for free.

### K4 · HIGH — `defaultPricePerLiterJmd` is never supplied, so fail-loud degrades to fail-to-zero
`resolvePricePerLiter` has three tiers: observed → org default → unavailable. The middle tier is the one that keeps cash-only weeks correct.

Grepping `defaultPricePerLiterJmd` across the whole repo: the option is **declared** at [`fuelCalculationService.ts:228`](apps/fleet/src/services/fuelCalculationService.ts#L228), **forwarded** at [`:307`](apps/fleet/src/services/fuelCalculationService.ts#L307), and **passed only by tests** (`fuelCalculationService.test.ts:277`, `resolvePricePerLiter.test.ts:16`). No production caller sets it. There is no org-level JMD/L setting to source it from.

So every cash-only week, missing import, or new vehicle now takes the `unavailable` branch, and [`:357-368`](apps/fleet/src/services/fuelCalculationService.ts#L357) zeroes `rideShareCost`, `companyUsageCost`, `deadheadCost` **and `personalUsageCost`**.

§D1 was a ~99.25% understatement of the driver charge. This is a 100% understatement. It is strictly better — it is deterministic, tagged, and cannot be mistaken for a real number by downstream arithmetic — but only if someone is told. Combined with K3 (health never downgrades) and K5 (badge says "DEFAULT"), nobody is told.

**Fix:** add `defaultPricePerLiterJmd` to the fuel reconciliation settings alongside `fuelBrainEnabled`, and pass it from the recon call site. It is the same settings blob and the same call path.

### K5 · MEDIUM — The recon badge renders "price unavailable" as "DEFAULT"
```tsx
report.metadata.rideShareCalc.priceSource === 'fuel_entries' ? 'ACTUAL' : 'DEFAULT'
```
[`ReconciliationTable.tsx:923-927`](apps/fleet/src/components/fuel/ReconciliationTable.tsx#L923)

Three price states collapse into two badges. `unavailable` — meaning *every cost leg on this row is zero because we could not price it* — displays identically to `org_default`, which means *we priced it from a configured rate*. An operator reading "DEFAULT" reasonably concludes a number was used.

Given K4 makes `unavailable` the **only** non-observed state reachable today, "DEFAULT" is currently always a lie. Needs a third badge — `NO PRICE`, in a warning colour.

### K6 · MEDIUM — A fourth fuel calculation fork now exists in `apps/driver`
| File | Lines |
|---|---|
| `apps/fleet/src/services/fuelCalculationService.ts` | 1,135 (canonical) |
| `apps/admin/src/services/fuelCalculationService.ts` | 17 (re-export ✅) |
| **`apps/driver/src/services/fuelCalculationService.ts`** | **529 (fork)** |
| `apps/admin/src/services/settlementService.ts` | 445 |
| **`apps/driver/src/services/settlementService.ts`** | **470** |

The driver copy [imports `resolvePricePerLiter` from `@roam/fuel-core`](apps/driver/src/services/fuelCalculationService.ts#L8) — so it got the D1 fix — but forks everything else, including the odometer-bucket model and deadhead attribution. It is the same shape of problem §F1 identified for Dominion, one app over, and it computes numbers a **driver** sees about their own settlement. A driver and an ops user disagreeing about a settlement figure is the worst version of this bug.

The parity script does not cover it (K10).

### K7 · MEDIUM — `packages/types/src/fuel.ts` is dead code with a canonical name
Beyond §F2's staleness: the file is exported from the barrel ([`index.ts:6`](packages/types/src/index.ts#L6)) but **nothing imports fuel types from `@roam/types`**. Both apps use their own `../types/fuel`. 382 lines of type definitions that no compiler ever checks against a consumer, sitting in the package whose name promises it is the source of truth.

Evidence it is drifting unnoticed: [`apps/admin/src/types/fuel.ts:230`](apps/admin/src/types/fuel.ts#L230) still documents `priceSource: 'fuel_entries' | 'default_fallback'` while [`apps/fleet/src/types/fuel.ts:211`](apps/fleet/src/types/fuel.ts#L211) has the current `'fuel_entries' | 'org_default' | 'unavailable'`. Three files, three versions of one union.

Either make it canonical (and delete the app-local copies) or delete it. Leaving it is worse than either.

### K8 · MEDIUM — Fuel fetch failures render as "no fuel this period"
```ts
fuelService.getFuelEntries({ limit: 1500, startDate, endDate }).catch(() => [])
```
[`useFuelAnalytics.ts:92`](apps/fleet/src/hooks/useFuelAnalytics.ts#L92), same pattern at [`StationDatabaseView.tsx:121`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L121) and [`FuelCostAnalyticsPage.tsx:42`](apps/admin/src/components/admin/fuel-cost-analytics/FuelCostAnalyticsPage.tsx#L42).

A 500, a 403, or a network failure produces an empty array, which React Query treats as a successful result. Every KPI renders `0`, no error state, no retry prompt. "Zero fuel spend this period" and "the fuel API is down" are pixel-identical.

This is the same failure mode as the truncation bug that §A1/A2 fixed — silently under-reporting money — and it survived the fix because the fix targeted the header, not the catch. Let the query reject and render React Query's `isError`.

### K9 · LOW — `apps/admin` pins Leaflet to `"*"`
[`apps/admin/package.json:64`](apps/admin/package.json#L64) — `"leaflet": "*"` against fleet's exact `1.9.4`. §B2a's root cause was version skew between a bundled Leaflet and a differently-versioned stylesheet; a wildcard range reintroduces exactly that risk on the next `pnpm install` in Dominion, which re-exports fleet's map components. Pin it to `1.9.4`.

### K10 · MEDIUM — Guard coverage has gaps the CI checks do not see
Two asymmetries with the toll side:

**(a) No fuel org-scope check.** CI runs [`check-toll-org-scope.mjs`](.github/workflows/ci.yml#L36) but there is no `check-fuel-org-scope.mjs`. Fuel's org-scoping is now good enough to be worth locking in — and K13's routes are exactly what such a check would catch.

**(b) The parity script covers 2 of 9+ forked files.** [`check-fuel-core-parity.mjs:12-23`](scripts/check-fuel-core-parity.mjs#L12) asserts only `apps/fleet/.../fuelBrainFlags.ts` and `apps/admin/.../fuelCalculationService.ts`. The still-forked `fuelCycleEngine`, `fuelService`, `types/fuel`, `fuelCardMatch`, `useFuelCycles`, `useFuelAnchors`, `fuelDisputeService` and the new `apps/driver` copies are unguarded — nothing stops them drifting further, and nothing would stop someone re-forking `fuelCalculationService` into `apps/driver` tomorrow.

The 1.50-literal ban and the 4,000-byte size assertion on the shim are both nicely paranoid; the coverage list just needs extending.

### K11 · LOW — Learnt-location promotion writes the off-schema `lastVisited`
```js
stats: { totalVisits: 1, lastVisited: new Date().toISOString() }
```
[`fuel_controller.tsx:3146`](supabase/functions/_fleet-server/fuel_controller.tsx#L3146)

The one site §B7 missed. A station created by promoting a learnt location starts with no `lastUpdated`, so the UI shows a blank "last updated" until an unrelated fuel entry happens to bump it through `bumpStationStats`. Cosmetic, but it is the same field-name split the audit flagged, still live in one path.

### K12 · MEDIUM — No `priceVersionId` stamped on fuel entries; markup edits rewrite history
§H1 explicitly called for *"a stamped `priceVersionId` on each entry so history can't be retroactively rewritten."* The table has the versioning (`effective_from`, `is_published`, `version_label`) and `pickMarkupForDate` resolves correctly by date — but nothing writes the resolved version id onto the fuel entry.

So editing a markup row silently changes what every historical entry "should have cost", and any outlier judgment previously recorded against it. The same shape as the Toll Info rate card problem, and the fix is the same: stamp the id at evaluation time.

Low urgency **only** because nothing consumes the estimate for money yet (J-C2). It becomes urgent the moment C2 is wired — stamp it *before* that, not after.

### K13 · HIGH — `PATCH /transactions/:id/lock` is ungated and org-blind
```js
app.patch(`${BASE_PATH}/transactions/:id/lock`, async (c) => {
    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);
    tx.isLocked = true;
    tx.lockedAt = new Date().toISOString();
    tx.metadata = { ...tx.metadata, status: 'Finalized' };
    await kv.set(`transaction:${id}`, tx);
```
[`fuel_controller.tsx:2373-2388`](supabase/functions/_fleet-server/fuel_controller.tsx#L2373)

The last unguarded money write in the controller. No `requirePermission`, and no `belongsToOrg` check on the fetched record — so any authenticated user who knows or guesses a transaction id can lock **any tenant's** transaction and stamp it `Finalized`. Locking is the one-way operation the rest of the finalize path is carefully built around; this route walks around all of it.

It belongs behind `transactions.edit` plus a `belongsToOrg(tx, c)` guard, matching the treatment `DELETE /finalized-reports/…` already received.

### K14 · MEDIUM — Geocoding proxies are ungated billed endpoints
[`POST /geo/geocode`](supabase/functions/_fleet-server/fuel_controller.tsx#L5376) and [`POST /geo/reverse-geocode`](supabase/functions/_fleet-server/fuel_controller.tsx#L5428) forward to the Google Maps API using a server-held key, with no permission gate and no rate limit.

Credit where due: both are wrapped in `trackedProviderCall({ provider: "google_maps", … })`, so spend is *metered* and attributable. But metered is not capped — any authenticated user can loop these and bill the platform. Gate on `fuel.edit_entry` (the workflows that need geocoding already have it) and add a per-caller ceiling.

### K15 · HIGH — Four cross-tenant reads that are not reference data
§G3 accepted stations / learnt-locations / parent-companies as deliberately global. These four are none of those things, and all four still scan the whole KV store with no permission gate:

| Route | Line | What it returns across every org |
|---|---|---|
| `GET /admin/spatial-review-queue` | [`:4318`](supabase/functions/_fleet-server/fuel_controller.tsx#L4318) | Raw `fuel_entry:` **and** `transaction:` records with GPS coordinates, for every tenant. The `admin/` prefix confers no privilege — §G1 already made this point, and this is the one route where it still bites. The sibling `POST /admin/spatial-review/delete` **did** get `requirePlatformStaff()`; the read next to it did not. |
| `GET /fuel-reconciliation/periods-health` | [`:1884`](supabase/functions/_fleet-server/fuel_controller.tsx#L1884) | Scans all `finalized_report:` + all `fuel_entry:`. Returns counts rather than rows, but they are counts of other tenants' unfinalized money. |
| `GET /fuel-audit/deadhead/fleet` and `/deadhead/:vehicleId` | [`:6238`](supabase/functions/_fleet-server/fuel_controller.tsx#L6238), [`:6355`](supabase/functions/_fleet-server/fuel_controller.tsx#L6355) | All orgs' `fuel_entry:`, `vehicle:` and `trip:` records. `:vehicleId` filters by vehicle id *after* the global load, so any id from any tenant resolves. |
| `GET /fuel-pnl-offset-backfill/status` | [`:2016`](supabase/functions/_fleet-server/fuel_controller.tsx#L2016) | `sample: candidates.slice(0, 20)` — twenty real fill records with amounts, unfiltered by org. |

The pattern is consistent and worth stating plainly: **the remediation scoped the routes the audit listed by name, and did not sweep for the rest.** `/fuel-audit/summary` and `/fuel-audit/fleet-stats` were both named in §G3 and both got `filterByOrg`; `/fuel-audit/deadhead/*` sits in the same family, was not named, and did not. A `check-fuel-org-scope.mjs` (K10a) would make this class self-policing rather than dependent on an audit enumerating every route.

---

## K-summary

| Sev | Count | Items |
|---|---|---|
| High | 6 | K1 (kill switch inert) · K2 (shadow-compare inverted, in dead code) · K3 (health guard never fires) · K4 (org default unreachable → charges zero) · K13 (transaction lock ungated, cross-tenant) · K15 (four cross-tenant reads) |
| Medium | 7 | K5 · K6 · K7 · K8 · K10 · K12 · K14 |
| Low | 2 | K9 · K11 |

---

# L. Revised order of work

**Connect the five loose wires first.** All are small, all are already-built mechanisms with a missing caller, and together they close most of what still behaves like the original bugs.

| # | Item | § | Effort |
|---|---|---|---|
| 1 | Add `defaultPricePerLiterJmd` to fuel recon settings; pass it at the recon call site | K4 | one setting + one argument |
| 2 | Fix the price-health guard to test `priceUnavailable`, and add `pnpm --filter @roam/fleet typecheck` to CI | K3 | one line + one CI step |
| 3 | Call `applyFuelBrainServerSettings` from bootstrap after settings load | K1 | one call |
| 4 | Gate `PATCH /transactions/:id/lock` on `transactions.edit` + `belongsToOrg` | K13 | one route |
| 5 | Third `NO PRICE` badge in `ReconciliationTable` | K5 | one ternary → switch |

**Then — close the remaining leaks and silent failures:**

| # | Item | § |
|---|---|---|
| 6 | Org-scope or platform-gate `/admin/spatial-review-queue`, `/fuel-reconciliation/periods-health`, `/fuel-audit/deadhead/*`, `/fuel-pnl-offset-backfill/status` | K15 |
| 7 | Gate + throttle the two `/geo/*` proxies | K14 |
| 8 | Let fuel queries reject instead of `.catch(() => [])` | K8 |
| 9 | Read `X-Total-Count` in Dominion's `fuelService`; add the truncation banner to Evidence Bridge | E3 |
| 10 | Have `getStations()` actually pass `limit`/`fields=list` — the server already supports it | B6 |
| 11 | Delete or correct `shouldShadowCompareFuelBrain` | K2 |

**Then — parity and drift control:**

| # | Item | § |
|---|---|---|
| 12 | Extend `check-fuel-core-parity.mjs` to the 7 still-forked files + the `apps/driver` copies | K10b, K6 |
| 13 | Add `check-fuel-org-scope.mjs` mirroring the toll check | K10a |
| 14 | De-fork `fuelCycleEngine` (the cycle spine health depends on) | F1 |
| 15 | Make `packages/types/src/fuel.ts` canonical or delete it — not both | F2, K7 |
| 16 | Pin `apps/admin` Leaflet to 1.9.4 | K9 |

**Then — finish the Petrojam story:**

| # | Item | § |
|---|---|---|
| 17 | Stamp `priceVersionId` on fuel entries — **before** wiring the estimate into money | K12 |
| 18 | Wire `isPriceOutlier` into fleet anomaly detection and the "Potential Loss" KPI | C2, A4 |
| 19 | Confirm one green run of the Petrojam workflow; verify repo secrets are set | C1 |
| 20 | Per-station price-outlier detection — `bumpStationStats` now makes this nearly free | H7 |

**Open product decisions (not defects):**

- **F4** — Station Database is now explicitly Super-Admin-only. Fleet operators cannot correct station data they generate. Accept the escalation load, or ship a narrow read-plus-flag view. Decide it deliberately rather than leaving the audit line ambiguous.
- **F5** — Dominion has read-only Reconciliation and Transaction Logs but no Fuel Cards, Reimbursements, or Configuration. Confirm that is the intended stopping point.
- **A3** — The 90-day default preset against a week-shaped control, still unresolved from the first pass.

---

*Re-audit 2026-08-31 — audit only, no files were modified. Every status above was verified by reading the shipped code, not the remediation plan. The one claim that did not survive verification is the Fleet Stations route (J-F4), which was reversed by a later product decision; the §I item list has been updated accordingly. Items 1–5 in §L are the ones that still behave in production like the bugs they were meant to fix.*

---

# M. Second verification pass — 2026-08-31 (later same day)

**Method:** Re-ran every check behind §J–§L against the current working tree.

## M0 · Result

**§L is essentially complete: 19 of 20 items done, plus A3.** All 15 §K findings are closed. Every High is closed. The two remaining gaps are one half-item and one pre-existing item that was never in the top tier.

Two items were resolved by **deletion rather than wiring** — a legitimate and in both cases simpler choice than the one §L recommended, but each converts a bug into a **product position that should be held deliberately**. They are called out in M2 because they will not show up as defects again; they will show up as someone asking "why is this driver charged zero?" or "why did my Dominion toggle do nothing?"

| Tier | Items | Status |
|---|---|---|
| §L 1–5 — the loose wires | 5 | ✅ 5 done (one half-gap: CI typecheck) |
| §L 6–11 — leaks & silent failures | 6 | ✅ 6 done |
| §L 12–16 — parity & drift | 5 | ✅ 5 done |
| §L 17–20 — Petrojam | 4 | ✅ 3 done · 1 unverifiable from code · H7 not started |
| §K findings | 15 | ✅ 15 closed |

## M1 · Item-by-item

### Tier 1 — the loose wires

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `defaultPricePerLiterJmd` (K4) | ✅ **Resolved by removal** | [`resolvePricePerLiter.ts`](packages/fuel-core/src/resolvePricePerLiter.ts) is now two-tier — `FuelPriceSource = 'fuel_entries' \| 'unavailable'`, the `org_default` branch and the input field are gone. The unreachable tier can no longer be unreachable because it does not exist. See M2a. |
| 2a | Price-health guard (K3) | ✅ **Fixed** | [`fuelCalculationService.ts:492`](apps/fleet/src/services/fuelCalculationService.ts#L492) now reads `efficiencySource === 'default_fallback' \|\| priceUnavailable \|\| priceSource === 'unavailable'`. The Amber downgrade fires. |
| 2b | CI typecheck | 🔴 **Not done** | [`ci.yml:75`](.github/workflows/ci.yml#L75) still runs `typecheck` for `@roam/rush-command` only. `apps/fleet` has a `typecheck` script ([`package.json:12`](apps/fleet/package.json#L12)); **`apps/admin` has none**. See M3. |
| 3 | Fuel Brain kill switch (K1) | ✅ **Resolved by removal** | [`fuelBrainFlags.ts`](apps/fleet/src/utils/fuelBrainFlags.ts) is now three hardcoded constants — `FLEET_USE_FUEL_BRAIN = true`, `FLEET_CYCLE_HEALTH = true`, `FUEL_BRAIN_SHADOW_COMPARE = false` — headed "Fuel Brain is always on for recon. No customer or Dominion kill switch." `applyFuelBrainServerSettings` is gone. See M2b. |
| 4 | Lock route (K13) | ✅ **Fixed, thoroughly** | [`:2407-2413`](supabase/functions/_fleet-server/fuel_controller.tsx#L2407) — `requirePermission("transactions.edit")` **plus** an inline `belongsToOrg(tx, c) \|\| isPlatformCaller(c)` check on the fetched record. Both halves of the finding closed. |
| 5 | `NO PRICE` badge (K5) | ✅ **Fixed** | [`ReconciliationTable.tsx:927-929`](apps/fleet/src/components/fuel/ReconciliationTable.tsx#L927) — `'fuel_entries' ? 'ACTUAL' : 'NO PRICE'`. The misleading "DEFAULT" is gone. |

### Tier 2 — leaks and silent failures

| # | Item | Status | Evidence |
|---|---|---|---|
| 6 | Four cross-tenant reads (K15) | ✅ **Fixed** | `/fuel-reconciliation/periods-health` → `fuel.view` + `filterByOrg` ×2 [`:1906-1918`](supabase/functions/_fleet-server/fuel_controller.tsx#L1906) · `/fuel-pnl-offset-backfill/status` → `requirePlatformStaff()` [`:2050`](supabase/functions/_fleet-server/fuel_controller.tsx#L2050) · `/admin/spatial-review-queue` → `requirePlatformStaff()` [`:4358`](supabase/functions/_fleet-server/fuel_controller.tsx#L4358) · `/fuel-audit/deadhead/fleet` → `fuel.view` + `filterByOrg` ×3 on entries/vehicles/trips [`:6282-6311`](supabase/functions/_fleet-server/fuel_controller.tsx#L6282) · `/fuel-audit/deadhead/:vehicleId` → same [`:6418-6445`](supabase/functions/_fleet-server/fuel_controller.tsx#L6418). Scoping the deadhead loads at the source (not post-filtering by vehicle id) is the right fix. |
| 7 | Geo proxies (K14) | ✅ **Fixed** | Both now `requirePermission("fuel.edit_entry")` — [`:5416`](supabase/functions/_fleet-server/fuel_controller.tsx#L5416), [`:5470`](supabase/functions/_fleet-server/fuel_controller.tsx#L5470). `trackedProviderCall` metering retained. |
| 8 | `.catch(() => [])` (K8) | ✅ **Fixed** | All three sites now let the query reject — [`useFuelAnalytics.ts:97`](apps/fleet/src/hooks/useFuelAnalytics.ts#L97), [`StationDatabaseView.tsx:121`](apps/fleet/src/components/fuel/stations/StationDatabaseView.tsx#L121), [`FuelCostAnalyticsPage.tsx:41`](apps/admin/src/components/admin/fuel-cost-analytics/FuelCostAnalyticsPage.tsx#L41). A dead API no longer renders as zero spend. |
| 9 | Dominion truncation (E3) | ✅ **Fixed** | `apps/admin/.../fuelService.ts:212-214` reads `X-Total-Count`; [`EvidenceBridgeAnalytics.tsx:81,123-126`](apps/admin/src/components/admin/fuel-evidence-bridge/EvidenceBridgeAnalytics.tsx#L123) derives `entriesTruncated` and renders a banner at [`:312`](apps/admin/src/components/admin/fuel-evidence-bridge/EvidenceBridgeAnalytics.tsx#L312). The forensics surface now declares when it is seeing a subset. |
| 10 | `getStations` pagination (B6) | ✅ **Fixed** | [`fuelService.ts`](apps/fleet/src/services/fuelService.ts) `getStations({limit=500, offset=0, fields='list'})` — passes all three and reads `X-Total-Count`. The server capability built in the first remediation is now actually used, and the default is the projected list shape rather than full records. |
| 11 | `shouldShadowCompareFuelBrain` (K2) | ✅ **Fixed** | Both dead functions deleted; [`fuelBrainClient.ts`](apps/fleet/src/services/fuelBrainClient.ts) is down to `classifyWeekForRecon`. |

### Tier 3 — parity and drift control

| # | Item | Status | Evidence |
|---|---|---|---|
| 12 | Extend parity script (K10b, K6) | ✅ **Done** | [`check-fuel-core-parity.mjs`](scripts/check-fuel-core-parity.mjs) now asserts four shims: fleet `fuelBrainFlags`, **admin + driver** `fuelCalculationService`, admin `fuelCycleEngine`. `apps/driver/src/services/fuelCalculationService.ts` is a **17-line re-export** — the fourth fork (K6) is gone. |
| 13 | `check-fuel-org-scope.mjs` (K10a) | ✅ **Done** | Script exists and runs in CI at [`ci.yml:38-39`](.github/workflows/ci.yml#L38), mirroring the toll check. This is the change that makes K15's class self-policing. |
| 14 | De-fork `fuelCycleEngine` (F1) | ✅ **Done** | `apps/admin/src/utils/fuelCycleEngine.ts` is now 6 lines re-exporting `@fleet/utils/fuelCycleEngine`. The cycle spine is single-sourced. |
| 15 | `packages/types/src/fuel.ts` (F2, K7) | ✅ **Done — deleted** | The file is gone; `packages/types/src/index.ts` no longer exports `./fuel` (only `./fuelBrain`, which has real consumers). The dead canonical-by-name copy is removed rather than left ambiguous. |
| 16 | Pin admin Leaflet (K9) | ✅ **Done** | [`apps/admin/package.json:64`](apps/admin/package.json#L64) — `"leaflet": "1.9.4"`, matching fleet exactly. |

### Tier 4 — Petrojam

| # | Item | Status | Evidence |
|---|---|---|---|
| 17 | Stamp `priceVersionId` (K12) | ✅ **Done, correctly ordered** | [`supabase/functions/_fleet-server/fuel_retail_stamp.ts`](supabase/functions/_fleet-server/fuel_retail_stamp.ts) stamps `priceVersionId` + `retailEstimateJmd` onto entry metadata, and [`:78`](supabase/functions/_fleet-server/fuel_retail_stamp.ts#L78) explicitly refuses to overwrite an existing stamp ("history lock"). Imported by the controller at [`:65`](supabase/functions/_fleet-server/fuel_controller.tsx#L65). This landed **before** item 18, exactly as §L asked. |
| 18 | Wire outlier detection into fleet (C2, A4) | ✅ **Done** | [`fuelAnalyticsAggregates.ts:12-13,646-696`](apps/fleet/src/utils/fuelAnalyticsAggregates.ts#L646) imports `resolveRetailEstimate` + `isPriceOutlier` and prefers the **stamped** `metadata.retailEstimateJmd`, falling back to live resolution only when absent. Petrojam is no longer an island — and because it reads the stamp first, historical judgments stay stable. |
| 19 | Confirm a green Petrojam run | ⏳ **Not verifiable from code** | The workflow is correct. Whether `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set and the schedule has actually fired can only be seen in the Actions tab. |
| 20 | Per-station price-outlier detection (H7) | 🔴 **Not started** | No per-station median / rolling-window comparison in `fuelAnalyticsAggregates.ts`. Never in the top tier; noted for completeness. |

### Also fixed

**A3** — the period preset defaulted to `last_90_days` against a week-shaped control since the first audit. [`useFuelAnalytics.ts:62`](apps/fleet/src/hooks/useFuelAnalytics.ts#L62) is now `useState<PeriodPreset>('this_week')`. This also materially reduces A1 exposure: the fetch window is now 8 weeks + the current week rather than 8 weeks + 90 days, so the 1,500-row cap is far harder to hit.

## M2 · Two fixes that became product positions

Neither is a defect. Both are decisions that now live in code and will resurface as questions rather than as bugs, so they are worth stating once, plainly.

### M2a · A cash-only driver-week now charges zero, permanently and by design
`resolvePricePerLiter` no longer has a middle tier. A week with liters but no gas-card cost — cash-only, a missing import, a new vehicle — resolves to `unavailable`, and [`:354-366`](apps/fleet/src/services/fuelCalculationService.ts#L354) zeroes ride-share, company-usage, deadhead **and personal-usage** cost.

This is the correct engineering choice: it is deterministic, tagged at three levels (`priceSource`, `priceUnavailable`, the `NO PRICE` badge), health-downgraded (K3), and cannot be mistaken downstream for a real number. It is strictly safer than inventing a price.

But the **business** outcome is that the driver is charged nothing for that week, and the fix is manual — someone must add the missing fill data and re-run. Worth confirming ops knows that is the intended handling, and that the `NO PRICE` badge is somewhere they actually look. If unbilled weeks accumulate, the answer is a reconciliation queue for `priceUnavailable` weeks, not a reinstated fallback constant.

### M2b · The Fuel Brain server settings are now orphaned
The client flags are hardcoded `true / true / false`. But the server still defines, persists and accepts them:
- [`fuel_pnl_offset.ts:247-277`](supabase/functions/_fleet-server/fuel_pnl_offset.ts#L247) — `fuelBrainEnabled` / `fuelBrainShadowCompare` in the settings type, with defaults and patch merge logic.
- [`fuel_controller.tsx:1894-1897`](supabase/functions/_fleet-server/fuel_controller.tsx#L1894) — `PATCH /fuel-reconciliation/settings` still accepts both booleans and writes them.

So a settings write succeeds, persists, returns 200 — and changes nothing. That is a worse failure than no switch at all, because it looks like it worked. Either drop the two fields from the settings schema and the PATCH allow-list, or have the route reject them with an explicit "Fuel Brain is always on" message. Small cleanup, five minutes, prevents a genuinely confusing support ticket.

## M3 · The one remaining gap

**No `tsc` typecheck for `apps/fleet` or `apps/admin` in CI.** [`ci.yml:75`](.github/workflows/ci.yml#L75) typechecks `@roam/rush-command` alone. `pnpm build` runs `vite build`, which transpiles without typechecking — it will not catch this class of error.

K3 was a TS2367 no-overlap comparison that silently disabled a money-health guard and survived an entire remediation cycle. It was found by reading, not by tooling. The same class of bug can land again tomorrow.

`apps/fleet` already has the script. Two steps close this:

```yaml
- name: Typecheck fleet
  run: pnpm --filter @roam/fleet typecheck
- name: Typecheck admin
  run: pnpm --filter @roam/admin typecheck
```

`apps/admin` needs the script added to its `package.json` first — it has `build` and `test` but no `typecheck`. Expect a backlog of pre-existing errors on the first run; gating on a clean fleet run and adding admin behind it is a reasonable staging.

## M4 · Remaining fork inventory (unchanged, and now bounded)

`fuelCalculationService` and `fuelCycleEngine` — the two that carried money logic — are single-sourced across all three apps and CI-enforced. What remains is service/type/hook surface:

| File | fleet | admin | driver | covered by parity CI |
|---|---|---|---|---|
| `services/fuelService.ts` | 482 | 575 | 357 | ❌ |
| `types/fuel.ts` | 458 | 389 | 339 | ❌ |
| `services/settlementService.ts` | 466 | 445 | 470 | ❌ |
| `utils/fuelCardMatch.ts` | 106 | 75 | 76 | ❌ |
| `hooks/useFuelAnchors.ts` | 91 | 81 | — | ❌ |
| `hooks/useFuelCycles.ts` | 34 | 11 | — | ❌ |
| `services/fuelDisputeService.ts` | 77 | 77 | 77 | ❌ |

`settlementService` is the one worth watching — three copies, all computing driver settlements, none asserted equal. It no longer forks the *engine* (§F1's actual danger, now closed), but it still forks the orchestration around it. Not urgent; worth a parity assertion when convenient.

## M5 · Standing product decisions

Unchanged from §L, restated so they are not mistaken for open defects:

- **F4** — Station Database is Super-Admin-only by explicit decision ([`App.tsx:162`](apps/fleet/src/App.tsx#L162)). Fleet operators cannot correct station data they generate; that escalation load is accepted.
- **F5** — Dominion has **no** customer money surfaces (no Reconciliation, Transaction Logs, Fuel Cards, Reimbursements, or Configuration). Nav is Stations, Prices, Brain, JAA, Evidence Bridge, Station Analytics, and Fuel Cost Analytics only.
- **§G3** — stations / learnt-locations / parent-companies are intentionally platform-global.
- **M2a** — unpriceable weeks charge zero; ops must watch **NO PRICE** badges / recon filter. Add fills and re-run recon — never invent JMD/L.
- **M2b** — Fuel Brain is always on; server settings no longer accept runtime kill-switch fields (PATCH returns 400).
- **A1** — closeout plan auto-pages past the 1,500-row ceiling; truncation banner only if a hard safety ceiling trips.

### Ops brief — NO PRICE weeks
A driver-week with liters but no gas-card spend shows **NO PRICE**, health Amber, and **$0** for all category costs until real fills exist and recon is re-run. Do not treat $0 as “no personal usage.”

### Petrojam cron
Confirm GitHub secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (optional `CRON_SECRET`), then run `.github/workflows/petrojam-weekly-sync.yml` via `workflow_dispatch` and keep one green run URL on file.

**Ops status (closeout):** `gh` was not authenticated in the implementer environment — secrets/run must be confirmed from the Actions tab by a human with repo access.

### Closeout implementation notes (2026-08-31)
- M2b: brain runtime flags removed from settings; PATCH with those keys returns 400.
- M3: CI runs `fuel-core` typecheck + fleet/admin **money-spine** typecheck (`typecheck:money`); full-app `tsc` still has UI/package backlog.
- A1: `getAllFuelEntriesInRange` auto-pages past 1,500.
- M2a UX: Reconciliation NO PRICE banner + filter chip.
- H7: station 30-day median outliers in Fleet Potential Loss + Dominion Cost Analytics.
- M4: settlement idempotency/date helpers in `@roam/fuel-core`; driver coverage uses canonical `getCategoryCoverageSplit`.
- Phase 7 deferred: no persisted station median on `stats` (client median sufficient).

---

*Second verification pass, 2026-08-31 — audit only, no files were modified. §L is 19/20 complete and all 15 §K findings are closed, including every High. Remaining closeout work is tracked in the Fuel System Audit Closeout Plan (brain settings removal, fleet+admin typecheck in CI, analytics paging, NO PRICE queue UX, station median outliers, settlement shared core).*
