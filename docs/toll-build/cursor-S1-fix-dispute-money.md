# Give Cursor this — Toll disputes, Round S1-fix (money posted twice + undo + deadline)

Planner review of S1 (`supabase/migrations/20261118001833_toll_dispute_commands.sql`) found money bugs that the S1 tests missed. They checked only `receivable_platform_dispute`, and only on the sealed-week path. S1 is **not committed**: fix it **in the same migration file** (it has never run anywhere except locally).

Spec: `docs/toll-architecture-gap-audit.md` C1 W1 rules 1–5 and Y3, C4.1, C4.4, C4.5, C4.8, C4.11, C4.15.

## The one rule the fix must follow
A dispute's money moves in exactly **one** of two ways, never both:
- **Charge week open:** only by reversing and inserting **allocations**. Each allocation already posts its own rule: P21 for a provisional platform row, P6 / P7 / P8 for platform, driver or fleet, and the reverse of each. **No** P22, P23 or P24 posting on this path.
- **Charge week sealed:** **no** allocation changes. Only the net move is posted, once, in `posting_week`, tied to the `dispute_result` carried fact:
  - P22 for a refund;
  - P23 for the rest going to a bearer;
  - P24 for a refund on an expired dispute.

## Bugs to fix (each with the one fix)

| # | Where | What's wrong | Fix |
|---|---|---|---|
| **F1** | `dispute_apply_rule2_refund`, open-week branch | It reverses the provisional row (reverse P21) and inserts the firm platform row (P6), **and** posts P22. The refund is counted twice: `payback_unallocated` and `receivable_platform_dispute` end J$20 out on a J$20 refund. | Remove the P22 `dispute_post_clear` call on this branch. |
| **F2** | `dispute_apply_rule3_rest`, open-week branch | Reverse P21 plus P7 / P8 (bearer row), **and** P23. The driver or fleet is charged twice. | Remove the P23 call on this branch. |
| **F3** | `dispute_apply_rule4_expired_refund`, open-week branch | Reverse P7 / P8, plus P6, **plus** P24 **plus** P22: three times. | Remove both the P24 and P22 calls on this branch. |
| **F4** | `dispute_apply_rule2_refund`, sealed branch | Posts P21 again for the remainder. `receivable_platform_dispute` already holds the full owed amount from the frozen provisional row, so this adds the remainder a second time. | Post only P22 for the refunded slice. |
| **F5** | `dispute_apply_rule4_expired_refund`, sealed branch | Posts P24 **and** P22. At expiry, P23 already moved the amount out of `receivable_platform_dispute`. | Post only P24. |
| **F6** | `intent_undo_dispute_result` | Always reverse-posts P22, whatever the result was: wrong for lost, expired and part results. It also **edits** frozen sealed-week allocations (`UPDATE … SET dispute_id = v_new`), and rows are never edited (Y3). | Undo reverses **exactly** what the undone decision wrote: every allocation with that `decision_id` and every ledger entry that decision's command posted, each by its reverse. It reverses the links that decision wrote. Then it writes the prior state's money **the same way the prior state was created**: open week → a provisional platform allocation for (owed − recovered before the result), or the bearer allocation for an expired dispute; sealed week → the reverse net posting in `posting_week`. Never update an allocation's `dispute_id`. Readers find a reopened dispute's frozen provisional row through the `reopens_id` chain. Add a helper `toll_system.dispute_chain_root(company, dispute_id)` and use it wherever a frozen row is looked up by dispute. |
| **F7** | `posting_week` | It takes the newest **closed** statement row. After a `reopen_week`, the newest version of that week is a `draft`, but the old closed row still wins, so results post after a week that is open again. | Use the latest week whose **current** statement (highest version) is `closed`. That is the same rule as `week_is_sealed`. |
| **F8** | `dispute_deadline` | `(trip_date + N)` at midnight is the **start** of the Nth day. The spec is the **end** of the Nth Jamaica day (S5): trip 9 Nov, window 9 → 18 Nov 23:59:59 Jamaica. | `((trip_date + N + 1)::timestamp AT TIME ZONE 'America/Jamaica') - interval '1 second'`. Add a test with 9 Nov → 18 Nov 23:59:59 Jamaica. |
| **F9** | `toll_system.nightly_checks` check 1 | It doesn't know the new account or rules, so it can't catch any of the above. | Extend check 1: add `account:toll:receivable_platform_dispute`, and include P21–P24 in the expected balances of every account they touch. Add the C1 check: `receivable_platform_dispute` = Σ (owed − recovered) over `to_send` / `sent` disputes (C4.5). Use `CREATE OR REPLACE` of the latest body. |

## Tests (change `supabase/tests/toll_dispute_commands_test.sql`)
- After **every** block, `SELECT … FROM toll_system.nightly_checks(company)` must show **every row ok**, with no exception.
- **Exact balances.** For each case below, run it **twice: once with the charge week open, once sealed**. Assert the **exact** natural balance of `receivable_platform_dispute`, `payback_unallocated`, `receivable_driver`, `expense` and `suspense` before and after:
  - full refund;
  - part refund then lost;
  - expire then adjustment refund;
  - lost.
- **Undo restores everything.** For each result type (won, part_won, lost, expired), snapshot all toll account balances and the charge's active allocation sum before the result. Undo it. The snapshot must match exactly, open and sealed. A sealed week's ledger rows are unchanged throughout: compare a hash of its entries before and after.
- The F8 deadline example and the F7 reopen case:
  1. seal week A;
  2. reopen A;
  3. `posting_week` is not A + 7.

All 21 toll SQL files must pass: every `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`. If an existing test fails, fix your code, not the test; if you believe the test is wrong, stop and report.

## How to check your work (local only)
Same as S1:
1. Start Docker yourself.
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll test with `MSYS_NO_PATHCONV=1`.
4. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Change only the S1 migration and `supabase/tests/toll_dispute_commands_test.sql`. Do not change any other existing migration or test.
- Stop any server you started and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text). Don't paste file contents or full SQL — I'll read the files.
