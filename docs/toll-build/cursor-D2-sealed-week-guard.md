# Give Cursor this — Toll disputes, Round D2 (sealed-week guard in the database)

You are building **Round D2 only** of `docs/toll-architecture-gap-audit.md` (Rev 19). Read these first; they are the spec:
- **L2.2 row B13**
- **Part 0** (the forward-only rule)
- **C4.8**
- **Part F**

D1 is done: `supabase/migrations/20261117234730_toll_disputes_data.sql`.

**Goal (one sentence):** a sealed week's toll money can't change, even if a command has a bug, because the database itself refuses it.

## Look first (read these before writing anything)
- `toll_system.week_is_sealed(company, week)` in `supabase/migrations/20261112184544_toll_v2_money_core.sql` (section 3).
- The existing `toll.writer` session flag and the `toll.tg_ledger_entries_guard` trigger in the same file (section 5). Copy that style.
- `toll_write.intent_seal_week`, `toll_write.intent_reopen_week` and `toll_write.intent_carry_forward` (find their latest `CREATE OR REPLACE` in `supabase/migrations/`).
- `toll_system.charge_counted_week(company, charge_id, week_key)`: the week a charge counts in.
- How a ledger entry's week is known (the column or reference the toll postings use).

## What to build

### 1. One new migration
Create it with `npx supabase migration new toll_sealed_week_guard` (real current UTC time).

1. **Session flag `toll.seal_writer`.** Only `intent_seal_week` and `intent_reopen_week` set it to `'on'` (transaction-local, `set_config(..., true)`), and they set it back to `'off'` before returning, the same way `toll.writer` is handled. Change only those two functions to do this, with `CREATE OR REPLACE` copies of their latest bodies. Change nothing else in them.
2. **`BEFORE INSERT OR UPDATE OR DELETE` guard triggers** that raise `SEALED_WEEK_LOCKED` (message exactly that; `DETAIL` = JSON with `table`, `week_key`, `id`) when the row's counted week is sealed and `toll.seal_writer` is not `'on'`. The triggers cover:
   - `toll.allocations`: the charge's counted week. Covers inserts, setting `reversed_by`, and deletes.
   - `toll.payback_unlinked_decisions`: the payback's week.
   - `ledger.entries` rows that touch a `toll:` account: the entry's week. Extend `toll.tg_ledger_entries_guard`; don't add a second trigger on that table.
   - `toll.charges` and `toll.paybacks`: only when `amount_minor` or `week_key` changes on a row whose current week is sealed, or a row is moved **into** a sealed week.
3. **Never blocked (B13, R1, X11):**
   - any write to `toll.disputes` or `toll.dispute_links`;
   - `toll.carried_facts` rows. They post into the open week by design; the trigger only checks the week they post into (`to_week`).
4. Don't touch any other function or table.

### 2. SQL test: `supabase/tests/toll_sealed_week_guard_test.sql`
Inside `BEGIN … ROLLBACK`, with a made-up company and week, use the real commands (`toll_write.*` / the command entry the other toll tests use), not direct table writes, wherever a command exists. Prove:
- seal a week through `seal_week`, then a direct insert, reverse or delete of an allocation on a charge in that week fails with `SEALED_WEEK_LOCKED`;
- the same for `payback_unlinked_decisions`, a toll ledger entry in that week, and changing a charge's `amount_minor` or `week_key`;
- `carry_forward` of a late fact from the sealed week into the open week **succeeds**;
- a dispute row on a sealed-week charge can still move `to_send` → `sent` → `lost` (dispute state is never blocked);
- `reopen_week` succeeds, after which the allocation write that failed now succeeds;
- with the flag forced `'on'` outside the seal/reopen functions, the write still fails. The triggers must check that the flag was set by those functions, e.g. a second transaction-local flag holding the command id, or a check the reviewer can follow. Explain the method in a comment.

End with `RAISE NOTICE 'toll_sealed_week_guard_test: ok';`.

### 3. Every existing toll SQL test must still pass
Run, after `npx supabase db reset`:
- `toll_v2_schema_checks`, `toll_v2_decisions`, `toll_v2_commands`, `toll_v2_carry_forward`, `toll_v2_matcher`, `toll_v2_roam_native`;
- `toll_v2_postings`, `toll_v2_nightly`, `toll_v2_screen_reads`, `toll_v2_week_result`, `toll_v2_fact_corrections`, `toll_v2_import`;
- `toll_v2_settlement_lines`, `toll_v2_metrics`, `toll_v2_week_rule`, `toll_v2_contract`;
- `toll_disputes_schema_checks`, `toll_disputes_data_test`.

If an existing test fails because it writes into a sealed week directly, **stop and report it**. Do not change the existing test. It may be a real path the guard must allow.

### 4. CI
Add the migration and the new test to `.github/workflows/parts-sql-checks.yml` (both `paths` lists and the run lines after the D1 lines).

## How to check your work (local only)
1. **Start Docker yourself:** `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, then wait until `docker info` answers.
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every test above the same way CI does. In Git Bash, set `MSYS_NO_PATHCONV=1` first, or the `/tmp/...` path breaks.
4. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop` when done.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or existing test file.
- Change only: the new migration, the new test, and the workflow file.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text). Don't paste file contents or full SQL — I'll read the files.
