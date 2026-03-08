# Roam Fleet — Solution Architecture & Implementation Plan

---

## Prior Work Summary

The previous implementation plan covered the **Write-Time Ledger** system (pre-aggregating trip earnings into weekly ledger entries), the **Driver Detail Overview migration** (reading from the ledger via the `OverviewMetricsGrid` component), and the **Phase 6 Cleanup** (debug log removal, GoRide→Roam normalization). A ~468-line `{false && ...}` dead block in `DriverDetail.tsx` was left in place (harmless, never renders) due to persistent tooling failures on that file.

---

## Enterprise Import/Export Center — Implementation Plan

### Problem Statement

The current "Batch Import" page (`/components/imports/ImportsPage.tsx`) is narrowly focused on Uber/InDrive CSV trip imports with a small disaster recovery sidebar for fuel/service/odometer/check-in backups. There is **no way to export trip data**, which blocks the ability to delete-and-reimport historical trips that pre-date the ledger system (e.g., Dec 8–14 data showing $0.00). Additionally, most data sections in the app (drivers, vehicles, transactions, toll tags, equipment, etc.) have no import or export capability at all.

### Goal

Transform the current Batch Import page into an **enterprise-grade Import/Export Center** that covers every data entity in the system, with date range filtering, progress tracking, validation, and full system backup/restore.

### Existing Infrastructure Inventory

**Already exportable (via DisasterRecoveryCard):**
- Fuel logs (`data-export.ts` → `fetchAllFuelLogs()`)
- Service/maintenance logs (`data-export.ts` → `fetchAllServiceLogs()`)
- Odometer readings (`data-export.ts` → `fetchAllOdometerReadings()`)
- Check-ins (`data-export.ts` → `fetchAllCheckIns()`)

**Already importable (via ImportsPage or DisasterRecoveryCard):**
- Trips (Uber CSV multi-file merge + Uber API sync + InDrive CSV)
- Fuel card statements (CSV)
- Toll top-ups / usage (CSV via BulkImportTollTransactionsModal)
- Fuel/service/odometer/check-in restore (CSV via import-validator + import-executor)

**NOT exportable or importable — gaps to fill:**
| Data Entity | Export? | Import? | API Read | API Write |
|---|---|---|---|---|
| Trips/Earnings | NO | YES (CSV) | `api.getTrips()`, `api.getTripsFiltered()` | `api.saveTrips()` |
| Driver Profiles | NO | NO | `api.getDrivers()` | `api.saveDriver()` |
| Driver Metrics | NO | Partial (AI) | `api.getDriverMetrics()` | `api.saveDriverMetrics()` |
| Vehicle Profiles | NO | NO | `api.getVehicles()` | `api.saveVehicle()` |
| Vehicle Metrics | NO | Partial (AI) | `api.getVehicleMetrics()` | `api.saveVehicleMetrics()` |
| Financial Transactions | NO | NO | `api.getTransactions()` | `api.saveTransaction()` |
| Toll Tags | NO | NO | `api.getTollTags()` | `api.saveTollTag()` |
| Toll Plazas | NO | NO | `api.getTollPlazas()` | `api.saveTollPlaza()` |
| Gas Stations (verified) | Own wizard | Own wizard | `api.getStations()` | `api.saveStation()` |
| Learnt Locations | NO | NO | `api.getLearntLocations()` | N/A (promote only) |
| Claims/Disputes | NO | NO | `api.getClaims()` | `api.saveClaim()` |
| Equipment | NO | NO | `equipmentService.getAllEquipment()` | `equipmentService.saveEquipment()` |
| Inventory | NO | NO | `inventoryService.getInventory()` | `inventoryService.saveStock()` |
| Ledger Entries | NO | NO | Ledger endpoint | Write-time only |
| Financials (org-level) | NO | NO | `api.getFinancials()` | `api.saveFinancials()` |
| Notifications | NO | NO | `api.getNotifications()` | `api.createNotification()` |
| Settings/Preferences | NO | NO | `api.getPreferences()` | `api.savePreferences()` |
| Import Batches | NO | NO | `api.getBatches()` | `api.createBatch()` |

### Utility Infrastructure

- **CSV generation:** `utils/csv-helper.ts` — `jsonToCsv()`, `csvToJson()`, `downloadBlob()`, `CsvColumn<T>` interface
- **CSV schemas:** `types/csv-schemas.ts` — `FUEL_CSV_COLUMNS`, `SERVICE_CSV_COLUMNS`, `ODOMETER_CSV_COLUMNS`, `CHECKIN_CSV_COLUMNS`
- **Export orchestrator:** `services/data-export.ts` — `generateBackupFiles()` with ExportState toggle
- **Import validator:** `services/import-validator.ts` — `validateImportFile()` with typed validation
- **Import executor:** `services/data-import-executor.ts` — `importExecutor.processBatch()` with progress callback
- **Toll export:** `utils/exportHelpers.ts` — `fetchFullTollHistory()`, `generateBackupCSV()`

### Files That Will Be Modified or Created

