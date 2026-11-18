# Give Cursor this — Toll disputes, Round S3 (screen reads + the driver's dispute route)

You are building **Round S3 only** of `docs/toll-architecture-gap-audit.md` (Rev 27). This is the **last data / server round**: after it, Claude ports the screens (UI1, UI2). Read these first; they are the spec:
- **START HERE**: the build table, **"What the built server does"** and **"Rules for Cursor prompts"**
- **A6** (screen vocabulary: `decided`, `disputed`, `resolved`, `short_paid`)
- **C3** (every screen and every button: the six-part Tolls step, Driver Settlements, the Roam driver app card, Fleet Policy → Tolls)
- **C4** tests 4, 8, 14, 17, 18, 19; **L2.3** (role matrix); **L2.4** (dispute state table)

D1, D2, S1, S1b, S2a and S2b are done and committed (latest: `20261118133523_toll_sweep_alert_logged_trips.sql` + `supabase/tests/toll_sweep_logged_trips_test.sql`).

**Not in this round:** any screen or React code (`apps/`), the four-eyes request inbox (who sees `request_approval` requests), opening a dispute when the platform paid nothing (Q12), staging, alert dashboards.

**Goal (one sentence):** every screen in C3 can be drawn from one server read with no figure worked out in the browser, and a driver can see and mark sent **only their own** disputes.

**Switches:** with `toll_disputes`, `logged_trips` and `rider_pays_driver` all off (and so no disputes and no rider suggestions), every key the reads return today keeps exactly today's value. New keys are added, never renamed or removed.

## Rules (learned the hard way, D1–S2b)
- **Never bend logic to keep an old test green.** If an existing test fails because of a designed change, **stop and report** which test and why.
- **Build and test every path in this prompt**, sealed charge weeks included. Don't report a partial build.
- The S1 `dispute_apply_*` helpers post **at** the `p_line` they're given: pass "last used + 1". (You shouldn't need them here; reads write nothing.)
- In one test transaction every row has the same `now()`: find rows by their own keys, never "latest `created_at`".
- Check balances as **changes** with `toll_system.natural_balance`, never absolute numbers or raw `balance_minor` signs. Run `nightly_checks` after every money step.
- Seal only weeks that have ended. Give trips dates that keep a dispute inside its 9-day window on **any** day the test runs (CI runs every day, Mondays included). For "days left" and "Late" cases, **move `deadline` / `clock_from` in the test data**; never depend on today's weekday.
- Run the new test from start to end after every change.
- Reads are `STABLE` and write nothing. A read must never call a command.

## Look first
- The current desk: `toll_system.week_desk` in **`20261116235152_week_recon_activity_timeline.sql`** (the latest version; it added `driverStatus`, `offlineFlag`, `summary`). Re-create it from **that** version.
- `toll_system.weeks_overview`, `toll_system.undo_body`, `toll_system.decider`, `toll_system.trip_json`, `toll_read.check_view` / `check_week` (`20261113162537_toll_v2_screen_reads.sql`).
- `toll_system.charge_state`, `toll_system.seal_pending_part`, `toll_system.seal_blockers` (returns `part`), `intent_seal_week`'s refusal, `week_result_live` (`spend.disputedMinor`, `split.platformMinor`) (`20261118001833_toll_dispute_commands.sql`).
- `toll.disputes`, `toll.dispute_links`, `toll.dispute_policy`, `toll.dispute_text_templates` (placeholders `{trip_date}`, `{trip_time}`, `{plaza}`, `{toll}`, `{paid}`, `{owed}`), `toll.plaza_rules`, `toll.plaza_rates` (`20261117234730_toll_disputes_data.sql`).
- `toll_system.dispute_refund_bounds`, `intent_settle_dispute`, `intent_mark_dispute_sent` (`20261118122837_toll_matcher_disputes.sql`).
- `toll_system.platform_week_in`, `toll_system.dispute_refund_period_week_start`, `toll_system.dispute_sweep_hold`, `toll.suggestions` (`kind`, `dispute_id`, `trip_platform`, `trip_id`), `toll.platform_trips.withdrawn_at` (`20261118133523_toll_sweep_alert_logged_trips.sql`).
- `toll_write.command` (latest in `20261118060401_toll_four_eyes_settings_income.sql`), `toll_write.approval_requires_four_eyes`, `toll_system.manage_seat_count`.
- The driver cash-toll route `POST /toll/v2/driver-cash` in `supabase/functions/_fleet-server/toll_v2_import_controller.ts` (how it checks the driver role and resolves the driver with `resolveDriverIdForUser`), and `supabase/functions/fleet-toll/src/main.ts` (how toll routes are mounted). CI's "Check toll handlers avoid toll_system" step: edge code calls `public.*` functions only.

