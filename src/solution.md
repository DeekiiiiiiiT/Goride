# Driver Earnings Wiring — Implementation Plan

## Problem Statement

The **Earnings History** table in `DriverEarningsHistory.tsx` (shown under Financials > Earnings in `DriverDetail.tsx`) is completely broken:

- **Gross Revenue shows $0.00 for all rows** because the component tries to calculate revenue from `FinancialTransaction[]` entries (ledger records like fuel charges, toll fees), but trip earnings are stored as `Trip` objects — there are zero "Revenue" type transactions.
- **Tier Applied shows "Bronze (25%)" for all rows** because the tier lookup is based on cumulative revenue from transactions (which is $0), so it always falls back to the lowest tier — even though the driver header shows "PLATINUM".
- **Net Earnings is always negative** because it's `$0 (broken gross) - expenses = -expenses`.
- The **Earnings Breakdown donut chart** only shows "Base Fare" and "Tips" (from `fareBreakdown`), and is empty/hollow when no fare breakdown data exists.

### Root Cause

Trip earnings live in `Trip[]` objects (field: `amount`, or `indriveNetIncome` for InDrive). Financial ledger entries live in `FinancialTransaction[]` objects (fuel, tolls, payouts). The Earnings History component only receives `transactions` — it has **no access to trips at all**.

### The Fix

Connect the driver's `Trip[]` data into the Earnings History so that:
- **Gross Revenue** = sum of trip effective earnings in the period
- **Tier Applied** = looked up from cumulative trip earnings (not transactions)
- **Driver Share** = Gross Revenue x Tier% (new column)
- **Expenses** = from FinancialTransactions (already works)
- **Net Earnings** = Driver Share - Expenses
- **Quota %** = Gross Revenue vs configured target (from QuotaConfig)

---

## Files Involved

| File | Role | Changes |
|------|------|---------|
| `/utils/tripEarnings.ts` | **NEW** — shared utility | `getEffectiveTripEarnings(trip)` function |
| `/components/drivers/DriverEarningsHistory.tsx` | Earnings History table | New props, rewritten aggregation, period tabs, quota |
| `/components/drivers/DriverDetail.tsx` | Parent component | Pass trips + quota, fix donut chart |
| `/services/tierService.ts` | Tier/Quota service | Already has `getQuotaSettings()` — no changes needed |
| `/utils/tierCalculations.ts` | Tier math utilities | No changes needed |
| `/types/data.ts` | Type definitions | No changes needed |

---

## Phase 1: Foundation — Create `getEffectiveTripEarnings()` Utility

**Goal:** Create a single, reusable function that returns the "true earnings" for any trip, respecting InDrive fee logic. This is the same guard used across the True Profit fix but centralized into one importable utility.

**File:** `/utils/tripEarnings.ts` (NEW)

### Step 1.1: Create the utility file

Create `/utils/tripEarnings.ts` with a single exported function:

```ts
getEffectiveTripEarnings(trip: Trip): number
```

**Logic:**
- If `trip.platform === 'InDrive'` AND `trip.indriveNetIncome != null` → return `trip.indriveNetIncome`
- Otherwise → return `trip.amount || 0`
- Guard against null/undefined trip → return 0

This matches the exact guard pattern already used in `TripStatsCard.tsx`, `TripLogsPage.tsx`, `DriverDetail.tsx`, `VehiclesPage.tsx`, and `DriverAssignmentModal.tsx` (the 6 files from the True Profit fix). It just centralizes it.

### Step 1.2: Verify the function handles edge cases

The function must handle:
- `trip` is null/undefined → 0
- `trip.amount` is undefined/NaN → 0
- `trip.platform` is undefined → falls through to `trip.amount`
- InDrive trip WITHOUT `indriveNetIncome` (legacy) → uses `trip.amount` (preserves backward compat)
- InDrive trip WITH `indriveNetIncome` → uses `indriveNetIncome` (true profit)

### Step 1.3: No existing code changes in this phase

This is additive only. No imports are changed, no existing behavior is altered. The utility will be consumed starting in Phase 3.

**Checkpoint:** New file created, zero risk, zero side effects.

---

## Phase 2: Extend `DriverEarningsHistory` Interface (Backward-Compatible)

