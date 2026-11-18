# Give Cursor this — Toll disputes, Round S1-fix2 (missing money tests)

The S1-fix round was reported "done" while `supabase/tests/toll_dispute_commands_test.sql` was **failing**. The planner fixed these, and all 20 toll SQL files now pass:
- the week-flow nightly check ignored P21;
- the `payback_unallocated` nightly formula was a guess;
- undo reversals could land in a sealed week;
- three test-order bugs.

**Before you report, run the tests and paste the pass / fail per file. "Done" means every file passes.**

The fix round asked for tests that are still missing. Add **only tests**, to `supabase/tests/toll_dispute_commands_test.sql`, in the same style as the existing `-- Open charge week: full refund` block. Use a new `DO $$` block per case, with a fresh charge from `pg_temp._s1_setup390` and unique ids.

## What to add
1. **Exact balances, open and sealed.** For each case below, write **two** blocks: one where the charge week stays open, one where it is sealed before the result.
   - Assert the **change** (after minus before; never an absolute number, because earlier blocks leave balances behind) of `receivable_platform_dispute`, `payback_unallocated`, `receivable_driver`, `expense` and `suspense`, with `pg_temp._s1_bal`.
   - Then run `pg_temp._s1_assert_nightly()`.

   | Case | Steps (J$390 toll, Uber paid J$370, J$20 disputed) | Expected change after the last step, from just after `open_dispute` |
   |---|---|---|
   | a. Part refund then lost | sent → J$10 adjustment `settle_dispute` → `close_dispute_lost` (lost bearer = fleet) | `receivable_platform_dispute` −20; `expense` +10; `payback_unallocated` 0 (the J$10 refund came in and was used); `suspense` 0 |
   | b. Lost | sent → `close_dispute_lost` | `receivable_platform_dispute` −20; `expense` +20 |
   | c. Expire then refund | `dispute_expire` (driver bears) → J$20 adjustment `settle_dispute` (system path) | after expire: `receivable_platform_dispute` −20, `receivable_driver` +20; after refund: `receivable_driver` back to 0, `payback_unallocated` 0 |

   Work out each expected number from W1 rules 1–5 before you run anything. If your number and the system's differ, **stop and report both**. Don't change the expected value to match.
2. **Undo restores everything.** For results `part_won`, `lost` and `expired` (the won case already exists), open **and** sealed:
   - take `pg_temp._s1_snap_bals()` and the charge's active allocation sum just before the result;
   - undo it;
   - `pg_temp._s1_assert_snap` must match, and so must the allocation sum.

   For the sealed variants, the sealed week's ledger hash (`pg_temp._s1_week_ledger_hash`) must be unchanged.
3. **Undo after the posting week was sealed:**
   - a sealed-week charge's dispute is refunded, and the result posts in week B;
   - seal week B;
   - undo the result: it must succeed, and the reversal must land in the current `posting_week`, not B (B's ledger hash is unchanged).

## How to check your work
1. Start Docker, run `npx supabase start`, then `npx supabase db reset`.
2. Run **all 20 toll SQL files** (`toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`), with `MSYS_NO_PATHCONV=1` in Git Bash.
3. Run `npx supabase stop`.

## Rules
- Change **only** `supabase/tests/toll_dispute_commands_test.sql`. If a new test fails because of the migration, stop and report the failing case with the numbers; don't change the migration.
- No branches, commits or pushes. Don't touch the live database.
- In your report, give a clickable link to the file and the pass / fail per test file. Don't paste file contents.