**Modified (carefully, with zero breakage):**
- `/components/imports/ImportsPage.tsx` — Add Export tab, restructure layout
- `/services/data-export.ts` — Add trip/driver/vehicle/transaction/equipment/toll export functions
- `/services/data-import-executor.ts` — Add driver/vehicle/transaction/equipment/toll restore functions
- `/services/import-validator.ts` — Add validation schemas for new import types
- `/types/csv-schemas.ts` — Add CSV column definitions for all new data types

**Created (new files):**
- `/components/imports/ExportCenter.tsx` — Export tab UI component
- `/components/imports/ImportCenter.tsx` — Restructured import tab UI component
- `/components/imports/ExportCategoryCard.tsx` — Reusable card for each export category
- `/components/imports/ImportCategoryCard.tsx` — Reusable card for each import category
- `/components/imports/DateRangeExportFilter.tsx` — Date range picker for exports
- `/components/imports/ExportProgressModal.tsx` — Progress modal during export
- `/components/imports/ImportProgressModal.tsx` — Progress modal during import with validation
- `/components/imports/SystemBackupRestore.tsx` — Full system backup/restore component

---

## Phase 1: Foundation — New Import/Export Center Shell & Navigation

**Goal:** Restructure the ImportsPage from a single "Batch Import" flow into a tabbed layout with Import and Export tabs, without breaking any existing import functionality.

**Risk level:** LOW — purely additive UI restructuring; all existing import logic stays untouched.

### Step 1.1: Create the ExportCenter shell component
- **File:** Create `/components/imports/ExportCenter.tsx`
- **What:** A new component that renders a grid of export category cards (placeholder only — no actual export logic yet)
- **Categories to show (as placeholder cards):**
  1. Trip Data & Earnings
  2. Driver Roster & Metrics
  3. Vehicle Fleet & Metrics
  4. Financial Transactions
  5. Fuel Logs (already exists — will wire later)
  6. Service/Maintenance Logs (already exists — will wire later)
  7. Odometer History (already exists — will wire later)
  8. Weekly Check-ins (already exists — will wire later)
  9. Toll Tags & Plazas
  10. Gas Stations
  11. Claims & Disputes
  12. Equipment & Inventory
  13. Full System Backup
- **Each card shows:** Icon, title, description, record count (placeholder "—"), and a disabled "Export CSV" button
- **Design:** Use existing Card/CardContent/Badge components, consistent with the rest of the app's slate/indigo theme

### Step 1.2: Create the ImportCenter shell component
- **File:** Create `/components/imports/ImportCenter.tsx`
- **What:** Extract the existing platform selection grid + upload flow from `ImportsPage.tsx` into its own component
- **Key constraint:** This component must accept ALL the same state and callbacks that the current inline code uses — we are lifting, not rewriting
- **Categories to add (as new placeholder cards alongside existing ones):**
  1. Existing: Uber Sync, Uber CSV, InDrive CSV, Fuel, Toll Top-up, Toll Usage, Disaster Recovery, Restore Backup
  2. New (placeholder, disabled): Driver Roster CSV, Vehicle Fleet CSV, Financial Transactions CSV, Equipment CSV, Toll Tags CSV, Claims CSV
- **DO NOT** move the upload/review/preview/success steps yet — only the platform selection grid (Step 0)

### Step 1.3: Add tab navigation to ImportsPage
- **File:** Modify `/components/imports/ImportsPage.tsx`
- **What:** Add a `Tabs` component at the top with two tabs: "Import" and "Export"
- **Import tab:** Renders all existing import functionality exactly as-is (no changes to step flow, handlers, or state)
- **Export tab:** Renders the new `ExportCenter` component
- **Title change:** Update heading from "Batch Import" to "Data Center" with subtitle "Import and export your fleet data"
- **Preserve:** ALL existing state variables, handlers, useEffects, and the DisasterRecoveryCard (it stays in the Import tab)

### Step 1.4: Create reusable ExportCategoryCard component
- **File:** Create `/components/imports/ExportCategoryCard.tsx`
- **What:** A reusable card component used by ExportCenter
- **Props:** `title`, `description`, `icon`, `recordCount` (number | null), `onExport` callback, `isLoading`, `isDisabled`, `badge` (optional text like "4 types" or "Already available")
- **UI:** Card with icon on left, title + description + record count in center, Export button on right
- **States:** Default, loading (spinner), disabled (grayed out), success (green checkmark briefly)

### Step 1.5: Verify zero breakage
- **What:** After all 4 steps above, manually verify:
  - [ ] ImportsPage loads without errors
  - [ ] Import tab shows all existing platform cards (Uber Sync, Uber CSV, InDrive, Fuel, Toll Top-up, Toll Usage, Disaster Recovery, Restore Backup)
  - [ ] Clicking any existing platform card still works (navigates to upload step)
  - [ ] Export tab shows placeholder cards
  - [ ] DisasterRecoveryCard still renders in Import tab
  - [ ] No console errors
  - [ ] All existing imports in progress are unaffected

---

## Phase 2: Export Engine Core — Trip Data Export with Date Filtering (CRITICAL PATH)

