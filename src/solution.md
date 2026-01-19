# Solution Plan

## Phase 1: Fuel Logic - Basic Cost Calculation (Completed)
- [x] Create basic `FuelEntry` and `FuelRule` types
- [x] Implement `calculateOperatingCost` based on distance and efficiency
- [x] Build `ReconciliationTable` skeleton

## Phase 2: Personal KM Calculation (Completed)
- [x] Implement check-in logic to determine Total Distance
- [x] Calculate Personal Distance as Residual (Total - Business)

## Phase 3: Company Usage Isolation (Completed)
- [x] Add `Company_Misc` type to Mileage Adjustments
- [x] Update calculation to isolate Company Usage cost
- [x] Ensure Company Usage is treated as 100% Company Liability

## Phase 4: Fuel Buckets & Leakage (Completed)
- [x] Explicitly define 4 buckets: Ride Share, Company Ops, Personal, Misc
- [x] Implement Leakage calculation (Total Spend - Sum of buckets)
- [x] Update Table UI to show these 4 columns

## Phase 5: Scenario Logic Integration (Completed)
- [x] Connect `FuelScenario` to Vehicle Profile
- [x] Apply coverage rules (Full/Percentage) to split Company/Driver share

## Phases 6-9: Refinements (Completed)
- [x] UI Polish
- [x] Backend Endpoints
- [x] Bug Fixes

## Phase 10: Granular Fuel Rules (Current)
The user requires the ability to set specific coverage percentages for each of the 4 fuel buckets within a single scenario.

### Phase 10-1: Data Model Updates
**Objective:** Expand `FuelRule` to support granular percentages.
1.  **Modify `types/fuel.ts`**:
    - Update `FuelRule` interface to include optional fields:
        - `rideShareCoverage` (number 0-100)
        - `companyUsageCoverage` (number 0-100)
        - `personalCoverage` (number 0-100)
        - `miscCoverage` (number 0-100)
    - Preserve existing `coverageValue` for backward compatibility or simple mode.

### Phase 10-2: Scenario Editor UI
**Objective:** Allow users to input specific percentages for each category.
1.  **Update `components/fuel/ScenarioEditor.tsx`**:
    - Replace the single "Percentage" input with a matrix of 4 inputs when "Percentage Split" is selected.
    - Fields:
        - Ride Share % (Default 100% or user set)
        - Company Usage % (Default 100%)
        - Personal % (Default 0%)
        - Miscellaneous % (Default 50%)
    - Add validation (0-100).
    - Ensure these values are saved to the rule.

### Phase 10-3: Calculation Logic Update
**Objective:** Apply the granular percentages in the reconciliation engine.
1.  **Update `services/fuelCalculationService.ts`**:
    - Locate `calculateReconciliation` function.
    - Inside the `fuelRule` logic, handle the granular percentages.
    - `companyShare` = (RideShare * rideSharePct) + (CompanyUsage * companyUsagePct) + (Personal * personalPct) + (Misc * miscPct).
    - Ensure defaults are applied if new fields are undefined (Legacy support).

### Phase 10-4: Validation
**Objective:** Verify the split is correct.
1.  **Manual Test**:
    - Edit a scenario to have distinct % for each bucket (e.g. 50/100/0/50).
    - Check `ReconciliationTable` output.
    - Verify `Company Share` + `Driver Share` equals `Total Spend`.
