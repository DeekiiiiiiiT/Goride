# Fleet Integrity — DriverPortal Bug Fix Implementation Plan

## Summary of Issues

The primary symptom is a recurring console error:
```
❌ [Supabase] [Frontend Error] DriverPortal: Button is not defined
```

Exhaustive static analysis confirmed all Button imports are correct across the DriverPortal ErrorBoundary tree. The root cause is most likely a **stale bundler cache** rather than a source code issue.

During the investigation, **5 secondary bugs** were uncovered:

| # | File | Bug Description |
|---|------|-----------------|
| 1 | `DriverExpenses.tsx` | Passes wrong prop names to `ReceiptUploader` (`preview`/`onFileChange` instead of `previewUrl`/`onFileSelect`, plus missing `onClear`) |
| 2 | `DriverExpenses.tsx` | Passes a string via `.toFixed(2)` to `FuelCashInputs` where `currentVolume` expects `number` |
| 3 | `FuelLogForm.tsx` | State reset on lines 95–101 omits `isFullTank`, leaving stale `true` state across form reuses |
| 4 | `DriverOverview.tsx` | Unused `DriverFuelDisputes` import (dead code / tree-shaking hazard) |
| 5 | `DriverDashboard.tsx` | Unused `Button` import (dead code — ironic given the "Button is not defined" error) |

---

## Phase 1: Reconnaissance & Contract Verification

**Objective:** Confirm the exact prop contracts, current usage, and file states before making any changes. This eliminates assumptions and ensures surgical edits.

### Step 1.1 — Verify `ReceiptUploader` prop interface
- **File:** `/components/driver-portal/expenses/ReceiptUploader.tsx`
- **Action:** Read the `ReceiptUploaderProps` interface (lines 6–12)
- **Expected contract:**
  - `onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void`
  - `onClear: () => void`
  - `previewUrl: string | null`
  - `isScanning: boolean`
  - `fileName?: string`
- **Verification:** Confirm these are the ONLY props the component destructures and uses internally

### Step 1.2 — Verify `FuelCashInputs` prop interface
- **File:** `/components/driver-portal/expenses/FuelCashInputs.tsx`
- **Action:** Read the `FuelCashInputsProps` interface (lines 7–18)
- **Expected contract:**
  - `currentVolume?: number` (NOT string)
- **Verification:** Confirm `currentVolume` is used in arithmetic (line 29: `+ currentVolume`) which will produce `NaN` if a string is passed

### Step 1.3 — Verify `FuelLogForm` initial state shape
- **File:** `/components/driver-portal/FuelLogForm.tsx`
- **Action:** Read the `useState` initializer (lines 25–32) and the reset block (lines 95–101)
- **Expected initial state:**
  - `{ date, odometer, pricePerLiter, totalCost, notes, isFullTank: false }`
- **Verification:** Confirm the reset block is missing `isFullTank: false`

### Step 1.4 — Verify `DriverOverview.tsx` import usage
- **File:** `/components/driver-portal/DriverOverview.tsx`
- **Action:** Read line 16 (`import { DriverFuelDisputes }`) and search the entire file for any usage of `DriverFuelDisputes`
- **Expected:** Zero references beyond the import statement

### Step 1.5 — Verify `DriverDashboard.tsx` Button usage
- **File:** `/components/driver-portal/DriverDashboard.tsx`
- **Action:** Read line 3 (`import { Button }`) and search the entire file for any JSX usage of `<Button`
- **Expected:** Zero `<Button` usages — the component delegates all UI to child components

---

## Phase 2: Fix Bug #1 — ReceiptUploader Prop Name Mismatch

**Objective:** Correct the 3 prop errors in `DriverExpenses.tsx` where `ReceiptUploader` is invoked with wrong prop names and a missing required prop.

### Step 2.1 — Identify the exact call site
- **File:** `/components/driver-portal/DriverExpenses.tsx`
- **Location:** Lines 641–645
- **Current (BROKEN):**
  ```tsx
  <ReceiptUploader 
    preview={receiptPreview}
    isScanning={isScanning}
    onFileChange={handleFileChange}
  />
  ```

### Step 2.2 — Map the correct prop names
| Current (wrong) | Correct (per interface) | Notes |
|-----------------|------------------------|-------|
| `preview={receiptPreview}` | `previewUrl={receiptPreview}` | Renamed to match `previewUrl` |
| `onFileChange={handleFileChange}` | `onFileSelect={handleFileChange}` | Renamed to match `onFileSelect` |
| *(missing)* | `onClear={...}` | Required prop — needs a handler |

