# Roam Rush — Payment, Risk & Fraud Audit (open items only)

**Last verified:** 2026-10-05 23:04 UTC (ninth pass): production health still all 0, no refund needs a person, and bank numbers are still unreadable. The eighth pass re-checked code and production (read-only):
- 21/21 tests pass, and type errors are at the repo baseline;
- all eight health views return 0;
- `account_number` is unreadable by `anon` and `authenticated` on both tables;
- no plain-text numbers remain, and both Vault seal triggers are live;
- only `service_role` can run `bank_account_number`.
**Earlier revisions** (Rev 1 design audit, R2–R6 verification passes) are in git history (`git show 90141c32:docs/ROAM_RUSH_PAYMENT_RISK_FRAUD_AUDIT.md`). This file lists only what is left to do.

## Where things stand

Everything from the last open list is built, tested and live:
- **Subsidised cash:** the courier keeps their full share on both books, and Roam's share may be negative. Tested.
- **Bank file:** name, bank, branch, account number and type. A payee without a verified account is held and paid next week. Finance has a review queue to mark accounts ready.
- **Courier appeals:** finance can uphold or reverse. A reversal pays the courier back and Roam takes the cost. The dispute reserve stays closed.
- **Duplicate charges:** a duplicate charge now closes its intent as `superseded`.
- **Already done earlier:** Pay balance, the stuck-refund status check, the settle check, saved recon runs, the payout steps (export → sent → paid / returned), the wallet screen, and the privacy notice.

**Tests:** 21/21 pass, and type errors are at the repo baseline.
**Production:** all eight health views return 0, no refund needs a person, and a signed-in user can no longer read a full account number.

What still needs a person (legal, WiPay in writing, payout rail sign-off) is tracked in `docs/roam-rush-payment-golive-gate.md`.

Live flags: `wallet_live`, `device_linking`, `payout_export` and `risk_controls` are **on** (Rush data is test data).

---

## Open items

No code items are left. Ninth pass (2026-10-05, 23:04 UTC): the two housekeeping items below are **still open**, and checking them turned up a migration-file problem to fix before committing.

### 1. Fix the migration files, then commit · **Medium (repo ↔ database)**
Nothing has been committed since `90141c32`. Status shows 33 Rush files modified, plus 3 Rush migrations, `customerWallet.ts` and `WalletPage.tsx` untracked. Before committing, fix these:

- **Two files share version `20261005180000`:** `20261005180000_rush_bank_number_lock.sql` and `20261005180000_toll_tag_inventory_hardening.sql` (from the toll work). The Supabase CLI treats a migration's version as its key, so the replay check (`verify-migrations-replay.yml`) and a fresh `supabase start` will fail. Rename one of them, for example the Rush file to `20261005221322_…`, its production version.
- **Production has two Rush migrations with no file in the repo:**
  - `20261004225707 rush_money_known_double_captures` (the RD-2026-000001/000007 data fix);
  - `20261005162837 rush_supersede_duplicate_intent`.

  Save both as files (copy the SQL from Supabase → Database → Migrations) so the repo records everything that ran in production.
- **Local file names don't match production versions.** Every Rush migration was applied through the dashboard/MCP, so production lists `20261004225528 rush_money_phase0` while the repo has `20261004180000_rush_money_phase0.sql`, and so on. No CI job runs `db push`, so nothing breaks today. Before anyone does run it, either rename the files to the production versions or run `supabase migration repair` (`scripts/reconcile-migration-history.mjs` already exists for this). Otherwise the CLI will try to re-apply them.

Then commit:
- the Rush migrations;
- `customerWallet.ts`, `WalletPage.tsx`;
- the route, payment and app changes;
- the two docs.

### 2. First saved recon run · **Watch**
`rush_money.recon_runs` is still empty. This is expected: the job last ran at 2026-10-05 06:30 UTC, before the table existed, and the next run is **2026-10-06 06:30 UTC** (01:30 Jamaica time). After that, confirm one row with `mismatches = 0`. Do not insert a row by hand.

Closed in the eighth pass:
- A short cash payment credits the restaurant its full food share on the ledger. Roam absorbs the gap. The remittance book still describes only the cash the courier is holding. No short cash order had already been posted, so no adjusting entry was needed.
- A signed-in user cannot read `account_number` on either bank table. `has_column_privilege` is false for `authenticated` and `anon`. Bank name and last four stay readable.
- Mark ready checks the account first. An incomplete account stays unverified and stays in the finance queue.
- A reversed deduction is booked to `platform_cost`. The dispute reserve is not reopened.
- New account numbers are stored in Vault, not as plain text. Only the payout file and the ready check can read them back. There were no plain-text numbers to move.

---

## How to check it's still healthy

Each of these should return 0 rows. The exception is `cron.job`, which should list the 5 Rush jobs.

```sql
select * from delivery.v_rush_cancelled_paid_unrefunded;
select * from delivery.v_rush_multi_capture_orders;
select * from payments.v_rush_refunds_stuck;
select * from rush_money.v_journal_imbalance;
select * from rush_money.v_order_clearing_stale;
select * from rush_money.v_provider_recon_exceptions;
select * from rush_money.v_captures_missing_journal;
select * from rush_money.v_orders_missing_settle;
select jobname, schedule from cron.job where jobname like 'rush-%';
select * from rush_money.recon_runs order by created_at desc limit 7;      -- mismatches should be 0
select * from payments.refunds where last_error = 'Needs a person';        -- someone must clear these
select has_column_privilege('authenticated','payments.merchant_bank_accounts','account_number','SELECT');  -- false
select has_column_privilege('authenticated','payments.courier_bank_accounts','account_number','SELECT');  -- false
```

## Rules to keep when changing Rush money code

- Every money movement goes through `rush_post_journal` on a **public-schema** client, and the error is checked.
- The merchant's share is always computed directly, never as what is left over. A new customer fee must reach five places:
  1. the customer total;
  2. the GCT base;
  3. the card split;
  4. the COD split;
  5. the reverse split.
- Fault is stored on the refund (`payments.refunds.fault`), never read from free text.
- An exact database check beats a tolerant code check, so compute the last part as the residual.
- **The platform share may be negative** (subsidies). Never clamp it in one book and not the other. The courier always keeps their full share.
- **The restaurant is paid its full share even when the customer pays short.** Roam absorbs the gap and recovers it from the customer's debt.
- A column `REVOKE` does nothing while a table-level grant exists. Revoke the table, then grant the columns.
- An alert view must be expected to return 0. A view that always has rows hides the ones that matter.
