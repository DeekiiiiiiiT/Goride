# Toll System Audit — RoamFleet (`apps/fleet`) ↔ Dominion (`apps/admin`)

**Date:** 2026-08-26
**Scope:** Toll Analytics, Tag Inventory, Toll Database, Toll Info, Live Monitor, Toll Settings, and the server/edge layer behind them.
**Method:** Static read of every toll file across `apps/fleet`, `apps/admin`, `apps/driver`, `packages/*`, `supabase/functions/*`. No code was changed.

---

## 0. Executive summary

The toll system is **three separate products stitched loosely together**, and most of what you saw on screen is explained by seams between them:

| Layer | Owns | Truth store |
|---|---|---|
| **Roam Rides** (`supabase/functions/rides`) | Live GPS geofence detection during passenger trips | `rides.ride_toll_crossings` (Postgres) |
| **Toll Brain** (`supabase/functions/toll-brain`) | Optional replacement detection engine | same |
| **RoamFleet** (`_fleet-server/toll_controller.tsx`) | Imported tag CSV, reconciliation, settlements | `toll_ledger:*` (KV) |
| **Toll Database** (`index.tsx`) | Plaza geometry catalogue | `toll_plaza:*` (KV) |
| **Toll Info** (`toll_rate_schedule.ts`) | Versioned official rate cards | `toll:rate_schedule` (KV) |

**The four highest-impact findings:**

1. **Geofence toll detection does not exist for fleet trips at all.** It only runs for Roam Rides passenger rides, and it is currently a no-op even there because no plaza has a rate (§C1, §C2). This is the single biggest gap versus what you asked for.
2. **`plaza.stats` is a dead field.** Nothing in the codebase ever computes it — it's initialised to zero and never touched again. That's why all 12 plazas read `0 transactions / $0` (§C4).
3. **The date in the tag transaction list is fabricated from a UTC parsing bug**, which is why every row reads `7:00 PM` and why the list disagrees with the overlay (§B1). The same class of bug affects several other toll screens.
4. **The entire toll ledger is org-blind.** `toll_controller.tsx` never calls `filterByOrg` — 0 occurrences in 9,836 lines — while `/toll-plazas` right next door does. Toll Analytics sums *every organisation's* tolls (§F1).

**Severity counts:** 6 Critical · 11 High · 14 Medium · 9 Enhancement.

---

## A. Toll Analytics — `apps/fleet/src/components/toll/TollAnalytics.tsx`

