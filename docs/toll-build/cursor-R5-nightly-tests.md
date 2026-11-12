# Cursor prompt — Toll R5: nightly check tests

Claude built `supabase/migrations/20261112191942_toll_v2_nightly_and_payouts.sql`. **Do not change any migration.** If a test shows a migration is wrong, report it and stop.

Read it first. What it gives you:
- `toll_system.nightly_checks(company)` returns rows `(check_no, name, ok, detail)`:
  - check 1: one row per toll account (`account:toll:<name>`);
  - check 2: failing rows `charge_posted`, `allocations_posted`, `payback_posted`, `row_without_record`, plus one `records_vs_ledger` ok row;
  - check 3: one row per open week (`week_flow:<week>`);
  - check 4: one row per sealed week;
  - check 5: one row per week holding after-seal facts;
  - check 7: one row per bank confirmation key.
- `toll_system.nightly_run()`:
  - heals bank confirmations first;
  - stores rows in `toll.nightly_results`;
  - raises `toll.alerts` (failed checks → `page`) and resolves alerts not seen this run;
  - runs `toll_system.aging_alerts`.
- The payout trigger fires on `public.kv_store_37f42386` for keys `fleet_bank_confirm:org:<company>:<yyyy-mm-dd>:<uber|indrive|roam>`, only for companies with `toll.switch_state.tolls_v2 = true`. It posts P10 + P11 for the toll part (active fleet-received paybacks of that week and platform), and records it in `toll.payout_postings`.
- `toll_system.set_plaza_rule(plaza, minutes, 'same_day', actor)`: platform owners only, and writes an audit row.
- How a test posts money: `toll_system.post(company, rule, amount, effective_at, command_id, line, refs)`, with a toll record row for each ref (as in `toll_v2_postings.sql`).
- **A take-back (P17)** is the reverse of the original's P6 and P4 rows: `toll_system.post(..., p_reverse => true)`. Its refs carry `payback_id` = the **original** payback, plus `reversing_payback_id` = the new reversing payback row (`toll.paybacks.reversal_of` = original). The original's allocation row gets `reversed_by` set.

## Write `supabase/tests/toll_v2_nightly.sql`
Same style as the other toll tests (`BEGIN … ROLLBACK`, made-up `auth.users`, two companies in `public.organizations`, company A with `toll.switch_state.tolls_v2 = true`). Each test gets a clear failure message.

1. **Clean books pass:** a top-up (P1), a tag crossing (P2), a card payback (P4) and the platform allocation (P6). Every row of `nightly_checks(A)` is `ok`.
2. **Planted breaks, each caught by the right check:**
   - an allocation row with no posting → check 2 `allocations_posted` and check 1 `account:toll:suspense` fail;
   - a charge row whose P2 was never posted → check 2 `charge_posted` fails;
   - a payback with no P4 → check 2 `payback_posted` fails.
3. **`week_flow_matches_disposition`:** check 3 passes in all four cases.
   - **(a) same-week take-back:** payback Y and its reversal Z both in week W;
   - **(b) cross-week take-back:** Y in W, Z in W+1, W still open. W's row shows `suspense_expected` = the charge amount (pending again); W+1's flows are 0;
   - **(c) week move:** the charge's P2 and P8 reversed, the charge's `week_key` and `occurred_at` updated to W+1, then posted again in W+1; W shows nothing;
   - **(d) amount correction:** P16 down by D on a tag charge, with the charge's `amount_minor` lowered by D.
4. **Check 4 (sealed week unchanged):** seal week W with `public.toll_v2_command('seal_week', …)` as the owner (as in `toll_v2_commands.sql`), and check 4 is ok. Then, as postgres, insert another live charge into W directly: check 4 for W fails.
5. **Check 5 (after-seal control):** an `after_seal` charge in a sealed week → ok, with the right `count` and `sum`. The same week with an after-seal charge that **has** a ledger row → fails. An after-seal charge in an **open** week → fails.
6. **Payout trigger and check 7:**
   - saving a bank confirmation for A posts P10 + P11 equal to the toll part;
   - changing the record reverses and re-posts;
   - deleting it reverses;
   - check 7 is ok after each step;
   - a key naming A with a record stamped company B → nothing posted, and an open `payout_key_mismatch:` alert;
   - company B (v2 off) → nothing posted, and the save itself succeeds;
   - a legacy key without a platform (`fleet_bank_confirm:org:<A>:<week>`) → ignored.
7. **Self-heal:** disable the payout trigger inside the test (`ALTER TABLE public.kv_store_37f42386 DISABLE TRIGGER toll_kv_bank_confirm_upsert`), save a record, enable it again. Check 7 fails, then `nightly_run()` posts it, check 7 is ok, and a `payout_healed:` alert exists.
8. **Aging (set `created_at` back in time on the fixture rows):**
   - a `pending` charge 15 days old → `aging:charge:` alert (`watch`);
   - an `unverified` cash charge 8 days old → alert;
   - an after-seal **reversing** payback 8 days old → `page`;
   - an after-seal charge 8 days old → no alert yet; at 15 days → alert;
   - `toll:receivable_platform` in credit (post a take-back larger than what's owed) → `aging:receivable_platform_credit` (`watch`), which becomes `page` once that alert's `created_at` is over 30 days old.
9. **Nightly run:** writes `toll.nightly_results` rows for A, and a failing check raises an open `page` alert. When the next run passes (fix the planted break inside the test), that alert is resolved. `toll.nightly_results` refuses UPDATE and DELETE.
10. **Plaza rules:** a user whose `raw_app_meta_data.role` is `platform_owner` can set a rule, and an audit row is written. Anyone else gets `FORBIDDEN`. A negative window gets `BAD_REQUEST`.
11. **Cron:** `cron.job` has a job named `toll-v2-nightly` running `toll_system.nightly_run()`.
12. **Grants:** `authenticated` and `anon` have no EXECUTE on `toll_system.nightly_checks`, `nightly_run`, `payout_received` or `set_plaza_rule`. `authenticated` can SELECT `toll.alerts` rows of its own company only (row security).

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## Run locally (once; Docker Desktop open)
`npx supabase db reset`, then all four toll SQL tests (`toll_v2_schema_checks`, `toll_v2_postings`, `toll_v2_commands`, `toll_v2_nightly`) with `docker cp` + `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<file>.sql`. In Git Bash, set `MSYS_NO_PATHCONV=1` first. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
