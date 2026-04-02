# Uber “Adjustments from previous periods” — phased implementation plan

This document breaks down work to correctly classify **`payments_transaction.csv`** rows with **`Description` = `trip fare adjust order`** (and equivalent). Those rows often place amounts in the **Tip** column while Uber’s **driver app** shows them under **“Adjustments from previous periods”**, not under tips.

**Process:** Complete phases **in order**. After each phase, **stop** and wait for explicit approval before starting the next. Do not skip phases.

---

## Phase 1 — Types, contracts, and detection rules (no behavior change yet)

**Goal:** Lock in naming, where data lives, and acceptance criteria so later phases do not contradict each other.

### Phase 1 — Implementation record (complete)

| Item | Decision / location |
|------|----------------------|
| Trip field | `uberPriorPeriodAdjustment?: number` on `Trip` — sum per Trip UUID over merged `trip fare adjust order` rows; positive = credit to driver (`src/types/data.ts`). |
| Ledger `eventType` | **Option A:** `'prior_period_adjustment'` added to `LedgerEventType` (`src/types/data.ts`). |
| API whitelist | `'prior_period_adjustment'` added to `VALID_LEDGER_EVENT_TYPES` in `src/supabase/functions/server/index.tsx` so Phase 3 writes are accepted. |
| Driver overview | `period.uber.priorPeriodAdjustments?` and `lifetime.uber.priorPeriodAdjustments?` (`src/types/data.ts`). **Server aggregation:** `GET /ledger/driver-overview` (Phase 3). |
| CSV detection | `normalizeUberPaymentsTransactionDescription`, `isUberTripFareAdjustOrderDescription`, constant `UBER_PAYMENTS_TX_DESCRIPTION_TRIP_FARE_ADJUST_ORDER` (`src/utils/uberTripFareAdjustOrder.ts`). |
| Audit | `DataSanitizer.auditTrip` treats non-zero `uberPriorPeriodAdjustment` like other adjustments for zero-distance phantom-trip warnings (`src/services/dataSanitizer.ts`). |

### Steps

1. **Trip model (`src/types/data.ts` — `Trip` interface)**
   - Add an optional numeric field for prior-period adjustment **per trip**, e.g. `uberPriorPeriodAdjustment?: number` (currency; sign convention: **positive = credit to driver in period**, matching how other earnings fields are stored unless the codebase already standardizes signed amounts—**match existing `amount` / tip conventions**).
   - Add a short JSDoc: sourced from `payments_transaction` when Description indicates fare adjustment; **not** the same as `uberTips` / `fareBreakdown.tips`.
   - If trips can have **multiple** payment rows for the same UUID, document whether the field is **sum of all** `trip fare adjust order` rows for that trip in the import batch (default: **sum**).

2. **Ledger contract**
   - Decide **one** canonical representation:
     - **Option A:** New `eventType` value (e.g. `prior_period_adjustment`) on ledger entries, with `sourceId` = trip UUID, `platform` = `Uber`, `grossAmount`/`netAmount` consistent with other earning lines.
     - **Option B:** Keep existing `eventType` but add **metadata** (e.g. `metadata.subcategory = 'uber_prior_period_adjustment'`) on `tip` or `fare_earning` rows.
   - **Recommendation:** Prefer **Option A** if the driver-overview query already branches on `eventType`; avoids overloading `tip` rows.
   - Record the **exact** string values in this file once chosen (eventType, metadata keys).

3. **Driver overview / `LedgerDriverOverview.period.uber` (if applicable)**
   - Extend the **optional** `uber` object in `LedgerDriverOverview` (see `src/types/data.ts`) with a field such as `priorPeriodAdjustments?: number` (period sum for Uber), so the Period earnings modal can read **one number** from the ledger API without rescanning all trips.

4. **CSV detection rule (spec only in this phase)**
   - Normalize Description: trim, lowercase, collapse spaces.
   - Primary match: description equals **`trip fare adjust order`** (after normalization) **or** starts with that token if Uber adds suffixes in other locales.
   - **Do not** treat generic `"adjustment"` in description as sufficient (too broad).
   - Optional secondary guard: row has **Trip UUID** present; fare-component columns ~ 0 and Tip column non-zero—**document as heuristic only**, not required for v1 if primary match is stable.