### Step 2.3 — Implement the `onClear` handler logic
- **Action:** The `onClear` callback should reset both `receiptFile` and `receiptPreview` states
- **Implementation:**
  ```tsx
  onClear={() => { setReceiptFile(null); setReceiptPreview(null); }}
  ```
- **Rationale:** These are the two state variables set during `handleFileChange` (lines 139–142), so clearing both restores the "no receipt" state

### Step 2.4 — Apply the edit
- **Target:** Lines 641–645 of `/components/driver-portal/DriverExpenses.tsx`
- **New code:**
  ```tsx
  <ReceiptUploader 
    previewUrl={receiptPreview}
    isScanning={isScanning}
    onFileSelect={handleFileChange}
    onClear={() => { setReceiptFile(null); setReceiptPreview(null); }}
  />
  ```

### Step 2.5 — Verify no other `ReceiptUploader` call sites exist
- **Action:** Search all files for `<ReceiptUploader` to confirm this is the only usage
- **Expected:** Only one call site in `DriverExpenses.tsx`

---

## Phase 3: Fix Bug #2 — String-to-Number Type Coercion for `currentVolume`

**Objective:** Fix the type mismatch where `DriverExpenses.tsx` passes a string (from `.toFixed(2)`) to `FuelCashInputs`'s `currentVolume` prop which expects `number`.

### Step 3.1 — Identify the exact problem expression
- **File:** `/components/driver-portal/DriverExpenses.tsx`
- **Location:** Lines 624–629
- **Current (BROKEN):**
  ```tsx
  currentVolume={(() => {
      const amt = parseFloat(amount || '0');
      const price = parseFloat(fuelEntry.pricePerLiter || '0');
      if (amt > 0 && price > 0) return (amt / price).toFixed(2);  // returns STRING
      return '0.00';  // also STRING
  })()}
  ```
- **Root cause:** `.toFixed(2)` returns `string`, not `number`. The fallback `'0.00'` is also a string.

### Step 3.2 — Understand the downstream impact
- **File:** `FuelCashInputs.tsx`, line 29:
  ```tsx
  const totalLitersAfter = (tankStatus?.currentCumulative || 0) + currentVolume;
  ```
- **Impact:** If `currentVolume` is the string `"12.50"`, this becomes `0 + "12.50"` = `"012.50"` (string concatenation), causing the tank progress bar and overflow detection to break silently

### Step 3.3 — Apply the fix
- **Target:** Lines 624–629 of `/components/driver-portal/DriverExpenses.tsx`
- **Strategy:** Wrap the `.toFixed(2)` result in `Number()` or `parseFloat()`, and change the fallback from `'0.00'` to `0`
- **New code:**
  ```tsx
  currentVolume={(() => {
      const amt = parseFloat(amount || '0');
      const price = parseFloat(fuelEntry.pricePerLiter || '0');
      if (amt > 0 && price > 0) return Number((amt / price).toFixed(2));
      return 0;
  })()}
  ```

### Step 3.4 — Verify type safety
- **Check:** Confirm `FuelCashInputs` prop interface declares `currentVolume?: number` (default `0`)
- **Check:** Confirm all arithmetic downstream (`+`, `*`, `/`, comparisons) will now operate on `number` types

---

## Phase 4: Fix Bug #3 — FuelLogForm State Reset Missing `isFullTank`

**Objective:** Add the missing `isFullTank: false` to the form state reset block in `FuelLogForm.tsx` to prevent stale state across consecutive form submissions.

### Step 4.1 — Identify the state shape and reset gap
- **File:** `/components/driver-portal/FuelLogForm.tsx`
- **Initial state (line 25–32):**
  ```tsx
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    odometer: '',
    pricePerLiter: '',
    totalCost: '',
    notes: '',
    isFullTank: false   // ← EXISTS in initial state
  });
  ```
- **Reset block (lines 95–101):**
  ```tsx
  setFormData({
      date: new Date().toISOString().split('T')[0],
      odometer: '',
      pricePerLiter: '',
      totalCost: '',
      notes: ''
      // ← isFullTank MISSING
  });
  ```

### Step 4.2 — Understand the impact of the missing reset
- **Scenario:** Driver fills a fuel log and checks "Full Tank" (sets `isFullTank: true`)
- **Submits the form** → reset runs → `isFullTank` stays `true` in state
- **Opens a new fuel log** → "Filled to capacity (Full Tank)" checkbox appears pre-checked
- **Impact:** If driver submits without noticing, the cumulative tank counter incorrectly resets, corrupting fuel reconciliation data
- **Severity:** HIGH — affects SHA-256 signed fuel integrity calculations