**Goal:** Enable exporting trip data as CSV with optional date range filtering. This is the #1 priority because it unblocks the user's ability to re-import Dec 8–14 data.

**Risk level:** LOW — purely additive; new functions in data-export.ts, new CSV schema in csv-schemas.ts, wiring to ExportCenter.

### Step 2.1: Define Trip CSV schema
- **File:** Modify `/types/csv-schemas.ts`
- **What:** Add `TRIP_CSV_COLUMNS` constant
- **Columns to include:**
  - `id` (Trip UUID — critical for deduplication on re-import)
  - `date` (formatted DD/MM/YYYY via `formatDateJM`)
  - `driverId`
  - `driverName`
  - `vehicleId`
  - `platform` (Uber, InDrive, Roam, etc.)
  - `tripType` (Regular, Delivery, etc.)
  - `status` (Completed, Cancelled, etc.)
  - `earnings` (total fare)
  - `tips`
  - `surgeAmount`
  - `tollCharges`
  - `distance` (km)
  - `duration` (minutes)
  - `pickupLocation`
  - `dropoffLocation`
  - `riderPayment`
  - `netFare`
  - `batchId`
- **Key decision:** Export raw numeric values (not formatted currency) so they can be cleanly re-imported

### Step 2.2: Create DateRangeExportFilter component
- **File:** Create `/components/imports/DateRangeExportFilter.tsx`
- **What:** A compact date range picker that sits above or inline with an export card
- **Props:** `startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`, `onClear`
- **UI:** Two date inputs (or use the existing `date-range-picker` component from `/components/ui/date-range-picker.tsx`) with a "Clear" button
- **Default:** Empty (meaning "all dates")
- **Validation:** Start date must be before end date; show inline error if invalid

### Step 2.3: Add trip export function to data-export.ts
- **File:** Modify `/services/data-export.ts`
- **What:** Add `fetchAllTrips(startDate?: string, endDate?: string): Promise<Trip[]>` function
- **Logic:**
  1. If no date range: Use `api.getTrips({ limit: 10000 })` to fetch all trips
  2. If date range provided: Use `api.getTripsFiltered({ startDate, endDate, limit: 10000 })` to fetch filtered trips (the `getTripsFiltered` endpoint already supports these params)
  3. Handle pagination: If total > limit, loop with offset to fetch all pages
  4. Sort by date ascending
  5. Return the full array
- **Also add:** `ExportType` union update to include `'trip'`
- **Also add:** Update `generateBackupFiles()` to handle `trip` type using `TRIP_CSV_COLUMNS`

### Step 2.4: Wire trip export to ExportCenter
- **File:** Modify `/components/imports/ExportCenter.tsx`
- **What:** Make the "Trip Data & Earnings" card functional
- **Behavior:**
  1. User clicks the card — it expands to show the DateRangeExportFilter
  2. User optionally sets a date range
  3. User clicks "Export CSV"
  4. Show loading spinner on the button
  5. Call `fetchAllTrips(startDate, endDate)`
  6. Convert to CSV via `jsonToCsv(trips, TRIP_CSV_COLUMNS)`
  7. Trigger download via `downloadBlob(csv, filename)`
  8. Filename format: `trips_export_YYYY-MM-DD.csv` or `trips_export_YYYY-MM-DD_to_YYYY-MM-DD.csv` if date range
  9. Show success toast with record count
  10. Show error toast if fetch fails

### Step 2.5: Add record count loading to ExportCenter
- **File:** Modify `/components/imports/ExportCenter.tsx`
- **What:** On mount, fetch counts for categories that have quick count endpoints
- **For trips:** Call `api.getTrips({ limit: 1 })` and read the response to estimate count, OR call `api.getTripStats({})` which returns aggregate stats
- **Display:** Show "~1,234 records" on the Trip card
- **Other cards:** Still show "—" (will be filled in later phases)

### Step 2.6: Verify trip export end-to-end
- **What:** Test the full flow:
  - [ ] Export all trips (no date filter) — downloads CSV with correct columns
  - [ ] Export with date range (e.g., Dec 8–14) — downloads only matching trips
  - [ ] CSV opens correctly in Excel/Google Sheets
  - [ ] Date format is DD/MM/YYYY (Jamaica standard)
  - [ ] Numeric values are raw numbers (no $ signs, no commas inside values)
  - [ ] Empty fields show as empty (not "undefined" or "null")
  - [ ] Large dataset (>1000 trips) doesn't crash or timeout

---

## Phase 3: Export Engine Expansion — All Remaining Data Types

**Goal:** Add export capability for every remaining data entity in the system.

**Risk level:** LOW — purely additive functions and CSV schemas; no modifications to existing read endpoints.

