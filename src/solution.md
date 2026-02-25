# Fix: Driver Fuel Expense `paymentSource` Missing from Metadata

## Problem Summary

`constructTransactionPayload()` in `DriverExpenses.tsx` never sets `metadata.paymentSource`. The server (line ~2340 in `index.tsx`) defaults missing `paymentSource` to `'driver_cash'`, so **every driver-submitted fuel entry creates a wallet credit** (`fuel-credit-{id}`) as if the driver paid from personal funds — even when they used rideshare fare cash. This inflates "Net Reimbursements" and misrepresents accounting.

## Agreed Constraint

**No changes to the driver's workflow.** The driver continues to enter price and cash spent only. The fix is purely internal data mapping.

---

## Phase 1: Add `paymentSource` to `constructTransactionPayload()` (DriverExpenses.tsx)

### Why
This is the root cause. The metadata object built inside `constructTransactionPayload()` has no `paymentSource` field, so the server always falls back to `'driver_cash'`.

### Steps

**Step 1.1 — Read and confirm the current metadata block**
- Open `/components/driver-portal/DriverExpenses.tsx` lines 266-279.
- Confirm the `metadata` object has these fields: `plaza`, `lane`, `vehicleClass`, `collector`, `fuelVolume`, `pricePerLiter`, `isFullTank`, `odometerMethod`, `odometerProofUrl`, `odometerManualReason`, `locationMetadata`, `parentCompany`.
- Confirm there is **no** `paymentSource` field.

