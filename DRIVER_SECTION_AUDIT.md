# Driver Section — Full System Audit

**Scope:** `apps/fleet` → Driver Operations (Drivers list, Driver Detail, Driver Analytics) and the
server + hook + util layer that feeds them.
**Date:** 2026-09-06 (original audit) · **Verified:** 2026-09-06 (post-remediation pass — see §0.5)
**Status:** Audit only. No code was modified by this document.
**Remediation state:** Phases 0–1 complete; Phases 2–4 substantially done; 6 findings confirmed
still open, 5 partially done, plus 4 new issues introduced by the remediation. See §0.5.
**Reviewers' lenses applied:** systems architecture, data integrity / finance correctness,
performance & scale, security & RBAC, UI/UX, code health, testability.

---

## 0. Executive Summary

### Verdict

The driver section is **functionally rich but architecturally unsound for enterprise use.** It has
clearly been built by iterative patching ("Phase 1 … Phase 15" comments run through the code), and
the accumulated result is a single 4,453-line God component that simultaneously acts as router,
data-fetching layer, financial aggregation engine, business-rules engine, and view.

The strongest parts of the section are the **pure utility layer** (`utils/driverSettlementMath.ts`,
`cashSettlementCalc.ts`, `walletCallOutstanding.ts`, etc.) — these are well-factored and well-tested
(≈35 test files). The weakest parts are everything above them: the components that consume those
utilities.

Three findings are severe enough to block an "enterprise" claim on their own:

1. **The Drivers list is built from a 200-trip sample.** Trip counts, vehicle assignment,
   acceptance rate and "today" figures on the list page are derived from the most recent 200 trips
   across the *entire fleet*, not per driver.
2. **The Reconciliation tab compares two different date windows against each other** and reports the
   difference as a "Mismatch". It is structurally incapable of ever reconciling correctly.
3. **The Profile / Documents tab is mock data** — hardcoded stock photos from Unsplash, fake expiry
   dates, and a compliance status that is set to "Verified" purely because a URL is non-null. Driver
   compliance is a core fleet control and it does not exist here.

Alongside those, roughly **1,300 of DriverDetail's 4,453 lines are dead** — unreachable JSX, memos
whose results are never read, and a network request whose response is discarded.

### Scale of the surface

| | |
|---|---|
| Driver section source | **18,321 lines** across 29 components |
| Largest component | `DriverDetail.tsx` — **4,453 lines**, one function of ~4,050 lines |
| Hooks in that one function | 35 `useState`, 26 `useMemo`, 9 `useEffect` |
| Estimated dead code in `DriverDetail.tsx` | **~1,300 lines (29%)** |
| Component tests for the driver section | **0** |
| Production JS bundle (whole app, no splitting) | **6.1 MB** |

### Findings by severity

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 8 | Wrong numbers shown to operators; fabricated data presented as real |
| 🟠 High | 14 | Scale ceilings, RBAC gaps, architectural coupling |
| 🟡 Medium | 17 | UX incoherence, redundancy, inconsistent money formatting |
| 🔵 Low | 11 | Dead imports, logging, polish |

---

## 0.5 Remediation Verification — 2026-09-06

Everything below was re-checked against the working tree after the remediation commit
(`b3b176cb`, +4,405 / −2,466 across 31 files). Sections 1–9 are preserved as the **original**
audit; this section records what changed.

### Headline movement

| Metric | Before | After |
|---|---|---|
| `DriverDetail.tsx` | 4,453 lines | **2,763** (−38%) |
| `{false && …}` dead JSX blocks | 7 | **0** |
| Dead memos / state / fetches | 6 | **0** |
| `useState` / `useMemo` in DriverDetail | 35 / 26 | **27 / 22** |
| Permission checks in DriverDetail | 0 | **`transactions.edit` + `drivers.edit`** |
| Driver detail URL | `/drivers` | **`/drivers/:driverId/:tab?from=&to=`** |
| Extracted tab components | 0 | **3** (Cash Wallet, Profile, Service Quality — all `React.lazy`) |
| New server modules | 0 | **6** (`drivers_roster`, `_compliance`, `_notes`, `_audit`, `_reconciliation`, `driver_operational_periods`) |
| Driver-section unit tests | 2 files | **3 files, 16 tests — all passing** |
| CI guardrail | none | `npm run check:drivers` — **passing** (37 files) |

This is real, substantial work. Phase 0 and Phase 1 are done properly, and Phases 2–4 are further
along than the roadmap expected at this point. The verification below is about what remains.

---

### ✅ Confirmed FIXED (11)

| ID | Evidence |
|---|---|
| **C-1** | `GET /drivers/roster` exists (`drivers_roster.ts:352`), registered (`index.tsx:500`), and `DriversPage.tsx:260` consumes it. The 200-trip `api.getTrips` sample and the client aggregation memo are gone. The server now scans all org trips and all canonical fare rows per driver. |
| **C-2** | Both sides of the Uber reconciliation now use the Financials window. `DriverDetail.tsx:878–899` adds a dedicated `financialUberLedger` fetch keyed on `financialDateRangeStrings`; `FinancialSubTabs.tsx:157–161` replaced `startOfWeek/endOfWeek` widening with `startOfDay/endOfDay`. Badge corrected to "Financials period" (`:486`). |
| **C-3** | `MOCK_DOCUMENTS` deleted. `buildDriverDocuments()` (`DriverDetail.tsx:263`) builds from the real driver record, reads `complianceVerifications`, and derives `Expired` from `licenseExpiry`. `POST /drivers/:id/compliance/verify` is wired to the UI and gated on `drivers.edit`. |
| **C-4** | All four fabricated values removed — no matches for `Toyota Sienta`, `Member Since: Oct`, `Safety Score`, `98/100`. |
| **C-8** | `usePermissions` now in `DriverDetail.tsx:372`; `canEditTransactions` / `canEditDrivers` gate the mutation handlers and are passed into the tabs. Server-side `POST /transactions` now carries `requirePermission('transactions.edit')` (`index.tsx:3467`). Bank account number masked behind `canEditDrivers` (`DriverProfileTab.tsx:74, 372`). |
| **A-6** | `pageRegistry.ts:81–106` parses `/drivers/:driverId/:tab`; `App.tsx:138` pushes state; `:248` handles `popstate`. Period is URL-synced via `DriverPeriodContext`. |
| **D-1** | Every item on the dead-code inventory verified absent: `groupedTollTransactions`, `cashTollTransactions`, `dateFilteredTransactions`, `walletMetrics`, `ledgerSummary`, `showHidden`, `processingIds`, `expandedRows`, duplicate `MetricCard` / `PLATFORM_COLORS`. |
| **P-5** | `useFleetClaims.ts:39` adds a driver-scoped `api.getClaims(driverId)` variant. |
| **P-6** | Both discarded fetches removed — no `getLedgerSummary` in `DriverDetail`, no `tollAutomationSettings` query in `useDriverFinancialBundle`. |
| **U-1 / U-2 / U-7** | Duplicate hardcoded `Active` badge gone; inert Export/Message CTAs replaced with a deferral comment (`DriverDetail.tsx:2374`); "Recent Trip Issues" now renders `cancelledTripsInPeriod` through `ContentVisibilityList`. |
| **U-10** | No `dicebear` references remain in `components/drivers/`. |

---

### 🟠 PARTIALLY fixed (5) — these still need work

#### V-1 · C-5 — the per-vehicle fuel economy lookup is a no-op

The constants were correctly extracted to `config/driverOpsDefaults.ts`. The lookup that replaced
the hardcoded `12` does not work:

```ts
// DriverDetail.tsx:1407
const vehicleEconomy =
  (vehicleMetrics || []).find((v: any) => v?.fuel_economy_km_per_l != null)?.fuel_economy_km_per_l
  ?? (driver as any)?.fuelEconomyKmPerL ?? null;
```

Two defects:

1. **The field does not exist on that type.** `tsc` reports
   `DriverDetail.tsx(1408,83): TS2339: Property 'fuel_economy_km_per_l' does not exist on type
   'VehicleMetrics'`. `fuel_economy_km_per_l` lives on `types/vehicleCatalog.ts:59`, not
   `types/data.ts:404 VehicleMetrics`. The `.find()` never matches, so `resolveFuelEconomyKmPerL`
   always returns `DEFAULT_FUEL_ECONOMY_KM_PER_L = 12` — **identical behaviour to before the fix.**
2. **Even if the field existed, it is not this driver's vehicle.** `.find(v => …!= null)` takes the
   *first vehicle in the fleet-wide array* with a value. That would be an arbitrary vehicle's
   economy applied to every driver — harder to notice than the old documented constant.

**To close:** resolve the driver's assigned vehicle (`useDriverFinancialBundle` already computes
`driverVehicles`), read economy from the vehicle catalog record, and fix the type.

