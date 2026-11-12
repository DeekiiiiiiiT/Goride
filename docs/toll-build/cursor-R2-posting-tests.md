# Cursor prompt — Toll R2: posting tests

Claude has built the money core in `supabase/migrations/20261112184544_toll_v2_money_core.sql`. **Do not change that file.** Your job is the test file only. If a test shows the migration is wrong, report it and stop; don't "fix" the migration.

Read the migration first. What it gives you:
- `toll.posting_rules`: 30 rules (code, debit suffix, credit suffix, required refs).
- `toll_system.post(company, rule, amount_minor, effective_at, command_id, line, refs jsonb, reverse default false, currency default 'JMD')` → returns the ledger entry id.
- `toll_system.ensure_accounts(company)` and `toll_system.week_is_sealed(company, week)`.
- A guard trigger on `ledger.entries`: refuses toll-account rows not written by `toll_system.post` (`TOLL_WRITER_ONLY`), and refuses deleting them (`TOLL_ROWS_PERMANENT`).

Ledger sign rule: `ledger.post_entry` **lowers** the debit account's `balance_minor` and **raises** the credit account's. Toll accounts are `org:<company>:toll:<name>`, plus `org:<company>:bank`.

## Write `supabase/tests/toll_v2_postings.sql`
Same style as `supabase/tests/toll_v2_schema_checks.sql`: `BEGIN;` → made-up `auth.users` row → `DO $$ … RAISE EXCEPTION on failure … RAISE NOTICE 'toll_v2_postings: ok'; $$` → `ROLLBACK;`. Create two made-up companies in `public.organizations` first, copying how the schema test does it (each needs an `owner_id` that exists in `auth.users`). Use made-up ids that can never match real data.

Set up, for company A: one decision, one tag charge, one cash charge, one card payback (`received_by = 'fleet'`), one cash payback (`received_by = 'driver'`), one tag account plus one top-up, and one carried fact. Use the same `effective_at` in an open week for everything.

Tests, each a separate block with a clear failure message:
1. **Every rule (all 30 rows of `toll.posting_rules`, looped from the table, not hand-listed):**
   - post it once with the refs it requires (from `required_refs`; `payout_ref` and `settlement_ref` are any text);
   - check the debit account's `balance_minor` went **down** by the amount, the credit account's went **up**, and no other toll account changed;
   - check the row has `reference_type = 'toll'`, `product = 'roam_fleet'`, and `metadata->>'toll_rule'` = the rule.
2. **Reversal:** post a rule with `reverse => true` (any rule, e.g. `P6_allocate_platform`). The sides are swapped, and posting the rule plus its reversal leaves both accounts where they started.
3. **Trial balance:** after all of the above, Σ `balance_minor` of all company A's toll accounts + `bank` = 0.
4. **Replay:** the same command id + line + content returns the same entry id, and the balances move only once.
5. **Conflict:** the same command id + line with a different amount raises `TOLL_POST_CONFLICT`.
6. **Missing reference:** `P6_allocate_platform` without `payback_id` raises `TOLL_REF_REQUIRED`.
7. **Other company's record:** company B posting with company A's `charge_id` raises `TOLL_REF_NOT_FOUND`.
8. **Legacy record:** a charge with `is_legacy = true` can't be posted against (`TOLL_REF_NOT_FOUND`).
9. **Sealed week:** insert a `ledger.week_statements` row (`kind 'toll_week'`, `driver_id '*'`, `status 'closed'`) for the open week. A post into that week raises `WEEK_SEALED`. A post into the next week still works. Then insert version 2 with `status 'draft'` (a reopen): the week accepts posts again.
10. **Writer only:** a direct `INSERT INTO ledger.entries` touching a toll account raises `TOLL_WRITER_ONLY`.
11. **Permanent:** `DELETE` of a toll ledger row raises `TOLL_ROWS_PERMANENT`.
12. **No side effects:** a plain `ledger.post_entry` between two non-toll `org:` accounts still works.
13. **Account types:** after `ensure_accounts`, `toll:payback_unallocated` and `toll:payable_driver` are `liability`, `toll:expense` is `expense`, and the other 7 are `asset`.
14. **Grants:** `authenticated` and `anon` have no EXECUTE on `toll_system.post`, `ensure_accounts` or `week_is_sealed`; `service_role` has EXECUTE on all three.

Add the file to `.github/workflows/parts-sql-checks.yml` (both `paths:` and the run step), the same way `toll_v2_schema_checks.sql` was added.

## Run locally (once; Docker Desktop open)
`npx supabase db reset`, then run both toll test files with `docker cp` + `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<file>.sql`. In Git Bash, set `MSYS_NO_PATHCONV=1` first, or the `/tmp` path gets rewritten. If a test fails, report the error and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
