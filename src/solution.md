# Toll Reconciliation: Enterprise Architecture Upgrade Plan

## Status: ALL 8 PHASES COMPLETE

## Architecture Context

### Current State (Pre-Fix)
The Toll Reconciliation section is the last major financial feature still using
the "prototype" architecture:
- Downloads ALL trips + ALL transactions to the browser (`fetchAllTrips()` + `fetchAllTransactions()`)
- All matching logic (`findTollMatches()`) runs client-side
- Reconciliation actions are raw KV puts from the browser (`api.saveTransaction()`)
- No ledger entries are written when tolls are reconciled/approved/rejected
- No connection to Settlement, Payout, or Expenses sub-tabs
- No driver scoping -- loads every driver's data at once
- No pagination on any list

### Target State (Post-Fix)
- Server-side toll summary endpoint (driver-scoped, ledger-aware)
- Server-side reconciliation controller with validation + ledger writes
- Hook uses server endpoints instead of full data dumps
- All 3 tab lists have pagination
- Driver Financials > Expenses sub-tab shows per-driver toll reconciliation status
- Settlement/Payout overlays show toll line items from the ledger
- DriverDetail lifetime toll numbers match Toll Reconciliation exactly

### Key Discovery
The ledger ALREADY records toll data:
- `generateTripLedgerEntries()` (index.tsx L270-284) creates `toll_charge` entries from trips
- `generateTransactionLedgerEntry()` (index.tsx L319) creates `toll_charge` entries from transactions
- The Toll Reconciliation section completely ignores these ledger entries

---

## Phase 1: Quick Wins (Bug Fixes)

**Goal:** Fix the two bugs causing incorrect numbers. Zero architectural change.
**Risk:** Minimal -- one new helper, two filter changes.
**Files touched:** NEW `/utils/tollCategoryHelper.ts`, EDIT `/hooks/useTollReconciliation.ts`

### Step 1.1: Create `isTollCategory()` helper

**File:** `/utils/tollCategoryHelper.ts` (NEW)

**What:** Create a single source-of-truth function that checks whether a
category string represents a toll transaction. Today this check is
hardcoded as `tx.category === 'Toll Usage' || tx.category === 'Tolls'`
in 5+ locations across:
- `/hooks/useTollReconciliation.ts` (lines 59, 82)
- `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx` (indirectly via hook)
- `/services/api.ts` (line 643 in `getPendingCashTolls`)
- `/components/drivers/DriverExpensesHistory.tsx` (line 185 keyword match)

**Implementation:**
```ts
// /utils/tollCategoryHelper.ts
export function isTollCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return lower === 'toll usage' || lower === 'tolls';
}
```

**Why case-insensitive:** CSV imports sometimes have inconsistent casing.
Making this case-insensitive future-proofs against data quality issues.

**Testing:** This is a pure function with no side effects. Verify:
- `isTollCategory('Toll Usage')` -> true
- `isTollCategory('Tolls')` -> true
- `isTollCategory('tolls')` -> true
- `isTollCategory('Fuel')` -> false
- `isTollCategory(undefined)` -> false
- `isTollCategory(null)` -> false

### Step 1.2: Fix `linkedTripIds` filter in `useTollReconciliation.ts`

**File:** `/hooks/useTollReconciliation.ts`
**Lines:** 88-93

**Current code (BROKEN):**
```ts
const linkedTripIds = new Set(
  allTx
    .filter(tx => tx.tripId)
    .map(tx => tx.tripId)
);
```

**Problem:** This collects trip IDs from ALL transactions that have a
`tripId` -- including Uber CSV earnings records, fuel transactions, etc.
Since Uber earnings records are linked to trips, virtually every trip ends
up in `linkedTripIds`, which means they're excluded from the "Unclaimed
Refunds" list. Result: only ~10 unclaimed refunds show up instead of 500+.

**Fixed code:**
```ts
const linkedTripIds = new Set(
  allTx
    .filter(tx => tx.tripId && isTollCategory(tx.category))
    .map(tx => tx.tripId)
);
```

**Import to add at top of file:**
```ts
import { isTollCategory } from '../utils/tollCategoryHelper';
```

**What changes:** Only toll-category transactions contribute to the
"linked" set. Earnings records, fuel records, etc. no longer pollute it.

