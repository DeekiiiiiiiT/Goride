# FUEL_SERVER_ENGINE rollout (Phase 3)

Production stays on `FUEL_SERVER_ENGINE=off` until this checklist is green. Do **not** set `enforce` in prod env until shadow is clean.

## Prerequisites (must be done first)

- Reopen / reseal **week 2026-08-24** for driver **73e5b1dc-01b4-45ee-a34a-25a3256b9841** (see `docs/fuel-recon/stage0-gate.json`).
- Finalize snapshots emit **categoryCosts** + **fuelRule** on every money week (client + server build paths).

## Rollout ladder

| Step | Env | Behavior |
|------|-----|----------|
| 0 | prod | `off` — client snapshots authoritative; server gate only via `evaluateFuelWeekClosable`. |
| 1 | prod/staging | `shadow` — `computeFuelWeek` from snapshot categories; log + audit `fuel_engine_diff`; persist drifts to `finance_recon_drift` (`kind=fuel`, fields `driverShare` / `companyShare`, source `close`). |
| 2 | staging | Shadow **≥ 2 full weeks** with zero unexpected drift (or documented exceptions). |
| 3 | staging → prod | `enforce` — 422 `SNAPSHOT_MISMATCH` on diff; break-glass `X-Fuel-Force-Client-Money` + reason only during initial soak. |

## Phase 3 loaders (not done)

HTTP finalize still recomputes from **snapshot categoryCosts**. Phase 3 loaders should rebuild `WeekCalc` from entries/trips server-side; until then, shadow/enforce uses the cheap snap-category path (see TODO in `fuel_period_routes.ts` finalize handler).

## Nightly

`finance-recon` cron calls `upsertLockedFuelWeekStatementLedgerDrifts` for **locked** `fuel_reconciliation_period` rows: finalized snapshot vs fuel `week_statements` vs active `fuel_*` ledger events → `finance_recon_drift` with `source=nightly`, `kind=fuel`.

## Four-site gate

`evaluateFuelWeekClosable` runs with real inputs on:

1. Wizard finalize (`FuelPeriodWizard` + `fuelFinalizeService`)
2. HTTP `POST …/fuel/periods/:id/finalize`
3. Auto-close cron (`fuel_period_routes` auto-close loop)
4. Bulk finalize (`FuelBulkFinalizeDialog` + `fuelFinalizeService`)

Blockers map to user-visible errors/skips (`fuelWeekClosableBlockerMessage`, HTTP 422 `blockers[]`, auto-close `skip_<code>`).
