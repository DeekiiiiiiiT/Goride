# Implementation Plan: Granular Driver Data Reset

## Phase 1: Backend Granularity Implementation (COMPLETE)
**Objective:** Update the backend API (`/admin/reset-by-date`) to support distinct targeting of Tolls and Fuel data, rather than deleting all transactions.

1.  **Analyze Transaction Categories:**
    *   Review `types/data.ts` to confirm exact string values for transaction categories (e.g., 'Toll Usage', 'Toll Top-up', 'Fuel').
    *   Review `types/fuel.ts` to confirm structure of `FuelEntry` and its storage prefix (`fuel_entry:`).

2.  **Modify `reset-by-date` Endpoint (Search/Preview Logic):**
    *   Update `supabase/functions/server/index.tsx`.
    *   **Fuel Logic:** Add a new check: `if (targets.includes('fuel'))`.
        *   Fetch keys with prefix `fuel_entry:`.
        *   Filter by date and `driverId`.
        *   Also fetch keys with prefix `transaction:` where `category === 'Fuel'`.
    *   **Toll Logic:** Add a new check: `if (targets.includes('tolls'))`.
        *   Fetch keys with prefix `transaction:` where `category` includes 'Toll'.
    *   **Refine 'Trips' Logic:** Ensure it remains unchanged.
    *   **Deprecate 'Transactions' Target:** Remove the broad `transaction:*` fetch that deletes everything.

3.  **Update Delete Logic:**
    *   Ensure the `mdel` (multi-delete) function receives the combined list of keys from Trips, Fuel Entries, Fuel Transactions, and Toll Transactions.

## Phase 2: Frontend Selection Logic Update (COMPLETE)
**Objective:** Update the `DataResetModal` UI to replace the generic "Transactions" checkbox with specific "Toll Data" and "Fuel Logs" options.

1.  **Update State Management:**
    *   In `components/admin/DataResetModal.tsx`, update the `targets` state definition to allow string values: `'trips' | 'tolls' | 'fuel'`.
    *   Set default targets for "Reset Driver Data" to `['trips', 'tolls', 'fuel']`.

2.  **Refactor Checkbox UI:**
    *   Locate the "Data Types to Purge" section.
    *   Keep **Trips** checkbox.
    *   Remove **Transactions** checkbox.
    *   Add **Toll Data** checkbox (Label: "Toll Receipts & Usage").
    *   Add **Fuel Logs** checkbox (Label: "Fuel Receipts & Logs").

3.  **Update Preview Request Payload:**
    *   Ensure `handleFetchPreview` sends the new specific strings (`['trips', 'tolls', 'fuel']`) instead of the old `['trips', 'transactions']`.

## Phase 3: Preview & API Integration (COMPLETE)
**Objective:** Ensure the Preview screen correctly displays and categorizes the new data types so the user knows exactly what will be deleted.

1.  **Update Preview Item Interface:**
    *   In `DataResetModal.tsx`, update the `PreviewItem` interface (or implicit type) to handle `type: 'fuel' | 'toll' | 'trip'`.

2.  **Update Preview Rendering:**
    *   Modify the list render logic to show appropriate icons/labels:
        *   **Trips:** Show Car icon.
        *   **Fuel:** Show Fuel Pump icon (use `Lucide` icon).
        *   **Tolls:** Show Receipt/Ticket icon.
    *   Verify "Has Receipt" indicator works for Fuel and Tolls (checking `receiptUrl` or `invoiceUrl`).

3.  **Test Selection Toggling:**
    *   Ensure unchecking a specific item in the preview correctly removes it from the `keysToDelete` list in the final payload.

## Phase 4: Validation & Receipt Cleanup Refinement
**Objective:** Verify that file deletion works for the new data types and perform final safety checks.

1.  **Backend Storage Cleanup:**
    *   Verify that `fuel_entry` records utilize `receiptUrl` (or `invoiceUrl`) and that the backend logic extracts this path for deletion from the `make-37f42386-docs` bucket.
    *   Verify that Toll transactions with receipt images are also caught by the image deletion logic.

2.  **Safety Verification:**
    *   Ensure "Salary" or "Payout" transactions are **NOT** included in the deletion list when selecting these options.

3.  **Final Polish:**
    *   Update success messages to say "Trips, Tolls, and Fuel data deleted" instead of just "Data deleted".
