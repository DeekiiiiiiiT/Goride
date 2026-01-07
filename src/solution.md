# Driver Performance Dashboard - Solution Plan

## Current Focus: Toll Reconciliation & Claimable Loss

The goal is to accurately reflect the financial status of toll transactions, specifically accounting for "Recovered" amounts (from both Uber/Platform and Driver Charges) and "Net Loss" (what the fleet ultimately pays).

---

## Implementation Plan: Enhanced Toll Financials

We will break this down into 6 detailed phases to minimize errors and ensure data consistency.

### Phase 1: Shared Logic & Data Structure
**Goal:** Establish a single source of truth for calculating "Recovered" and "Net Loss" amounts so the logic is consistent across the dashboard.

1.  **Create Utility Function `calculateTollFinancials` in `utils/tollReconciliation.ts`:**
    *   **Inputs:** `Transaction`, `Trip` (optional), `Claim` (optional).
    *   **Outputs:**
        *   `cost`: Absolute value of the transaction amount.
        *   `platformRefund`: `trip.tollCharges` (if matched).
        *   `driverRecovered`: `claim.amount` IF `claim.status === 'Resolved'` AND `claim.resolutionReason === 'Charge Driver'`.
        *   `fleetAbsorbed`: `claim.amount` IF `claim.status === 'Resolved'` AND `claim.resolutionReason === 'Write Off'`.
        *   `totalRecovered`: `platformRefund` + `driverRecovered`.
        *   `netLoss`: `cost` - `totalRecovered`. (If positive, it's a loss. If zero, fully recovered).
    *   **Test Cases:**
        *   Matched, Full Refund: Cost $5, Refund $5, Net $0.
        *   Unmatched, Charged Driver: Cost $5, Refund $0, Driver $5, Net $0.
        *   Unmatched, Written Off: Cost $5, Refund $0, Absorbed $5, Net $5.
        *   Underpaid, Charged Diff: Cost $5, Refund $3, Driver $2, Net $0.

### Phase 2: Data Fetching Updates
**Goal:** Ensure `TollTopupHistory` and `TollTagDetail` have access to the `Claims` data required for the calculations.

1.  **Update `TollTopupHistory.tsx`:**
    *   Add `claims` to the state: `const [claims, setClaims] = useState<Record<string, Claim>>({})`.
    *   Update `fetchHistory` to call `api.getClaims()`.
    *   Index claims by `transactionId` for O(1) lookup: `claimsMap[c.transactionId] = c`.
    *   **Validation:** Ensure the API call doesn't slow down the page significantly (parallelize with Promise.all).

2.  **Update `TollTagDetail.tsx`:**
    *   Similarly, fetch claims in `fetchStats` to prepare for Phase 5 (Summary Cards).

### Phase 3: "Recovered" Column Implementation
**Goal:** Replace the simple "Refund" column with a comprehensive "Recovered" column.

1.  **Modify Table Header:** Rename "Refund" to "Recovered".
2.  **Modify Table Cell Logic:**
    *   For each transaction, retrieve the linked Trip and linked Claim.
    *   Call `calculateTollFinancials`.
3.  **Visual Implementation:**
    *   Display `totalRecovered`.
    *   **Breakdown:** If `totalRecovered` > 0, show source details (maybe icons or small text badges):
        *   "Platform": If `platformRefund` > 0.
        *   "Driver": If `driverRecovered` > 0.
    *   **Tooltip:** Add a tooltip showing the exact math: "Platform: $X.XX + Driver: $Y.YY".

### Phase 4: "Net Loss" Column Implementation
**Goal:** Add the new column to show the bottom-line cost to the fleet.

1.  **Add Table Header:** "Net Loss".
2.  **Add Table Cell Logic:**
    *   Use `netLoss` from `calculateTollFinancials`.
3.  **Visual Implementation:**
    *   **Value:** Display `-$X.XX`.
    *   **Styling:**
        *   **$0.00:** Light gray (Neutral/Good).
        *   **> $0.00 (Loss):** Red text (Attention needed).
        *   **Absorbed:** If `fleetAbsorbed` > 0, maybe add a specific "Written Off" badge or style to indicate this was an intentional loss.

### Phase 5: Tag Inventory Summary Cards
**Goal:** Update the high-level stats on the Tag Detail page to reflect these new recoveries.

1.  **Update `TollTagDetail.tsx` Stats:**
    *   Calculate `totalNetLoss` across all transactions for the vehicle.
    *   Calculate `totalDriverRecovered` across all transactions.
2.  **Add/Update Summary Cards:**
    *   **New Card:** "Net Fleet Cost" (or modify "Tag Spent").
    *   **Logic:** `Total Tag Usage` - (`Uber Refunds` + `Driver Charges`).
    *   **Display:** Show the true cost of operating the tag after reimbursements.

### Phase 6: Final Verification & Cleanup
**Goal:** Ensure the system works as expected.

1.  **Walkthrough Scenarios:**
    *   Verify a standard Uber trip with full refund shows Net Loss $0.
    *   Verify an unmatched trip charged to driver shows Net Loss $0 and "Recovered (Driver)".
    *   Verify a written-off trip shows Net Loss = Cost.
2.  **Code Cleanup:** Remove any unused "refund" logic that was replaced by the new utility.

---