**Goal:** Add `trips` and `quotaConfig` props to the `DriverEarningsHistory` component without changing any logic. The component should still render exactly as before when only `transactions` is passed.

**File:** `/components/drivers/DriverEarningsHistory.tsx`

### Step 2.1: Update the `DriverEarningsHistoryProps` interface

Add two new optional props:

```ts
interface DriverEarningsHistoryProps {
  driverId: string;
  transactions: FinancialTransaction[];
  trips?: Trip[];          // NEW — source of Gross Revenue
  quotaConfig?: QuotaConfig; // NEW — for Quota % column
}
```

Both are optional so the existing call site (`<DriverEarningsHistory driverId={driverId} transactions={transactions} />` at DriverDetail.tsx line ~2595) continues to work unchanged.

### Step 2.2: Add imports for the new types

Add imports at the top of the file:

```ts
import { Trip, QuotaConfig } from "../../types/data";
```

`Trip` and `QuotaConfig` are already exported from `types/data.ts`. `FinancialTransaction` and `TierConfig` are already imported.

### Step 2.3: Destructure new props with defaults

In the component function signature:

```ts
export function DriverEarningsHistory({ driverId, transactions = [], trips = [], quotaConfig }: DriverEarningsHistoryProps)
```

Default `trips` to empty array so existing logic doesn't break.

### Step 2.4: No logic changes

The `weeklyData` memo still runs from transactions exactly as before. Trips are accepted but not yet used. This ensures the component compiles and renders identically.

**Checkpoint:** Component accepts new props, existing behavior unchanged, fully backward-compatible.

---

## Phase 3: Rewrite Aggregation Engine to Use Trips for Revenue

**Goal:** Replace the broken transaction-based Gross Revenue with trip-based calculation. Fix the tier lookup to use cumulative trip earnings. Add the "Driver Share" calculation.

**File:** `/components/drivers/DriverEarningsHistory.tsx`

### Step 3.1: Import the `getEffectiveTripEarnings` utility

```ts
import { getEffectiveTripEarnings } from "../../utils/tripEarnings";
```

### Step 3.2: Add a `periodType` state variable

Add state to track the selected aggregation period (for Phase 4, but we set it up now):

```ts
const [periodType, setPeriodType] = React.useState<'daily' | 'weekly' | 'monthly'>('weekly');
```

Default is `'weekly'` which matches the current behavior.

### Step 3.3: Rewrite the `weeklyData` memo → rename to `periodData`

Replace the existing `weeklyData` useMemo with a new `periodData` useMemo that:

**3.3a — Determine date range from BOTH trips AND transactions:**
- Collect all dates from `trips[].date` and `transactions[].date`
- Find min/max across both collections
- If both are empty, return `[]`

**3.3b — Generate period buckets:**
- For `'weekly'`: use `eachWeekOfInterval()` with `weekStartsOn: 1` (Monday) — same as current
- For `'daily'`: use `eachDayOfInterval()` — each day is its own bucket
- For `'monthly'`: use `eachMonthOfInterval()` — each calendar month is a bucket

**3.3c — For each period bucket, calculate:**

1. **Gross Revenue** (FROM TRIPS):
   - Filter `trips` where `trip.date` falls within the period's start/end range
   - Sum using `getEffectiveTripEarnings(trip)` for each trip
   - Only include trips with `status === 'Completed'`

2. **Cumulative Earnings** (FROM TRIPS — for tier lookup):
   - Filter ALL trips where `trip.date <= periodEnd`
   - Sum using `getEffectiveTripEarnings(trip)`
   - This gives the driver's lifetime earnings up to that point
   - Pass to `TierCalculations.getTierForEarnings(cumulative, tiers)` → correct tier for that period

3. **Driver Share** (NEW):
   - `driverShareAmount = grossRevenue * (tier.sharePercentage / 100)`
   - This is the portion the driver keeps per the tier agreement

4. **Fleet Share** (NEW, informational):
   - `fleetShareAmount = grossRevenue - driverShareAmount`

5. **Expenses** (FROM TRANSACTIONS — unchanged logic):
   - Filter `transactions` where date falls in the period
   - Filter where `type === 'Expense'` or `(type === 'Adjustment' && amount < 0)`
   - Sum `Math.abs(amount)` → display as positive deduction