5. **Reconciliation targets**
   - **Sum of ledger `prior_period_adjustment` lines (Uber, period)** should equal **sum of `trip fare adjust order` amounts** in imported `payments_transaction` for the same driver and date range (within rounding).
   - **Statement note:** `payments_driver.csv` may **not** expose a separate line for this; reconciliation is **transaction-level vs app**, not vs `Total Earnings:Tip` alone.

6. **Deliverable for Phase 1**
   - Types, detection helper, ledger allowlist, and sanitizer hook merged.
   - **Not done yet (later phases):** `csvHelpers` merge logic, ledger emission, driver-overview sums, UI.

**Stop after Phase 1 — wait for approval before Phase 2.**

---

## Phase 2 — Import pipeline: `payments_transaction` → trips

**Goal:** When merging `uber_payment` rows, **exclude** fare-adjust amounts from **tip** aggregates and **accumulate** them into `uberPriorPeriodAdjustment` (or the name fixed in Phase 1).

### Phase 2 — Implementation record (complete)

| Item | Implementation |
|------|----------------|
| Detection | `isPriorPeriodFareAdjust` from `isUberTripFareAdjustOrderDescription(row['Description'])` in `csvHelpers` uber_payment merge. |
| `uberPriorPeriodAdjustment` | Sum per trip: `tipColumnVal` if non-zero, else `earnings`, else `Math.abs(netPayoutRaw)` when `isPriorPeriodFareAdjust`. |
| Tips / SSOT | `parseUberPaymentTransactionSsotLine` sets **tips = 0** when Description is fare-adjust order; `uberTips` and `fareBreakdown.tips` no longer receive that column. |
| Gross / `amount` | Unchanged: `addToGross` still uses `Paid to you : Your earnings` when non-zero; prior-period edge `earnings===0` now adds gross via `isPriorPeriodFareAdjust` branch. |
| `uberSsotFarePlusTipsMatch` | Skipped for fare-adjust rows (avoid false mismatch). |
| `transactionType` | **`Prior Period Adjustment`** when `isPriorPeriodFareAdjust` (before generic Tip / Fare Adjustment). |

### Steps

1. **Locate all touchpoints in `src/utils/csvHelpers.ts` (and helpers)**  
   For `file.type === 'uber_payment'` and existing `tripId`:
   - Where **`fareBreakdown.tips`** is incremented from the Tip column.
   - Where **`current.uberTips`** / SSOT line **`parseUberPaymentTransactionSsotLine`** feeds tips.
   - Where **`addToGross`** / **`amount`** is computed from `Paid to you : Your earnings` and zero-earnings edge cases.

2. **Use the Phase 1 helper** `isUberTripFareAdjustOrderDescription` from `src/utils/uberTripFareAdjustOrder.ts` (or wrap it to read `row['Description']`).

3. **For rows with `isTripFareAdjustOrder === true`:**
   - Compute the **adjustment magnitude** using the **same monetary column priority** already used for “real” earnings for that row (typically **`Paid to you : Your earnings`** when non-zero; if ambiguous, fall back to Tip column only when Your earnings is 0—**document the chosen rule in code comments**).
   - **Add** that amount to **`uberPriorPeriodAdjustment`** (trip-level sum).
   - **Do not** add that amount to **`fareBreakdown.tips`** or **`uberTips`** (or SSOT tip accumulation used for “true” tips).
   - **Financial totals:** Confirm whether **`amount` / gross to driver** for the trip should still include this (it **should**, as it is real earnings—only the **classification** changes). If `amount` currently includes it via the Tip column flowing into gross, keep **period earnings** correct; only **strip from tip buckets**.

