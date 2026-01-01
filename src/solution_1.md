
# Phase 8: Expense Projection Logic Enhancement
- **Objective:** Extend `expenseProjection.ts` to support calculating Daily, Weekly, and Monthly Average rates alongside the existing Cash Flow logic.
- **Steps:**
    1.  Define a new type `ProjectionViewBasis` with values: `'cash_flow' | 'daily_rate' | 'weekly_rate' | 'monthly_average'`.
    2.  Create a helper function `getDaysInMonth(year, monthIndex)` to accurately calculate daily rates per month.
    3.  Create a helper function `convertAmountToDaily(amount, frequency)` which returns the daily cost of a single occurrence.
    4.  Create a core function `calculateAmortizedMonthlyValues(config, year, basis)`:
        -   Logic:
            -   Calculate total annual cost if it were active all year.
            -   Calculate "cost per day".
            -   For each month in the target year:
                -   Determine how many days the expense is *active* in that month (checking start/end dates).
                -   Multiply active days by "cost per day".
                -   For 'weekly_rate', multiply daily cost by 7.
                -   For 'monthly_average', multiply daily cost by (365/12).
    5.  Export these functions from `utils/expenseProjection.ts`.

# Phase 9: State Management and UI Controls
- **Objective:** Update `FixedExpensesManager.tsx` to include state for the view basis and the UI controls to toggle it.
- **Steps:**
    1.  Import `ProjectionViewBasis` type (or define locally if preferred).
    2.  Add state `const [viewBasis, setViewBasis] = useState<ProjectionViewBasis>('cash_flow');`.
    3.  Create a `Select` component in the header area (next to "Group by"):
        -   Label: "Cost View"
        -   Options: "Actual (Cash Flow)", "Daily Rate", "Weekly Rate", "Monthly Average".
    4.  Ensure the UI layout accommodates the new dropdown without breaking responsiveness on mobile.

# Phase 10: Integrating Amortized Logic into Matrix
- **Objective:** Connect the new logic to the `matrixData` calculation.
- **Steps:**
    1.  Modify `calculateAnnualProjection` signature to accept `viewBasis` or create a wrapper.
    2.  In `FixedExpensesManager.tsx`, inside `useMemo(() => { ... }, [expenses, selectedYear, viewBasis])`:
        -   If `viewBasis === 'cash_flow'`, keep existing logic.
        -   If not, use the new `calculateAmortizedMonthlyValues` to generate the `monthlyAmounts`.
    3.  Ensure `total` in `AnnualExpenseProjection` reflects the sum of the transformed monthly values (e.g. Total Daily Rates for the year doesn't make sense as a sum, it makes sense as an average, but for the table footer "Total" usually means "Sum of column". Let's stick to Sum of Column).

# Phase 11: Formatting and Visuals
- **Objective:** Adjust number formatting because Daily Rates will be small numbers requiring decimals.
- **Steps:**
    1.  Create a dynamic formatter `getFormatter(value, viewBasis)`.
        -   Cash Flow: No decimals (e.g., "$1,200").
        -   Daily/Weekly: 2 decimals (e.g., "$3.28").
    2.  Update the Table cells to use this formatter.
    3.  Update the Table Footers to use this formatter.
    4.  Add a tooltip or legend explaining what the view shows (e.g., "Daily Rate shows the amortized cost per day").

# Phase 12: Validation and Edge Case Handling
- **Objective:** Ensure date boundaries (Start/End dates) are respected in amortized views.
- **Steps:**
    1.  Test case: Expense starts Jan 15th.
        -   Jan Daily Rate column: Should be roughly same as Feb (daily cost is constant), OR should it be weighted?
        -   Decision: "Daily Rate" usually means "How much does this cost me per day?" -> It is constant.
        -   "Monthly Cost" in Jan: Should be ~50% of Feb.
        -   Refine logic in Phase 8 accordingly.
    2.  Test case: One-time expense.
        -   If I buy a part for $100 on Jan 1st.
        -   Daily Rate: Should it be $100/365? Or $100/1?
        -   Decision: One-time expenses are usually "Events". Amortizing them implies they are assets depreciating. For "Fixed Expenses" (bills), they are usually periodic.
        -   Rule: One-time expenses in "Daily Rate" view should probably be shown as-is in the month they occur, OR amortized over the year if "Auto-renew" is off?
        -   Let's stick to: One-time expenses are treated as occurring on that day. Daily rate = Amount on that day. (This might spike the graph).
        -   Alternative: Exclude one-time from "Daily Rate" view?
        -   Better: Amortize one-time expenses over 12 months if user desires, but standard is: Just show the daily hit (which is huge) or the amortized hit.
        -   Let's amortize One-time expenses over 1 year for the "Daily Rate" view to smooth it out, OR just exclude them.
        -   Simpler approach: Treat One-time like 'Yearly' but without renew. Daily cost = Amount / 365.

# Phase 13: Cleanup and Polish
- **Objective:** Final code cleanup.
- **Steps:**
    1.  Remove console logs.
    2.  Verify types are strict.
    3.  Check mobile view table scrolling.
