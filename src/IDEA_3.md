# Technical Implementation Strategy: Fleet Expense Management

Based on the design requirements in `IDEA_2.md` and the system constraints analyzed in `IDEA_1.md`, here is the technical roadmap for implementing the Fleet Expense System.

## Core Architecture Decisions

### 1. Data Access Strategy
- **Aggregated Fetching**: We will utilize the KV Store's `getByPrefix("equipment:")` capability to fetch all equipment records in a single request for the Fleet Dashboard. This solves the "N+1 query" performance bottleneck.
- **Bulk Updates**: We will use the `mset` (multi-set) function in `kv_store.tsx` to handle bulk assignments atomically (single HTTP request), ensuring high performance when updating 50+ vehicles.

### 2. New Data Models (KV Store)
We need to introduce new key schemas to support Inventory and Templates, as strictly attaching items to vehicles is no longer sufficient.

| Entity | Key Pattern | Description |
|--------|-------------|-------------|
| **Inventory** | `inventory:{itemId}` | Unassigned stock sitting in the "Warehouse". |
| **Templates** | `template:equipment:{templateId}` | Pre-defined kits (e.g., "Standard Safety Kit"). |
| **Settings** | `settings:expense_categories` | configurable list of categories (e.g. "Tires", "Electronics") to replace free-text. |

---

## Phase 1: Fleet Dashboard (Implementation Spec)

**Objective**: Create the "Control Center" for expenses.

### Components
1.  **`FleetExpenseDashboard.tsx`**: Main container.
    -   **State**: `allEquipment[]` (fetched once on load).
    -   **Computed Metrics**: Calculate "Total Asset Value" and "Renewals" client-side from the `allEquipment` array. This ensures instant updates without re-fetching.
2.  **`GlobalFilterBar.tsx`**:
    -   Uses `shadcn/popover` + `command` for a robust Multi-Select Vehicle Filter.
    -   Date Range Picker using `shadcn/calendar`.

### Service Layer
-   Update `equipmentService.ts`:
    -   Add `getAllEquipment()` -> calls `GET /equipment/all` (Needs backend route wrapper for `getByPrefix('equipment:')`).

---

## Phase 2: Bulk Operations Engine

**Objective**: "Add to 50 vehicles in 4 clicks".

### Components
1.  **`BulkEquipmentWizard.tsx`**:
    -   **State Management**: Use a localized reducer or form state for the 4-step process.
    -   **Step 1 (Selection)**: Re-use `VehicleSelector` component.
    -   **Step 2 (Item)**: Toggle between "Catalog Item", "Template", or "Inventory Source".
2.  **`ExpenseTemplateManager.tsx`**:
    -   Simple CRUD for `template:equipment:` keys.

### Logic
-   **Transaction**: When "Confirm" is clicked:
    1.  Generate unique IDs for every new item instance.
    2.  If source is Inventory: Decrement inventory counts (using `mset` to update inventory keys).
    3.  Create new equipment records (using `mset` to write `equipment:{vid}:{newId}`).
    4.  This ensures data consistency.

---

## Phase 3: Inventory System

**Objective**: Manage unassigned assets.

### Components
1.  **`InventoryDashboard.tsx`**:
    -   Table view of `inventory:*` keys.
    -   "Low Stock" highlighting (simple logic: `current < reorder_level`).
2.  **`InventoryTransferModal.tsx`**:
    -   Moves an item from `inventory:{id}` to `equipment:{vid}:{id}`.
    -   Technically: Delete/Update Inventory Key -> Create Equipment Key.

---

## Phase 4: Smart Alerts & Automation

**Objective**: Proactive management.

### Logic
-   **Client-Side Evaluation**:
    -   We do not need a background job runner.
    -   On Dashboard load, iterate `allEquipment`:
        -   `if (expiryDate < today + 30 days) => push to alerts array`.
    -   Display these in the "Alerts" tab.
-   **Notification**:
    -   Use `sonner` toast for immediate feedback.
    -   Visual Badge on the "Expenses" sidebar item (if possible) showing alert count.

---

## Recommended Development Order

1.  **Foundation**: Implement `getAllEquipment` API and Service.
2.  **Dashboard UI**: Build the high-level metrics and table view.
3.  **Inventory**: Build the Inventory CRUD (simpler than Bulk Ops).
4.  **Bulk Ops**: Build the Wizard (most complex UI).
5.  **Templates**: Add templates as a source for Bulk Ops.

## Library Usage
-   **Charts**: Use `Recharts` for the "Inventory Value over Time" graph.
-   **Icons**: `Lucide-React` (Box, Truck, AlertTriangle).
-   **Forms**: `React-Hook-Form` + `Zod` is essential for the Bulk Wizard validation.