## What to build: one new migration + one edge controller
Create the migration with `npx supabase migration new toll_screen_reads_disputes`.

### 0. Close the `mark_dispute_sent` hole (security, do this first)
Today `toll_write.command` lets **any** signed-in user of the company run `mark_dispute_sent` (it skips the manager check for that intent), and `intent_mark_dispute_sent`'s "own dispute" check compares the trip's driver with the dispute's driver, which is always true. It never checks who is signed in. Fix:
- `toll_write.command`: `mark_dispute_sent` needs `toll.manage` like every other intent (remove the exemption).
- `intent_mark_dispute_sent`: remove its own `auth.uid()` permission block. Its callers authorise: `command` (manager) and the new driver function in section 6 (own dispute only). Keep every other check (switch, version, state, `window_closed`) and its money / enqueue exactly as now. Keep it revoked from everyone.
- Test it: a signed-in non-manager (a driver) calling `public.toll_v2_command('mark_dispute_sent', …)` → `FORBIDDEN`, and the dispute is unchanged.

### 1. One dispute row, built in one place
`toll_system.dispute_row_json(p_company uuid, p_dispute uuid) → jsonb`, used by every read below:
- `id`, `version`, `state`, `closeReason`, `platform`, `driverId`, `driverName`, `chargeId`, `chargeWeekKey`, `postedInWeekKey`, `openedLate`, `reopensId`;
- the toll: `occurredAt`, `plazaName`, `plate`, `tollMinor` (charge amount), `paidMinor` (what the platform paid on the trip = Σ the charge's active firm platform allocations from trip paybacks), `owedMinor`, `recoveredMinor`, `leftMinor` (owed − recovered);
- `trip` (`trip_json` of the dispute's platform trip: start and end times for "Uber trip 6:27–8:25 AM");
- the clock: `deadline`, `windowDays` (platform `dispute_window_days`), `daysLeft` = Jamaica date of `deadline` − Jamaica today, never below 0 (0 = the last day), `windowClosed` = `to_send` and `now() > deadline` ("Window closed — expires tonight", C3/AG5), `red` = `to_send` and `daysLeft <= 2`;
- `late` (the "Late" tile rule, AH3): `to_send` with `daysLeft <= 2` (window-closed ones included), **or** `sent` with refund period 1 in (`platform_week_in(company, platform, dispute_refund_period_week_start(clock_from, 1))`) and `recoveredMinor = 0`. A `sent` dispute with part recovered is not late;
- `heldBySweep` (`dispute_sweep_hold`: a refund may be waiting for a person);
- button flags (C3): `canMarkSent` = `to_send` and not `windowClosed`; `canRefundReceived` = `sent` only (never `expired`, N3); `canLost` = `sent` only;
- `bearerIfNotSent` (C4.18): `fleet` when `opened_late` or the company's `expired_bearer` is `fleet`, else `driver`, with `amountMinor` = `leftMinor`.

**Undone rows (`close_reason = 'undo'`) never appear in any list or count.** A row that a later row reopens (`reopens_id` points at it) carries `reopenedBy` (the new row's id).

### 2. The Tolls step payload: `toll_system.week_desk` (re-created)
Keep every existing key and value. Add or change only this:

**a. InDrive "Driver pays" suggestions (AA1, C4.16, C4.19).** Today the desk joins every suggestion to a payback, so a `rider_pays_driver` suggestion (no payback) is dropped and its toll falls into "Tolls with no trip". Fix the suggestion set: a suggestion is **current** when it is not superseded, not withdrawn, and either its payback still has an open amount (`payback`) or its trip is not withdrawn (`rider_pays_driver`). `dispute_refund` suggestions are not charge suggestions (see 2c). Each entry in a charge's `suggestions` gains:
- `kind` (`payback` / `rider_pays_driver`);
- `command`: `apply_suggestion` for `payback`; for `rider_pays_driver` `{confirm: 'driver_pays', other: 'fleet_absorbs'}`, both sent with `suggestion_id`;
- for `rider_pays_driver`: `trip` from `trip_platform` / `trip_id`, `paybackId` null, `paidBackMinor` null, `reasonKey` `rider_owed_driver_collects`, and no score shown (keep `score` in the JSON, but the confidence rules below still use it).

Sections and confidence use the same rules over current suggestions of both kinds (two at the same top score → `pick`).

**b. Sections and parts.** New sections: `disputes` (a charge whose state is `decided` **and** that has an active provisional dispute allocation, A6 `disputed`) and `part_paid` (state `short_paid`). `decided` now means A6 `resolved`; a charge is in exactly one section (C4.14). Every charge gains `part`: `suggested` 1, `pick` 2, `disputes` 3, `no_trip` 4, `receipts` / `duplicates` / `part_paid` / `awaiting_cash` 5, `decided` 6. A `disputes` charge carries `disputeId`.

**c. `disputes` (part 3), company-wide (AD2):**
- `active`: every `to_send` / `sent` dispute of the company, any charge week, as `dispute_row_json`, plus `fromWeekKey` = its `chargeWeekKey` when that isn't this week (the "From week of 2 Nov" chip), else null. Order: `to_send` first, then by `deadline`.
- `tiles` (AH2, counted over `active`, not only this week): `toSend {count, amountMinor}`, `sent {count, amountMinor}`, `late {count, amountMinor}` (amount = Σ `leftMinor`). Late overlaps the other two; say so in a comment.
- `waitingMinor` = Σ `leftMinor` over `active` (the blue box sentence, AE3).
- Each `sent` row gets `refundCandidates` (C3 **Refund received**, R6/AF3): the same driver's active, non-legacy, non-reversed paybacks of the dispute's platform, kind `adjustment` or `trip_line`, with an open amount > 0 and `paid_on` from the trip's Jamaica date to `refund_to` of `dispute_refund_bounds(clock_from, refund_periods)`. Each: `paybackId`, `version`, `kind`, `paidOn`, `openMinor`, `reference`, `inRefundWindow` (`paid_on` ≥ `refund_from`), `suggestionId` (a current `dispute_refund` suggestion for this dispute and payback, else null). Order: suggested first, then by `paid_on`. The button sends `settle_dispute` with `dispute_id`, `payback_id` and both versions; **check in the test that each listed candidate is accepted by `settle_dispute`**.
- A payback with a current `dispute_refund` suggestion is shown on its dispute row, so it **leaves** the desk's `paybacks` list ("Uber paybacks with no toll"), and its seal blocker gets `part` 3 (re-create `seal_blockers` with only that change).

**d. `results` (part 3, "Results this week", AD2/R10):** dispute rows with `posted_in_week_key` = this week and state `won` / `part_won` / `lost` / `expired`, as `dispute_row_json`, plus `outcome` (the state), `borneMinor`, `bearer`, the decider (who, when; system for the matcher and the sweep), and `undo` = `undo_body` of the decision that produced that result. `undo` is given **even when this week is sealed** (R10: it posts in the open week) and is null only when the row has `reopenedBy`. Check in S1/S2a/S2b code that every result path sets `posted_in_week_key`; if one doesn't, stop and report which. **Test: send each `undo` body to `undo_decision` (with `self_approval_reason`, sole manager) and it must succeed.**

**e. Sum line and earlier results (AE5, C4.4, AG3):** `sumLine` = `{spendMinor, paidBackMinor, driverMinor, fleetMinor, waitingOnUberMinor, stillOpenMinor}`, from `result` only: `waitingOnUberMinor` = `spend.disputedMinor`; `paidBackMinor` = firm platform money only (if `split.platformMinor` already includes provisional dispute allocations, subtract them, and say in your report which it was); `stillOpenMinor` = spend − the other four. For a sealed week these are the sealed figures (`disputed_minor` as at the seal). `earlierResults` = `{refundedMinor, toDriverMinor, toFleetMinor}` over `results` whose `chargeWeekKey` is before this week.

**f. Parts row (the six pills):** `parts` = six entries `{part, key, count, amountMinor, status}` with keys `matches`, `pick_trip`, `disputes`, `no_trip`, `other_checks`, `seal`.
- Parts 1, 2, 4, 5: `count` = items still to act on in that part (charges by `part`, plus part 5's open paybacks, review pairs and carried items, i.e. the blockers with that `part`); `status` `todo` when count > 0, else `clear`.
- Part 3: `count` = `tiles.toSend.count`; `status` `todo` when > 0, `waiting` when only `sent` ones exist, else `clear` (disputes never block the seal, C4.3).
- Part 6: `status` `sealed`, `ready` (no blockers) or `blocked`; `count` = number of blockers.

**g. Also on the desk:** each blocker gains `part` (from `seal_blockers`); `approvals` = `{soleManager: manage_seat_count = 1, thresholdMinor}` (the threshold from wherever `approval_requires_four_eyes` reads it), so the screen knows to show the reason box.

### 3. `rider_pays_driver` suggestions in `seal_pending_part`
It counts only suggestions whose payback is open, so a toll with only a rider suggestion is reported as part 4. Re-create it with the "current" rule of 2a: those tolls are part 1 (part 2 when two share the top score). The desk's `part` and the blockers' `part` must always agree; test it.

### 4. Seal refusal
Check that when `seal_week` is refused for open work, every item in `blocking` has `part`, and that it equals the desk's blockers for the same state (C4.17, AD3). If not, fix it there.

### 5. Driver Settlements → Disputes tab: `public.toll_v2_disputes(p_driver text DEFAULT NULL)`
`authenticated`, company from the token, `toll.view` (same checks as `toll_v2_week_desk`). Returns `active` (as 2c, without `refundCandidates`, filtered to one driver when `p_driver` is given; match both ids of that `fleet.drivers` row, `id` and `legacy_kv_id`) and `byDriver` = `[{driverId, driverName, toSend, sent, late, leftMinor}]` for the tab badges. **Open week** uses `chargeWeekKey`. No refund linking here (C3).

### 6. The driver's own disputes (Roam driver app, L2.3 "own only")
Two `service_role`-only functions (revoked from `anon` / `authenticated`); the edge resolves the driver, never the request body:
- **`public.toll_sys_driver_disputes(p_company uuid, p_driver text) → jsonb`:** `{enabled, disputes}`. `enabled` = the `toll_disputes` switch. `disputes` = that driver's `to_send` / `sent` disputes (both ids of the driver's row, as in 5), each as `dispute_row_json` plus `text`: the dispute's template (`text_version`, else the platform's latest unretired one; null when none) with every placeholder filled in Jamaica time (`{trip_date}` "9 Nov 2026", `{trip_time}` "6:27 AM–8:25 AM", `{plaza}`, `{toll}` / `{paid}` / `{owed}` as "J$390.00"). No `{` may be left in the text.
- **`public.toll_sys_driver_mark_dispute_sent(p_company uuid, p_driver text, p_user uuid, p_body jsonb) → jsonb`:** body `{dispute_id, expected_dispute_version, command_id}`. Refuse `NOT_FOUND` when the dispute isn't this driver's (don't reveal other drivers' disputes). Write the decision like `command` does (replay on the same `command_id`, `COMMAND_ID_REUSED` for another intent) with `actor = 'user'`, `actor_user_id = p_user`, `actor_job = 'driver_app'`, then run `intent_mark_dispute_sent`. Its refusals (`window_closed`, `VERSION_CHANGED`, `WRONG_STATE`, switch off) come back unchanged.

**Edge: new file `supabase/functions/_fleet-server/toll_v2_driver_disputes_controller.ts`**, mounted in `supabase/functions/fleet-toll/src/main.ts` next to the other toll apps:
- `GET /toll/v2/driver/disputes` and `POST /toll/v2/driver/disputes/:id/sent` (body `{command_id, expected_dispute_version}`).
- Signed-in **driver** role only (the same role check the driver-cash route uses); company from the token; driver from `resolveDriverIdForUser` (`DRIVER_NOT_FOUND` 400 when none). A `driver_id` in the body or query is ignored.
- Errors through `mapTollCommandError`. `window_closed` → 409 with `code: 'window_closed'` and `message: 'The <windowDays> days to dispute this toll have passed'` (done-test 17).
- Write the handlers as plain functions with injected dependencies (like `handleDriverCash`) so they can be tested without a server.

### 7. Fleet Policy → Tolls: `public.toll_v2_toll_settings()`
`authenticated`, company from the token, `toll.view`. Returns:
- `switches` `{tollDisputes, loggedTrips, riderPaysDriver, tollDisputesOnAt}`;
- `disputePolicy` `{lostBearer, expiredBearer}`;
- `platforms`: every `platform_settings` row (`platform`, `paybackMode`, `paysTollsBack`, `takesDisputes`, `autoApply`, `disputeWindowDays`, `refundPeriods`, `noReportFallbackDays`, `coverageSourceId`, and the other existing columns);
- `plazas`: each plaza rule with the plaza name, `tagPrice` `{current: {amountMinor, validFrom}, history}` and `platformRates` `[{platform, current, history}]` (current = the rate valid today; history newest first);
- `templates`: each platform's current template `{platform, version, body}`;
- `seeded` (has `approve_settings_seed` run for the company), `missing` (what `match_refuse_missing_settings` would list), `approvals` (as 2g).
Field names must line up with what `change_toll_settings` accepts (**Save**) and `plaza_rates_add` (**Add rate**); write that mapping as a comment above the function.

All new `public.*` reads: revoke from `PUBLIC`, `anon`, `service_role` where they're user reads; `NOTIFY pgrst, 'reload schema'` at the end.

## Tests

**SQL:** new file **`supabase/tests/toll_screen_reads_disputes_test.sql`** (`BEGIN … ROLLBACK`, made-up companies with one manager each and one driver user, the same harness as `toll_sweep_logged_trips_test.sql`; seed settings with `approve_settings_seed` + self-approval reason). Prove:
1. **Access:** `anon` / `service_role` can't run the user reads; no `toll.view` → `FORBIDDEN`; company B sees none of A's disputes; `authenticated` can't run either `toll_sys_driver_*`; **the section 0 fix** (a driver via `toll_v2_command('mark_dispute_sent')` → `FORBIDDEN`).
2. **Switches off:** the desk, `toll_v2_disputes` and the settings read work; `disputes.active` / `results` empty; no charge in `disputes`; a toll with only a payback suggestion still has `kind = 'payback'` and `command = 'apply_suggestion'`.
3. **Disputes part:** a disputed charge is in `disputes` (part 3) and not `decided`; a dispute of an earlier charge week is in `active` with `fromWeekKey`; an undone dispute appears nowhere; tiles' counts and amounts; `late` for: `to_send` with 2 days left (yes), 3 days left (no), `sent` with period 1 in and nothing recovered (yes), with part recovered (no), period 1 not in (no); `windowClosed` → `canMarkSent` false; `daysLeft` for "6 of 9".
4. **Refund received:** an `adjustment` and a `trip_line` of the driver are listed, another driver's and a legacy one are not; `inRefundWindow` right; each candidate accepted by `settle_dispute`; a `dispute_refund` suggestion's payback is on the dispute row, not in `paybacks`, and its blocker has part 3.
5. **Results this week:** won, part won, lost (person), lost (sweep), expired, each listed in the week it posted with the right `borneMinor` / `bearer`; each `undo` body succeeds through `undo_decision` and the row leaves `results`; a result of a **sealed** charge week shows in the posting week, the sealed week's ledger unchanged; a reopened row has `reopenedBy` and `undo` null; `earlierResults` sums.
6. **InDrive:** a toll inside a logged InDrive trip has a `rider_pays_driver` suggestion with `command {confirm: 'driver_pays', other: 'fleet_absorbs'}`, section `suggested`, part 1, blocker part 1; `driver_pays` with its `suggestion_id` → section `decided`; a withdrawn trip's suggestion disappears.
7. **Sum line:** open week with an open dispute: spend = paid back + driver + fleet + waiting on Uber + still open, to the cent; with no blockers `stillOpenMinor` = 0; after sealing, the same figures as at the seal even after the dispute is won in a later week.
8. **Parts:** each part's `count` / `status` through one scenario (todo → clear), part 3 `waiting` with only sent disputes, part 6 `blocked` → `ready` → `sealed`; every charge's `part` equals its blocker's `part`.
9. **Seal refusal:** add a new toll after reading the desk; `seal_week` is refused and every `blocking` item has the same `part` as the desk now shows.
10. **Driver:** driver A sees only A's disputes (both id forms), never B's; the text has no `{` left and shows the Jamaica date and time; `bearerIfNotSent` = driver normally, fleet when `opened_late`, fleet when `expired_bearer = 'fleet'`; A marks A's dispute sent → `sent`, decision has `actor_user_id` and `actor_job = 'driver_app'`; the same `command_id` again → replay; A on B's dispute → `NOT_FOUND`; after the deadline → `window_closed`; switch off → `enabled` false.
11. **`toll_v2_disputes`:** one driver's filter and `byDriver` counts.
12. **Settings read:** before the seed `seeded` false and `missing` not empty; after it, every field equals the seed; a `change_toll_settings` edit and a `plaza_rates_add` show up (current + history).
Run `nightly_checks` after every money step; all must pass.

**Deno:** new `supabase/functions/_fleet-server/toll_v2_driver_disputes_controller.test.ts`: a non-driver → 403; no driver found → 400 `DRIVER_NOT_FOUND`; the RPC gets the resolved driver, never a body `driver_id`; `window_closed` → 409 with the message; a replay passes through.

**Every existing toll SQL test** (all 25 files: every `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`, `toll_matcher_disputes_test`, `toll_sweep_logged_trips_test`), the engine tests and the existing fleet-toll Deno tests must still pass **without edits**. `toll_v2_screen_reads.sql` is the proof that the desk didn't change with the switches off. If one fails, fix your code, not the test. If you believe a test is wrong, stop and report.

## CI
Add the migration and the new SQL test to `.github/workflows/parts-sql-checks.yml` (same style as S2b), and the new Deno test to the toll Deno list in `.github/workflows/ci.yml` (next to `toll_v2_command_errors.test.ts`).

## How to check your work (local only)
1. Start Docker yourself (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, wait for `docker info`).
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll SQL test file (26 with the new one). In Git Bash set `MSYS_NO_PATHCONV=1` first, then `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`.
4. Run `npx vitest run packages/toll-core/src/v2/matcher` from PowerShell at `C:\Roam\Goride` (not a `/c/` Git Bash path), the new Deno test and `toll_v2_matcher_run.test.ts` (`deno test --allow-all --no-check …`), `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login code other than the `mark_dispute_sent` fix in section 0.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or any existing test file.
- Change only: the new migration, the new SQL test, `toll_v2_driver_disputes_controller.ts` and its test, `supabase/functions/fleet-toll/src/main.ts` (mounting only), and the two workflow files. Nothing under `apps/`. If you find you need to change anything else, stop and report.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text), plus the two findings asked for above (`split.platformMinor` and provisional money; any result path without `posted_in_week_key`). Don't paste file contents or full SQL. I'll read the files.
