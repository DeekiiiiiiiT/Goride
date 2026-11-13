# Cursor prompt — Toll Phase 2, P2-R3: matcher tests

Claude built the matcher. **Do not change the engine or the migration.** If a test shows either is wrong, report it and stop. Do not commit, branch or push.

Read these first:
- `packages/toll-core/src/v2/matcher/engine.ts` and `types.ts` (the pure engine), and Claude's smoke test `engine.test.ts` (12 cases; keep them).
- `supabase/migrations/20261113011349_toll_v2_matcher.sql` (queue, triggers, claim, store).
- `supabase/functions/_fleet-server/toll_v2_matcher_run.ts` (claim → engine → store).
- `docs/toll-architecture.md` → B4, and Part F → "Phase 2" → P2-R3.

What it gives you:
- **Engine:** `matchTolls(bundle)` → `{ engine_version, candidates[], excluded }`. Each candidate has `charge_id, payback_id, score, score_parts, rules_fired, auto_apply, inputs`. `scorePair(inputs)` re-scores a stored `inputs` value.
- **Windows:** on_trip = pickup (else request) → drop-off. enroute = request − 45 min. post_trip = drop-off + 15 min. Edges widen by 60 s for `minute`, 0 s for `exact`. date_only compares Jamaica days (`same_day`). Adjustments: same driver, charge day 0–7 days before `paid_on`.
- **Points:** on_trip 60, enroute 35, post_trip 25, same_day 20, adjustment same day 25 / within 7 days 10; amount exact 30, within 5 % 15; sole candidate 10. Auto-apply needs all of: the platform's `auto_apply` on, sole candidate, on_trip with a drop-off, score ≥ 90, no date_only, receipt verified.
- **Database:**
  - triggers fill `toll.match_queue` when a charge, payback, trip, allocation or "left unlinked" decision is written or changes, and when a toll week is sealed or reopened. Roam native records are never queued.
  - `public.toll_sys_match_claim(company, limit)` returns the bundle.
  - `public.toll_sys_match_store(company, claim_id, result)` stores the result append-only: `new | unchanged | replaced | withdrawn | skipped`, or `claim_gone`.
  - `public.toll_sys_match_pending()` lists companies with queued work.
  - All three are service key only.

## 1. Engine golden cases — `packages/toll-core/src/v2/matcher/matcher.golden.test.ts`
Name each case `matcher_golden_<name>`. For every candidate, assert the exact `score`, `score_parts` and `rules_fired`, and that `scorePair(JSON.parse(JSON.stringify(inputs)))` gives the same answer.
1. Each window edge, for `minute` and for `exact`: the last second inside and the first second outside of enroute start, trip start, drop-off and post-trip end.
2. Pickup present: a crossing between request and pickup is `enroute`, not on_trip.
3. No drop-off: the trip is a point; on_trip never auto-applies (`no_dropoff`).
4. date_only on either side → `same_day` only, never auto. A crossing the day before the trip → not a candidate.
5. Amounts: exact, exactly 5 % off (close), just over 5 % (`payback_larger` / `payback_smaller`). Use `remaining_minor`, not `amount_minor`: a part-allocated charge and a part-allocated payback.
6. Competition: two charges on one trip, one charge on two trips (the same vehicle, back to back), and the 20 real "same vehicle + day + amount + plaza" tag pairs shape (two crossings, one payback). None of these auto-apply.
7. Auto-apply: each one of the six conditions false on its own → `auto_apply false` with `auto_apply_blocked` (or `auto_apply_off` when the setting is off).
8. Adjustments: same day, 7 days, 8 days (out); a different driver (out); a trip_line payback never matches by driver alone.
9. Every exclusion reason, each on a focal record: `roam_native`, `legacy`, `duplicate`, `after_seal`, `week_sealed`, `receipt_rejected`, `fully_decided`; and for paybacks `reversing_payback`, `reversed`, `trip_missing`.
10. Determinism: shuffle the bundle's arrays → an identical result (deep equal), candidate order included.
11. Uber card and cash shapes taken from the adapter fixtures (`__fixtures__/trip_activity_golden.csv` and `payments_transaction_golden.csv`). Run them through `uber(...)`, build the trips and paybacks, add one tag charge inside the window → one on_trip candidate.

## 2. Database tests — `supabase/tests/toll_v2_matcher.sql`
Same style as `toll_v2_import.sql` (2024 dates, `BEGIN … ROLLBACK`). Write the data through `public.toll_sys_import` / `public.toll_v2_command`, as the real paths do. To stand in for the engine, call `toll_sys_match_store` with a hand-written result whose `inputs` are fixed JSON.
1. **Queue:**
   - an Uber import with a toll trip, plus a tag statement, queues the charge, the payback and the trip;
   - re-importing the same files queues nothing new (the `WHEN` clauses);
   - a Roam crossing (`native_ride_charge`) and its native payback and allocation queue nothing;
   - a reversal (`reversal_of`) queues the original payback;
   - sealing and reopening the week queue that week's records.
2. **Claim:**
   - returns `claim_id`, `focal`, and `charges` / `paybacks` / `trips` / `settings`. A charge's `remaining_minor` subtracts active allocations. A payback's subtracts allocations and unlinked decisions; `reversed` and `week_sealed` are set right;
   - a queued trip makes its paybacks focal;
   - **scope** (`focal` in the bundle) = the changed records + their candidates now + their partners in open suggestions. A second crossing on a trip puts the trip's payback in scope, and with it the first crossing's pair. A trip that moved away puts its old partner charges in scope;
  - the extra hops: a scoped record's other candidates, and their competitors, are in `charges` / `paybacks`, so counts are complete. Prove one with a charge that has two trips;
   - another company's records are never in the bundle;
   - a second claim while the first is open gets nothing;
   - after 10 minutes (back-date `claimed_at`) it gets the rows.
3. **Store:**
   - new → one row each;
   - the same result again with a new claim → `unchanged`, no rows;
   - changed `inputs` → `replaced` (old `superseded_by` = new);
  - **the scenario Claude ran (with the real engine, see "Smoke run" in the tracker), with the engine's output written in:**
    - one crossing → 100 `sole_candidate`;
    - a second crossing on the same trip → the first pair `replaced` with 90 `competing_candidates`, plus one new pair;
    - the trip moved 2 h later → both pairs `withdrawn`;
   - a focal pair missing from the result → `withdrawn` (a row with `rules_fired = {withdrawn}`, superseding the old);
   - a pair touching no focal record, or another company's id → `skipped`;
   - a used or unknown claim → `claim_gone` and nothing written;
   - the queue rows of the claim are gone afterwards;
   - a record queued again during the claim stays queued.
4. **Append-only holds:** updating any suggestion field except `superseded_by`, or deleting one, raises.
5. **Grants:** `authenticated` and `anon` can't execute the three public functions or any `toll_system.match_*` function. `toll.match_queue`: authenticated sees only its own company's rows (RLS) and can't write.
6. Nightly checks are all ok at the end.

Add `match_queue` to `expected_tables` in `supabase/tests/toll_v2_schema_checks.sql`. Add the new SQL file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## 3. Runner — `supabase/functions/_fleet-server/toll_v2_matcher_run.test.ts`
Use a fake `rpc`; no database.
- An empty claim stops at once.
- Two rounds, then empty: the counts add up.
- `claim_gone` is counted and the loop goes on.
- An RPC error throws with the function's name.
- `maxRounds` reached → `queueLeft: true`.

## Run (once; Docker Desktop open)
`pnpm --filter @roam/toll-core test` and `pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
