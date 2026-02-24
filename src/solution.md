# Fleet Integrity — Manual Fuel Entry Approve Flow Fix Plan

## Context
A full audit of the manual fuel entry flow (SubmitExpenseModal → POST /transactions → Approve handler → FuelLogTable display) revealed **13 bugs** where the Approve handler creates fuel entries with wrong/missing fields compared to what the rest of the system expects. The auto-approve path (for AI-verified entries) is the "gold standard" — the Approve handler needs to match its patterns.

### Key File Locations
- **SubmitExpenseModal.tsx**: `/components/fuel/SubmitExpenseModal.tsx` — the manual entry form
- **Server index.tsx**: `/supabase/functions/server/index.tsx`
  - Initial POST handler: line ~1663
  - Auto-approve fuel_entry creation: line ~1921–1997
  - Approve handler: line ~2187–2301
  - Wallet credit creation: line ~2254–2294
- **FuelManagement.tsx**: `/pages/FuelManagement.tsx` — `handleSaveExpense` (line ~395), edit sync (line ~414–430)
- **FuelLogTable.tsx**: `/components/fuel/FuelLogTable.tsx` — reads `entry.vendor` (line 453), `entry.location` (line 515–516), `entry.matchedStationId` (line 571), `entry.metadata?.locationStatus` (line 435)
- **fuel_logic.ts**: `/supabase/functions/server/fuel_logic.ts` — `calculateConfidenceScore()` (line 271)

### Form Field → Server Field Mapping (What SubmitExpenseModal sends)
| Form sends as          | Value example                  | Used by          |
|------------------------|-------------------------------|------------------|
| `vendor`               | "Texaco"                      | Station brand name |
| `matchedStationId`     | UUID of verified station      | Top-level + metadata |
| `metadata.stationLocation` | "123 Main St, Kingston"   | Station address  |
| `metadata.pricePerLiter` | 220.50                      | Fuel price       |
| `metadata.totalCost`   | 1000 (always the real $)      | Actual dollar amount |
| `metadata.paymentSource` | "driver_cash" / "company_card" / "petty_cash" | Payment type |
| `amount`               | $1000 if driver_cash, $0 otherwise | Top-level amount |
| `quantity`             | Liters (e.g., 5.81)           | Volume           |
| `description`          | Notes or "Fuel Expense Log"   | User notes       |

---

## Phase 1: Vendor & Location Field Alignment in Approve Handler
**Goal:** Fix the fuel entry's station name, vendor, and address so they display correctly in FuelLogTable after approval.
**File:** `/supabase/functions/server/index.tsx` — Approve handler (line ~2187)
**Covers:** Fix 1, Fix 2, Fix 3

### Step 1.1 — Fix `location` field (Fix 1)
**Current code (line 2218):**
```js
location: tx.merchant || tx.description || 'Reimbursement',
```
**Problem:** The form saves the station name as `tx.vendor`, not `tx.merchant`. Since `merchant` doesn't exist, it falls through to `tx.description` which is "Fuel Expense Log" (the default notes). FuelLogTable shows this as the address line under the vendor name.
**Fix:** Change to:
```js
location: tx.vendor || tx.merchant || tx.description || 'Reimbursement',
```
**Why `vendor` first:** This matches the auto-approve path (line 1943) which uses `transaction.vendor` as the second fallback after smart-matched station name.

### Step 1.2 — Add `vendor` field to fuel entry (Fix 2)
**Current code (lines 2210–2235):** The fuel entry object has no `vendor` field at all.
**Problem:** FuelLogTable line 453 reads `entry.vendor` first to display the station brand name. Without it, falls to `entry.metadata?.stationName` (never set by any code path), then shows "Unknown Vendor."
**Fix:** Add `vendor` to the fuel entry object, right after `location`:
```js
vendor: tx.vendor || tx.merchant || tx.description || 'Reimbursement',
```
**Why:** Matches the auto-approve path (line 1955) which explicitly sets `vendor: resolvedVendor`.

### Step 1.3 — Fix `stationAddress` field (Fix 3)
**Current code (line 2219):**
```js
stationAddress: tx.location || '',
```
**Problem:** The form puts the address in `tx.metadata.stationLocation`, not `tx.location`. So `stationAddress` is always empty.
**Fix:** Change to:
```js
stationAddress: tx.metadata?.stationLocation || tx.location || '',
```
**Why:** Matches the auto-approve path (line 1957) which reads `transaction.metadata?.stationLocation`.