4. **`parseUberPaymentTransactionSsotLine` (`src/utils/uberSsot.ts`)**
   - Either:
     - Pass **Description** into SSOT and return **`tips: 0`** for fare-adjust rows while exporting **`priorPeriodAdjustment: number`**, **or**
   - Leave SSOT pure and **subtract** fare-adjust tip column from tips **after** SSOT in csvHelpers (clearer: extend SSOT with optional `descriptionAware` branch).
   - Ensure **`uberSsotFarePlusTipsMatch`** (or similar flags) does not break: fare-adjust rows may legitimately fail “fare + tips = earnings” heuristics—**document** whether to skip match check for those rows.

5. **Transaction type / `transactionType` field on merged trip**
   - If today `transactionType` becomes `"Tip"` when Tip column non-zero, set something like **`Fare Adjustment`** or **`Prior Period Adjustment`** when `trip fare adjust order` so Trip UI can branch without re-parsing CSV.

6. **Synthetic trips (payment row without `trip_activity` row)**
   - Confirm code path creates a trip from payment-only data; ensure **`uberPriorPeriodAdjustment`** is still set and **status** remains consistent (e.g. Completed)—no change unless a bug is found; only add fields.

7. **Idempotency / multiple rows same Trip UUID**
   - Merging multiple payment rows: **sum** adjustments into `uberPriorPeriodAdjustment` (same as tips accumulation).

8. **Deliverable for Phase 2**
   - Imported trips show correct **`uberPriorPeriodAdjustment`** and **reduced** tip fields for affected UUIDs.
   - **No** ledger or UI changes required yet to validate in DB—use import preview / debug logs if available, or unit-style manual CSV fixture.

**Stop after Phase 2 — wait for approval before Phase 3.**

---

## Phase 3 — Ledger generation and driver-overview API

**Goal:** Persist **prior-period adjustment** as distinct ledger lines and expose **period totals** for Uber (for the Period earnings modal and fleet reports).

### Phase 3 — Implementation record (complete)

| Item | Implementation |
|------|----------------|
| `generateTripLedgerEntries` | After tips: **`prior_period_adjustment`** when `Math.abs(uberPriorPeriodAdjustment) > 0.0001`; signed `netAmount`; `grossAmount = Math.abs(pp)`; direction inflow/outflow. |
| Eligible trip guard | Early exit allows **only** prior-period money (no `amount` / fare+tip) via `Math.abs(uberPriorPeriodAdjustment) > 0.0001`. |
| POST /trips + FleetSync fallback | `isEligibleUber` / `uberGross` includes **`uberPriorPeriodAdjustment`**. |
| `GET /ledger/driver-overview` | Period + lifetime: sum **`prior_period_adjustment`** into **`priorPeriodAdjustments`**; **`netEarnings`** = fare + tips + priorPeriodAdjustments + promotions − refundExpense. |
| Platform stats / daily chart | Prior-period lines add **`net`** to `pEarnings`, `pPlatformStats`, `dailyMap` (same as tips). |
| Prev-period trend query | Includes **`prior_period_adjustment`** in `eventType` filter. |
| Lifetime ledger fetch | Includes **`prior_period_adjustment`** in `eventType` list. |
| Completeness `hasMoney` (Uber) | **`uberPriorPeriodAdjustment`** included in trip gross check. |
| Repair (`RepairDriver`) | **`expectedEventTypes`** adds **`prior_period_adjustment`** when trip has non-zero `uberPriorPeriodAdjustment`; **`hasMoneyForLedger`** includes prior period. |
| Diagnostic trip-org gap | **`uberGross`** includes **`uberPriorPeriodAdjustment`**. |

**Backfill:** Re-import trips or run ledger repair for drivers with existing trips so new ledger lines are written.

### Steps

1. **Server: `generateTripLedgerEntries` (or equivalent) in `src/supabase/functions/server/index.tsx`**
   - After resolving trip financials for Uber, if **`uberPriorPeriodAdjustment`** (or stored trip field) is **non-zero**:
     - Emit **one** ledger entry per trip (or one per adjustment line if you later split—v1: **one line per trip** summing adjustments) with **`eventType`** chosen in Phase 1.
   - Set **`sourceId`** = trip `id` / Trip UUID string **consistent with existing** `fare_earning` / `tip` rows.
   - Set **`grossAmount` / `netAmount`** per existing conventions for earning-like lines (usually both equal for simple credits).

