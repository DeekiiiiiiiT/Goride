# GCT Cutover Runbook — COMPLETE

**Status: done.** Accounting `gct_rates` is the sole live charge source.

## Follow-ups closed after cutover

- **V11** — `public.gct_*` views use `security_invoker`; sensitive tables not SELECT-able by `authenticated`.
- **V12** — Merchant setup copy + fixtures at 15%.
- **V8b** — Expense Hub posts with vendor TRN shadow-write `gct_input_tax` (manual/CSV remains).
- **F3** — Blank-TRN `gct_registered` merchants reset; CHECK prevents regression.

## Day-to-day

| Need | Where |
|---|---|
| Change standard rate | Dominion → Accounting → GCT → Rates & classes |
| Kill switch | `POST /gct-admin/resolver-flags` `{ "gct_enabled": false }` |
| Registrations / Roam TRN | GCT → Registrations |
| Remittance | GCT → Remittance & filing |

Paper sign-off: [GCT_PHASE0_OPS_CHECKLIST.md](./GCT_PHASE0_OPS_CHECKLIST.md).
