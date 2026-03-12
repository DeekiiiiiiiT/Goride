# Roam Fleet — Trip-to-Ledger Financial Migration Plan

> **Created: March 10, 2026**
> Migrate all remaining screens that compute financial data from `trip:*` to read from `ledger:*` instead.

---

## Core Principle

> "If a screen shows a dollar sign, it reads from the ledger. No exceptions."

- `trip:*` (Layer 1) = Operational source of truth — distance, duration, route, status, ratings, timestamps, trip counts
- `ledger:*` (Layer 2) = Financial source of truth — every money movement is a ledger entry
- `transaction:*` (Layer 3) = Cash management source of truth — payments, floats, fuel, toll reimbursements
- `driver:*` (Layer 4) = Identity/HR data — name, status, tier, documents, bank info

Each screen reads from exactly ONE layer for each type of data. Never mix.

---

## Pre-Migration Audit

The following screens still violate the enterprise rule:

| Screen | File | Violation | Severity |
|--------|------|-----------|----------|
| **Drivers List Page** | `DriversPage.tsx` | Computes `totalEarnings`, `todaysEarnings`, `monthlyEarnings` by summing `trip.amount` in a client-side loop over ALL `trip:*` records. Tier calculation uses trip-sourced `monthlyEarnings`. Fleet summary stats use trip-sourced earnings. | **HIGH** — main landing page, every driver row affected |
| **Executive Dashboard** | `ExecutiveDashboard.tsx` | `kpi.totalEarnings` falls back to `trips.reduce(sum + t.amount)` (and `organizationMetrics` is always passed as `[]` from `Dashboard.tsx:401`, so the fallback ALWAYS fires). Daily Earnings Trend chart and Top 5 Drivers chart both compute entirely from raw `trips`. | **MEDIUM** — dashboard tab, viewed less frequently |
| **Dashboard Financials View** | `FinancialsView.tsx` | Computes `totalRevenue`, revenue-by-type breakdown, platform stats, cash percentage, avg revenue per trip — ALL from raw `trips` via `completedTrips.forEach(t => amt = t.amount)`. | **MEDIUM** — dashboard sub-tab |
| **DriverDetail `metrics` useMemo** | `DriverDetail.tsx` | Legacy financial fields (`periodEarnings`, `cashCollected`, `totalTolls`, `weeklyEarningsData`) still computed from `trip:*`. Consumed by `resolvedFinancials` fallback and `earningsPerKm` on Efficiency tab. | **LOW** — primary display path already uses ledger; this is cleanup |

---

## Phase 1: Per-Driver Ledger Summary Endpoint

**Goal**: Create a server endpoint that aggregates ledger entries per driver, returning lifetime/monthly/daily earnings summaries. This is the backend foundation for migrating the Drivers List Page (Phase 2).

**Files Modified**: `server/index.tsx`, `services/api.ts`

