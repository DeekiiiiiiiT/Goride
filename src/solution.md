# Implementation Plan: Fuel Log Visibility & Synchronization Fix

This document outlines the phased approach to resolving the issue where manual fuel entries inconsistently appear in the "Pending" tab.

## Phase 1: Metadata Standardization & Alignment
**Goal:** Ensure the data labels used during submission exactly match the labels used for filtering in the UI.

*   **Step 1.1:** Update `/components/fuel/SubmitExpenseModal.tsx` to change the `source` metadata from `"Manual Request"` and `"Bulk Request"` to standardized strings `"Manual"` and `"Bulk Manual"`.
*   **Step 1.2:** Audit and update the "Heal" and "Edit" logic in `/pages/FuelManagement.tsx` to ensure they also apply these standardized labels.
*   **Step 1.3:** Synchronize the `portal_type` field to ensure it is consistently set to `"Manual_Entry"` across all manual submission paths.

## Phase 2: Action-Oriented Queue (Pending Tab)
**Goal:** Ensure that pending items are visible regardless of their receipt date, turning the Pending tab into a true work queue.

*   **Step 2.1:** Modify the filtering logic in `/components/fuel/FuelReimbursementTable.tsx` to ignore the `dateRange` filter specifically for transactions with `status === 'Pending'`.
*   **Step 2.2:** Maintain the existing `dateRange` filter for the "History" tab to prevent visual clutter and maintain table performance.
*   **Step 2.3:** Update the tab badge counts to reflect the total number of pending items across all time periods.

## Phase 3: Real-Time State Synchronization
**Goal:** Eliminate the "lag" perceived by users after clicking save.

*   **Step 3.1:** Enhance the `onSave` callback sequence in `/components/fuel/SubmitExpenseModal.tsx` to ensure parent state reloads are prioritized.
*   **Step 3.2:** Implement a localized "Refreshing..." state in the Reimbursement view that specifically waits for the ledger update to complete before hiding.
*   **Step 3.3:** Add a manual "Force Refresh" icon button to the Reimbursement header to allow for manual ledger polling if network latency occurs.

## Phase 4: Verification & Audit Repair
**Goal:** Clean up existing records and verify the "Stop-to-Stop" data integrity.

*   **Step 4.1:** Implement a temporary "Metadata Migration" utility (triggered via the Audit Tool) to find legacy `"Manual Request"` records and update them to `"Manual"`.
*   **Step 4.2:** Validate that "Odometer Drift" and "Unknown Driver" logic correctly picks up the newly visible pending entries.
*   **Step 4.3:** Perform a bulk-entry stress test (multiple receipts in one batch) to ensure all linked financial records are created and visible simultaneously.
