# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 14 · 2026-10-26 · §1.7 live · Sep 14 Tolls unblocked · owner ops remain for close ladder + cash gates**

Rev 1–13 are in git history.

> **Next action (owner):** reopen Week Reconciliation for Sep 14 → Tolls → complete → continue Tag → Fuel → Trips → Settlement → Close. Then Sep 21 → Sep 28 → Oct 5 in order.

## Verified this round (prod)
- **The double count is fixed.** `uniqueTollRowsById` is used at both merges in `ReconciliationWizard.tsx` and has a test in `tollSpend.test.ts`.
- **Sep 7 is closed and settled at 0.00.** Toll statement: spend 3,595 − reimbursed 3,045 − charged 550 = net 0.
- **Sep 7 money ties:** payout net of cash held left **699.85** owed to Kenny. Cash `pay` `bb0ee186-ac67-4016-8791-b154bab5be96` for 699.85 posted 2026-10-26 17:22 UTC (still posted — not reversed).
- **§1.7 fixed and deployed** (`fleet-toll`). Finish now seals + rebuilds + refreshes `recon.week_blockers`.
- **Sep 14 healed:** toll `week_statement` closed v1 exists; period `state=sealed`; `TOLL_STATEMENT_MISSING` cleared from blockers (remaining: `FUEL_STATEMENT_MISSING`, `EARNINGS_STATEMENT_UNVERIFIED` — later steps).
- **§1.3 backfilled** in `ledger.entries`: `toll_charge` + `toll_charge_offset` (personal) for `090bd599…` and `ea0380fb…`. `toll_charged_to_driver` already existed.
- **Later weeks:** Oct 19 still expected **+37,397.13** until further closes/corrections.

## Status

| Item | Status |
|---|---|
| §1.7 Tolls step seal-on-finish | **Done** (code + deploy + Sep 14 seal heal) |
| §1.6 Attest UX | **Done** (code; ship with fleet frontend) |
| §1.3 Personal P&L events | **Done** (heal + Personal path regression test) |
| §1.4 Oct 12 correction pointer | **Done** (`ReconciledPeriodOverlay`) |
| §1.2 Close Sep 14→Oct 5 | **Unblocked — owner ops** |
| §1.1 $699.85 cash to Kenny | **Owner check** (pay still posted) |
| §1.5 Oct 12 cash mismatch 3,201.27 | **Owner check** (endpoint ready; do not post until Uber confirms) |

---

## 1. Owner ops remaining

### 1.1 Confirm the $699.85 cash really went to Kenny
- Movement: `bb0ee186-ac67-4016-8791-b154bab5be96` · kind `pay` · 699.85 · Sep 7 · status `posted`.
- If **not** handed over: Settlements → Paid out → Undo/Reverse with reason. Do not edit the row.
- If handed over: leave it.

### 1.2 Close Sep 14 → Oct 5, in order
Route: `/week-reconciliation?line=rideshare&week=YYYY-MM-DD`

| Week | Tolls | No trip (pending) | Notes |
|---|---|---|---|
| Sep 14 | 4 | 4 | Tolls sealed — complete step, then Tag→Fuel→Trips→Settle→Close |
| Sep 21 | 12 | 11 | Finish Tolls (seal-on-finish is live) |
| Sep 28 | 6 | 5 | |
| Oct 5 | 12 | 9 | |

- Match or resolve pending no-trip tolls in the Tolls step (normal work).
- Settlement preview: log **only cash really received**.
- After each close: confirm Oct 19 still **+37,397.13**.

### 1.5 Oct 12 cash source mismatch 3,201.27
- Ledger used 22,470.65 Uber cash; trip sum 19,269.38 (gap 3,201.27).
- If Uber’s own cash report = **22,470.65** → nothing.
- If Uber = **19,269.38** → `POST fleet-pay …/settlements/oct12-cash-mismatch-correction` with `{ confirm: true, driverId: "73e5b1dc-01b4-45ee-a34a-25a3256b9841" }` (idempotent +3,201.27 on open week). Do not reopen Oct 12.

---

## 2. Engineering done (Rev 14)

### 2.1 §1.7 Seal on finish
- [`toll_period_controller.tsx`](supabase/functions/_fleet-server/toll_period_controller.tsx): finish → `sealTollWeek` → `runTollSealSideEffects` (rebuild + blockers + desk) → period `sealed`. Seal failure fails finish.
- Helper: [`toll_finish_seal_side_effects.ts`](supabase/functions/_fleet-server/toll_finish_seal_side_effects.ts).
- Deployed: `fleet-toll`.
- Heal used for already-ready Sep 14: `scripts/heal-sep14-toll-seal.ts`.

### 2.2 §1.6 Attest UX
- [`ReconSourcesStep.tsx`](apps/fleet/src/components/fleet-financials/recon/ReconSourcesStep.tsx): per-source busy set, clear busy before background refresh, toast on errors / 409.

### 2.3 §1.3 Personal P&L
- Heal: [`heal_personal_toll_pnl_events.ts`](supabase/functions/_fleet-server/heal_personal_toll_pnl_events.ts) + `scripts/heal-personal-toll-pnl-events.ts` (ran in prod).
- Personal resolve still emits `emitDriverTollCharge` + `emitTollChargeOffset` (regression test).

### 2.4 §1.4 Oct 12 UI
- Closed Oct 12 overlay shows **Corrected in Oct 19: −13,191.88** under Fuel credit / How it closed.

### 2.5 §1.5 Correction path (gated)
- [`oct12_cash_mismatch_correction.ts`](supabase/functions/_fleet-server/oct12_cash_mismatch_correction.ts) + `POST …/oct12-cash-mismatch-correction` on `fleet-pay` (deployed). Requires `confirm: true`.

### 2.6 Do not
- Reopen Oct 12 or post a second −13,191.88 claw-back.
- Edit cash rows — reverse only.
