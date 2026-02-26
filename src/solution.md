# Payment Source Alignment Fix Plan

## Problem Summary

Five root causes were identified that break payment-method tracking across the app:

| # | Root Cause | File(s) | Impact |
|---|-----------|---------|--------|
| RC-1 | FuelLogTable displays `entry.type` (legacy enum like `Reimbursement`/`Fuel_Manual_Entry`) instead of actual payment method | `FuelLogTable.tsx` lines 443-447 | Every row in Transaction Logs shows misleading labels |
| RC-2 | `legacyTypeMap` checks the map FIRST (`'Reimbursement' -> 'driver_cash'`), ignoring `metadata.paymentSource` | `FuelLogModal.tsx` line 130 | Editing a `Reimbursement` entry that was actually `rideshare_cash` pre-fills "Driver Cash" |
| RC-3 | `handleSave` collapses all non-card payments to `type: 'Fuel_Manual_Entry'`, losing distinction | `FuelLogModal.tsx` line 288 | After save, can't tell Driver Cash from RideShare Cash from Petty Cash via `type` field |
| RC-4 | `handleSave`/`handleBulkSave` write human-readable `paymentSource` strings (`'Cash'`, `'RideShare Cash'`, `'Gas Card'`, `'Other'`) that DON'T match the TypeScript enum (`'Personal'`, `'RideShare_Cash'`, `'Gas_Card'`, `'Petty_Cash'`) | `FuelLogModal.tsx` lines 298, 348 | `settlementService.processFuelSettlement()` checks `paymentSource !== 'RideShare_Cash'` and NEVER fires -- no wallet credits are ever created |
| RC-5 | `releaseHeldTransaction` creates fuel entries with `type: 'Reimbursement'` and NO `paymentSource` field at all | `fuel_controller.tsx` lines 242-270 | Gate-released entries are impossible to categorize |

## Canonical Enum Values (Source of Truth)

From `/types/fuel.ts` line 34:
```
paymentSource: 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash'
```

The FuelLogModal dropdown uses internal keys: `driver_cash`, `rideshare_cash`, `company_card`, `petty_cash`.

The CORRECT mapping from dropdown key -> enum value is:
```
driver_cash    -> 'Personal'
rideshare_cash -> 'RideShare_Cash'
company_card   -> 'Gas_Card'
petty_cash     -> 'Petty_Cash'
```

The CURRENT (BROKEN) mapping is:
```
driver_cash    -> 'Cash'          (wrong - should be 'Personal')
rideshare_cash -> 'RideShare Cash' (wrong - should be 'RideShare_Cash')
company_card   -> 'Gas Card'       (wrong - should be 'Gas_Card')
petty_cash     -> 'Other'          (wrong - should be 'Petty_Cash')
```

---

## Phase 1: Display Fix (FuelLogTable.tsx) -- READ-ONLY, ZERO RISK

**Goal:** Make the "Type" column in Transaction Logs show the actual payment method instead of the legacy `entry.type` enum.

**File:** `/components/fuel/FuelLogTable.tsx`

### Step 1.1: Add a `resolvePaymentLabel` helper function

**Location:** After the `getTypeIcon` function (around line 257), add a new function.

**What it does:** Takes a FuelEntry and returns a human-readable label by checking fields in priority order:
1. `entry.metadata?.paymentSource` -- the canonical field written by FuelLogModal (stores dropdown keys like `driver_cash`, `rideshare_cash`, etc.)
2. `entry.paymentSource` -- the top-level field (stores enum values like `Personal`, `RideShare_Cash`, etc., or the broken human-readable strings)
3. `entry.type` -- final fallback for truly legacy data

**Mapping table inside the function:**
```
'driver_cash'     -> 'Driver Cash'
'rideshare_cash'  -> 'RideShare Cash'
'company_card'    -> 'Gas Card'
'petty_cash'      -> 'Petty Cash'
'Personal'        -> 'Driver Cash'
'RideShare_Cash'  -> 'RideShare Cash'
'Gas_Card'        -> 'Gas Card'
'Petty_Cash'      -> 'Petty Cash'
'Cash'            -> 'Driver Cash'       (broken legacy value)
'RideShare Cash'  -> 'RideShare Cash'    (broken legacy value)
'Gas Card'        -> 'Gas Card'          (broken legacy value)
'Other'           -> 'Petty Cash'        (broken legacy value)
'Card_Transaction'-> 'Gas Card'          (legacy type fallback)
'Fuel_Manual_Entry'-> 'Driver Cash'      (legacy type fallback)
'Manual_Entry'    -> 'Driver Cash'       (legacy type fallback)
'Reimbursement'   -> 'Reimbursement'     (truly legacy, no source info)
```