**Expected result:** The "Unclaimed Refunds" tab will show all trips where
`tollCharges > 0` but no toll-category transaction has been linked to them.
Count should jump from ~10 to 500+ items. Dollar amount from ~$3,395 to
$31,855+.

### Step 1.3: Replace hardcoded category checks with `isTollCategory()`

**File:** `/hooks/useTollReconciliation.ts`
**Lines:** 58-59, 81-82

**Change 1 (line 59):**
- Before: `const isToll = tx.category === 'Toll Usage' || tx.category === 'Tolls';`
- After: `const isToll = isTollCategory(tx.category);`

**Change 2 (line 82):**
- Before: `(tx.category === 'Toll Usage' || tx.category === 'Tolls') &&`
- After: `isTollCategory(tx.category) &&`

**Note:** We do NOT change `/services/api.ts` line 643 or
`/components/drivers/DriverExpensesHistory.tsx` line 185 in this phase.
Those will be addressed in Phase 6 (Driver Section Integration) to avoid
touching more files than necessary in Phase 1.

### Phase 1 Verification Checklist
- [ ] New file `/utils/tollCategoryHelper.ts` created
- [ ] `useTollReconciliation.ts` imports `isTollCategory`
- [ ] `linkedTripIds` filter includes `isTollCategory(tx.category)` check
- [ ] Lines 59 and 82 use `isTollCategory()` instead of hardcoded checks
- [ ] Unclaimed Refunds tab count increases significantly
- [ ] Unclaimed Refunds dollar amount increases to $31K+ range
- [ ] Unmatched Tolls tab still shows correct items (no regression)
- [ ] Matched History tab still shows correct items (no regression)
- [ ] Auto-match still works
- [ ] Manual match still works
- [ ] Approve/Reject/Flag actions still work

---

## Phase 2: Server-Side Toll Summary Endpoint

**Goal:** Create a new server endpoint that returns toll reconciliation
data scoped to a specific driver (or fleet-wide), querying the ledger
instead of dumping all data to the client.
**Risk:** None -- purely additive (new file, new route).
**Files touched:** NEW `/supabase/functions/server/toll_controller.tsx`,
EDIT `/supabase/functions/server/index.tsx` (mount the new controller)

### Step 2.1: Create `toll_controller.tsx` scaffold

**File:** `/supabase/functions/server/toll_controller.tsx` (NEW)

**What:** Create a new Hono sub-app for toll reconciliation, following the
same pattern as `fuel_controller.tsx`.

**Structure:**
```
BASE_PATH = '/make-server-37f42386/toll-reconciliation'

Routes:
  GET  /summary          -- Aggregated summary (4 cards data)
  GET  /unreconciled      -- Paginated list of unmatched tolls
  GET  /unclaimed-refunds -- Paginated list of trips with refunds but no matched expense
  GET  /reconciled        -- Paginated list of matched history
```

**All routes accept query params:**
- `driverId` (optional) -- scope to one driver, omit for fleet-wide
- `limit` (optional, default 50)
- `offset` (optional, default 0)

### Step 2.2: Implement `GET /summary` endpoint

**What:** Returns the 4 summary card values without sending all raw data.

**Server-side logic:**
1. Query KV: `kv.getByPrefix('transaction:')` -- get all transactions
2. Filter to toll-category transactions only (server-side `isTollCategory`)
3. If `driverId` provided, filter to that driver
4. Query KV: `kv.getByPrefix('trip:')` -- get all trips
5. If `driverId` provided, filter to that driver
6. Compute:
   - `unreconciledCount` / `unreconciledAmount`: tolls where `!isReconciled || !tripId`
   - `reconciledCount` / `recoveredAmount`: tolls where `isReconciled && tripId`
   - `unclaimedCount` / `unclaimedAmount`: trips with `tollCharges > 0` not linked to any toll tx
   - `driverLiability`: personal/unmatched amounts
7. Return JSON summary object

**Response shape:**
```json
{
  "success": true,
  "summary": {
    "claimableAmount": 1234.56,
    "recoveredAmount": 5678.90,
    "driverLiability": 234.56,
    "unclaimedRefundsAmount": 31855.00,
    "unreconciledCount": 45,
    "reconciledCount": 200,
    "unclaimedRefundsCount": 520,
    "totalTollTransactions": 245
  }
}
```