2. **Tip ledger lines**
   - Ensure **tip** events **do not** include amounts already counted as **`prior_period_adjustment`** (should be automatic if Phase 2 stripped tip buckets).

3. **Driver overview aggregation (`GET` ledger driver-overview handler in server)**
   - In the **`period.uber`** (or parallel) rollup:
     - Sum new event type into **`priorPeriodAdjustments`** (name from Phase 1).
   - Ensure **period `tips`** / **`fareComponents`** / **`netEarnings`** definitions remain consistent with product: **tips** = tip events only, not prior-period lines.

4. **Lifetime / completeness**
   - If `lifetime.uber` mirrors `period.uber`, extend similarly **or** explicitly document omission if lifetime is unused in UI.

5. **Regeneration / repair**
   - Any **“repair ledger”** or **regenerate** path must **delete stale** prior-period lines when trip data changes (same as other event types—follow **dedupe** pattern used for `fare_earning` per trip).

6. **Backfill strategy (document only if no automated migration)**
   - Re-import or **ledger repair** for affected drivers after deploy; note in `solution.md` whether a one-time admin action is required.

7. **Deliverable for Phase 3**
   - API returns **non-null** Uber prior-period total when those trips exist in range.
   - DB/ledger inspection shows distinct event lines, not duplicated in `tip`.

**Stop after Phase 3 — wait for approval before Phase 4.**

---

## Phase 4 — UI: Trip details and Period earnings breakdown

**Goal:** User-visible labels match Uber app: show **Adjustments from previous periods** instead of mislabeling as **Tips**; Period earnings Uber section includes the new line.

### Phase 4 — Implementation record (complete)

| Item | Implementation |
|------|----------------|
| Trip details | `TripDetailsDialog.tsx`: Financial section opens when `uberPriorPeriodAdjustment` is non-trivial (with or without `fareBreakdown`). Row **“Adjustments from previous periods”** (violet) after fare/tip/surge block; **not** gated on `fareBreakdown` so payment-only trips still show it. |
| Trip ledger table | `TripLedgerTable.tsx`: **Adj. previous periods** via `DetailField` when `uberPriorPeriodAdjustment` is set (including when `fareBreakdown` is absent). |
| Period earnings modal | `OverviewMetricsGrid.tsx`: Uber block shows when ledger **`priorPeriodAdjustments`** alone is non-zero; **Total earnings** / statement mismatch include prior-period; **BreakdownMoneyRow** after tips, before refunds. |

### Steps

1. **Trip details (`TripDetailsDialog` or equivalent)**
   - If **`uberPriorPeriodAdjustment`** > 0 (or abs threshold): show a row **“Adjustments from previous periods”** with formatted currency.
   - **Tips** row should reflect **actual tips** only (post–Phase 2 fields).
   - If both tips and adjustment exist, show **both**; do **not** sum them into one Tips line.

2. **Period earnings modal (`OverviewMetricsGrid.tsx` — Uber block)**
   - Add a **BreakdownMoneyRow** (or equivalent) **“Adjustments from previous periods”** sourced from **`resolvedFinancials` / ledgerOverview**:
     - Prefer **`ledgerOverview.period.uber.priorPeriodAdjustments`** once Phase 3 exists.
     - If ledger incomplete, optional fallback: **sum from `metrics` / trip list** only if product allows—**prefer single source (ledger)** for consistency with other lines.

3. **Ordering**
   - Place the new row **after** tip-like lines if Uber app orders “Adjustments” below Fare / Tips / Refunds—**mirror `payments_driver` / app order** as agreed; if unsure, place **after “Total earnings : Tip”** and **before** “Refunds & expenses” to match typical app hierarchy.

4. **Copy / tooltips**
   - One sentence: amounts come from **`trip fare adjust order`** rows in **`payments_transaction`**, not from **`payments_driver`** statement tip total alone.

