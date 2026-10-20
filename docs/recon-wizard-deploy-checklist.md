# Week Reconciliation wizard — deploy checklist (Phase B4)

## Done on GoRide prod (`csfllzzastacofsvcdsc`) — 2026-10-19

No Supabase branch DB was available; fixed migrations were applied directly after R2-03/05/09/10 code fixes.

| Check | Result |
|-------|--------|
| `recon` schema + RLS on all recon tables | OK |
| Staging views `security_invoker=true` | OK |
| `try_claim_week_close` 5-arg (`p_service_line`) | OK |
| `fleet.trips` NULL `service_line` count | **0** |
| UNIQUE `fleet_toll_ledger_org_provider_ref_date_uidx` | OK |
| `authenticator` `pgrst.db_schemas` includes `recon` | OK |
| Edge redeploy: core / toll / fuel / pay / claims | OK (smoke health passed) |

## Production flags (flipped 2026-10-20 — full prod, no canary)

| Flag | Where | Value |
|------|--------|--------|
| `RECON_WIZARD` | Supabase edge secrets | `1` |
| `feature_flag:recon_wizard` | KV | `enabled: true` |
| `SOURCE_ENFORCE` | Supabase edge secrets | `enforce` |
| Client wizard | `useReconWizardEnabled` | **default ON** (set `VITE_RECON_WIZARD=0` only to roll back UI) |

Redeploy fleet web so clients pick up the wizard default / `VITE_RECON_WIZARD=1`.

## If applying on a new environment

1. Apply migrations in order (`2026101921*` … `2026102003*`).
2. Expose `recon` only **after** R2-05 RLS/invoker (`ALTER ROLE authenticator SET pgrst.db_schemas …, recon`).
3. Redeploy the five fleet edge bundles from the same commit.
