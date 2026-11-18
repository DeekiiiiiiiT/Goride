# Give Cursor this — Toll disputes, Round S2a (the matcher opens and settles disputes, platform rates, take-back reopens)

You are building **Round S2a only** of `docs/toll-architecture-gap-audit.md` (Rev 23). Read these first; they are the spec:
- **START HERE** (the build table and "Things learned", including the S1b review notes and the S2a choices)
- "Server still to build": the **Matcher (changed)** and **`reverse_payback` on a linked payback** rows
- **C4** tests 6, 9, 10, 11, 14, 15; **Part D** done-tests 1, 3, 3b, 4, 12, 13, 14, 14b
- **L2.4** (dispute state table) and **L2.5** (first sequence diagram)

D1, D2, S1 and S1b are done and committed: `20261117234730_toll_disputes_data.sql`, `20261118000711_toll_sealed_week_guard.sql`, `20261118001833_toll_dispute_commands.sql`, `20261118060401_toll_four_eyes_settings_income.sql` (+ their tests in `supabase/tests/`).

**Not in this round (S2b, next):** the nightly expiry / auto-close / `no_report` sweep and its scheduling, the "Uber report late" alert, the logged-trips adapter, `rider_pays_driver` (InDrive) suggestions. Also not: screen reads, screens, opening a dispute when the platform paid **nothing** (owner question Q12; a person does that today).

**Goal (one sentence):** the moment Uber's data arrives, a clear trip payback that leaves part of a toll unpaid opens the dispute by itself, a clear refund settles its dispute by itself, Uber's own plaza rate counts as an exact match, and a refund Uber takes back reopens its dispute.

**One switch:** every new behaviour applies **only when the company's `toll_disputes` switch is on**. With it off, `match_claim`'s bundle, the engine's output (including `engine_version`) and every command behave **byte-for-byte as today**. The live company has `toll_disputes` off, so nothing live changes when this deploys.

**This is the first time the matcher writes money by itself** (today every suggestion is shadow; `auto_apply` is never acted on). Keep that power narrow: only the two "eligible" cases below, each re-checked by the real command at the moment it runs.

## Look first
- The engine: `packages/toll-core/src/v2/matcher/engine.ts`, `types.ts`, `index.ts`, and its tests (`engine.test.ts`, `matcher.golden.test.ts`). It is pure (no clock, no I/O). `scorePair(stored inputs)` must keep giving the stored answer (I11).
- The runner: `supabase/functions/_fleet-server/toll_v2_matcher_run.ts` (claim → engine → store).
- SQL: `toll_system.match_claim` (latest in S1b), `match_scope`, `match_store` and `match_enqueue` (`20261113011349_toll_v2_matcher.sql`), `toll.suggestions`, `toll.plaza_rates` (D1), `toll.platform_settings` (`takes_disputes`, `dispute_window_days`, `refund_periods`).
- S1 dispute code: `intent_open_dispute`, `intent_mark_dispute_sent`, `intent_settle_dispute` (its `p_system` flag), `dispute_apply_*` (W1 rules 1–5), `toll.dispute_links`, `toll_system.dispute_post_at`, and how undone rows get `close_reason = 'undo'`.
- `intent_link_payback`, `intent_apply_suggestion`, `intent_undo_decision` (latest in S1b), `intent_reverse_payback` (latest in `20261113031959_toll_v2_carry_forward.sql`), `toll_write.dispatch` (S1b) and `toll.decisions.actor` (`'system'` is allowed).

## What to build: one new migration + engine changes
Create the migration with `npx supabase migration new toll_matcher_disputes`.

### 1. Suggestion kinds (data)
- `toll.suggestions` gains `kind text NOT NULL DEFAULT 'payback'` (`'payback'`, `'dispute_refund'`) and `dispute_id uuid` (FK to `toll.disputes` by company). Check: `kind = 'dispute_refund'` ⇔ `dispute_id IS NOT NULL`. Existing rows stay `'payback'`.
- `intent_apply_suggestion` refuses a `dispute_refund` suggestion (`WRONG_STATE`, `use: 'refund received'`). Disputes are settled only through `settle_dispute`.