### Step 2.3: Implement `GET /unreconciled` endpoint

**What:** Returns paginated unmatched toll transactions with pre-computed
match suggestions.

**Server-side logic:**
1. Get toll transactions where `!isReconciled || !tripId`
2. Exclude transactions with active claims (query `claim:` prefix)
3. For each toll, run the Three-Window matching algorithm server-side
   (port `findTollMatches()` logic to the controller)
4. Sort by date descending
5. Apply pagination (limit/offset)
6. Return items + total count + suggestions

**Key decision:** The matching algorithm (`findTollMatches`) currently lives
in `/utils/tollReconciliation.ts` (frontend). We need to PORT this logic
to the server. We do NOT import it because server code cannot import from
outside `/supabase/functions/server/`.

**What to port:**
- `findTollMatches()` function
- `calculateTripTimes()` and `getTripWindows()` from `/utils/timeUtils.ts`
- `isWithinInterval` and `differenceInMinutes` from `date-fns` (available via `npm:date-fns`)

**Response shape:**
```json
{
  "success": true,
  "data": [ /* toll transactions with embedded suggestions */ ],
  "total": 45,
  "limit": 50,
  "offset": 0
}
```

### Step 2.4: Implement `GET /unclaimed-refunds` endpoint

**What:** Returns paginated trips that have `tollCharges > 0` but no
linked toll transaction.

**Server-side logic:**
1. Get all trips with `tollCharges > 0`
2. If `driverId` provided, filter to that driver
3. Get all toll-category transactions with a `tripId`
4. Build `linkedTripIds` set (same corrected logic from Phase 1)
5. Filter trips to those NOT in `linkedTripIds`
6. Sort by date descending
7. Apply pagination

**Response shape:**
```json
{
  "success": true,
  "data": [ /* trips */ ],
  "total": 520,
  "limit": 50,
  "offset": 0
}
```

### Step 2.5: Implement `GET /reconciled` endpoint

**What:** Returns paginated reconciled toll history.

**Server-side logic:**
1. Get toll-category transactions where `isReconciled && tripId`
2. If `driverId` provided, filter
3. For each, look up the linked trip to include refund amount
4. Sort by date descending
5. Apply pagination

### Step 2.6: Mount the controller in `index.tsx`

**File:** `/supabase/functions/server/index.tsx`

**What:** Import and mount the toll controller sub-app.

**Add:**
```ts
import { tollApp } from './toll_controller.tsx';
app.route('/', tollApp);
```

**Pattern:** Same as how `fuelApp` from `fuel_controller.tsx` is mounted.

### Step 2.7: Add CORS handling to toll controller

**What:** Ensure the toll controller responds with open CORS headers,
matching the pattern used by the fuel controller.

### Phase 2 Verification Checklist
- [ ] New file `/supabase/functions/server/toll_controller.tsx` created
- [ ] GET /summary returns correct 4-card aggregates
- [ ] GET /summary with `driverId` returns driver-scoped data
- [ ] GET /unreconciled returns paginated toll transactions
- [ ] GET /unclaimed-refunds returns paginated trips (count matches Phase 1 fix)
- [ ] GET /reconciled returns paginated history
- [ ] Controller mounted in index.tsx
- [ ] CORS headers present on all responses
- [ ] No regressions on existing routes

---

## Phase 3: Server-Side Reconciliation Actions

**Goal:** Move reconcile/unreconcile/approve/reject from client-side KV
puts to proper server-side controller routes with validation and ledger
writes.
**Risk:** None -- new routes. Existing client code continues working until
Phase 4 switches it over.
**Files touched:** EDIT `/supabase/functions/server/toll_controller.tsx`

### Step 3.1: Implement `POST /reconcile` endpoint

**Route:** `POST /toll-reconciliation/reconcile`

**Request body:**
```json
{
  "transactionId": "tx_abc123",
  "tripId": "trip_xyz456"
}
```

**Server-side logic:**
1. Load the transaction from KV (`transaction:{transactionId}`)
2. Validate: transaction exists, is a toll category, is not already reconciled
3. Load the trip from KV (`trip:{tripId}`)
4. Validate: trip exists
5. Update transaction: set `tripId`, `isReconciled = true`, copy `driverId`/`driverName` from trip
6. Save updated transaction to KV
7. **Write a ledger entry:**
   ```
   eventType: 'toll_reconciled'
   category: 'Toll Reconciliation'
   description: 'Toll matched to trip {tripId}'
   grossAmount: Math.abs(transaction.amount)
   netAmount: 0  (net-zero because expense is offset by refund)
   direction: 'neutral'
   sourceType: 'reconciliation'
   sourceId: transactionId
   metadata: { tripId, matchedAt, matchedBy: 'admin' }
   ```
