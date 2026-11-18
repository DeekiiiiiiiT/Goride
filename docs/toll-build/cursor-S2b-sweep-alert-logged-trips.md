# Give Cursor this — Toll disputes, Round S2b (nightly dispute sweep, "Uber report late" alert, hand-logged trips, InDrive suggestions)

You are building **Round S2b only** of `docs/toll-architecture-gap-audit.md` (Rev 25). Read these first; they are the spec:
- **START HERE** (the build table and "Things learned", **especially the S2a review notes**: they list the mistakes that must not repeat)
- "Data still to build" (**Pay period**, **"Report in"** rows) and "Server still to build" (**Auto-close**, **Nightly `expire_disputes`**, **Logged-trips adapter** rows)
- **B6**, **B7**, **B19** in L2.2; **C4** tests 6, 7, 16, 19; **Part D** done-tests 5, 6, 7b, 8, 8b, 10, 16, 17
- **L2.4** (dispute state table)

D1, D2, S1, S1b and S2a are done and committed (latest: `20261118122837_toll_matcher_disputes.sql` + `supabase/tests/toll_matcher_disputes_test.sql`, engine `toll-matcher-v2`).

**Not in this round:** screen reads and screens (S3, UI1, UI2), the alert dashboard and other B19 alerts, opening a dispute when the platform paid nothing (Q12), staging.

**Goal (one sentence):** disputes close by themselves on time (expired, lost, part won, or `no_report`), the owner is warned on day 3 if an Uber report is missing, hand-logged InDrive trips reach the toll matcher, and a toll during an InDrive trip is suggested as "Driver pays", never decided automatically.

**Three switches, all off on the live company:** the sweep and the alert run only when `toll_disputes` is on; the adapter only when `logged_trips` is on; the InDrive suggestions only when `rider_pays_driver` is on. With a switch off, everything it controls behaves **byte-for-byte as today** (bundle keys absent, engine output identical, no rows written).

## Rules learned in S2a (read before you start)
- **Never bend money logic to keep an old test green.** If an existing test fails because of a designed behaviour change, **stop and report** which test and why. Don't defer, skip or fake a posting.
- **Every path in this prompt must be built and tested**, including the sealed-charge-week paths. Don't report a partial build as a date problem.
- Ledger line numbers: the S1 `dispute_apply_*` helpers post **at** the `p_line` they're given and return it, so pass "last used + 1". Two writers in one command must never reuse a line.
- In one test transaction every row has the same `now()`. Never find a row by "latest `created_at`"; find it by its own keys.
- Check balances as **changes** (before → after), with `toll_system.natural_balance`, never as absolute numbers or raw `balance_minor` signs.
- `seal_week` refuses a week that hasn't ended. Seal only weeks in the past; give trips dates that keep a dispute inside its 9-day window on **any** day the test runs (CI runs every day of the week, Mondays included).
- Run your new SQL test **from start to end** after every change. A test that stops at its first failure hides everything after it.

