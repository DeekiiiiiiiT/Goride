# Toll Recon SLOs & enforce flip (2026-09-25)

## Live defaults after enforce flip
- `TOLL_PERIOD_WRITE_GUARD` unset → **enforce** (sealed weeks return `409 PERIOD_SEALED`)
- `tollReadinessServerAuthoritative` → **ON** (landing / wizard gate / DFP close use server readiness)
- Rollback: set env `TOLL_PERIOD_WRITE_GUARD=shadow` and KV flag `tollReadinessServerAuthoritative=false`

## Canary metrics
- `weeks_awaiting_tolls` → target 0 for reviewed weeks
- `|identity residual|` ≤ $0.01 or Finish blocked
- Zero ledger writes on GET

See also: `docs/toll-recon-phase0-baseline.md`, `docs/toll-recon-slos.md`
