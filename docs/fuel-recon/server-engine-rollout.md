# FUEL_SERVER_ENGINE rollout (Rev 5)

## Current prod

**`FUEL_SERVER_ENGINE=off`** on Supabase Edge Function secrets until `make-server-37f42386` deploys with N-15.

**Ready in tree:** after that deploy, set `FUEL_SERVER_ENGINE=enforce` (Supabase secrets — not Vercel).

Do **not** flip enforce while prod still runs the pre–N-15 loader: untagged `settledEntries` would dump all spend into `rideShareCost` and refuse every finalize.

Authority for category recompute (once live): **`metadata.tripCategoryAgg`** (Engine A stamp from finalize). Untagged `settledEntries` are wallet evidence only. Server trip/odometer reload remains a follow-up.

## Stage 0

DONE (2026-09-15): week **2026-08-24** / driver **73e5b1dc…** statement↔ledger **$0**. See `docs/fuel-recon/stage0-gate.json`.

## N-15 (Rev 5)

- Finalize emits `tripCategoryAgg` = `categoryCostsFromReport` (same Engine A costs).
- `resolveEngineCategoryCosts` prefers tripAgg, else tagged entries, else snap `categoryCosts`.
- Enforce CI uses **production-shaped** snaps (no invented `usageCategory`).

## Break-glass

`X-Fuel-Force-Client-Money: 1` + body `forceReason` ≥ 8 characters — logged; not for routine closes.

## Nightly (#31)

`finance-recon` cron → `upsertLockedFuelWeekStatementLedgerDrifts` for locked periods → `finance_recon_drift` (`source=nightly`).

## Closable gate

`evaluateFuelWeekClosable` on wizard finalize, HTTP finalize, auto-close, bulk finalize. KV loads: invalidate-per-eval + 60s TTL (N-12); SQL date-scoped pushdown with org-scoped fallback (P-3).

## Seal / materialize

- **`sealFuelWeek`**: one rebuild map per seal; probe compare hoists rebuild once (P-4).
- **`POST …/materialize`**: money from finalized snaps when present (`server:materialize:snaps:N`).
