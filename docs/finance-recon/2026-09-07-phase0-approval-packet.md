# Phase 0 → Phase 1 — Product Owner Approval Packet

**Program:** Flawless Weekly Close
**Prepared:** 2026-09-07
**Reference:** [`RECONCILIATION_SYSTEM_AUDIT.md`](../../RECONCILIATION_SYSTEM_AUDIT.md) · [before snapshot](./2026-09-07-before.md)

> This packet is a **gate**. Phase 1 (any change that alters a produced number)
> does not begin until the Product Owner signs each section below. Phase 0 is
> read-only characterization only.

---

## 1. Blast radius

### 1.1 Driver settlements

- **What could move:** `settlement_amount`, `payout_net`, `cash_still_held` on
  `ledger.driver_financial_periods`.
- **Baseline pinned:** `docs/fixtures/periods-baseline-2026-09-07.json`
  (via `scripts/export-periods-baseline.mjs`).
- **Rows in scope:** **36** driver-weeks (exported 2026-09-07 from GoRide `ledger.driver_financial_periods`).
- **Known-wrong today:** the `−$27,898.73` negative-fuel-share week (Aug 31 – Sep 6 consumption week in the audit screenshots).
- **Settlement status mix (baseline):** pending / company_owes / driver_owes / settled — several weeks still `moneyUnlocked=false` (blocked).
- **Historical restatement:** human-approved only (see §2). Engines fix forward; flagged weeks enter the restatement queue after Phase 1 goldens.

### 1.2 Toll reconciliation

- **What could move:** the four KPI cards — Spend, Reimbursed, Charged to
  Drivers, Net Toll Loss.
- **Characterization:** `scripts/toll-card-identity-residual.mjs` +
  `packages/toll-core/src/tollCardIdentity.ts`.
- **Identity:** `Spend − Reimbursed − ChargedToDrivers − NetTollLoss ≈ 0`.
- **Open (non-closing) weeks today:** _[fill from residual script]_

### 1.3 Fuel reconciliation

- **What could move:** company vs driver fuel share where `miscellaneousCost`
  is large relative to spend.
- **Characterization:** `scripts/fuel-misc-blast-radius.mjs` +
  `packages/fuel-core/src/fuelFinalizeGate.ts` (gate ratio `0.25`).
- **Flagged (over-explained) weeks today:** _[fill from blast-radius script]_

---

## 2. Historical restatement policy

**Default: no historical week is ever restated automatically.**

- A week that has already been closed is **immutable** unless a human explicitly
  approves a restatement of that specific week.
- Any code path that would rewrite a prior week's produced numbers must be gated
  behind an explicit, logged, human approval — never triggered by a late import
  or a background rebuild.
- Restatements, when approved, are recorded (who, when, why, before/after) and
  the corresponding baseline fixture is re-exported and re-committed.

**PO sign-off (restatement policy):** ______________________  Date: __________

---

## 3. Phase 1 change list gate

Phase 1 may only touch items on an approved list. Proposed list:

| # | Change | Screens affected | Numbers that move | Human-approved? |
|---|--------|------------------|-------------------|-----------------|
| 1 | C-1 Remove Math.abs on fuel share; post signed fuel events | Fuel, Settlements | fuel_deduction, settlement_amount | ☐ |
| 2 | C-2 Misc gate + floor negative misc for split | Fuel recon | driver/company fuel share | ☐ |
| 3 | C-7 Signed settlement inputs (no silent clamps) | Settlements | tollPersonal, settlement residual | ☐ |
| 4 | H-3/H-5/H-6 Fuel reversal append-only; Fixed_Amount parity; anchor match | Fuel | fuel shares / wallet txs | ☐ |
| 5 | C-3/C-4/C-5 Toll identity + signed net + one dispute week | Toll recon | Net Toll Loss, refunds | ☐ |
| 6 | C-6 Real closeWeek + freeze writers | Close Week | none until close (blocks rewrite) | ☐ |

- No item ships without a characterization golden pinning its before-state.
- No item ships that changes a produced number without an explicit row above.

**PO sign-off (Phase 1 change list):** ______________________  Date: __________
