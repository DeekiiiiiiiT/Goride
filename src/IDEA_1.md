# Fleet Integrity Module - Phase 6 Hardening Roadmap

This roadmap breaks down the final stabilization and performance hardening for the Fuel Management module into 8 detailed phases.

## Phase 1: Critical Build Stability (The "Zero-State" Fix)
**Goal:** Resolve immediate compilation errors and restore application availability.

1. **Step 1.1: Resolve Naming Collisions in `DriverDetail.tsx`**
   - Remove the redundant `CreditCardIcon` function declaration at the bottom of the file (Line 3966).
   - Ensure the component uses the `CreditCardIcon` imported from `lucide-react` at the top of the file.
2. **Step 1.2: Correct Relative Import Paths in `utils/mileageProjection.ts`**
   - Update imports on lines 2, 3, and 4 from `../../` to `../` to correctly target the project root.
3. **Step 1.3: Correct Relative Import Paths in `components/finance/reports/ReportCenter.tsx`**
   - Update imports for `types` and `utils` from `../../` to `../../../` to correctly traverse up three levels to the project root.
4. **Step 1.4: Verify Build Completion**
   - Confirm the Vite server starts without "Duplicate declaration" or "Failed to resolve import" errors.

## Phase 2: Odometer Audit Logic Hardening
**Goal:** Ensure the "Verify Log" action creates immutable anchor points for mileage projection.

1. **Step 2.1: Audit `odometerService.ts` Logic**
   - Review the logic that distinguishes between "Manual Entry" (Verified) and "Calculated Entry" (Projected).
2. **Step 2.2: Implement Anchor Point Validation**
   - Ensure that when a user performs a "Verify Log" action, the record is flagged as an `anchor_point`.
   - Prevent any automatic recalculation logic from overriding `anchor_point` values.
3. **Step 2.3: Chronological Sorting Enforcement**
   - Verify that all odometer calculations in `odometerUtils.ts` perform an explicit sort by date/time before delta calculation.

## Phase 3: Duplicate Record & Optimistic UI Resolution
**Goal:** Handle data consistency when merging disparate CSV reports.

1. **Step 3.1: Enhance Duplicate Detection**
   - Refine `fuelService.ts` to detect duplicates across different providers based on a combination of [Timestamp + Driver + Gallons].
2. **Step 3.2: Refine Optimistic UI Updates**
   - Update `FuelLogModal.tsx` to provide immediate feedback on manual entries while maintaining a "Pending" state until the KV store confirms persistence.
3. **Step 3.3: Conflict Resolution UI**
   - Add a subtle warning UI in the `FuelLogTable` for records that look similar but aren't exact duplicates, allowing manual reconciliation.

## Phase 4: Component Safety & Error Boundary Audit
**Goal:** Ensure UI resilience against data anomalies.

1. **Step 4.1: Chart Container Safety Audit**
   - Review `PerformanceCharts.tsx` and `FuelPerformanceAnalytics.tsx`.
   - Ensure every chart is wrapped in the `SafeResponsiveContainer` component.
2. **Step 4.2: Localized Error Boundaries**
   - Wrap the "Live Odometer" and "History" tabs in `VehicleDetail.tsx` with `ErrorBoundary` components to ensure a crash in a chart doesn't break the entire vehicle view.
3. **Step 4.3: Loading State Consistency**
   - Standardize skeleton loaders across the tabbed interfaces to prevent layout shifts during data fetching.

## Phase 5: Performance Audit & Optimization
**Goal:** Reduce latency in large-scale data rendering.

1. **Step 5.1: Rendering Optimization in `VehicleDetail.tsx`**
   - Implement `React.memo` for static sub-components to prevent unnecessary re-renders when switching between the Live Odometer and History tabs.
2. **Step 5.2: Virtualized Ledgers**
   - If transaction lists exceed 50 items in `FuelLedgerView.tsx`, implement a virtualization strategy or simplified "View More" pagination.
3. **Step 5.3: Hook Memoization**
   - Audit `useFleetData` and `useFuelCycles` to ensure derived analytics are properly memoized via `useMemo`.

## Phase 6: Layout Polishing & Responsive Refinement
**Goal:** Final aesthetic pass for production-readiness.

1. **Step 6.1: Typography & Spacing Standardization**
   - Align all card headers and padding values in the `FuelLayout` to match the core design system.
2. **Step 6.2: Thumb-Friendly Navigation Audit**
   - Test the `DriverPortal` and `FuelLogForm` on mobile dimensions to ensure buttons are appropriately sized (min 44px).
3. **Step 6.3: UI Overlay Fixes**
   - Verify that modals like `StationImportWizard` and `AddVehicleModal` have correct z-indexing and don't clash with the global sidebar.

## Phase 7: Data Consistency & Export Hardening
**Goal:** Ensure exported data matches the source of truth.

1. **Step 7.1: Export Utility Safety Pass**
   - Update `utils/export.ts` to handle edge cases like empty strings or missing nested properties without throwing errors.
2. **Step 7.2: Export Preview Logic**
   - Add a summary count (e.g., "Exporting 142 records...") to the `ReportCenter.tsx` export button.
3. **Step 7.3: Format Synchronization**
   - Ensure date formats in CSV exports match the ISO-8601 standard for interoperability while maintaining human-readable formats in the UI.

## Phase 8: Final Security & Stability Verification
**Goal:** Final hardening before closure of Phase 6.

1. **Step 8.1: System Reset Protection**
   - Verify that `DataResetModal.tsx` requires explicit confirmation strings to prevent accidental data wipes.
2. **Step 8.2: Library Version Compliance**
   - Confirm all `sonner` imports use the `sonner@2.0.3` syntax.
   - Confirm all `motion` imports use the `motion/react` subpath.
3. **Step 8.3: Final Roadmap Verification**
   - Conduct a final walkthrough of `solution.md` to confirm all original Phase 6 objectives have been met.