### Step 3.1: Define all new CSV schemas
- **File:** Modify `/types/csv-schemas.ts`
- **What:** Add the following column definitions:
  - `DRIVER_CSV_COLUMNS` — id, name, email, phone, licenseNumber, licenseExpiry, status, assignedVehicleId, hireDate, emergencyContact
  - `VEHICLE_CSV_COLUMNS` — id, licensePlate, make, model, year, color, vin, status, mileage, fuelType, insuranceExpiry, registrationExpiry, assignedDriverId
  - `TRANSACTION_CSV_COLUMNS` — id, date, type, category, amount, description, driverId, driverName, vehicleId, vehiclePlate, paymentMethod, status, isReconciled, tripId, receiptUrl
  - `TOLL_TAG_CSV_COLUMNS` — id, tagNumber, provider, vehicleId, vehiclePlate, status, balance, lastTopupDate, lastTopupAmount
  - `TOLL_PLAZA_CSV_COLUMNS` — id, name, location, lat, lng, direction, standardRate, status, parishOrRegion
  - `STATION_CSV_COLUMNS` — id, name, brand, parentCompany, lat, lng, plusCode, address, isVerified, fuelTypes, pricePerLiter
  - `CLAIM_CSV_COLUMNS` — id, date, driverId, driverName, type, amount, description, status, resolution, resolvedDate
  - `EQUIPMENT_CSV_COLUMNS` — id, name, type, vehicleId, serialNumber, condition, assignedDate, value, notes
  - `INVENTORY_CSV_COLUMNS` — id, name, category, quantity, minQuantity, unitCost, supplier, location, lastRestockDate
  - `DRIVER_METRICS_CSV_COLUMNS` — driverId, driverName, totalTrips, totalEarnings, avgRating, completionRate, onlineHours, cancellationRate
  - `VEHICLE_METRICS_CSV_COLUMNS` — vehicleId, plateNumber, totalTrips, totalRevenue, totalDistance, fuelCost, maintenanceCost, avgTripEarnings
- **Key:** Each schema uses the existing `CsvColumn<T>` interface and `formatDateJM` for date fields

### Step 3.2: Add all fetch functions to data-export.ts
- **File:** Modify `/services/data-export.ts`
- **What:** Add fetch functions for each new type:
  - `fetchAllDrivers()` — calls `api.getDrivers()`
  - `fetchAllDriverMetrics()` — calls `api.getDriverMetrics()`
  - `fetchAllVehicles()` — calls `api.getVehicles()`
  - `fetchAllVehicleMetrics()` — calls `api.getVehicleMetrics()`
  - `fetchAllTransactions(startDate?, endDate?)` — calls `api.getTransactions()`, applies client-side date filter
  - `fetchAllTollTags()` — calls `api.getTollTags()`
  - `fetchAllTollPlazas()` — calls `api.getTollPlazas()`
  - `fetchAllStations()` — calls `api.getStations()`
  - `fetchAllClaims()` — calls `api.getClaims()`
  - `fetchAllEquipment()` — calls `equipmentService.getAllEquipment()`
  - `fetchAllInventory()` — calls `inventoryService.getInventory()`
- **Each function:** Wraps in try/catch, logs errors, returns empty array on failure, sorts by date or name as appropriate
- **Update `ExportType`:** Add all new types to the union
- **Update `generateBackupFiles()`:** Add cases for each new type

### Step 3.3: Wire all export cards in ExportCenter
- **File:** Modify `/components/imports/ExportCenter.tsx`
- **What:** Make every card functional:
  - Each card calls its respective fetch function + `jsonToCsv()` + `downloadBlob()`
  - Cards with date-relevant data (Trips, Transactions, Claims) show the DateRangeExportFilter
  - Cards without date relevance (Drivers, Vehicles, Toll Tags, etc.) export everything
  - Show record count for each category on mount (fetched in parallel, errors show "—")

### Step 3.4: Add "Export All" button
- **File:** Modify `/components/imports/ExportCenter.tsx`
- **What:** A button at the top that downloads ALL categories as individual CSV files
- **Behavior:**
  1. Shows a confirmation dialog: "This will export X categories as separate CSV files"
  2. Fetches all data in parallel
  3. Downloads each as a separate file with standardized naming: `roam_trips_YYYY-MM-DD.csv`, `roam_drivers_YYYY-MM-DD.csv`, etc.
  4. Shows progress: "Exporting 3/13..."
  5. Summary toast: "Exported 13 files (4,521 total records)"

### Step 3.5: Move existing disaster recovery exports
- **File:** Modify `/components/imports/ExportCenter.tsx` and `/components/imports/DisasterRecoveryCard.tsx`
- **What:** The DisasterRecoveryCard already has export buttons for fuel/service/odometer/check-in. These should ALSO appear in the Export tab for discoverability.
- **Approach:** DO NOT remove them from DisasterRecoveryCard (some users may expect them there). Instead, wire the same `generateBackupFiles()` logic to the corresponding cards in ExportCenter.
- **Result:** Two ways to access the same export — both work, no duplication of logic.

### Step 3.6: Verify all exports
- **What:** Test each category:
  - [ ] Driver Roster — downloads with correct columns, all drivers present
  - [ ] Vehicle Fleet — all vehicles, correct plate numbers
  - [ ] Financial Transactions — correct amounts, reconciliation status preserved
  - [ ] Toll Tags — tag numbers, balances, vehicle assignments
  - [ ] Toll Plazas — names, coordinates, rates
  - [ ] Gas Stations — names, brands, coordinates, verification status
  - [ ] Claims — all fields including resolution status
  - [ ] Equipment — serial numbers, assignments
  - [ ] Inventory — quantities, costs
  - [ ] "Export All" — all 13 files download without errors