### Step 1.1 — Define the endpoint contract
- `GET /ledger/drivers-summary`
- Optional query param: `?date=YYYY-MM-DD` (for "today" calculation; defaults to server's current date in UTC)
- Response shape:
  ```json
  {
    "success": true,
    "data": {
      "<driverId>": {
        "lifetimeEarnings": 12345.67,
        "monthlyEarnings": 3456.78,
        "todayEarnings": 234.56,
        "lifetimeTripCount": 150,
        "monthlyTripCount": 42,
        "todayTripCount": 5
      }
    },
    "meta": {
      "totalDrivers": 25,
      "dateUsed": "2026-03-10",
      "monthRange": "2026-03-01..2026-03-31",
      "durationMs": 850
    }
  }
  ```
- Earnings = sum of `grossAmount` from ledger entries where `eventType === 'fare_earning'`
- Trip count = count of `fare_earning` entries (each fare_earning corresponds to one completed trip)

### Step 1.2 — Implement paginated ledger fetch
- Use `paginatedFetch()` with `.range()` chunks to fetch ALL `ledger:*` entries where the value's `eventType` equals `fare_earning`
- This is critical to avoid Supabase's PostgREST 1,000-row silent cap
- Filter server-side: query `value->>eventType` = `fare_earning` to reduce data transfer
- Log: `[Ledger DriversSummary] Fetched N fare_earning entries in Xms`

### Step 1.3 — Aggregate by driver and time bucket
- For each fetched ledger entry:
  - Extract `driverId`, `grossAmount`, and `date` from the entry's value
  - Add to that driver's `lifetimeEarnings` and `lifetimeTripCount`
  - If `date` falls within the current calendar month -> add to `monthlyEarnings` and `monthlyTripCount`
  - If `date` equals today -> add to `todayEarnings` and `todayTripCount`
- Use a `Map<string, DriverSummary>` for O(1) per-driver lookups
- Handle edge cases: missing `driverId` (skip with warning), missing `grossAmount` (treat as 0), invalid `date` (skip with warning)

### Step 1.4 — Register the endpoint in server/index.tsx
- Route: `GET /make-server-37f42386/ledger/drivers-summary`
- Include try/catch with detailed error logging
- Include execution time tracking (`durationMs` in response meta)
- Log: `[Ledger DriversSummary] Returning summaries for N drivers, total lifetime earnings $X`

### Step 1.5 — Add API method to services/api.ts
- `api.getLedgerDriversSummary(): Promise<{ data: Record<string, DriverSummary>, meta: {...} }>`
- Calls `GET /ledger/drivers-summary` with the standard auth header
- Returns parsed JSON response
- Handles errors gracefully (returns `{ data: {}, meta: {...} }` on failure, logs error)

### Step 1.6 — Manual verification (operational step, no code)
- Call the endpoint directly (via browser console or network tab)
- Pick 3 drivers and compare their `lifetimeEarnings` against the Driver Detail Overview tab totals
- They should match within rounding tolerance ($0.01)
- If they don't match, investigate before proceeding to Phase 2

---

## Phase 2: Migrate Drivers List Page Earnings to Ledger

**Goal**: Switch `DriversPage.tsx` from computing earnings via client-side trip loops to reading from the Phase 1 server endpoint. Every dollar amount on the Drivers List page will come from the ledger.

**Files Modified**: `DriversPage.tsx`

### Step 2.1 — Add ledger summary state and fetch
- New state variables:
  - `ledgerSummary: Record<string, DriverSummary>` (default: `{}`)
  - `ledgerLoaded: boolean` (default: `false`)
  - `ledgerError: boolean` (default: `false`)
- New `useEffect` that calls `api.getLedgerDriversSummary()` on mount
- On success: set `ledgerSummary` to response data, `ledgerLoaded = true`
- On error: set `ledgerError = true`, log `console.error('[DriversPage] Failed to load ledger summaries: ...', error)`
- This fetch runs in parallel with the existing trips/drivers fetch — no blocking

### Step 2.2 — Wire ledger earnings into the trip-processing loop (primary path)
- In the `drivers` useMemo (the big loop at ~line 300 that processes trips into driver profiles):
  - **KEEP** the trip loop for operational data: `totalTrips += 1`, `todaysTrips += 1`, and trip linking (`linkedTrips.push(trip)`)
  - **REMOVE** the earnings accumulation lines:
    - Line 319: `driver.totalEarnings += trip.amount || 0;` -> remove
    - Line 328: `driver.todaysEarnings += trip.amount || 0;` -> remove
    - Line 335: `driver.monthlyEarnings += trip.amount || 0;` -> remove
  - **AFTER** the trip loop completes, overlay ledger data onto each driver profile:
    ```
    if (ledgerLoaded && !ledgerError) {
      for (const driver of driverArray) {
        const summary = ledgerSummary[driver.id];
        if (summary) {
          driver.totalEarnings = summary.lifetimeEarnings;
          driver.todaysEarnings = summary.todayEarnings;
          driver.monthlyEarnings = summary.monthlyEarnings;
        }
      }
    }
    ```
  - Add `ledgerSummary`, `ledgerLoaded`, `ledgerError` to the useMemo dependency array

### Step 2.3 — Keep trip-based earnings as safety fallback
- If `!ledgerLoaded || ledgerError`, keep the existing trip-based earnings lines active
- Implement this as a conditional:
  ```
  // Inside the trip loop:
  if (!ledgerLoaded || ledgerError) {
    // FALLBACK: compute from trips (legacy)
    driver.totalEarnings += trip.amount || 0;
    if (tripDate === today) driver.todaysEarnings += trip.amount || 0;
    if (isSameMonth(...)) driver.monthlyEarnings += trip.amount || 0;
  }
  ```
- Log `console.error('[DriversPage] Ledger unavailable - falling back to trip-based earnings')` when the fallback activates
- This ensures zero breakage if the endpoint is slow or fails

### Step 2.4 — Update fleet summary stats
- The `fleetStats` useMemo (line 491) already reads from `drivers` array
- Since Step 2.2 updates driver profiles with ledger data, `fleetStats` automatically uses correct numbers
- No code change needed, but verify: `avgEarningsPerTrip` and `avgWeeklyEarnings` should now reflect ledger-sourced earnings

### Step 2.5 — Update tier calculation
- Line 374: `TierCalculations.getTierForEarnings(driver.monthlyEarnings, tiers)` — already correct
- Since `driver.monthlyEarnings` is now set from ledger (Step 2.2), tiers are automatically calculated from ledger data
- No code change needed, but verify: each driver's tier badge should match what Driver Detail Overview shows

### Step 2.6 — Update CSV export
- Line 471: `d.totalEarnings.toFixed(2)` — already reads from driver profile
- Since Step 2.2 updates the profile, CSV export automatically uses ledger data
- No code change needed, but verify by exporting and spot-checking

### Step 2.7 — Verify parity (operational step, no code)
- For 5 drivers, compare:
  - Drivers List `totalEarnings` column vs Driver Detail Overview lifetime earnings -> should match
  - Drivers List `todaysEarnings` column vs Driver Detail Overview "Today" filter -> should match
  - Drivers List tier badge vs Driver Detail tier -> should match
- If any mismatch: investigate before proceeding

### Step 2.8 — Remove fallback (deferred)
- The trip-based fallback from Step 2.3 stays in place until parity is confirmed across multiple sessions
- Removal will happen in Phase 6 (final cleanup) after all migrations are complete and stable

---

## Phase 3: Fleet-Wide Ledger Summary Endpoint

**Goal**: Create a server endpoint that aggregates ledger entries fleet-wide, returning the total earnings, daily trend, per-driver rankings, and per-platform breakdown. This is the backend foundation for migrating the Executive Dashboard (Phase 4) and Dashboard Financials View (Phase 5).

**Files Modified**: `server/index.tsx`, `services/api.ts`

### Step 3.1 — Define the endpoint contract
- `GET /ledger/fleet-summary`
- Optional query params:
  - `?days=7` (number of days for the trend period, default: 7)
  - `?startDate=YYYY-MM-DD` and `?endDate=YYYY-MM-DD` (explicit date range, overrides `days`)
- Response shape:
  ```json
  {
    "success": true,
    "data": {
      "totalEarnings": 567890.12,
      "totalTripCount": 4500,
      "totalCashCollected": 123456.78,
      "dailyTrend": [
        { "date": "2026-03-04", "earnings": 12345.67, "tripCount": 120 },
        { "date": "2026-03-05", "earnings": 13456.78, "tripCount": 135 }
      ],
      "topDrivers": [
        { "driverId": "abc123", "driverName": "John Smith", "earnings": 5678.90, "tripCount": 45 }
      ],
      "platformBreakdown": [
        { "platform": "Uber", "earnings": 34567.89, "tripCount": 280 },
        { "platform": "InDrive", "earnings": 12345.67, "tripCount": 150 },
        { "platform": "Roam", "earnings": 5678.90, "tripCount": 70 }
      ],
      "revenueByType": {
        "fare": 50000.00,
        "tip": 3000.00,
        "promotion": 1500.00,
        "other": 500.00
      }
    },
    "meta": {
      "periodStart": "2026-03-04",
      "periodEnd": "2026-03-10",
      "durationMs": 1200
    }
  }
  ```

### Step 3.2 — Implement paginated ledger fetch with date filtering
- Use `paginatedFetch()` to get ALL `ledger:*` entries within the date range
- Filter server-side by `value->>date` between `startDate` and `endDate`
- Also fetch `value->>eventType` to include all types (fare_earning, tip, toll_charge, platform_fee, etc.) for the `revenueByType` breakdown
- Log: `[Ledger FleetSummary] Fetched N ledger entries for period X..Y in Zms`

### Step 3.3 — Aggregate fleet-wide totals
- **Total earnings**: sum `grossAmount` where `eventType === 'fare_earning'`
- **Total trip count**: count of `fare_earning` entries
- **Total cash collected**: sum `cashCollected` where `eventType === 'fare_earning'` and `cashCollected > 0`
- **Revenue by type**:
  - `fare` = sum of `grossAmount` where `eventType === 'fare_earning'`
  - `tip` = sum of `netAmount` where `eventType === 'tip'`
  - `promotion` = sum of `netAmount` where `eventType === 'promotion'` or `incentive`
  - `other` = everything else with positive `netAmount`

### Step 3.4 — Aggregate daily trend
- Group `fare_earning` entries by date -> `{ date, earnings: sum(grossAmount), tripCount: count }`
- Sort chronologically
- Return as `dailyTrend` array

### Step 3.5 — Aggregate top drivers
- Group `fare_earning` entries by `driverId` -> sum earnings and count trips
- Sort descending by earnings, take top 10
- Cross-reference with `driver:*` profiles to get `driverName` for each
- Return as `topDrivers` array

### Step 3.6 — Aggregate platform breakdown
- Group `fare_earning` entries by `platform` -> sum earnings and count trips
- Apply `normalizePlatform()` to handle GoRide->Roam aliasing
- Return as `platformBreakdown` array

### Step 3.7 — Register the endpoint and add API method
- Route: `GET /make-server-37f42386/ledger/fleet-summary`
- Include try/catch, execution time tracking, detailed error logging
- Add `api.getLedgerFleetSummary({ days?, startDate?, endDate? })` to `services/api.ts`

### Step 3.8 — Manual verification (operational step, no code)
- Call the endpoint directly
- Compare `totalEarnings` against a manual sum of a few known drivers' ledger earnings
- Compare `platformBreakdown` against known platform totals from Driver Detail views
- Verify `dailyTrend` dates are in the expected range

---

## Phase 4: Migrate Executive Dashboard to Ledger

**Goal**: Switch `ExecutiveDashboard.tsx` from computing financial KPIs from raw `trips` to reading from the Phase 3 fleet summary endpoint. All dollar amounts on the Executive Dashboard will come from the ledger.

**Files Modified**: `ExecutiveDashboard.tsx`, `Dashboard.tsx` (props)

### Step 4.1 — Add fleet summary data as a prop
- Add a new optional prop to `ExecutiveDashboardProps`:
  ```
  fleetSummary?: {
    totalEarnings: number;
    dailyTrend: Array<{ date: string; earnings: number; tripCount: number }>;
    topDrivers: Array<{ driverId: string; driverName: string; earnings: number; tripCount: number }>;
    platformBreakdown: Array<{ platform: string; earnings: number; tripCount: number }>;
  }
  ```
- The fetch will happen in `Dashboard.tsx` (parent) and be passed down, since `Dashboard.tsx` already manages data loading for all its sub-views

### Step 4.2 — Add fleet summary fetch to Dashboard.tsx
- New state: `fleetSummary` (default: `null`)
- New `useEffect`: call `api.getLedgerFleetSummary({ days: 7 })` on mount
- Pass `fleetSummary` as a prop to `<ExecutiveDashboard>`
- This runs in parallel with existing data fetches — no blocking

### Step 4.3 — Wire KPI cards to ledger (primary path)
- In the `kpi` useMemo (line 74):
  - **Primary**: If `fleetSummary` is available, use `fleetSummary.totalEarnings`
  - **Fallback**: Keep existing `organizationMetrics[0]?.totalEarnings ?? trips.reduce(...)` as safety net
  - Keep `activeDrivers` and `totalTrips` from existing sources (these are operational, not financial)
- Log `console.error` when the trips fallback activates

### Step 4.4 — Wire Daily Earnings Trend chart to ledger
- In the `earningsTrend` useMemo (line 105):
  - **Primary**: If `fleetSummary?.dailyTrend` is available and non-empty, map it to `{ name: weekday, value: earnings }`
  - **Fallback**: Keep existing trip-based computation as safety net
  - Format the date as weekday name (e.g., "Mon") to match existing chart behavior
- Log `console.error` when the trips fallback activates

### Step 4.5 — Wire Top 5 Drivers chart to ledger
- In the `topDrivers` useMemo (line 119):
  - **Primary**: If `fleetSummary?.topDrivers` is available, map to `{ name: firstName, earnings }`
  - **Fallback**: Keep existing `driverMetrics`-based and trip-based computation as safety net
- Log `console.error` when a non-ledger fallback activates

### Step 4.6 — Add data source indicator
- Add a small subtle badge or text near the "Total Earnings" KPI card showing "Ledger" or "Trips fallback"
- This helps the operator see which source is active at a glance

### Step 4.7 — Verify parity (operational step, no code)
- Compare Executive Dashboard "Total Earnings" vs summing a few drivers' earnings from the Drivers List
- Compare "Daily Earnings Trend" chart values vs manual spot-check of specific days
- Compare "Top 5 Drivers" chart vs Drivers List sorted by earnings
- All should match within rounding tolerance

---

## Phase 5: Migrate Dashboard Financials View to Ledger

**Goal**: Switch `FinancialsView.tsx` from computing revenue, platform stats, and cash metrics from raw `trips` to reading from the Phase 3 fleet summary endpoint. This is the last dashboard sub-tab with trip-sourced financial data.

**Files Modified**: `FinancialsView.tsx`, `Dashboard.tsx` (props)

### Step 5.1 — Pass fleet summary to FinancialsView
- `Dashboard.tsx` already fetches `fleetSummary` in Phase 4
- Add `fleetSummary` as a new optional prop to `FinancialsView`
- Update the `<FinancialsView>` call in `Dashboard.tsx` to pass it

### Step 5.2 — Wire total revenue and revenue-by-type to ledger (primary path)
- In the `metrics` useMemo (line 62):
  - **Primary**: If `fleetSummary` is available:
    - `totalRevenue` = `fleetSummary.totalEarnings`
    - `revenueByType` = from `fleetSummary.revenueByType` (fare, tip, promotion, other)
    - `avgRevenuePerTrip` = `totalRevenue / fleetSummary.totalTripCount`
  - **Fallback**: Keep existing trip-based computation as safety net
- Log `console.error` when the trips fallback activates

### Step 5.3 — Wire platform stats to ledger
- The platform stats breakdown (line 109) currently loops over `trips`:
  - **Primary**: If `fleetSummary.platformBreakdown` is available, use it directly
  - **Fallback**: Keep existing trip-based platform aggregation
- Handle platform name normalization (GoRide->Roam) — already handled server-side in Phase 3

### Step 5.4 — Wire cash metrics to ledger
- `totalCash` and `cashPercentage` currently computed from `trip.cashCollected`:
  - **Primary**: If `fleetSummary.totalCashCollected` is available, use it
  - **Fallback**: Keep existing trip-based computation
- Note: The `totalRefunds` / `expenseRatio` metric may need special handling — negative trip amounts represent refunds. If these aren't in the ledger yet, document as a known gap and keep the trip-based computation for this specific metric.

### Step 5.5 — Verify parity (operational step, no code)
- Compare FinancialsView "Total Revenue" vs Executive Dashboard "Total Earnings" -> should match (both from ledger)
- Compare platform breakdown totals vs Drivers List earnings summed by platform
- Compare revenue-by-type breakdown vs known data

### Step 5.6 — Remove trips prop (deferred)
- The `trips` prop removal is deferred to Phase 6 (final cleanup)
- The trip-based fallback stays as a safety net until all migrations are confirmed stable

---

## Phase 6: Final Cleanup — Remove All Trip-Sourced Financial Code

**Goal**: Remove all legacy trip-to-financial computation code across the entire app. After this phase, the enterprise rule is fully enforced: every dollar amount reads from the ledger, every operational metric reads from trips, and there is zero mixing.

**Files Modified**: `DriverDetail.tsx`, `DriversPage.tsx`, `ExecutiveDashboard.tsx`, `FinancialsView.tsx`, `Dashboard.tsx`

### Step 6.1 — Remove DriverDetail `metrics` useMemo financial fields
- Remove the "LEGACY FINANCIAL" category fields from the `metrics` useMemo:
  - `periodEarnings` — remove computation (sum of trip amounts by period)
  - `cashCollected` — remove computation (sum of trip cashCollected)
  - `totalTolls` — remove computation (sum of trip tolls)
  - `weeklyEarningsData` — remove computation (weekly buckets of trip earnings)
  - `chartDataMap` — remove computation (daily chart data from trip amounts)
- **KEEP** all "OPERATIONAL" fields (totalDistance, totalDuration, completionRate, etc.)
- **KEEP** all "CASH WALLET" fields (from transactions, not trips)
- Update the useMemo dependency array accordingly

### Step 6.2 — Fix `earningsPerKm` on Efficiency tab
- Currently: `metrics.periodEarnings / metrics.totalDistance` (trip-sourced earnings)
- Change to: `resolvedFinancials.totalEarnings / metrics.totalDistance` (ledger-sourced earnings / trip-sourced distance)
- This is a legitimate HYBRID metric: financial numerator from ledger, operational denominator from trips
- Update any component that displays `earningsPerKm` to read from the new source

### Step 6.3 — Convert `resolvedFinancials` fallback to empty-state
- Currently: when ledger is incomplete, the fallback computes full financial data from trips
- Change to: when ledger is incomplete, return zeros/empty with a `dataIncomplete: true` flag
- Update `OverviewMetricsGrid` to show a warning state (e.g., "Financial data unavailable - ledger incomplete") instead of incorrect trip-sourced numbers
- The completeness guard remains as the detection mechanism
- The "Repair Now" button remains as the fix mechanism

### Step 6.4 — Remove trip-based fallbacks from DriversPage
- Remove the conditional fallback block added in Phase 2 Step 2.3
- The earnings accumulation lines (319, 328, 335) were already removed in Step 2.2
- If ledger fails: show dash or "$0" in earnings columns instead of computing from trips
- Add a subtle loading state or error indicator in the fleet stats card

### Step 6.5 — Remove trip-based fallbacks from ExecutiveDashboard
- Remove the trips fallback in the `kpi` useMemo (line 76)
- Remove the trips fallback in the `earningsTrend` useMemo (line 105)
- Remove the trips fallback in the `topDrivers` useMemo (line 130)
- If ledger fails: show "$0" or "No data" in KPI cards and empty charts
- Consider: can `trips` prop be removed entirely? Check if it's used for any non-financial purpose (e.g., active driver count). If `activeDrivers` is the only operational use, it could come from the fleet summary `topDrivers.length` or a separate query.

### Step 6.6 — Remove trip-based fallbacks from FinancialsView
- Remove the trips fallback in the `metrics` useMemo
- Remove the trips fallback in platform stats
- If the `trips` prop is no longer needed by any computation, remove it from the props interface
- Update `Dashboard.tsx` to stop passing `trips` to `<FinancialsView>` if the prop is removed

### Step 6.7 — Dead code and unused import cleanup
- Scan all modified files for:
  - Unused imports (e.g., `Trip` type if no longer referenced)
  - Unused utility functions (e.g., `getEffectiveTripEarnings` if removed from all call sites)
  - Unused state variables (e.g., `trips` state in `DriversPage` if no longer needed for any purpose)
- **CAUTION**: `trips` state in `DriversPage` is likely still needed for `linkedTrips` (passed to `DriverDetail` when you click into a driver). Do NOT remove it without checking all consumers.

### Step 6.8 — Update architecture documentation
- Update the comment block at the top of `DriverDetail.tsx`:
  - Move ALL items from "remaining trip-to-financial consumers" to "migrated"
  - Add note: "As of Phase 6, ALL dollar amounts in the app read from ledger:*. No financial computation from trip:* remains."
- Update this `solution.md`:
  - Update the Status Tracker with completion dates
  - Add a "Final Architecture State" section confirming the enterprise rule is fully enforced

### Step 6.9 — Final cross-app verification (operational step, no code)
- **Every screen that shows a dollar sign** must now read from ledger. Verify:
  - Drivers List page: `totalEarnings`, `todaysEarnings` columns -> ledger
  - Driver Detail Overview tab: all financial cards -> ledger (already uses ledger)
  - Driver Detail Financials tab: earnings history, payout history -> ledger (already uses ledger)
  - Driver Detail Efficiency tab: `earningsPerKm` -> ledger numerator (Step 6.2)
  - Executive Dashboard: Total Earnings KPI, Daily Trend, Top Drivers -> ledger
  - Dashboard Financials View: Total Revenue, platform stats, cash metrics -> ledger
- **No `console.error` fallback messages** should appear in the browser console under normal operation
- **Tier badges** on Drivers List should match Driver Detail for every driver
- **Fleet summary stats** should be consistent across Dashboard and Drivers List

---

## Phase Dependency Map

```
Phase 1 (Per-Driver Endpoint)
    |
    v
Phase 2 (Drivers List Migration)
                                      \
Phase 3 (Fleet-Wide Endpoint)          \
    |           |                       \
    v           v                        v
Phase 4     Phase 5                  Phase 6
(Exec       (Financials              (Final Cleanup -
Dashboard)   View)                    ALL fallbacks removed)
```

Phase 6 can only begin after Phases 2, 4, and 5 are ALL verified stable.

---

## Implementation Status Tracker

| Phase | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| Phase 1: Per-Driver Ledger Summary Endpoint | NOT STARTED | - | - | Backend foundation for Drivers List migration |
| Phase 2: Migrate Drivers List Earnings to Ledger | NOT STARTED | - | - | Depends on Phase 1 |
| Phase 3: Fleet-Wide Ledger Summary Endpoint | NOT STARTED | - | - | Backend foundation for Dashboard migrations |
| Phase 4: Migrate Executive Dashboard to Ledger | NOT STARTED | - | - | Depends on Phase 3 |
| Phase 5: Migrate Dashboard Financials View to Ledger | NOT STARTED | - | - | Depends on Phase 3 |
| Phase 6: Final Cleanup - Remove All Trip-Sourced Financial Code | NOT STARTED | - | - | Depends on Phases 2, 4, 5 all being verified |
