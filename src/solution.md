# Driver Performance Dashboard - Toll Reconciliation Solution

## Overview
This document outlines the implementation plan for the **Unified Reconciliation System**. The goal is to integrate "Driver Cash Receipts" into the existing "Toll Tag" reconciliation workflow. This ensures that driver reimbursements are strictly validated against Uber Trip Data ("Strict Liability" model) before being approved.

## Core Logic (Strict Liability)
| Scenario | Source | Match Result (Uber Reimbursed?) | Action | Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **A** | **Tag** | ✅ Yes (Green) | **Reconcile** | No Action (Break-even). |
| **B** | **Tag** | ❌ No (Purple/Amber) | **Deduct** | Charge Driver (Driver Liability). |
| **C** | **Cash** | ✅ Yes (Green) | **Approve** | Reimburse Driver (Fleet owes Driver). |
| **D** | **Cash** | ❌ No (Purple) | **Reject** | Personal Expense (Driver Liability). |
| **E** | **Cash** | ⚠️ Partial/None (Amber) | **Flag Claim** | Valid Trip but Unpaid. File Claim with Uber. |

---

## Phase 1: Data Ingestion & Identification
**Goal:** Ensure Driver Uploads are accessible to the Reconciliation Dashboard and distinguishable from Tag Imports.

1.  **Audit `DriverExpenses.tsx` Submission:**
    *   Verify that `submitExpense` sets `paymentMethod: 'Cash'`, `category: 'Tolls'`, and `status: 'Pending'`.
    *   *Action:* Check code and ensure consistency.

2.  **Define Source Discriminator:**
    *   Establish logic to distinguish sources in the frontend.
    *   Logic: `isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl`.
    *   Logic: `isTag = !isCash` (or based on Import Batch ID).

3.  **Update API Layer (`services/api.ts`):**
    *   Create `fetchPendingTollClaims()`: Should return `FinancialTransaction[]` where `category='Tolls'` and `status='Pending'`.
    *   Ensure this data structure matches the `FinancialTransaction` interface used by the dashboard.

4.  **Dashboard State Management (`ReconciliationDashboard.tsx`):**
    *   Add state `cashClaims`.
    *   Fetch `cashClaims` on mount.
    *   Create a merged list: `allTolls = [...tagTransactions, ...cashClaims]`.

## Phase 2: Reconciliation Engine Upgrade
**Goal:** Adapt the matching logic to handle "Cash" scenarios and correctly identify "Claimable Losses".

1.  **Review `findTollMatches` (`utils/tollReconciliation.ts`):**
    *   Ensure it handles transactions without `vehicleId` (if applicable, though drivers should select vehicle).
    *   Ensure it gracefully handles mismatched timestamps (drivers might upload late, but the *receipt date* should be the *expense date*).

2.  **Refine "Amber" Logic (The "Unpaid" Case):**
    *   Current Logic: `isAmountMatch` checks if `Trip Refund == Transaction Amount`.
    *   New Logic: Explicitly handle the case where `Trip Refund == 0` but `Transaction Amount > 0`.
    *   *Action:* Update `reason` text to: "Valid trip but Uber reimbursement missing (Claimable)."

3.  **Unit Verification:**
    *   Verify Case: Receipt $5, Trip Refund $5 -> `PERFECT_MATCH` (Green).
    *   Verify Case: Receipt $5, Trip Refund $0 -> `AMOUNT_VARIANCE` (Amber).
    *   Verify Case: Receipt $5, No Trip -> `PERSONAL_MATCH` (Purple).

## Phase 3: Unified Dashboard UI
**Goal:** Display Cash Tolls in the reconciliation list with clear visual distinctions.

1.  **Update `UnmatchedTollsList.tsx`:**
    *   Add "Source" column or visual indicator.
    *   Icon mapping: 🏷️ (Tag) vs 🧾 (Cash).

2.  **Receipt Preview:**
    *   Add a "View Receipt" button/icon for Cash rows.
    *   Implement a modal/popover to display `tx.receiptUrl`.

3.  **Filtering & Sorting:**
    *   Add Filter Dropdown: "All", "Tag Only", "Cash Claims".
    *   Ensure sorting by Date mixes both sources correctly.

## Phase 4: Action Logic & UX
**Goal:** Implement the specific "Approve" vs "Deduct" buttons based on the Source/Match matrix.

1.  **Component Refactor:**
    *   Extract action button logic into `TollActionMenu` or similar.

2.  **Implement Logic Branching:**
    *   **Case Cash/Green:** Button "Approve Reimbursement" (Green style).
    *   **Case Cash/Amber:** Button "Flag for Claim" (Amber style).
    *   **Case Cash/Purple:** Button "Reject" (Red/Destructive style).
    *   *Note:* Retain existing logic for Tag (Deduct/Ignore).

3.  **Tooltips:**
    *   Add tooltips to explain the action (e.g., "Uber reimbursed this toll. Approve driver repayment.").

## Phase 5: Financial Execution (The "Write" Ops)
**Goal:** Connect the buttons to actual state changes (Reimburse/Reject).

1.  **API Methods:**
    *   `approveExpense(id)`: Sets status to `Approved`. (Triggers balance update).
    *   `rejectExpense(id)`: Sets status to `Rejected`.
    *   `flagExpense(id)`: Sets status to `Claim_Pending`.

2.  **Optimistic UI Updates:**
    *   Remove item from list (or update status icon) immediately upon click.
    *   Show Toast notification ("Expense Approved", "Expense Rejected").

## Phase 6: "Claimable Loss" Management
**Goal:** Provide a way to track and act on the "Amber" items (Uber Underpayments).

1.  **Claims View:**
    *   Create a "Pending Claims" summary card or modal.
    *   List all items marked as `Claim_Pending`.

2.  **Export & Resolution:**
    *   Allow "Export to CSV" (for Uber Support).
    *   Allow "Mark Resolved" (if Uber pays) or "Write Off".
