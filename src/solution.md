# Toll Ledger Architecture Redesign

## Overview

Migrate from the current fragmented toll system (filtering `transaction:*` by category) to a dedicated `toll_ledger:*` storage system that serves as the single source of truth for all toll data.

---

## Phase 1: Define Schema and Create Types

**Goal:** Establish the canonical toll ledger schema and TypeScript types before writing any storage or API code.

### Step 1.1: Create TollLedgerRecord type
- Create new file `src/types/tollLedgerRecord.ts`
- Define the complete `TollLedgerRecord` interface with all fields:
  - Identity: `id`, `createdAt`, `updatedAt`
  - Vehicle: `vehicleId`, `vehiclePlate`
  - Driver: `driverId`, `driverName`
  - Tag: `tollTagId`, `tagNumber`
  - Location: `plaza`, `highway`, `location`
  - Transaction: `date`, `time`, `type`, `amount`, `paymentMethod`
  - Status: `status`, `resolution`, `isReconciled`
  - Matching: `tripId`, `matchConfidence`, `matchedAt`, `matchedBy`
  - Import: `batchId`, `batchName`, `importedAt`, `sourceFile`
  - Evidence: `receiptUrl`, `description`, `notes`
  - Audit: `auditTrail` array with `action`, `timestamp`, `userId`, `changes`
  - Flexible: `metadata` object

### Step 1.2: Define enums and constants
- `TollType`: `usage`, `top_up`, `refund`, `adjustment`, `balance_transfer`
- `TollPaymentMethod`: `tag_balance`, `cash`, `card`, `fleet_account`
- `TollStatus`: `pending`, `approved`, `rejected`, `reconciled`, `resolved`, `disputed`
- `TollResolution`: `personal`, `business`, `write_off`, `refunded`
- `TollAuditAction`: `created`, `updated`, `reconciled`, `unreconciled`, `approved`, `rejected`, `resolved`, `imported`

### Step 1.3: Create conversion utilities
- `transactionToTollLedger(tx: FinancialTransaction): TollLedgerRecord` - Convert existing transactions
- `tollLedgerToTransaction(toll: TollLedgerRecord): FinancialTransaction` - For backward compatibility
- `validateTollLedgerRecord(record: unknown): TollLedgerRecord` - Runtime validation

### Step 1.4: Update type exports
- Add exports to `src/types/index.ts`
- Ensure no circular dependencies

**Verification:** Run `npm run build` to confirm types compile without errors.

---

## Phase 2: Create Server-Side Storage Layer

**Goal:** Implement the KV storage functions for `toll_ledger:*` on the server without changing any existing endpoints.

### Step 2.1: Create toll ledger KV helpers
- Add to `toll_controller.tsx` or create `toll_ledger_service.ts`:
  - `saveTollLedgerEntry(entry: TollLedgerRecord): Promise<void>`
  - `getTollLedgerEntry(id: string): Promise<TollLedgerRecord | null>`
  - `updateTollLedgerEntry(id: string, updates: Partial<TollLedgerRecord>): Promise<TollLedgerRecord>`
  - `deleteTollLedgerEntry(id: string): Promise<void>`
  - `getAllTollLedgerEntries(): Promise<TollLedgerRecord[]>`
  - `queryTollLedgerEntries(filters: TollLedgerFilters): Promise<TollLedgerRecord[]>`

### Step 2.2: Implement audit trail helper
- `appendAuditTrail(entry: TollLedgerRecord, action: TollAuditAction, userId: string, changes?: object): TollLedgerRecord`
- Automatically adds timestamp and formats changes

### Step 2.3: Implement query/filter logic
- `TollLedgerFilters` interface: `vehicleId`, `driverId`, `dateRange`, `status`, `isReconciled`, `type`, `batchId`
- Server-side filtering function that works with KV prefix scan

### Step 2.4: Add validation on save
- Validate required fields before KV write
- Normalize amounts (ensure consistent sign convention)
- Sanitize string fields

**Verification:** Add temporary test endpoint `GET /toll-ledger/test` that creates, reads, updates, and deletes a test entry.

---

## Phase 3: Implement Dual-Write for New Data ✅ COMPLETED

**Goal:** New toll data writes to both `transaction:*` (existing) and `toll_ledger:*` (new) without breaking any existing functionality.

