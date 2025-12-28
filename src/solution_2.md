# Toll Tag Reconciliation System Documentation

## Overview
The Toll Reconciliation System audits financial leakage by comparing **Toll Expenses** against **Trip Reimbursements**. It uses a "Waterfall Logic" to strictly categorize expenses into Reimbursements (Uber), Business Expenses (Tax), or Personal Use (Driver).

## Implementation Plan (Migration to "Idea_1" Logic)

### Phase 1: Foundation & Time Mathematics
*   **Step 1.1:** Create `utils/timeUtils.ts` for precise date arithmetic.
*   **Step 1.2:** Implement `calculateTripTimes(trip)` helper to derive **Pickup Time** (`dropoff - duration`) and define the **Active Window** vs **Approach Window**.
*   **Step 1.3:** Verify type definitions in `types/data.ts` ensure `duration` is accessible.

### Phase 2: Core Matching Engine (The Waterfall)
*   **Step 2.1:** Rewrite `tollReconciliation.ts` to implement the new "Three Window" logic.
*   **Step 2.2:** Implement **Active Trip Logic** (Start -> Dropoff). Strict matching for Green (Paid) and Amber (Claim).
*   **Step 2.3:** Implement **Approach Window Logic** (Request-45 -> Start). Strict assignment to Blue (Deadhead).
*   **Step 2.4:** Implement **Gap Analysis** (Everything else -> Purple).

### Phase 3: Financial Aggregation & Analytics
*   **Step 3.1:** Update `useTollReconciliation.ts` (or equivalent hook) to recalculate totals based on new categories.
*   **Step 3.2:** Separate "Total Claims" (Amber) from "Total Deductions" (Blue + Purple).
*   **Step 3.3:** Ensure "Likely Cash" (Yellow) logic remains intact.

### Phase 4: UI Updates & Visualization
*   **Step 4.1:** Update the Status Badge component to reflect the new definitions (e.g., tooltip for Blue: "Deadhead - Tax Deductible").
*   **Step 4.2:** Update the Reconciliation Row to visually show which "Window" a match fell into (optional but helpful).
*   **Step 4.3:** Verify color coding consistency (Green, Amber, Blue, Purple, Yellow).

### Phase 5: Testing & Verification
*   **Step 5.1:** Create a "Scenario Test" with the exact examples from `Idea_1.md` (The "2:05 PM Toll" case).
*   **Step 5.2:** Verify that Deadhead tolls previously marked as Amber now show as Blue.
*   **Step 5.3:** Final code review and cleanup.

---

## Core Architecture (Target State)
The system attempts to match every **Transaction** to a **Trip** using the following priority order:

### 1. Active Trip Window (Uber's Responsibility)
*   **Time:** `Trip Start (Pickup)` to `Drop-off`.
*   **Green (Perfect Match):** Time Matches & Amount Matches.
*   **Amber (Valid Claim):** Time Matches & Amount Mismatch (or $0).
*   *Note: No buffers. Strict compliance.*

### 2. Approach Window (Driver's Business Expense)
*   **Time:** `Request Time (-45m)` to `Trip Start (Pickup)`.
*   **Blue (Deadhead):** Any toll in this window.
*   *Action: Tax Deductible, but NOT claimable from Uber.*

### 3. Gap Analysis (Personal Use)
*   **Time:** Outside the above windows.
*   **Purple (Personal):** No matching trip found.
*   *Action: Charge driver.*

### Reverse Check
*   **Yellow (Likely Cash):** Trip has reimbursement but no tag match.
