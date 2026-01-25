# Solution Plan: Fix for Default Time Injection and UTC Shifting

## Background
The system is currently injecting a "07:00 PM" or "19:00" timestamp into manual entries. This is caused by a combination of UTC timezone shifting (UTC midnight becoming local 7pm) and an automated fallback in the settlement service that injects the "current time" into approved records.

## Implementation Phases

### Phase 1: Diagnostic & Data Normalization Analysis
*   **Step 1.1**: Audit all components that handle date/time input (Modals, Forms) specifically looking for `type="date"` vs `type="datetime-local"`.
*   **Step 1.2**: Audit the `settlementService.ts` and `api.ts` to identify everywhere `format(new Date(), 'HH:mm:ss')` or `new Date()` is used as a default for historical records.
*   **Step 1.3**: Map out the flow of manual fuel entries from the `FuelLogModal` to the `settlementService` to find the exact injection point of "current time".

### Phase 2: Removing Fallback Time Injection
*   **Step 2.1**: Update `settlementService.ts` to make the `time` property optional and remove the `format(new Date(), 'HH:mm:ss')` fallback in `processFuelSettlement`.
*   **Step 2.2**: Ensure that when a settlement (Credit) is created from a manual entry (Debit), it explicitly copies the source's time value (even if null) instead of generating a new one.
*   **Step 2.3**: Modify the `Manual Entry` save logic in `FuelLedgerView.tsx` and `FuelLogModal.tsx` to stop sending the current system time if the user hasn't specified one.

### Phase 3: Implementing Local-Safe Date Utilities
*   **Step 3.1**: Update `/utils/timeUtils.ts` with a `parseLocalDate` function that treats `YYYY-MM-DD` strings as local dates by splitting components rather than using the native UTC parser.
*   **Step 3.2**: Replace `new Date(dateString)` calls in critical UI components with the new `parseLocalDate` utility to stop the UTC-to-7:00PM shift.
*   **Step 3.3**: Standardize the `formatDateTime` helper used in `FuelLedgerView.tsx` and migrate it to a global utility for app-wide consistency.

### Phase 4: UI/UX Refinement for Optional Time
*   **Step 4.1**: Update the `FuelLogModal` and `EditTransaction` components to allow the time field to be cleared or remain "Not Set".
*   **Step 4.2**: Add conditional rendering to all "Transaction Details" screens (like the Reimbursement Request modal) so the "at [Time]" text is hidden if no time data exists.
*   **Step 4.3**: Ensure "Verified" badges and other audit trail status indicators don't break when time data is missing.

### Phase 5: Data Verification & Integrity Check
*   **Step 5.1**: **Regression Test**: Create a manual entry for "2025-01-01" and verify it stays as "Jan 01, 2025" with no time across all views.
*   **Step 5.2**: **Verification**: Approve the entry and check that the generated credit also has no time (synced with its parent debit).
*   **Step 5.3**: **Integrity Check**: Confirm that high-volume datasets (like actual trips or bulk fuel imports) which *do* have timestamps still display them correctly.

---
**Status**: Complete. System-wide timestamp normalization and UTC-shift mitigation finalized.
