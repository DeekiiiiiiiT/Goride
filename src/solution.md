# Driver Detail Table Update Plan

## Objective
Update the "Trip Row" in the Driver Detail table to correctly display the **Total Toll Credit** instead of the **Trip Fare** in the Credit column. The view is intended to show Toll Activity, so Trip Fares are misleading in this context.

## Phase 1: Analysis & Logic Definition
- [x] **Step 1:** Verify the data structure of `groupedTollTransactions`.
    - Confirm that `item.children` contains the toll transactions.
    - Confirm `FinancialTransaction` interface has `amount`, `category`, and `status`.
- [x] **Step 2:** Locate the `getTollTransactionType` helper function.
    - Ensure it correctly identifies 'credit' vs 'debit'.
- [x] **Step 3:** Define the calculation logic for `totalTollCredit`.
    - Logic: Sum of `Math.abs(amount)` for all children where type is 'credit'.
- [x] **Step 4:** Define the calculation logic for `totalTollDebit` (Optional but recommended for consistency).
    - Check if the Debit column also needs to show Toll Debits instead of `trip.amount` (currently it shows `-` for Trip Row, but we should verify).
    - *Decision:* We will focus on the Credit column as requested, but keep the Debit column as `-` (since the parent row represents the "Trip" context which might not have a direct "Toll Debit" sum distinct from its children, or maybe it should sum the debit tolls? The user specifically asked for Credit column fix. We will stick to Credit column fix to avoid scope creep, but ensure Debit column remains `-` or is handled correctly).

## Phase 2: Logic Implementation (Trip Row)
- [x] **Step 1:** In `/components/drivers/DriverDetail.tsx`, navigate to the **Trip Row** rendering block (approx line 1718).
- [x] **Step 2:** Insert the calculation for `totalTollCredit` before the return statement.
    ```typescript
    const totalTollCredit = children
        .filter(c => getTollTransactionType(c.category) === 'credit')
        .reduce((sum, c) => sum + Math.abs(c.amount), 0);
    ```
- [x] **Step 3:** Verify that `children` and `getTollTransactionType` are accessible in this scope.

## Phase 3: UI Update (Trip Row Credit Column)
- [x] **Step 1:** Locate the Credit `TableCell` for the Trip Row (approx line 1775).
- [x] **Step 2:** Replace the existing content:
    - **Current:** Displays `trip.amount` with "Fare" label.
    - **New:** Display `totalTollCredit` if > 0.
- [x] **Step 3:** Implement the new JSX structure:
    ```tsx
    <TableCell className="text-right font-mono">
        {totalTollCredit > 0 ? (
            <span className="text-emerald-600 font-bold">+${totalTollCredit.toFixed(2)}</span>
        ) : (
            <span className="text-slate-300">-</span>
        )}
    </TableCell>
    ```
- [x] **Step 4:** Ensure "Fare" label is removed.

## Phase 4: Final Validation
- [x] **Step 1:** Review the changes for syntax errors.
- [x] **Step 2:** Confirm that the Trip Row now shows the sum of its positive children in the Credit column.
- [x] **Step 3:** Confirm that the Debit column remains clean (showing `-`) or as intended.
- [x] **Step 4:** Ensure no other rows (Child or Orphan) were accidentally modified.