6. **Net Earnings** (FIXED):
   - `netEarnings = driverShareAmount - expenses`
   - This is the driver's actual take-home after their share minus deductions

7. **Payouts** (FROM TRANSACTIONS — unchanged):
   - Filter transactions where `type === 'Payout'`
   - Sum `Math.abs(amount)`

8. **Trip Count** (NEW):
   - Count of completed trips in this period (useful context)

### Step 3.4: Update the row data structure

Each row now includes:

```ts
{
  periodStart: Date,
  periodEnd: Date,
  grossRevenue: number,      // From trips
  driverShare: number,       // grossRevenue * tier%
  fleetShare: number,        // grossRevenue - driverShare
  expenses: number,          // From transactions
  tier: TierConfig,          // Looked up from cumulative trip earnings
  netEarnings: number,       // driverShare - expenses
  payouts: number,           // From transactions
  tripCount: number,         // From trips
  transactionCount: number   // From transactions (for filtering empty rows)
}
```

### Step 3.5: Filter logic — show rows with activity

A row should be displayed if `tripCount > 0 OR transactionCount > 0` (i.e., there was either a trip or a financial transaction in that period). Currently it filters on `transactionCount > 0` only, which hides weeks that had trips but no transactions.

### Step 3.6: Update the table columns

Update the `<Table>` columns to reflect the new data:

| Column | Source | Format |
|--------|--------|--------|
| Period | `periodStart - periodEnd` | Date range (format varies by period type) |
| Gross Revenue | `grossRevenue` | `$X,XXX.XX` in slate |
| Driver Share | `driverShare` | `$X,XXX.XX` in emerald with tier% badge |
| Tier Applied | `tier.name (tier.sharePercentage%)` | Badge |
| Expenses | `expenses` | `-$X,XXX.XX` in rose (or `-` if zero) |
| Net Earnings | `netEarnings` | `$X,XXX.XX` in bold emerald (or rose if negative) |
| Payouts | `payouts` | `$X,XXX.XX` in slate (or `-` if zero) |

Note: "Driver Share" is a new column between "Gross Revenue" and "Tier Applied". It makes the math visible: Gross → Tier% → Driver Share → minus Expenses → Net.

### Step 3.7: Update the CSV export

The `handleExport` function's `data` map must include the new fields:
- Add "Driver Share" column
- Add "Trip Count" column
- Keep existing columns updated

### Step 3.8: Sort and display

Rows sorted in descending order (newest period first) — same as current behavior.

**Checkpoint:** Earnings History now shows real Gross Revenue from trips, correct tier, and accurate Net Earnings. The table is still weekly-only (daily/monthly comes in Phase 4).

---

## Phase 4: Add Daily / Weekly / Monthly Period Sub-Tabs

**Goal:** Add inner tab navigation so the admin can view earnings aggregated by day, week, or month. The weekly view is default and matches the current layout.

**File:** `/components/drivers/DriverEarningsHistory.tsx`

### Step 4.1: Add period tab UI

Above the table (inside the Card, below the CardHeader), add a small `Tabs` component:

```
[Daily] [Weekly] [Monthly]
```

- `defaultValue="weekly"` (matches current behavior)
- `onValueChange` updates the `periodType` state (created in Phase 3, Step 3.2)
- Use a compact `TabsList` that doesn't dominate the header

### Step 4.2: Create period-specific date formatting

The "Period" column should format differently based on the period type:

- **Daily:** `"Mon, Feb 16, 2026"` (single day)
- **Weekly:** `"Feb 16 - Feb 22, 2026"` (week range, current format)
- **Monthly:** `"February 2026"` (month name + year)

Create a helper function:
```ts
function formatPeriodLabel(start: Date, end: Date, periodType: string): string
```

### Step 4.3: Verify the aggregation functions work for each period

The `periodData` memo from Phase 3 already branches on `periodType` for bucket generation. Verify:

- **Daily:** `eachDayOfInterval()` → each bucket is 1 day. `periodEnd` = same as `periodStart` (end of that day).
- **Weekly:** `eachWeekOfInterval({ weekStartsOn: 1 })` → each bucket is Mon-Sun. Already implemented.
- **Monthly:** Use `startOfMonth()`/`endOfMonth()` to create monthly buckets. Each bucket spans the full calendar month.

