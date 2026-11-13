# Cursor prompt — Toll Phase 2, P2-R3b: matcher SQL test fixes

Claude checked your P2-R3 work. The golden engine tests and the runner tests are good; keep them. `supabase/tests/toll_v2_matcher.sql` needs two fixes. **Change only that file.** Do not change the engine or any migration. If a test shows either is wrong, report it and stop. Do not commit, branch or push.

## Fix 1: no hand clean-up of money records
Section 1 inserts a raw reversal payback (`match-pb-rev-r`, no ledger posting) and deletes it before the nightly checks. Remove that DELETE. A test must never tidy up records so the checks pass; it can hide a real bug.

Instead, run the reversal check inside its own block that undoes itself:
- `BEGIN … INSERT the reversal row … check the original payback is queued … RAISE EXCEPTION 'match_rev_probe_ok'; EXCEPTION WHEN raise_exception THEN` check that `SQLERRM = 'match_rev_probe_ok'`, otherwise re-raise.
- The insert is rolled back with the block, and the nightly checks run on what the real paths left.

Deleting `toll.match_queue` rows to set up a case is fine; that table is a work list, not money.

## Fix 2: add the claim checks that are missing
Read `toll_system.match_scope` in the migration. **Scope** (`focal` in the bundle) = the changed records + their candidates now + their partners in open suggestions. Add a section `2b. Claim contents and scope`. Use imports for the data, a fresh vehicle so nothing else is near, and `toll_sys_match_store` with hand-written results.
1. **Second crossing (the bug Claude found):**
   - set-up: an Uber card trip with a toll, plus crossing A on it; claim, then store one pair (A, payback);
   - import crossing B on the same trip, then claim;
   - check: `focal.payback_ids` has the trip's payback, and `focal.charge_ids` has **both A and B**, although only B was queued.
2. **Trip moved away:** store pairs for A and B, then re-import the trip 2 hours later and claim. Check that `focal.charge_ids` has A and B (their partner in open suggestions), although neither is near the trip now.
3. **Extra hops:**
   - set-up: charge A sits on trips T1 and T2 (back to back, same vehicle). Queue only T2's payback;
   - check: the bundle's `paybacks` has T1's payback (A's other candidate), and its `trips` has both trips.
4. **Amounts and flags in the bundle:**
   - a charge's `remaining_minor` = its amount − active allocations. Give it one allocation, then a reversed one;
   - a payback's `remaining_minor` subtracts its active platform allocations and its active "left unlinked" amount;
   - `reversed` is true for a payback that has a reversal. Do this inside a self-undoing block, as in Fix 1;
   - `week_sealed` is true for a record in a sealed week;
   - `settings` carries the platform's `auto_apply`.
5. **Other company:** org B's suggestions never put org A's records in scope, and the reverse.

## Run (once; Docker Desktop open)
`pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