## Look first
- S1: `toll_system.dispute_expire`, `toll_system.dispute_auto_close` (they do the money; S2b decides **when**), `intent_undo_dispute_result` and how `intent_undo_decision` routes dispute results.
- S2a: `toll_system.run_system_command`, `match_claim`, `match_scope`, `match_store`, `dispute_refund_bounds`, the engine (`packages/toll-core/src/v2/matcher/`), `toll_v2_matcher_run.ts`.
- `toll_system.nightly_run` and its cron `toll-v2-nightly` (`20261112191942_toll_v2_nightly_and_payouts.sql`), `toll.alerts` (`kind` allows only `nightly_check`, `aging`, `payout_trigger` today).
- Coverage: `fleet.import_batches` (`organization_id` is **text**, `source_id`, `status`, `coverage_start`, `coverage_end`) and `recon._day_covered_by_batch` (`20261117203148_indrive_logged_trips_coverage.sql`). The Uber weekly report's `source_id` is **`uber_bundle`**. Toll imports record no coverage.
- Hand-logged trips: `fleet.trips` (`id` text, `organization_id` text, `date`, `driver_id`, `vehicle_id`, `platform`, `status`, `batch_id`, `payment_method`, `service_line`, `payload_json` with `requestTime` / `pickupTime` / `dropoffTime` / `isManual`). "App-logged" = `isAppLoggedTrip` in `supabase/functions/_fleet-server/trip_save_dedupe.ts`. InDrive trips are matched with `lower(platform) LIKE '%indrive%'` elsewhere (`20261117204932_cash_tolls_driver_reported.sql`). Toll charges carry the **fleet vehicle id** (`toll_v2_import_lookups.ts`); confirm `fleet.trips.vehicle_id` is the same id and say so in your report (if it isn't, stop and report).
- `toll.platform_trips`, `toll.suggestions` (S2a added `kind`, `dispute_id`), `toll_write.do_bear` (checks `suggestion_id`), `intent_apply_suggestion`.

## What to build: one new migration + engine changes
Create the migration with `npx supabase migration new toll_sweep_alert_logged_trips`.

### 1. Settings: where a platform's report coverage comes from
- `toll.platform_settings` gains `coverage_source_id text` (Uber: `'uber_bundle'`).
- `seed_dispute_setup` proposes it for a `takes_disputes` platform whose value is null (shown as a new value in the dry-run, never as "kept"); `change_toll_settings` accepts it under `platform_settings`.
- `match_refuse_missing_settings` lists a `takes_disputes` platform with no `coverage_source_id` (`kind: 'coverage_source'`).

### 2. "Report in" and the pay periods (pure SQL helpers)
- `toll_system.platform_week_in(company, platform, week_start date) → boolean`: true when **every day** Monday–Sunday of that week is covered by a `fleet.import_batches` row with `organization_id = company::text`, `source_id` = the platform's `coverage_source_id`, `status IN ('completed', 'committed')`, `day BETWEEN coverage_start AND coverage_end`. A platform with no `coverage_source_id` is never "in".
- Refund period N of a `sent` dispute = the Nth full Monday–Sunday week **starting after** `clock_from` (T6): period 1 starts `ledger.jamaica_week_start(clock_from) + 7`, period 2 starts 7 days later, up to the platform's `refund_periods`.

### 3. The dispute sweep (`toll_disputes` on)
`toll_system.dispute_sweep(company) → jsonb` runs these, each dispute in its own `BEGIN … EXCEPTION` block (a refusal skips that one only and is listed), and returns `{expired, closed, no_report, held: [ids], skipped: [{dispute_id, code}]}`:
- **Expire:** `to_send` with `now() > deadline` → `dispute_expire` (bearer per `dispute_policy`, fleet if `opened_late`).
- **Auto-close:** `sent` with `clock_from` set, once **all** its refund periods are in → `dispute_auto_close` with reason `partial_refund_two_periods` when `recovered_minor > 0`, else `no_refund_two_periods` (R4, T5).
  - **Hold instead of closing** when an unallocated payback of the same driver and platform, with `paid_on` inside the dispute's refund window (`dispute_refund_bounds`) and an open amount > 0, still exists. That refund may belong to this dispute and a person must look. List it in `held`; it isn't closed.
- **`no_report` fallback (R3):** `sent` with `now() > clock_from + no_report_fallback_days` (23) while any of its refund periods is still not in → `dispute_auto_close` with reason `no_report` (the fleet bears it). It never closes a dispute whose periods are all in (that's auto-close above), and it never runs on a `rider_pays_driver` platform (no disputes there).
- Each action is a **system decision** through `run_system_command`. Extend it with intents `dispute_expire` (body `{dispute_id}`) and `dispute_auto_close` (body `{dispute_id, reason}`), command ids `sweep:expire:<dispute_id>` and `sweep:close:<dispute_id>` (so a repeated sweep replays and moves nothing).
- **Undo:** a `dispute_auto_close` result is undone like a lost result: add it to the intents `intent_undo_decision` routes to `intent_undo_dispute_result`, with prior state `sent` (and the dispute's `clock_from` kept). A `dispute_expire` result is already routed; check that the sweep's decision row undoes the same way.
- Sealed charge weeks: S1's `dispute_expire` / `dispute_auto_close` already post in the open week for a sealed charge. Test that path; don't assume it.

**When it runs:** (a) in `toll_system.nightly_run`, per company, **before** `nightly_checks`; (b) at the end of `runTollMatcher` (`toll_v2_matcher_run.ts`) once the queue is drained, through a new service-role RPC `toll_sys_dispute_sweep(p_company)` (the matcher runs after every import, so an Uber upload closes what it can at once). Add its counts to the runner's report.

### 4. "Uber report late" alert (B19, P0; `toll_disputes` on)
- `toll.switch_state` gains `toll_disputes_on_at timestamptz`, set by a trigger when `toll_disputes` goes from off to on (forward only: weeks before switch-on are never checked).
- `toll.alerts.kind` gains `'report_late'`.
- `toll_system.report_late_check(company)`: for each platform with `takes_disputes` and a `coverage_source_id`, for each week whose Monday is on or after `ledger.jamaica_week_start(toll_disputes_on_at)` and whose Sunday is **3 or more Jamaica days before today** (the report is due within 2 days of week end, Part 0, so day 3 is late):
  - not in → open the alert, or refresh `last_seen_at` on the open one: `dedupe_key = 'report_late:<platform>:<week_start>'`, `severity = 'page'`, title "Uber report for the week of <d Mon> is not uploaded", `detail` = `{platform, week_start, days_late, open_disputes_waiting, runbook: 'docs/runbooks/toll-uber-report-late.md'}`;
  - in → set `resolved_at` on the open alert.
- It runs in `nightly_run` (after the sweep) and at the end of `toll_sys_dispute_sweep`.
- Write the runbook **`docs/runbooks/toll-uber-report-late.md`** (create the folder if needed): short and plain, for the owner. What the alert means; why it matters (refunds are matched only once the report is in, and after 23 days a dispute is lost as `no_report` and the fleet pays); what to do (upload that week's Uber report in Week Reconciliation); how to check it cleared (the alert resolves on the next sweep).

### 5. Logged-trips adapter (B6; `logged_trips` on)
- `toll.platform_trips` gains `source text NOT NULL DEFAULT 'import'` (`'import'`, `'logged'`) and `withdrawn_at timestamptz`. The matcher (bundle and engine) ignores withdrawn trips.
- A trigger on `fleet.trips` (`AFTER INSERT OR UPDATE OR DELETE`), only for a company whose `logged_trips` switch is on, mirrors each **app-logged** trip (the `isAppLoggedTrip` rule in SQL: `payload_json ->> 'isManual'` true, or `id LIKE 'manual\_%'`, or `batch_id IN ('live_driver_app', 'manual_entry')`) into `toll.platform_trips`:
  - platform: `'indrive'` for `lower(platform) LIKE '%indrive%'`; skip Roam / GoRide / Roam Rush (native) and **skip Uber** (Uber trips come from the Uber report; a hand-logged copy would be a second trip). Any other platform: its lower-case name. `service_line = 'rideshare'` only.
  - `platform_trip_id = 'logged:' || fleet.trips.id`, `source = 'logged'`, `driver_id`, `vehicle_id`, `request_at` / `pickup_at` / `dropoff_at` from the payload. Parse them the way the app reads them (check `trip_list_projection.ts` and the trip save code); a time without an offset is **Jamaica** time. Say in your report which formats you found.
  - `time_precision = 'minute'` when it has a request (or pickup) and a drop-off time, else `'date_only'` (from `date`). `payment_method`: `cash` / `card` from the trip, else `unknown`.
  - A trip deleted, cancelled (`status`), or no longer app-logged → set `withdrawn_at` (never delete; a suggestion that points at it is withdrawn on the next matcher run).
  - After each write, enqueue the trip (`match_enqueue(company, 'trip', platform_trips.id)`).
- `toll_system.logged_trips_sync(company)` re-mirrors every app-logged trip of the last 35 days (catches trips saved while the trigger couldn't run). It runs in `nightly_run` before the sweep.
- `match_scope`: a queued `trip` with no payback (a logged trip) brings in the charges of the same vehicle on the trip's Jamaica days (request − 1 day to drop-off + 1 day).

### 6. InDrive "Driver pays" suggestions (B7; `rider_pays_driver` on)
- `toll.suggestions`: `payback_id` becomes nullable; `kind` gains `'rider_pays_driver'`; new columns `trip_platform text`, `trip_id text` (the `platform_trips` key). Check: `rider_pays_driver` ⇔ `payback_id IS NULL AND trip_id IS NOT NULL AND dispute_id IS NULL`. Existing rows and kinds are unchanged.
- Bundle (`match_claim`), only when `rider_pays_driver` is on: key **`rider_trips`**, the non-withdrawn `platform_trips` of platforms whose `payback_mode = 'rider_pays_driver'` and whose vehicle matches a bundle charge, within a day of it. Absent when the switch is off.
- Engine: `rider_trips` present → engine version `toll-matcher-v2` (as with `rates` / `disputes`). For every charge that isn't excluded (and has no active dispute), and every rider trip of the same vehicle whose window (`windowFor`, same edges as trip paybacks: on-trip, en-route, post-trip, same-day for date-only) contains the crossing, emit a candidate `kind = 'rider_pays_driver'` with `trip` set and **no payback**. Score = window points + sole-candidate points; rules include `rider_pays_driver` and the reason text key `rider_owed_driver_collects`. `auto_apply` is **always false** and it is **never** `dispute_open_eligible` / `dispute_settle_eligible` (C4.7, AA2). A charge that also has payback candidates keeps them too; a person chooses.
- `match_store`: store these with `payback_id NULL` and the trip columns; key supersede / withdraw by (charge, payback, dispute, trip), so a rider suggestion and a payback suggestion for the same charge never replace each other. No action is ever taken on them.
- `intent_apply_suggestion` refuses a `rider_pays_driver` suggestion (`WRONG_STATE`, `use: 'driver_pays or fleet_absorbs'`, C4.19). `driver_pays` / `fleet_absorbs` with its `suggestion_id` work (`do_bear` already checks the charge) and withdraw it; the charge's other suggestions are withdrawn as today.
- Without the `logged_trips` switch there are no InDrive trips, so these tolls stay in "Tolls with no trip" (AC6). That's expected.

## Tests

**SQL:** new file **`supabase/tests/toll_sweep_logged_trips_test.sql`** (`BEGIN … ROLLBACK`, made-up company with one manager, the same harness as the S2a test; seed settings with `approve_settings_seed` + self-approval reason, and add committed `fleet.import_batches` rows with `source_id = 'uber_bundle'` to mark Uber weeks "in"). Run `nightly_checks` after every money step; all must pass. Prove:
1. **Switches off:** the sweep, alert, adapter and rider suggestions write nothing; the bundle has no `rider_trips`.
2. **Done-tests 5 / 17:** `to_send` past its deadline → the sweep expires it, driver bears J$20 (fleet if `opened_late`); `mark_dispute_sent` after the deadline is refused `window_closed`. Running the sweep twice changes nothing.
3. **Done-test 6:** `sent`, both refund periods' reports in, no refund → `lost` (`no_refund_two_periods`), lost bearer per policy. Only the first period in → nothing.
4. **Done-test 7b:** J$10 of J$20 recovered, both periods in → `part_won`, J$10 to the lost bearer.
5. **Hold:** both periods in but an unallocated J$20 adjustment of that driver inside the window → not closed, listed in `held`.
6. **Done-test 16:** `sent`, reports missing, day 24 after `clock_from` → `lost` (`no_report`), fleet bears; on day 22 → nothing. (Move `clock_from` in the test data; never wait.)
7. **Sealed charge week:** expire and auto-close a dispute whose charge week is sealed → the sealed week's ledger is byte-identical, the money lands in the open week.
8. **Undo** of a sweep `dispute_auto_close` → back to `sent` with its `clock_from`; undo of a sweep `dispute_expire` → back to `to_send`; balances back; checks pass.
9. **Report late:** switch on Monday of week W; on day 3 after W ends with no Uber coverage → one open `report_late` alert; a second check → still one (refreshed); coverage added → resolved. A week before switch-on is never alerted.
10. **Adapter:** an app-logged InDrive `fleet.trips` row → one `platform_trips` row (`source = 'logged'`, right times in Jamaica, `minute`); edit it → updated; cancel → `withdrawn_at` set; an imported (non app-logged) trip and a hand-logged Uber trip → nothing; `logged_trips_sync` heals a trip inserted while the switch was off.
11. **Done-test 8:** a tag toll during a hand-logged InDrive cash trip → a `rider_pays_driver` suggestion (no payback, never auto); `driver_pays` with its `suggestion_id` → driver bears it, the charge is `resolved`; the same with `fleet_absorbs` → fleet bears it. `apply_suggestion` on it → refused. No dispute opens.
12. **Done-test 8b:** a driver cash toll inside an InDrive trip → the same suggestion.
13. **Done-test 10:** a toll with no trip on any platform → no suggestion of any kind.
14. **Withdrawn trip:** cancel the InDrive trip → on the next matcher run its suggestion is withdrawn.

**TypeScript:** new engine cases in a **new** file (`matcher.rider.golden.test.ts`): rider candidates for each window edge, date-only, a charge with both a payback and a rider trip, never `auto_apply` or eligible, withdrawn trips ignored, and the v1 / v2 switch (no `rider_trips` key → v1 output identical; keep the S2a "v1 inputs carry no v2 keys" test passing). Runner test: the sweep RPC is called after the queue drains and its counts are in the report.

**Every existing toll SQL test** (all 24 files: `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`, `toll_matcher_disputes_test`) and every existing engine test must still pass **without edits**. If one fails, fix your code, not the test. If you believe a test is wrong, stop and report.

## CI
Add the migration and the new SQL test to `.github/workflows/parts-sql-checks.yml`, in the same style as S2a.

## How to check your work (local only)
1. Start Docker yourself (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, wait for `docker info`).
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll SQL test file (25 with the new one). In Git Bash set `MSYS_NO_PATHCONV=1` first, then `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`.
4. Run `npx vitest run packages/toll-core/src/v2/matcher` from PowerShell at `C:\Roam\Goride` (not a `/c/` Git Bash path), the runner test, `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or any existing test file.
- Change only: the new migration, the new SQL test, `engine.ts`, `types.ts`, `index.ts`, the new engine golden test file plus **new** cases appended to `engine.test.ts`, `toll_v2_matcher_run.ts` and its test, the new runbook, and the workflow file. If you find you need to change anything else, stop and report.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text), plus the vehicle-id and time-format findings asked for above. Don't paste file contents or full SQL. I'll read the files.