### Step 4.4: Handle the "daily" view's potential for many rows

The daily view could have hundreds of rows if the date range is wide. Add:
- A pagination control (e.g., show 14 rows per page for daily, 12 for weekly, 6 for monthly)
- Or a "Show more" button at the bottom

### Step 4.5: Ensure the export respects the current period type

The CSV export should export data in the currently-selected period aggregation. The filename should reflect it:
- `driver_earnings_daily_{driverId}.csv`
- `driver_earnings_weekly_{driverId}.csv`
- `driver_earnings_monthly_{driverId}.csv`

**Checkpoint:** Three period views available. Weekly is default. Daily gives granular day-by-day breakdown. Monthly gives high-level summaries.

---

## Phase 5: Quota Progress Integration

**Goal:** Compare actual earnings against the configured Earning Quota targets. Show a "Quota %" column and summary progress indicator.

**File:** `/components/drivers/DriverEarningsHistory.tsx`

### Step 5.1: Determine the quota target for the current period type

From the `quotaConfig` prop, extract the relevant target:

- **Daily:** `quotaConfig.weekly.amount / (quotaConfig.weekly.workingDays?.length || 6)` (daily target = weekly target / working days). Only if `quotaConfig.weekly.enabled`.
- **Weekly:** `quotaConfig.weekly.amount` if `quotaConfig.weekly.enabled`
- **Monthly:** `quotaConfig.monthly.amount` if `quotaConfig.monthly.enabled`. If monthly isn't configured but weekly is, derive it: `quotaConfig.weekly.amount * 4.33`

If the relevant quota period is not enabled, the Quota % column is hidden entirely.

### Step 5.2: Add `quotaTarget` and `quotaPercent` to each row

In the `periodData` memo, for each row:

```ts
quotaTarget: number | null,  // null if quota not enabled for this period
quotaPercent: number | null,  // (grossRevenue / quotaTarget) * 100
```

### Step 5.3: Add the Quota % column to the table

Position it as the **last column** (after Payouts):

| Quota % |
|---------|
| 120% |
| 85% |
| 43% |

**Color coding:**
- `>= 100%`: emerald background badge (target met/exceeded)
- `70% - 99%`: amber background badge (close but not met)
- `< 70%`: rose background badge (significantly below target)
- If quota not configured: column not rendered at all

### Step 5.4: Add a summary card above the table

Above the table, show a compact summary for the **current/latest period**:

```
┌──────────────────────────────────────────────────┐
│  This Week: $85,000 / $100,000 (85%)   ████████░░  │
│  Tier: Platinum (31%)  |  Trips: 47              │
└──────────────────────────────────────────────────┘
```

- Shows the most recent period's gross revenue vs quota target
- A progress bar (Tailwind `bg-emerald-500` with `bg-slate-100` track)
- The tier badge and trip count for quick context
- Only rendered if quota is enabled for the current period type

### Step 5.5: Add Quota % to CSV export

If quota is enabled, add "Quota Target" and "Quota %" columns to the export.

**Checkpoint:** Quota comparison is live. Admin can see at a glance which periods met target and which didn't. The summary card gives immediate "this period" context.

---

## Phase 6: Wire Everything in `DriverDetail.tsx`

**Goal:** Connect the data pipes. Pass trips and quota config to `DriverEarningsHistory`. Fix the Earnings Breakdown donut chart. Final integration and verification.

**File:** `/components/drivers/DriverDetail.tsx`

### Step 6.1: Fetch QuotaConfig

Add a state variable and effect to load quota settings:

```ts
const [quotaConfig, setQuotaConfig] = useState<QuotaConfig | null>(null);

useEffect(() => {
  tierService.getQuotaSettings().then(setQuotaConfig).catch(console.error);
}, []);
```

Note: `tierService` is already imported (line ~95). `QuotaConfig` needs to be added to the type import from `../../types/data`.

### Step 6.2: Update the `DriverEarningsHistory` call

Change line ~2595 from:

```tsx
<DriverEarningsHistory driverId={driverId} transactions={transactions} />
```

