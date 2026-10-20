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

**Also applied (R4-01):** `20261020140000_r4_01_revoke_public_sd_execute` (history repaired: MCP timestamp `20261020110650` reverted → repo version marked applied).

## R4-01 · SECURITY DEFINER revoke (2026-10-20)

Applied `20261020140000_r4_01_revoke_public_sd_execute` on GoRide prod. Verified
`has_function_privilege('anon'|authenticated, …, 'EXECUTE') = false` for:
`bulk_insert_toll_ledger`, week-close claim/release, coverage/summaries,
`fleet_compute_vehicle_tag_balance`, `fleet_toll_tag_balance_rows` (both overloads).
`service_role` remains true. CI: `scripts/assert-public-fn-revoke-anon.mjs`.

## R4-02 · Toll commit money path

Edge: `prepareTollLedgerEntry` → `bulk_insert_toll_ledger` → KV mirror →
`afterTollLedgerInsert` (canonical P&L + `toll_usage`). Redeploy `fleet-core` +
`fleet-toll` before the E2E below.

## R5-01 · Bulk toll inserted_ids (2026-10-20)

Applied `20261020150000_r5_01_bulk_toll_return_ids` on GoRide prod (history
repaired: MCP timestamps `20261020113108`/`20261020113150` reverted → repo
`20261020150000` / `20261020160000` marked applied).

- RPC returns `{ inserted, skipped, inserted_ids }`; `WHEN others` removed.
- Staging status allows `partial` for money-side failures.
- Edge (`fleet-core` + `fleet-toll`) money-posts **only** inserted ids; returns
  422 + `partial` when `afterTollLedgerInsert` fails.
- SQL smoke: two rows same org/ref/date → `inserted=1`, `skipped=1`,
  `inserted_ids` length 1. Deno suites 8/8 (incl. skipped-row + partial cases).

## R5-02 · Legacy SD anon revoke (2026-10-20)

Applied `20261020160000_r5_02_revoke_legacy_public_sd`.
`finance_doctor_anon_execute_audit()` → `{ ok: true, leaks: [] }` on prod.
Default privileges closed for new `public` functions. CI guard lists all 27
audited names. `finance-doctor` edge redeployed with live privilege check.

## R4-04 / R3-03 / R5-05 · First prod wizard E2E (preview close only)

**Prerequisites:** R5-01 + R5-02 live (migrations + edge). Redeploy fleet **web**
so partial-commit toasts ship. Do this once before treating Week Reconciliation
as live for ops:

1. Fleet → Week Reconciliation → open a recent unclosed **rideshare** week (creates `recon.week_runs`).
2. Sources: upload toll CSV + Uber bundle → cards show **Covered**.
3. **DB check (R5-01):** exactly one active `toll_usage` per imported usage toll;
   **none** for duplicate/skipped rows; close must not show `TOLL_EVENT_MISSING`.
4. Tolls: walk wizard → **Finish** → confirm `toll_reconciliation_period.state = ready` for that week (and `service_line = rideshare`).
5. Fuel → Settlement → Close **preview only** (do not seal unless intentional).
6. Optional: re-upload same Uber/gas period → register must supersede (no silent 500).
7. Optional R4-05 smoke: after Sources complete, add another toll row for a Covered day → Close preview should surface `STEP_STALE` until Sources is re-finished.

Code confirmation already done: Finish calls `upsertTollPeriodRow(..., { state: "ready" })`.

| Check | Result |
|-------|--------|
| R4-01 privileges revoked | OK (prod 2026-10-20) |
| R4-02 prepare/afterInsert wired | OK (code + guard tests) |
| R4-05 live volume at close | OK (code + guard tests) |
| R5-01 bulk inserted_ids + partial | OK (prod 2026-10-20, SQL smoke + edge) |
| R5-02 anon SD sweep + doctor | OK (prod 2026-10-20, audit ok) |
| First rideshare E2E (this section) | **Ready for ops** — needs real toll CSV + Uber bundle in Fleet UI |

## If applying on a new environment

1. Apply migrations in order (`2026101921*` … `2026102003*`).
2. Expose `recon` only **after** R2-05 RLS/invoker (`ALTER ROLE authenticator SET pgrst.db_schemas …, recon`).
3. Redeploy the five fleet edge bundles from the same commit.
