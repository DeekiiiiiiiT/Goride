# Wiring Consumption Reconciliation (Fuel) into Business Finance

**Status: implemented (2026-07-20)** — mirrors Toll Reconciliation → Business Finance.
**Offsets are always on** (no settings toggle) — Finalize / toll resolve sync Business Finance automatically.

## Product rules (locked)

- Fleet fuel loss = `fuel_expense` gross − `fuel_charge_offset` inflows + reinstatement outflows.
- Offset amount on Finalize = **driver-charged share only** (`driverShare` via blended ratio per fill).
- Company share (including company-covered Deadhead) stays on the Fuel P&L line.
- `fuel_reimbursement` is wallet-path memo only — shown in Fuel accordion, **not** netted into fleet loss.

## How it works

**1. Canonical ledger bridge**

- Create fill → `fuel_expense` (`fuel_entry:{id}|fuel_expense`) via `appendCanonicalFuelExpenseIfEligible`.
- Finalize → per-entry `fuel_charge_offset` (inflow) via [`fuel_pnl_offset.ts`](../supabase/functions/server/fuel_pnl_offset.ts).
- Reset / re-finalize → reinstate (outflow) then re-emit with new amounts (versioned markers).

**2. Shared netting** — [`fuelFleetLossNetting.ts`](../utils/fuelFleetLossNetting.ts), consumed by Business Finance.

**3. Business Finance** — `buildPnLFromCanonicalEvents` nets Fuel like Tolls; `PnLFuelBreakdown` accordion; event-count fallback (never treat net $0 as empty ledger).

**4. Health** — `GET …/fuel-reconciliation/periods-health` → `fuelVarianceFlags` on Overview.

**5. Backfill** — Fuel Configuration → Business Finance panel (historical weeks only); dry-run-default under `fuel-pnl-offset-backfill/*`.

## Owner verification

1. Finalize a week → Fuel P&L drops by ~driver share; accordion shows breakdown.
2. Reset period → Fuel returns to gross.
3. Re-finalize with different scenario % → Fuel tracks new driver share.
4. Deadhead 100% company → stays in fleet loss; 0% company → leaves via driver-share offset.
5. Backfill dry-run lists candidates; apply writes offsets for older finalized weeks.
