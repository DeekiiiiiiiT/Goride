# Fleet Expense System Implementation Plan

## Phase 1: Backend & Data Access Layer
**Goal**: Enable efficient fleet-wide data fetching and bulk writing operations using Supabase KV Store.

1.  **Step 1: Define TypeScript Interfaces**
    *   Create `types/fleet.ts`.
    *   Define `FleetMetric`, `InventoryItem`, `BulkOperationPayload` interfaces.
    *   Update `types/equipment.ts` to include optional `inventoryId` reference.

2.  **Step 2: Implement 'Get All Equipment' Endpoint**
    *   Modify `/supabase/functions/server/index.tsx`.
    *   Add route `GET /fleet/equipment/all`.
    *   Implementation: Use `kv.getByPrefix('equipment:')` to fetch all equipment records in one request.

3.  **Step 3: Implement 'Bulk Write' Endpoint**
    *   Modify `/supabase/functions/server/index.tsx`.
    *   Add route `POST /fleet/equipment/bulk`.
    *   Implementation: Accept array of items, use `kv.mset` to save them atomically.

4.  **Step 4: Implement Inventory Endpoints**
    *   Modify `/supabase/functions/server/index.tsx`.
    *   Add `GET /inventory` (using `kv.getByPrefix('inventory:')`).
    *   Add `POST /inventory` (single item create/update).
    *   Add `POST /inventory/bulk` (for bulk stock updates).

## Phase 2: Service Layer & State Management
**Goal**: Create robust frontend services to abstract API communication.

1.  **Step 1: Update Equipment Service**
    *   Edit `services/equipmentService.ts`.
    *   Add `getAllEquipment()` function.
    *   Add `bulkAssignEquipment(payload)` function.

2.  **Step 2: Create Inventory Service**
    *   Create `services/inventoryService.ts`.
    *   Implement `getInventory()`, `addStock()`, `updateStock()`, `deleteStock()`.

3.  **Step 3: Create Template Service**
    *   Create `services/templateService.ts`.
    *   Implement CRUD for equipment templates (`template:equipment:` prefix).

4.  **Step 4: Data Hooks**
    *   Create `hooks/useFleetData.ts`.
    *   Implement `useFleetExpenses` (fetches vehicles + all equipment).
    *   Implement `useInventory` (fetches stock).

## Phase 3: Core UI Components
**Goal**: Build the reusable atoms and molecules for the new dashboards.

1.  **Step 1: Vehicle Multi-Selector**
    *   Create `components/fleet/shared/VehicleSelector.tsx`.
    *   Use `shadcn/popover` and `shadcn/command`.
    *   Features: Search by name/plate, "Select All" button, Badges for selected items.

2.  **Step 2: Standardized Status Badge**
    *   Create `components/fleet/shared/StatusBadge.tsx`.
    *   Map statuses (Good, Damaged, Low Stock) to Tailwind colors.

3.  **Step 3: Inventory Item Card**
    *   Create `components/inventory/InventoryItemCard.tsx`.
    *   Display name, quantity, value, and "Assign" action button.

4.  **Step 4: Metric Cards**
    *   Create `components/fleet/shared/MetricCard.tsx`.
    *   Props: Title, Value, Icon, Trend (optional).

## Phase 4: Fleet Dashboard (Read-Only)
**Goal**: Implement the main "Control Center" for visualizing fleet expenses.

1.  **Step 1: Dashboard Shell**
    *   Create `components/fleet/FleetDashboard.tsx`.
    *   Add Tab navigation (Overview, Inventory, Bulk Ops).
    *   Add route `/fleet-expenses` in `App.tsx`.

2.  **Step 2: Key Metrics Section**
    *   Implement client-side calculation in `FleetDashboard.tsx`.
    *   Calculate: Total Asset Value, Total Items, Vehicles with < 0 items.
    *   Render `MetricCard` row.

3.  **Step 3: Global Filter Bar**
    *   Create `components/fleet/dashboard/GlobalFilterBar.tsx`.
    *   Integrate `VehicleSelector` and Date Range Picker.
    *   Pass filter state to parent dashboard.

