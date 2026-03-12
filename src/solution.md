# Status Column Architecture — 8-Phase Implementation Plan

## Problem Statement

The Payout tab's "Status" column currently shows "Finalized" based **solely** on whether a finalized fuel report exists for that week. This is misleading — a week can show "Finalized" even when the driver still owes $5,000 in unreturned cash. Meanwhile, the Expenses tab has no Status column at all, even though it already tracks `isFinalized` internally.

## Target Architecture

| Tab | Status Column Means | "Finalized" When |
|---|---|---|
| **Expenses** | All expenses for that period are confirmed by the fleet | A finalized fuel report exists for that period (tolls + fuel locked in) |
| **Payout** | The full payout picture is completely closed out | Expenses are finalized **AND** all cash owed has been returned (cashBalance <= 0) |
| **Settlement** | No changes — keeps its existing 5-state system | N/A (uses: Settled / Company Owes / Driver Owes / Pending / No Activity) |

## Payout Tab — New 3-State Status Logic

| State | Badge Color | Condition |
|---|---|---|
| **Pending** | Amber | `isFinalized === false` (fuel report not yet finalized, so deductions can't be computed) |
| **Awaiting Cash** | Blue | `isFinalized === true` AND `cashBalance > 0` (expenses confirmed, but driver still holds unreturned cash) |
| **Finalized** | Green | `isFinalized === true` AND `cashBalance <= 0` (expenses confirmed AND all cash returned) |

---

## Phase 1: Expenses Tab — Add Status Column (UI Only)

**Goal:** Add a visible Status column to the Expenses table. The data (`isFinalized`) already exists on every `ExpensePeriodRow` — this phase is purely rendering.

**File:** `DriverExpensesHistory.tsx`

### Step 1.1: Add Status column header
- In the `<TableHeader>` section (around line 393–398), add a new `<TableHead>` after "Total Expenses":
  ```
  <TableHead className="text-xs text-center">Status</TableHead>
  ```
- This goes right after the existing `<TableHead className="text-right">Total Expenses</TableHead>`.

### Step 1.2: Add Status cell rendering
- In the `<TableBody>` map (around line 401–425), add a new `<TableCell>` after the Total Expenses cell:
  - If `row.isFinalized === true` → green badge: `<CheckCircle /> Finalized`
  - If `row.isFinalized === false` → amber badge: `<Clock /> Pending`
- Badge styling should match the Payout tab's current badge style:
  - Finalized: `bg-emerald-50 text-emerald-700` with `CheckCircle` icon
  - Pending: `bg-amber-50 text-amber-700` with `Clock` icon

### Step 1.3: Add required icon imports
- `CheckCircle` and `Clock` need to be imported from `lucide-react`.
- Check existing imports first — `Loader2` is already imported but `CheckCircle` and `Clock` are not.

### Step 1.4: Verify no breakage
- The table column count must match: 5 `<TableHead>` elements and 5 `<TableCell>` elements.
- The period selector, pagination, and CSV export should be unaffected.

**Testing:** Open a driver's Expenses tab. Every row should now show either a green "Finalized" or amber "Pending" badge in the rightmost column. Rows with finalized fuel reports show green; rows without show amber.

---

## Phase 2: Expenses Tab — Tooltip, Row Tinting, CSV Update

**Goal:** Add an info tooltip to the Status header, apply subtle row background tinting, and include the status in CSV exports.

**File:** `DriverExpensesHistory.tsx`

### Step 2.1: Add tooltip to Status column header
- Import `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `../ui/tooltip` and `Info` from `lucide-react`.
- Replace the plain "Status" text in the `<TableHead>` with a tooltip-wrapped version:
  - Trigger: `Status` text + `<Info>` icon (same pattern as Settlement tab headers)
  - Content: "Whether all expenses for this period have been confirmed. 'Finalized' means a fuel report has been reviewed and locked in, so toll and fuel deduction numbers are final. 'Pending' means the fuel report hasn't been finalized yet — fuel deductions may still change."

### Step 2.2: Add subtle row background tinting
- In the `<TableRow>` element inside the map, add conditional className:
  - `row.isFinalized === false` → `className="bg-amber-50/30"`
  - `row.isFinalized === true` → `className="hover:bg-slate-50/60"`
- This matches the Payout tab's existing row tinting pattern.

### Step 2.3: Update CSV export to include Status
- In the `handleExport` function (around line 247–265), add a `'Status'` field to the CSV row object:
  - Value: `row.isFinalized ? 'Finalized' : 'Pending'`
- This should go after the existing `'Finalized': row.isFinalized ? 'Yes' : 'No'` field.
  - **Decision point:** Keep the old `'Finalized'` column for backward compatibility, or replace it with `'Status'`? Recommendation: Replace `'Finalized': row.isFinalized ? 'Yes' : 'No'` with `'Status': row.isFinalized ? 'Finalized' : 'Pending'` since the new column is more descriptive.

### Step 2.4: Verify tooltip rendering
- Confirm the tooltip appears on hover over the Status header.
- Confirm the `<Info>` icon is 3x3 and slate-400, matching Settlement tab style.

**Testing:** Hover over the Status header — tooltip should appear. Non-finalized rows should have a subtle amber tint. Export CSV and verify the "Status" column appears with correct values.

---

## Phase 3: Payout Tab — Plumb Cash Data Through Props

**Goal:** Pass the cash-related data (trips + csvMetrics) from `FinancialSubTabs` into `DriverPayoutHistory` so it can compute cash balances. No visual changes yet.

**Files:** `FinancialSubTabs.tsx`, `DriverPayoutHistory.tsx`

### Step 3.1: Update `DriverPayoutHistoryProps` interface
- In `DriverPayoutHistory.tsx`, add two new optional props to the interface (around line 42–45):
  ```typescript
  trips?: Trip[];
  csvMetrics?: DriverMetrics[];
  ```
- Import `Trip` and `DriverMetrics` from `../../types/data` (check if `Trip` is already imported — it is NOT currently imported in this file).

### Step 3.2: Accept new props in component signature
- In the function signature (line 51), destructure the new props with defaults:
  ```typescript
  export function DriverPayoutHistory({ driverId, transactions = [], trips = [], csvMetrics = [] }: DriverPayoutHistoryProps)
  ```

### Step 3.3: Pass props from FinancialSubTabs
- In `FinancialSubTabs.tsx`, update the `<DriverPayoutHistory>` usage (around line 170–173) to pass:
  ```tsx
  <DriverPayoutHistory
    driverId={driverId}
    transactions={transactions}
    trips={allTrips}
    csvMetrics={csvMetrics}
  />
  ```

### Step 3.4: Verify no breakage
- The Payout tab should render exactly as before — the new props are accepted but not yet used.
- Console should show no new warnings or errors.

**Testing:** Open the Payout tab. Everything should look and behave identically to before. Check console for any prop-related warnings.

---

## Phase 4: Payout Tab — Compute Cash Settlement Per Period

**Goal:** Use `computeWeeklyCashSettlement` to compute cash data, then merge it into each `PayoutPeriodRow` so the status logic in Phase 5 has the data it needs.

**File:** `DriverPayoutHistory.tsx`

### Step 4.1: Import cash settlement utility
- Add import: `import { computeWeeklyCashSettlement, CashWeekData } from '../../utils/cashSettlementCalc';`
- Add import: `import { differenceInCalendarDays } from 'date-fns';` — check if already imported (it IS already imported).

### Step 4.2: Extend `PayoutPeriodRow` interface
- Add three new fields to the interface (around line 23–36):
  ```typescript
  cashOwed: number;      // Cash driver collected for this period
  cashPaid: number;      // Cash driver returned for this period
  cashBalance: number;   // cashOwed - cashPaid (positive = driver still holds cash)
  ```

### Step 4.3: Compute cashWeeks via useMemo
- Add a new `useMemo` block (after the existing `isReady` gate, before `periodData`):
  ```typescript
  const cashWeeks: CashWeekData[] = useMemo(() => {
    return computeWeeklyCashSettlement({ trips, transactions, csvMetrics });
  }, [trips, transactions, csvMetrics]);
  ```
- Note: `computeWeeklyCashSettlement` always returns weekly buckets. For daily/monthly period types, we'll need to match differently (see Step 4.5).

### Step 4.4: Build cashMap and merge into ledger rows
- Inside the `periodData` useMemo (the PRIMARY PATH block, around line 214–256):
  - Build a `cashMap` keyed by Monday date string: `Map<string, CashWeekData>`
  - For each ledger row, look up the matching cash week using exact key match first, then fuzzy ±2 day match (same pattern as `SettlementSummaryView.tsx`).
  - Set `cashOwed`, `cashPaid`, `cashBalance` from the matched cash week (default 0 if no match).

### Step 4.5: Handle daily/monthly period types
- For **weekly** periods: direct match by Monday date (same as Settlement tab).
- For **daily** periods: find the parent cash week for each day. The daily row gets the full week's cash data only on the Monday row, or we prorate. **Recommendation:** For daily view, show cash as `0` on each day and add a note that cash is tracked weekly. This avoids confusing partial-day cash figures.
- For **monthly** periods: sum all cash weeks that fall within the month. Loop through cashWeeks and sum those whose `start` falls within the month's boundaries.

### Step 4.6: Update the FALLBACK PATH
- The fallback path (line 258–268) returns `[]` — it already shows empty state. No changes needed since cash fields are part of the row type and won't be rendered.

### Step 4.7: Add cashWeeks to useMemo dependencies
- Ensure `cashWeeks` is in the dependency array of the `periodData` useMemo.

### Step 4.8: Diagnostic logging
- Add a console.log showing how many cash weeks were computed and how many matched to payout periods:
  ```
  [DriverPayoutHistory] Cash weeks computed: X, matched to payout rows: Y
  ```

**Testing:** Open the Payout tab. Table should look identical (cash fields exist on data but aren't rendered yet). Check console logs to verify cash data is being computed and matched correctly. Try all three period types (weekly, daily, monthly).

---

## Phase 5: Payout Tab — New 3-State Status Logic + Badge Rendering

**Goal:** Replace the current 2-state status (Finalized/Pending) with a 3-state system that accounts for cash.

**File:** `DriverPayoutHistory.tsx`

### Step 5.1: Define status type
- Add a type near the top of the file:
  ```typescript
  type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';
  ```

### Step 5.2: Add status computation helper
- Create a function (or inline in the map) that computes status from a `PayoutPeriodRow`:
  ```typescript
  const getPayoutStatus = (row: PayoutPeriodRow): PayoutStatus => {
    if (!row.isFinalized) return 'Pending';
    if (row.cashBalance > 0.005) return 'Awaiting Cash';  // $0.005 threshold to avoid float noise
    return 'Finalized';
  };
  ```

### Step 5.3: Update Status cell rendering
- Replace the current 2-state badge rendering (lines 515–525) with 3-state:
  - **Pending** (amber): `<Clock /> Pending` — same as current
  - **Awaiting Cash** (blue): `<Wallet /> Awaiting Cash` — new state
    - Style: `bg-blue-50 text-blue-700` with `Wallet` icon
  - **Finalized** (green): `<CheckCircle /> Finalized` — same as current

### Step 5.4: Import Wallet icon
- Add `Wallet` to the lucide-react imports if not already present.

### Step 5.5: Update row background tinting
- Current: `!row.isFinalized ? 'bg-amber-50/30' : 'hover:bg-slate-50/60'`
- New:
  - Pending → `bg-amber-50/30`
  - Awaiting Cash → `bg-blue-50/30`
  - Finalized → `hover:bg-slate-50/60`

### Step 5.6: Update Net Payout cell rendering
- Currently shows "Pending" text when `!isFinalized`. This stays the same.
- When `isFinalized && cashBalance > 0` (Awaiting Cash), the net payout dollar amount should still display normally since expenses ARE confirmed — only cash is outstanding.
- No change needed here — the existing logic already shows the dollar amount when finalized.

### Step 5.7: Verify all three states appear
- A row with no finalized fuel report → Pending (amber)
- A row with finalized fuel report but cash balance > 0 → Awaiting Cash (blue)
- A row with finalized fuel report and cash balance <= 0 → Finalized (green)

**Testing:** Open the Payout tab. Verify that weeks where the driver still owes cash now show "Awaiting Cash" (blue) instead of "Finalized" (green). Weeks without fuel reports still show "Pending" (amber). Only weeks where both conditions are met show "Finalized" (green).

---

## Phase 6: Payout Tab — Update Summary Cards

**Goal:** Update the "Pending Reconciliation" summary card and potentially add context to reflect the new 3-state status.

**File:** `DriverPayoutHistory.tsx`

### Step 6.1: Compute new status counts
- In the `summaryTotals` useMemo (around line 274–286), add counts for the new states:
  ```typescript
  const awaitingCashCount = periodData.filter(r => r.isFinalized && r.cashBalance > 0.005).length;
  const pendingCount = periodData.filter(r => !r.isFinalized).length;
  const finalizedCount = periodData.filter(r => r.isFinalized && r.cashBalance <= 0.005).length;
  ```
- Replace the current `finalizedCount` and `unfinalizedCount` with these three counts.

### Step 6.2: Update "Pending Reconciliation" card
- Currently shows `unfinalizedCount` weeks. Replace with a more nuanced display:
  - If `pendingCount > 0 && awaitingCashCount > 0`:
    - Show: `"{pendingCount} pending, {awaitingCashCount} awaiting cash"`
  - If `pendingCount > 0 && awaitingCashCount === 0`:
    - Show: `"{pendingCount} weeks"` + "Awaiting fuel report finalization"
  - If `pendingCount === 0 && awaitingCashCount > 0`:
    - Show: `"{awaitingCashCount} weeks"` + "Awaiting cash return from driver"
  - If both are 0:
    - Show: "All clear" (same as current)

### Step 6.3: Update card icon/color logic
- Current: amber when `unfinalizedCount > 0`, green when all done.
- New: amber when any pending OR awaiting cash, green only when all finalized.

### Step 6.4: Update "Net Payout" card subtitle
- Currently says "From X of Y weeks finalized". Update to use the new `finalizedCount` which now means truly finalized (expenses + cash).

### Step 6.5: Verify card accuracy
- The summary card numbers should be consistent with the table badges:
  - Count of green "Finalized" badges = `finalizedCount`
  - Count of blue "Awaiting Cash" badges = `awaitingCashCount`
  - Count of amber "Pending" badges = `pendingCount`

**Testing:** Verify the summary cards reflect the correct counts. Cross-reference with the table to ensure consistency.

---

## Phase 7: CSV Exports — Update Both Tabs

**Goal:** Ensure CSV exports from both Expenses and Payout tabs include the correct status values.

**Files:** `DriverExpensesHistory.tsx`, `DriverPayoutHistory.tsx`

### Step 7.1: Expenses CSV — finalize status field
- Confirm the CSV export (updated in Phase 2, Step 2.3) includes the `'Status'` field.
- If Phase 2 replaced `'Finalized'` with `'Status'`, verify this is working.

### Step 7.2: Payout CSV — update status field
- In the `handleExport` function of `DriverPayoutHistory.tsx` (around line 305–336):
  - Replace `'Finalized': row.isFinalized ? 'Yes' : 'No'` with:
    ```typescript
    'Status': getPayoutStatus(row),
    ```
  - This will output "Finalized", "Awaiting Cash", or "Pending" as text values.

### Step 7.3: Payout CSV — add cash columns
- Add three new fields to the CSV export:
  ```typescript
  'Cash Owed': row.cashOwed.toFixed(2),
  'Cash Paid': row.cashPaid.toFixed(2),
  'Cash Balance': row.cashBalance.toFixed(2),
  ```
- These go after "Net Payout" and before "Status".

### Step 7.4: Verify CSV output
- Export CSVs from both tabs and verify all columns are present with correct values.

**Testing:** Export CSV from both Expenses and Payout tabs. Open in a spreadsheet and verify all new columns appear with correct data.

---

## Phase 8: Tooltips and Cross-Tab Consistency Polish

**Goal:** Add info tooltips to both tabs' Status headers and do a final consistency review across all four financial sub-tabs.

**Files:** `DriverExpensesHistory.tsx`, `DriverPayoutHistory.tsx`, `SettlementSummaryView.tsx`

### Step 8.1: Expenses tab — Status tooltip (if not done in Phase 2)
- Confirm Phase 2 Step 2.1 tooltip is in place. If so, this is already done.

### Step 8.2: Payout tab — Add Status tooltip
- Add tooltip to the Payout tab's Status column header:
  - Import `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `../ui/tooltip` and `Info` from `lucide-react`.
  - Content: "The completion status of this period's payout. 'Pending' = the fuel report hasn't been finalized yet, so deductions can't be fully computed. 'Awaiting Cash' = all expenses are confirmed, but the driver still has unreturned cash for this period. 'Finalized' = expenses are confirmed AND all cash has been returned — this week is fully closed out."

### Step 8.3: Payout tab — Add tooltips to other column headers
- While we're adding tooltips, add info tooltips to other Payout column headers for consistency with the Settlement tab:
  - **Period:** "The time period for this payout row. When in weekly mode, this is Monday–Sunday."
  - **Gross Revenue:** "Total trip earnings before any commission split or deductions."
  - **Driver Share:** "The driver's portion of gross revenue based on their tier commission split."
  - **Deductions:** "Total deductions subtracted from Driver Share (tolls + fuel). Shows '—' if the fuel report isn't finalized yet."
  - **Net Payout:** "Driver Share minus Deductions. This is what the company owes the driver before accounting for cash. Shows 'Pending' if expenses aren't finalized."

### Step 8.4: Cross-tab terminology review
- Verify that "Finalized" means the same thing contextually in each tab:
  - Expenses: "expenses are locked in"
  - Payout: "expenses locked in AND cash returned"
  - Settlement: does NOT use "Finalized" — uses its own 5-state system (no conflict)
- Verify Settlement tab's "Pending" tooltip still accurately describes its meaning (ledger not finalized), which is different from Payout's "Pending" (fuel report not finalized). These are conceptually the same trigger but described differently — confirm the tooltip wording is clear enough to avoid confusion.

### Step 8.5: Settlement tab — verify no changes needed
- Confirm the Settlement tab's status logic is unaffected by these changes.
- The Settlement tab's "Pending" = `!isFinalized && grossRevenue > 0`, which is the same underlying check as the Expenses tab. This is fine — they're looking at the same data from different angles.

### Step 8.6: Clean up unused imports
- Check if the previously noted unused `AlertTriangle` import in `SettlementSummaryView.tsx` should be removed (it was carried forward from Phase 6 of the 7-phase plan). This is optional but keeps the codebase clean.

### Step 8.7: Final smoke test checklist
- [ ] Expenses tab: Status column visible with correct badges
- [ ] Expenses tab: Tooltip on Status header works
- [ ] Expenses tab: Row tinting matches status
- [ ] Expenses tab: CSV includes Status column
- [ ] Payout tab: 3-state status badges render correctly
- [ ] Payout tab: Tooltip on Status header works
- [ ] Payout tab: Summary cards reflect 3-state counts
- [ ] Payout tab: Row tinting matches 3 states
- [ ] Payout tab: CSV includes Status + cash columns
- [ ] Settlement tab: Unchanged, all 5 states still work
- [ ] No console errors or warnings (beyond known `_fg*` noise)
- [ ] All period types (daily/weekly/monthly) work in both Expenses and Payout tabs

**Testing:** Full walkthrough of all four financial sub-tabs. Verify visual consistency, tooltip accuracy, and CSV correctness.

---

## Summary of Files Modified Per Phase

| Phase | Files Modified |
|---|---|
| 1 | `DriverExpensesHistory.tsx` |
| 2 | `DriverExpensesHistory.tsx` |
| 3 | `FinancialSubTabs.tsx`, `DriverPayoutHistory.tsx` |
| 4 | `DriverPayoutHistory.tsx` |
| 5 | `DriverPayoutHistory.tsx` |
| 6 | `DriverPayoutHistory.tsx` |
| 7 | `DriverExpensesHistory.tsx`, `DriverPayoutHistory.tsx` |
| 8 | `DriverExpensesHistory.tsx`, `DriverPayoutHistory.tsx`, `SettlementSummaryView.tsx` (optional cleanup) |

## Risk Assessment

- **Phase 1–2 (Expenses Status):** Very low risk. Adding a read-only column using data that already exists. No logic changes.
- **Phase 3 (Prop plumbing):** Low risk. Adding optional props with defaults — existing behavior unchanged.
- **Phase 4 (Cash computation):** Medium risk. New computation logic in the Payout tab. The `computeWeeklyCashSettlement` utility is battle-tested from the Settlement tab, but the date-matching for daily/monthly periods is new.
- **Phase 5 (3-state status):** Medium risk. Changing visible status badges — fleet managers will see different statuses than before. This is intentional and correct, but needs to be verified carefully.
- **Phase 6 (Summary cards):** Low risk. Display-only changes to card text and counts.
- **Phase 7 (CSV exports):** Low risk. Adding columns to CSV output.
- **Phase 8 (Tooltips/polish):** Very low risk. Tooltip additions and consistency review.
