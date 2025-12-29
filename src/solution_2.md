# Implementation Plan: Dispute Lifecycle & "Closing the Loop"

This document outlines the phased implementation plan to establish a complete feedback loop between the Admin (Fleet Manager) and the Driver regarding toll disputes.

## Phase 1: Backend & Data Structure Verification
**Goal:** Ensure the backend and data types support the complete lifecycle of a claim without breaking existing functionality.

*   **Step 1.1:** Review `Claim` interface in `/types/data.ts` to ensure `status` enum covers all necessary states (`Sent_to_Driver`, `Submitted_to_Uber`, `Resolved`, `Rejected`).
    *   *Action:* Verify existing types and add any missing status literals if needed.
*   **Step 1.2:** Verify `useClaims` hook capabilities.
    *   *Action:* Ensure the `updateClaim` function is correctly implemented to handle partial updates or full object replacements securely.
*   **Step 1.3:** Verify Server Endpoint (`/claims`).
    *   *Action:* Ensure the backend `POST /claims` endpoint (which handles upserts) correctly updates the `updatedAt` timestamp when a status change occurs.
*   **Step 1.4:** Define "Linked State" logic.
    *   *Action:* Document how we determine if a Transaction is "In Dispute". (Strategy: We will fetch Claims and join them with Transactions on the client-side using `transactionId`).

## Phase 2: Driver Portal Actions ("The Trigger")
**Goal:** Empower the driver to update the status of a dispute from their dashboard.

*   **Step 2.1:** Modify `DriverClaims.tsx`.
    *   *Action:* Add state handling for "Submitting" and "Rejecting" actions to the UI.
*   **Step 2.2:** Update `ClaimCard` Component.
    *   *Action:* Add a primary button **"Mark as Submitted"**.
        *   *Logic:* On click, call `updateClaim` to set status to `Submitted_to_Uber`.
        *   *UI:* Show a loading spinner during the API call. On success, show a checkmark or toast, and update the card visuals (e.g., change badge color).
*   **Step 2.3:** Add Rejection Workflow.
    *   *Action:* Add a secondary action (e.g., "Report Issue" or "Uber Rejected").
        *   *Logic:* On click, set status to `Rejected`.
*   **Step 2.4:** Filter/Sort Updates.
    *   *Action:* Ensure `Resolved` or `Rejected` claims eventually move to a "History" tab or bottom of the list so the driver focuses on active tasks.

## Phase 3: Admin Dashboard - "Reimbursement Pending" Tab
**Goal:** Give the Admin visibility into items that are "in flight" so they don't get stuck in "Unmatched".

*   **Step 3.1:** Create `ReimbursementPendingList.tsx` component.
    *   *Action:* Scaffold a new table/list component.
*   **Step 3.2:** Implement Data Fetching.
    *   *Action:* Use `useClaims` to fetch all claims. Filter for statuses: `Sent_to_Driver`, `Submitted_to_Uber`.
*   **Step 3.3:** Design the List View.
    *   *Action:* Columns: Date, Driver Name, Amount, Subject (Toll Name), Status Badge.
    *   *Visuals:*
        *   `Sent_to_Driver`: Yellow/Orange Badge (Waiting on Driver).
        *   `Submitted_to_Uber`: Blue Badge (Waiting on Uber).
*   **Step 3.4:** Add Admin Actions.
    *   *Action:* Add a "Nudge" button (mock functionality for now) or "Force Status Change" button in case the driver forgets to update it.

## Phase 4: Admin Dashboard - "Dispute Lost" Tab
**Goal:** Handle the "Sad Path" where money is not recovered.

*   **Step 4.1:** Create `DisputeLostList.tsx` component.
    *   *Action:* Scaffold a new component similar to Pending List.
*   **Step 4.2:** Data Filtering.
    *   *Action:* Filter claims for status: `Rejected`.
*   **Step 4.3:** Implementation Resolution Actions.
    *   *Action:* Add buttons for final resolution:
        *   **"Write Off":** Marks the claim as `Resolved` (Closed) and potentially updates the Transaction category to "Business Expense".
        *   **"Charge Driver":** (Future scope hook) Marks claim as `Resolved` but notes that it will be deducted.
*   **Step 4.4:** Integrate components into Dashboard.
    *   *Action:* Add the `ReimbursementPendingList` and `DisputeLostList` into the `ReconciliationDashboard.tsx` layout (likely in a new "Claims Workflow" section or tabs).

## Phase 5: Admin Dashboard - "Unmatched" Cleanup
**Goal:** Ensure the "Unmatched Tolls" list only shows items that *haven't* been addressed yet.

*   **Step 5.1:** Update `ReconciliationDashboard.tsx` filtering logic.
    *   *Action:* When rendering the "Unmatched Tolls" list (the metric tiles or the list below them):
        *   Check against the list of Active Claims (`Sent_to_Driver`, `Submitted_to_Uber`).
        *   If a Transaction ID exists in the Active Claims list, **hide** it from the "Unmatched" view.
*   **Step 5.2:** Add "In Progress" Count.
    *   *Action:* Optionally add a metric tile showing "X Disputes in Progress" to account for the hidden items.

## Phase 6: End-to-End Verification
**Goal:** Verify the full lifecycle.

*   **Step 6.1:** Test "Send to Driver".
    *   *Verify:* Item leaves "Unmatched" and appears in "Reimbursement Pending".
*   **Step 6.2:** Test "Driver Update".
    *   *Verify:* Driver clicks "Submitted", Admin sees status change to "Submitted to Uber".
*   **Step 6.3:** Test "Resolution".
    *   *Verify:* "Dispute Lost" workflow correctly archives the claim.