### 2. What the bundle carries (SQL, `match_claim`)
Only when `toll_disputes` is on, the bundle gains three keys (when off, they are **absent**, not empty):
- `rates`: every `toll.plaza_rates` row with `rate_kind = 'platform_refund'` for the plazas of the bundle's charges (`plaza_id`, `platform`, `amount_minor`, `valid_from`).
- `disputes`: every dispute in state `to_send`, `sent` or `expired` whose charge is in the bundle, **plus** every `sent` / `expired` dispute of a driver who has a payback in the bundle (so a refund finds its dispute even when the charge isn't in scope). Fields: `id`, `charge_id`, `state`, `platform`, `platform_trip_id`, `driver_id`, `owed_minor`, `recovered_minor`, `opened_late`, `version`, and `refund_from` / `refund_to` (Jamaica dates, worked out in SQL so the engine stays clock-free): for `sent`, from the Jamaica date of `clock_from` to the last day of the **second full Monday–Sunday week starting after** `clock_from` (T6); for `expired`, the same, counted from `deadline`.
- `settings` rows gain `takes_disputes`.
- Charges in the bundle gain nothing new; the engine learns "this charge has an active dispute" from `disputes`.

`match_scope` / the near-functions must pull in those extra disputes' charges and paybacks so competitor counts stay complete.

### 3. Engine (TypeScript)
- `ENGINE_VERSION`: stays **`'toll-matcher-v1'` and every output stays identical when the bundle has no `rates` and no `disputes` keys**. With either key present, the engine stamps `'toll-matcher-v2'`. `scorePair(inputs)` picks its rules from `inputs.engine_version`, so stored v1 inputs still reproduce. The existing golden test must pass **unchanged**.
- **Plaza rate (B9):** for a `trip_line` pair, if `rates` has a row for the charge's `plaza_id` and the payback's `platform` with the latest `valid_from` ≤ the trip's Jamaica date, and the charge is untouched (`remaining_minor = amount_minor`), store it on the inputs as `platform_rate_minor`. Then `payback.remaining_minor = platform_rate_minor` scores as an exact amount: rule **`amount_platform_rate`**, `amount_exact` points. `amount_diff_minor` stays payback − charge. Without a rate, scoring is unchanged.
- **Dispute first (B3, R6, C4.9):** a charge with an active dispute (`to_send`, `sent` or `expired`) gets **no `payback` candidates**. If it's focal, it's excluded with reason `disputed`.
- **Dispute refund candidates (`kind = 'dispute_refund'`):** pair each eligible payback (not excluded, same `platform`, same `driver_id`, `paid_on` between `refund_from` and `refund_to`) with each dispute that can take a refund. Per L2.4 / Y2 / U14, that's `sent` disputes (an `adjustment`, or a `trip_line` whose `platform_trip_id` equals the dispute's) and `expired` disputes (adjustments only). Never `to_send`. Score parts: a refund window hit, `amount_exact` when `payback.remaining = owed − recovered`, and the sole-candidate points. Rules include `dispute_refund`.
  - **`dispute_settle_eligible`** only when the payback has exactly **one** dispute candidate, the dispute has exactly **one** payback candidate, and `payback.remaining ≤ owed − recovered`. Anything else stays a suggestion for a person (Refund received).
- **`dispute_open_eligible`** on a `payback` candidate only when **all** of these hold: `toll_disputes` data is present; the payback is a `trip_line` on a platform with `takes_disputes = true`; `payback.remaining < charge.remaining`; and the **B4 strict test, with the platform's `auto_apply` flag ignored**, passes: sole candidate on both sides, `on_trip` with a known drop-off, score ≥ `auto_apply_min_score`, not `date_only`, receipt `verified`. (With an Uber rate seeded, a J$370 payback on a J$390 toll scores 60 + 30 + 10 = 100; without a rate it is `payback_smaller` and stays a suggestion.)
- Each candidate in `MatchResult` carries `kind` and, for refunds, `dispute_id`. Add types for the new bundle keys. Scoring constants stay in `MATCHER_CONFIG_V1` (one new points key only if you need one; reuse `amount_exact` for the rate).

