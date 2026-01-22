# Implementation Roadmap: Fuel Log & Reimbursement Synchronization

## Phase 1: Foundation - API & Service Layer Synchronization
*   **Step 1: ID Cross-Referencing**: Enhance data flow to ensure `transactionId` and `sourceId` are always present and correctly mapped during record creation.
*   **Step 2: Service Layer Linkage**: Create utility functions in `fuelService.ts` and `api.ts` to fetch linked records across domains.
*   **Step 3: Sync Payload Utility**: Implement a helper to generate synchronized updates for both `FuelEntry` and `FinancialTransaction` types.

## Phase 2: Cascading Deletions Implementation
*   **Step 1: UI Hook for Deletion**: Modify `handleDeleteLog` to detect linked financial records.
*   **Step 2: Confirmation UI**: Update delete dialogs to warn users about the cascading effect on reimbursements.
*   **Step 3: Sequential Cleanup**: Implement sequential deletion logic with error handling to prevent orphaned financial records.

## Phase 3: Log-to-Transaction Edit Synchronization
*   **Step 1: Data Extraction**: Update `handleSaveLog` to map log fields (Amount, Date, Location) to transaction properties.
*   **Step 2: Transaction Mutation**: Implement automatic updates to the linked `transaction` record when a log is saved.
*   **Step 3: Description Refresh**: Ensure the financial ledger description stays updated with the latest gas station/location info.

## Phase 4: Transaction-to-Log Edit Synchronization
*   **Step 1: Reverse Lookup**: Update `handleSaveExpense` to identify the linked `fuel_entry`.
*   **Step 2: Attribute Propagation**: Sync financial edits (Date, Amount) back to the fuel log's volume and price metadata.
*   **Step 3: Audit Re-trigger**: Ensure the mathematical integrity engine re-validates the log after an edit from the reimbursement side.

## Phase 5: UI Integrity Safeguards & Visual Cues
*   **Step 1: Link Visualization**: Add "Linked" indicators to table rows in both Logs and Reimbursement views.
*   **Step 2: Mismatch Detection**: Implement a UI warning for records where data (e.g., amount) has drifted out of sync.
*   **Step 3: Synchronization Status**: Add "Syncing..." state transitions to improve UX during cross-domain updates.

## Phase 6: Maintenance & Historical Repair
*   **Step 1: Integrity Audit Tool**: Build a diagnostic dashboard to scan for orphaned records and data drift.
*   **Step 2: Healing Actions**: Implement manual repair buttons (Heal Ledger, Repair Log, Force Sync) to restore integrity.
*   **Step 3: Orphan Detection**: Automated identification of records created before the sync layer was active.

## Phase 7: Advanced Predictive Auditing (Wait-and-See)
*   **Step 1: Observation State Schema**: Update `FuelEntry` metadata to support a new `auditStatus`: `['Clear', 'Observing', 'Flagged', 'Auto-Resolved']`.
*   **Step 2: The "Observation Window" Logic**: 
    *   Implement a "Time-to-Anchor" buffer. When a High Velocity alert (e.g., fill-up too soon) occurs, the system marks it as `Observing` rather than `Flagged`.
    *   Define the "Anchor Window": The observation remains active until the next "Full Tank" entry is recorded for that specific vehicle.
*   **Step 3: Mathematical Auto-Resolution Worker**:
    *   Create a logic loop that triggers upon every new "Full Tank" entry.
    *   Recalculate the *Cumulative Economy* (L/100km) between the *last* valid Anchor and the *new* Anchor, including all `Observing` entries in between.
    *   If the aggregate math (Total KM / Total Liters) fits within the 5% expansion buffer, automatically change the status of previous `Observing` entries to `Auto-Resolved`.
*   **Step 4: Predictive Baseline Engine**:
    *   Calculate rolling averages for each vehicle's fuel efficiency over the last 30 days.
    *   Replace hard-coded 5% thresholds with "Dynamic Standard Deviations" (e.g., flag if efficiency is >2 standard deviations from the vehicle's own historical mean).
*   **Step 5: Admin "Shadow" Inbox**:
    *   Update the Audit Dashboard to separate `Critical` flags from `Observing` entries.
    *   Provide admins with a "Wait-and-See" countdown, showing how many liters or kilometers are needed before the system can auto-resolve the current observation.

## Phase 8: Scalability, Performance & Final Hardening
*   **Step 1: Big Data Protection (Payload Stripping)**: Implement server-side middleware to strip heavy objects (like GPS route paths) from list views to prevent memory exhaustion and "Connection Closed" errors during large audits.
*   **Step 2: Pagination & Virtualization**: 
    *   Enforce strict server-side pagination across all audit feeds.
    *   Implement "Lazy Loading" in the Audit Dashboard to handle scenarios with 5,000+ historical fuel entries.
*   **Step 3: Stress Testing (The "Chaos" Seeder)**:
    *   Create a specialized internal tool to generate 1,000 synthetic fuel entries with random anomalies.
    *   Verify that the "Wait-and-See" logic resolves the correct percentage of anomalies without crashing the Hono server.
*   **Step 4: Real-time Ledger Locking**: Implement a "Finalized" flag that locks transactions once they have been reconciled, preventing accidental edits from desyncing the audited data.
*   **Step 5: Production Health Dashboard**: Add a system status indicator that monitors database health, KV store usage, and AI processing latency.