8. Return updated transaction + trip

### Step 3.2: Implement `POST /unreconcile` endpoint

**Route:** `POST /toll-reconciliation/unreconcile`

**Request body:**
```json
{
  "transactionId": "tx_abc123"
}
```

**Server-side logic:**
1. Load transaction, validate it exists and is currently reconciled
2. Save the current `tripId` before clearing (for the reversal ledger entry)
3. Update transaction: set `tripId = null`, `isReconciled = false`
4. Save to KV
5. **Write a reversal ledger entry:**
   ```
   eventType: 'toll_unreconciled'
   category: 'Toll Reconciliation'
   description: 'Toll unmatched from trip {oldTripId}'
   metadata: { previousTripId, unmatchedAt }
   ```
6. Return updated transaction

### Step 3.3: Implement `POST /bulk-reconcile` endpoint

**Route:** `POST /toll-reconciliation/bulk-reconcile`

**Request body:**
```json
{
  "matches": [
    { "transactionId": "tx_1", "tripId": "trip_a" },
    { "transactionId": "tx_2", "tripId": "trip_b" }
  ]
}
```

**Server-side logic:**
1. Validate all transaction IDs and trip IDs exist
2. Process each match (same logic as Step 3.1)
3. Batch KV writes using `kv.mset()` for efficiency
4. Batch ledger entries using `kv.mset()`
5. Return summary: `{ matched: N, failed: M, errors: [...] }`

**Why this matters:** The current `autoMatchAll` makes sequential API calls
in a for-loop. With 200 matches, that's 200 round trips. This endpoint
does it in 1 call.

### Step 3.4: Implement `POST /resolve` endpoint

**Route:** `POST /toll-reconciliation/resolve`

**Request body:**
```json
{
  "transactionId": "tx_abc123",
  "resolution": "Personal" | "WriteOff" | "Business",
  "notes": "optional admin notes"
}
```

**Server-side logic:**
1. Load the transaction
2. Based on resolution type:
   - `Personal` -> set status to 'Rejected', create claim with `resolutionReason: 'Charge Driver'`
   - `WriteOff` -> set status to 'Approved', create claim with `resolutionReason: 'Write Off'`
   - `Business` -> set status to 'Approved', create claim with `resolutionReason: 'Write Off'`
3. Write ledger entry with `eventType: 'toll_resolved'`
4. Return updated transaction

### Step 3.5: Implement `POST /approve` and `POST /reject` endpoints

**Routes:**
- `POST /toll-reconciliation/approve` (for cash toll claims)
- `POST /toll-reconciliation/reject` (for cash toll claims)

**These mirror the existing `/expenses/approve` and `/expenses/reject` but
add toll-specific ledger entries.**

