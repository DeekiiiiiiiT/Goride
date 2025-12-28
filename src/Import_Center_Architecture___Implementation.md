# Import Center Architecture & Implementation Record

This document records the detailed reconstruction process of the Import Hub and its associated strategies, wizard flows, and logic engines.

## Phase 1: Core Architecture & Type Definitions
**Objective:** Establish the TypeScript foundations and interfaces that drive the polymorphic import system.
1.  **Define Import Strategy Interface:** Created `ImportStrategy` interface in `types/import-flow.ts` to enforce a standard contract for all import types (Trips, Payments, Drivers).
2.  **Define Data Models:** Standardized the `Trip` interface in `types/data.ts` to include Phase 1 (Core) and Phase 2 (Financial) fields.
3.  **Define Import Stages:** established the specific state flow: `upload` -> `processing` -> `preview` -> `success` to manage the wizard lifecycle.
4.  **Create Validation Types:** Defined `ValidationError` and `ImportResult` structures to standardize how success/failure is communicated back to the UI.

## Phase 2: The Strategy Pattern Implementation
**Objective:** Create the logic engine that handles specific business rules for Ride-share data.
1.  **Create TripImportStrategy:** Initialized `TripImportStrategy.ts` as the primary implementation of the `ImportStrategy` interface.
2.  **Column Definitions:** Defined the static column mappings (Date, Platform, Driver, Amount) that the UI uses to render preview tables.
3.  **File Type Configuration:** Configured the strategy to accept `.csv` and `.xlsx` MIME types.
4.  **Feature Flags:** Enabled `allowMultipleFiles` to true to support bulk uploading of monthly statements.

## Phase 3: The Import Hub UI (Entry Point)
**Objective:** Create the main dashboard where users select what they want to import.
1.  **Scaffold ImportHub:** Created `/components/imports/ImportHub.tsx` using a grid layout.
2.  **Card Component Implementation:** Designed interactive cards for "Ride-share Trips", "Driver Roster", and "Vehicle List".
3.  **Selection Logic:** Implemented state to track which strategy the user clicks.
4.  **Dynamic Rendering:** Added logic to conditionally render the `UnifiedUploadWizard` when a strategy is selected, passing the specific strategy object.

## Phase 4: Platform Selection Logic
**Objective:** Allow users to specify the source of their data (Uber, Lyft, Bolt) before uploading.
1.  **Create PlatformSelector:** Built `/components/imports/PlatformSelector.tsx`.
2.  **Visual Options:** Added logos/icons for major ride-share platforms.
3.  **Context Passing:** wired the selector to pass the `platform` string (e.g., 'uber') into the import context, ensuring the parser knows which schema to prioritize.
4.  **"Other/Generic" Option:** Added a fallback for custom CSVs that triggers the AI mapping flow.

## Phase 5: The Unified Wizard Container
**Objective:** A reusable step-by-step wizard component that handles the UI flow.
1.  **Scaffold UnifiedUploadWizard:** Created `/components/imports/wizard/UnifiedUploadWizard.tsx`.
2.  **State Management:** Implemented `useState` hooks for `stage`, `files`, `parsedData`, and `validationErrors`.
3.  **Progress Stepper:** Added a visual progress indicator (Upload -> Review -> Done) in the card header.
4.  **Error Toasts:** Integrated `sonner` toast notifications for global error feedback during state transitions.

## Phase 6: File Ingestion (Upload Step)
**Objective:** The drag-and-drop interface for file selection.
1.  **Create UploadStep:** Built `/components/imports/wizard/UploadStep.tsx`.
2.  **Drag-and-Drop Area:** Implemented a dashed border area handling `onDrop` events.
3.  **File Validation:** Added checks to ensure selected files match the strategy's `allowedFileTypes`.
4.  **Loading State:** Added a spinner state to provide immediate feedback when parsing begins.

## Phase 7: The Parsing Engine (CSV & Excel)
**Objective:** Convert raw file buffers into structured JSON data.
1.  **Integrate PapaParse:** Configured `Papa.parse` within `TripImportStrategy.ts` to handle CSV text.
2.  **Header Normalization:** Created helper functions to strip whitespace and lowercase headers for fuzzy matching.
3.  **Parallel Processing:** Used `Promise.all` to map over multiple uploaded files and parse them concurrently.
4.  **Structure Detection:** Implemented `detectFileType` logic to inspect headers and classify files (e.g., "This looks like an Uber Payment Statement").

## Phase 8: Data Transformation & Logic
**Objective:** Map raw CSV strings to the application's domain objects.
1.  **Row Mapping:** Wrote the core loop in `mergeAndProcessData` to iterate over parsed rows.
2.  **Field Extraction:** Implemented logic to extract 'Duration', 'Distance', and 'Amount' from various known CSV column names.
3.  **Metric Calculation:** Added algorithms to calculate `efficiencyScore` (Earnings/Minute) and `speed` (Distance/Duration).
4.  **Context Generation:** Created logic to aggregate individual trips into `DriverMetrics` and `VehicleMetrics` objects (summing earnings, counting trips).

## Phase 9: AI Mapping Integration
**Objective:** Handle unknown CSV formats using Supabase Edge Functions.
1.  **Identify Generic Files:** Added logic to filter files that didn't match known schemas.
2.  **Supabase Call:** Implemented a `fetch` call to the `ai/map-csv` edge function, sending the file headers and sample rows.
3.  **Apply Mapping:** Consumed the JSON response from the AI to dynamically remap columns (e.g., mapping "Cab Fare" to "amount").

## Phase 10: The Preview Interface (Restored)
**Objective:** Allow users to verify data before committing.
1.  **Create PreviewStep:** Built `/components/imports/wizard/PreviewStep.tsx`.
2.  **Tab Implementation:** Implemented `Tabs` component to separate "Trips", "Drivers", "Vehicles", and "Financials".
3.  **Data Tables:** Created specific table layouts for each tab to show relevant columns (e.g., Driver Name + Earnings for the Driver tab).
4.  **Validation Display:** Added an alert box to show any critical blocking errors found during parsing.

## Phase 11: Validation & Deduplication
**Objective:** Prevent bad data and duplicates from entering the system.
1.  **Fetch Existing Data:** Added an API call to get existing trips from the database.
2.  **Fingerprinting:** Created a unique signature for each trip (`date_amount_driver_platform`) to detect duplicates.
3.  **Error Flagging:** Marked duplicate rows as `isValid: false` and attached an error message to display in the preview table.

## Phase 12: Final Commit
**Objective:** Persist the clean data to the database.
1.  **Save Strategy:** Implemented the `save` method in `TripImportStrategy`.
2.  **Batch Processing:** Configured the save function to handle the bulk insert of trips.
3.  **Context Saving:** Added logic to update Driver and Vehicle stats based on the aggregated metrics calculated in Phase 8.
4.  **Success State:** Triggered the `onComplete` callback to return the user to the main dashboard.
