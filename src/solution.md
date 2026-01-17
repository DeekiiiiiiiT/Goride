# Fuel System Implementation Plan

## Overview
This document outlines the phased implementation plan for refactoring the Fuel Configuration system to use a "Scenario" model and implementing the AI Auto-Approval workflow for Odometer anchors.

## Phase 1: Database & Type System Updates [COMPLETED]
**Goal:** Define the data structures for Scenarios and ensure Transaction types support AI verification metadata.

1.  **Update `types/fuel.ts`**:
    *   Define `FuelScenario` interface (id, name, description, rules).
    *   Define `FuelRule` interface (category, coverageType, coverageValue, conditions).
2.  **Update `types/data.ts`**:
    *   Ensure `FinancialTransaction['metadata']` explicitly supports:
        *   `odometerMethod`: 'ai_verified' | 'manual_override' | 'manual'
        *   `aiConfidence`: string
        *   `odometerProofUrl`: string
3.  **Update `types/vehicle.ts`**:
    *   Ensure `OdometerReading` supports source verification flags.
4.  **Service Layer Updates**:
    *   Add `getFuelScenarios`, `saveFuelScenario`, `deleteFuelScenario` to `services/fuelService.ts`.

## Phase 2: Backend Logic for AI Auto-Approval [COMPLETED]
**Goal:** Implement the server-side logic to auto-approve AI-verified fuel transactions and create odometer anchors.

1.  **Modify `POST /transactions` Endpoint**:
    *   Locate the endpoint in `/supabase/functions/server/index.tsx`.
    *   Add condition: `if (category === 'Fuel' && metadata.odometerMethod === 'ai_verified')`.
2.  **Implement Auto-Approval**:
    *   Set `transaction.status = 'Approved'`.
    *   Set `transaction.isReconciled = true`.
    *   Add `approvalReason: 'Auto-approved via AI Odometer Scan'` to metadata.
3.  **Implement Anchor Creation**:
    *   Inside the same condition, immediately construct a `FuelEntry` object.
    *   Map `odometer`, `amount`, `liters`, `pricePerLiter` from the transaction.
    *   Set `isVerified: true` and `source: 'Fuel Log'`.
    *   Save to `fuel_entry:` KV store.
4.  **Testing Endpoint**:
    *   Verify that manual overrides remain `Pending`.
    *   Verify that AI verified submissions become `Approved`.

## Phase 3: Fuel Configuration UI Refactor (Scenario Model) [COMPLETED]
**Goal:** Replace the static configuration with a dynamic Scenario-based rule engine.

1.  **Create Scenario Components**:
    *   `components/fuel/ScenarioList.tsx`: List active scenarios.
    *   `components/fuel/ScenarioEditor.tsx`: Form to create/edit scenarios and their rules.
2.  **Update `FuelConfiguration.tsx`**:
    *   Replace current content with a tabbed view or master-detail view for Scenarios.
    *   Integrate `ScenarioList` and `ScenarioEditor`.
3.  **Implement Assignment Logic**:
    *   Add ability to assign a Scenario to a `Vehicle` or `Driver`.
    *   Update `VehicleDetail` or `DriverProfile` to show assigned Fuel Scenario.
4.  **Backend Rules Engine (Preliminary)**:
    *   Ensure the backend respects these rules when processing Reimbursements (if applicable in future, or just for UI display/validation for now).

## Phase 4: Frontend Integration of AI Verification Workflow [COMPLETED]
**Goal:** Connect the Driver App UI to the new backend logic and provide user feedback.

1.  **Verify Payload Construction**:
    *   Audit `components/driver-portal/DriverExpenses.tsx` `handleSubmit`.
    *   Ensure `odometerMethod` is correctly populated from the `OdometerScanner` result.
2.  **UI Feedback**:
    *   Update `DriverExpenses.tsx` to handle the response from `saveTransaction`.
    *   If the returned transaction is `Approved`, show a specific success message ("Expense Auto-Approved & Odometer Updated").
3.  **Error Handling**:
    *   Ensure failure to create the anchor does not block the transaction saving (or handles it gracefully).

## Phase 5: Verification & End-to-End Testing [COMPLETED]
**Goal:** Validate the entire system stability and correctness.

1.  **Test Case A (Happy Path)**:
    *   Driver logs fuel -> Scans Odometer (AI Success) -> Submits.
    *   **Result:** Transaction is Approved, Odometer Anchor created in `MasterLogTimeline`.
2.  **Test Case B (Manual Override)**:
    *   Driver logs fuel -> Scans Odometer (Fail/Reject) -> Enters Manual -> Submits.
    *   **Result:** Transaction is Pending, NO Odometer Anchor created. Admin must approve.
3.  **Test Case C (Scenario Config)**:
    *   Admin creates "50% Split" Scenario.
    *   Assigns to Driver A.
    *   (Future: Verify calculations, for now verify assignment persistence).
4.  **Regression Testing**:
    *   Check Tolls and Maintenance logging to ensure no side effects.

