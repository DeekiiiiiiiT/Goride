# Pass 5 — Integrity loop complete — 2026-09-07

## Delivered

1. **Statement ↔ engine compare** (`packages/finance-core/src/statementEngineCompare.ts`) with Close Week **block** codes `FUEL_ENGINE_DRIFT` / `TOLL_ENGINE_DRIFT` / `EARNINGS_ENGINE_DRIFT`.
2. **Durable drift** table `ledger.finance_recon_drift` (+ public view); upsert from close preview/close, rebuild, nightly.
3. **`sealEarningsWeek`** — independent earnings publisher; DFP rebuild publishes **draft** only.
4. **Business Finance P&L feed** — sealed statement fleet composition vs desk composition.
5. **Perf** — TollBucketPanel windowed; fuel entry SQL helper for admin list/purge paths.
6. **Aug 24 re-signed** after engine-aligned seals (see `2026-09-07-pass5-aug24-resign.md`).

## Ops notes

- Close auto-seal no longer clobbers standing **closed** statements.
- Toll probe reuses seal’s quarantined event loader (no dual paths).
- Known residual: trip CSV vs ledger cash for Aug 24 acknowledged in metadata (`pass5CashAck`) so freeze could complete.
