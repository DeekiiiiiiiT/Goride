# Toll Dispute Refund Import & Reconciliation

## Problem Statement

When a driver disputes an underpaid toll with Uber and wins, Uber issues a "Support Adjustment" refund in the `payments_transaction` CSV. These rows have:
- **Empty Trip UUID** (no direct trip link)
- Description format: `Support Adjustment:  <support-case-UUID>`
- Refund amount in the `Paid to you:Trip balance:Refunds:Toll` column
- The support-case UUID is NOT a Trip UUID (cross-verified against all trip data)

Currently, line 1176 of `csvHelpers.ts` (`if (!tripId) return;`) silently skips these rows during import, making dispute refunds completely invisible to the system. The Claimable Loss page's "Underpaid" tab permanently shows the loss even after Uber has paid it back.

## Architecture Decision

- **New sub-tab** "Dispute Refunds" under the existing "Unmatched Tolls" tab in Toll Reconciliation
- **New KV prefix** `dispute-refund:` for storing imported Support Adjustment records
- **Smart matching**: Suggest links between refunds and underpaid tolls based on driver + amount + date proximity
- **Auto-resolution**: When a refund is linked to a toll that has a Claimable Loss claim, auto-resolve the claim as "Reimbursed"
- **Driver Detail card**: Enhance "Platform Toll Refunds" to show both trip-level refunds AND dispute refunds

## Import Paths Affected

1. **Platform Imports** (Data Center > Platform Imports > Uber CSV) - `csvHelpers.ts` parses `payments_transaction` rows; must stop skipping Support Adjustment rows
2. **Toll Usage** (Data Center > Toll Management > Toll Usage) - `BulkImportTollTransactionsModal.tsx` already has a `Refund` type concept; must ensure refund-type rows are properly stored and surfaced

---

## Phase 1: Data Model & KV Storage Design

**Goal**: Define the `DisputeRefund` data type and KV key structure so all subsequent phases have a stable foundation.

### Step 1.1: Define the DisputeRefund TypeScript interface
- File: `/types/data.ts`
- Add a new `DisputeRefund` interface with fields:
  - `id`: string (generated UUID, unique per refund)
  - `supportCaseId`: string (the UUID extracted from the Description field)
  - `amount`: number (the refund amount, always positive)
  - `date`: string (ISO timestamp from the `vs reporting` column)
  - `driverId`: string (Driver UUID from the CSV row)
  - `driverName`: string (constructed from first+last name columns)
  - `platform`: string (always "Uber" for now)
  - `source`: string (import path identifier: "platform_import" or "toll_usage")
  - `status`: "unmatched" | "matched" | "auto_resolved" (lifecycle state)
  - `matchedTollId`: string | null (the toll transaction ID it was linked to, if any)
  - `matchedClaimId`: string | null (the Claimable Loss claim ID it resolved, if any)
  - `importedAt`: string (ISO timestamp of when it was imported)
  - `resolvedAt`: string | null (ISO timestamp of when it was matched/resolved)
  - `resolvedBy`: string | null (admin who resolved it, or "auto" for auto-match)
  - `rawDescription`: string (the full original Description field for audit trail)

### Step 1.2: Define KV key structure
- Key format: `dispute-refund:<id>` (e.g., `dispute-refund:abc123-def456`)
- Value: JSON-serialized `DisputeRefund` object
- This follows the existing KV prefix pattern used throughout the app (e.g., `toll:`, `trip:`, `claim:`)

### Step 1.3: Add deduplication key
- To prevent duplicate imports of the same Support Adjustment, use a composite dedup key:
  - `dispute-refund-dedup:<supportCaseId>` → stores the `dispute-refund:<id>` key
  - On import, check if `dispute-refund-dedup:<supportCaseId>` exists before creating a new record
  - The `supportCaseId` is unique per Uber support case, so this guarantees no duplicates

### Step 1.4: Verify no type conflicts
- Search existing codebase for any type named `DisputeRefund` or KV prefix `dispute-refund:` to confirm no collisions
- Ensure the new type is exported from `/types/data.ts` so all files can import it

---

## Phase 2: CSV Parser — Extract Support Adjustments from `payments_transaction`

**Goal**: Modify `csvHelpers.ts` to detect and extract "Support Adjustment" rows instead of skipping them, and store them as `DisputeRefund` records.

### Step 2.1: Identify the extraction point
- File: `/utils/csvHelpers.ts`, line ~1174
- Currently: `if (file.type === 'uber_trip' || file.type === 'uber_payment')` block starts, then `if (!tripId) return;` skips empty Trip UUIDs
- Change: Before the `if (!tripId) return;` skip, add a check for Support Adjustment rows