### Step 1.4 — Verify FuelLogTable reads these fields correctly
**No code change needed.** Just confirm:
- Line 453: `entry.vendor || entry.metadata?.stationName || "Unknown Vendor"` → will now find `vendor` ✓
- Line 515–516: `entry.location || "No GPS metadata"` → will now find resolved vendor name ✓

### Step 1.5 — Verify FuelReimbursementTable resolveDescription() still works
**No code change needed.** `resolveDescription()` at line 170 already checks `tx.vendor` before `tx.merchant`, so it's already correct for the transaction display in the Reimbursement Queue.

---

## Phase 2: matchedStationId & locationStatus Propagation
**Goal:** Ensure that when an admin picks a verified station in the manual form, the fuel entry correctly reflects "verified" status with the blue shield badge in FuelLogTable.
**Files:** `/supabase/functions/server/index.tsx` — Initial POST handler + Approve handler
**Covers:** Fix 4, Fix 5

### Step 2.1 — Add `matchedStationId` to top level of fuel entry in Approve handler (Fix 4)
**Current code (lines 2210–2235):** No `matchedStationId` at the top level. It only flows through `...tx.metadata` spread into the metadata sub-object.
**Problem:** FuelLogTable line 571 reads `entry.matchedStationId` (top level) for the confidence dot. The auto-approve path (line 1966) explicitly sets it at the top level.
**Fix:** Add to the fuel entry object:
```js
matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
```
**Placement:** After `transactionId: tx.id,` (line 2223), before `receiptUrl`.

### Step 2.2 — Explicitly set `locationStatus` and `verificationMethod` in fuel entry metadata (Approve handler)
**Current code (line 2226–2234):** The metadata spread `...tx.metadata` carries over whatever was set during the initial POST. But for manual entries without GPS, `locationStatus` may be undefined.
**Fix:** Add explicit fields after the `...tx.metadata` spread:
```js
metadata: {
    ...tx.metadata,
    // Existing fields...
    locationStatus: tx.metadata?.locationStatus || (tx.matchedStationId || tx.metadata?.matchedStationId ? 'verified' : 'unknown'),
    matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
    verificationMethod: tx.metadata?.verificationMethod || (tx.matchedStationId || tx.metadata?.matchedStationId ? 'manual_station_picker' : undefined),
}
```

### Step 2.3 — Set `locationStatus` during initial POST for manual station picks (Fix 5)
**Where:** Initial POST handler, after the geo-matching block closes (line ~1782) and before the integrity checks (line ~1784).
**Problem:** When the form sends `matchedStationId` from the verified station dropdown, the geo-matching block is entirely skipped (no GPS coordinates). So `locationStatus` is never set, even though a verified station IS linked.
**Fix:** Add a new block after line 1782:
```js
// Manual Station Pick: If the form pre-selected a verified station (no GPS needed),
// set locationStatus so the blue shield badge appears in FuelLogTable.
if (!transaction.metadata?.locationStatus && (transaction.matchedStationId || transaction.metadata?.matchedStationId)) {
    if (!transaction.metadata) transaction.metadata = {};
    transaction.metadata.locationStatus = 'verified';
    transaction.metadata.verificationMethod = 'manual_station_picker';
    transaction.metadata.matchedStationId = transaction.matchedStationId || transaction.metadata.matchedStationId;
    console.log(`[ManualStationPick] Verified station linked via form picker: ${transaction.metadata.matchedStationId}`);
}
```
**Why before integrity checks:** The integrity block at line 1784 reads `transaction.metadata` and adds to it. Our new fields must already be in place before that.

### Step 2.4 — Verify FuelLogTable badge rendering
**No code change needed.** Just confirm:
- Line 435: `const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;` → will now find `'verified'` ✓
- Line 455: `locationStatus === 'verified'` → blue shield appears ✓
- Line 571: `entry.matchedStationId` → confidence dot turns on ✓

---

## Phase 3: Date/Time Concatenation in Approve Handler
**Goal:** Ensure the approved fuel entry's `date` field includes the time portion, matching the auto-approve path.
**File:** `/supabase/functions/server/index.tsx` — Approve handler
**Covers:** Fix 6

