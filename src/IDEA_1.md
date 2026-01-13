# Bulk Fuel Log Entry Feature

## Overview
To support adding multiple cash fuel transactions for the same vehicle and driver across different dates, we will enhance the `FuelLogModal` with a tabbed interface. This allows users to switch between the existing "Single Entry" mode and a new "Bulk Entry" mode.

## 1. UI Changes in `FuelLogModal.tsx`

### Tabs
- Introduce a `Tabs` component (using `shadcn/ui` tabs) at the top of the modal content.
- **Tab 1: Single Entry**: Contains the current form layout.
- **Tab 2: Bulk Entry**: A new optimized layout for multiple entries.

### Bulk Entry Layout
The bulk entry view will be designed to minimize repetitive data entry:
1.  **Common Fields (Header)**:
    -   **Transaction Type**: Defaults to "Cash / Out of Pocket" (Manual_Entry) but selectable.
    -   **Vehicle**: Select once for all entries.
    -   **Driver**: Select once for all entries.
    -   *Note*: Changing these updates all rows implicitly.

2.  **Entries Grid (Body)**:
    -   A scrollable list of rows, where each row represents a transaction.
    -   **Row Columns**:
        -   **Date**: Date Picker (essential).
        -   **Total Cost ($)**: Number input.
        -   **Volume (L)**: Number input.
        -   **Odometer (km)**: Number input.
        -   **Location**: Text input.
        -   **Actions**: "Delete" button (trash icon).
    -   **Footer**: "Add Row" button to append a new empty line.

### Logic & Validation
-   **Validation**: Ensure "Vehicle", "Driver", and "Type" are selected. Ensure every row has at least a "Date" and "Amount".
-   **State Management**: Maintain an array of row objects `{ id, date, amount, liters, odometer, location }`.
-   **Submission**: When "Save Logs" is clicked:
    -   If in "Single" mode: Function as before (returns single object).
    -   If in "Bulk" mode: Map rows to an array of `FuelEntry` objects using the common header data. Pass this array to the parent.

## 2. Integration in `FuelManagement.tsx`

### Handler Update
-   Modify `handleSaveLog` to accept `FuelEntry | FuelEntry[]`.
-   **Logic**:
    ```typescript
    const handleSaveLog = async (entryOrEntries: FuelEntry | FuelEntry[]) => {
        const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
        
        try {
            // Save all entries in parallel
            const savedEntries = await Promise.all(entries.map(e => fuelService.saveFuelEntry(e)));
            
            // Update State
            setLogs(prev => [...savedEntries, ...prev]);
            toast.success(`Successfully recorded ${savedEntries.length} transactions`);
        } catch (e) {
            // Error handling
        }
    }
    ```

## 3. Service Layer (`fuelService.ts`)
-   No major changes required if we use `Promise.all` in the parent.
-   *Optional Optimization*: If performance becomes an issue with many entries, we could implement a `bulkSaveFuelEntries` method, but for typical use (5-10 entries), parallel requests are acceptable.

## Recommendation
This approach reuses existing components and services while significantly improving the user workflow for batch data entry. The "Single Entry" tab preserves the current detailed view for editing or specific one-off logs.
