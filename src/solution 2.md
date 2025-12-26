# Solution 2: Static Import Reconstruction

This plan moves the "Trip Meter" calculation upstream to the Import process, ensuring consistent metrics that are calculated once and stored permanently.

## Phase 1: Update Data Model
**Goal:** Expand the `Trip` interface to store the granular efficiency metrics.

*   **Step 1.1:** Open `/types/data.ts`.
*   **Step 1.2:** Add the following optional fields to the `Trip` interface:
    *   `onTripHours` (number) - Period 3
    *   `toTripHours` (number) - Period 2
    *   `availableHours` (number) - Period 1 (Allocated)
    *   `totalHours` (number) - Total Online Time attributed to this trip.

## Phase 2: Implement Import Logic (Core)
**Goal:** Modify the CSV parser to calculate and store these metrics during the file upload.

*   **Step 2.1:** Open `/utils/csvHelpers.ts`.
*   **Step 2.2:** Create a Helper Function `calculateFleetRatios(files: FileData[])`.
    *   Scan all files in the batch.
    *   Identify files of type `uber_vehicle_performance`.
    *   Sum the global totals:
        *   `Sum_OnTrip` (from "Hours On Trip")
        *   `Sum_OnJob` (from "Hours On Job")
        *   `Sum_Online` (from "Online Hours")
    *   Calculate and return the 3 Global Ratios:
        *   `RATIO_ON_TRIP = Sum_OnTrip / Sum_OnJob`
        *   `RATIO_TO_TRIP = (Sum_OnJob - Sum_OnTrip) / Sum_OnJob`
        *   `RATIO_AVAILABLE = (Sum_Online - Sum_OnJob) / Sum_OnJob`
    *   *Safety:* Handle divide-by-zero (default to 0).

*   **Step 2.3:** Update `mergeAndProcessData` function.
    *   Insert a "Pre-Pass" Step at the beginning of the function.
    *   Call `calculateFleetRatios` to get the constants before processing any rows.

*   **Step 2.4:** Update the `uber_trip` processing block.
    *   Locate the "Duration Calculation" section.
    *   Ensure strict calculation: `JobDuration = (DropOffTime - RequestTime)`.
    *   Apply the Ratios to this `JobDuration`:
        *   `trip.onTripHours = JobDuration * RATIO_ON_TRIP`
        *   `trip.toTripHours = JobDuration * RATIO_TO_TRIP`
        *   `trip.availableHours = JobDuration * RATIO_AVAILABLE`
        *   `trip.totalHours = Sum(onTrip + toTrip + available)`
    *   Assign these values to the `current` trip object.

## Phase 3: Refactor Driver Detail UI
**Goal:** Simplify the frontend to display the pre-calculated data.

*   **Step 3.1:** Open `/components/drivers/DriverDetail.tsx`.
*   **Step 3.2:** Remove the dynamic "Ratio-Reconstruction Algorithm" block (Phase 3 logic).
*   **Step 3.3:** Implement Summation Logic in the `metrics` useMemo hook.
    *   Filter trips by the selected Date Range.
    *   Sum the pre-calculated fields:
        *   `vOnTrip = Sum(trip.onTripHours)`
        *   `vOnJob = Sum(trip.onTripHours + trip.toTripHours)`
        *   `vOnline = Sum(trip.totalHours)`
*   **Step 3.4:** Update the `tripRatio` object to use these new sums.

## Phase 4: Verification & Safe Fallbacks
**Goal:** Ensure robustness when data is missing or incomplete.

*   **Step 4.1:** **Missing Performance File:**
    *   If `vehicle_performance.csv` is not in the batch, `calculateFleetRatios` should return Defaults.
    *   *Default Strategy:* Assume 100% Efficiency? Or 0?
    *   *Decision:* If missing, `RATIO_ON_TRIP = 1`, others = 0. This treats the Trip Duration as the *only* known time (Conservative approach).

*   **Step 4.2:** **Data Integrity Check:**
    *   Ensure `totalHours` never exceeds 24 hours for a single trip (sanity check).
    *   Ensure `JobDuration` is positive.