### Step 1.2: Update the `getTypeIcon` function to accept resolved labels

**Location:** Lines 249-257 (the existing `getTypeIcon` function).

**What changes:** Instead of switching on the raw `entry.type`, it will switch on the resolved payment label from Step 1.1. New icon mapping:
```
'Driver Cash'      -> Banknote (emerald)
'RideShare Cash'   -> Banknote (orange)
'Gas Card'         -> CreditCard (indigo)
'Petty Cash'       -> Banknote (amber)
'Reimbursement'    -> HelpCircle (slate) -- legacy unknown
```

### Step 1.3: Update the table cell that renders the Type column

**Location:** Lines 443-447 (inside the `filteredEntries.map` render).

**Current code:**
```tsx
<div className="flex items-center gap-2">
    {getTypeIcon(entry.type)}
    <span className="text-xs">{entry.type.replace('_', ' ')}</span>
</div>
```

**New code:** Call `resolvePaymentLabel(entry)` to get the label, pass it to `getTypeIcon`, and display the label text.

### Step 1.4: Rename the column header from "Type" to "Paid By"

**Location:** Line 422 (`<TableHead>Type</TableHead>`).

**Change to:** `<TableHead>Paid By</TableHead>`

### Step 1.5: Verify no side effects

**Checklist (all read-only, no data mutations):**
- [ ] The `filterType` state/logic on lines 90, 142-147 still works (it filters on `entry.type`, NOT the display label -- this is correct and should NOT be changed)
- [ ] The `isManualEntry` function on lines 130-140 still works (it checks `entry.type`, not display -- correct)
- [ ] The CSV export on lines 354-358 still works (it exports raw entry data, not display labels -- correct)
- [ ] The stats calculations on lines 194-232 still work (they use raw entry data -- correct)

### How to test Phase 1:
1. Open Fuel > Transaction Logs tab
2. Look at the "Paid By" column (was "Type")
3. Entries created with the new FuelLogModal should show "Driver Cash", "RideShare Cash", "Gas Card", or "Petty Cash"
4. Old entries from `releaseHeldTransaction` will show "Reimbursement" (fixed in Phase 5)
5. Filters still work correctly (they operate on raw `entry.type`, unchanged)
6. CSV export still contains the raw data (unchanged)

---

## Phase 2: Write Fix -- Single Entry (FuelLogModal.tsx `handleSave`) -- FIXES RC-3 + RC-4 FOR NEW SINGLE ENTRIES

**Goal:** Make `handleSave` write the correct enum values to the top-level `paymentSource` field so `settlementService.processFuelSettlement()` can match on them.

**File:** `/components/fuel/FuelLogModal.tsx`

### Step 2.1: Create a `PAYMENT_SOURCE_MAP` constant

**Location:** Near the top of the file, after the imports (around line 15), add a const:

```typescript
const PAYMENT_SOURCE_MAP: Record<string, string> = {
    'driver_cash': 'Personal',
    'rideshare_cash': 'RideShare_Cash',
    'company_card': 'Gas_Card',
    'petty_cash': 'Petty_Cash',
};
```

**Why a constant:** Both `handleSave` (single) and `handleBulkSave` (bulk) need the same mapping. Defining it once eliminates drift.

### Step 2.2: Replace the inline ternary chain on line 298

**Location:** Line 298 inside `handleSave`:

**Current (BROKEN):**
```typescript
paymentSource: formData.type === 'company_card' ? 'Gas Card' : (formData.type === 'petty_cash' ? 'Other' : (formData.type === 'rideshare_cash' ? 'RideShare Cash' : 'Cash')),
```

**New (FIXED):**
```typescript
paymentSource: PAYMENT_SOURCE_MAP[formData.type] || 'Personal',
```

### Step 2.3: Verify `metadata.paymentSource` is unchanged

**Location:** Line 310 (`paymentSource: formData.type`).

**Status:** This is ALREADY CORRECT. It writes the dropdown key (`driver_cash`, `rideshare_cash`, etc.) which is what `resolvePaymentLabel` reads in Phase 1. DO NOT CHANGE THIS LINE.

### Step 2.4: Verify `entry.type` mapping is unchanged

**Location:** Line 288 (`type: formData.type === 'company_card' ? 'Card_Transaction' : 'Fuel_Manual_Entry'`).

**Status:** This is intentionally collapsing to legacy type enums for backward compatibility with other parts of the system. The real distinction now lives in `paymentSource`. DO NOT CHANGE THIS LINE.

