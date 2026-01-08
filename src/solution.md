# Trip-Centric Ledger Refactoring Plan

## Phase 1: Data Preparation Logic
**Goal:** Create the core data structure that links Transactions to Trips.
- [ ] **Step 1:** Define the `TripGroup` structure (Trip + linked Transactions).
- [ ] **Step 2:** Create a `transactionMap` using `useMemo` to index all `cashTollTransactions` by `tripId`.
- [ ] **Step 3:** Identify "Orphan" transactions (those with no `tripId` or where the Trip is not in the current list).
- [ ] **Step 4:** Construct the `unifiedLedgerItems` array:
    - Include all **Trips** that have at least one relevant transaction (or maybe all trips? No, only those with toll activity or disputes to keep the "Toll Ledger" focused). *Refinement: User likely wants to see the context of the trip if there is a toll involved.*
    - Include **Orphan Transactions** as standalone items.
- [ ] **Step 5:** Implement Sorting: Sort the unified list by `date` descending.

## Phase 2: Unified List Construction & State Management
**Goal:** Finalize the state handling for the new list.
- [ ] **Step 1:** Replace the existing `groupedTollTransactions` state/variable with the new `unifiedLedgerItems`.
- [ ] **Step 2:** Update the `expandedRows` logic to handle Trip IDs (since Trips are now the parents).
- [ ] **Step 3:** Ensure the sorting handles both "Trip Objects" and "Transaction Objects" correctly (normalizing the date field).

## Phase 3: Parent Row UI (Trip Context)
**Goal:** Render the Trip row as the container.
- [ ] **Step 1:** Modify the table render loop to check if an item is a `TripGroup` or `Orphan`.
- [ ] **Step 2:** If `TripGroup`: Render the **Trip Row**.
    - **Date:** Trip Date.
    - **Description:** Route info (e.g., "Trip to [Dropoff]").
    - **Status:** Trip Status (e.g., "Completed").
    - **Credit Column:** Display the Trip Earnings (e.g., "$275.00") with a label "Fare".
- [ ] **Step 3:** Add the Chevron toggle button.

## Phase 4: Child Row UI (Transaction Details)
**Goal:** Render the actual financial events nested under the Trip.
- [ ] **Step 1:** Inside the `TripGroup` block, check `expandedRows`.
- [ ] **Step 2:** Map through the attached `children` (Transactions).
- [ ] **Step 3:** Render the **Transaction Rows**:
    - **Passage Receipt:** Green/Credit column.
    - **Toll Dispute Charge:** Red/Debit column.
    - **Visuals:** Indented with the tree connector line (same as current implementation).

## Phase 5: Orphan Row UI Implementation
**Goal:** Handle transactions that don't fit into the Trip structure.
- [ ] **Step 1:** If the item is `Orphan` (Transaction), render it as a standalone row.
- [ ] **Step 2:** Preserve the existing "Parent -> Child" claim linking for these orphans if possible (fallback logic), OR just render them flat if that's too complex for this phase. *Decision: Render flat for now to strictly follow the Trip-Centric model, or keep them as "Unknown Trip" groups.*

## Phase 6: Visual Polish & "Smart Status"
**Goal:** Refine the look and feel.
- [ ] **Step 1:** Implement "Smart Status": If the Trip is Completed, the visual status of the group is Completed.
- [ ] **Step 2:** Verify columns alignment.
- [ ] **Step 3:** formatting: Ensure "Reimburse" column header is clean.

## Phase 7: Final Verification
**Goal:** Ensure data integrity.
- [ ] **Step 1:** Check totals (Net Toll Reimbursement box).
- [ ] **Step 2:** Click through to verify expand/collapse works.
- [ ] **Step 3:** Verify sorting puts recent items at top.
