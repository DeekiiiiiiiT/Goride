# Solution Plan: Fix Missing "Charge Driver" Transactions

The issue of missing "Charge Driver" transactions in the ledger is caused by a limitation in the backend data fetching (1,000 record limit without sorting). New transactions are being created but cut off from the response because the API returns the *oldest* 1,000 records instead of the *newest*, and fetches *all* drivers' data instead of just the relevant one.

We will resolve this by implementing server-side filtering and sorting, ensuring the most recent and relevant data is always available.

## Phase 1: Backend API Enhancement

**Objective:** Enable the backend to filter transactions by `driverId` and sort by date.

**Steps:**
1.  Open `/supabase/functions/server/index.tsx`.
2.  Locate the `GET` route for `/transactions` (approx. line 2800-3000).
3.  Modify the route handler to:
    *   Extract the `driverId` from the request query parameters.
    *   Modify the Supabase query to filter by `value->>driverId` if the parameter is present.
    *   Add a `.order('value->>date', { ascending: false })` clause to the query to ensure the newest transactions are returned first.
    *   Keep the limit of 1000 to maintain performance, but now it will be the *newest* 1000 for *that specific driver*.

## Phase 2: Frontend Service Layer Update

**Objective:** Update the frontend API service to support the new filtering parameter.

**Steps:**
1.  Open `/services/api.ts`.
2.  Locate the `getTransactions` function (approx. line 446).
3.  Update the function signature to accept an optional `driverId` parameter: `async getTransactions(driverId?: string)`.
4.  Update the URL construction logic:
    *   If `driverId` is provided, append it as a query parameter: `?driverId=${driverId}`.
    *   Ensure the function still works without the parameter for global views.

## Phase 3: DriverDetail Component Optimization

**Objective:** Update the Driver Detail view to utilize server-side filtering.

**Steps:**
1.  Open `/components/drivers/DriverDetail.tsx`.
2.  Locate the `loadData` function inside the `useEffect` hook (approx. line 275).
3.  Update the `api.getTransactions()` call to pass the current `driverId`.
4.  Refactor the subsequent code:
    *   Remove the client-side filtering logic: `allTx.filter((t: any) => t.driverId === driverId ...)`
    *   Assign the result directly to `setTransactions` (since the backend now handles the filtering).
    *   Verify the variable name matches (`driverTx` vs `allTx`).

## Phase 4: Driver Portal & Global Updates

**Objective:** Ensure other components benefit from the API improvements and do not break.

**Steps:**
1.  **DriverExpenses.tsx** (`/components/driver-portal/DriverExpenses.tsx`):
    *   Update `api.getTransactions()` to `api.getTransactions(user?.id)` (or relevant driver ID source).
    *   Remove redundant client-side filtering.
2.  **DriverEarnings.tsx** (`/components/driver-portal/DriverEarnings.tsx`):
    *   Update `api.getTransactions()` to pass the driver ID.
    *   Remove redundant client-side filtering.
3.  **TransactionsTab.tsx** (`/components/finance/TransactionsTab.tsx`):
    *   No code changes needed, but verify that the new *sorting* (newest first) improves the user experience here as well.

## Phase 5: Verification

**Objective:** Confirm the fix works.

**Steps:**
1.  Go to the "Claimable Loss" or "Toll Reconciliation" page.
2.  Perform a "Charge Driver" action on a disputed toll.
3.  Navigate to the Driver's Detail page -> Transaction Ledger.
4.  Verify that the new "Adjustment" transaction appears at the top of the list in the "Debit" column.
