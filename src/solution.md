## Uber CSV Import — Enterprise Architecture (Phase-by-Phase)

Goal: Make Uber importing deterministic and reconcilable so that the app can reliably reproduce Uber statement figures with minimal drift.

Non-goals (for now):
- No allocation of statement-level values to trips unless Uber provides a reliable per-trip key.
- No “best guess” math hidden in the UI.

### Global Definition Contract (applies to all phases)
We define a single source-of-truth (SSOT) decomposition for a selected period:

1. PeriodEarnings_Gross (matches Uber `Total Earnings` for the period)
   = FareComponents + Promotions + Tips

2. NetEarnings (optional card)
   = PeriodEarnings_Gross - RefundsAndExpenses

3. Tips (separate card)
   = sum(TipsEvent) for the period

4. Refunds & Expenses (separate card)
   = sum(RefundsAndExpensesEvent) for the period

All cards and totals must reconcile against the SSOT totals produced by the ledger/event layer.

### Uber Source Files (typical inputs)
- `trip_activity.csv` (trip UUID + addresses + trip meta)
- `payments_transaction.csv` (transaction/line items per trip UUID + fare/tip components + adjustments/refunds)
- `payments_driver.csv` (driver statement totals for the period)
- `payments_organization.csv` (org statement totals for the period)
- `driver_activity.csv`, `driver_quality.csv`, `driver_time_and_distance.csv`, `vehicle_*` (operational/quality, not for revenue decomposition)

### Invariants we will enforce
1. Tips are counted exactly once in PeriodEarnings_Gross.
2. Promotions are counted exactly once in PeriodEarnings_Gross.
3. FareComponents exclude tips (so FareComponents + Tips = gross revenue components).
4. Every card is computed from ledger events (not duplicated computations scattered across the app).

---

## Phase 1 — Lock the Definitions + Create the SSOT Event Schema
Purpose: Remove ambiguity by creating an explicit “what counts as what” contract and mapping it to an event schema.

Steps:
1. Confirm the reconciliation formulas in the SSOT:
   - PeriodEarnings_Gross = FareComponents + Promotions + Tips
   - NetEarnings (optional) = PeriodEarnings_Gross - RefundsAndExpenses
2. Define the event types that the ledger can store, at minimum:
   - `fare_earning` (FareComponents only; excludes tips)
   - `tip` (Tips only)
   - `promotion` (Promotions only; statement-level by default unless per-trip allocation is proven)
   - `refund_expense` (Refunds & expenses; statement-level by default)
3. Define mapping rules from CSV columns into SSOT components:
   - Which columns are treated as “FareComponents”
   - Which columns are treated as “Tips”
   - Which columns are treated as “Promotions”
   - Which columns are treated as “RefundsAndExpenses”
4. Define ledger aggregation logic:
   - Period totals computed as sum of SSOT events for the date range
5. Define reconciliation checks (import audit):
   - After import, assert that FareComponents + Promotions + Tips equals Uber statement `Total Earnings` (within a rounding tolerance).
   - On mismatch, produce a structured report (which component mismatched, by how much, and sample Trip UUIDs when applicable).

Acceptance criteria:
- SSOT decomposition is documented and unambiguous.
- Ledger aggregation can reproduce SSOT component totals.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 2”.

---

## Phase 2 — Build a Canonical Uber “Trip Revenue Model” (Importer Layer)
Purpose: Parse Uber CSVs into a canonical internal model before any ledger generation.

Steps:
1. Parse `trip_activity.csv`:
   - Create TripMeta objects keyed by Trip UUID
   - Store pickup/dropoff addresses, times, distance, status
2. Parse `payments_transaction.csv`:
   - Create TripFinancialLine objects keyed by Trip UUID (when present)
   - Extract and store: fare components, tips, adjustments/refunds components
3. Parse `payments_driver.csv`:
   - Extract driver period statement totals: Total Earnings, Tip, Promotions, Refunds & Expenses
4. Reconcile and store per-trip canonical model:
   - For each Trip UUID:
     - FareComponents
     - Tips
     - Flags if components cannot be decomposed reliably
5. Handle “payments exists but activity missing”:
   - Still import revenue components
   - Record `tripMetaMissing` for UI messaging and audit trails
6. Handle adjustments:
   - If adjustment row is clearly tied to a component, store it in that component.
   - If ambiguous or statement-level only, store it as statement-level `refund_expense` with audit note.

Acceptance criteria:
- Canonical per-trip model separates FareComponents vs Tips (no mixing).
- Import audit flags mismatches without corrupting components.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 3”.

---

## Phase 3 — Ledger Generation from SSOT Only (Single Source of Truth)
Purpose: Generate ledger events exclusively from the SSOT canonical model (remove duplicate formulas).

Steps:
1. Implement/adjust ledger event generator to use SSOT components:
   - `fare_earning` from FareComponents only
   - `tip` from Tips only
   - `promotion` and `refund_expense` as statement-level events unless safe allocation is proven
