# Driver Management System: Fuel Ledger Refactor Plan

This plan outlines the transformation of the current Fuel Activity list into an audit-first, parent-child ledger system inspired by the "Toll Activity" architecture.

## Phase 1: Foundation & Data Layer Enhancement
*   **Step 1.1: Extend Data Types**
    *   Update `FuelEntry` and `FinancialTransaction` types to include `anchorPeriodId` and `reconciliationStatus`.
    *   Ensure metadata supports `isDebit` and `isCredit` flags to handle manual overrides.
*   **Step 1.2: Logical Mapping Helpers**
    *   Create a utility `fuelGroupingUtils.ts` to map orphan fuel entries to the nearest logical "Anchor Window" based on timestamps.
    *   Implement a "Reconciliation Linker" that identifies which specific transaction represents the "Company Share" of a specific fuel purchase.

## Phase 2: The New FuelLedgerView Component
*   **Step 2.1: Component Initialization**
    *   Create `/components/drivers/FuelLedgerView.tsx` as a standalone specialized component.
    *   Import necessary UI components: `Table`, `Badge`, `Tooltip`, and `Lucide` icons.
*   **Step 2.2: Column Architecture**
    *   Define the 4-column layout: Date, Description (with metadata subtext), Status/Badge, Debit (Red), and Credit (Green).
    *   Implement "Accounting View" where debits are always Red and credits are always Emerald.

## Phase 3: Parent-Child Anchor Window Grouping
*   **Step 3.1: Grouping Logic**
    *   Implement a `useMemo` hook that takes the flat transaction array and groups them by `anchorPeriodId`.
    *   Transactions without a period ID will be grouped under a "Pending Reconciliation" bucket.
*   **Step 3.2: Parent Row (The Window)**
    *   Design the parent row to represent a Settlement Window (e.g., "Settlement: Jan 15 - Jan 22").
    *   Display "Net Settlement Change" at the parent level.
*   **Step 3.3: Collapsible Interaction**
    *   Implement the `expandedRows` state to allow users to drill down into the specific receipts that make up a settlement.

## Phase 4: Visual Clarity & Branding
*   **Step 4.1: Color Standardization**
    *   Apply `text-red-600` and `-$` prefix to all fuel out-of-pocket transactions.
    *   Apply `text-emerald-600` and `+$` prefix to all reimbursement/credit transactions.
*   **Step 4.2: Audit Legend**
    *   Add a small info bar at the top explaining the icons (e.g., "Verified", "Flagged", "Auto-Generated").
*   **Step 4.3: Empty States**
    *   Create a refined empty state that encourages users to upload receipts if the ledger is empty for a selected period.

## Phase 5: Reconciliation Status & Logic
*   **Step 5.1: Status Badging**
    *   Implement logic to show "Verified" for transactions successfully reconciled against an anchor.
    *   Show "Observing" for transactions in a window that hasn't closed yet.
*   **Step 5.2: Anomaly Highlighting**
    *   Directly highlight any transaction flagged by the `FuelIntegrityAuditTool` with a "Critical" or "Warning" badge inline.
*   **Step 5.3: Action Hooks**
    *   Add a "Resolve" button for flagged entries directly in the ledger row.

## Phase 6: Metadata & Inline Previews
*   **Step 6.1: Descriptions & Subtext**
    *   The primary description should show the Vendor/Type (e.g., "Texaco - Petrol").
    *   Add secondary subtext showing the Volume (Liters) and Odometer reading for that specific event.
*   **Step 6.2: Inline Receipt View**
    *   Implement a "View Receipt" link that opens the image URL in a new tab or light-box if `receiptUrl` is present.
*   **Step 6.3: Adjustment Tooltips**
    *   If a transaction was manually edited, show the "Edit Reason" on hover (taking logic from the Tolls tab).

## Phase 7: DriverDetail Integration
*   **Step 7.1: UI Replacement**
    *   Modify `DriverDetail.tsx` to replace `TransactionLedgerView` with the new `FuelLedgerView` within the Fuel tab.
*   **Step 7.2: Prop Plumbing**
    *   Pass the `dateFilteredTransactions` and `claims` data correctly to the new view.
*   **Step 7.3: Syncing Date Filters**
    *   Ensure that changing the global date filter in `DriverDetail` updates the windows shown in the ledger.

## Phase 8: Final Polish & Audit Sync
*   **Step 8.1: Performance Optimization**
    *   Implement virtualization if the ledger history exceeds 100 rows to prevent lag.
*   **Step 8.2: Audit Repair Integration**
    *   Ensure that running the "Repair Metadata" tool in the admin panel triggers a refresh of the ledger view.
*   **Step 8.3: Responsiveness Pass**
    *   Ensure the 5-column layout collapses gracefully for mobile view by hiding less critical metadata.