### Step 3.1: Update manual toll entry (LogTollUsageModal)
- After saving to `transaction:*`, also call `saveTollLedgerEntry()`
- Convert transaction data to toll ledger format
- Handle errors gracefully (log but don't fail if toll ledger write fails)

### Step 3.2: Update CSV bulk import (BulkImportTollTransactionsModal)
- For each imported row, write to both stores
- Include batch metadata in toll ledger entry
- Track import statistics for both stores

### Step 3.3: Update reconciliation operations
- `POST /reconcile`: Update both `transaction:*` and `toll_ledger:*`
- `POST /unreconcile`: Update both stores
- `POST /approve`: Update both stores
- `POST /reject`: Update both stores
- `POST /resolve`: Update both stores

### Step 3.4: Update bulk reconcile
- Ensure `POST /bulk-reconcile` writes to both stores
- Use `kv.mset` for toll ledger entries too

### Step 3.5: Add sync verification
- Create helper to compare `transaction:*` and `toll_ledger:*` for a given toll ID
- Log discrepancies for debugging

**Verification:** 
1. Create a toll via manual entry, verify it exists in both stores
2. Import a CSV batch, verify all entries exist in both stores
3. Reconcile a toll, verify both stores updated

---

## Phase 4: Backfill Historical Data ✅ COMPLETED

**Goal:** Migrate all existing toll transactions from `transaction:*` to `toll_ledger:*`.

### Step 4.0: Create backup before migration (REQUIRED)
- Create `GET /toll-ledger/backup` endpoint
- Export ALL toll transactions from `transaction:*` to JSON format
- Include full transaction objects with all metadata
- Return downloadable JSON file with timestamp in filename (e.g., `toll_backup_2026-03-20.json`)
- Log backup creation with count and date range
- **DO NOT proceed to Step 4.1 until backup is downloaded and verified**

### Step 4.1: Create backfill endpoint
- `POST /toll-ledger/backfill` (admin only)
- Parameters: `dryRun: boolean`, `batchSize: number`, `startDate?: string`

### Step 4.2: Implement backfill logic
- Load all `transaction:*` entries where `isTollCategory(category)` is true
- For each transaction:
  - Check if `toll_ledger:{id}` already exists (skip if yes)
  - Convert using `transactionToTollLedger()`
  - Add audit entry: `action: 'imported'`, `source: 'backfill'`
  - Save to `toll_ledger:*`
- Track progress: processed, created, skipped, errors

### Step 4.3: Add backfill verification
- `GET /toll-ledger/backfill/status`
- Compare counts: total tolls in `transaction:*` vs `toll_ledger:*`
- List any missing entries

### Step 4.4: Handle edge cases
- Transactions with missing required fields (set defaults)
- Duplicate detection (same date/amount/vehicle)
- Invalid data (log and skip with error report)

### Step 4.5: Create backfill UI (optional)
- Add to Database Management section
- Show progress, stats, errors
- Allow re-running for failed entries

**Verification:**
1. Run backfill in dry-run mode, review report
2. Run actual backfill on staging/test data
3. Verify counts match between stores
4. Spot-check 10 random entries for data integrity

---

## Phase 5: Switch Readers to Toll Ledger ✅ COMPLETED

**Goal:** Update all toll data consumers to read from `toll_ledger:*` instead of `transaction:*`.

### Step 5.1: Update `/toll-logs` endpoint
- Change `loadAllTollTransactions()` to `getAllTollLedgerEntries()`
- Update response mapping to match existing `TollLogEntry` shape
- Ensure all existing filters still work

### Step 5.2: Update `/unreconciled` endpoint
- Query `toll_ledger:*` where `isReconciled = false`
- Maintain existing response shape for UI compatibility
- Update auto-reconcile logic to work with toll ledger

### Step 5.3: Update `/reconciled` endpoint
- Query `toll_ledger:*` where `isReconciled = true`
- Include linked trip data

### Step 5.4: Update `/export` endpoint
- Read from `toll_ledger:*`
- Map to `TollLedgerEntry` format
- Verify CSV export still works

### Step 5.5: Update `/summary` endpoint
- Calculate aggregates from `toll_ledger:*`

### Step 5.6: Update client hooks
- `useTollLogs`: Verify works with new response (should be unchanged)
- `useTollReconciliation`: Verify works with new response
- No changes should be needed if response shapes match

### Step 5.7: Add feature flag (optional)
- `USE_TOLL_LEDGER=true` environment variable
- Allows quick rollback to `transaction:*` if issues arise

**Verification:**
1. Toll Logs page shows same data as before
2. Toll Reconciliation shows same unreconciled/reconciled data
3. Toll Analytics charts/stats match
4. Export CSV contains same columns and data
5. All reconciliation operations still work

---

## Phase 6: Cleanup and Finalization ✅ COMPLETED

**Goal:** Remove dual-write, stop writing tolls to `transaction:*`, and clean up legacy code.

### Step 6.1: Remove dual-write logic
- Update manual entry to write only to `toll_ledger:*`
- Update CSV import to write only to `toll_ledger:*`
- Update reconciliation operations to write only to `toll_ledger:*`

### Step 6.2: Deprecate toll category filtering
- Remove `isTollCategory()` usage from toll endpoints
- Mark function as deprecated with JSDoc comment

### Step 6.3: Update documentation
- Document new `toll_ledger:*` schema
- Document API changes
- Update any developer guides

### Step 6.4: Archive toll data from transaction store (optional)
- Create backup of toll transactions before deletion
- Remove toll entries from `transaction:*` to reduce store size
- Add migration notes to changelog

### Step 6.5: Remove legacy code
- Remove old `loadAllTollTransactions()` function
- Remove `generateTransactionLedgerEntry()` for toll types
- Clean up unused imports and types

### Step 6.6: Final verification
- Full regression test of all toll features
- Performance comparison (should be faster)
- Monitor for any errors in production

**Verification:**
1. All toll features work with toll ledger only
2. No toll data in `transaction:*` for new entries
3. Build passes with no unused code warnings
4. No regressions in toll functionality

---

## Rollback Plan

If issues arise at any phase:

1. **Phase 3-4 (Dual-write/Backfill):** Simply stop using toll ledger, existing system unaffected
2. **Phase 5 (Readers):** Re-enable `USE_TOLL_LEDGER=false` to revert to transaction store
3. **Phase 6 (Cleanup):** Cannot easily rollback; ensure thorough testing before this phase

---

## Success Metrics

- [x] Single `toll_ledger:*` store contains all toll data
- [x] Toll Logs, Reconciliation, Analytics all read from same source
- [x] No data discrepancies between views
- [x] Audit trail captures all changes
- [x] Query performance improved (no category filtering)
- [x] Code is cleaner and easier to maintain
