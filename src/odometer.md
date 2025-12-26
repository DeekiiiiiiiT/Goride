# Odometer Implementation Plan

## Phase 1: Types & Data Layer Implementation
- [ ] **Step 1:** Define `OdometerReading`, `OdometerSource`, and `OdometerType` interfaces in `/types/vehicle.ts`.
- [ ] **Step 2:** Create a new service file `/services/odometerService.ts`.
- [ ] **Step 3:** Implement `getHistory(vehicleId)` to fetch data from KV store.
- [ ] **Step 4:** Implement `addReading(vehicleId, reading)` to save data to KV store.
- [ ] **Step 5:** Implement `getLatestReading(vehicleId)` helper to easily find the current odometer value.

## Phase 2: Visualizing the Data (The History Tab)
- [ ] **Step 1:** Create a new component `/components/vehicles/odometer/OdometerHistory.tsx`.
- [ ] **Step 2:** Design the list item layout (Icon for source, Date, Reading, Delta if applicable).
- [ ] **Step 3:** Integrate this component into `/components/vehicles/VehicleDetail.tsx` as a new Tab or a section within the "Overview" tab (or a specialized view). *Decision: We will add a new Tab called "Odometer" for clarity.*

## Phase 3: Manual Odometer Updates
- [ ] **Step 1:** Create `/components/vehicles/odometer/UpdateOdometerDialog.tsx`.
- [ ] **Step 2:** Implement a form with Date (default today), Reading (number), and Notes.
- [ ] **Step 3:** Add an "Update Mileage" button to the `VehicleDetail` header area (near the current odometer display).
- [ ] **Step 4:** Wire the submit action to `odometerService.addReading`.

## Phase 4: Connecting Service Logs
- [ ] **Step 1:** Locate the `handleSaveLog` function in `/components/vehicles/VehicleDetail.tsx`.
- [ ] **Step 2:** Add logic: When a Service Log is saved successfully, create a corresponding `OdometerReading` entry with `source: 'Service Log'` and `type: 'Hard'`.
- [ ] **Step 3:** Ensure that editing a Service Log also updates the corresponding Odometer entry (if the odometer value changed).

## Phase 5: "Current Odometer" Logic & Synchronization
- [ ] **Step 1:** Modify `VehicleDetail` to fetch the `latestReading` on load.
- [ ] **Step 2:** Update the main "Odometer" display in the header to show this dynamic value instead of the static `vehicle.metrics.odometer`.
- [ ] **Step 3:** Update the "Next Service Due" calculation to use this dynamic value.

## Phase 6: Logic for Incremental Imports (The "Anchor" Logic)
- [ ] **Step 1:** Implement a smart calculation function in `odometerService.ts`: `calculateProjectedReading(vehicleId, date, distanceTraveled)`.
- [ ] **Step 2:** This function must:
    1. Fetch history.
    2. Find the reading immediately *preceding* the given date (The Anchor).
    3. Return `Anchor.value + distanceTraveled`.
- [ ] **Step 3:** This prepares the system for the future "Trip Import" feature.

## Phase 7: Data Migration & Initialization
- [ ] **Step 1:** Add an initialization check in `VehicleDetail`.
- [ ] **Step 2:** If `odometerHistory` is empty but `vehicle.metrics.odometer` > 0, automatically create a "Baseline" entry using the current metric. This ensures the new system works immediately for existing vehicles.
