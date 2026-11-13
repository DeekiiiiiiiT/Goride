# Cursor prompt — Toll P2-R1b: the import test must not settle at the end

In `supabase/tests/toll_v2_import.sql`, the block near the end ("Bring suspense / payback_unallocated back in line", ~lines 972–1062) decides every pending charge as the fleet's, posts missing P8 rows, and leaves paybacks unlinked, and only **then** runs the nightly checks. That can hide a real import bug: the checks should pass on what the **import** left behind.

Fix it like this (test file only; **no migration changes**; do not commit, branch or push):

1. **Fixtures that stand in for a person's decision must post like a real decision.** Wherever the test inserts a `toll.allocations` row directly (for example "the charge has an allocation" in sections 3 and 4), also post its ledger row with `toll_system.post`, as `toll_v2_week_result.sql` does:
   - bearer `driver` → `P7_allocate_driver`;
   - `fleet` → `P8_allocate_fleet`;
   - `platform` → `P6_allocate_platform` (with the payback id).

   Do the same for any `payback_unlinked_decisions` the test inserts on purpose (no posting is needed for those).
2. **Delete the settle block** (both companies, including the `imp-settle-b-fix` decision).
3. **Run `pg_temp._imp_nightly_ok(<company>)` at the end of every section** (1–10), straight after that section's imports, as the prompt asked. Undecided charges and unallocated paybacks are fine: the checks compare the accounts with the records; they don't require everything to be decided.
4. If a section's nightly check then fails, **don't add anything to make it pass.** Report the section, the failing check's `name` and `detail`, and stop. That would be a real import bug for Claude to fix.

## Run (once; Docker Desktop open)
`pnpm test:toll`.

## Report
Give clickable links to the files you changed and the results. If a check failed, give the section and the check's `name` / `detail`. Don't paste file contents. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