4.  **Step 4: Fleet Equipment Table**
    *   Create `components/fleet/dashboard/FleetEquipmentTable.tsx`.
    *   Columns: Equipment Name, Vehicle (Link), Category, Cost, Date.
    *   Implement client-side sorting and filtering based on Global Filter.

## Phase 5: Inventory Management System
**Goal**: Manage unassigned assets and warehouse stock.

1.  **Step 1: Inventory Dashboard**
    *   Create `components/inventory/InventoryDashboard.tsx`.
    *   Integrate `InventoryService` to load data.

2.  **Step 2: Add/Edit Stock Dialog**
    *   Create `components/inventory/InventoryDialog.tsx`.
    *   Form fields: Name, Category, Quantity, Reorder Level, Cost per Unit.

3.  **Step 3: Inventory Table**
    *   Create `components/inventory/InventoryTable.tsx`.
    *   Feature: Highlight rows where `Quantity <= ReorderLevel`.
    *   Actions: "Edit", "Delete", "Quick Assign".

## Phase 6: Bulk Operations Wizard (UI Skeleton)
**Goal**: Design the multi-step interface for adding equipment to multiple vehicles.

1.  **Step 1: Wizard Container**
    *   Create `components/fleet/wizard/BulkWizard.tsx`.
    *   State: `currentStep` (1-4), `wizardData` (vehicles, items, config).
    *   Layout: Dialog with Progress Stepper.

2.  **Step 2: Step 1 - Vehicle Selection**
    *   Create `components/fleet/wizard/steps/VehicleSelectionStep.tsx`.
    *   Reuse `VehicleSelector` but optimized for full-screen wizard.

3.  **Step 3: Step 2 - Equipment Source**
    *   Create `components/fleet/wizard/steps/EquipmentSelectionStep.tsx`.
    *   Tabs: "New Item", "From Inventory", "From Template".
    *   Render appropriate form based on tab.

4.  **Step 4: Step 3 - Configuration**
    *   Create `components/fleet/wizard/steps/ConfigurationStep.tsx`.
    *   Fields: Installation Date, Notes, Cost override.

5.  **Step 5: Step 4 - Review**
    *   Create `components/fleet/wizard/steps/ReviewStep.tsx`.
    *   Show summary: "Adding [Item] to [N] vehicles. Total Cost: [$X]".

## Phase 7: Bulk Operations Logic & Wiring
**Goal**: Connect the wizard UI to the backend with robust transaction logic.

1.  **Step 1: Payload Generation**
    *   Implement `generateBulkPayload()` utility.
    *   Logic: Create N copies of the equipment item, each with unique ID and assigned `vehicleId`.

2.  **Step 2: Inventory Deduction Logic**
    *   Handle "From Inventory" case.
    *   Logic: If source is inventory, decrement stock count. Validate `Required <= Available`.

3.  **Step 3: Backend Integration**
    *   Wire "Confirm" button to `equipmentService.bulkAssign`.
    *   Handle `isSubmitting` state and error catching.

4.  **Step 4: Success Feedback**
    *   Show Success Dialog with summary.
    *   Offer "Print Report" or "View Dashboard" options.

## Phase 8: Templates System
**Goal**: Allow saving equipment sets for rapid assignment.

1.  **Step 1: Template Manager**
    *   Create `components/fleet/templates/TemplateManager.tsx`.
    *   List existing templates.

2.  **Step 2: Create Template Dialog**
    *   Allow defining a "Kit" (Name + Array of Items).
    *   Save to `template:equipment:` prefix.

3.  **Step 3: Integrate with Wizard**
    *   Update `EquipmentSelectionStep.tsx` to pull from Template Service.

## Phase 9: Polish & Smart Alerts
**Goal**: Final UX enhancements and mobile responsiveness.

1.  **Step 1: Alert Logic**
    *   Create `utils/alertHelpers.ts`.
    *   Function `getExpiringItems(items)`: returns items expiring in < 30 days.

2.  **Step 2: Alerts Panel**
    *   Add "Alerts" tab to `FleetDashboard`.
    *   Display list of alerts grouped by urgency.

3.  **Step 3: Mobile Responsive Check**
    *   Verify Wizard works on mobile (stack columns).
    *   Verify Table horizontal scroll behavior.
