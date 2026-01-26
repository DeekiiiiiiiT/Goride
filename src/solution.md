# Disaster Recovery & Import Fixes Plan

## Phase 1: Fix Missing Dependencies (Critical Crash)
**Objective:** Resolve the `ReferenceError: tripCalibrationService is not defined` to allow the import process to complete.

1.  **Step 1.1: Import Service in ImportsPage**
    *   **Action:** Edit `/components/imports/ImportsPage.tsx`.
    *   **Detail:** Add `import { tripCalibrationService } from '../../services/tripCalibrationService';` to the top imports section.
    *   **Reason:** The `handleConfirmImport` function calls this service, but it is currently not imported.

2.  **Step 1.2: Verify Service Signature**
    *   **Action:** Read `/services/tripCalibrationService.ts` (already done, but confirmed).
    *   **Detail:** Ensure `calibrateTrips` accepts `processedData` (Trip[]) as an argument.
    *   **Reason:** Prevents a subsequent TypeScript or runtime error after the import is fixed.

## Phase 2: Refine Anomaly Detection Logic (False Positives)
**Objective:** Stop the system from flagging legitimate financial adjustments (tips, gratuities, refunds) as "Zero Distance" anomalies.

1.  **Step 2.1: Expand Keyword Exclusion List**
    *   **Action:** Edit `/services/dataSanitizer.ts`.
    *   **Detail:** In the `auditTrip` method, locate the `isFare` logic.
    *   **Change:** Update the condition to exclude records where `notes` (or `type`) contains:
        *   "adjustment"
        *   "gratuity"
        *   "miscellaneous"
        *   "other"
        *   "cancellation"
    *   **Code:** `const isFare = !trip.notes?.toLowerCase().match(/tip|bonus|adjustment|gratuity|misc|other|cancel/);`

2.  **Step 2.2: Safety Check for Notes**
    *   **Action:** Ensure `trip.notes` is accessed safely (optional chaining `?.`) in the new logic.
    *   **Reason:** Imported CSV data often has empty or undefined notes fields.

## Phase 3: Final Verification
**Objective:** Ensure the import flow runs smoothly without console errors or incorrect warnings.

1.  **Step 3.1: Review ImportsPage Logic**
    *   **Action:** Manual review of `handleConfirmImport` in `ImportsPage.tsx`.
    *   **Detail:** Check that the `calibratedTrips` result is correctly passed to the batch creation logic.

2.  **Step 3.2: Complete**
    *   **Action:** Mark task as done.
