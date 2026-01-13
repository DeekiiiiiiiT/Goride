# Bulk Fuel Transaction Implementation Plan

## Phase 1: Service & Parent Component Adaptation
**Objective:** Prepare the `FuelManagement` parent component and the `FuelLogModal` interface to accept and process multiple fuel entries simultaneously.

1.  **Update Types**:
    *   Open `/components/fuel/FuelLogModal.tsx`.
    *   Locate the `FuelLogModalProps` interface.
    *   Change the `onSave` prop signature from `(entry: FuelEntry) => void` to `(entry: FuelEntry | FuelEntry[]) => void`.

2.  **Update Parent Handler**:
    *   Open `/pages/FuelManagement.tsx`.
    *   Locate the `handleSaveLog` function.
    *   Refactor logic to check if the argument is an array (`Array.isArray(entry)`).
    *   **If Array (Bulk Mode)**:
        *   Use `Promise.all` to call `fuelService.saveFuelEntry` for every item in the array.
        *   Wait for all promises to resolve.
        *   Update the `logs` state by spreading all new saved entries: `setLogs(prev => [...newEntries, ...prev])`.
        *   Show a toast summary: `toast.success('Recorded X entries')`.
    *   **If Single (Existing Mode)**:
        *   Keep the existing logic for creating or updating a single entry.

3.  **Verify Service Layer**:
    *   Review `fuelService.saveFuelEntry` in `/services/fuelService.ts`.
    *   Ensure it creates a unique ID if one isn't provided (or relies on the backend). *Note: The current frontend generates UUIDs, so this is fine.*

## Phase 2: Modal UI Shell & Tab Integration
**Objective:** Restructure the `FuelLogModal` to support multiple views (Single vs Bulk) using a Tabbed interface.

1.  **Import Tabs Components**:
    *   In `/components/fuel/FuelLogModal.tsx`, import `{ Tabs, TabsContent, TabsList, TabsTrigger }` from `../ui/tabs`.

2.  **State for Active Tab**:
    *   Add a state variable `activeTab` (defaulting to "single") to control/track which view is open.
    *   This is important so the "Save" button in the footer knows which handler to trigger.

3.  **Refactor JSX Structure**:
    *   Wrap the existing form content (inputs for date, vehicle, amount, etc.) inside a `<Tabs defaultValue="single" onValueChange={setActiveTab}>` container.
    *   Add a `<TabsList>` at the top with two triggers: "Single Entry" and "Bulk Entry".
    *   Move the existing form fields into `<TabsContent value="single">`.

4.  **Create Bulk Placeholder**:
    *   Add `<TabsContent value="bulk">`.
    *   Add a temporary text element "Bulk Entry Form Coming Soon" to verify the switching mechanism works.

5.  **Adjust Footer Logic**:
    *   Update the "Save Log" button in `<DialogFooter>`.
    *   Change the text to "Save All" if `activeTab === 'bulk'`.
    *   Add a conditional check in the `onClick` handler (placeholder for now).

## Phase 3: Bulk Form State & Common Fields
**Objective:** Implement the state management and the "Header" section of the bulk form where users select common data for all rows.

1.  **Define Bulk Row Type**:
    *   Create an interface `BulkRow` locally:
        ```typescript
        interface BulkRow {
            id: string; // Internal temp ID for React keys
            date: string;
            amount: string; // Keep as string for input handling
            liters: string;
            odometer: string;
            location: string;
        }
        ```

2.  **Initialize State**:
    *   Add `bulkVehicleId` and `bulkDriverId` state variables (strings).
    *   Add `bulkRows` state variable, initialized with one empty row.
    *   Add `bulkTransactionType` state (default 'Manual_Entry').

3.  **Implement Common Fields UI**:
    *   Inside `<TabsContent value="bulk">`, create a "Common Details" section.
    *   Add a `Select` for **Vehicle** (reuse existing `vehicles` prop).
    *   Add a `Select` for **Driver** (reuse existing `drivers` prop).
    *   Add a `Select` for **Type** (default to Cash/Manual).
    *   *Design Note*: These inputs apply to *all* bulk rows to save repetitive clicking.

## Phase 4: Bulk Rows Implementation (The Grid)
**Objective:** Build the dynamic list of inputs where users enter the specific details for each transaction.

1.  **Row Helper Functions**:
    *   `addBulkRow()`: Pushes a new object with a unique `crypto.randomUUID()` and today's date to `bulkRows`.
    *   `removeBulkRow(id)`: Filters out the row with the matching ID.
    *   `updateBulkRow(id, field, value)`: Finds the row and updates the specific field.

2.  **Render the Grid Header**:
    *   Create a header row with labels: Date, Cost ($), Volume (L), Odometer, Location, Action.

3.  **Render the Rows**:
    *   Map through `bulkRows`.
    *   For each row, render a compact set of inputs.
    *   **Date**: `<Input type="date">`.
    *   **Cost**: `<Input type="number">`.
    *   **Volume**: `<Input type="number">` (optional).
    *   **Odometer**: `<Input type="number">` (optional).
    *   **Location**: `<Input>` (optional).
    *   **Action**: A generic `Button` with `Trash2` icon calling `removeBulkRow`.

4.  **Add Row Button**:
    *   Below the list, add a "Add Another Entry" button (dashed outline style) that triggers `addBulkRow`.

## Phase 5: Submission Logic & Integration
**Objective:** Transform the bulk form data into valid `FuelEntry` objects and submit them to the backend.

1.  **Create `handleBulkSave` Function**:
    *   **Validation**:
        *   Ensure `bulkVehicleId` is selected.
        *   Ensure `bulkDriverId` is selected.
        *   Filter out "empty" rows (e.g., where Amount is 0 or missing).
        *   If no valid rows remain, show `toast.error`.
    *   **Transformation**:
        *   Map valid `bulkRows` to `FuelEntry` objects.
        *   Spread common fields (`vehicleId`, `driverId`, `type`) into each object.
        *   Parse numbers (`parseFloat`) for amount, liters, odometer.
        *   Calculate `pricePerLiter` if both amount and liters are present.
        *   Assign a new real UUID for the `id`.
    *   **Execution**:
        *   Call `onSave(entriesArray)`.
        *   Call `onClose()`.

2.  **Connect Footer Button**:
    *   Update the footer button's `onClick`:
        ```typescript
        onClick={() => activeTab === 'single' ? handleSave() : handleBulkSave()}
        ```

3.  **Reset State**:
    *   Ensure that when the modal closes or opens, the bulk state is reset to defaults (or persisted if desired, but reset is safer).

## Phase 6: Testing & Polish
**Objective:** Ensure smooth user experience and handle edge cases.

1.  **Empty State Handling**:
    *   Ensure the Bulk tab starts with at least 1 empty row.
2.  **Validation Feedback**:
    *   If a user tries to save without a Vehicle selected, highlight the Vehicle select box or show a clear error.
3.  **Date Handling**:
    *   Verify the date picker in the bulk row uses the `formatDate` fix we applied earlier to prevent timezone issues.