### 4. Store and act (SQL, `match_store`)
- Store `dispute_refund` candidates as suggestions with `kind` and `dispute_id`, with the same supersede and withdraw rules as today's.
- Then, **only when `toll_disputes` is on**, act on the eligible suggestions just stored, each in its own `BEGIN … EXCEPTION` block so a refusal skips that one only:
  - `dispute_open_eligible` → system `link_payback` (that payback, that charge, the payback's full open amount), then system `open_dispute` for the charge's remainder, one after the other in that block.
  - `dispute_settle_eligible` → system `settle_dispute` with `system = true`.
- System commands go through one new helper, `toll_system.run_system_command(company, intent, command_id, body, actor_job)`: it inserts the decision (`actor = 'system'`), runs `toll_write.dispatch`, stores the response, and on a repeated `command_id` returns the stored response (`replay`). Command ids: `matcher:link:<suggestion_id>`, `matcher:dispute:<suggestion_id>`, `matcher:settle:<suggestion_id>`. The expected versions in each body are read fresh at that moment; the commands themselves re-check everything (sealed weeks, states, amounts). System commands are never four-eyes gated.
- `match_store`'s response gains `actions: { opened, settled, skipped: [{suggestion_id, code}] }`. Return it through the runner's report (`toll_v2_matcher_run.ts`: add the counts, no other change).

### 5. A person's link also opens the dispute
When `toll_disputes` is on, and a **person's** `link_payback` or `apply_suggestion` links a `trip_line` payback on a `takes_disputes` platform and leaves the charge with a remainder > 0 and no active dispute, the same transaction opens the dispute for the remainder. Use a second, system decision through `run_system_command` with command id `auto-dispute:<link decision_id>`. A dispute must open the moment the payback is decided, not when the week is reconciled.

### 6. Undo of a link that opened a dispute
`undo_decision` on a link decision (system or person) whose charge has a dispute opened by that link (found by the `matcher:dispute:` / `auto-dispute:` command):
- dispute still `to_send` → the undo also withdraws it in the same transaction: reverse its provisional allocation (reversal first, Y3) and give the row `close_reason = 'undo'` (the S1 undone-row pattern). Then the link is undone as today.
- dispute `sent` or later → refused **`DISPUTE_IN_PROGRESS`** with `{dispute_id, state}`.

### 7. `mark_dispute_sent` re-queues
After `mark_dispute_sent`, enqueue (`match_enqueue`) the dispute's charge and the driver's unallocated paybacks with `paid_on` ≥ today − 14 days, so a refund that arrived early is matched now that the dispute can take it.

### 8. Uber takes back a refund that settled a dispute (R7, T3, U10, C4.10)
`intent_reverse_payback`, for a payback with active `dispute_links` (all paths; take-back imports already call it):
- For **each** active link of that payback: reverse that one link and the firm platform allocation it wrote (or, for a sealed charge week, post the reversing legs in the open week, the S1 sealed-week money rule). Then insert a **new** dispute row with `reopens_id` = the settled row, `owed_minor` = that link's `amount_minor`, and the state the dispute had **when that payback settled it**:
  - it was `sent` → new row `sent`, `clock_from` = the reversal time (two fresh refund periods);
  - it was `expired` → new row `expired` at once, bearer = the same bearer (driver, or fleet if `opened_late`), and the bearer allocation is written again for the reversed amount.
  - Write the reopened state's allocation (provisional platform for `sent`, bearer for `expired`) in the same transaction, reversal first (Y3).
- The old row keeps its state and `close_reason`. Other links on the old row stay untouched. Money moves in the open week. If "the state when it was settled" isn't stored on the link today, store it from now on (`dispute_links.state_at_settle`); for older links, read it from the dispute's state at the link's decision.

## Tests

**SQL:** new file `supabase/tests/toll_matcher_disputes_test.sql` (`BEGIN … ROLLBACK`, made-up company, real commands through `public.toll_v2_command` as a manager, and `match_claim` / `match_store` / `toll_sys_*` as the system, the same harness as the S1 and S1b tests). Seed settings with `approve_settings_seed` and an Uber `platform_refund` rate with `change_toll_settings` (the company has one manager, so self-approve with a reason). Run `nightly_checks` after every money step; all must pass. Prove:
1. **Switch off:** `match_claim` has no `rates` / `disputes` keys; a `match_store` result carrying `dispute_open_eligible` does nothing (no link, no dispute); a person's link leaving a remainder opens nothing.
2. **Done-test 1:** a J$390 toll, a J$370 Uber trip payback, a J$370 Uber rate. The bundle carries the rate and the dispute data; `match_store` with an eligible result links J$370 and opens a J$20 `to_send` dispute; the charge is `decided`; `receivable_platform_dispute` = 2000. Storing the same result again changes nothing (replay).
3. **Not clear → not opened:** the same with two competing charges → stored as a suggestion only; a person's `apply_suggestion` then opens the dispute for the remainder in the same transaction (`auto-dispute:`).
4. **Dispute first (C4.9):** while a charge has an active dispute, the bundle and the engine give it no payback candidates; a stored `payback` suggestion for it can't be applied (it's withdrawn or refused).
5. **Done-tests 3 / 3b / 12:** sent dispute, a J$20 adjustment in the first period → settled `won` by itself; again in the second period → `won`; again with the charge week sealed → `won`, the sealed week's ledger byte-identical, the posting in the open week. Outside the window → no candidate.
6. **Ambiguous refund:** two sent disputes of the same driver and one J$20 adjustment that fits both → two suggestions, nothing settled.
7. **Done-test 13:** a late `trip_line` for the disputed trip settles the dispute; the toll is never covered twice (Σ active allocations = amount).
8. **`to_send` can't take a refund** (Y2): an adjustment while `to_send` → no candidate; after `mark_dispute_sent`, the re-queued adjustment settles it.
9. **Expired + adjustment** (done-test 5c path): an expired dispute with the driver as bearer and a J$20 adjustment in its window → `won`, the driver's J$20 reversed in the open week.
10. **Undo cascade:** undo of the system link while the dispute is `to_send` → both undone, balances back, checks pass; after `mark_dispute_sent` → `DISPUTE_IN_PROGRESS`.
11. **Done-tests 14 / 14b (R7):** take-back of a refund that won a `sent` dispute → new `sent` row (`reopens_id`, `owed` = the link amount, fresh `clock_from`), J$20 owed by Uber again; take-back of a refund that won an `expired` dispute → new `expired` row, the driver charged J$20 again in the open week; a payback with two links → only the reversed link's amount reopens; the old rows keep their state.
12. `apply_suggestion` on a `dispute_refund` suggestion → refused.

