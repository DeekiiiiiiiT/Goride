# Smart Unified Restoration Strategy

## Context
This document outlines the implementation plan for splitting the odometer export into a comprehensive "Master Log" and a legacy "Check-in" CSV, ensuring they are treated as distinct restoration paths.

## Phase 1: Data Aggregation & API Layer (Backend Export)
**Goal:** Enhance the data collection logic to retrieve odometer readings from ALL source tables (Fuel, Service, Check-ins, Manual) to create a true "Master Log".

1.  **Fuel Data Fetching Implementation:**
    *   Verify `api.ts` capabilities for fetching all fuel entries.
    *   If `api.getFuelEntriesByVehicle` is missing, implement a helper in `data-export.ts` to fetch all fuel entries (using `fetchAllFuelLogs` logic) and filter by `vehicleId` in memory (or optimize if API allows).
    *   Create `normalizeFuelReadings(fuelEntries: FuelEntry[]): OdometerReading[]` helper.
        *   Map `date` -> `date`.
        *   Map `odometer` -> `value`.
        *   Set `source` = `'Fuel Log'`.
        *   Filter out entries with 0 or missing odometer.

2.  **Service Data Fetching Implementation:**
    *   Use existing `api.getMaintenanceLogs(vehicleId)`.
    *   Create `normalizeServiceReadings(serviceLogs: ServiceRequest[]): OdometerReading[]` helper.
        *   Map `date` -> `date`.
        *   Map `odometer` -> `value`.
        *   Set `source` = `'Service Log'`.
        *   Filter out entries with 0 or missing odometer.

3.  **Manual & Check-in Data Fetching (Refinement):**
    *   Keep existing `api.getOdometerHistory` (Manual) and `api.getCheckInsByVehicle` (Check-in) calls.
    *   Ensure Check-in normalization sets `source` = `'Weekly Check-in'`.
    *   Ensure Manual normalization sets `source` = `'Manual'`.

## Phase 2: Aggregation Logic & CSV Generation
**Goal:** Integrate the new data sources into the main export function and ensure correct CSV formatting.

1.  **Refactor `fetchAllOdometerReadings`:**
    *   Update `Promise.all` inside the vehicle loop to fetch from all 4 sources concurrently:
        ```typescript
        const [manual, checkins, fuel, service] = await Promise.all([ ... ]);
        ```
    *   Apply the normalization helpers from Phase 1.
    *   Merge all 4 arrays into a single `allReadings` array.

2.  **Sorting & Deduplication:**
    *   Sort `allReadings` by `date` (ascending).
    *   (Optional) Implement basic deduplication: If multiple entries exist for the exact same timestamp + source + value, keep one. If different sources have same timestamp, keep all to show corroboration.

3.  **CSV Output Verification:**
    *   Ensure `ODOMETER_CSV_COLUMNS` handles the `source` field correctly.
    *   Verify `jsonToCsv` correctly processes the unified list.

## Phase 3: Validation & Safe Import Check
**Goal:** Verify the export output and ensure the import process (even if not changing) won't choke on the new data.

1.  **Export Output Testing:**
    *   Generate the "Odometer History" backup.
    *   Verify the CSV contains rows with 'Fuel Log', 'Service Log', 'Weekly Check-in', and 'Manual'.
    *   Verify the row counts match the "Raw History" tab in the UI.

2.  **Import Impact Analysis:**
    *   Review `import-validator.ts` and `data-import-executor.ts` for "Odometer History" import.
    *   Confirm that importing this "Master Log" will create `odometer_readings` (anchors) for all these entries.
    *   *Note:* We are NOT recreating the original fuel/service records from this CSV; we are creating *Odometer Anchors*. This is the intended behavior for "Restoring Odometer History".
    *   Ensure no validation rules block 'Fuel Log' or 'Service Log' as valid sources.
