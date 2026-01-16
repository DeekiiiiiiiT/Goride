# Solution Plan: Fix Duplicate Transactions & Ledger Logic

## Phase 1: Enable Deletion of Duplicate Transactions (Emergency Fix)
**Objective:** Expose the existing deletion logic in the UI so the user can remove the specific duplicate "Toll Charge (Recovery)" transaction.

1.  **Locate Row Rendering Logic:**
    *   Find the rendering block for **Child Rows** (nested under Trips) in `DriverDetail.tsx`.
    *   Find the rendering block for **Orphan Rows** (Unlinked transactions) in `DriverDetail.tsx`.
2.  **Insert Delete Button (Child Rows):**
    *   Inside the "Actions" or "Status" cell, add a conditional check.
    *   If `transaction.category === 'Adjustment'` OR `transaction.metadata.source === 'retry_charge'`, render a small `Trash2` icon button.
    *   Bind the button `onClick` to `handleDeleteTransaction(transaction.id)`.
3.  **Insert Delete Button (Orphan Rows):**
    *   Repeat the same logic for the Orphan rows section to ensure the duplicate can be deleted regardless of where it appears.
4.  **Verify Dialog Connection:**
    *   Ensure the `AlertDialog` at the bottom of the file correctly uses `transactionToDelete` state and calls `confirmDeleteTransaction`.

## Phase 2: Prevent Future Duplicates (Debouncing & Locking)
**Objective:** Prevent the "Retry Charge" button from being double-clicked or triggered multiple times for the same claim.

1.  **Create Loading State:**
    *   Add a new state variable: `const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());`
2.  **Update `handleRetryCharge`:**
    *   At the start of the function, check if the transaction/claim ID is already in `processingIds`. If so, return immediately.
    *   Add the ID to `processingIds` before starting the async operation.
    *   Remove the ID from `processingIds` in the `finally` block.
3.  **Disable UI Button:**
    *   Update the "Retry Charge" button `disabled` prop to be true if `processingIds.has(id)`.
    *   Add a visual loading spinner or text change ("Retrying...") when disabled.

## Phase 3: Correct "Fix Format" Logic (Data Integrity)
**Objective:** Ensure the "Fix Format" button correctly converts malformed "Toll Charge" credits/expenses into proper "Adjustment" Debits.

1.  **Audit `handleFixTransactionFormat`:**
    *   Review the current implementation.
    *   Ensure the new transaction object strictly sets:
        *   `category`: 'Adjustment'
        *   `type`: 'Adjustment' (Crucial for ledger logic)
        *   `amount`: Negative value (`-Math.abs(originalAmount)`)
2.  **Enhance Metadata:**
    *   Add `originalId` or `fixReason` to the metadata for audit trails.
3.  **Testing Update:**
    *   Ensure the local state update (`setTransactions`) mirrors the structure exactly so the UI updates without requiring a full page refresh.

## Phase 4: Ledger Logic Verification
**Objective:** Ensure that "Adjustment" transactions are correctly calculated as Debits (Money Owed by Driver) in the table totals and summaries.

1.  **Review `getTollTransactionType`:**
    *   Verify that `getTollTransactionType` returns 'debit' for the category 'Adjustment'.
2.  **Visual Verification:**
    *   Check the conditional styling in the table rows.
    *   Ensure "Adjustment" rows render the amount in **Red** (Negative/Debit) and in the correct "Debit" column, not the "Credit" column.

## Phase 5: Final Cleanup
**Objective:** Polish the UI and remove any temporary emergency controls if necessary.

1.  **Refine Delete Permissions:**
    *   Ensure the Delete button *only* appears for manually created Adjustments or Retries, preventing accidental deletion of legitimate automated Trip transactions.
2.  **Documentation:**
    *   Add code comments explaining why these specific transaction types are editable/deletable.
