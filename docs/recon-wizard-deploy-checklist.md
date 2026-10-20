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

## R3-02 · Migration history repair (2026-10-19)

Prod objects already existed (hand-applied), but `schema_migrations` only listed stray versions that matched no repo file. Repaired so `supabase db push` will not re-run recon DDL.

**Before:** remote had `20261020011817` / `20261020011850` (recon_p0_*); repo versions for P0–P7 were missing from history. Also remote `20261019185454` vs local `20261019190000` (station merchant RLS).

**Commands run (linked to `csfllzzastacofsvcdsc`):**
```bash
supabase migration repair --status reverted 20261020011817
supabase migration repair --status reverted 20261020011850
supabase migration repair --status applied 20261019210000
supabase migration repair --status applied 20261019210100
supabase migration repair --status applied 20261019210200
supabase migration repair --status applied 20261019220000
supabase migration repair --status applied 20261019230000
supabase migration repair --status applied 20261020000000
supabase migration repair --status applied 20261020010000
supabase migration repair --status applied 20261020020000
supabase migration repair --status applied 20261020030000
supabase migration repair --status reverted 20261019185454
supabase migration repair --status applied 20261019190000
```

**After:** `supabase migration list --linked` shows Local = Remote for all recon_p* versions above. Confirm with a dry push before any new migration.

**Also applied (R3 close-out):** `20261020120000_recon_r3_indrive_stmt_and_line_gates` (InDrive stmt coverage, period `service_line`, `bulk_insert_toll_ledger`).

## R3-03 · First prod wizard E2E (preview close only)

Do this once before treating Week Reconciliation as live for ops:

1. Fleet → Week Reconciliation → open a recent unclosed **rideshare** week (creates `recon.week_runs`).
2. Sources: upload toll CSV + Uber bundle → cards show **Covered**.
3. Tolls: walk wizard → **Finish** → confirm `toll_reconciliation_period.state = ready` for that week (and `service_line = rideshare`).
4. Fuel → Settlement → Close **preview only** (do not seal unless intentional).
5. Optional: re-upload same Uber/gas period → register must supersede (no silent 500).

Code confirmation already done: Finish calls `upsertTollPeriodRow(..., { state: "ready" })`.

## If applying on a new environment

1. Apply migrations in order (`2026101921*` … `2026102003*`).
2. Expose `recon` only **after** R2-05 RLS/invoker (`ALTER ROLE authenticator SET pgrst.db_schemas …, recon`).
3. Redeploy the five fleet edge bundles from the same commit.
