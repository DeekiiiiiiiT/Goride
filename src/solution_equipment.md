# Equipment Expense Implementation Plan

## Phase 14: Equipment Data Structures & Types
- **Objective:** Define the data models for vehicle equipment and their status.
- **Steps:**
    1.  Create a new file `types/equipment.ts`.
    2.  Define `EquipmentStatus` type: `'Good' | 'Damaged' | 'Missing' | 'Maintenance'`.
    3.  Define `EquipmentItem` interface:
        -   `id: string`
        -   `vehicleId: string`
        -   `name: string`
        -   `description?: string`
        -   `price: number`
        -   `purchaseDate?: string`
        -   `status: EquipmentStatus`
        -   `notes?: string` (for damage reports)
        -   `createdAt: string`
        -   `updatedAt: string`
    4.  Export these types for use in frontend and services.

## Phase 15: Backend Equipment Endpoints
- **Objective:** Implement API endpoints to manage equipment items in the KV store.
- **Steps:**
    1.  Modify `/supabase/functions/server/index.tsx`.
    2.  Implement `GET /make-server-37f42386/equipment/:vehicleId`:
        -   Fetch items using prefix `equipment:{vehicleId}:`.
        -   Return array of `EquipmentItem`.
    3.  Implement `POST /make-server-37f42386/equipment`:
        -   Accept `EquipmentItem` in body.
        -   Generate `id` if missing.
        -   Set/Update `updatedAt`.
        -   Save to KV using key `equipment:{vehicleId}:{itemId}`.
    4.  Implement `DELETE /make-server-37f42386/equipment/:vehicleId/:id`:
        -   Delete key `equipment:{vehicleId}:{id}`.
    5.  Ensure appropriate error handling and CORS headers.

## Phase 16: Frontend Equipment Service
- **Objective:** Create a dedicated service to interact with the equipment API.
- **Steps:**
    1.  Create `services/equipmentService.ts`.
    2.  Import `EquipmentItem` from `../types/equipment`.
    3.  Implement `getEquipment(vehicleId: string): Promise<EquipmentItem[]>`.
    4.  Implement `saveEquipment(item: EquipmentItem): Promise<EquipmentItem>`.
    5.  Implement `deleteEquipment(vehicleId: string, itemId: string): Promise<void>`.
    6.  Include `fetchWithRetry` utility (or import if shared) to handle network resilience.

## Phase 17: Admin UI - Equipment Manager
- **Objective:** Build the UI for Fleet Managers to manage vehicle equipment.
- **Steps:**
    1.  Create `components/vehicles/equipment/AddEquipmentDialog.tsx`:
        -   Use ShadCN `Dialog`, `Input`, `Label`.
        -   Form fields: Name, Description, Price, Purchase Date.
        -   Handle validation and submission.
    2.  Create `components/vehicles/equipment/VehicleEquipmentManager.tsx`:
        -   Accept `vehicleId` prop.
        -   Fetch and display equipment list in a ShadCN `Table`.
        -   Columns: Name, Price, Status (Badge), Notes, Actions (Edit/Delete).
        -   Include "Add Equipment" button to trigger the dialog.
        -   Display summary (Total Equipment Value).

## Phase 18: Admin UI - Integration
- **Objective:** Integrate the Equipment Manager into the Vehicle Details view.
- **Steps:**
    1.  Open `components/vehicles/VehicleDetail.tsx`.
    2.  Locate the `Tabs` component.
    3.  Add a new `TabsTrigger` labeled "Equipment".
    4.  Add a `TabsContent` for "equipment" that renders `<VehicleEquipmentManager vehicleId={vehicle.id} />`.

## Phase 19: Driver Portal - Equipment Component
- **Objective:** Create the view for drivers to see their vehicle's equipment and report issues.
- **Steps:**
    1.  Create `components/driver-portal/DriverEquipment.tsx`.
    2.  Accept `vehicleId` prop.
    3.  Fetch equipment list using `equipmentService`.
    4.  Render a mobile-friendly list (using Cards or a simple List view).
    5.  For each item, display Name, Status badge.
    6.  Add a "Report Issue" action button for each item:
        -   Opens a small dialog/popover.
        -   Allows selecting status ("Damaged", "Missing").
        -   Allows entering "Notes" (e.g., "Cracked screen").
        -   Updates the item via `equipmentService.saveEquipment`.

## Phase 20: Driver Portal - Integration
- **Objective:** specific the Equipment tab to the Driver Dashboard.
- **Steps:**
    1.  Open `components/driver-portal/DriverDashboard.tsx`.
    2.  Implement logic to determine the current driver's assigned `vehicleId`:
        -   Fetch all vehicles and find one where `currentDriverId === user.id`.
    3.  Add a new `TabsTrigger` labeled "Equipment" (or "Inventory").
    4.  Add `TabsContent` rendering `<DriverEquipment vehicleId={assignedVehicleId} />`.
    5.  Handle empty state if no vehicle is assigned.

## Phase 21: Final Polish and Verification
- **Objective:** comprehensive testing and cleanup.
- **Steps:**
    1.  Verify strict types in all new files (`types/equipment.ts`, service, components).
    2.  Check for and remove console logs.
    3.  Test the full flow:
        -   Admin adds "Spare Tire" ($200).
        -   Driver sees "Spare Tire".
        -   Driver reports "Spare Tire" as "Missing".
        -   Admin sees "Spare Tire" status change to "Missing" in Vehicle Detail.
    4.  Ensure mobile responsiveness for the Driver Portal view.
