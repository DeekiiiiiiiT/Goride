
# Plan: Consolidate Fuel Import/Export Logic

## Goal
Move Fuel Management import functionality to the **Import Data** section and export functionality to the **Reports** section, cleaning up the Fuel Management dashboard.

## Phase 1: Preparation & Type Safety
1.  **Objective**: Ensure all necessary types and services are available globally.
2.  **Steps**:
    -   Verify `FuelEntry` and `FuelCard` types are exported from `types/fuel.ts`.
    -   Ensure `fuelService` (in `services/fuelService.ts`) has methods for bulk saving if possible, or confirm `saveFuelEntry` is sufficient.
    -   Create a new interface `FuelFileData` in `utils/csvHelpers.ts` to extend the file handling logic.

## Phase 2: Enhanced File Detection
1.  **Objective**: Update the central file detector to recognize Fuel Card statements.
2.  **Steps**:
    -   Modify `utils/csvHelpers.ts` -> `detectFileType`.
    -   Add detection logic for fuel headers (keywords: "Card", "Pan", "Volume", "Product", "Merchant", "Station").
    -   Return `'fuel_statement'` as a new `FileType`.

## Phase 3: Fuel Import UI (ImportsPage)
1.  **Objective**: Update `ImportsPage` to display and handle Fuel files.
2.  **Steps**:
    -   Open `components/imports/ImportsPage.tsx`.
    -   Add `Fuel` icon from `lucide-react` to the imports list for `fuel_statement` files.
    -   Update `getFileIcon` helper.
    -   Add logic to fetch `fuelCards` (via `fuelService.getFuelCards`) on mount, so we can match cards during import.

## Phase 4: Fuel Import Logic (Parsing & Mapping)
1.  **Objective**: Port the parsing logic from `FuelImportModal` to `ImportsPage`.
2.  **Steps**:
    -   In `ImportsPage.tsx`, inside `handleMerge` (or a new handler `handleFuelProcess`), implement the mapping logic found in `FuelImportModal`.
    -   It needs to map CSV columns to `FuelEntry` fields: `date`, `amount`, `liters`, `cardId`.
    -   Implement the "Card Matching" logic (match last 4 digits of CSV card number to `cards` list).
    -   Store valid fuel entries in a new state variable `processedFuelEntries`.

## Phase 5: Fuel Import Execution (Saving)
1.  **Objective**: Save the parsed fuel entries to the backend.
2.  **Steps**:
    -   In `ImportsPage.tsx` -> `handleConfirmImport`:
    -   Add a check: `if (processedFuelEntries.length > 0)`.
    -   Loop through and call `fuelService.saveFuelEntry` for each.
    -   Add toast notification for success/failure.

## Phase 6: Fuel Report Generation Logic
1.  **Objective**: Create the logic to generate the Fuel Reconciliation Report.
2.  **Steps**:
    -   Open `utils/ReportGenerator.ts`.
    -   Add method `generateFuelReconciliation(entries: FuelEntry[], vehicles: any[])`.
    -   Logic: Group by Vehicle, sum Cost, sum Liters, calculate Efficiency.
    -   Return `ReportSummary` object (compatible with existing report system).

## Phase 7: Reports Page UI
1.  **Objective**: Add the Fuel Report card to the Reports dashboard.
2.  **Steps**:
    -   Open `components/reports/ReportsPage.tsx`.
    -   Add a new `ReportCard` titled "Fuel Reconciliation Report".
    -   In `handleExport`, add case for `'Fuel Reconciliation Report'`.
    -   Inside that case:
        -   Fetch all fuel entries (`fuelService.getFuelEntries`).
        -   Fetch vehicles (`api.getVehicles`).
        -   Call `ReportGenerator.generateFuelReconciliation`.
        -   Trigger download.

## Phase 8: Clean Up Fuel Management (Imports)
1.  **Objective**: Remove the old import modal.
2.  **Steps**:
    -   Open `pages/FuelManagement.tsx`.
    -   Remove `FuelImportModal` import.
    -   Remove `isImportModalOpen` state.
    -   Remove the "Import Statement" button from the Logs tab.
    -   Delete `components/fuel/FuelImportModal.tsx` file (optional, but good for cleanup).

## Phase 9: Clean Up Fuel Management (Exports)
1.  **Objective**: Remove the old export button.
2.  **Steps**:
    -   Open `components/fuel/FuelLayout.tsx`.
    -   Remove the "Export Report" button from the header.
    -   Remove unused props (`onExport` if it existed).

## Phase 10: Final Integration Test
1.  **Objective**: Verify the entire flow.
2.  **Steps**:
    -   Go to **Imports**: Upload a sample fuel CSV. Verify it detects as `fuel_statement`. Import it.
    -   Go to **Fuel Management**: Check Logs tab. Verify new entries appear.
    -   Go to **Reports**: Click "Export" on Fuel Report. Verify CSV/PDF downloads.