### Step 4.3 — Apply the fix
- **Target:** Lines 95–101 of `/components/driver-portal/FuelLogForm.tsx`
- **New code:**
  ```tsx
  setFormData({
      date: new Date().toISOString().split('T')[0],
      odometer: '',
      pricePerLiter: '',
      totalCost: '',
      notes: '',
      isFullTank: false
  });
  ```

### Step 4.4 — Verify no other state reset paths exist
- **Action:** Search `FuelLogForm.tsx` for other places where `setFormData` is called with an object literal
- **Expected:** Only the one reset block after `onOpenChange(false)` on line 92

---

## Phase 5: Fix Bug #4 — Remove Unused `DriverFuelDisputes` Import from DriverOverview

**Objective:** Remove the dead `DriverFuelDisputes` import from `DriverOverview.tsx` to eliminate potential tree-shaking issues and dead module initialization.

### Step 5.1 — Confirm the import is unused
- **File:** `/components/driver-portal/DriverOverview.tsx`
- **Line 16:** `import { DriverFuelDisputes } from './DriverFuelDisputes';`
- **Action:** Search the entire file for `DriverFuelDisputes` — expected only the import line

### Step 5.2 — Assess side-effect risk
- **Check:** Does `DriverFuelDisputes.tsx` have module-level side effects (e.g., global event listeners, API calls at import time)?
- **Expected:** No — it's a standard React component export
- **Risk:** NONE — safe to remove

