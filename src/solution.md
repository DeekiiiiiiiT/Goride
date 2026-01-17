# Solution Plan: Fuel Configuration Scenarios

This plan details the restructuring of the Fuel Configuration module to support named "Scenarios" (e.g., "Ride Share", "Personal") with independent Company vs. Driver split ratios.

## Phase 13: Data Model & Schema Updates
**Goal:** Enhance the data structures to support named split rules and flatten the "custom splits" hierarchy into distinct scenarios.

*   **Step 1:** Modify `ExpenseSplitRule` interface in `/types/data.ts`.
    *   Add `name?: string;` property to store the scenario title (e.g., "Ride Share").
    *   Ensure `customSplits` is marked as optional/deprecated, as we are moving to a flat list of rules.
*   **Step 2:** Update `DEFAULT_SPLIT_RULES` in `/services/tierService.ts`.
    *   Initialize with distinct named rules instead of one rule with sub-splits.
    *   Example: Create a "Standard" rule (50/50) by default.
*   **Step 3:** Create a migration utility in `tierService.ts` (internal logic).
    *   When loading rules, if a rule has `customSplits`, convert it into multiple independent `ExpenseSplitRule` objects (one for the base, one for each custom split if applicable, or just reset to defaults if migration is too complex). *Decision: We will treat existing complex custom splits as "Legacy" and just load the base rules, allowing users to recreate new Scenarios.*

## Phase 14: The "Scenario Card" Component
**Goal:** Create a reusable, isolated UI component for managing a single split scenario.

*   **Step 1:** Create file `/components/fuel/ScenarioCard.tsx`.
*   **Step 2:** Define props interface:
    *   `rule`: The `ExpenseSplitRule` object.
    *   `onUpdate`: Callback function `(id: string, field: keyof ExpenseSplitRule, value: any) => void`.
    *   `onDelete`: Callback function `(id: string) => void`.
*   **Step 3:** Implement the Header (Scenario Name).
    *   Use an `Input` field.
    *   Placeholder: "Enter Scenario Name (e.g., Ride Share)".
*   **Step 4:** Implement the "Shares" Section.
    *   Create a 2-column layout.
    *   **Column 1 (Company)**: Label "Company", Input type="number" (0-100).
    *   **Column 2 (Driver)**: Label "Driver", Input (Read-only, calculated as `100 - companyShare`).
*   **Step 5:** Implement Styling.
    *   Match the user's screenshot: Clean borders, clear headings.
    *   Add a "Delete" (Trash icon) button in the header.

## Phase 15: Main Configuration Grid & State Management
**Goal:** Rebuild the parent container to manage the list of scenarios.

*   **Step 1:** Refactor `/components/fuel/FuelConfiguration.tsx`.
    *   Remove all `customSplits` logic and calculations.
    *   Remove the old rendering code.
*   **Step 2:** Implement State for `splitRules` array.
    *   The state should hold `ExpenseSplitRule[]`.
*   **Step 3:** Implement "Add Split Column" logic.
    *   Function `addNewScenario()`: Pushes a new object `{ id: uuid(), category: 'Fuel', name: 'New Scenario', companyShare: 50, driverShare: 50 }` to state.
*   **Step 4:** Implement the Grid Layout.
    *   Use CSS Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).
    *   Map through `splitRules` (filtered by `category === 'Fuel'`) and render `ScenarioCard` for each.

## Phase 16: Validation & Persistence
**Goal:** Ensure data integrity and save changes to the backend.

*   **Step 1:** Implement Client-Side Validation in `handleSave`.
    *   Check: Are all Scenario Names filled out? (Reject empty names).
    *   Check: Do existing rules have valid numbers?
*   **Step 2:** Update `handleSave` in `FuelConfiguration.tsx`.
    *   Call `tierService.saveSplitRules(currentRules)`.
    *   Show `toast.success` on completion.
*   **Step 3:** Error Handling.
    *   Wrap save in try/catch.
    *   Show `toast.error` if save fails.

## Phase 17: Cleanup & System Integration
**Goal:** Ensure the new configuration is respected elsewhere in the app.

*   **Step 1:** Check `/components/finance/ExpenseApprovals.tsx`.
    *   Currently, it might default to 50/50 or look for a single rule.
    *   *Note: For this iteration, we won't rewrite the Approval logic to auto-detect scenarios unless requested, but we must ensure it doesn't crash.*
    *   Verify `ExpenseApprovals` reads `companyShare` correctly from the new structure (it should, as it likely just grabs the first rule or we can tell it to).
*   **Step 2:** Manual Verification Checklist.
    *   Can add 3+ scenarios?
    *   Does editing "Company" update "Driver" instantly?
    *   Does "Delete" work?
    *   Does Reloading the page show saved data?

## Phase 18: Final Polish
**Goal:** UI/UX refinements.

*   **Step 1:** Add Empty State.
    *   If no rules exist, show a "Create your first Fuel Scenario" button.
*   **Step 2:** Add Tooltips/Help text explaining that these scenarios will be available when approving expenses.