To:

```tsx
<DriverEarningsHistory
  driverId={driverId}
  transactions={transactions}
  trips={trips}
  quotaConfig={quotaConfig || undefined}
/>
```

`trips` is already a prop on `DriverDetail` (line ~216). No additional fetching needed.

### Step 6.3: Fix the Earnings Breakdown donut chart

Currently the donut chart at lines ~2568-2592 uses `metrics.earningsBreakdownData` which only has "Base Fare" and "Tips" (often empty, resulting in a hollow donut).

Replace with a more meaningful breakdown:

**Option A — Per-Platform Earnings (recommended):**
Show how much came from each platform (Uber, InDrive, Other):

```ts
const platformBreakdownData = useMemo(() => {
  const platformTotals: Record<string, number> = {};
  trips.forEach(trip => {
    const platform = trip.platform || 'Other';
    const earnings = getEffectiveTripEarnings(trip);
    platformTotals[platform] = (platformTotals[platform] || 0) + earnings;
  });
  const colors: Record<string, string> = {
    Uber: '#3b82f6',
    InDrive: '#10b981',
    Bolt: '#8b5cf6',
    GoRide: '#f59e0b',
    Other: '#94a3b8'
  };
  return Object.entries(platformTotals)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value, color: colors[name] || '#94a3b8' }));
}, [trips]);
```

This replaces `metrics.earningsBreakdownData` in the `<Pie data={...}>`.

### Step 6.4: Add a center label to the donut

Inside the `<PieChart>`, add a text element showing the total earnings in the center of the donut:

```
$XXX,XXX
Total Earnings
```

This gives the donut chart visual meaning even at a glance.

### Step 6.5: Ensure date range filtering is respected

The `trips` prop passed to `DriverDetail` includes ALL trips for this driver. However, the Financials > Earnings tab should ideally respect the global date range filter (the "Feb 15, 2026 - Feb 22, 2026" picker at the top).

Check whether `DriverEarningsHistory` should receive the full trip history (for proper cumulative tier calculation) or date-filtered trips. Answer: **pass ALL trips** — the component needs the full history for cumulative tier math. The period buckets will naturally filter what's displayed.

### Step 6.6: Verify no regressions

Check that:
- The Overview tab still shows the Financial Performance bar chart correctly
- The Cash Wallet tab still works (it uses the same `transactions` state)
- The tier badge in the profile header still shows correctly
- Platform filter (`selectedPlatforms`) does NOT affect the Earnings History (it should show all-platform aggregated data — the filter is for the Overview tab's charts)
- The Expenses sub-tab (the placeholder we just added) is unaffected

### Step 6.7: Import cleanup

Ensure all new imports are added:
- `QuotaConfig` in the type import line
- `getEffectiveTripEarnings` from the utility (if used for the donut chart)
- Remove any unused imports if we replaced `earningsBreakdownData`

**Checkpoint:** Everything is wired. The Earnings History shows real data. The donut chart is meaningful. The system is complete and functional.

---

## Testing Checklist (Post All Phases)

After all 6 phases are implemented, verify:

- [ ] Gross Revenue shows actual trip earnings (not $0)
- [ ] Tier Applied matches the driver's actual tier (e.g., Platinum for a high-earner, not Bronze)
- [ ] Driver Share = Gross Revenue x Tier% (math checks out)
- [ ] Net Earnings = Driver Share - Expenses (can be negative if expenses exceed share)
- [ ] Weekly/Daily/Monthly tabs all render correctly
- [ ] Quota % column appears when quota is configured, hidden when not
- [ ] Quota colors: emerald ≥100%, amber 70-99%, rose <70%
- [ ] Donut chart shows per-platform breakdown with actual data
- [ ] CSV export includes all new columns
- [ ] InDrive trips use `indriveNetIncome` (true profit), not raw `amount`
- [ ] Legacy InDrive trips (without fee data) gracefully fall back to `amount`
- [ ] Empty state ("No financial history available") still renders when driver has zero trips AND zero transactions
- [ ] No regressions in Overview tab, Cash Wallet tab, or other driver detail sections
- [ ] Date format is DD/MM/YYYY in exports (Jamaica format)