5. **Deliverable for Phase 4**
   - Screenshots-level parity: Trip detail and Period earnings no longer show adjustment **only** under Tips.

**Stop after Phase 4 — wait for approval before Phase 5.**

---

## Phase 5 — Verification, edge cases, and sign-off

**Goal:** Minimize production surprises.

### Phase 5 — Implementation record (complete)

| Item | Result |
|------|--------|
| Automated tests | `npm test` runs Vitest; `src/utils/uberPriorPeriodPhase5.test.ts` covers description matching, SSOT tip zeroing for fare-adjust rows, two-row **80+80=160** accumulation (mirrors `csvHelpers` prior-period rule), negative tip column, and “completed order” exclusion. |
| Fixture / manual QA doc | `src/fixtures/uber-payments-transaction-prior-period-sample.md` — redacted scenarios A–C and reconciliation notes. |
| Numeric invariant | Period ledger **`prior_period_adjustment`** sum should equal summed import amounts for fare-adjust rows in range (Phase 3 reconciliation); automated tests lock **per-row** and **two-row sum** behavior at the helper level. |
| Edge: typo / generic “adjustment” | `isUberTripFareAdjustOrderDescription` requires exact normalized `trip fare adjust order` or that token **plus space** and suffix — **not** substring-only or `"fare adjustment"` (see tests). |
| Edge: locale suffix | `trip fare adjust order fr-ca` matches via `startsWith` rule. |
| Edge: negative amounts | **Supported:** prior amount uses signed `tipColumnVal` when non-zero, else signed `earnings`, else `Math.abs(netPayoutRaw)` (see `csvHelpers`); test asserts **−10** when Tip column is **−10**. |
| Phase 1 doc hygiene | Driver overview row updated above; final strings: **`prior_period_adjustment`**, **`uberPriorPeriodAdjustment`**, **`Prior Period Adjustment`** (`transactionType`). |

**Sign-off checklist**

- [x] Automated tests pass (`npm test`).
- [x] Fixture documentation present for manual import QA.
- [x] Edge cases documented (this table + tests).

### Steps

1. **Fixture test (manual or automated)**
   - Use a **redacted** `payments_transaction` snippet with:
     - Two `trip fare adjust order` rows (same as user’s $160 case),
     - One normal `trip completed order` with tip,
     - One `trip fare adjust order` with Trip UUID **missing** from `trip_activity`.

2. **Numeric checks**
   - Period **Uber prior-period sum** = manual sum of adjustment rows.
   - **Total period earnings** unchanged vs pre–Phase 2 **classification** (only buckets moved), unless a bug is found.

3. **Edge cases**
   - Description typo / locale variant → log once, **do not** classify as adjustment.
   - Negative adjustment (if Uber ever sends) → sign preserved in `uberPriorPeriodAdjustment` and ledger **or** document as unsupported v1.

4. **Documentation**
   - Update this file’s **Phase 1** section with **final** type names and any deviations discovered.

5. **Deliverable for Phase 5**
   - Checklist signed off; ready for merge / deploy.

**Stop after Phase 5 — implementation complete unless a follow-up phase is opened.**

---

## Current status

| Phase | Status   | Notes |
|-------|----------|--------|
| 1     | **Complete** | Types, `uberTripFareAdjustOrder.ts`, `VALID_LEDGER_EVENT_TYPES`, sanitizer |
| 2     | **Complete** | `csvHelpers.ts`, `uberSsot.ts` `parseUberPaymentTransactionSsotLine` |
| 3     | **Complete** | `generateTripLedgerEntries`, `driver-overview`, repair/diagnostic |
| 4     | **Complete** | `TripDetailsDialog`, `TripLedgerTable`, `OverviewMetricsGrid` |
| 5     | **Complete** | Vitest (`uberPriorPeriodPhase5.test.ts`), fixture doc, sign-off checklist |

**Next action:** Phases 1–5 complete. Deploy Supabase function for production ledger/driver-overview; re-import or ledger repair for backfill as needed.