**TypeScript:** add engine tests for the plaza-rate rule, dispute-first exclusion, refund candidates (window edges, sole vs ambiguous, `to_send` never, expired adjustments only), `dispute_open_eligible` (each failing condition on its own), and the v1 / v2 version switch. Put the new golden cases in a **new** file (`matcher.disputes.golden.test.ts`). The existing `matcher.golden.test.ts` and `engine.test.ts` cases must pass unchanged.

**Every existing toll SQL test** (all 23 files: `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`) must still pass **without edits**. If one fails, fix your code, not the test. If you believe a test is wrong, stop and report; don't change it.

## CI
Add the migration and the new SQL test to `.github/workflows/parts-sql-checks.yml`, in the same style as S1 / S1b.

## How to check your work (local only)
1. Start Docker yourself (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, wait for `docker info`).
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll SQL test file (24 with the new one). In Git Bash set `MSYS_NO_PATHCONV=1` first, then `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`.
4. Run the toll-core engine tests, `node scripts/validate-migration-sql.mjs` and `pnpm check`. Run vitest from the `C:\Roam\Goride` path in PowerShell, not a `/c/` Git Bash path.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or any existing test file.
- Change only: the new migration, the new SQL test, `engine.ts`, `types.ts`, `index.ts`, the new engine golden test file plus **new** cases appended to `engine.test.ts`, `toll_v2_matcher_run.ts` (action counts only) and its test, and the workflow file. If you find you need to change anything else, stop and report.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text). Don't paste file contents or full SQL. I'll read the files.
