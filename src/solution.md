# Fuel Management Implementation Plan: "Full Tank" Logic & Cycles

This plan outlines the transition from a 85% "Soft Anchor" guess to a robust 100% capacity-based fuel cycle system, including a new grouped "Full Tanks" auditing view.

## Phase 1: Logic Refactoring (The 100% Rule) - COMPLETED
- [x] Update Threshold Constants to 1.0 (100%)
- [x] Implement Critical Threshold (1.05) for Anomalies
- [x] Update Cycle Reset Engine for 100% triggers
- [x] Metadata expansion for contribution percentages

## Phase 2: Cycle Mapping Engine (Frontend) - COMPLETED
- [x] Develop `useFuelCycles` hook
- [x] Vehicle grouping logic
- [x] Bucket algorithm for 100% volume/manual reset
- [x] Aggregation logic (KM/L, Cost, Volume)

## Phase 3: Server-side Tooling & Data Consistency - COMPLETED
- [x] **Recalculation Route Update**: Hono route updated with 100%/105% logic.
- [x] **Batch Processing**: Implemented chunked 50-record saves for stability.
- [x] **Cycle ID Injection**: Server now generates and injects UUIDs for stable grouping.
- [x] **Parity**: Sync'd logic between frontend hook and backend backfill.

## Phase 4: UI Infrastructure (Tabs & State) - COMPLETED
- [x] Implement Tab Interface (Transactions vs Full Tanks)
- [x] Unified Data Fetching
- [x] Refresh Trigger System

## Phase 5: "Full Tanks" View - Cycle Summaries - COMPLETED
- [x] Cycle Header Component
- [x] Status Badging (Hard vs Soft Anchor)
- [x] Anomaly Highlighting (Warning styles for >105%)

## Phase 6: Drill-down & Audit Detail - COMPLETED
- [x] Expandable Row Logic
- [x] Sub-transaction Table
- [x] Contribution Visualization

## Phase 7: Validation & Final Polish - IN PROGRESS
1.  **Cross-Vehicle Testing**: Validate that the 100% reset logic works correctly for vehicles with different tank sizes.
2.  **Edge Case Handling**: Ensure "In-Progress" cycles (current tank) are handled gracefully (e.g., shown as an "Active" cycle or omitted from the "Full Tanks" tab).
3.  **Performance Optimization**: Memoize the cycle mapping logic to ensure the UI remains snappy even with thousands of records.

