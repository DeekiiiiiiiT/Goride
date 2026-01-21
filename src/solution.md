# Implementation Roadmap: Odometer Anchor & Legacy Receipt System

This document outlines the multi-phase implementation for the automated driver management system, focusing on "Anchor Window" reconciliation and historical cash receipt integration.

## Phase 1: Data Model & Schema Enhancement (COMPLETE)
**Goal**: Establish the structural difference between "Anchor" events and "Floating" entries.
1. **Update `FuelEntry` Type**: Added `entryMode: 'Anchor' | 'Floating'` and `paymentSource` fields.
2. **Update `OdometerBucket` Structure**: Replaced `fuelEntryId` with `associatedReceipts: string[]` to support accumulation.
3. **Database Nullability**: Updated types to allow `odometer: null` for `Floating` entries.
4. **FuelLog Type Update**: Synchronized `FuelLog` types in the data core.

## Phase 2: The "Stop-to-Stop" Accumulator Engine
**Goal**: Build the logic that "sandwiches" multiple legacy receipts between two verified odometer scans.
1. **Sorted Event Timeline**: Modify `calculateOdometerBuckets` to fetch both `Anchor` and `Floating` entries for a vehicle.
2. **Window Boundary Logic**: Implement a "window search" that identifies all non-odometer receipts that fall between two chronological odometer anchors.
3. **Volume & Cost Aggregation**: Calculate the sum of `liters` and `amount` for every entry in the window (Start Anchor -> Floating Receipts -> End Anchor).
4. **Efficiency Math Correction**: Update variance calculation to compare total accumulated liters against the total distance between the two anchors.
5. **Partial Window Management**: Handle "Open Windows" (data since the last scan) and ensure they are marked as `Partial`.

## Phase 3: Automated Financial Settlement & Ledger Sync
**Goal**: Automatically credit the driver's cash-on-hand liability when fuel is purchased with RideShare cash.
1. **Settlement Trigger**: Create a service listener that detects whenever a `RideShare_Cash` fuel entry is approved or scanned.
2. **Ledger Credit Creation**: Integrate with the financial engine to automatically post a `Credit` transaction to the driver's ledger.
3. **Liability Offset Logic**: Ensure the credit specifically offsets "Cash Collected" categories to reduce the driver's net debt to the organization.
4. **Cost-Sharing Application**: Apply dynamic "Scenario Rules" during settlement (e.g., if the company pays 80%, only credit 80% of the receipt to the driver's liability).
5. **Transaction Linking**: Store the `transactionId` on the fuel entry to provide a direct audit link between the receipt and the ledger entry.

## Phase 4: Gap Analysis & Automated Deduction Triggers
**Goal**: Identify "unexplained distance" and trigger penalties for mileage leakage.
1. **Distance Delta Calculation**: Implement `OdometerDelta - Sum(LoggedTrips)` logic to find mileage gaps.
2. **Leakage Thresholding**: Define configurable percentage/km thresholds for "Acceptable Variance" vs. "Flagged Leakage".
3. **Deduction Engine**: Automatically generate a "Unexplained Distance Charge" in the driver's settlement if the gap exceeds the threshold.
4. **Audit Trail**: Attach the specific `OdometerBucket` ID to the deduction transaction for transparent disputes.

## Phase 5: Reconciliation & Bucket Health UI (Admin)
**Goal**: Provide a high-level view of fleet health using the new bucketing logic.
1. **Bucket Visualizer**: Update the Odometer Tab to show grouped receipts inside each bucket row.
2. **Health Indicator (Emerald/Amber/Red)**: Display status based on both fuel variance and distance gaps.
3. **Drill-down View**: Allow admins to click a bucket to see the specific trips and receipts that formed that window.
4. **Bulk Verification**: Implement an admin action to "Finalize" a bucket, locking it against future changes.

## Phase 6: Driver Portal Transparency
**Goal**: Show drivers how their fuel logs are affecting their earnings and debt.
1. **Settlement Visibility**: Add a "Fuel Offsets" section to the driver's weekly earnings view.
2. **Balance Real-time Update**: Ensure the "Cash-on-Hand" counter decreases immediately after a successful fuel scan.
3. **Reconciliation Status**: Show drivers if their recent logs are "Pending Reconciliation" or "Verified".

## Phase 7: Proactive Compliance Alerts
**Goal**: Use notifications to ensure drivers don't skip scans.
1. **Missing Scan Detector**: Detect if a vehicle has moved significant distance (trips) without a corresponding fuel/odo entry.
2. **Push Notifications**: Send reminders to drivers if they are nearing the "Max Window Distance" without an anchor scan.
3. **Blocking Logic (Optional)**: Flag drivers in the admin dashboard who consistently have high "Floating" counts without anchors.

## Phase 8: Fleet Efficiency & ROI Reporting
**Goal**: Aggregated data for long-term fleet management.
1. **L/100km Trending**: Show true vehicle efficiency over time using the cleaned "Stop-to-Stop" data.
2. **Station Performance Analysis**: Identify stations where fuel quality might be causing efficiency drops.
3. **Driver Behavior Scoring**: Create a "Compliance Score" based on scan frequency and variance accuracy.

## Phase 9: System Hardening & Edge Cases
**Goal**: Handle technical complexities like vehicle swaps and odometer roll-overs.
1. **Vehicle Swap Logic**: Ensure buckets are correctly closed when a driver changes vehicles.
2. **Odometer Correction Utility**: Build a tool for admins to fix "fat-finger" odometer typos that break subsequent buckets.
3. **Final System Audit**: Stress test the accumulator engine with high volumes of back-filled legacy data.