### How to test Phase 2:
1. Open the Fuel Log Modal (+ New Transaction)
2. Select "RideShare Cash" as Paid By, fill required fields, save
3. Check the Transaction Logs table -- entry should show "RideShare Cash" (Phase 1 display)
4. Open browser DevTools > Network tab, inspect the POST body -- `paymentSource` should be `"RideShare_Cash"` (not `"RideShare Cash"`)
5. Repeat with each of the 4 payment options:
   - Driver Cash -> `paymentSource: "Personal"`
   - RideShare Cash -> `paymentSource: "RideShare_Cash"`
   - Gas Card -> `paymentSource: "Gas_Card"`
   - Petty Cash -> `paymentSource: "Petty_Cash"`
6. Verify `metadata.paymentSource` still shows the dropdown key (`driver_cash`, `rideshare_cash`, etc.)

---

## Phase 3: Write Fix -- Bulk Entry (FuelLogModal.tsx `handleBulkSave`) -- FIXES RC-3 + RC-4 FOR NEW BULK ENTRIES

**Goal:** Apply the same enum fix to bulk entry saves.

**File:** `/components/fuel/FuelLogModal.tsx`

### Step 3.1: Replace the inline ternary chain on line 348

**Location:** Line 348 inside `handleBulkSave`:

**Current (BROKEN):**
```typescript
paymentSource: bulkCommon.type === 'company_card' ? 'Gas Card' : (bulkCommon.type === 'petty_cash' ? 'Other' : (bulkCommon.type === 'rideshare_cash' ? 'RideShare Cash' : 'Cash')),
```

**New (FIXED):**
```typescript
paymentSource: PAYMENT_SOURCE_MAP[bulkCommon.type] || 'Personal',
```

This uses the same `PAYMENT_SOURCE_MAP` constant created in Step 2.1.

### Step 3.2: Verify `metadata.paymentSource` is unchanged

**Location:** Line 355 (`paymentSource: bulkCommon.type`).

**Status:** ALREADY CORRECT. Same as single entry -- writes the dropdown key. DO NOT CHANGE.

### How to test Phase 3:
1. Open the Fuel Log Modal, switch to the "Bulk Entry" tab
2. Select "RideShare Cash" as Paid By (common field)
3. Add 2-3 rows with valid amounts, save
4. Check the Transaction Logs table -- all bulk entries should show "RideShare Cash"
5. Open browser DevTools > Network tab, inspect the POST bodies -- each should have `paymentSource: "RideShare_Cash"`
6. Repeat with "Petty Cash" to verify it shows `paymentSource: "Petty_Cash"` (not `"Other"`)

---

## Phase 4: Edit-Load Fix (FuelLogModal.tsx `legacyTypeMap`) -- FIXES RC-2

**Goal:** When editing an existing entry, pre-fill the Paid By dropdown with the correct value by reading `metadata.paymentSource` FIRST.

**File:** `/components/fuel/FuelLogModal.tsx`

### Step 4.1: Flip the priority in `mappedType` resolution

**Location:** Lines 124-130 (inside the `useEffect` that runs when `initialData` changes).

**Current (BROKEN):**
```typescript
const legacyTypeMap: Record<string, string> = {
    'Card_Transaction': 'company_card',
    'Manual_Entry': 'driver_cash',
    'Fuel_Manual_Entry': 'driver_cash',
    'Reimbursement': 'driver_cash',
};
const mappedType = legacyTypeMap[initialData.type] || initialData.metadata?.paymentSource || initialData.type || 'company_card';
```

The problem: `legacyTypeMap[initialData.type]` always returns a value for ALL known types, so `metadata.paymentSource` is NEVER reached via the `||` chain.

**New (FIXED):**
```typescript
const legacyTypeMap: Record<string, string> = {
    'Card_Transaction': 'company_card',
    'Manual_Entry': 'driver_cash',
    'Fuel_Manual_Entry': 'driver_cash',
    'Reimbursement': 'driver_cash',
};
const mappedType = initialData.metadata?.paymentSource || legacyTypeMap[initialData.type] || initialData.type || 'company_card';
```

The ONLY change is moving `initialData.metadata?.paymentSource` to FIRST position.

### Step 4.2: Verify the valid values that `metadata.paymentSource` can contain

`metadata.paymentSource` can contain:
- `'driver_cash'` -- matches dropdown value directly
- `'rideshare_cash'` -- matches dropdown value directly
- `'company_card'` -- matches dropdown value directly
- `'petty_cash'` -- matches dropdown value directly

All four are valid `<SelectItem value="...">` values in the Paid By dropdown (lines 417-441). No additional mapping is needed.

### Step 4.3: Handle edge case -- old entries where `metadata.paymentSource` has broken values