### Step 3.1 — Fix date field to include time
**Current code (line 2212):**
```js
date: tx.date || new Date().toISOString().split('T')[0],
```
**Problem:** The auto-approve path (line 1947–1949) combines date+time:
```js
date: (transaction.date && transaction.time) ? `${transaction.date}T${transaction.time}` : (transaction.date || ...)
```
The approve handler loses the time. Fuel log entries from approval sort at midnight.
**Fix:** Change to:
```js
date: (tx.date && tx.time) ? `${tx.date}T${tx.time}` : (tx.date || new Date().toISOString().split('T')[0]),
```

### Step 3.2 — Verify time field is preserved on the transaction
**No code change needed.** The form sends `time: entry.time || ''` (SubmitExpenseModal line 423). The initial POST saves the entire transaction object as-is via `kv.set`. When the approve handler reads it back, `tx.time` will be available.

---

## Phase 4: Gas Card & Petty Cash Amount Resolution
**Goal:** Ensure fuel entries have the correct dollar amount and price-per-liter even when the payment source is Gas Card or Petty Cash (where `tx.amount` is $0 because the driver didn't pay out-of-pocket).
**File:** `/supabase/functions/server/index.tsx` — Approve handler
**Covers:** Fix 7, Fix 10

### Step 4.1 — Fix amount resolution to use metadata.totalCost fallback (Fix 7)
**Current code (line 2207):**
```js
const amount = Math.abs(Number(tx.amount) || 0);
```
**Problem:** For Gas Card entries, the form sets `amount: 0` and puts the real cost in `metadata.totalCost`. The fuel entry ends up with amount=$0.
**Fix:** Change to:
```js
const amount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
```
**Why `tx.amount` first:** For driver_cash entries, `tx.amount` IS the real amount. The fallback to `metadata.totalCost` only kicks in when `tx.amount` is 0 or missing.

### Step 4.2 — Fix pricePerLiter to use metadata fallback (Fix 10)
**Current code (line 2208):**
```js
const pricePerLiter = quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0;
```
**Problem:** Even after Fix 7 corrects the amount, the form already sends the exact `pricePerLiter` in metadata. Using the pre-calculated value is more accurate (avoids rounding from division).
**Fix:** Change to:
```js
const pricePerLiter = Number(tx.metadata?.pricePerLiter) || (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);
```
**Why:** Matches the auto-approve path (line 1935) which uses `transaction.metadata?.pricePerLiter` as the primary source.

### Step 4.3 — Verify the amount flows correctly into the fuel entry
**No code change needed.** Line 2214 uses the local `amount` variable:
```js
amount: amount,
```
After Step 4.1, this will be the correct value.

---

## Phase 5: Wallet Credit Payment Source Guard & Description Fix
**Goal:** Only create Cash Wallet reimbursement credits when the driver actually paid out-of-pocket (driver_cash). Skip for Gas Card and Petty Cash. Also fix the credit description to show the station name.
**File:** `/supabase/functions/server/index.tsx` — Approve handler
**Covers:** Fix 8, Fix 13

### Step 5.1 — Add payment source guard to wallet credit creation (Fix 8)
**Current code (line 2255):**
```js
if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved') {
```
**Problem:** This always creates a wallet credit regardless of payment source. Gas Card purchases don't need reimbursement — the company already paid.
**Fix:** Add a payment source check:
```js
const paymentSource = tx.metadata?.paymentSource || 'driver_cash'; // default to driver_cash for legacy entries
const isDriverCash = paymentSource === 'driver_cash';

if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved' && isDriverCash) {
```
**Why default to driver_cash:** Legacy transactions from before the payment source feature was added should still create wallet credits (preserving existing behavior for historical entries).

### Step 5.2 — Also guard on a zero amount (belt-and-suspenders)
After the `isDriverCash` check, also ensure the credit amount is meaningful:
```js
if (!isDriverCash) {
    console.log(`[FuelCredit] Skipping wallet credit: payment source is '${paymentSource}' (not driver_cash) for transaction ${id}`);
}
```
This log helps you verify in the console that the guard is working.

### Step 5.3 — Fix wallet credit description to include vendor (Fix 13)
**Current code (line 2272):**
```js
description: `Fuel Reimbursement Credit: ${tx.description || tx.merchant || 'Fuel Purchase'}`,
```
**Problem:** Same vendor/merchant mismatch. Shows "Fuel Reimbursement Credit: Fuel Expense Log" instead of "Fuel Reimbursement Credit: Texaco."
**Fix:** Change to:
```js
description: `Fuel Reimbursement Credit: ${tx.vendor || tx.description || tx.merchant || 'Fuel Purchase'}`,
```

### Step 5.4 — Fix wallet credit amount to use totalCost fallback
**Current code (line 2273):**
```js
amount: Math.abs(tx.amount || 0),
```
**Problem:** If for any reason `tx.amount` is 0 (shouldn't happen for driver_cash, but belt-and-suspenders), the credit would be $0.
**Fix:** Change to:
```js
amount: Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0),
```

---

## Phase 6: Audit Confidence Score + isVerified + source Fields
**Goal:** Calculate the audit confidence score for manually approved fuel entries (matching the auto-approve path's pattern), and set `isVerified` and `source` fields.
**File:** `/supabase/functions/server/index.tsx` — Approve handler
**Covers:** Fix 11, Fix 12

### Step 6.1 — Add `isVerified` and `source` to fuel entry (Fix 12)
**Current code (lines 2210–2235):** Neither field is set.
**Problem:** The auto-approve path sets `isVerified: true` (line 1964) and `source: 'Fuel Log'` (line 1965). Without these, approved manual entries may not count in filtering/verification logic.
**Fix:** Add to the fuel entry object:
```js
isVerified: true,
source: 'Manual Approval',
```
**Why `source: 'Manual Approval'`:** Distinguishes from the auto-approve path's `'Fuel Log'` source, preserving audit trail clarity.

### Step 6.2 — Fetch matched station data for confidence calculation (Fix 11)
**Where:** Inside the `if ((tx.category === 'Fuel' ...) && tx.status === 'Approved')` block, after building the fuel entry object and before saving it.
**Problem:** The auto-approve path has access to `smartMatchedStation` (fetched during GPS matching). The approve handler doesn't fetch the station at all.
**Fix:** Add station fetch + confidence calculation:
```js
// Calculate Audit Confidence Score (matching auto-approve gold-standard pattern)
const resolvedStationId = fuelEntry.matchedStationId;
let matchedStation = null;
if (resolvedStationId) {
    matchedStation = await kv.get(`station:${resolvedStationId}`);
}

if (matchedStation && fuelEntry.matchedStationId) {
    const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, matchedStation);
    fuelEntry.metadata = {
        ...fuelEntry.metadata,
        auditConfidenceScore: confidence.score,
        auditConfidenceBreakdown: confidence.breakdown,
        isHighlyTrusted: confidence.isHighlyTrusted
    };
    console.log(`[ApproveHandler] Audit confidence for ${fuelEntry.id}: ${confidence.score}/100`);
} else {
    // No matched station — still calculate base confidence (behavioral + physical only)
    const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, null);
    fuelEntry.metadata = {
        ...fuelEntry.metadata,
        auditConfidenceScore: confidence.score,
        auditConfidenceBreakdown: confidence.breakdown,
        isHighlyTrusted: confidence.isHighlyTrusted
    };
    console.log(`[ApproveHandler] Audit confidence (no station) for ${fuelEntry.id}: ${confidence.score}/100`);
}
```
**Placement:** Between building the `fuelEntry` object and the `if (fuelEntry.vehicleId)` save guard.

### Step 6.3 — Verify calculateConfidenceScore handles manual entries gracefully
**No code change needed.** Reviewing `fuel_logic.ts` line 271–337:
- GPS Handshake (30pts): Checks `entry.matchedStationId` + `station?.status === 'verified'` → works for manual picks ✓
- Crypto (25pts): Checks `entry.signature` → manual entries won't have this, gets 0 → expected ✓
- Physical (25pts): Checks `entry.metadata?.integrityStatus` → set during initial POST integrity checks ✓
- Behavioral (20pts): Checks `!entry.metadata?.isHighFrequency` + `!entry.metadata?.isFragmented` → set during initial POST ✓
- Manual entries with a verified station pick will score ~50–55 points (30 GPS + 15-25 physical/behavioral). Entries without a station pick will score ~35–45. This is reasonable.

---

## Phase 7: Edit Sync Vendor Fix in FuelManagement.tsx
**Goal:** Fix the edit sync path so that updating a manual fuel entry correctly propagates the station name to the linked fuel log.
**File:** `/pages/FuelManagement.tsx`
**Covers:** Fix 9

### Step 7.1 — Fix location field in edit sync
**Current code (line 418):**
```js
location: savedTx.merchant || linkedLog.location,
```
**Problem:** Same vendor/merchant mismatch as Fix 1. When editing and saving, the fuel log's `location` field keeps the old (wrong) value because `savedTx.merchant` doesn't exist.
**Fix:** Change to:
```js
location: savedTx.vendor || savedTx.merchant || linkedLog.location,
```

### Step 7.2 — Also sync `vendor` field to the fuel log
**Current code (line 414–430):** The `updatedLog` object doesn't include `vendor`.
**Fix:** Add `vendor` to the updatedLog:
```js
vendor: savedTx.vendor || savedTx.merchant || linkedLog.vendor,
```
**Placement:** After the `location` line.

### Step 7.3 — Also sync `matchedStationId` when editing
**Current code:** Not synced during edits.
**Fix:** Add to updatedLog:
```js
matchedStationId: savedTx.matchedStationId || savedTx.metadata?.matchedStationId || linkedLog.matchedStationId,
```

---

## Phase 8: Verification & Regression Testing
**Goal:** Final review to ensure no regressions and that all 13 fixes work together.

### Step 8.1 — Cross-reference auto-approve path vs approve handler field parity
After all phases are complete, compare the fuel entry objects created by:
- Auto-approve path (lines 1945–1980): the "gold standard"
- Approve handler (lines 2210–2235): should now match

Fields that must be present in both:
| Field              | Auto-Approve (gold) | Approve Handler (after fix) |
|--------------------|---------------------|-----------------------------|
| `vendor`           | ✓ (line 1955)       | ✓ (Phase 1)                 |
| `location`         | ✓ (line 1956)       | ✓ (Phase 1)                 |
| `stationAddress`   | ✓ (line 1957)       | ✓ (Phase 1)                 |
| `matchedStationId` | ✓ (line 1966)       | ✓ (Phase 2)                 |
| `isVerified`       | ✓ (line 1964)       | ✓ (Phase 6)                 |
| `source`           | ✓ (line 1965)       | ✓ (Phase 6)                 |
| `date` with time   | ✓ (line 1947-1949)  | ✓ (Phase 3)                 |
| `metadata.locationStatus`       | ✓ (line 1974)  | ✓ (Phase 2)          |
| `metadata.matchedStationId`     | ✓ (line 1975)  | ✓ (Phase 2)          |
| `metadata.verificationMethod`   | ✓ (line 1976)  | ✓ (Phase 2)          |
| `metadata.auditConfidenceScore` | ✓ (line 1987)  | ✓ (Phase 6)          |
| `metadata.pricePerLiter`        | ✓ (line 1935)  | ✓ (Phase 4)          |

### Step 8.2 — Test scenario: Manual entry with verified station + driver_cash
Expected result after all fixes:
1. Submit → transaction saved as "Pending" with `locationStatus: 'verified'`, `matchedStationId` set ✓
2. Approve → fuel_entry created with correct vendor, location, address, matchedStationId, isVerified, source, confidence score ✓
3. FuelLogTable → shows "Texaco" with blue verified shield, confidence score populated ✓
4. Cash Wallet → credit created with "Fuel Reimbursement Credit: Texaco", correct amount ✓

### Step 8.3 — Test scenario: Manual entry with Gas Card (no reimbursement needed)
Expected result:
1. Submit → transaction with `amount: 0`, `metadata.totalCost: 1000`, `paymentSource: 'company_card'`
2. Approve → fuel_entry created with `amount: 1000` (from totalCost), correct pricePerLiter
3. FuelLogTable → shows correct $ amount, not $0
4. Cash Wallet → NO wallet credit created (Gas Card guard prevents it)

### Step 8.4 — Test scenario: Legacy entry without paymentSource
Expected result:
1. Legacy transaction has no `metadata.paymentSource`
2. Approve → `paymentSource` defaults to `'driver_cash'` → wallet credit IS created (backward compatible)

### Step 8.5 — Verify no regressions in driver-submitted entries (fuel_controller.tsx path)
**No changes were made to fuel_controller.tsx.** Driver submissions go through a completely separate code path. The three `findMatchingStation` call sites remain untouched per IDEA_1.md Step 5.5.

---

## Change Summary by File

| File | Phases | Changes |
|------|--------|---------|
| `/supabase/functions/server/index.tsx` | 1,2,3,4,5,6 | Approve handler rewrite + manual station pick block in POST handler |
| `/pages/FuelManagement.tsx` | 7 | Edit sync vendor/matchedStationId fix |

**Total lines changed:** ~40 lines modified/added across 2 files
**Risk level:** Low — all changes are in the approve handler (one concentrated block) and one edit sync function. No changes to driver submission paths, fuel_controller.tsx, or FuelLogTable display logic.