**Step 1.2 — Define the mapping logic**
- The mapping converts `fuelEntry.paymentMethod` (driver-side internal value) to `paymentSource` (server-side accounting value):
  - `'personal_cash'` → `'driver_cash'` (driver paid out of pocket — wallet credit IS created)
  - `'rideshare_cash'` → `'rideshare_cash'` (driver used fare cash — wallet credit is NOT created)
  - `'gas_card'` → `'company_card'` (company card — wallet credit is NOT created)
  - fallback (non-fuel or undefined) → `undefined` (don't set the field; server default will apply)

**Step 1.3 — Add one line to the metadata object**
- Inside the `metadata` object (line ~266-279), add after the `parentCompany` line:
  ```
  paymentSource: isFuel ? (isGasCard ? 'company_card' : (fuelEntry.paymentMethod === 'rideshare_cash' ? 'rideshare_cash' : 'driver_cash')) : undefined,
  ```
- This uses the existing `isFuel` and `isGasCard` variables that are already defined at line 237-238.

**Step 1.4 — Verify no other changes needed**
- Confirm `constructTransactionPayload()` return value spreads `metadata` into the transaction correctly (line 286: `metadata: metadata`).
- Confirm the server reads `tx.metadata?.paymentSource` at line 2340 — this is already in place.

### Risk Assessment
- **Low risk.** Single line addition. No UI changes. No workflow changes.
- The `isFuel` and `isGasCard` variables are already computed and used in the same function.
- If `fuelEntry.paymentMethod` is undefined (shouldn't happen but defensive), it falls through to `'driver_cash'` which matches legacy behavior.

---

## Phase 2: Server-Side Verification (Read-Only — No Code Changes)

### Why
We need to confirm the server already handles `'rideshare_cash'` correctly at line ~2340-2347, so that Phase 1's change is sufficient.

### Steps

**Step 2.1 — Verify the approve handler (line ~2340-2347)**
- Confirm this logic exists:
  ```
  const paymentSource = tx.metadata?.paymentSource || 'driver_cash';
  const isDriverCash = paymentSource === 'driver_cash';
  if (!isDriverCash) {
      console.log(`[FuelCredit] Skipping wallet credit...`);
  }
  if (...tx.status === 'Approved' && isDriverCash) {
      // creates fuel-credit-{id}
  }
  ```
- Confirm `'rideshare_cash'` will correctly be treated as NOT `'driver_cash'`, so no wallet credit is created.

**Step 2.2 — Verify the backfill handler (line ~2504-2509)**
- Confirm the existing backfill endpoint also checks `paymentSource` and skips non-`driver_cash` entries.

**Step 2.3 — Verify the reject/void handler (line ~2459-2462)**
- Confirm that when a transaction is rejected, the `fuel-credit-{id}` is cleaned up regardless of payment source.

### Risk Assessment
- **Zero risk.** Read-only verification. No code changes.

---

## Phase 3: Build Backfill Endpoint on Server (`index.tsx`)

### Why
Existing approved transactions submitted before Phase 1 have no `metadata.paymentSource`. The server defaulted them to `'driver_cash'` and created wallet credits. We need an endpoint that:
1. Finds all approved fuel transactions where `paymentMethod === 'RideShare Cash'` but `metadata.paymentSource` is missing.
2. Sets `metadata.paymentSource = 'rideshare_cash'` on each.
3. Deletes the orphaned `fuel-credit-{id}` wallet credit for each.

### Steps

**Step 3.1 — Design the endpoint**
- Route: `POST /make-server-37f42386/backfill-payment-source`
- No request body needed (it scans all transactions).
- Returns a JSON summary: `{ fixed: number, creditsDeleted: number, errors: string[] }`.

**Step 3.2 — Implement the scan logic**
- Use `kv.getByPrefix('transaction:')` to get all transactions.
- Filter to find entries where ALL of these are true:
  - `category === 'Fuel'` or `category === 'Fuel Reimbursement'`
  - `status === 'Approved'`
  - `paymentMethod === 'RideShare Cash'`
  - `metadata?.paymentSource` is missing or undefined
- For each matching entry:
  1. Set `metadata.paymentSource = 'rideshare_cash'`
  2. Save the updated transaction back via `kv.set()`
  3. Check if `fuel-credit-{id}` exists via `kv.get()`
  4. If it exists, delete it via `kv.del()` and increment `creditsDeleted`
  5. Increment `fixed`
- Wrap each entry in try/catch; log errors and add to `errors[]` array.

**Step 3.3 — Add logging**
- Log start: `[Backfill] Starting paymentSource backfill scan...`
- Log each fix: `[Backfill] Fixed transaction {id}: set paymentSource=rideshare_cash, credit deleted={true/false}`
- Log completion: `[Backfill] Complete. Fixed: {n}, Credits deleted: {n}, Errors: {n}`

**Step 3.4 — Add the route to the server**
- Add the route after the existing backfill endpoint (around line ~2530).
- Ensure CORS headers are applied.

### Risk Assessment
- **Medium risk.** Modifies existing data. Mitigated by:
  - Only targets transactions with `paymentMethod === 'RideShare Cash'` AND missing `paymentSource` — very specific filter.
  - Each change is logged individually.
  - Returns a full summary so we can verify counts.
  - Can be run multiple times safely (idempotent — second run finds nothing to fix).

---

## Phase 4: Trigger the Backfill from the Admin UI

### Why
We need a way to run the backfill endpoint. Rather than building a whole new UI, we'll add a simple button to an existing admin area.

### Steps

**Step 4.1 — Decide placement**
- Add a "Fix RideShare Cash Entries" button to the existing `SystemHardeningPanel.tsx` or `DataResetModal.tsx` admin component — whichever is more appropriate.
- Alternatively, we can just call it from the browser console or a simple fetch call. Confirm with user which approach they prefer.

**Step 4.2 — Add the API call to `api.ts`**
- Add a new function:
  ```ts
  async backfillPaymentSource(): Promise<{ fixed: number, creditsDeleted: number, errors: string[] }>
  ```
- Calls `POST /make-server-37f42386/backfill-payment-source`.

**Step 4.3 — Add the UI trigger**
- Button labeled "Fix RideShare Cash Credits"
- On click: calls the API, shows a toast with the result summary.
- Disabled while running, shows a spinner.

**Step 4.4 — Test the flow**
- Click the button.
- Verify the response shows the correct count of fixed entries and deleted credits.
- Verify the "Net Reimbursements" figure decreases by the expected amount.

### Risk Assessment
- **Low risk.** The button just triggers the endpoint built in Phase 3.

---

## Phase 5: Post-Fix Verification and Cleanup — COMPLETED (2026-02-24)

### Results
- Backfill ran successfully: **112 fuel transactions fixed**, **100 orphaned wallet credits deleted** (224 total scanned).
- All 112 entries had `paymentMethod` corrected from `"Cash"` to `"RideShare Cash"` and `metadata.paymentSource` set to `'rideshare_cash'`.
- Net Reimbursements dropped to **$3,000.00** (correct — only legitimate driver_cash entries).

### Cleanup performed
- Removed diagnostic code from the backfill endpoint (server).
- Removed `diagnostics` field from the backfill response.
- Removed "Fix Rideshare Credits" button, related state, and types from `FuelWalletView.tsx`.
- Removed `onFixRideshare` prop wiring from `DriverDetail.tsx`.
- Removed `backfillRidesharePaymentSource()` API method from `api.ts`.
- The backfill endpoint itself is retained on the server (idempotent, safe, re-runnable if needed).

---

## Execution Order

| Phase | Description | Changes Code? | Wait for Approval? |
|-------|------------|---------------|---------------------|
| 1 | Add `paymentSource` to metadata in `constructTransactionPayload()` | YES — 1 line in `DriverExpenses.tsx` | YES |
| 2 | Verify server-side logic handles new values correctly | NO — read only | YES |
| 3 | Build backfill endpoint on server | YES — new route in `index.tsx` | YES |
| 4 | Add API method + UI trigger for backfill | YES — `api.ts` + admin component | YES |
| 5 | Run backfill, verify results, cleanup | NO — verification | YES |