Some old entries might have `metadata.paymentSource` set to the broken human-readable strings (from the pre-Phase-2 code):
- `'Cash'`, `'RideShare Cash'`, `'Gas Card'`, `'Other'`

These DON'T match any `<SelectItem value>` in the dropdown, so the dropdown would show blank.

**Fix:** Add a secondary normalization map that converts broken values to dropdown keys:

```typescript
const NORMALIZE_PAYMENT_SOURCE: Record<string, string> = {
    'Cash': 'driver_cash',
    'RideShare Cash': 'rideshare_cash',
    'Gas Card': 'company_card',
    'Other': 'petty_cash',
    'Personal': 'driver_cash',
    'RideShare_Cash': 'rideshare_cash',
    'Gas_Card': 'company_card',
    'Petty_Cash': 'petty_cash',
};
```

Then the resolution becomes:
```typescript
const rawPaymentSource = initialData.metadata?.paymentSource;
const normalizedSource = rawPaymentSource
    ? (NORMALIZE_PAYMENT_SOURCE[rawPaymentSource] || rawPaymentSource)
    : undefined;
const mappedType = normalizedSource || legacyTypeMap[initialData.type] || initialData.type || 'company_card';
```

### How to test Phase 4:
1. Create an entry with "RideShare Cash" (from Phase 2)
2. Click Edit on that entry
3. Verify the Paid By dropdown shows "RideShare Cash" (NOT "Driver Cash")
4. Save without changes -- verify the table still shows "RideShare Cash"
5. Find an OLD entry (pre-fix) with `type: 'Reimbursement'`
6. Click Edit -- it should show "Driver Cash" (correct fallback via `legacyTypeMap`)
7. Change it to "Petty Cash", save, then Edit again -- should show "Petty Cash"

---

## Phase 5: Server Fix (fuel_controller.tsx `releaseHeldTransaction`) -- FIXES RC-5

**Goal:** When the Station Gate releases a held transaction and creates a fuel_entry, include the correct `paymentSource` and `metadata.paymentSource` fields.

**File:** `/supabase/functions/server/fuel_controller.tsx`

### Step 5.1: Read the original transaction's payment info

**Location:** Inside `releaseHeldTransaction` function, around line 242 (where `const fuelEntry: any = {` begins).

**Before the fuel entry construction, add:**
```typescript
// Resolve paymentSource from the original transaction
const rawPaymentSource = tx.metadata?.paymentSource || tx.paymentMethod;
const paymentSourceEnum = (() => {
    const map: Record<string, string> = {
        'driver_cash': 'Personal',
        'rideshare_cash': 'RideShare_Cash',
        'company_card': 'Gas_Card',
        'petty_cash': 'Petty_Cash',
        'Cash': 'Personal',
        'RideShare Cash': 'RideShare_Cash',
        'Gas Card': 'Gas_Card',
        'Other': 'Petty_Cash',
        'Personal': 'Personal',
        'RideShare_Cash': 'RideShare_Cash',
        'Gas_Card': 'Gas_Card',
        'Petty_Cash': 'Petty_Cash',
    };
    return map[rawPaymentSource] || 'Personal';
})();
const metadataPaymentSource = (() => {
    const map: Record<string, string> = {
        'Personal': 'driver_cash',
        'RideShare_Cash': 'rideshare_cash',
        'Gas_Card': 'company_card',
        'Petty_Cash': 'petty_cash',
    };
    return map[paymentSourceEnum] || 'driver_cash';
})();
```

### Step 5.2: Add fields to the fuel entry object

**Location:** Inside the `fuelEntry` object (lines 242-270).

**Add these two fields:**
```
paymentSource: paymentSourceEnum,
entryMode: 'Floating',
```

### Step 5.3: Add `paymentSource` to the metadata object

**Location:** Inside `fuelEntry.metadata` (lines 263-269).

**Add:**
```
paymentSource: metadataPaymentSource,
```

### Step 5.4: Verify no interference with the signature

**Location:** Line 271 (`fuelEntry.signature = await signRecord(fuelEntry);`).

**Status:** The signature is computed AFTER all fields are set, so adding `paymentSource` before the signature call is safe. The signature will include the new field. No change needed.

### How to test Phase 5:
1. Go to the Learnt Locations tab
2. Promote a learnt location to a verified station (via Merge or Create New)
3. Go to Transaction Logs
4. Find the newly released entry (it should have the station name from the promoted location)
5. The "Paid By" column should show "Driver Cash" (or the actual method from the original transaction) instead of "Reimbursement"
6. Click Edit on it -- the Paid By dropdown should pre-select correctly

---

