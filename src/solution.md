# Implementation Plan: Uber & CSV Logic Refinement

## Phase 1: Establish Strict Column-Based Parsing (No Guessing)
**Goal:** Ensure the system accurately reads the core metrics (`On Job`, `Online`, `On Trip`) from `vehicle_performance.csv` without applying fallback logic that corrupts data when columns are missing.

### Step 1.1: Refine `mergeAndProcessData` in `/utils/csvHelpers.ts`
- **Objective:** Separate the parsing logic for `vehicle_performance` (Aggregates) vs. `driver_activity` (Individual Logs).
- **Action:**
  - Create a dedicated parser block for `vehicle_performance.csv`.
  - Strictly map:
    - `Hours Online` -> `sumOnline`
    - `Hours On Job` -> `sumOnJob`
    - `Hours On Trip` -> `sumOnTrip`
  - **Crucial Change:** Remove the "Fallback Logic" that sets `OnJob = Online` or `OnJob = OnTrip`. If the `Hours On Job` column is missing (e.g., in `driver_activity`), `sumOnJob` must remain `0`. This forces the UI to reflect missing data rather than fake data.

### Step 1.2: Standardize "D:H:M" Duration Parsing
- **Objective:** Prevent the "11523.00 hrs" error by correctly handling Uber's `Days:Hours:Minutes` format.
- **Action:**
  - Verify the `parseDurationToHours` function handles:
    - `H:M:S` (Standard)
    - `D:H:M` (Uber Activity)
    - `M:S` (Short duration)
  - Apply this parser to all duration fields in the aggregation loop.

### Step 1.3: Update Global Stats Calculation
- **Objective:** Implement the formulas from `IDEA_1.md`.
- **Action:**
  - `Available = sumOnline - sumOnJob`
  - `To Trip = sumOnJob - sumOnTrip`
  - `On Trip = sumOnTrip`
  - Ensure negative values are clamped to 0 (in case of bad data).

---

## Phase 2: Enhanced "Driver Activity" Parsing (The "Missing Link")
**Goal:** Extract whatever useful data *can* be found in `driver_activity.csv` (like `Time driving to pickup`) to fill the gaps when `vehicle_performance.csv` is missing.

### Step 2.1: Target "Time driving to pickup" Column
- **Objective:** Directly capture "To Trip" time if the specific column exists.
- **Action:**
  - Add a scanner for columns: `Time driving to pickup`, `Time to pickup`, `Driving to Pickup`.
  - Accumulate this into a new variable `sumToTrip`.

### Step 2.2: Reconstruct "On Job" from Components
- **Objective:** If `sumOnJob` is missing (Activity file) but we found the components, calculate it.
- **Action:**
  - Logic: `if (sumOnJob == 0 && sumToTrip > 0 && sumOnTrip > 0) { sumOnJob = sumOnTrip + sumToTrip; }`
  - This allows the `Available` calculation (`Online - OnJob`) to work even with only the Activity file.

### Step 2.3: Validate Against "Online Time"
- **Objective:** Sanity check the reconstructed data.
- **Action:**
  - If `sumOnJob > sumOnline`, warn or cap the value (since you can't be on the job longer than you are online).

---

## Phase 3: UI & Feedback Updates
**Goal:** Clearly communicate to the user *which* data source is being used and if key metrics are missing.

### Step 3.1: Update `FleetOverview` Component
- **Objective:** Show "N/A" or "0.00" explicitly for "To Trip" if the data is missing, instead of hiding it.
- **Action:**
  - If `toTripRatio` is 0 but `totalOnline` is > 0, display a tooltip or warning: "Upload Vehicle Performance CSV to see To Trip stats."

### Step 3.2: Verify "Target" vs. "Available" Display
- **Objective:** Ensure the "Target" card matches `sumOnJob` (Official Job Time) and "Available" matches the calculated remaining time.
- **Action:**
  - Review `CalibrationReport.tsx` (or where these cards live) to ensure they use the values directly from the `FleetStats` object without extra client-side math that might distort them.