2. Ensure idempotency & deduplication:
   - Ledger entry keys incorporate sourceType/sourceId/eventType/componentKey/periodKey for statement-level.
3. Ensure zero/double counting protection:
   - Tips event never derived from fields that already include tips.
4. Error isolation:
   - If ledger generation fails for one trip, continue generating ledger for other trips; record which Trip UUIDs failed.

Acceptance criteria:
- Ledger aggregation can reproduce SSOT PeriodEarnings_Gross.
- No double-counting: tips appear once in totals.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 4”.

---

## Phase 4 — Promotions + Refunds/Expenses Strategy (Statement-Level First)
Purpose: Stop fragile allocations; make totals correct and auditable.

Steps:
1. Compute promotions and refunds/expenses totals from statement files:
   - Promotions total
   - Refunds & expenses total
2. Store statement-level ledger events:
   - `promotion` (period)
   - `refund_expense` (period)
3. Only allocate to trips if we have a reliable and proven per-trip key:
   - Allocation is opt-in (guarded) and always produces an import audit diff.

Acceptance criteria:
- Statement-level totals match Uber statement totals precisely.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 5”.

---

## Phase 5 — Integrity Monitoring + Repair Without Regressions
Purpose: Detect gaps immediately and provide reliable repair paths.

Steps:
1. Expand integrity checks to SSOT component-level:
   - FareComponents ledger vs SSOT FareComponents
   - Tips ledger vs SSOT Tips
   - Promotions ledger vs SSOT Promotions
   - Refunds ledger vs SSOT Refunds
2. Add “definition mismatch” detection:
   - If UI card decomposition cannot sum to PeriodEarnings_Gross within tolerance, show a specific error.
3. Repair workflow must be component-aware:
   - Repair missing SSOT-derived event types only.
   - Repair should not duplicate tips or promotions.

Acceptance criteria:
- No more “trips exist but ledger missing” silent failures.
- Repair is safe and component-aware.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 6”.

---

## Phase 6 — UI Architecture as a Reconciliation View
Purpose: Make UI show coherent decomposition that always sums back.

Steps:
1. Update UI cards to match SSOT:
   - Period Earnings (Gross) = FareComponents + Promotions + Tips
   - Tips card (required)
   - Promotions card (optional)
   - Refunds & Expenses card (optional) and Net Earnings card (optional)
2. Ensure UI reads directly from ledger aggregation:
   - UI never recomputes with mixed trip fields.
3. Add reconciliation indicators:
   - If component sum != Period Earnings (within tolerance), show mismatch warning.

Acceptance criteria:
- Cards reconcile by design (no hidden drift).

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 7”.

---

## Phase 7 — Data Model Cleanup + Redundancy Removal
Purpose: Remove fragile duplicated math across layers.

Steps:
1. Audit all “uber totals” calculations:
   - Importer
   - Ledger generator
   - Driver dashboard / overview
   - Trip pages & analytics
2. Centralize SSOT logic:
   - Importer builds SSOT canonical model only
   - Ledger maps SSOT to event types
   - UI reads ledger totals
3. Deprecate misleading fields:
   - Stop using fields like “net payout” for mixed semantics in Uber.

Acceptance criteria:
- Exactly one SSOT definition used end-to-end.
- Redundant computations removed.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 8”.

---

## Phase 8 — Testing + Fixtures + Regression Harness
Purpose: Prove correctness with real CSV fixtures.

Steps:
1. Create deterministic test fixtures:
   - March 16–23 bundle
   - March 23–29 bundle
2. Automate:
   - Import parse + SSOT decomposition
   - Ledger aggregation to SSOT match
3. Assertions:
   - FareComponents + Promotions + Tips = Uber `Total Earnings`
   - Tips card equals SSOT Tips
   - Refunds & expenses card equals SSOT refunds
4. Regression scenarios:
   - Trips present in payments but absent in trip_activity
   - Multiple transaction rows per Trip UUID (completed + fare adjust)
   - Tip-only / adjustment-heavy periods

Acceptance criteria:
- Re-running fixtures guarantees no regressions like tip double-counting.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 9”.

---

## Phase 9 — Performance, Observability, and Operational Safety
Purpose: Prevent silent partial failures and improve debuggability.

Steps:
1. Structured import audit logs:
   - component diffs
   - missing metadata counts
   - mismatched totals with tolerances
2. Structured ledger generation logs:
   - per-trip ledger errors with Trip UUID
   - keep going even if a trip fails
3. Operational safety:
   - repairs must be idempotent
   - no “batch abort” leaving partial ledger
4. Optional admin diagnostic view:
   - show component mismatch breakdown, drill-down by Trip UUID

Acceptance criteria:
- Imports fail loudly and safely; repairs are reliable.

Checkpoint:
- Stop. Wait for your confirmation: “Start Phase 10” (if needed) or implementation schedule.