### Step 2.2: Detect Support Adjustment rows
- Check: `const desc = String(row['Description'] || ''); const isSupportAdj = desc.startsWith('Support Adjustment:');`
- If `isSupportAdj && !tripId`:
  - Extract the support case UUID from the Description: `const supportCaseId = desc.replace('Support Adjustment:', '').trim();`
  - Extract the refund amount: `parseCurrency(row['Paid to you:Trip balance:Refunds:Toll'])`
  - Extract driver info: `row['Driver UUID']`, `row['Driver first name']` + `row['Driver last name']`
  - Extract date: `row['vs reporting']`
  - Build a `DisputeRefund` object and add it to a separate collection (NOT the tripMap)
  - Then `return;` (still skip adding to tripMap since there's no trip)

### Step 2.3: Add a `disputeRefunds` output array
- The `processUberCSV` (or equivalent) function currently returns trips via `tripMap`
- Add a parallel `disputeRefundsMap` (keyed by `supportCaseId` for dedup within a single import session)
- Return it alongside the trip data so the import handler can store them

### Step 2.4: Handle edge cases
- Support Adjustment with $0 amount → skip (no meaningful refund)
- Support Adjustment with non-toll refund (if the `Refunds:Toll` column is 0 but `Paid to you` is non-zero) → still capture but flag as "non-toll adjustment" for future use
- Multiple Support Adjustments in the same CSV → each gets its own record
- Malformed Description (no UUID after colon) → still import, set supportCaseId to "unknown-<transaction-UUID>"

### Step 2.5: Update the return type of the CSV processing function
- Ensure the function that calls the parser receives the `disputeRefunds` array
- Add a count to the import summary (e.g., "Found 3 dispute refunds")

---

## Phase 3: Server Endpoints — CRUD for Dispute Refunds

**Goal**: Add server routes for storing, retrieving, and updating dispute refund records.

### Step 3.1: POST `/dispute-refunds/import` — Bulk import
- Accepts: `{ refunds: DisputeRefund[] }`
- For each refund:
  - Check dedup key `dispute-refund-dedup:<supportCaseId>`
  - If exists → skip (already imported)
  - If new → generate ID, write `dispute-refund:<id>` and `dispute-refund-dedup:<supportCaseId>`
- Returns: `{ imported: number, skipped: number, total: number }`

### Step 3.2: GET `/dispute-refunds` — List all dispute refunds
- Query: `getByPrefix('dispute-refund:')` (exclude dedup keys)
- Filter by optional query params: `status`, `driverId`, `dateFrom`, `dateTo`
- Sort by date descending
- Returns: `{ data: DisputeRefund[] }`

### Step 3.3: PATCH `/dispute-refunds/:id/match` — Link refund to toll
- Accepts: `{ tollTransactionId: string, claimId?: string }`
- Updates the dispute refund record:
  - `status` → "matched"
  - `matchedTollId` → the toll transaction ID
  - `matchedClaimId` → the claim ID (if provided)
  - `resolvedAt` → now
  - `resolvedBy` → from auth header or "admin"
- If `claimId` is provided:
  - Also update the claim record to `status: 'Resolved'`, `resolutionReason: 'Reimbursed'`
  - This is the auto-resolution that closes the Claimable Loss lifecycle
- Returns: `{ data: DisputeRefund }`

### Step 3.4: PATCH `/dispute-refunds/:id/unmatch` — Unlink a matched refund
- Resets: `status` → "unmatched", clears `matchedTollId`, `matchedClaimId`, `resolvedAt`, `resolvedBy`
- Does NOT revert the claim (admin must manually re-open if needed)
- Returns: `{ data: DisputeRefund }`

### Step 3.5: GET `/dispute-refunds/suggestions/:id` — Smart match suggestions
- For a given dispute refund ID:
  - Load the refund record (get driver, amount, date)
  - Load all reconciled tolls for that driver (from `toll-reconciliation/reconciled`)
  - Filter to tolls with a negative variance (underpaid)
  - Score candidates by: amount similarity + date proximity
  - Return top 5 suggestions with confidence scores
- Returns: `{ suggestions: Array<{ tollId, tripId, tollAmount, uberRefund, variance, date, confidence }> }`

### Step 3.6: Add API client methods
- File: `/services/api.ts`
- Add methods: `importDisputeRefunds()`, `getDisputeRefunds()`, `matchDisputeRefund()`, `unmatchDisputeRefund()`, `getDisputeRefundSuggestions()`

---

## Phase 4: Platform Imports Integration — Surface Dispute Refunds in Import Flow

**Goal**: When an admin imports an Uber `payments_transaction` CSV via Platform Imports, the import summary should show how many dispute refunds were found, and automatically store them.

### Step 4.1: Update the import summary UI
- File: `/components/imports/ImportsPage.tsx`
- After CSV processing completes, the summary panel shows trip counts, payment sources, etc.
- Add a new line: "Dispute Refunds Found: X" with a teal/cyan badge
- If X > 0, show a brief explanation: "Support Adjustment refunds detected — these will appear in Toll Reconciliation > Dispute Refunds"

### Step 4.2: Wire the import handler to call the server
- In the import flow's "Confirm Import" handler:
  - After saving trips to KV, also call `POST /dispute-refunds/import` with the extracted refunds
  - Show a toast: "Imported X dispute refunds"
  - If some were skipped (duplicates): "Imported X dispute refunds (Y already existed)"

### Step 4.3: Update the import activity log
- The Data Center has an Activity Log section
- Add an entry when dispute refunds are imported: "Imported X dispute refunds from Uber payments_transaction CSV"

### Step 4.4: Handle the case where only dispute refunds exist (no trips)
- If a `payments_transaction` CSV contains ONLY Support Adjustment rows (all trips filtered out because they're already imported), the import should still succeed and store the refunds
- Currently, an import with 0 trips might show "No data found" — we need to check for this edge case

---

## Phase 5: Toll Usage Import Awareness

**Goal**: Ensure the Toll Usage import path (`BulkImportTollTransactionsModal.tsx`) properly handles refund-type rows and stores them in a way that's compatible with the dispute refund system.

### Step 5.1: Audit current refund handling
- The `ParsedTransaction` interface already has `type: 'Refund'` as a valid type
- Check: When a toll CSV has a refund row, does it get stored? Where? With what prefix?
- Currently, toll transactions are stored with prefix `toll-transaction:` regardless of type

### Step 5.2: Distinguish toll-company refunds from platform dispute refunds
- Toll company refunds (e.g., the toll authority reversed a charge) are different from Uber Support Adjustments
- The Toll Usage import handles toll company CSVs, NOT Uber's `payments_transaction` format
- Decision: Toll Usage refund rows stay as `toll-transaction:` records with `type: 'Refund'`
- They should NOT be stored as `dispute-refund:` records (different data source, different meaning)
- BUT: The "Dispute Refunds" sub-tab could optionally show toll-company refunds too, as a "related refunds" section

### Step 5.3: Ensure refund rows are not silently dropped
- In `BulkImportTollTransactionsModal.tsx`, verify that rows parsed as `type: 'Refund'` are included in the import (not filtered out)
- Check the amount handling: refund amounts should be stored as positive values with a clear "Refund" type marker
- Add a refund count to the import summary: "X charges, Y refunds imported"

### Step 5.4: Add import summary enhancement
- When the Toll Usage import detects refund rows, show them in the preview table with a green "Refund" badge
- The admin can see exactly which rows are charges vs. refunds before confirming

---

## Phase 6: "Dispute Refunds" Sub-tab UI in Toll Reconciliation

**Goal**: Build the new sub-tab inside the Unmatched Tolls tab that displays imported dispute refunds and lets the admin match them to underpaid tolls.

### Step 6.1: Add the sub-tab to UnmatchedTollsList
- File: `/components/toll-tags/reconciliation/UnmatchedTollsList.tsx`
- Update the `UnmatchedSubTab` type: add `'dispute-refunds'` to the union
- Add a 5th sub-tab button: "Dispute Refunds" with a count badge
- The sub-tab icon could be a shield or checkmark (representing recovered money)

### Step 6.2: Fetch dispute refunds in useTollReconciliation hook
- File: `/hooks/useTollReconciliation.ts`
- Add `disputeRefunds` to the state
- Fetch from `GET /dispute-refunds?status=unmatched` during data load
- Expose `disputeRefunds` in the hook's return value

### Step 6.3: Pass dispute refunds to UnmatchedTollsList
- File: `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx`
- Pass `disputeRefunds` as a new prop to `UnmatchedTollsList`
- Add handler functions: `handleMatchRefund()`, `handleUnmatchRefund()`

### Step 6.4: Create DisputeRefundsList component
- New file: `/components/toll-tags/reconciliation/DisputeRefundsList.tsx`
- Table columns:
  - Date (formatted in fleet timezone)
  - Driver Name
  - Refund Amount
  - Support Case ID (truncated with copy button)
  - Status (Unmatched / Matched)
  - Actions (Match / View Suggestions)
- Empty state: "No dispute refunds imported yet. Import an Uber payments_transaction CSV to detect Support Adjustment refunds."

### Step 6.5: Smart match suggestion UI
- When admin clicks "Match" on a refund row, show a popover/panel with suggested toll matches
- Each suggestion shows: Toll date, amount, variance, Uber refund, trip route, confidence score
- Admin clicks "Link" to confirm the match
- After linking: row moves from "Unmatched" to "Matched" with green checkmark
- Also provide a "Manual Search" option if suggestions don't match

### Step 6.6: Update the "Recovered" summary card
- File: `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx`
- The "Recovered" card (green, line ~364) currently shows `recoveredAmount` from reconciled tolls
- Add matched dispute refund amounts to this total
- Add a sub-line: "Including $X from dispute refunds"

---

## Phase 7: Linking Logic & Claimable Loss Auto-Resolution

**Goal**: When a dispute refund is linked to an underpaid toll, automatically resolve any associated Claimable Loss claim.

### Step 7.1: Implement the match handler in ReconciliationDashboard
- When `handleMatchRefund(refundId, tollTransactionId)` is called:
  1. Look up the toll transaction to find its `tripId`
  2. Look up any Claimable Loss claim with `transactionId === tollTransactionId`
  3. Call `PATCH /dispute-refunds/:id/match` with `{ tollTransactionId, claimId }`
  4. The server handles both updates atomically

### Step 7.2: Server-side auto-resolution logic
- In the `PATCH /dispute-refunds/:id/match` endpoint:
  - If `claimId` is provided:
    - Load the claim from `claim:<claimId>`
    - Update: `status: 'Resolved'`, `resolutionReason: 'Reimbursed'`, `disputeRefundId: refundId`
    - Write back to KV
  - This ensures Claimable Loss "Reimbursement Pending" items auto-close when proof arrives

### Step 7.3: Handle partial amount matches
- The refund amount ($10) might not exactly match the toll variance (e.g., variance was $15)
- Decision: Still allow the match, but flag: "Refund covers $10 of $15 variance"
- The remaining $5 stays as an open loss in Claimable Loss
- UI shows: "Partial recovery — $10 of $15 recovered via dispute"

### Step 7.4: Handle refunds with no matching toll
- Some refunds may not correspond to any imported toll (e.g., from a period not yet imported)
- These stay as "Unmatched" in the Dispute Refunds sub-tab
- Admin can manually note: "No corresponding toll found" (write-off or hold for later)

### Step 7.5: Claimable Loss "Refund Detected" badge
- File: `/pages/ClaimableLoss.tsx` and `/components/claimable-loss/PendingReimbursementList.tsx`
- When a pending claim has a matching dispute refund (same toll transaction ID):
  - Show a green badge: "Uber Refund Detected"
  - Change the "Mark as Reimbursed" button to "Confirm & Resolve (Refund Verified)"
  - This gives the admin confidence that the refund actually happened

### Step 7.6: Prevent double-counting
- The `PATCH /dispute-refunds/:id/match` endpoint must check:
  - Is this refund already matched to another toll? → Error
  - Is this toll already matched to another refund? → Error
  - Is the claim already resolved? → Skip claim update (but still link the refund)
- The "Recovered" card must not count both the trip-level refund AND the dispute refund for the same toll

---

## Phase 8: Driver Detail "Platform Toll Refunds" Card Enhancement

**Goal**: Update the driver detail page's toll card to show a complete picture of toll recovery including dispute refunds.

### Step 8.1: Analyze current card data source
- Currently: `resolvedFinancials.totalTolls` comes from `ledgerOverview.period.tolls`
- This represents trip-level toll charges (what Uber auto-refunds in the fare)
- It does NOT include Support Adjustment refunds
- The card title is "Platform Toll Refunds" with subtext "From trip-level toll charges"

### Step 8.2: Add dispute refund totals to the server overview endpoint
- The ledger overview endpoint (`GET /ledger/driver-overview`) should include a new field: `disputeRefunds`
- Calculate: Sum of all `dispute-refund:` records where `driverId` matches and `status === 'matched'` and falls within the period
- Return: `{ period: { ...existing, disputeRefunds: number }, lifetime: { ...existing, disputeRefunds: number } }`

### Step 8.3: Update the card UI
- File: `/components/drivers/DriverDetail.tsx`, around line 2743
- Change the card to show TWO lines:
  - Line 1: "Trip Toll Refunds: $X" (existing — what Uber pays automatically)
  - Line 2: "Dispute Refunds: $Y" (new — Support Adjustments won from disputes)
  - Total header: "Total Toll Recovery: $(X+Y)"
- Update subtext from "From trip-level toll charges" to "Trip refunds + dispute recoveries"
- If dispute refunds are $0, just show the current single-line view (no visual change)

### Step 8.4: Update the breakdown section
- Currently shows per-platform breakdown (Uber/InDrive)
- Add a new breakdown entry: "Dispute Recoveries" with a distinct color (e.g., teal)
- This only appears when dispute refund total > 0

### Step 8.5: Tooltip enhancement
- Add a tooltip explaining the difference:
  - "Trip Toll Refunds: Tolls automatically reimbursed by the platform in trip fares"
  - "Dispute Refunds: Additional refunds won by disputing underpaid tolls with Uber Support"

### Step 8.6: Edge case — Driver without any dispute refunds
- Card should render identically to current behavior (no visual regression)
- Only show the enhanced view when disputeRefunds > 0

---

## Phase 9: Testing & Validation

**Goal**: Verify the entire flow end-to-end and ensure no regressions.

### Step 9.1: Import path test
- Upload a `payments_transaction` CSV containing Support Adjustment rows via Platform Imports
- Verify: Refunds are extracted, stored in KV, import summary shows count
- Verify: Regular trip rows still import correctly (no regression)
- Verify: Duplicate import of same CSV doesn't create duplicate refund records

### Step 9.2: Toll Reconciliation test
- Open Toll Reconciliation > Unmatched Tolls > Dispute Refunds sub-tab
- Verify: Imported refunds appear with correct data
- Click "Match" on a refund > verify suggestions appear
- Link a refund to an underpaid toll > verify status changes to "Matched"
- Verify: "Recovered" card updates to include the refund amount

### Step 9.3: Claimable Loss test
- Create a claim for an underpaid toll (Reimbursement Pending status)
- Import a Support Adjustment refund for that same toll
- Match the refund to the toll in Toll Reconciliation
- Verify: The claim in Claimable Loss auto-resolves to "Reimbursed"
- Verify: History tab shows the resolution

### Step 9.4: Driver Detail test
- Open a driver's detail page
- Verify: "Platform Toll Refunds" card shows updated totals including dispute refunds
- Verify: Breakdown shows the new "Dispute Recoveries" line
- Verify: Driver with no dispute refunds shows unchanged card

### Step 9.5: Regression checks
- Verify: All existing Toll Reconciliation functionality works (Unmatched, Unlinked Refunds, Matched History)
- Verify: All existing Claimable Loss tabs work (Underpaid, Awaiting Driver, Reimbursement Pending, Dispute Lost, History)
- Verify: Platform Imports still import all Uber CSV types correctly
- Verify: Toll Usage import still works for toll company CSVs

---

## Key Files Affected (Reference)

| File | Changes |
|------|---------|
| `/types/data.ts` | Add `DisputeRefund` interface |
| `/utils/csvHelpers.ts` | Parse Support Adjustment rows (line ~1174) |
| `/supabase/functions/server/index.tsx` | New dispute refund endpoints |
| `/services/api.ts` | New API client methods |
| `/hooks/useTollReconciliation.ts` | Fetch dispute refunds |
| `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx` | Pass dispute refunds, update Recovered card |
| `/components/toll-tags/reconciliation/UnmatchedTollsList.tsx` | Add 5th sub-tab |
| `/components/toll-tags/reconciliation/DisputeRefundsList.tsx` | **NEW** — Sub-tab content |
| `/components/imports/ImportsPage.tsx` | Import summary shows dispute refund count |
| `/components/vehicles/BulkImportTollTransactionsModal.tsx` | Refund row handling audit |
| `/pages/ClaimableLoss.tsx` | "Refund Detected" badge logic |
| `/components/claimable-loss/PendingReimbursementList.tsx` | "Refund Detected" badge UI |
| `/components/drivers/DriverDetail.tsx` | Enhanced toll card |

## Execution Rules

- Each phase is implemented one at a time
- Admin confirms completion before moving to next phase
- Zero breakage tolerance — all changes must be backward-compatible
- DriverDetail.tsx and VehicleDetail.tsx: only single-line `old_str` edits (known encoding issue)