---

## Phase 4: Import Engine Core — Trip Re-Import with Ledger Backfill

**Goal:** Enable re-importing trip CSVs (including ones exported in Phase 2) with automatic ledger entry creation for the imported weeks. This directly solves the Dec 8–14 missing data problem.

**Risk level:** MEDIUM — involves writing trip data and triggering ledger writes. Must handle deduplication carefully.

### Step 4.1: Add trip import validation schema
- **File:** Modify `/services/import-validator.ts`
- **What:** Add `'trip'` to the `ImportType` union and create a trip validation function
- **Validation rules:**
  - Required fields: `date`, `driverId` OR `driverName`, `earnings` (must be numeric)
  - Optional fields: All other TRIP_CSV_COLUMNS fields
  - Date parsing: Accept DD/MM/YYYY (Jamaica standard), MM/DD/YYYY, YYYY-MM-DD, and ISO 8601
  - Numeric parsing: Strip `$`, commas, spaces from earnings/tips/distance/duration
  - Deduplication check: If `id` field is present and non-empty, flag duplicates within the file
  - Platform normalization: Apply `normalizePlatform()` to the platform field
- **Return:** `ValidationResult<Trip>` with `validRecords` and `errors`

### Step 4.2: Add trip import executor
- **File:** Modify `/services/data-import-executor.ts`
- **What:** Add `restoreTrip(record)` method to `importExecutor`
- **Logic:**
  1. Generate a new `id` if none provided (or if the user wants to force new IDs)
  2. Set `batchId` to a shared batch ID for this import session
  3. Call `api.saveTrips([record])` for each record (or batch them in groups of 50)
  4. The server's trip save endpoint already writes ledger entries (this is the write-time ledger), so **no separate ledger backfill step is needed** — the ledger gets populated automatically on save
- **Progress:** Call `onProgress(pct)` after each batch

### Step 4.3: Add trip import to the Import tab
- **File:** Modify `/components/imports/ImportCenter.tsx` (or add to existing ImportsPage flow)
- **What:** Add a "Trip Data (Re-Import)" card to the platform selection grid
- **Behavior:**
  1. User clicks the card
  2. Upload step: Standard drag-and-drop CSV upload
  3. Validation step: Run `validateImportFile(content, 'trip')` — show valid count, error count, and error details
  4. Preview step: Show a table of the first 20 valid records with key columns (date, driver, earnings, platform)
  5. Deduplication warning: If any `id` values match existing trips, show a yellow warning: "X trips already exist. They will be updated (not duplicated)."
  6. Confirm step: "Import X trips" button
  7. Progress: Show progress bar during import
  8. Success: Show summary — "Imported X trips. Ledger entries were automatically created for Y weeks."