### Step 5.3 — Apply the fix
- **Target:** Line 16 of `/components/driver-portal/DriverOverview.tsx`
- **Action:** Delete the entire import line
- **Verify:** No other imports are affected (line 15 ends the lucide-react import, line 17 starts the Card import — removing line 16 won't break adjacent imports)

---

## Phase 6: Fix Bug #5 — Remove Unused `Button` Import from DriverDashboard

**Objective:** Remove the unused `Button` import from `DriverDashboard.tsx`. This is particularly notable because the "Button is not defined" error originates from the DriverPortal tree, and having an unused Button import in the parent component may confuse the bundler's dependency graph.

### Step 6.1 — Confirm Button is not used in DriverDashboard JSX
- **File:** `/components/driver-portal/DriverDashboard.tsx`
- **Line 3:** `import { Button } from "../ui/button";`
- **Action:** Search the entire file for `<Button` or `Button` usage beyond the import
- **Expected:** Zero JSX usages — all button rendering is delegated to child components (`DriverOverview`, `FuelLogForm`, `ServiceRequestForm`, etc.)

### Step 6.2 — Assess bundler cache implications
- **Rationale:** The unused import forces the bundler to include `Button` in the DriverDashboard module scope. If the bundler cache becomes stale, it may fail to resolve this import correctly, potentially contributing to the "Button is not defined" error
- **Removing it** eliminates one unnecessary dependency edge in the module graph

### Step 6.3 — Apply the fix
- **Target:** Line 3 of `/components/driver-portal/DriverDashboard.tsx`
- **Action:** Delete the entire import line
- **Verify:** The adjacent imports (line 2: `Card, CardContent` and line 4: `Badge`) remain intact

---

## Phase 7: Force-Touch Bundler Cache Bust

**Objective:** Add a cache-busting comment to all files in the DriverPortal ErrorBoundary tree that import `Button` from `@/components/ui/button`. This forces the bundler to recompile these modules and eliminates stale cached versions.

### Step 7.1 — Identify all affected files
- **Action:** Search all files under `/components/driver-portal/` for `import.*Button.*from.*button`
- **Expected files (Button importers):**
  1. `DriverExpenses.tsx` (line 3)
  2. `FuelLogForm.tsx` (line 4)
  3. `DriverOverview.tsx` (line 12)
  4. `DriverLayout.tsx` (Button import)
  5. `DriverClaims.tsx` (Button import)
  6. `DriverProfile.tsx` (Button import)
  7. `DriverHistory.tsx` (Button import)
  8. `DriverEarnings.tsx` (Button import)
  9. `DriverEquipment.tsx` (Button import)
  10. `DriverTrips.tsx` (Button import)
  11. `WeeklyCheckInModal.tsx` (Button import)
  12. `ServiceRequestForm.tsx` (Button import)
  13. `expenses/ReceiptUploader.tsx` (line 2)
  14. `expenses/PaymentMethodSelector.tsx` (Button import)
  15. `expenses/GasCardSummary.tsx` (Button import)
  16. `views/PortalHome.tsx` (Button import)
  17. `views/ReimbursementMenu.tsx` (Button import)
  18. `ui/DriverHeader.tsx` (Button import)
  19. `DriverFuelStats.tsx` (Button import)
  20. `DriverFuelDisputes.tsx` (Button import)

### Step 7.2 — Design the cache-bust comment
- **Format:** `// cache-bust: force recompile — 2026-02-10`
- **Placement:** Insert as the FIRST line of each file (before all imports)
- **Rationale:** Adding content to line 1 shifts all line numbers, forcing a complete reparse

### Step 7.3 — Apply cache-bust to files already edited in Phases 2–6
- The files edited in Phases 2–6 (`DriverExpenses.tsx`, `FuelLogForm.tsx`, `DriverOverview.tsx`, `DriverDashboard.tsx`) will already be recompiled due to content changes
- **Action:** Still add the cache-bust comment for consistency and documentation

### Step 7.4 — Apply cache-bust to remaining unedited Button-importing files
- **Action:** For each file in the list from Step 7.1 that was NOT edited in Phases 2–6, add the cache-bust comment as line 1
- **Priority files** (most likely to hold stale cache):
  1. `DriverLayout.tsx` — the layout wrapper, often cached aggressively
  2. `views/PortalHome.tsx` — entry point view
  3. `ui/DriverHeader.tsx` — shared header component

### Step 7.5 — Apply cache-bust to the shared UI Button itself
- **File:** `/components/ui/button.tsx`
- **Action:** Add the cache-bust comment as line 1
- **Rationale:** If the source-of-truth `button.tsx` file is re-touched, the bundler will invalidate ALL downstream dependents

---

## Phase 8: Final Verification & Regression Check

**Objective:** Verify all 5 bugs are fixed, confirm the cache-bust resolved the primary error, and ensure no regressions were introduced.

### Step 8.1 — Static analysis: ReceiptUploader props
- **Check:** Read `DriverExpenses.tsx` and confirm:
  - `previewUrl={receiptPreview}` (not `preview`)
  - `onFileSelect={handleFileChange}` (not `onFileChange`)
  - `onClear={() => { ... }}` is present
- **Cross-reference:** Read `ReceiptUploader.tsx` interface and confirm 1:1 match

### Step 8.2 — Static analysis: FuelCashInputs currentVolume type
- **Check:** Read `DriverExpenses.tsx` and confirm:
  - `currentVolume` expression returns `Number(...)` or a plain `number`
  - No `.toFixed()` in the return path (or wrapped in `Number()`)
  - Fallback is `0` (not `'0.00'`)

### Step 8.3 — Static analysis: FuelLogForm isFullTank reset
- **Check:** Read `FuelLogForm.tsx` reset block and confirm:
  - `isFullTank: false` is present in the `setFormData({...})` call

### Step 8.4 — Static analysis: Dead imports removed
- **Check:** Read `DriverOverview.tsx` — confirm no `DriverFuelDisputes` import
- **Check:** Read `DriverDashboard.tsx` — confirm no `Button` import

### Step 8.5 — Static analysis: Cache-bust comments
- **Check:** Spot-check 3–5 files from the Phase 7 list to confirm cache-bust comments are present

### Step 8.6 — Runtime verification checklist
- [ ] Open the Driver Portal — no "Button is not defined" console error
- [ ] Navigate to Expenses → Log Expense → Fuel → reach entry_details
- [ ] Upload a receipt → verify receipt preview appears (ReceiptUploader props working)
- [ ] Clear the receipt → verify it resets (onClear working)
- [ ] Enter $50 amount, $1.25/L price → verify "40 Liters" appears (not "NaN" or broken tank bar)
- [ ] Submit a fuel log with "Full Tank" checked → open a new log → verify checkbox is unchecked
- [ ] Check console for any new errors or warnings

---

## File Change Matrix

| Phase | File | Change Type | Lines Affected |
|-------|------|-------------|----------------|
| 2 | `DriverExpenses.tsx` | Edit props | 641–645 |
| 3 | `DriverExpenses.tsx` | Fix type coercion | 624–629 |
| 4 | `FuelLogForm.tsx` | Add missing state key | 95–101 |
| 5 | `DriverOverview.tsx` | Remove import | 16 |
| 6 | `DriverDashboard.tsx` | Remove import | 3 |
| 7 | 20+ files | Add cache-bust comment | Line 1 |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `onClear` handler has wrong reset logic | Low | Medium | Reset same state vars as `handleFileChange` sets |
| `Number()` wrapping changes computed volume slightly | None | None | `Number("12.50")` === `12.5` — identical float value |
| Removing dead imports breaks something | None | None | Confirmed zero usages via static analysis |
| Cache-bust comments cause lint warnings | Low | Low | Standard JS comment — no linter conflicts |
| Editing 20+ files introduces typos | Low | High | Each edit is mechanical (insert 1 line) — use automation |

---

*Plan created: 2026-02-10*
*Status: AWAITING PHASE 1 APPROVAL*
