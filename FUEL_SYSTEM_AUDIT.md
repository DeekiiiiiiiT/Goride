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