#### V-2 · C-7 — Cash Wallet period is now labelled, but still not controllable from that tab

Real progress: `DriverPeriodContext` (`context/DriverPeriodContext.tsx`) is wired
(`DriverDetail.tsx:354, 375`), URL-synced as `?from=&to=`, and shared by Financials + Cash Wallet.
The tab now states its range and the cards say "open weeks in period above"
(`DriverCashWalletTab.tsx:155, 174`).

Still open: `showOverviewDateControls` (`DriverDetail.tsx:436`) is unchanged, so there is no picker
on the Cash Wallet tab. The code says so itself:

> `// (same range as Financials). Change it on the Financials tab until the shared period control ships.`

The context that makes this a one-line change already exists. Render a `PeriodWeekDropdown` bound to
`setPeriod` on the Cash Wallet tab (and Service Quality — see V-4).

#### V-3 · A-1 — decomposition is a third done

4,453 → 2,763 lines is genuine, and 3 tabs are extracted and lazy-loaded. But the largest single
construct is untouched: the `metrics` `useMemo` still spans **`DriverDetail.tsx:910–1722` — 812
lines**, with a 9-entry dependency array including `transactions`, `activeTab` and
`selectedPlatforms`. §P-9 (recompute on every filter toggle) is unchanged. `driverOperationalMetrics.ts`
extracted only the 49-line rate helpers.

Overview and Financials tabs are still inline. Target from §7.3 was a ~200-line shell.

#### V-4 · U-3 / U-4 — down from three period concepts to two

`weekBounds` no longer uses `new Date()` — it anchors to the Financials period end
(`FinancialSubTabs.tsx:97–103`), which closes the third window. Two remain: `dateRange` (Overview,
InDrive, **and Service Quality**) and `period` (Financials, Cash Wallet).

Service Quality still reads `dateRange`-scoped `metrics` while `showOverviewDateControls` hides the
calendar on that tab — the original U-4 defect, unchanged.

#### V-5 · P-4 / P-8 — improved but not resolved

- `useDriverTollLogs.ts:20` now de-duplicates ids before fanning out, but it is still
  `Promise.all(ids.map(...))` — one HTTP request per id.
- `ContentVisibilityList.tsx` was created and is a sound approach, but it has **exactly one call
  site** (`DriverServiceQualityTab.tsx:183`). The tables that actually get long — Payments Log,
  Expenses, Settlement, Payout — still render every row.

---

### 🔴 Confirmed STILL OPEN (6)

| ID | Status |
|---|---|
| **C-6** | **Not fixed, and now more prominent.** `api.repairDriverLedger` (`api.ts:5512`) still POSTs to `/ledger/repair-driver`, which still returns **410** (`index.tsx:5562`). The redesigned integrity banner wires "Repair Now" to it at `DriverDetail.tsx:2502`. `POST /ledger/canonical-backfill` exists at `index.tsx:6833` — repoint the client at it (note it requires `data.backfill`) or remove the button. |
| **A-3** | **Not fixed — and now harder to unwind.** React Query data is still copied into `useState` (`DriverDetail.tsx:702`), and there are now **8 additional `setTransactions(prev => …)` optimistic mutations** (`:728, 732, 747, 761, 779, 789, 800, 811`) writing to that local copy. Migrating to `useMutation` + `setQueryData` gets more expensive with each one added. |
| **P-1** | **Not fixed — and now called twice.** `driver-overview` still does a lifetime `fetchAllLedgerEventValuesForDrivers` with no `from`/`to` (`index.tsx:4740`). The C-2 fix added a *second* call of it on the Financials tab, so opening Financials now triggers two full-lifetime ledger scans per driver. |
| **P-2** | Unchanged: `fetchCanonicalFareEarningAll` still pulls up to 100k org-wide fare rows with in-JS aggregation (`index.tsx:17562`), and the new roster reuses the same pattern. |
| **P-3** | Unchanged: `getAllTransactionsForDrivers(ids, 5000, 50000)` (`api.ts:1026`). |
| **A-7 / A-8** | `_fleet-server/index.tsx` is **18,721 lines** (grew by 10 — the 6 new modules were correctly split out, the monolith was not). `App.tsx` still has **zero** `React.lazy`; the only code splitting in the app is the 3 driver tab chunks. |

