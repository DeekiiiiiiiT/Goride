# Fuel Configuration Redesign: Scenario-Based Splits

## Problem
The current Fuel Configuration model assumes a single "Fuel" category with a base Company/Driver split, and "Custom Splits" acting as third-party deductions (Pie Chart model). The user requires a **Scenario-based** model where specific situations (e.g., "Ride Share", "Company Errands", "Personal") have their own independent Company vs. Driver split ratios.

## Solution Overview
We will transition from a "Single Rule with Sub-splits" to a "Multiple Rules" architecture. Each "Scenario" defined by the user will be stored as a distinct `ExpenseSplitRule`.

## Detailed Implementation Plan

### Phase 1: Data Model Enhancement
**Goal:** Support named scenarios in the `ExpenseSplitRule` interface.

1.  **Update `types/data.ts`**:
    -   Add optional `name?: string;` to the `ExpenseSplitRule` interface.
    -   This field will store the user-defined scenario name (e.g., "Ride Share").

### Phase 2: FuelConfiguration UI Redesign
**Goal:** Implement the requested "Split Box" UI.

1.  **Refactor `components/fuel/FuelConfiguration.tsx`**:
    -   **Load Data**: Fetch all `splitRules` from `tierService`.
    -   **Filter**: Select all rules where `category === 'Fuel'`.
    -   **Render**: Display a responsive Grid of "Scenario Cards".
    -   **Scenario Card Component**:
        -   **Header**: Editable Text Input for the Scenario Name (mapped to `rule.name`).
        -   **Body**: A row with two labeled sections: "Company" and "Driver".
            -   **Company Input**: Number input (0-100), editable.
            -   **Driver Input**: Number input, read-only/disabled. Value calculated as `100 - companyShare`.
            -   **Delete Action**: Allow removing a scenario card.
    -   **Add Action**: "Add Split Column" button creates a new `ExpenseSplitRule` object:
        ```typescript
        {
          id: crypto.randomUUID(),
          category: 'Fuel',
          name: 'New Scenario',
          companyShare: 0,
          driverShare: 100,
          isDefault: false
        }
        ```
    -   **Save Action**: Persist the modified array of rules back to `tierService`.

### Phase 3: Migration & Compatibility
1.  **Handling Existing Data**:
    -   If the existing configuration uses `customSplits` (the old model), we can theoretically convert them to new Rules on the fly, or simply allow the user to recreate their setup in the new clearer interface.
    -   Given this is a configuration tool, manual setup is acceptable for the transition.

### Phase 4: Future Integration (Backend/Approval)
1.  **Expense Approvals**:
    -   Update `ExpenseApprovals.tsx` to read these rules.
    -   When an admin approves a transaction, if the transaction is tagged with a Scenario (e.g. via `notes` or a new `tag` field), auto-populate the split slider with the configured value.

## Visual Reference (User Request)
-   **Structure**:
    ```text
    [ Scenario Name (Editable) ]
    ----------------------------
    Company (%)   |   Driver (%)
    [  50  ]      |   [  50  ]
    ```
-   **Behavior**: Editing "Company" automatically updates "Driver" to ensure they sum to 100%. "Driver" field is non-editable.