## Phase 6: Legacy Backfill (fuel_controller.tsx) -- FIXES HISTORICAL DATA

**Goal:** Patch old fuel_entry records that have no `paymentSource` field so they display correctly and can be processed by settlementService.

**File:** `/supabase/functions/server/fuel_controller.tsx`

### Step 6.1: Add a new backfill endpoint

**Location:** After the existing `backfill-fuel-integrity` endpoint (around line 1461).

**Route:** `POST ${BASE_PATH}/admin/backfill-payment-sources`

**Logic:**
1. Fetch all `fuel_entry:*` records via `kv.getByPrefix("fuel_entry:")`
2. Filter to entries where `paymentSource` is missing/undefined
3. For each entry, infer the correct value:
   - If `entry.metadata?.paymentSource` exists -> use `PAYMENT_SOURCE_MAP` to get the enum value
   - Else if `entry.type === 'Card_Transaction'` -> `'Gas_Card'`
   - Else if `entry.type === 'Reimbursement'` -> `'Personal'`
   - Else (`Fuel_Manual_Entry`, `Manual_Entry`, etc.) -> `'Personal'`
4. Write `paymentSource` (enum) to top-level and `metadata.paymentSource` (dropdown key) to metadata
5. Save the entry back with `kv.set`
6. Return count of patched entries

### Step 6.2: Add the corresponding API call in the frontend

**File:** `/services/api.ts`

**Location:** After the existing `runFuelBackfill` method (around line 1030).

**Add:**
```typescript
async runPaymentSourceBackfill() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/backfill-payment-sources`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Payment source backfill failed");
    return response.json();
},
```

### Step 6.3: Wire the backfill to the Recalculate button (or add a separate button)

**Option A (recommended):** Add it to the EXISTING Recalculate button flow in `FuelLogTable.tsx` so it runs after the integrity backfill.

**Location:** `FuelLogTable.tsx` lines 386-402 (the `onClick` handler for the Recalculate button).

**What changes:** After `api.runFuelBackfill()` succeeds, also call `api.runPaymentSourceBackfill()`.

**Option B (safer):** Add a separate "Fix Payment Sources" button. This avoids coupling but adds UI clutter.

**Decision: Go with Option A** -- the Recalculate button already says "Recalculate Fleet Integrity" and this is an integrity fix.

### Step 6.4: Verify the backfill is additive-only

**Critical safety rule:** The backfill must NEVER overwrite an existing `paymentSource` value. It only fills in missing values.

**Guard clause at the top of the loop:**
```typescript
if (entry.paymentSource) continue; // Already has a value, skip
```

### How to test Phase 6:
1. Open Transaction Logs
2. Note any entries showing "Reimbursement" in the Paid By column (these are the ones with no paymentSource)
3. Click the "Recalculate" button
4. Wait for completion toast
5. Click "Refresh Data"
6. The previously "Reimbursement" entries should now show "Driver Cash" (or the correct inferred method)
7. Click Edit on one of the patched entries -- the Paid By dropdown should pre-select correctly
8. Verify entries that ALREADY had correct paymentSource values are unchanged

---

## Execution Order and Dependencies

```
Phase 1 (Display) ---- no dependencies, can run standalone
    |
Phase 2 (Single Save) ---- depends on Phase 1 for visual verification
    |
Phase 3 (Bulk Save) ---- depends on Phase 2 (shares PAYMENT_SOURCE_MAP constant)
    |
Phase 4 (Edit Load) ---- depends on Phase 2/3 (needs correct data to test)
    |
Phase 5 (Server Gate) ---- independent of Phase 2-4, but needs Phase 1 for display
    |
Phase 6 (Backfill) ---- depends on Phase 1 for display, runs last to avoid patching data that later phases would fix
```

## Risk Assessment

| Phase | Files Modified | Risk Level | Data Written? | Reversible? |
|-------|---------------|------------|---------------|-------------|
| 1 | FuelLogTable.tsx | ZERO -- read-only display | No | Instant revert |
| 2 | FuelLogModal.tsx | LOW -- only new single entries | Yes (new entries only) | Old entries unaffected |
| 3 | FuelLogModal.tsx | LOW -- only new bulk entries | Yes (new entries only) | Old entries unaffected |
| 4 | FuelLogModal.tsx | LOW -- only edit pre-fill | No (until user saves) | No data change until save |
| 5 | fuel_controller.tsx | LOW -- only future gate releases | Yes (new entries only) | Old entries unaffected |
| 6 | fuel_controller.tsx + api.ts + FuelLogTable.tsx | MEDIUM -- modifies old data | Yes (patches old entries) | Additive only, never overwrites |
