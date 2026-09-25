/**
 * Toll reconciliation SLOs + instrumentation (audit §12).
 * Starting proposal — wire metrics before treating targets as measured.
 */

## Canary (TR-C1)

| Metric | Meaning | Target |
| --- | --- | --- |
| `toll_recon.weeks_awaiting_tolls` | Weeks with landing “Completed/Reviewed” but `payout_status = awaiting_tolls` (or readiness blockers ≠ ∅) | **0** |
| `\|wizard.actionable − readiness.actionable\|` | Client vs server step parity over last 26 weeks | **0** |
| `readiness.blockers = ∅ ⟺ tollsClearFromGate` | Finish/close gate agreement | Always |

## Metrics to emit

- `toll_recon.wizard_open.duration_ms` (p50/p95/p99) — split client vs server
- `toll_recon.endpoint.duration_ms{route}` — ledger-loading routes especially
- `toll_recon.ledger_loads_per_page_open` — target **1** (was ~5)
- `toll_recon.finish` / `toll_recon.finish_to_close_lag_hours`
- `toll_recon.weeks_awaiting_tolls` — **TR-C1 canary; must go to zero**
- `toll_recon.identity_residual_abs` (p95)
- `toll_recon.command.{name}.{outcome}` — break out `PERIOD_SEALED` / `PERMISSION_DENIED`
- Client: wizard INP; time-to-interactive after step switch

## Proposed latency / quality SLOs

| Metric | Target |
| --- | --- |
| Period landing TTI | p95 < 1.5 s |
| Wizard open (all calls settled) | p95 < 2.5 s |
| Step switch INP | p95 < 200 ms |
| Single reconcile/approve/reject round trip | p95 < 600 ms |
| Bulk link, 50 rows | p95 < 8 s, with visible progress |
| `/periods` (26-week aggregate) | p95 < 2 s |
| Weeks reconciled-but-not-closeable | **0** |
| `\|identity residual\|` per week | **≤ $0.01** |

## Validation gates (before behaviour flips)

- Controls armed in the **same commit** as flips (`scripts/check-toll-core-parity.mjs` in CI).
- Parity log: zero client/server mismatches for two consecutive weeks.
- Unit/integration: Finish → readiness → seal path; sealed-week write → `409 PERIOD_SEALED`.
- E2E: `pnpm test:e2e:toll` extended for the same path when feasible.