### Step 4.4: Add deduplication logic
- **File:** Modify `/services/data-import-executor.ts`
- **What:** Before importing, check if trip IDs already exist
- **Logic:**
  1. Collect all `id` values from the import batch
  2. For each ID, check if it exists (this may require a bulk lookup — if the API doesn't support it, do client-side check against `api.getTrips()`)
  3. If duplicate found: SKIP the record (default behavior) or OVERWRITE (user choice via a toggle)
  4. Report skipped count in the results

### Step 4.5: Verify trip re-import with ledger backfill
- **What:** Test the critical flow:
  - [ ] Export trips for Dec 8–14 (from Phase 2)
  - [ ] Delete those trips from the system
  - [ ] Re-import the exported CSV
  - [ ] Verify trips appear in the Trip Logs page
  - [ ] Verify the Driver Detail Overview shows correct earnings for Dec 8–14 (ledger was auto-created)
  - [ ] Verify no duplicate trips were created
  - [ ] Verify the import batch appears in the Batches list

---

## Phase 5: Import Engine Expansion — Driver, Vehicle, and Financial Bulk Import

**Goal:** Enable bulk import of driver profiles, vehicle profiles, and financial transactions via CSV.

**Risk level:** MEDIUM — writing entity data. Must validate carefully to avoid corrupting existing records.

### Step 5.1: Add driver import validation and executor
- **File:** Modify `/services/import-validator.ts` and `/services/data-import-executor.ts`
- **Validation rules for drivers:**
  - Required: `name`
  - Optional: `email`, `phone`, `licenseNumber`, `licenseExpiry`, `status`, `hireDate`
  - Auto-generate `id` if not provided
  - Normalize phone numbers (strip spaces, dashes)
  - Validate email format if provided
  - Duplicate check: Match by `name` (case-insensitive) — if exists, warn but don't block
- **Executor:** `restoreDriver(record)` — calls `api.saveDriver(record)`

### Step 5.2: Add vehicle import validation and executor
- **File:** Modify `/services/import-validator.ts` and `/services/data-import-executor.ts`
- **Validation rules for vehicles:**
  - Required: `licensePlate`
  - Optional: `make`, `model`, `year`, `color`, `vin`, `status`, `fuelType`
  - Auto-generate `id` if not provided
  - Normalize license plate (uppercase, strip spaces)
  - Duplicate check: Match by `licensePlate` — if exists, warn but don't block
- **Executor:** `restoreVehicle(record)` — calls `api.saveVehicle(record)`

### Step 5.3: Add financial transaction import validation and executor
- **File:** Modify `/services/import-validator.ts` and `/services/data-import-executor.ts`
- **Validation rules for transactions:**
  - Required: `date`, `amount` (numeric), `category`
  - Optional: `type`, `description`, `driverId`, `driverName`, `vehicleId`, `paymentMethod`, `status`
  - Parse dates flexibly (DD/MM/YYYY, YYYY-MM-DD, ISO)
  - Parse amounts (strip $ and commas)
  - Validate category against known categories (Toll Usage, Fuel, Maintenance, etc.)
- **Executor:** `restoreTransaction(record)` — calls `api.saveTransaction(record)`

### Step 5.4: Add import cards to the Import tab
- **File:** Modify `/components/imports/ImportCenter.tsx`
- **What:** Enable the previously-disabled Driver, Vehicle, and Transaction import cards
- **Each follows the same flow:** Upload → Validate → Preview → Confirm → Progress → Success
- **Add "Download Template" button** for each: Generates a blank CSV with the correct headers so users know the expected format

### Step 5.5: Create template download utility
- **File:** Modify `/services/data-export.ts`
- **What:** Add `downloadTemplate(type: ImportType)` function
- **Logic:** Generate a CSV with headers only (from the corresponding CSV_COLUMNS schema) + 1 example row with placeholder values
- **Example row for drivers:** `DRV-001, John Smith, john@email.com, 876-555-0100, DL12345, 15/03/2027, Active, 01/01/2024, Jane Smith (876-555-0200)`

### Step 5.6: Verify driver/vehicle/transaction import
- **What:** Test each:
  - [ ] Import 5 drivers from CSV — all appear in Drivers page
  - [ ] Import with duplicate name — shows warning, doesn't block
  - [ ] Import 3 vehicles — all appear in Vehicles page with correct plates
  - [ ] Import 10 transactions — all appear in Financial Transactions with correct amounts
  - [ ] Download each template — opens in Excel with correct headers
  - [ ] Import a template with filled data — works correctly

---

## Phase 6: Fleet Infrastructure Import — Toll Tags, Toll Plazas, Stations, Equipment

**Goal:** Enable import for fleet infrastructure entities that change infrequently but are painful to enter manually one-by-one.

**Risk level:** LOW — these are simple CRUD entities with straightforward schemas.

### Step 6.1: Add toll tag import validation and executor
- **Validation:** Required: `tagNumber`, `provider`. Optional: `vehicleId`, `status`, `balance`
- **Executor:** `restoreTollTag(record)` — calls `api.saveTollTag(record)`
- **Duplicate check:** Match by `tagNumber`

### Step 6.2: Add toll plaza import validation and executor
- **Validation:** Required: `name`, `lat`, `lng`. Optional: `direction`, `standardRate`, `parishOrRegion`
- **Executor:** `restoreTollPlaza(record)` — calls `api.saveTollPlaza(record)`
- **Duplicate check:** Match by `name` + proximity (within 100m of existing plaza)

### Step 6.3: Add gas station import (leverage existing StationImportWizard)
- **Note:** `/components/fuel/stations/StationImportWizard.tsx` already exists for station import
- **What:** Add a card in the Import tab that opens the existing StationImportWizard in a dialog
- **No new logic needed** — just surface the existing wizard in the new Import Center

### Step 6.4: Add equipment import validation and executor
- **Validation:** Required: `name`, `type`. Optional: `vehicleId`, `serialNumber`, `condition`, `value`
- **Executor:** `restoreEquipment(record)` — calls `equipmentService.saveEquipment(record)`
- **Duplicate check:** Match by `serialNumber` if provided

### Step 6.5: Add inventory import validation and executor
- **Validation:** Required: `name`, `quantity` (numeric). Optional: `category`, `unitCost`, `minQuantity`, `supplier`
- **Executor:** `restoreInventory(record)` — calls `inventoryService.saveStock(record)`
- **Duplicate check:** Match by `name` (case-insensitive)

### Step 6.6: Add claim import validation and executor
- **Validation:** Required: `date`, `driverId` OR `driverName`, `amount` (numeric), `type`. Optional: `description`, `status`
- **Executor:** `restoreClaim(record)` — calls `api.saveClaim(record)`

### Step 6.7: Wire all infrastructure import cards
- **File:** Modify `/components/imports/ImportCenter.tsx`
- **What:** Enable toll tag, toll plaza, station (via wizard), equipment, inventory, and claim import cards
- **Each card:** Upload → Validate → Preview → Confirm → Progress → Success

### Step 6.8: Add templates for all infrastructure types
- **File:** Modify `/services/data-export.ts`
- **What:** Add template downloads for each new import type
- **Include example rows** with realistic Jamaican data (e.g., toll plazas: "Portmore Toll Plaza", stations: "Texaco Half Way Tree")

### Step 6.9: Verify all infrastructure imports
- **What:** Test each:
  - [ ] Import 3 toll tags — appear in Toll Tag Inventory
  - [ ] Import 2 toll plazas — appear in Toll Database
  - [ ] Station import wizard opens from Import Center
  - [ ] Import 5 equipment items — appear in Equipment section
  - [ ] Import 10 inventory items — appear in Inventory
  - [ ] Import 3 claims — appear in Claimable Loss section
  - [ ] All templates download correctly

---

## Phase 7: Full System Backup & Restore (ZIP Bundle)

**Goal:** Enable one-click full system backup (all data as a ZIP file) and full system restore from a previously-exported ZIP.

**Risk level:** HIGH — full restore overwrites all data. Must have confirmation gates and pre-restore validation.

### Step 7.1: Create SystemBackupRestore component
- **File:** Create `/components/imports/SystemBackupRestore.tsx`
- **What:** A dedicated component for full backup/restore with strong warnings
- **Backup UI:**
  - "Download Full Backup" button
  - Shows estimated size and record counts per category
  - Progress bar during generation
  - Downloads a ZIP file named `roam_fleet_backup_YYYY-MM-DD_HHmm.zip`
- **Restore UI:**
  - "Upload Backup ZIP" drag-and-drop zone
  - WARNING banner: "This will REPLACE all existing data. This cannot be undone."
  - Pre-restore validation: Parse ZIP, verify all expected CSV files are present, show record counts
  - Two-step confirmation: First "Review Backup Contents", then "Confirm Full Restore"
  - Progress bar during restore

### Step 7.2: Implement backup ZIP generation
- **File:** Modify `/services/data-export.ts`
- **What:** Add `generateFullBackup(): Promise<Blob>` function
- **Logic:**
  1. Fetch ALL data types in parallel (trips, drivers, vehicles, transactions, fuel, service, odometer, check-ins, toll tags, toll plazas, stations, claims, equipment, inventory, preferences, financials)
  2. Convert each to CSV using respective schemas
  3. Bundle into a ZIP using JSZip library
  4. Add a `manifest.json` file inside the ZIP with metadata: version, date, record counts per type, Roam Fleet version
  5. Return the ZIP as a Blob
- **Error handling:** If any category fails to fetch, include it as an empty CSV with a warning in the manifest

### Step 7.3: Implement backup ZIP restore
- **File:** Modify `/services/data-import-executor.ts`
- **What:** Add `restoreFullBackup(zipBlob: Blob, onProgress: (step: string, pct: number) => void): Promise<RestoreResult>`
- **Logic:**
  1. Parse ZIP using JSZip
  2. Read `manifest.json` — validate version compatibility
  3. For each CSV file in the ZIP:
     a. Parse with PapaParse
     b. Validate with the corresponding validator
     c. Import with the corresponding executor
  4. Import ORDER matters (dependencies first):
     - Stage A: Drivers, Vehicles (no dependencies)
     - Stage B: Trips, Transactions, Claims (depend on driver/vehicle IDs)
     - Stage C: Fuel, Service, Odometer, Check-ins (depend on vehicle IDs)
     - Stage D: Equipment, Inventory, Toll Tags, Toll Plazas, Stations
     - Stage E: Preferences, Financials
  5. Report progress at each stage
- **Error handling:** If any stage fails, report which categories succeeded and which failed — do NOT roll back (partial restore is better than no restore)

### Step 7.4: Add data clearing option for full restore
- **What:** Before a full restore, optionally clear existing data
- **Options:**
  1. "Merge" — import on top of existing data (duplicates handled per entity rules)
  2. "Replace" — clear all existing data first, then import (uses `api.clearAllData()` and similar)
- **Default:** "Merge" (safer)
- **"Replace" mode:** Requires typing "REPLACE ALL DATA" to confirm

### Step 7.5: Wire SystemBackupRestore to ExportCenter and ImportCenter
- **File:** Modify ExportCenter and ImportCenter
- **Export tab:** "Full System Backup" card at the bottom with a distinctive design (larger, different color)
- **Import tab:** "Full System Restore" card at the bottom with red/warning styling

### Step 7.6: Verify full backup and restore
- **What:** Test the complete cycle:
  - [ ] Generate full backup — ZIP downloads, contains all CSVs + manifest.json
  - [ ] Verify ZIP contents in a file explorer — all CSVs have data
  - [ ] Restore from backup (Merge mode) — all data appears correctly
  - [ ] Restore from backup (Replace mode) — existing data cleared, backup data replaces it
  - [ ] Restore with a modified ZIP (e.g., removed one CSV) — partial restore succeeds, missing file reported
  - [ ] Restore with a corrupt ZIP — error shown, no data written

---

## Phase 8: Enterprise Polish — Audit Trail, Scheduling, and UX Hardening

**Goal:** Add enterprise-grade finishing touches: import/export audit trail, scheduled exports, search/filter within the center, and UX polish.

**Risk level:** LOW — additive features on top of completed infrastructure.

### Step 8.1: Import/Export audit trail
- **File:** Create `/components/imports/ImportExportHistory.tsx`
- **What:** A log of all import and export operations
- **Stored in:** KV store with prefix `import_export_log_`
- **Each entry records:**
  - Timestamp
  - Operation type (import or export)
  - Data category (trips, drivers, etc.)
  - Record count
  - Status (success, partial, failed)
  - User who initiated (if auth is enabled)
  - File name
  - Errors (if any)
- **UI:** A collapsible "Activity Log" section at the bottom of the Data Center page showing recent operations in reverse chronological order
- **Retention:** Keep last 100 entries

### Step 8.2: Search and filter within the Data Center
- **File:** Modify `/components/imports/ExportCenter.tsx` and `/components/imports/ImportCenter.tsx`
- **What:** A search bar at the top that filters the category cards
- **Behavior:** Type "fuel" → only Fuel-related cards shown. Type "toll" → Toll Tags, Toll Plazas, Toll Usage shown.
- **Also add:** Category grouping — group cards under headings: "People & Fleet", "Financial", "Operations", "Infrastructure", "System"

### Step 8.3: Export format options
- **File:** Modify ExportCategoryCard
- **What:** Add a dropdown to choose export format: CSV (default) or JSON
- **CSV:** Uses `jsonToCsv()` as before
- **JSON:** Uses `JSON.stringify(data, null, 2)` — useful for developers or API integrations
- **File extension:** `.csv` or `.json` based on selection

### Step 8.4: Bulk import progress modal
- **File:** Create `/components/imports/ImportProgressModal.tsx`
- **What:** A modal that shows during any import operation
- **UI:**
  - Category name and file name at top
  - Progress bar (0–100%)
  - Record counter: "Processing record 45 of 200"
  - Error counter: "2 errors so far"
  - Scrollable error list below
  - "Cancel" button (stops processing remaining records, keeps already-imported ones)
  - On completion: Summary with "X imported, Y skipped, Z errors" and a "Download Error Report" button

### Step 8.5: Export progress modal
- **File:** Create `/components/imports/ExportProgressModal.tsx`
- **What:** A modal that shows during export operations (especially "Export All" and "Full Backup")
- **UI:**
  - Category being fetched: "Fetching trips... (3/13)"
  - Progress bar
  - Record counter
  - On completion: Summary with total records exported

### Step 8.6: Responsive design pass
- **What:** Ensure the Data Center works well on:
  - Desktop (1920px) — 3–4 column card grid
  - Tablet (768px) — 2 column grid
  - Mobile (375px) — 1 column stack
- **Import tab:** Platform selection cards should wrap cleanly
- **Export tab:** Category cards should stack vertically on mobile
- **Modals:** Should be full-screen on mobile

### Step 8.7: Empty state and onboarding
- **What:** If there's no data in a category:
  - Export card shows "No data" with grayed-out export button
  - Import card shows "Get started by importing your first [category]"
- **First-time user:** Show a brief intro banner: "Welcome to the Data Center. Import your fleet data from CSV files or export backups for disaster recovery."
- **Dismissible:** Banner has an "X" button and saves dismissal to localStorage

### Step 8.8: Final integration verification
- **What:** Full regression test:
  - [ ] All existing import flows still work (Uber CSV, InDrive, Fuel, Toll, Disaster Recovery restore)
  - [ ] All new export flows work (every category)
  - [ ] All new import flows work (every category)
  - [ ] Full system backup + restore cycle works
  - [ ] Activity log records all operations
  - [ ] Search/filter works in both tabs
  - [ ] Responsive on desktop, tablet, mobile
  - [ ] No console errors anywhere
  - [ ] App navigation (currentPage/setCurrentPage) unaffected
  - [ ] Driver portal unaffected
  - [ ] FuelLogForm.tsx and FuelLogModal.tsx completely untouched

---

## Phase Summary

| Phase | Description | Risk | Priority |
|---|---|---|---|
| **1** | Foundation — Tab layout, shell components | LOW | P0 |
| **2** | Trip Data Export with date filtering | LOW | P0 (CRITICAL) |
| **3** | Export all remaining data types | LOW | P1 |
| **4** | Trip Re-Import with ledger backfill | MEDIUM | P0 (CRITICAL) |
| **5** | Driver, Vehicle, Transaction bulk import | MEDIUM | P1 |
| **6** | Toll Tags, Plazas, Stations, Equipment import | LOW | P2 |
| **7** | Full System Backup & Restore (ZIP) | HIGH | P1 |
| **8** | Enterprise Polish — Audit, search, UX | LOW | P2 |

**Critical path for the Dec 8–14 fix:** Phase 1 → Phase 2 → Phase 4 (after Phase 2, the user can export existing trips, delete, and re-import).

**Files that will NOT be touched (per user constraints):**
- `/components/driver-portal/FuelLogForm.tsx`
- `/components/fuel/FuelLogModal.tsx`
- `/components/figma/ImageWithFallback.tsx`
- `/supabase/functions/server/kv_store.tsx`
- `/utils/supabase/info.tsx`
