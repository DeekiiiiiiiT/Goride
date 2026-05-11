# Changelog

## [Phase 6] - 2026-01-17

### Added
- **Fuel Scenarios**: New `ScenarioList` and `ScenarioEditor` components to manage fuel coverage rules (Fuel, Maintenance, Tolls).
- **Backend Endpoints**: Added `/scenarios` endpoint to `server/index.tsx` for CRUD operations on fuel scenarios.
- **Vehicle Assignment**: Updated `VehicleDetail.tsx` to allow assigning a Fuel Scenario to a vehicle in the Specifications dialog.
- **Auto-Approval UI**: Updated `DriverExpenses.tsx` to display a specific success message ("Expense Auto-Approved & Odometer Verified! 🚀") when an AI-verified fuel receipt is submitted.

### Changed
- **Fuel Configuration**: Replaced the old "Split Rules" UI with the new Scenario management interface.
- **Transaction Processing**: Backend now auto-approves transactions marked with `odometerMethod: 'ai_verified'` and creates a corresponding "Fuel Log" anchor in the timeline.

### Fixed
- **Cleaned Up**: Removed temporary console logs and unused imports from development phases.