## Phase 6: Code Cleanup & Documentation [COMPLETED]
1.  **Refactor**: Move large logic blocks from `index.tsx` into helper functions if file size permits (or keep clean within the route).
2.  **Documentation**: Update `docs/Fuel Maintenance.md` with the new Auto-Approval workflow.
3.  **Final Polish**: Remove debug logs and ensure consistent styling in new components.

## Phase 7: Date & Timezone Fixes for Fuel Logs
**Goal:** Ensure fuel log dates are captured and displayed accurately in the user's local timezone, resolving the "off-by-one-day" and "UTC midnight" issues.

### Phase 7.1: Frontend Date Input Fix
**Goal:** Correct the date picker logic in `DriverExpenses.tsx` to prevent timezone shifting when selecting a date.
1.  **Locate `onChange` handler**: In `components/driver-portal/DriverExpenses.tsx`, find the `<Input type="date">` component.
2.  **Implement Local Date Parser**:
    *   Replace `setDate(new Date(e.target.value))` with a safer parsing method.
    *   Create a helper `parseLocalDate(dateString)` that splits the "YYYY-MM-DD" string and creates a Date object using `new Date(year, monthIndex, day)` to preserve local midnight.
3.  **Verify `format` Usage**:
    *   Ensure the `value` prop uses `format(date, 'yyyy-MM-dd')` (which it already does, but verification is key).
    *   Confirm that selecting a date keeps the input value stable (no -1 day jumps).

### Phase 7.2: Backend Timestamp Construction
**Goal:** Update the server to save a full ISO timestamp (Date + Time) for Fuel Entry anchors, instead of just the date.
1.  **Locate Anchor Creation Logic**: In `/supabase/functions/server/index.tsx`, find the `POST /transactions` route and the block where `fuelEntry` is created.
2.  **Construct Full Timestamp**:
    *   The request body contains `date` ("YYYY-MM-DD") and `time` ("HH:mm:ss").
    *   Combine these into a single ISO string: `const fullTimestamp = new Date(${transaction.date}T${transaction.time}).toISOString()`.
    *   *Self-Correction*: Wait, `new Date("...T...")` might interpret as Local or UTC depending on browser/env. Since backend is Deno (UTC env), we must be careful.
    *   *Safe Approach*: We want to store the "Absolute Time" represented by the user's local input. If the user sends "2026-01-17" and "19:30", they mean 19:30 Local Time.
    *   However, the backend doesn't know the user's timezone offset.
    *   *Alternative*: Store the string literal `${transaction.date}T${transaction.time}` if the `FuelEntry` schema allows.
    *   *Better Standard*: If we assume the driver is reporting in their local time, and we want to display that time back to them, storing it as an ISO string (e.g., adding `Z` or handling offset) is complex without the offset.
    *   *Decision*: We will construct the string `${transaction.date}T${transaction.time}`. If we parse this with `new Date()` in the frontend, it will be treated as Local Time by the browser, which is exactly what we want for "Wall Clock" accuracy (User sees what they entered).
3.  **Update `FuelEntry` Object**:
    *   Set `date: ${transaction.date}T${transaction.time}`.
    *   Ensure this string format is compatible with `MasterLogTimeline`'s parsing.

### Phase 7.3: Frontend Timeline Display Logic
**Goal:** Ensure `MasterLogTimeline.tsx` correctly handles the new timestamp format and legacy date-only strings without timezone errors.
1.  **Update Rendering Logic**:
    *   In `components/vehicles/odometer/MasterLogTimeline.tsx`, locate the mapping function.
    *   Current: `format(new Date(item.date), 'MMM d, yyyy')`.
    *   Update: Check if `item.date` includes a "T" (time component).
        *   If YES: `new Date(item.date)` works as Local Time (browser default for ISO without Z).
        *   If NO (Legacy): Parse the "YYYY-MM-DD" manually to Local Midnight (avoiding the UTC `new Date()` trap) using a helper `parseISOAsLocal(dateStr)`.
2.  **Regression Test Display**:
    *   Check how old entries (date-only) appear. They should now appear as "Jan 17" (Local) instead of "Jan 16" (UTC->Local Shift).
    *   Check how new entries (timestamp) appear. They should show correct Date AND Time.

### Phase 7.4: End-to-End Verification
**Goal:** Prove the fix works with a real data flow.
1.  **Reset/Clear Data**: (Optional) or just create a new entry.
2.  **Submit Fuel Log**:
    *   Select "Jan 17" in Driver Portal.
    *   Enter Time "14:00".
    *   Submit.
3.  **Verify Timeline**:
    *   Check Master Log Timeline.
    *   Verify Date is "Jan 17".
    *   Verify Time is "14:00".
4.  **Verify Legacy Data**:
    *   Look at the previous "Jan 17" entry (the one that showed Jan 16).
    *   It should now likely show "Jan 17" (00:00) due to the improved parsing in Phase 7.3.