### Phase 3 Verification Checklist
- [ ] POST /reconcile links a toll to a trip + writes ledger entry
- [ ] POST /reconcile rejects already-reconciled transactions
- [ ] POST /reconcile rejects non-toll transactions
- [ ] POST /unreconcile unlinks + writes reversal ledger entry
- [ ] POST /bulk-reconcile processes multiple matches in one call
- [ ] POST /resolve handles all 3 resolution types
- [ ] POST /approve and /reject work for cash toll claims
- [ ] All endpoints return proper error messages on failure
- [ ] Ledger entries are created with correct eventType, amounts, metadata
- [ ] Existing frontend still works (hasn't been switched yet)

---

## Phase 4: Rewrite Hook to Use Server Endpoints

**Goal:** Replace the full-dump client-side logic in `useTollReconciliation.ts`
with calls to the Phase 2/3 server endpoints. The hook's PUBLIC API stays
identical so zero changes are needed in the 6 UI components.
**Risk:** Low -- UI components don't change. Only the data source changes.
**Files touched:** EDIT `/hooks/useTollReconciliation.ts`,
EDIT `/services/api.ts` (add new API methods)

### Step 4.1: Add new API methods to `api.ts`

**File:** `/services/api.ts`

**Add these methods:**
```ts
async getTollSummary(driverId?: string) { ... }
async getTollUnreconciled(params: { driverId?: string; limit?: number; offset?: number }) { ... }
async getTollUnclaimedRefunds(params: { driverId?: string; limit?: number; offset?: number }) { ... }
async getTollReconciled(params: { driverId?: string; limit?: number; offset?: number }) { ... }
async reconcileToll(transactionId: string, tripId: string) { ... }
async unreconcileToll(transactionId: string) { ... }
async bulkReconcileTolls(matches: Array<{ transactionId: string; tripId: string }>) { ... }
async resolveToll(transactionId: string, resolution: string, notes?: string) { ... }
```

Each method calls the corresponding Phase 2/3 endpoint.

### Step 4.2: Rewrite `fetchData()` in the hook

**File:** `/hooks/useTollReconciliation.ts`

**Remove:**
- `fetchAllTrips()` helper function (lines 7-18)
- `fetchAllTransactions()` helper function (lines 21-32)

**Replace `fetchData()` body (lines 42-119):**

Old flow:
1. Download ALL transactions
2. Download ALL trips
3. Deduplicate
4. Filter toll transactions client-side
5. Build linkedTripIds client-side
6. Run findTollMatches client-side
7. Set all state

New flow:
1. Call `api.getTollUnreconciled()` -> set unreconciledTolls + suggestions
2. Call `api.getTollReconciled()` -> set reconciledTolls
3. Call `api.getTollUnclaimedRefunds()` -> set unclaimedRefunds
4. (Optional) Call `api.getTollSummary()` for aggregate card values

All 3 calls happen in parallel via `Promise.all()`.

### Step 4.3: Rewrite action methods to use server endpoints

**Replace `reconcile()` (lines 125-157):**
- Old: `api.reconcileTollTransaction(transaction, trip)` (client-side KV put)
- New: `api.reconcileToll(transaction.id, trip.id)` (server-side with validation)

**Replace `unreconcile()` (lines 159-213):**
- Old: `api.unreconcileTollTransaction(transaction, trip)` (client-side KV put)
- New: `api.unreconcileToll(transaction.id)` (server-side with reversal ledger)

**Replace `autoMatchAll()` (lines 268-310):**
- Old: Sequential for-loop calling `api.reconcileTollTransaction()` one at a time
- New: Single call to `api.bulkReconcileTolls(highConfidenceMatches)`

**Replace `approve()` and `reject()`:**
- These already call server endpoints (`api.approveExpense`, `api.rejectExpense`)
- Update to call the toll-specific versions that also write ledger entries

### Step 4.4: Keep the public API identical

**Critical:** The hook's return signature must NOT change:
```ts
return {
  loading,
  unreconciledTolls,    // same type: FinancialTransaction[]
  reconciledTolls,      // same type: FinancialTransaction[]
  unclaimedRefunds,     // same type: Trip[]
  trips,                // same type: Trip[] (may need for ManualMatchModal)
  suggestions,          // same type: Map<string, MatchResult[]>
  reconcile,            // same signature
  unreconcile,          // same signature
  approve,              // same signature
  reject,               // same signature
  autoMatchAll,         // same signature
  refresh,              // same signature
};
```

**Special case -- `trips`:** The `ManualMatchModal` needs the full trip list
for the manual search feature. We may need to keep a way to fetch trips on
demand (lazy-load when the modal opens) rather than pre-loading them all.

### Step 4.5: Remove old helper functions

**Remove from `/hooks/useTollReconciliation.ts`:**
- `fetchAllTrips()` (lines 7-18)
- `fetchAllTransactions()` (lines 21-32)

**Remove from `/utils/tollReconciliation.ts`:**
- `findTollMatches()` is still needed for the `ManualMatchModal` (client-side
  search). Keep it but mark it as "used only for manual match UI fallback."

### Phase 4 Verification Checklist
- [ ] Hook loads data from server endpoints (not full data dump)
- [ ] Network tab shows 3 targeted API calls instead of paginated full dumps
- [ ] Unmatched Tolls tab displays correctly
- [ ] Unclaimed Refunds tab displays correctly
- [ ] Matched History tab displays correctly
- [ ] Summary cards show correct values
- [ ] Reconcile action works end-to-end
- [ ] Unreconcile action works end-to-end
- [ ] Auto-match uses bulk endpoint
- [ ] Manual match modal still works
- [ ] Approve/Reject/Flag actions still work
- [ ] No console errors
- [ ] Page loads faster than before (network payload reduced)

---

## Phase 5: UI Pagination & Driver Filter

**Goal:** Add pagination to all 3 tab lists and a driver filter dropdown
to the admin dashboard.
**Risk:** Low -- pure UI changes, no data model changes.
**Files touched:**
- EDIT `/components/toll-tags/reconciliation/UnmatchedTollsList.tsx`
- EDIT `/components/toll-tags/reconciliation/UnclaimedRefundsList.tsx`
- EDIT `/components/toll-tags/reconciliation/ReconciledTollsList.tsx`
- EDIT `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx`

### Step 5.1: Add pagination to `UnclaimedRefundsList.tsx`

**Pattern:** Match the "Show more" pagination pattern used in
`SettlementSummaryView.tsx`'s period table.

**Changes:**
1. Add `visibleCount` state (default 25)
2. Slice the trips array: `trips.slice(0, visibleCount)`
3. Add "Show More" button at bottom if `visibleCount < trips.length`
4. Show "{visibleCount} of {trips.length}" count

### Step 5.2: Add pagination to `UnmatchedTollsList.tsx`

**Same pattern as Step 5.1 applied to:**
- The `smartMatches` list (default 10 visible)
- The `otherTolls` table (default 25 visible)

### Step 5.3: Add pagination to `ReconciledTollsList.tsx`

**Same pattern as Step 5.1.**
Default 25 visible.

### Step 5.4: Add driver filter to `ReconciliationDashboard.tsx`

**What:** Add a driver dropdown filter at the top of the dashboard.

**Implementation:**
1. Fetch driver list on mount: `api.getDrivers()`
2. Add a `<select>` (native, per project constraints on Radix Select)
   with options: "All Drivers" + each driver name
3. When a driver is selected, pass `driverId` to the hook
4. This requires updating the hook to accept an optional `driverId` param
   that gets forwarded to the server endpoints

**Hook change:**
```ts
export function useTollReconciliation(driverId?: string) {
  // ... pass driverId to all API calls
}
```

### Step 5.5: Update tab badges to show total (not just visible)

**What:** The tab badges currently show `unreconciledTolls.length`. After
pagination, they should still show the TOTAL count (from the server
response's `total` field), not just the currently visible subset.

### Phase 5 Verification Checklist
- [ ] Unclaimed Refunds list shows 25 items initially with "Show More"
- [ ] Clicking "Show More" loads next batch
- [ ] Unmatched Tolls shows 10 smart matches + 25 table rows initially
- [ ] Matched History shows 25 items initially
- [ ] Driver filter dropdown appears at top of dashboard
- [ ] Selecting a driver filters all 3 tabs + summary cards
- [ ] "All Drivers" shows fleet-wide data
- [ ] Tab badges show total counts, not visible counts
- [ ] No layout shifts when paginating

---

## Phase 6: Driver Section Integration

**Goal:** Add toll reconciliation visibility to the per-driver Financials
section (Expenses sub-tab).
**Risk:** Medium -- touches `DriverExpensesHistory.tsx` which is used by
every driver page.
**Files touched:**
- EDIT `/components/drivers/DriverExpensesHistory.tsx`
- EDIT `/services/api.ts` (if not already done in Phase 4)

### Step 6.1: Add toll summary card to `DriverExpensesHistory`

**What:** Above the period table, add a compact summary card showing:
- Total Toll Charges (from tag imports)
- Total Platform Refunds (from trip data)
- Reconciled count
- Unclaimed Refunds count
- Net Toll Exposure

**Data source:** Call `api.getTollSummary(driverId)` (Phase 2 endpoint).

**Layout:** Single row of 5 small stat boxes (similar to the 4 cards on
the admin Reconciliation Dashboard, but more compact).

### Step 6.2: Add reconciliation status column to the period table

**What:** Add a "Toll Status" column to the existing expenses period table.

**For each period row, show:**
- Green checkmark + "Reconciled" if all tolls in that period are matched
- Amber warning + "X Unmatched" if there are unmatched tolls
- Gray dash if no tolls in that period

**Data source:** The server's `/unreconciled` endpoint scoped to the driver
can provide this, or we derive it from the existing transaction data
already passed to the component (less accurate but no new API call).

**Recommended approach:** Use the transaction data already available in the
component (passed as `transactions` prop) and apply `isTollCategory()`
to determine toll reconciliation status per period. This avoids adding
a new API call and works with existing data flow.

### Step 6.3: Replace hardcoded toll category check in `DriverExpensesHistory`

**File:** `/components/drivers/DriverExpensesHistory.tsx`
**Line:** 185

**Current:**
```ts
if (desc.includes('toll') || desc.includes('e-toll') || desc.includes('highway')) {
```

**Replace with:**
```ts
import { isTollCategory } from '../../utils/tollCategoryHelper';
// ...
if (isTollCategory(tx.category)) {
```

**Why:** The current keyword matching (`desc.includes('toll')`) would
match things like "Toll-free highway" or "Tollgate Road Maintenance".
Using the same `isTollCategory()` helper ensures consistency with the
Toll Reconciliation section.

### Step 6.4: Replace hardcoded toll category check in `api.ts`

**File:** `/services/api.ts`
**Line:** 643

**Current:**
```ts
return allTx.filter(tx =>
    (tx.category === 'Toll Usage' || tx.category === 'Tolls') &&
    tx.status === 'Pending' &&
    (tx.paymentMethod === 'Cash' || !!tx.receiptUrl)
);
```

**Replace the category check with `isTollCategory(tx.category)`.**

### Phase 6 Verification Checklist
- [ ] Toll summary card appears above the period table in Expenses
- [ ] Summary card shows correct aggregate values for the specific driver
- [ ] Period table shows "Toll Status" column with reconciliation status
- [ ] `isTollCategory()` used consistently in DriverExpensesHistory
- [ ] `isTollCategory()` used consistently in api.ts getPendingCashTolls
- [ ] No regression on Fuel Deduction column
- [ ] No regression on period totals
- [ ] Card appears only when driver has toll data (hide if zero)
- [ ] Works for drivers with no toll data (graceful empty state)

---

## Phase 7: Settlement/Payout Toll Awareness

**Goal:** Because Phase 3 writes ledger entries on reconciliation actions,
Settlement and Payout overlays can now show toll line items.
**Risk:** Low -- additive UI in existing overlay components.
**Files touched:**
- EDIT `/components/drivers/SettlementPeriodDetail.tsx`
- EDIT `/components/drivers/PayoutPeriodDetail.tsx`

### Step 7.1: Add "Tolls" line item to Settlement Period Detail

**File:** `/components/drivers/SettlementPeriodDetail.tsx`

**What:** In the "Payout Breakdown" section of the settlement overlay,
add a "Tolls" row showing the total toll charges for that period.

**Data source:** The settlement overlay already has access to the period's
transactions. Filter for `isTollCategory()` and sum amounts.

**Display:**
```
  Fare Earnings     $2,340.00
  Tips                $156.00
  Tolls              -$120.00  <-- NEW
  Platform Fees      -$234.00
```

### Step 7.2: Add toll reconciliation indicator

**What:** Next to the Tolls line item, show a small badge:
- "3/3 Matched" (green) if all toll transactions in the period are reconciled
- "1/3 Matched" (amber) if some are unmatched

**Data source:** Check `isReconciled` field on the toll transactions.

### Step 7.3: Add toll line to Payout Period Detail

**File:** `/components/drivers/PayoutPeriodDetail.tsx`

**What:** In the "Deductions" section, add a "Tolls" row showing toll
charges deducted from the payout.

**Also:** Add a tooltip on the Tolls line showing:
"Includes $X in toll charges (Y reconciled, Z pending)"

### Phase 7 Verification Checklist
- [ ] Settlement overlay shows "Tolls" line in payout breakdown
- [ ] Tolls amount is correct for the period
- [ ] Reconciliation badge shows correct matched/unmatched counts
- [ ] Payout overlay shows "Tolls" in deductions section
- [ ] Tooltip on Payout tolls line shows reconciliation status
- [ ] Periods with no tolls show no toll line (not $0.00)
- [ ] No regression on existing line items

---

## Phase 8: Consistency & Cleanup

**Goal:** Ensure every page in the system agrees on toll numbers. Remove
dead code from the prototype architecture.
**Risk:** Medium -- touches `DriverDetail.tsx` (whitespace-sensitive file,
single-line edits only).
**Files touched:**
- EDIT `/components/drivers/DriverDetail.tsx` (single-line edits)
- EDIT `/hooks/useTollReconciliation.ts` (cleanup)
- EDIT `/utils/tollReconciliation.ts` (mark deprecated functions)

### Step 8.1: Fix DriverDetail.tsx lifetime toll calculation

**File:** `/components/drivers/DriverDetail.tsx`
**Lines:** 1283-1284

**Current (independent calculation):**
```ts
if (trip.tollCharges && !effectiveCash) {
    lifetimeTolls += trip.tollCharges;
}
```

**Problem:** This calculates lifetime tolls independently from the Toll
Reconciliation section. It sums `tollCharges` from trips but doesn't
account for reconciliation status. The number will always disagree with
what Toll Reconciliation shows.

**Fix:** Keep the existing calculation (it's showing "total platform
refunds," which is valid) but rename the label from "Tolls" to
"Platform Toll Refunds" to clarify what it represents. The reconciliation
view shows the full picture; this is just one component.

**This is a SINGLE-LINE edit** (label text change only) to respect the
DriverDetail.tsx whitespace constraint.

### Step 8.2: Clean up `useTollReconciliation.ts` dead code

**What:** After Phase 4, the following are no longer needed:
- `fetchAllTrips()` function
- `fetchAllTransactions()` function
- Client-side deduplication logic (lines 51-53)
- Client-side `findTollMatches()` calls in `fetchData()`
- The `trips` state (unless still needed for ManualMatchModal)

**Action:** Remove dead code, add comments explaining the new architecture.

### Step 8.3: Add deprecation notice to `findTollMatches()`

**File:** `/utils/tollReconciliation.ts`

**What:** Add a `@deprecated` JSDoc comment:
```ts
/**
 * @deprecated Server-side matching is now the primary engine.
 * This function is retained only for the ManualMatchModal's
 * client-side search fallback. Do not use for new features.
 */
export function findTollMatches(...) { ... }
```

### Step 8.4: Verify number consistency across all pages

**Manual verification checklist:**
1. Open Toll Reconciliation Dashboard -> note the 4 card values
2. Open a specific driver's page -> Financials -> Expenses
3. Verify the toll summary card matches the driver-filtered view
4. Open Settlement overlay for a period -> verify toll line matches
5. Open Payout overlay for a period -> verify toll deduction matches
6. Check that lifetime tolls on driver overview use the new label

### Phase 8 Verification Checklist
- [ ] DriverDetail lifetime tolls label clarified
- [ ] Dead code removed from useTollReconciliation.ts
- [ ] findTollMatches() has deprecation notice
- [ ] All 4 pages show consistent toll numbers:
  - Toll Reconciliation Dashboard (admin)
  - Driver Expenses sub-tab
  - Settlement Period Detail overlay
  - Payout Period Detail overlay
- [ ] No console errors or warnings
- [ ] No unused imports

---

## Dependency Map

```
Phase 1 (Bug Fixes)
  |
  v
Phase 2 (Server Endpoint) -----> Phase 3 (Server Actions)
  |                                  |
  v                                  v
Phase 4 (Rewrite Hook) <-----------+
  |
  +-------> Phase 5 (UI Pagination)
  |
  +-------> Phase 6 (Driver Integration)
  |
  +-------> Phase 7 (Settlement/Payout)
  |
  v
Phase 8 (Cleanup) -- depends on all above
```

Phase 1 is standalone.
Phases 2 and 3 can be done together (both server-side).
Phase 4 depends on Phases 2+3.
Phases 5, 6, 7 depend on Phase 4 but are independent of each other.
Phase 8 depends on all previous phases.

---

## Rules of Engagement

1. **No phase starts without explicit user go-ahead.**
2. **Each phase is verified before moving to the next.**
3. **Zero breakage tolerance** -- drivers are actively using the app.
4. **DriverDetail.tsx and VehicleDetail.tsx** -- single-line `old_str` edits only.
5. **No Radix Select** -- use native `<select>` or toggle buttons.
6. **No Radix Portal** -- already removed from shared UI components.
7. **`isTollCategory()` is the single source of truth** for toll category checks after Phase 1.