Also unchanged from §5/§6: **U-5** (14 hardcoded `platformStats.Uber` / `.InDrive` references in
`DriverServiceQualityTab.tsx`), **U-6** (per-platform rating still falls back to
`metrics.currentRating` labelled as that platform's), **U-11** (0 `useVocab` calls in
`DriverDetail`), **U-14** (`AddDriverModal` untouched at 1,045 lines, still collects a password),
**U-15** (CSV export still string-concatenated, `DriversPage.tsx:498`, no injection guard, no
`transactions.export` check), **A-5** (still four aggregation engines — the roster replaced the
list's, it did not consolidate the others).

---

### 🆕 New issues introduced by the remediation (4)

#### N-1 · 41 unused imports left behind by the tab extraction — *do this first, it's free*

`DriverDetail.tsx` still imports what moved out. Verified by direct reference count (1 = import
only):

```
Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
Input, Separator, AvatarImage, DriverEarningsHistory, DriverExpensesHistory,
formatJMD, calculateAverageEnroute, DriverDetailTab, DriverMetrics,
+ 20 lucide icons (Download, MessageSquare, Shield, Landmark, Eye, Upload,
  FileText, Trash2, Pencil, Plus, ThumbsUp, ThumbsDown, Clock, DollarSign,
  RefreshCw, ChevronRight, MoreHorizontal, MapPin, Share2, TrendingUp)
```

This matters beyond tidiness: `DriverDetail` still pulls the whole `Card` and `Table` module graph
into the eager chunk, partially cancelling the benefit of the lazy tab split. And **`formatJMD` is
imported and never called** — the money-formatter fix was started and abandoned in this file.

#### N-2 · Four new server modules are built but never reached

| Module | Server | Client method | UI call sites |
|---|---|---|---|
| `drivers_compliance.ts` (202 lines) | registered | `api.getDriverCompliance` | **0** — the Profile tab builds documents client-side instead |
| `drivers_reconciliation.ts` (64 lines) | registered | `api.getDriverReconciliation` | **0** — `FinancialSubTabs` still computes SSOT client-side |
| `drivers_audit.ts` (62 lines) | registered | `api.getDriverAudit` | **0** — and `appendDriverAuditEvent` is **never called from anywhere**, so the audit log is permanently empty |
| `driver_operational_periods.ts` (85 lines) | **never imported or registered** | — | **0** — orphan file |

The `GET /drivers/:id/reconciliation` endpoint in particular is the clean fix for C-2 that §7.2
recommended; the client-side workaround was shipped instead and the endpoint left dark. The audit
trail is the Phase-6 capability the roadmap called out, and its write path was never connected.

**Decide per module:** wire it, or delete it. Registered-but-unreachable routes are attack surface
and future confusion.

#### N-3 · `drivers/roster` reads full trip payloads

`drivers_roster.ts:196` — the comment says *"only keeps driverId/status/date in memory"*, but the
query is `fromKvStore().select("value").like("key", "trip:%")`, paging 100 × 1,000 rows. It
transfers the **entire trip JSON** for up to 100,000 trips on every Drivers page load, then reads
three fields. Select only the needed keys, or better, aggregate in SQL.

Correctness is now right (that was the point of C-1) — this is the cost side of it.

#### N-4 · The new tests and guardrail are thinner than they look

- **0 component tests** in `components/drivers/` — unchanged. The 3 extracted tabs are exactly the
  units that are now testable, and none has a test.
- `e2e/driver-detail-smoke.spec.ts` is named for driver detail but only asserts that the **Drivers
  list** renders after sign-in. It never opens a driver, and it `test.skip`s entirely without
  `E2E_FLEET_EMAIL` / `E2E_FLEET_PASSWORD`, so in most CI runs it asserts nothing.
- `check-driver-section.mjs` only greps for `{false &&`. The §7.4 guardrails that would have caught
  N-1 and the remaining U-8 debt (component line budget, no unused imports, no `` `$${ ``) are not
  implemented. Money formatting in the section is still **31 hand-rolled `` `$${ `` + 43
  `toLocaleString`** against 6 files using `formatJMD`.

---

### Recommended next slice (roughly one day, ordered)

1. **N-1** — strip the 41 unused imports. Pure deletion, shrinks the eager chunk.
2. **C-6** — repoint `repairDriverLedger` at `/ledger/canonical-backfill` or remove the button.
   It is currently a guaranteed error toast on the most safety-critical banner in the section.
3. **V-1** — fix the fuel-economy lookup (type + per-driver vehicle). It reads as fixed and is not.
4. **V-2 / V-4** — render the period picker on Cash Wallet and Service Quality. `DriverPeriodContext`
   already exists; this is wiring, not design.
5. **N-2** — wire or delete the four dark server modules. Wiring
   `GET /drivers/:id/reconciliation` also retires the duplicate `driver-overview` call from P-1.
6. **U-6** — stop labelling the overall rating as a per-platform rating.

Then the next substantial block is **V-3** (extract the 812-line `metrics` memo) and **A-3**
(retire the `useState` mirror), in that order — the memo extraction makes the mutation migration
tractable.

---

## 1. What the Section Actually Is

### 1.1 Entry points

```
App.tsx  (currentPage state — no react-router)
 ├─ 'drivers'          → DriversPage           → DriverDetail (conditional render, not a route)
 ├─ 'driver-analytics' → DriverAnalytics       (separate fleet-wide leaderboard page)
 └─ 'driver-settlements' / 'driver-payouts' → DriverSettlementsPage (fleet-financials — 4th driver surface)
```

### 1.2 Driver Detail tab tree

```
DriverDetail
 ├─ Overview        → OverviewMetricsGrid, DistanceByPlatform, charts     [dateRange]
 ├─ Financials      → FinancialSubTabs                                    [financialDateRange]
 │    ├─ Earnings        → platform donut + DriverEarningsHistory
 │    ├─ Expenses        → DriverExpensesHistory
 │    ├─ Settlement      → SettlementSummaryView → SettlementPeriodDetail
 │    ├─ Payout          → DriverPayoutHistory   → PayoutPeriodDetail
 │    └─ Reconciliation  → toll disposition cards + Uber SSOT-vs-Ledger
 ├─ Service Quality → MetricCard grid (partly hardcoded)                  [dateRange, control hidden]
 ├─ Cash Wallet     → WeeklySettlementView / Payments Log                 [financialDateRange, control hidden]
 ├─ InDrive Wallet  → DriverIndriveWalletTab                              [dateRange]
 └─ Profile         → Documents (MOCK) + Personal Info (read-only)
```

### 1.3 Data sources feeding one driver

| Source | Route / hook | Called from |
|---|---|---|
| All trips for driver | `api.getTripsFiltered` paginated to 10k | `DriverDetail.tsx:452` |
| Canonical ledger overview | `GET /ledger/driver-overview` | `DriverDetail.tsx:1250` |
| Ledger summary | `GET /ledger/summary` | `DriverDetail.tsx:493` — **result never read** |
| Transactions | `api.getAllTransactionsForDrivers` (≤50k rows) | `useDriverTransactions` |
| Toll logs | `api.getTollLogs` × N ids | `useDriverTollLogs` — client-side N+1 |
| Claims | `api.getClaims()` — **whole fleet** | `useFleetClaims` |
| Vehicles / finalized reports / dispute refunds / toll settings | 4 queries | `useDriverFinancialBundle` |
| Weekly periods | `useDriverFinancialPeriods` | Financials sub-tabs |
| Toll disposition | `api.getDriverTollCharges` | `FinancialSubTabs.tsx:127` |
| Earnings history | `GET /ledger/driver-earnings-history` | `DriverEarningsHistory` |
| Resolved earnings policy | `loadResolvedEarningsBundleForDriverWeek` | `DriverDetail.tsx:748` |

**That is 13+ distinct data acquisitions for one driver page**, using three different paradigms
(raw `useEffect`+`useState`, React Query, and prop-drilled bundles) with no shared cache key
convention and no request coordination.

---

## 2. 🔴 Critical Findings

### C-1 — The Drivers list is computed from a 200-trip fleet-wide sample

`components/drivers/DriversPage.tsx:213`

```ts
queryKey: ['trips', 200, scope],
queryFn: () => api.getTrips({ limit: 200 }),
```

Those 200 trips are then aggregated (`DriversPage.tsx:355–508`) to produce, per driver:
`totalTrips`, `todaysTrips`, `vehicle`, `acceptanceRate` (fallback path), and `linkedTrips`.

**Consequences:**

- `totalTrips` on the list is not lifetime trips — it is "how many of the last 200 fleet trips were
  yours". For a fleet of 30 drivers this is ~6 trips each.
- `Trips (Today)` is wrong whenever the fleet does more than 200 trips since the newest trip in the
  page. A busy fleet will show **0 trips today** for most drivers.
- `Acceptance` falls back to completed/(completed+cancelled) over that same 200-row sample when no
  CSV metric exists — a statistically meaningless number that then drives the `Needs Attention`
  status flag (`DriversPage.tsx:580`) and the `At Risk` performance filter.
- **`linkedTrips` is passed straight into `DriverDetail` as the `trips` prop**
  (`DriversPage.tsx:761`), so the detail page's first paint is seeded with a handful of trips before
  its own fetch completes.

**Fix direction:** the list must not aggregate trips client-side at all. Add a server projection
(`GET /drivers/roster`) returning one pre-aggregated row per driver. See §7.

---

### C-2 — Reconciliation compares two different date windows and calls the delta a "mismatch"

`components/drivers/FinancialSubTabs.tsx:150–187` and `DriverDetail.tsx:3543–3545`

The "Uber Reconciliation (SSOT vs Ledger)" card puts two numbers side by side:

| Side | Window used |
|---|---|
| **SSOT** — summed from `allTrips` | `periodFrom`/`periodTo` = **`financialDateRange`** (default: last 12 pay weeks), then further widened by `startOfWeek`/`endOfWeek` |
| **Ledger** — `uberLedgerReconciliation` | Derived from `resolvedFinancials`, which is scoped to **`dateRange`** — the *Overview* header calendar (default: last 7 days) |

```ts
// DriverDetail.tsx:3543 — ledger side comes from the Overview range…
uberLedgerReconciliation={resolvedFinancials.uberLedgerReconciliation}
// …while the SSOT side comes from the Financials range
periodFrom={financialDateRange?.from}
```

The card then declares:

```ts
const deltaNet = uberSsotReconciliation.netEarnings - uberLedgerReconciliation.netEarnings;
label: Math.abs(deltaNet) <= 0.05 ? 'Reconciled' : `Mismatch (delta ${deltaNet.toFixed(2)})`
```

**This will report a mismatch essentially always**, because it is subtracting 7 days of ledger from
12 weeks of trips. An operator using this to chase a real Uber discrepancy is chasing noise.

Compounding it: the card's badge reads **"Overview period"** while its subtitle prints
`periodFrom`–`periodTo` (the *Financials* period). The label and the data disagree with each other
as well as with the other side of the card.

**Additional defect in the same memo:** `uberSsotReconciliation` silently expands whatever range the
user picked out to Monday–Sunday boundaries (`FinancialSubTabs.tsx:156–161`). A user selecting a
custom 3-day range gets 7 days of data with no indication.

---

### C-3 — Driver compliance (Documents tab) is mock data

`components/drivers/DriverDetail.tsx:312–318`, rendered at `4106–4165`

```ts
const MOCK_DOCUMENTS: DriverDocument[] = [
  { id: '1', name: 'Driver License (Front)', status: 'Verified', expiryDate: '2025-10-15',
    url: 'https://images.unsplash.com/photo-1633535928821-...' },
  { id: '5', name: 'Proof of Address (Water Bill)', status: 'Verified', expiryDate: '2024-03-20', ... },
  { id: '4', name: 'Background Check Certificate', status: 'Pending', expiryDate: '2024-06-15', ... },
];
```

- Expiry dates are **hardcoded and already in the past** (2024/2025 vs today 2026). The table styles
  them red (`4148`) so every driver appears to have expired documents.
- Status is set to `'Verified'` unconditionally whenever a URL exists (`1203`, `1213`, `1226`) —
  there is no verification workflow, no reviewer, no audit trail.
- When no real URL exists, the row still renders — showing an **Unsplash stock photo of someone
  else's driving licence** as this driver's document, openable full-screen in the viewer modal
  (`4249`).
- The `Upload Document` button (`4115`) has **no `onClick`** — it does nothing.

**Worse: the real data already exists and is thrown away.** `AddDriverModal.tsx` captures
`licenseNumber` (TRN), `licenseExpiry`, `licenseClass`, `licenseToDrive`, `controlNumber`,
`originalIssueDate`, `dob`, `sex`, `collectorate`, `nationality` at onboarding
(`AddDriverModal.tsx:163–171`). None of those fields are referenced anywhere in `DriverDetail.tsx`
or `DriversPage.tsx`. The driver's own portal (`driver-portal/DriverProfile.tsx`) does show
`licenseExpiry` — the fleet manager, who actually needs it, does not.

---

### C-4 — Fabricated metrics presented as measured facts

| Line | Rendered as | Reality |
|---|---|---|
| `DriverDetail.tsx:2834` | `Vehicle: 2019 Toyota Sienta (5179KZ)` | Hardcoded string. Every driver in the fleet shows this vehicle. |
| `DriverDetail.tsx:2835` | `Member Since: Oct 12, 2023` | Hardcoded string. |
| `DriverDetail.tsx:2855` | `Current Rating  5.0 ★` | Hardcoded literal in the header (the Service Quality tab computes a real one — they disagree). |
| `DriverDetail.tsx:4026–4030` | `Safety Score 98/100 — "Based on harsh braking events"` | Hardcoded. No telemetry pipeline exists. The subtext actively asserts a data source that isn't there. |

The screenshot supplied with this audit shows all four of these rendering as if they were live data.

---

### C-5 — Fleet-wide fuel economy hardcoded to one vehicle model, inside a UI memo

`components/drivers/DriverDetail.tsx:1784`

```ts
const FUEL_EFFICIENCY_KMPL = 12; // Toyota Sienta Hybrid Average

const fuelRideShare  = (recOnTripDist + recEnrouteDist) / FUEL_EFFICIENCY_KMPL;
const fuelCompanyOps = recOpenDist / FUEL_EFFICIENCY_KMPL;
const fuelPersonal   = recUnavailableDist / FUEL_EFFICIENCY_KMPL;
```

Every driver's fuel split — rideshare vs company-ops vs personal — is computed by assuming their
vehicle is a Toyota Sienta doing 12 km/L. `types/vehicleCatalog.ts:59` already defines
`fuel_economy_km_per_l: number | null` per vehicle, and there is an entire `packages/fuel-core`.
Neither is consulted.

The same memo carries three more unsourced business constants:

```ts
const GAP_THRESHOLD_MINS = 45;           // DriverDetail.tsx:1674
const MIN_UNAVAILABLE_BLOCK_HOURS = 4;   // :1676
const AVG_OPEN_SPEED = 20;               // :1677 — km/h "cruising for fares"
```

These are fleet policy parameters driving displayed numbers, buried in a `useMemo` in a React
component, unconfigurable and untestable.

---

### C-6 — "Repair Now" calls a retired endpoint that returns HTTP 410

`services/api.ts:5375` → `POST /ledger/repair-driver`
Server: `supabase/functions/_fleet-server/index.tsx:5551`

```ts
// ─── POST /ledger/repair-driver — RETIRED: Use POST /ledger/canonical-backfill instead ──────
app.post("/make-server-37f42386/ledger/repair-driver", requireAuth(), async (c) => {
    return c.json({ error: "This endpoint is retired. ..." }, 410);
});
```

`handleRepairLedger` (`DriverDetail.tsx:2596`) is still wired to the **"Repair Now"** button in the
amber *Ledger Integrity Gap Detected* banner. When an operator sees the integrity warning and clicks
the remediation button, they get `Ledger repair failed: This endpoint is retired.`

The auto-repair path is also broken but silently: `DriverDetail.tsx:2517–2529` still evaluates the
whole condition on every render and then does nothing —

```ts
// DISABLED: Auto-repair was firing on every date change. Use manual button instead.
// handleRepairLedger();
```

So the banner advertises a self-healing capability that no longer exists in either form.

---

### C-7 — Cash Wallet totals are governed by an invisible date filter on another tab

`DriverDetail.tsx:2411–2422` and `3554–3612`

```ts
const { periodData: walletPayoutPeriodRows, cashWeeks: walletCashWeeks } = useDriverPayoutPeriodRows({
  ...
  startDate: financialDateRangeStrings?.startDate,   // ← Financials tab's picker
  endDate:   financialDateRangeStrings?.endDate,
});
```

`walletCashWeeks` feeds `walletCollectionTotals`, which renders the Cash Wallet tab's four headline
cards: **Driver owes**, **Fleet owes**, **Cash logged**, **Awaiting bank clear**.

But `showOverviewDateControls` (`DriverDetail.tsx:389`) hides every date control on the Cash Wallet
tab. So:

- Changing the Financials period silently changes what "Driver owes" says on the Cash Wallet tab.
- There is no label anywhere on the Cash Wallet tab stating which weeks are included.
- The card subtitle says "open weeks" — implying *all* open weeks — when it is actually "open weeks
  inside a range you set on a different tab and cannot see from here".

For a collections desk that reads these numbers to a driver over the phone, this is a
money-correctness bug, not a cosmetic one.

Compounding: the fourth card, `Awaiting bank clear`, is sourced from `metrics.pendingClearance`
(the trip/transaction memo) while the other three come from `walletCollectionTotals` — two different
pipelines in one KPI row.

---

### C-8 — No permission gating anywhere inside Driver Detail

`grep -c "usePermissions\|can(" DriverDetail.tsx` → **0**

The RBAC catalog already defines `drivers.edit`, `drivers.delete`, `transactions.edit`,
`transactions.approve`, `transactions.export`, `transactions.view`
(`packages/auth-client`). `DriversPage.tsx:178` uses `can('drivers.create')`. `DriverIndriveWalletTab`
uses `can(...)`. **`DriverDetail` uses none.**

Every money-mutating control is therefore visible to anyone who can open a driver:

- Log Cash Payment (`LogCashPaymentModal`)
- Cash Write-Off (`CashWriteOffModal`) — writes off money owed to the fleet
- Record Payout (`RecordPayoutModal`)
- Delete Transaction (`AlertDialog` at `4348`)
- Repair Ledger / diagnostics

The server does gate deletes (`requireDeleteTransactionPermission`, `index.tsx:4040`) — but
`POST /transactions` (`index.tsx:3457`) is only `requireAuth({ requireOrg: true })` with **no
permission check at all**. A viewer-level user can create a cash-collection or write-off transaction.

Also in this category: the Personal Info tab renders the driver's **full bank account number in
plaintext** (`DriverDetail.tsx:4224`) with no masking and no permission gate.

---

## 3. 🟠 High Findings — Architecture

### A-1 — `DriverDetail` is a God component

4,453 lines; the component function itself is ~4,050 lines with 35 `useState`, 26 `useMemo`,
9 `useEffect`. It owns:

- routing (tab state), data fetching (2 raw effects + 6 hooks), pagination,
- the entire financial resolution engine (`resolvedFinancials`, 260 lines),
- the entire operational metrics engine (`metrics`, **830 lines** in one `useMemo`),
- business constants (§C-5), toll classification, transaction grouping,
- 6 tabs of presentation, 5 modals, 2 dialogs.

Every state change in any of those concerns re-renders all of them. The `metrics` memo alone
iterates the full trip set with a 24-bucket hour histogram and a per-day chart map.

**This is the root cause of most other findings in this document.** Nothing in it can be tested,
reused, or reasoned about in isolation.

### A-2 — Three competing data-fetching paradigms

| Paradigm | Example | Problem |
|---|---|---|
| Raw `useEffect` + `useState` | `DriverDetail.tsx:452` (trips), `:493` (summary), `:1250` (overview); `FinancialSubTabs.tsx:116` (toll charges); `DriverEarningsHistory.tsx:80–86` (7 state vars for one fetch) | No cache, no dedup, no retry, no abort, refetches on every mount |
| React Query | `useDriverTransactions`, `useDriverTollLogs`, `useFleetClaims`, `useDriverFinancialBundle` | Correct, but keys are ad-hoc strings |
| Prop-drilled bundle | `financialBundle` passed 4 levels deep | Couples components to a fetch shape |

### A-3 — React Query results copied into `useState` (double source of truth)

`DriverDetail.tsx:803–812`

```ts
React.useEffect(() => {
  if (!moneyTabActive) return;
  if (rqTxLoading || rqTollLogsLoading) return;
  setTransactions(serverMergedTransactions);   // ← RQ data → local state
}, [moneyTabActive, serverMergedTransactions, rqTxLoading, rqTollLogsLoading]);
```

This adds a full extra render pass, creates a window where `transactions` is stale relative to the
cache, and means every consumer downstream (`walletMetrics`, `paymentTransactions`,
`useDriverPayoutPeriodRows`, `FinancialSubTabs`) reads the *copy*, not the cache. Invalidating the
query does not update the UI until the effect runs.

### A-4 — `refreshData` double-fires every request

`DriverDetail.tsx:817–828` calls `invalidateQueries` **and** `refetch()` for all three queries in the
same `Promise.all`. Each user-triggered refresh issues 6 network calls where 3 are needed.

### A-5 — Four independent driver-aggregation implementations

| Implementation | Location | Feeds |
|---|---|---|
| List aggregation | `DriversPage.tsx:355–508` | Drivers table |
| Detail metrics | `DriverDetail.tsx:1287–2115` | Overview + Service Quality |
| Analytics aggregates | `utils/driverAnalyticsAggregates.ts` | Driver Analytics page |
| Settlement desk | `components/fleet-financials/DriverSettlementsPage.tsx` | Settlements page |

Four answers to "how many trips did this driver do" that will not agree. This is the same class of
problem recorded in `financial-integrity-audit.md` for money engines, now repeated for operational
metrics.

### A-6 — No routing for driver detail

`App.tsx:92` holds `currentPage` in `useState`; `pageRegistry.ts` maps *pages* to paths but has no
concept of a resource id. `DriversPage` conditionally renders `DriverDetail` (`DriversPage.tsx:758`).

- The URL stays `/drivers` while viewing a driver (visible in the supplied screenshot).
- No deep links. An ops manager cannot send "look at this driver's Aug 17 week" to a colleague.
- Browser Back exits the whole section instead of returning to the list.
- Tab and sub-tab state (`Financials > Expenses`) is not addressable and is lost on refresh.
- `driverIdForDetail` in `App.tsx` is only cleared on a few paths (`432`, `495`, `514`, `614`), so
  navigating away and back to Drivers can silently reopen the last driver.

### A-7 — 18,711-line edge function

`supabase/functions/_fleet-server/index.tsx` is a single file containing the entire fleet API,
including all driver, ledger, transaction, toll and fuel routes. Cold-start cost, review surface and
blast radius are all proportional to the whole file.

### A-8 — No code splitting; 6.1 MB single bundle

`build/assets/index-YW1Ld8VH.js` = **6,125,912 bytes**. `vite.config.ts` defines no `manualChunks`;
`App.tsx` contains zero `React.lazy` / `Suspense`. Every user downloads DriverDetail, recharts,
the fuel wizard, the Rush integration and everything else before first paint.

---

## 4. 🟠 High Findings — Performance & Scale

### P-1 — `driver-overview` fetches the driver's entire lifetime ledger on every date change

`_fleet-server/index.tsx:4729` → `fetchAllLedgerEventValuesForDrivers(allDriverIdsCanonExpanded, c)`
is called with **no `from`/`to`** (`index.tsx:5649–5677`, `maxRows` defaults to **50,000**), then the
period and previous-period slices are filtered **in memory**:

```ts
const lifetimeValsCanon = await fetchAllLedgerEventValuesForDrivers(allDriverIdsCanonExpanded, c);
const periodValsCanon = lifetimeValsCanon.filter(v => canonicalEventInSelectedWindow(v, startDate, endDate));
```

The client re-triggers this on every calendar change (`DriverDetail.tsx:1250`). Cost per interaction
is O(driver lifetime), not O(selected period).

Org scoping is also applied **after** the fetch (`filterByOrg(all, c)` at `:5676`) rather than in the
query — a performance cost and a defence-in-depth weakness.

### P-2 — `drivers-summary` pulls every fare row in the org, lifetime, per page load

`_fleet-server/index.tsx:17553` → `fetchCanonicalFareEarningAll(c)` (`:5680`) issues
`listAllUnifiedCanonicalEvents({ entryTypes: ["fare_earning"], maxRows: 100_000 })` and aggregates in
JavaScript.

- No SQL `GROUP BY`, no materialized view.
- At the 100k cap the result **silently truncates** — lifetime earnings quietly become wrong with no
  error and no flag on the response.
- This runs on every Drivers page mount.

### P-3 — Unbounded client-side transaction load

`services/api.ts:889` — `getAllTransactionsForDrivers(ids, pageSize = 5000, maxRows = 50000)` pages
until exhaustion. Up to **50,000 transaction rows per driver** are pulled into browser memory, then
scanned repeatedly by ~8 different memos (`dateFilteredTransactions`, `cashTollTransactions`,
`paymentTransactions`, `walletMetrics`, …).

### P-4 — Client-side N+1 on toll logs

`hooks/useDriverTollLogs.ts:26–34` issues one `api.getTollLogs({ driverId })` request **per id** —
Roam id + Uber uuid + InDrive uuid + lowercase variants — and merges client-side. Should be one
request with an id array (the transactions API already supports this).

### P-5 — Fleet-wide claims fetched for one driver

`hooks/useFleetClaims.ts:15` — `api.getClaims()` with no driver filter. Every claim in the fleet is
downloaded so that `DriverDetail.tsx:571–580` can build a `Map` and look up a handful.

### P-6 — Dead network request on every money-tab visit

`DriverDetail.tsx:493–509` fetches `api.getLedgerSummary({ driverId })` and stores it in
`ledgerSummary` / `ledgerSummaryLoaded`. **Neither variable is read anywhere in the 4,453-line
file.** Verified: `grep -n "ledgerSummary"` returns only the two declarations at `:439`/`:440`.

Same class: `useDriverFinancialBundle.ts:110` fires `api.getTollAutomationSettings()` and the result
is discarded — `unifiedToll` is hardcoded `true` at `:146`.

### P-7 — Trip fetch paginates to 10,000 rows on mount, ungated by tab

`DriverDetail.tsx:452–490` runs unconditionally on mount, looping 1,000-row pages up to a 10k cap,
before any tab is chosen. The money tabs are correctly lazy (`moneyTabActive`); this is not.

### P-8 — No virtualization

No `react-window` / virtualization anywhere in the section. Payments Log, Expenses, Settlement and
Payout tables all render every row into the DOM.

### P-9 — 830-line `metrics` memo recomputes on filter touch

`DriverDetail.tsx:1287–2115`, deps include `allTrips`, `dateRange`, `selectedPlatforms`, `timeFilter`,
`csvMetrics`, `activeTab`. Toggling a platform checkbox re-runs the full reconstruction algorithm
over every trip.

---

## 5. 🟡 Medium Findings — UI / UX

### U-1 — Duplicate status badges in the header

`DriverDetail.tsx:2818–2824`

```tsx
<Badge ...>{driver?.status === 'Inactive' ? 'TERMINATED' : driver?.status || 'Active'}</Badge>
<Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>   {/* hardcoded */}
```

The screenshot shows `ACTIVE` followed by `Active`. The second badge is a hardcoded literal that
will read "Active" even for a terminated driver, directly contradicting the badge beside it and the
red "Driver Terminated" banner below.

### U-2 — Header `Export` and `Message` buttons are inert

`DriverDetail.tsx:2796–2804` — neither has an `onClick`. Two prominent primary-styled buttons at the
top right of every driver page do nothing.

### U-3 — Three date-range concepts, two of them hidden

| Range | Owner | Visible on |
|---|---|---|
| `dateRange` | header calendar | Overview, InDrive Wallet |
| `financialDateRange` | Financials sub-tab picker | Financials only |
| `weekBounds` (`new Date()`) | `FinancialSubTabs.tsx:97` | not exposed |

Service Quality reads `dateRange` while its control is hidden; Cash Wallet reads
`financialDateRange` while its control is hidden (§C-7). The Reconciliation "This week" toggle uses
a *third* window pinned to the real current week (`FinancialSubTabs.tsx:97–103`) and completely
ignores the Financials period picker sitting directly above it in the same tab.

**Every tab in the section answers "what period is this?" differently, and three of them won't tell
you.**

### U-4 — Service Quality shows a period the user cannot see or change

`showOverviewDateControls` (`DriverDetail.tsx:389`) excludes `quality`. Cards say
`subtext="In selected period"` (`4001`) and `"In selected period"` (`4022`) with no visible selector.

### U-5 — Platform breakdowns hardcoded to Uber + InDrive

`DriverDetail.tsx:4004–4007`, `4041–4044`, `4054–4057` hardcode two platforms in every Service
Quality breakdown. Roam and any future platform are invisible on that tab, while the Overview donut
handles them generically.

### U-6 — Per-platform rating falls back to the overall rating

`DriverDetail.tsx:4005` — when `platformStats.Uber.ratingCount === 0`, it displays
`metrics.currentRating` **labelled as the Uber rating**. A driver with no Uber ratings shows a
fabricated Uber rating equal to their InDrive average.

### U-7 — "Recent Trip Issues" renders an empty card

`DriverDetail.tsx:4066–4077` — when cancelled trips > 0 the card body is:

```tsx
<p className="text-sm text-slate-500">Trips that were cancelled or had issues.</p>
{/* List cancelled trips here if needed */}
```

The only state that renders content is the *empty* state ("No cancelled trips. Great job!"). The
card is functional only when there is nothing to show.

### U-8 — Money formatted four different ways

`utils/formatJMD.ts` exists and its own docstring names this exact problem:

> *"Lived inside AnalyticsKpiGrid, which meant anything that was not a chart hand-rolled
> `$${n.toFixed(2)}` instead and rendered US-looking amounts for Jamaican dollars."*

Current state in the driver section:

| Style | Count |
|---|---|
| Hand-rolled `` `$${n.toFixed(2)}` `` | ~37 across 8 files |
| `n.toLocaleString(...)` with a manual `$` | 49 |
| `FuelCalculationService.formatCurrency` (with `.replace('$','')` hacks) | 10 in `FuelLedgerView` |
| `formatJMD` | **3 files** |

The Cash Wallet KPI cards (`DriverDetail.tsx:3563`, `3579`, `3592`, `3606`) render **no currency
symbol at all** — bare `1,234.00`.

### U-9 — Dark mode is partial

`DriverDetail.tsx` has 34 `dark:` variants against 28 bare `text-slate-900` and multiple hardcoded
`bg-white` (`3556`, `3572`, `3585`). The Cash Wallet card row is unreadable in dark mode.

### U-10 — Driver avatars call a third-party API with the driver id

`DriverDetail.tsx:2812`

```tsx
<AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driverId}`} />
```

Real driver UUIDs are sent to `api.dicebear.com` on every page view. This leaks an internal
identifier to an uncontrolled third party, breaks offline/PWA use, and means the app has no real
driver photo path even though `AddDriverModal` uploads licence images.

### U-11 — No i18n / vocabulary layer in Driver Detail

`DriversPage` uses `useVocab()` (`v('driversPageTitle')`). `DriverDetail` has **zero** vocab calls —
every label is a hardcoded English string, so white-labelling or terminology overrides stop at the
list page.

### U-12 — Accessibility

- `aria-label` count: `DriverDetail` **0**, `DriversPage` **0**.
- `role=` count: **0** in both.
- Clickable rows use `cursor-pointer` + `onClick` on non-interactive elements (7 occurrences across
  the financial views) — not keyboard reachable, no `role="button"`, no `tabIndex`.
- Charts (recharts) have no text alternative or data table fallback.
- Toll disposition / KPI colour coding (rose/emerald/amber) carries meaning with no non-colour cue.

### U-13 — Uncontrolled tabs; state duplicated

`DriverDetail.tsx:2862` — `<Tabs defaultValue="overview" onValueChange={setActiveTab}>`. The Tabs
primitive owns the real state; `activeTab` is a shadow copy used for gating fetches
(`moneyTabActive`). They can desync, and neither is URL-backed.
`FinancialSubTabs.tsx:190` has the same pattern with no `onValueChange` at all — the parent has no
idea which financial sub-tab is open, so it cannot lazy-load per sub-tab.

### U-14 — `Add Driver` is a 1,045-line modal with 30+ `useState`

`AddDriverModal.tsx:143–194` — a 3-step onboarding wizard (licence scan → details → proof of address)
with no form library, no schema validation, and no draft persistence. Closing it loses everything.
It also collects a **password** for the driver (`:158`), meaning admins set driver credentials
directly rather than issuing an invite (the invite path exists — `WorkforceInvitePanel` is on the
same page).

### U-15 — Export is a naive CSV builder

`DriversPage.tsx:687–712` builds CSV by string concatenation with only `"${d.name}"` quoted. Any
comma in `vehicle`, `email` or `phone` corrupts the file; no CSV injection guard on
`=`/`+`/`-`/`@`-prefixed values; exports only the current filter, not the full roster; no permission
check against `transactions.export`.

### U-16 — Loading states are all-or-nothing

`DriverDetail.tsx:2670` blocks the entire page behind
*"Restoring rich performance dashboard…"* until `serverTripsLoaded`. There are no skeletons, no
progressive reveal, and the copy is developer-facing.

### U-17 — Server-error paths degrade silently

`DriversPage.tsx:280–290` catches ledger failures and returns `{}`, so earnings render as **$0.00**
with only a `console.error`. The user sees a working page full of zeros. The `drivers` query does
surface a toast (`:239`) — the pattern is inconsistent.

---

## 6. 🔵 Dead Code & Redundancy Inventory

### D-1 — ~1,300 dead lines in `DriverDetail.tsx` (29% of the file)

**Unreachable JSX — `{false && ...}` blocks:**

| Lines | Content | Size |
|---|---|---|
| `2941–2972` | "Recalculate Ledger" button + result | ~32 |
| `2974–3053` | "Repair Ledger" + Cash Diagnostic panel (with 3 nested `{false &&}`) | ~80 |
| `3054–3528` | An entire duplicate Overview metric grid superseded by `OverviewMetricsGrid` | **~475** |
| `2612–2623` | `if (false && dateRange?.from)` — dead refetch branch | ~12 |
| `2965–2972` | A commented-out block described in-source as `DEAD CODE` | ~8 |

**Computed but never consumed:**

| Symbol | Line | Notes |
|---|---|---|
| `groupedTollTransactions` | `832` | ~365-line memo. **Never referenced.** |
| `cashTollTransactions` | `570` | Only consumed by the dead memo above |
| `dateFilteredTransactions` | `542` | Only consumed by `cashTollTransactions` |
| `walletMetrics` | `2381` | 4 references = 1 declaration + 3 comments. **Never rendered.** Scans all trips and all transactions. |
| `ledgerSummary`, `ledgerSummaryLoaded` | `439`, `440` | Set by a live network call; never read (§P-6) |
| `expandedRows`, `showHidden`, `processingIds` | `360`, `741`, `742` | State supporting the dead toll-grouping UI |
| Toll retry-charge handler | `~1100–1195` | Reachable only from dead JSX |

**Duplicated implementations:**

- `MetricCard` — defined locally at `DriverDetail.tsx:4383` **and** imported from
  `OverviewMetricsGrid.tsx:155` as `ExtractedMetricCard`. The import is unused; the local copy is
  what renders.
- `PLATFORM_COLORS` / `getPlatformColor` — defined at `DriverDetail.tsx:212/224` **and** at
  `OverviewMetricsGrid.tsx:36/45`; both imported as `EXTRACTED_*` and unused.

**Verified-unused imports:**

| File | Unused |
|---|---|
| `DriverDetail.tsx` | `Area`, `AreaChart`, `Line`, `LineChart`, `RechartsLabel`, `CardFooter`, `MapPin`, `Share2`, `ThumbsDown`, `TrendingUp`, `CornerDownRight`, `DriverEarningsHistory`, `calculateAverageEnroute`, `ExtractedMetricCard`, `EXTRACTED_PLATFORM_COLORS`, `extractedGetPlatformColor` |
| `DriversPage.tsx` | `Car`, `DollarSign`, `DropdownMenuLabel`, `Filter`, `Mail`, `TierConfig`, `TrendingUp`, `projectId` |
| `OverviewMetricsGrid.tsx` | `ChevronDown`, `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` |
| `DriverPayoutHistory.tsx` | `Info`, `Tooltip*` (4), `FuelEntry` |

### D-2 — Legacy tier fallback contradicts the policy engine

`DriversPage.tsx:571–576` still contains a hardcoded USD-shaped tier ladder
(`>5000 Platinum`, `>3000 Gold`, `>1000 Silver`) as a third fallback behind the real
`TierCalculations` + earnings-policy engine. It uses **lifetime** earnings where the real engine uses
**monthly** — so when it fires, it fires wrong.

### D-3 — Orphan / near-orphan components

| Component | Lines | Reachability |
|---|---|---|
| `FuelLedgerView.tsx` | 1,201 | Only via `FuelWalletView`, which is only in `driver-portal/DriverEarnings` — not reachable from Driver Operations at all |
| `FuelWalletView.tsx` | 510 | Same |
| `TransactionLedgerView.tsx` | 84 | Driver portal only |
| `DriverScorecard.tsx` | 118 | Only `ImportsPage` |

~1,900 lines sitting in `components/drivers/` that the fleet driver section never renders.

### D-4 — Console logging in production

9 `console.log` calls in `DriverDetail.tsx` alone (`:500`, `:2163`, `:2295`, `:2606`, `:2609`, …),
several emitting driver ids and financial totals to the browser console.

---

## 7. Proposed Target Architecture

### 7.1 The core principle

> **The client should not compute driver financials or driver operational metrics. It should render
> a projection.**

That principle is already half-implemented on the server and should be finished rather than
reinvented: `ledger.driver_financial_periods` exists
(`supabase/migrations/20260717140000_driver_financial_ledger_rebuild.sql:120`) and
`GET /ledger/driver-overview` already overlays from it — but **only for single-week ranges** and only
behind `FIN_READ_PROJECTION_OVERVIEW` (`_fleet-server/index.tsx:4759`).

### 7.2 Server: three read models

```
ledger.driver_financial_periods       (exists — weekly money projection, extend to all ranges)
ledger.driver_operational_periods     (NEW  — trips, distance, duration, ratings, accept/cancel)
ledger.driver_roster                  (NEW  — one row per driver for the list page)
```

**New/changed endpoints:**

| Endpoint | Replaces | Notes |
|---|---|---|
| `GET /drivers/roster` | `DriversPage` trip aggregation + `ledger/drivers-summary` | One pre-aggregated row per driver; server-side search / filter / sort / paginate. Kills §C-1 and §P-2. |
| `GET /drivers/:id/periods?from&to&grain=week` | `driver-overview` + `driver-earnings-history` + `getDriverTollCharges` | Range-scoped SQL, never lifetime scans. Kills §P-1. |
| `GET /drivers/:id/compliance` | `MOCK_DOCUMENTS` | Real documents, expiry, verification state, reviewer. Kills §C-3. |
| `GET /drivers/:id/reconciliation?from&to` | client-side `uberSsotReconciliation` | **One** window, computed server-side, so SSOT and ledger can never diverge. Kills §C-2. |

**Also:** split `_fleet-server/index.tsx` (18,711 lines) by domain — `drivers.ts`, `ledger.ts`,
`transactions.ts`, `tolls.ts`, `fuel.ts` — behind a thin router.

### 7.3 Client: decompose `DriverDetail`

```
routes/drivers/
  DriversListRoute.tsx            → /drivers                          (roster query only)
  DriverDetailRoute.tsx           → /drivers/:driverId/:tab?          (shell: header + tab nav)
    tabs/
      OverviewTab.tsx             → useDriverOverview(id, range)
      FinancialsTab.tsx           → useDriverFinancials(id, range)   (lazy)
      ServiceQualityTab.tsx       → useDriverQuality(id, range)      (lazy)
      CashWalletTab.tsx           → useDriverWallet(id, range)       (lazy)
      ComplianceTab.tsx           → useDriverCompliance(id)          (lazy)  ← replaces Profile/Documents
      ProfileTab.tsx              → useDriverProfile(id)             (lazy)
  context/DriverPeriodContext.tsx → ONE range, URL-synced, shown on every tab
```

Rules to enforce:

1. **One period per driver page**, held in `DriverPeriodContext` and reflected in the URL
   (`?from=&to=`). Every tab reads it; every tab displays it. Deletes §C-2, §C-7, §U-3, §U-4.
2. **No `useState` copies of server data.** React Query is the only cache. Deletes §A-3, §A-4.
3. **No business constants in components.** `FUEL_EFFICIENCY_KMPL`, `GAP_THRESHOLD_MINS`,
   `AVG_OPEN_SPEED`, `MIN_UNAVAILABLE_BLOCK_HOURS` move to `packages/business-config` and become
   per-vehicle / per-fleet values. Deletes §C-5.
4. **One money formatter.** `formatJMD` everywhere; add an ESLint rule banning `` `$${ `` in
   `components/`. Deletes §U-8.
5. **Every mutating control wrapped in a permission gate**, mirrored by a server-side
   `requirePermission`. Deletes §C-8.
6. **Route-level `React.lazy`** for every tab and every page. Addresses §A-8.

### 7.4 Component budget

Enforce in CI: no component file over 400 lines; no `useMemo` over 60 lines; no component with more
than 10 `useState`. Every one of the current top-6 driver files violates all three.

---

## 8. Phased Remediation Roadmap

Ordered so each phase is independently shippable and each one makes the next cheaper.

### Phase 0 — Stop showing false data (≈2 days, no architecture change)

The cheapest, highest-trust-recovery work. All of it is deletion or a null-guard.

| # | Action | Ref |
|---|---|---|
| 0.1 | Delete the hardcoded Vehicle / Member Since / Rating 5.0 header lines; render real values or `—` | C-4 |
| 0.2 | Delete the `Safety Score 98/100` card | C-4 |
| 0.3 | Remove the duplicate hardcoded `Active` badge | U-1 |
| 0.4 | Hide or wire the `Export` and `Message` header buttons | U-2 |
| 0.5 | Replace `MOCK_DOCUMENTS` with a real-documents-only list + empty state; remove Unsplash URLs | C-3 |
| 0.6 | Hide the "Repair Now" button (endpoint is 410) or point it at `POST /ledger/canonical-backfill` | C-6 |
| 0.7 | Fix the empty "Recent Trip Issues" card — render the cancelled trips or drop the card | U-7 |
| 0.8 | Label the Cash Wallet KPI row with its actual period, or move the period picker onto that tab | C-7 |

### Phase 1 — Delete dead code (≈2 days)

Do this *before* refactoring so the refactor is 29% smaller.

- Remove all `{false && …}` blocks (~600 lines) — §D-1.
- Remove `groupedTollTransactions` → `cashTollTransactions` → `dateFilteredTransactions` chain and
  their supporting state/handlers (~650 lines).
- Remove `walletMetrics`, `ledgerSummary` + its fetch effect, the discarded
  `tollAutomationSettings` query.
- Remove duplicated `MetricCard` / `PLATFORM_COLORS`; keep the `OverviewMetricsGrid` versions.
- Strip the 30+ verified-unused imports.
- Delete the legacy USD tier ladder in `DriversPage.tsx:571`.
- Decide on `FuelLedgerView` / `FuelWalletView` / `TransactionLedgerView` / `DriverScorecard`
  (~1,900 lines) — move to `driver-portal/` or delete.

**Expected result:** `DriverDetail.tsx` from 4,453 → ~3,100 lines with zero behaviour change.

### Phase 2 — Fix the correctness bugs (≈1 week)

- **2.1** `GET /drivers/roster` endpoint + rewrite `DriversPage` to consume it. Removes the 200-trip
  aggregation entirely. (C-1)
- **2.2** Unify the reconciliation window: pass one `{from,to}` to both sides, or move the whole
  comparison server-side. Fix the "Overview period" badge. Stop the silent week-boundary widening.
  (C-2)
- **2.3** Wire the Reconciliation "This week" toggle to the Financials period picker instead of
  `new Date()`. (U-3)
- **2.4** Move `FUEL_EFFICIENCY_KMPL` and friends to config; read `fuel_economy_km_per_l` per
  vehicle. (C-5)
- **2.5** Add `PermissionGate` to every mutating control in `DriverDetail`; add
  `requirePermission('transactions.edit')` to `POST /transactions`. Mask the bank account number
  behind `drivers.edit`. (C-8)

### Phase 3 — Routing & URL state (≈3 days)

- Adopt real routes: `/drivers`, `/drivers/:driverId`, `/drivers/:driverId/:tab`.
- Sync period + filters to query params.
- Make both `Tabs` controlled; lift sub-tab state so lazy-loading per sub-tab becomes possible.
- Fix the `driverIdForDetail` lifecycle. (A-6)

### Phase 4 — Decompose `DriverDetail` (≈2–3 weeks)

Extract tab-by-tab, in this order (lowest coupling first): Profile → Compliance → Service Quality →
Cash Wallet → Financials → Overview. Introduce `DriverPeriodContext`. Extract the `metrics` memo
into `utils/driverOperationalMetrics.ts` **with tests**, then move it server-side in Phase 5.

Target: `DriverDetail.tsx` becomes a ~200-line shell.

### Phase 5 — Server read models & scale (≈2–3 weeks)

- `driver_operational_periods` projection; retire the client `metrics` engine.
- Range-scope `fetchAllLedgerEventValuesForDrivers` (pass `from`/`to`). (P-1)
- Replace `fetchCanonicalFareEarningAll` with a SQL aggregate. (P-2)
- Server-side pagination for transactions; batch the toll-log N+1; driver-scope the claims query.
  (P-3, P-4, P-5)
- Split `_fleet-server/index.tsx` by domain. (A-7)

### Phase 6 — Enterprise capability gaps (≈2–3 weeks)

These are absent, not broken — but they are what "enterprise" means for a driver module:

| Capability | Current state |
|---|---|
| **Compliance & document lifecycle** | Mock. Needs: real doc store, expiry tracking, renewal reminders, verification workflow with reviewer + timestamp, blocking rules (expired licence → cannot be dispatched). |
| **Audit trail** | None. Every write-off, payout, and transaction delete should be an append-only audited event with actor, reason, and before/after. Currently a write-off is a row edit with no trace. |
| **Driver lifecycle** | Only `Active`/`Inactive`/`Needs Attention`. No onboarding pipeline, suspension with reason, reinstatement, or offboarding checklist (`AddDriverModal` collects onboarding data that is never surfaced again). |
| **Notes / case management** | `Message` button is inert. No note history, no follow-up, no assignment. A collections desk needs "called Aug 24, promised Friday". |
| **Bulk operations** | List has no multi-select. No bulk status change, bulk export, bulk message. |
| **Saved views** | Filters reset on every navigation. No saved segments ("At-risk drivers", "Owes > $10k"). |
| **Real-time** | Everything is `refetchOnWindowFocus: false` with 2–5 min staleness. No live status. |
| **Accessibility** | 0 `aria-label`, 0 `role`. Not usable by keyboard or screen reader. |
| **Observability** | `console.log`. No structured events for "operator viewed driver financials" / "operator wrote off $X". |

### Phase 7 — Test & guardrails (ongoing, start in Phase 1)

Current state: **0 component tests** for the driver section. The util layer is well covered
(~35 test files) — extend that discipline upward.

- Component tests per extracted tab (RTL) — added as each tab is extracted in Phase 4.
- Golden tests for `driverOperationalMetrics` against fixture trip sets (the `kennyWeekSettlement.golden.test.ts`
  pattern already in the repo is the right model).
- Playwright specs for the driver detail journey (only `driver-settlements-desk.spec.ts` exists today).
- CI guardrails: component line budget, no `` `$${ `` in components, no `{false &&`, no unused
  exports.

---

## 9. Quick Reference — Findings Index

Status column verified 2026-09-06 post-remediation. ✅ fixed · 🟠 partial · 🔴 open · 🆕 new.
Line references are the **original** audit's; see §0.5 for current ones.

| ID | Sev | Finding | Status |
|---|---|---|---|
| C-1 | 🔴 | Drivers list built from 200-trip fleet sample | ✅ `GET /drivers/roster` |
| C-2 | 🔴 | Reconciliation compares two different date windows | ✅ both sides on Financials period |
| C-3 | 🔴 | Documents tab is mock data with stock photos | ✅ real docs + verify workflow |
| C-4 | 🔴 | Hardcoded vehicle / member-since / rating / safety score | ✅ all four removed |
| C-5 | 🔴 | Fleet-wide fuel economy hardcoded to one vehicle | 🟠 **V-1** — lookup is a no-op (TS2339, wrong array) |
| C-6 | 🔴 | "Repair Now" calls a retired 410 endpoint | 🔴 **open** — still wired at `DriverDetail.tsx:2502` |
| C-7 | 🔴 | Cash Wallet totals driven by a hidden filter | 🟠 **V-2** — labelled + URL-synced, no picker on tab |
| C-8 | 🔴 | No RBAC in Driver Detail; `POST /transactions` ungated | ✅ client `can()` + server `requirePermission` + bank masking |
| A-1 | 🟠 | 4,453-line God component | 🟠 **V-3** — 2,763 lines; 812-line `metrics` memo remains |
| A-2 | 🟠 | Three data-fetching paradigms | 🔴 open — a new raw effect was added (`financialUberLedger`) |
| A-3 | 🟠 | React Query data copied into `useState` | 🔴 open — plus 8 new optimistic mutations on the copy |
| A-4 | 🟠 | `refreshData` double-fires all requests | 🔴 open |
| A-5 | 🟠 | Four independent driver-aggregation engines | 🔴 open — roster replaced one, did not consolidate |
| A-6 | 🟠 | No routing for driver detail | ✅ `/drivers/:id/:tab?from=&to=` |
| A-7 | 🟠 | 18,711-line edge function | 🔴 open — now 18,721 |
| A-8 | 🟠 | 6.1 MB single bundle, no code splitting | 🟠 3 lazy tab chunks; 0 `React.lazy` in `App.tsx` |
| P-1 | 🟠 | Lifetime ledger scan per date change | 🔴 open — **now fires twice** on Financials |
| P-2 | 🟠 | Org-wide lifetime fare scan; silent 100k truncation | 🔴 open — roster reuses the pattern |
| P-3 | 🟠 | Up to 50k transactions into browser memory | 🔴 open |
| P-4 | 🟠 | Client-side N+1 on toll logs | 🟠 **V-5** — deduped, still one request per id |
| P-5 | 🟠 | Fleet-wide claims fetched for one driver | ✅ driver-scoped variant added |
| P-6 | 🟠 | Dead network requests | ✅ both removed |
| P-7 | 🟠 | 10k-trip fetch on mount, not tab-gated | 🔴 open |
| P-8 | 🟠 | No virtualization on any table | 🟠 **V-5** — `ContentVisibilityList` built, 1 call site |
| P-9 | 🟠 | 830-line metrics memo recomputes on filter toggle | 🔴 open — 812 lines, same deps |
| U-1 | 🟡 | Duplicate status badges | ✅ |
| U-2 | 🟡 | Inert Export / Message buttons | ✅ removed |
| U-3 | 🟡 | Three date-range concepts | 🟠 **V-4** — down to two |
| U-4 | 🟡 | Service Quality shows an invisible period | 🔴 open |
| U-5 | 🟡 | Platform breakdowns hardcoded to Uber + InDrive | 🔴 open — 14 refs |
| U-6 | 🟡 | Per-platform rating falls back to overall rating | 🔴 open |
| U-7 | 🟡 | Empty "Recent Trip Issues" card | ✅ |
| U-8 | 🟡 | Money formatted four different ways | 🔴 open — 31 `` `$${ `` + 43 `toLocaleString`; `formatJMD` imported unused |
| U-9 | 🟡 | Partial dark mode | 🟠 improved in extracted tabs |
| U-10 | 🟡 | dicebear third-party avatar with driver id | ✅ removed |
| U-11 | 🟡 | No vocab / i18n in Driver Detail | 🔴 open — 0 `useVocab` |
| U-12 | 🟡 | Accessibility | 🟠 14 `aria-label`, 2 `role=` (was 1 / 0) |
| U-13 | 🟡 | Uncontrolled tabs, duplicated state | ✅ controlled + URL-backed |
| U-14 | 🟡 | 1,045-line `AddDriverModal`, collects password | 🔴 open — untouched |
| U-15 | 🟡 | Naive CSV export, no injection guard | 🔴 open |
| U-16 | 🟡 | All-or-nothing loading | 🔴 open |
| U-17 | 🟡 | Silent server-error degradation | 🟠 roster now toasts on error |
| D-1 | 🔵 | ~1,300 dead lines | ✅ all verified removed + CI guardrail |
| D-2 | 🔵 | Legacy USD tier ladder | ✅ roster owns tier |
| D-3 | 🔵 | Orphan components (~1,900 lines) | 🔴 open — `FuelLedgerView` etc. still in `components/drivers/` |
| D-4 | 🔵 | `console.log` in production | 🟠 reduced |
| **N-1** | 🆕 | 41 unused imports left by the tab extraction | 🔴 open |
| **N-2** | 🆕 | 4 server modules built but never reached; audit log never written | 🔴 open |
| **N-3** | 🆕 | `drivers/roster` transfers full trip JSON for ≤100k rows | 🔴 open |
| **N-4** | 🆕 | 0 component tests; e2e "driver detail" spec never opens a driver | 🔴 open |

---

## 10. Closing Assessment

The domain modelling underneath this section is genuinely good. The settlement math, the cash-wash
concept, the call-outstanding script logic, the toll disposition buckets — these are real,
well-tested, hard-won fleet-operations knowledge, and they are correctly factored into pure
utilities.

What is missing is the layer between those utilities and the screen. There is no read model, no
route model, no period model, and no permission model — so a 4,453-line component was forced to
invent all four, inline, fifteen phases in a row. The dead code, the duplicated formatters, the
three date ranges and the mock documents are all symptoms of that one absence.

**The recommendation is not a rewrite.** Keep the utils, keep the settlement engine, keep
`driver_financial_periods`. Delete Phase 1's 1,300 dead lines, fix Phase 0's false data, then build
the four missing models and let the component collapse to a shell around them.

Phases 0 and 1 alone — roughly four days, almost entirely deletion — remove every fabricated number
on the screen and shrink the hardest file by a third. That is where to start.

---

## 11. Post-Remediation Assessment — 2026-09-06

Phases 0 and 1 landed exactly as recommended, and Phases 2–4 went further than the roadmap
expected. Every fabricated number is gone from the screen, the Drivers list is finally aggregated
from real data, the reconciliation card can now actually reconcile, driver detail is deep-linkable,
and the money controls are permission-gated on both ends. `DriverDetail.tsx` is 38% smaller with a
CI guardrail keeping the dead JSX out. That is the hard part of this work and it is done.

The remaining risk has changed shape. It is no longer "the screen shows things that aren't true" —
it is now **"things that look done aren't wired."** Four server modules are registered and
unreachable, an audit-log write path exists that nothing calls, a fuel-economy lookup reads as
fixed while always returning the old constant, and 41 imports from the extracted tabs still anchor
the module graph they were supposed to leave behind. Each of these will read as complete to the
next person who opens the file.

The single most valuable habit for the next slice is to **finish the wire, not just build the
part** — for each of C-6, V-1 and N-2, either connect it end to end or delete it. A registered
route with no caller and a helper that always returns its fallback are both worse than the honest
gap they replaced, because neither shows up as a bug.

After that, V-3 (the 812-line `metrics` memo) and A-3 (the `useState` mirror) are the two structural
knots left, and they should be untied in that order.
