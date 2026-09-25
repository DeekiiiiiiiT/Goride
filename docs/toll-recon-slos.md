/**
 * Toll reconciliation SLOs + instrumentation (audit §12).
 * Names are emitted as structured logs / Sentry breadcrumbs (Rev 3 closeout).
 */

## Canary (TR-C1)

| Metric | Meaning | Target | Status (2026-09-25) |
| --- | --- | --- | --- |
| `toll_recon.weeks_awaiting_tolls` | Weeks with landing “Completed/Reviewed” but `payout_status = awaiting_tolls` | **0** | **Measured: 0** driver-rows in last 26w |
| `\|wizard.actionable − readiness.actionable\|` | Client vs server step parity over last 26 weeks | **0** | Parity tests in CI |
| `readiness.blockers = ∅ ⟺ tollsClearFromGate` | Finish/close gate agreement | Always | **TR-C1a closed** — truth-table + seal-path tests |

## Metrics emitted

- `toll_recon.wizard_open.duration_ms` — client Sentry breadcrumb on wizard bundle load
- `toll_recon.endpoint.duration_ms{route}` — server (wire per hot route as needed)
- `toll_recon.ledger_loads_per_page_open` — request-scoped memo; target **1** unique (from,to) per open
- `toll_recon.weeks_awaiting_tolls` — TR-C1 canary
- `toll_recon.identity_residual_abs`
- `toll_recon.command.{name}.{outcome}` — includes `PERIOD_SEALED`

## Proposed latency / quality SLOs

| Metric | Target | Measured? |
| --- | --- | --- |
| Period landing TTI | p95 < 1.5 s | Pending (needs HAR week) |
| Wizard open (all calls settled) | p95 < 2.5 s | Emitting; p95 TBD |
| Step switch INP | p95 < 200 ms | Pending |
| Single reconcile/approve/reject round trip | p95 < 600 ms | Pending |
| Bulk link, 50 rows | p95 < 8 s, with visible progress | Pending |
| `/periods` (26-week aggregate) | p95 < 2 s | Pending |
| Weeks reconciled-but-not-closeable | **0** | **0 awaiting_tolls** post-flip |
| `\|identity residual\|` per week | **≤ $0.01** | Control live at Finish |

## Validation gates (before behaviour flips)

- Controls armed in the **same commit** as flips (`scripts/check-toll-core-parity.mjs` in CI).
- Parity log: zero client/server mismatches for two consecutive weeks.
- Unit/integration: Finish → readiness → seal path; sealed-week write → `409 PERIOD_SEALED`.
- E2E: `pnpm test:e2e:toll` extended for the same path when feasible.
- Seal-guard inventory canary: `toll_period_seal_guard.test.ts` in CI.