### A1 · CRITICAL — Analytics is not org-scoped
`useTollLogs` → `api.getTollLogs()` → `GET /toll-reconciliation/toll-logs`
([`toll_controller.tsx:2536`](supabase/functions/_fleet-server/toll_controller.tsx#L2536)).

That handler filters by `vehicleId`, `tagNumber`, `driverId`, `category` — **never by org**. Its loader `getAllTollLedgerEntries()` ([`:3564`](supabase/functions/_fleet-server/toll_controller.tsx#L3564)) is a raw `kv.getByPrefix('toll_ledger:')` and `loadMergedTollTxArray()` ([`:1357`](supabase/functions/_fleet-server/toll_controller.tsx#L1357)) additionally merges in every `transaction:*` row with a toll category, also unscoped.

Meanwhile `GET /toll-plazas` ([`index.tsx:7859`](supabase/functions/_fleet-server/index.tsx#L7859)) *does* call `filterByOrg`. So plazas are tenant-scoped but the transactions charged at them are not.

**Effect:** if more than one org exists in KV, Total Toll Spend, passage count, avg cost and every chart are inflated with foreign data. Verify first: this alone can explain "totally incorrect numbers."

### A2 · CRITICAL — Voided tolls are counted
`isVoidedTx` ([`tollTagLedger.ts:64`](apps/fleet/src/utils/tollTagLedger.ts#L64)) exists and `TollTagDetail` uses it everywhere — but `TollAnalytics` and `useTollLogs` never filter it. A soft-voided toll still adds to `totalSpend`, `usageCount`, plaza spend, driver spend, and skews `avgCostPerPassage`.

Worse, `tollLedgerToTxShape` ([`:1245`](supabase/functions/_fleet-server/toll_controller.tsx#L1245)) maps voided → `status: "Voided"`, which is not in `resolveStatusDisplay`'s switch ([`useTollLogs.ts:34`](apps/fleet/src/hooks/useTollLogs.ts#L34)), so voided rows land in the Reconciliation donut as a colourless `"Voided"` slice using the `#cbd5e1` fallback.

### A3 · HIGH — Plaza attribution is a client-side guess, and the server already knows the answer
`TollLedgerRecord` carries `plaza`, **`plazaId`** and `highway`, resolved server-side by `resolveTollPlazaSSot` ([`tollLedgerRecord.ts:210`](apps/fleet/src/types/tollLedgerRecord.ts#L210)).

But `tollLedgerToTxShape` **does not put `plazaId` on the wire** ([`:1262-1330`](supabase/functions/_fleet-server/toll_controller.tsx#L1262)) — only `plaza` (name) and `vendor`. So `useTollLogs` throws the SSOT away and re-derives the plaza with `matchPlaza()` ([`useTollLogs.ts:53`](apps/fleet/src/hooks/useTollLogs.ts#L53)) — a three-tier fuzzy string match over `vendor + description`, then a GPS fallback that reads `tx.metadata.lat/lng` (which the ledger never writes).

**Effect:** "Unknown Plaza" is the largest bucket in your Spend-by-Plaza chart. Spend by Highway and Spend by Parish are derived from the same failed match, so they are equally wrong. Fix = surface `plazaId` in the tx shape and join on it.

### A4 · HIGH — "Monthly Toll Spend" on a one-week period
`monthlyTrendData` ([`:102`](apps/fleet/src/components/toll/TollAnalytics.tsx#L102)) buckets by calendar month. Selecting a Mon–Sun week yields **exactly one data point**, and Recharts `<Area>` cannot draw a line or fill from one point — hence the two floating dots in your screenshot.

Two defects in one: the card title says "Monthly" while the period selector is week-based, and the chart form doesn't match the data granularity. Should switch to daily buckets when the range is ≤ ~45 days.

### A5 · MEDIUM — Period control default contradicts its own label
`preset` initialises to `'last_90_days'` ([`:60`](apps/fleet/src/components/toll/TollAnalytics.tsx#L60)) but the trigger is a `PeriodWeekDropdown` whose list only offers Mon–Sun weeks. On first load the button falls through to the raw-range label ([`PeriodWeekDropdown.tsx:100`](apps/fleet/src/components/ui/PeriodWeekDropdown.tsx#L100)) and no row in the dropdown is highlighted — the control looks unset while a 90-day filter is active.

### A6 · MEDIUM — E-Tag adoption is measured against an unreliable field
`eTagRate` counts `paymentMethodDisplay === 'E-Tag'`. `resolvePaymentDisplay` ([`useTollLogs.ts:20`](apps/fleet/src/hooks/useTollLogs.ts#L20)) maps `'Tag Balance'` → E-Tag via `method.includes('tag')`. But `tollLedgerToTxShape` defaults **everything that isn't cash/card/fleet_account** to `"Tag Balance"` — including the geofence-bridged rows, which are `fleet_account`. So adoption % measures "wasn't explicitly cash" rather than actual transponder use.

### A7 · MEDIUM — `TAG_DISCOUNT_RATE = 0.10` is a hardcoded fiction
[`:43`](apps/fleet/src/components/toll/TollAnalytics.tsx#L43). The "E-Tag Savings Opportunity" card multiplies cash spend by a flat 10%. The real with-tag/without-tag delta is already in Toll Info per plaza per class (`rates[classId].withTag` vs `.withoutTag`). You are showing the user a made-up savings number when the true one is one lookup away.

### A8 · MEDIUM — Refunds and adjustments are silently folded into "Top-ups"
`typeLabel` collapses to `'Usage' | 'Top-up'` ([`useTollLogs.ts:168`](apps/fleet/src/hooks/useTollLogs.ts#L168)) and `Net Position` is `totalTopups − totalSpend` over `!isUsage`. A provider refund and a genuine top-up are financially different events; they read identically here. (Note: the **admin** copy of this hook already distinguishes all four — see §E1.)

### A9 · LOW — No export, no comparison, no drill-down
No CSV export, no previous-period delta (`previousPeriod()` exists in `periodRange.ts` and is unused here), no click-through from a chart bar to the underlying transactions.

---

## B. Tag Inventory — `TollTagDetail.tsx`, `TollTopupHistory.tsx`, `TollTransactionDetailOverlay.tsx`

### B1 · CRITICAL — The date/time you flagged. Root cause found.

**The list** ([`TollTopupHistory.tsx:254-255`](apps/fleet/src/components/vehicles/TollTopupHistory.tsx#L254-L255)):
```js
format(new Date(tx.date), 'MMM d, yyyy')
format(new Date(tx.date), 'h:mm a')
```
`tx.date` is a date-only string, `"2026-08-24"`. Per ECMA-262, `new Date("2026-08-24")` parses as **UTC midnight**. Rendered in Jamaica (UTC−5) that becomes **Aug 23, 7:00 PM**.

That is precisely your screenshot — and it's why *every single row* in that table reads `7:00 PM`. The list is not showing a time at all; it's showing the timezone offset.

**The overlay** ([`TollTransactionDetailOverlay.tsx:59-70`](apps/fleet/src/components/vehicles/TollTransactionDetailOverlay.tsx#L59-L70)) does it correctly: it combines `date` + the real `tx.time` field into a local-parsed string and formats through `formatInFleetTz`. Result: "Monday, August 24, 2026 / 8:43:00 AM".

**So the overlay is right and the list is wrong.** The fix is to route the list through the same fleet-tz helper and to actually read `tx.time`, which the list currently ignores entirely.

**Same bug, other places:**
- [`TollTagDetail.tsx:110`](apps/fleet/src/components/toll-tags/TollTagDetail.tsx#L110) — `new Date(tx.date)` (UTC) compared against local-midnight bounds from `getDateRange()`. Every date-range filter on this page is off by one day.
- [`TollLogTable.tsx:365`](apps/fleet/src/components/toll/TollLogTable.tsx#L365) and [`TollLogDetailPanel.tsx:275`](apps/fleet/src/components/toll/TollLogDetailPanel.tsx#L275) — `new Date(log.date) > new Date()` "future date" warning, mis-fires near midnight.
- Mirrored in `apps/admin/src/utils/tollWeekPeriod.ts:34-41`.

### B2 · HIGH — Burn rate is arithmetically wrong on the default view
[`TollTagDetail.tsx:226-228`](apps/fleet/src/components/toll-tags/TollTagDetail.tsx#L226-L228):
```js
const { start, end } = getDateRange();
const days = start && end ? ... : 7;      // 'all' → start/end are null → days = 7
const burnPerWeek = tagSpent / (days / 7); // → tagSpent / 1
```
On the default **All Time** preset, "burn per week" is just the all-time total. Your screenshot: *Tag Usage $21950.00 · Burn ~$21950/week*. It should divide by the actual span between the first and last ledger entry.

### B3 · HIGH — Money is unformatted
Every figure on this page is `` `$${n.toFixed(2)}` `` — no thousands separator, no currency identity. `$21950.00` should read `J$21,950.00`. `TollAnalytics` has a `formatJMD` helper; this page doesn't use it. Given the tag balance is the number a non-technical user acts on, this matters.

### B4 · MEDIUM — "Recovered $21,950.00 / Net Loss $0.00" needs verification
100% recovery is implausible and worth checking against `sumTagUsageFinancials` ([`utils/tollReconciliation.ts`](apps/fleet/src/utils/tollReconciliation.ts)). Note the interaction with §B1: `periodStats` runs over `periodTx` (date-filtered, off-by-one) while `calculatedBalance` runs over `scopedLedger` (unfiltered) — so the two halves of the Overview card are computed over different row sets.

### B5 · MEDIUM — The page silently writes on read
Three separate effects mutate server state during a plain page view:
- `syncBalanceIfNeeded` ([`:117`](apps/fleet/src/components/toll-tags/TollTagDetail.tsx#L117)) writes `vehicle.tollBalance` **and** `tag.lastCalculatedBalance` on every mount.
- `backfillHistory` ([`:174`](apps/fleet/src/components/toll-tags/TollTagDetail.tsx#L174)) fabricates an assignment-history entry.
- Both use read-modify-write on the whole tag/vehicle object with no optimistic concurrency — two tabs open on the same tag will clobber each other.

### B6 · MEDIUM — `differentTagCount` banner is scoped wrong
[`:327`](apps/fleet/src/components/toll-tags/TollTagDetail.tsx#L327) counts over `ledgerAll` (all time) but the table shows `periodTx` (filtered). The banner can say "22 rows" while zero are visible.

### B7 · MEDIUM — Transactions tab has no filters of its own
Type / plaza / matched-status / amount filters all live elsewhere. The only control is the page-level date preset. A 66-row tag is already unwieldy.

### B8 — UI/UX rebuild spec for the Overview tab

You asked for "a picture of a card showing the current balance, simple enough for the dumbest user." Concretely:

**Hero — the card visual (replaces the current `Tag Account Balance` card):**
- A rendered transponder card, ~340×210, tag-provider colour, with the tag number in monospace (`212100286450`), the plate badge (`5179KZ`), and the driver name. This makes the abstraction physical.
- Balance overlaid huge: **`J$550.00`**, with a coloured state ring: green ≥ 2× threshold, amber < threshold, red ≤ 0.
- One plain-English line under it: *"About 2 more trips at this rate"* — derived from balance ÷ true avg cost per passage. This is the number a dispatcher actually needs.
- A horizontal capacity bar from 0 → last top-up amount, so "how full is this tag" is visible without reading digits.

**Row 2 — three plain-language tiles, not five jargon metrics:**
| Tile | Says | Replaces |
|---|---|---|
| **Money in** | `J$22,500` added across 8 top-ups | Total Top Up |
| **Money used** | `J$21,950` at 58 plaza passages | Tag Usage |
| **Money back** | `J$21,950` recovered from trips · `J$0` absorbed | Recovery Status |

Each tile clickable → opens the Transactions tab pre-filtered to those rows. That single link removes most of the "where did this number come from" confusion.

**Row 3 — "Is this right?" reconciliation strip:**
Replace *Verify provider balance / Enter provider balance to verify* with one sentence and one action:
> **We calculate J$550.00.** What does the T-Tag app show? `[ enter amount ]`
> → resolves to a green *Matches* or an amber *Off by J$X — 3 transactions may be missing*.

**Row 4 — alerts, only when live:**
The Low Balance Alert config block should collapse into the hero ring and only expand on click. Right now a settings form occupies prime real estate on every view.

**Also:** move `Recalculate balance` out of Overview (it's a repair tool, not a daily action), and put **top-up / assignment** actions on the page — today a user who sees a low balance has no button to act on it.

---

## C. Toll Database & Geofencing

### C1 · CRITICAL — There is no geofence detection for fleet trips
`evaluateTollCrossings` has exactly one caller: [`rides/rideGeofence.ts:271,280`](supabase/functions/rides/rideGeofence.ts#L271). It is driven by `ride_requests` status (`on_trip` / `driver_en_route_pickup`) and writes to `rides.ride_toll_crossings` keyed by `ride_request_id`.

**RoamFleet trips are imported Uber/inDrive records. They have no live GPS stream, no `ride_request_id`, and never enter this path.** The Toll Settings page states this outright: *"Platform toll detection and quote estimation flags for **Roam Rides**"* ([`TollSettingsPage.tsx:116`](apps/admin/src/pages/TollSettingsPage.tsx#L116)).

What you asked for — "when the driver is on a trip it picks up the driver via the geofences I set" — **is not built for fleet.** Building it requires: (a) a driver-app location ping for fleet trips, (b) a fleet-side equivalent of `rideGeofence`, (c) attribution to `vehicleId`/`driverId`/`tripId` at write time.

### C2 · CRITICAL — Geofence detection is a guaranteed no-op today
[`tollGeofenceCore.ts:19`](supabase/functions/_shared/tollGeofenceCore.ts#L19):
```ts
if (!(plaza.defaultRateMinor > 0)) return false;
```
`defaultRateMinor` comes from `plaza.rates[]`. **`AddTollPlazaModal` has no rates field and never writes `plaza.rates`** — I checked every form field: `name, highway, direction, operator, lat/lng, plusCode, address, parish, geofenceRadius, status, operationalStatus, notes`. No rates.

So for every plaza, `rates = []` → `defaultRateMinor = 0` → **`isPointNearPlaza` returns `false` unconditionally.** No crossing can ever be detected.

There is a rescue path — `tollPlazaLoader.ts:111-141` overlays the Toll Info `class1.withTag` rate onto the plaza when linked — **but only in the Rides loader.** `toll-brain/detect.ts loadPlazas()` ([`:20-52`](supabase/functions/toll-brain/detect.ts#L20)) has **no overlay at all**. So:

> **When `RIDES_USE_TOLL_BRAIN=1`, detection silently returns zero crossings forever** — and because `brainEvaluatePoint` only falls back to local on a non-2xx response ([`tollBrainClient.ts:55`](supabase/functions/rides/fare/tollBrainClient.ts#L55)), a successful-but-empty brain response *suppresses* the working local path.

Two loaders of the same data with different rate resolution is the underlying design flaw.

### C3 · CRITICAL — Geofence catalogue ignores org boundaries
`tollPlazaLoader.ts:93-96` and `toll-brain/detect.ts:22-26` both query `kv_store_37f42386 LIKE 'toll_plaza:%'` **directly, with no org filter** — bypassing the `filterByOrg` that `GET /toll-plazas` applies. Detection evaluates against every tenant's plazas.

### C4 · HIGH — `plaza.stats` is dead data
Grepped the entire repo. The **only** writes to `totalTransactions` / `totalSpend` / `lastTransactionDate` are the zero-initialisers at [`index.tsx:7911`](supabase/functions/_fleet-server/index.tsx#L7911) and [`:16328`](supabase/functions/_fleet-server/index.tsx#L16328). `AddTollPlazaModal.tsx:450` only copies the existing (zero) object forward.

Nothing aggregates. Yet `plaza.stats` is *read and displayed* in five places:
`TollPlazaList.tsx:311` (Transactions column) · `:141` (Total Spend chip) · `TollPlazaDetailPanel.tsx:272,277,282,287` · `TollSpatialAuditMap.tsx:171` (map popup) · `VerifiedTollPlazasTab.tsx:406` · `LearntTollPlazasTab.tsx:329-337`.

That is why your Toll Database reads `0 / $0` for all 12 plazas while 21 passages exist in a single week. It is not a data problem — the aggregation was never written.

### C5 · HIGH — Per-plaza radius silently overrides the global setting
`effectiveRadius = plaza.geofenceRadius > 0 ? plaza.geofenceRadius : globalRadius` ([`tollGeofence.ts:88`](supabase/functions/rides/fare/tollGeofence.ts#L88), same in core).
`AddTollPlazaModal` **always** writes a radius (default `'200'`, [`:98`](apps/fleet/src/components/toll/AddTollPlazaModal.tsx#L98)). Therefore the "Toll geofence radius (meters)" control in Dominion Toll Settings — the one the admin will reach for when detection misses — **has no effect on any plaza that exists.** It's a dead knob.

### C6 · HIGH — Point-sampling misses plazas at highway speed
`isPointNearPlaza` tests discrete GPS fixes against a circle. At 100 km/h a vehicle covers ~28 m/s; a 200 m radius = a 400 m diameter = ~14 seconds inside. If pings are 15–30 s apart (typical background interval), **crossings are simply missed**, non-deterministically.

There is no segment-intersection check: nothing tests whether the *line* between fix N and fix N+1 passes through the circle. That is the standard fix and it's absent from both `tollGeofenceCore.ts` and `detect.ts`.

### C7 · MEDIUM — Direction is captured but never enforced
`TollPlaza.direction` is a first-class field (`Eastbound`/`Westbound`/…) and every one of your 12 plazas is set to `Both`. No detection code reads it. For directional gantries and for parallel-carriageway false positives, bearing between consecutive fixes should gate the match.

### C8 · MEDIUM — Bridged geofence tolls arrive unattributed
`bridgeRideTollCrossings` ([`toll_controller.tsx:9247-9270`](supabase/functions/_fleet-server/toll_controller.tsx#L9247)) writes ledger rows with `vehicleId: null, driverId: null, tripId: null`. Comment says this is deliberate ("do not fabricate a fleet driver identity") — but `ride_toll_crossings` has no vehicle column to resolve from, and nothing downstream ever resolves them. They land in Analytics as *Unknown Vehicle / Unassigned* forever.

### C9 · MEDIUM — Round-trip cooldown is a blunt 5 minutes
`ROUND_TRIP_COOLDOWN_MS = 5 * 60 * 1000` ([`tollGeofence.ts:27`](supabase/functions/rides/fare/tollGeofence.ts#L27)), hardcoded, not exposed in Toll Settings. A genuine there-and-back inside 5 minutes is under-charged; a traffic jam inside the geofence past 5 minutes is double-charged.

### C10 · MEDIUM — Spatial Audit tab can't act on what it finds
`TollSpatialAuditMap` renders plazas and their circles but offers no drag-to-reposition, no radius handle, no "show the GPS fixes that were near this plaza but didn't match." It's a viewer, not an audit tool.

### C11 · MEDIUM — 12 plazas, 0 verified
Your screenshot: `Verified: 0 · Unverified: 12 · Learnt: 0`. `status` is purely cosmetic today — nothing in the detection path filters on `status === 'verified'`, only on `operationalStatus !== 'inactive'`. So the verification workflow has no teeth: an unverified, possibly mis-located plaza is used for live charging exactly like a verified one.

---

## D. Toll Info — rate versioning

**Good news first: the backend versioning you want already exists and is correctly designed.**

`TollRateScheduleStore = { current, versions[] }` ([`tollRateSchedule.ts:65`](apps/fleet/src/types/tollRateSchedule.ts#L65)).
`publishScheduleVersion` ([`officialTollRate.ts:141`](apps/fleet/src/utils/officialTollRate.ts#L141)) appends an **immutable** version and never mutates prior ones.
`selectScheduleVersion(store, asOf)` ([`:121`](apps/fleet/src/utils/officialTollRate.ts#L121)) picks the card in force on a given date.
`resolveTollExpectedCost` ([`toll_controller.tsx:607`](supabase/functions/_fleet-server/toll_controller.tsx#L607)) passes the **toll's own date** as `asOf`.

So when the toll increase lands: publishing a new card with a forward `effectiveFrom` will keep historical tolls priced at the old rate. That part works.

**But there are five real gaps.**

### D1 · CRITICAL — `POST /toll-info` is unauthenticated and unpermissioned
[`index.tsx:9108`](supabase/functions/_fleet-server/index.tsx#L9108):
```js
app.post("/make-server-37f42386/toll-info", async (c) => { ... })
```
No `requireAuth()`. No `requirePermission('toll.manage')`. Compare the plaza route 200 lines earlier ([`:7897`](supabase/functions/_fleet-server/index.tsx#L7897)) which has both. There is no blanket auth middleware in `index.tsx` (the `app.use('*')` handlers at 646 and 735 are error-logging and maintenance-mode only).

Anyone holding the anon key can publish a rate card that drives reconciliation shortfalls, driver charges, and rides fares. `GET /toll-info` and `/toll-info/versions` are equally open. **Fix this first.**

### D2 · HIGH — You cannot look at past prices in the UI
This is exactly what you asked for and it isn't built. The versioned store is fetched (`setRateVersions(raw.versions)`, [`TollInfoPage.tsx:515`](apps/fleet/src/components/toll/TollInfoPage.tsx#L515)) and then used for **one badge**:
```jsx
{rateVersions.length > 1 && <Badge>{rateVersions.length} rate versions (date-locked)</Badge>}
```
([`:1175-1178`](apps/fleet/src/components/toll/TollInfoPage.tsx#L1175))

No version list. No "view rates as of [date]". No diff between two cards. No indication of who published or when. `GET /toll-info/versions` exists server-side and has zero UI consumers.

### D3 · HIGH — Nothing records which rate card priced a given toll
`OfficialTollRateResult` returns `scheduleVersionId` and `effectiveFrom` ([`officialTollRate.ts:255`](apps/fleet/src/utils/officialTollRate.ts#L255)) — and **it is never persisted.** Grep confirms: `scheduleVersionId` appears only in the type and the two return statements.

`resolveTollExpectedCost` re-resolves from scratch on every read. Consequence: **publishing a back-dated version retroactively rewrites every past expected-cost, drift flag, and shortfall calculation** — silently, with no audit trail of what changed. This is the precise risk you described as "messing up data from the past," and the backend does not currently protect against it.

Fix: stamp `rateScheduleVersionId` + `officialAmount` onto the ledger record at reconciliation time and read the stamp thereafter.

### D4 · HIGH — No guard against back-dated or duplicate publishes
`publishScheduleVersion` accepts any `effectiveFrom` and appends unconditionally. Nothing validates that the new date is ≥ the latest existing version. Nothing dedupes two versions on the same date (`selectScheduleVersion` then resolves by array order). And there is no correction path — a typo in a published card can only be fixed by publishing *another* version, so the history fills with noise.

Also note `handleSave` publishes on **every** save, even a no-op edit ([`TollInfoPage.tsx:556`](apps/fleet/src/components/toll/TollInfoPage.tsx#L556)).

### D5 · MEDIUM — Two KV key constants for the same document
`KV_TOLL_RATE_SCHEDULE = 'toll:rate_schedule'` ([`tollRateSchedule.ts:97`](apps/fleet/src/types/tollRateSchedule.ts#L97)) is the live key. But `TollInfoPage.tsx:329` declares `const KV_KEY = 'toll_rate_schedule'` — a different string. It appears vestigial (the page goes through `api.getTollInfo()`), but it's a live footgun for anyone who wires it up.

### D6 · MEDIUM — `effectiveDate` is a free-text `DD/MM/YYYY` input
[`:1165`](apps/fleet/src/components/toll/TollInfoPage.tsx#L1165) — `placeholder="DD/MM/YYYY"`, plain `<Input>`. `toIsoDateKey` handles `DD/MM/YYYY` correctly, but its `new Date(s)` fallback parses ambiguous strings as **MM/DD**. `03/04/2026` typed one way and pasted another gives different months. For the single field that governs when a nationwide rate change takes effect, this should be a date picker.

### D7 · MEDIUM — Plaza→rate linkage is optional and partly name-based
Toll Info links a rate row to a Toll Database plaza by UUID (`plaza.plazaId`, [`:629`](apps/fleet/src/components/toll/TollInfoPage.tsx#L629)) with auto-link by name fallback ([`:825-835`](apps/fleet/src/components/toll/TollInfoPage.tsx#L825)). The header shows an `N/M Linked` badge. But unlinked rows still resolve via `findPlaza`'s normalised-substring match ([`officialTollRate.ts:167`](apps/fleet/src/utils/officialTollRate.ts#L167)) — `"Angels"` vs `"Angels Toll Plaza"` vs a future `"Angels North"` will collide. And §C2 shows the rides overlay *requires* the link to give a plaza its geofence rate.

**Recommendation:** make the plaza link mandatory before a rate card can be published.

---

## E. RoamFleet ↔ Dominion sync

`apps/admin` shares two toll components by re-export — `TollInfoPage.tsx` and `TollDatabaseView.tsx` are one-line `export { X } from '@fleet/components/toll/X'`. Those two are genuinely in sync.

**Everything else is a forked copy, and three of the copies have drifted.**

### E1 · HIGH — `useTollLogs` fork: admin classifies four types, fleet classifies two
```
fleet:  tollLogKindFromTx(tx)          → typeLabel: 'Usage' | 'Top-up'
admin:  tollLogKindFromCategory(tx.category) → 'Usage' | 'Top-up' | 'Refund' | 'Adjustment'
```
The admin copy is *more* granular but *less* accurate: it reads only `category`, so it misses the `tx.type` field and the signed-amount fallback that fleet's `tollLogKindFromTx` added. Neither is a superset of the other.

### E2 · HIGH — `orphanTollClassifier` fork: the two apps disagree on the same toll
| | fleet | admin |
|---|---|---|
| Reason codes | `ORPHAN_NO_TRIP`, `ORPHAN_OUT_OF_WINDOW`, **`ORPHAN_NEARBY_UNEXPLAINED`** | first two only |
| No usable timestamp | `isOrphan: true` → **Personal Use** | `isOrphan: false` → **Needs Review** |
| Same-day trip, no window match | `isOrphan: true` → **Personal Use** | `isOrphan: false` → **Needs Review** |

The same toll is classified as the driver's personal expense in RoamFleet and as unresolved in Dominion. This is a money-affecting divergence, not a cosmetic one. Note `supabase/functions/_fleet-server/orphanTollClassifier.ts` is a *third* copy.

### E3 · HIGH — `tollCategoryHelper` fork
Fleet has `isTollLedgerCategory()` (broad matcher including credits) and `tollLogKindFromTx()`; admin has neither. Fleet's `isTollCategory` deliberately **excludes** top-ups so they don't inflate Driver Expenses; admin's includes `'toll'` in the same predicate. Different definitions of "is this a toll" in two apps reading one ledger.

### E4 · MEDIUM — `tollLedgerRecord.ts`: three copies, one is stale
`packages/types/src/tollLedgerRecord.ts` is missing the plaza-SSOT resolution, the content fingerprint, the `date` ISO-truncation, and all five `unlinked*` fields. `apps/fleet` and `apps/admin` copies also differ. The shared package — the one place that should be canonical — is the most out of date.

### E5 · HIGH — Dominion has no visibility into fleet toll money
Dominion's toll nav ([`adminNavConfig.ts:106-110`](apps/admin/src/components/admin/adminNavConfig.ts#L106)) is: Toll Brain · Toll Database · Toll Info · Toll Settings · Live Toll Monitor.

Missing entirely: **Toll Analytics, Toll Logs, Tag Inventory, Toll Reconciliation.** `TollAnalytics` is imported in exactly one place, `apps/fleet/src/App.tsx:29`. Dominion holds the toll *configuration* but cannot see the toll *money* it configures. A platform admin cannot answer "did my rate change land correctly?"

### E6 · MEDIUM — Live Toll Monitor shows a fake count and a permanent blank
[`TollLiveMonitorPage.tsx:27-29`](apps/admin/src/pages/TollLiveMonitorPage.tsx#L27):
```js
tollCount: tollTotalMinor > 0 ? 1 : 0,   // a boolean rendered as a count
lastPlazaName: null,                     // hardcoded, always empty
```
A ride with six crossings displays `1`. The "Last Plaza" column is dead. Both values are available from `ride_toll_crossings` and simply aren't fetched in the list query (only in the drawer).

### E7 · MEDIUM — Dominion's own dashboard links are inconsistent
`AdminDashboard.tsx:202` labels it "Toll Stations / Toll booth locations"; `:297` labels the same destination "Toll Database"; `adminNavConfig.ts:107` uses id `toll-stations` with label `Toll Database`. Three names for one page.

---

## F. Security & multi-tenancy

### F1 · CRITICAL — `toll_controller.tsx` is entirely org-blind
```
grep -c "filterByOrg|belongsToOrg|stampOrg" toll_controller.tsx  →  0
```
Zero occurrences across 61 routes and 9,836 lines. Auth is fine (`app.use("*", requireAuth({strict:true}))` at `:131`), but **authorisation by tenant is absent** from the entire toll ledger, reconciliation, settlement, and logs surface — while `/toll-plazas` in the neighbouring file applies it. Any authenticated user of any org reads and reconciles every org's tolls.

### F2 · CRITICAL — Toll Info write path is completely open (see §D1).

### F3 · MEDIUM — Geofence loaders bypass org scoping (see §C3).

---

## G. Enhancements you are currently lacking

1. **Rate-change impact preview.** Before publishing a card, show: "this raises expected cost on 340 open tolls by J$X; N reconciliations will re-flag as drift." With the toll increase coming, this is the highest-value addition.
2. **Rate history browser** with as-of date picker and side-by-side version diff (§D2).
3. **Plaza stats aggregation job** — nightly or on-write, populating `plaza.stats` from the ledger, so the Toll Database becomes a live surface instead of a static catalogue (§C4).
4. **Segment-intersection geofencing** with configurable ping interval, plus a per-plaza "missed crossings" diagnostic on the Spatial Audit map (§C6, §C10).
5. **Direction-aware matching** using bearing between fixes (§C7).
6. **Fleet-trip geofence pipeline** — the real answer to your Toll Database ask (§C1).
7. **Expected-vs-actual drift dashboard.** `hasOfficialRateDrift` and `resolveExpectedTollCost` already exist and compute per-toll drift; there is no screen that aggregates it. "Which plazas charged us off-tariff last week" is one query away.
8. **Tag balance forecasting** — days-to-empty from real burn rate, plus a proactive low-balance queue across all tags (today the alert is per-tag and only visible if you open that tag).
9. **Cross-app parity tests.** The §E drifts are all detectable by a test asserting `apps/fleet/src/utils/X` ≡ `apps/admin/src/utils/X`. Better: delete the forks and import from `packages/`.

---

## H. Suggested order of work

**Fix before the toll increase lands:**

| # | Item | § | Why now |
|---|---|---|---|
| 1 | Auth + permission on `POST /toll-info` | D1 | Open write on the rate card that drives all pricing |
| 2 | Persist `rateScheduleVersionId` on toll records | D3 | Without it, any back-dated publish silently rewrites history — the exact risk you named |
| 3 | Guard back-dated / duplicate publishes | D4 | Same |
| 4 | Rate history browser + as-of view | D2 | You explicitly asked for it |
| 5 | Org-scope `toll_controller.tsx` | F1 | Likely the direct cause of the wrong Analytics numbers |

**Then — makes the screens tell the truth:**

| # | Item | § |
|---|---|---|
| 6 | Fleet-tz date rendering in `TollTopupHistory` + audit all `new Date(ymd)` | B1 |
| 7 | Exclude voided tolls from Analytics | A2 |
| 8 | Surface `plazaId` in the tx shape; join on it instead of `matchPlaza()` | A3 |
| 9 | Plaza stats aggregation | C4 |
| 10 | Fix burn rate; JMD formatting on tag pages | B2, B3 |
| 11 | Daily buckets for short periods; retitle the trend chart | A4 |

**Then — makes detection actually work:**

| # | Item | § |
|---|---|---|
| 12 | Single plaza loader with the Toll Info rate overlay (kills the brain/rides divergence) | C2 |
| 13 | Org-scope the geofence loaders | C3 |
| 14 | Segment-intersection matching | C6 |
| 15 | Expose or remove the dead global radius knob | C5 |
| 16 | Fleet-trip geofence pipeline | C1 |

**Then — sync and polish:**

| # | Item | § |
|---|---|---|
| 17 | De-fork `orphanTollClassifier`, `tollCategoryHelper`, `useTollLogs`, `tollLedgerRecord` into `packages/` | E1–E4 |
| 18 | Add Analytics / Logs / Tag Inventory to Dominion | E5 |
| 19 | Tag Overview redesign | B8 |
| 20 | Real toll count + last plaza in Live Monitor | E6 |

---

*Audit only — no files were modified. Every finding above is anchored to a specific file and line; the four Critical items in §H rows 1–5 are the ones I'd verify against production data before anything else.*
