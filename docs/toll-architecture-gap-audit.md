# Toll architecture: disputes and InDrive (plan + build status)

**Rev 33 · 21 Nov 2026 · Status: BUILDING (first build). D1–S3, UI1, UI2 done. Round P started: 23 of 24 local done-tests pass; one open server finding (P-02, undo of a dispute result after its week sealed). Next: fix P-02, then the live rollout with every switch off.**

## START HERE (for a new chat)

**Prompt to start a new chat:** "Continue the toll disputes build. Read `docs/toll-architecture-gap-audit.md` START HERE first. D1–S3, UI1 and UI2 are done; round P is running: 23 of 24 Part D done-tests pass on the local copy (`scripts/toll-done-tests/run.ts`). Next step: fix finding P-02 (undo of a dispute result whose week was sealed must post in the open week, R10 / done-test 15), with its tests, then rerun the done-tests and plan the live rollout with every switch off. Keep me updated in short plain replies."

**What this is:** every toll the fleet pays ends with the right person paying it. **First principle (owner):** on a trip the **passenger** always owes the toll, never the fleet.
- **Uber** pays it back. If Uber pays short, the driver **disputes** it with Uber within 9 days; the refund comes in the next pay period or the one after.
- **InDrive** trips are cash, so the **driver collects the toll from the rider**, and the fleet decides Driver pays / Fleet pays.
- **Roam** charges the rider itself.
- The fleet or driver pays a toll only when getting it back fails or there was no trip, always by a person's decision or a policy, never by default.
- **Forward only:** nothing here changes a reconciled week or old data (the 219 old `fleet.claims`, the J$1,200 already kept).

**How we work (owner's playbook, `docs/how-we-build-playbook.md`):**
- Layers in order: Data → Server → Screens → Tests, one round at a time. Data and server are finished.
- **Claude builds the screens** (UI1, UI2) and their tests, checks them against the Stitch screens (memory "screen-check-recipe"), commits only the relevant files; the owner pushes. No branches.
- **Stitch = look, this audit = content:** copy the Stitch layout and style; every figure, list and button comes from C3 and the server, never from Stitch's sample numbers.
- Never touch the live database. **Nothing of this build is live** (commits are local until the owner pushes; every switch is off on the live company).
- The working copy also holds the owner's other unfinished work (maintenance, parts, log-service). Commit only toll files; if a shared file (like a workflow file) has other lines in it, stage only the toll lines.

**How to run the tests (local copy only):**
1. Start Docker Desktop. Run `npx supabase start`, then `npx supabase db reset`.
2. In Git Bash: `export MSYS_NO_PATHCONV=1`, then for each file `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`. **The 26 toll files:** every `toll_v2_*` (18, including `toll_v2_contract`, the who-can-call-what check), `toll_disputes_*` (2), `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`, `toll_matcher_disputes_test`, `toll_sweep_logged_trips_test`, `toll_screen_reads_disputes_test`. All must pass.
3. From **PowerShell** at `C:\Roam\Goride`: `npx vitest run packages/toll-core/src/v2/matcher` (74 tests) and the screen tests under `apps/fleet/src/components/fleet-financials/recon/tolls-v2/` (never from a `/c/` Git Bash path: it loads React twice).
4. Deno: `deno test --allow-all --no-check` on `supabase/functions/_fleet-server/` `toll_v2_matcher_run.test.ts`, `toll_v2_driver_disputes_controller.test.ts`, `toll_route_auth.test.ts`, `toll_v2_command_errors.test.ts` (43 tests). Then `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. `npx supabase stop` after, and stop any dev server you started. (Deno runs can upset the local Fleet app: if it errors, the owner stops it and runs `pnpm install`.)

**Where the build is (18 Nov 2026):**

| Round | Who | What | Status |
|---|---|---|---|
| D1–S3 | Cursor, reviewed by Claude | Data, dispute commands and money, four-eyes, settings, matcher, nightly sweep, "Uber report late" alert, InDrive trips, screen reads, driver dispute route | **Done** (last commit 574f0775) |
| UI1 | Claude | The six-part Tolls step (C3) on `toll_v2_week_desk`, + tests | **Done** 21 Nov (see "UI1 as built") |
| UI2 | Claude | Roam driver app dispute card, Driver Settlements → Disputes tab, Fleet Policy → Tolls (C3), + tests | **Done** 21 Nov (see "UI2 as built") |
| **P** | Claude + owner | **RUNNING** (21 Nov): local done-tests 23 / 24, see "Round P". Proof on the local copy (Part D done-tests, 9 Nov replay), then live with every switch off, settings seed and switch-on (L2.6), one real week with screenshots | — |

**Owner to-dos:** push the local commits (through 574f0775). Commit the log-service work's migration `20261118181439_log_service_positions.sql` before pushing: its time is earlier than S3's, and a database push can refuse it once S3 is live.

### UI1 as built (21 Nov 2026)
- Files: `apps/fleet/src/components/fleet-financials/recon/tolls-v2/` — `TollV2PartsDesk.tsx` (pills, part card, part 1, parts 2/4/5 reuse today's groups), `TollV2DisputesPart.tsx`, `TollV2SealPart.tsx`, `dialogs/TollV2DisputeDialogs.tsx` (Refund received, Lost, Open trip, sole-manager reason box), `tollV2Parts.ts` (labels only; every figure is the server's), `useTollV2Switches.ts`.
- **Shown only when the company's `toll_disputes` switch is on** (read from `toll_v2_toll_settings`). Switched off, step 3 is today's screen, unchanged (switch rule). So the six parts appear at switch-on (L2.6 step 3), not at deploy.
- Sole manager: any command the server refuses with `NEEDS_APPROVAL` opens a reason box (8+ characters) and is sent again with `self_approval_reason`; with two managers it says a second manager must approve.
- A refused seal redraws Still open from the refusal's `blocking` items (no error toast).
- Fixed on the way: Confirm all sure matches and Confirm never send an InDrive rider-pays-driver suggestion to `apply_suggestion`.
- Tests: `tollV2Parts.test.ts` (15) and `ReconTollsV2Parts.test.tsx` (10); all 140 Week Reconciliation screen tests pass. Run them from `apps/fleet` (`npx vitest run src/components/fleet-financials/recon`); from the repo root they stop on missing app settings.
- Screen check: every part drawn from the test fixture at 820 px and 390 px against the Stitch screens; no sideways scroll.

### What the screens read (built in S3; use these, never work figures out in the browser)

**Week Reconciliation step 3 (UI1): `public.toll_v2_week_desk(week)`** (signed-in, `toll.view`). Today's screen reads it through `useTollV2Desk.ts`; the keys it already had are unchanged. New keys:
- every charge has `part` (1 Matches, 2 Pick a trip, 3 Disputes, 4 No trip, 5 Other checks, 6 Decided) and `section` (new: `disputes`, `part_paid`); a disputed charge has `disputeId`. A charge is in exactly one section.
- each suggestion has `kind` and `command`: `payback` → `apply_suggestion`; `rider_pays_driver` (InDrive) → `{confirm: 'driver_pays', other: 'fleet_absorbs'}`, both sent with `suggestion_id`, with no payback and no score shown, reason key `rider_owed_driver_collects`.
- `parts`: six pills `{part, key, count, amountMinor, status}`; status `todo` / `clear` (part 3 also `waiting`; part 6 `sealed` / `ready` / `blocked`).
- `disputes`: `active` (every `to_send` / `sent` dispute of the company, any week; `fromWeekKey` for the "From week of" chip), `tiles` (`toSend`, `sent`, `late`: count + amount; Late overlaps the other two), `waitingMinor` (the blue box sentence). Each row: place, plate, `tollMinor`, `paidMinor`, `owedMinor`, `leftMinor`, `trip` (times), `daysLeft` / `windowDays` ("6 of 9 days left"), `red`, `windowClosed` ("Window closed — expires tonight"), `late`, `heldBySweep`, `bearerIfNotSent`, and the button flags `canMarkSent`, `canRefundReceived`, `canLost`. `sent` rows have `refundCandidates` (`paybackId`, `version`, `kind`, `paidOn`, `openMinor`, `inRefundWindow`, `suggestionId`); **Refund received** sends `settle_dispute` with `dispute_id`, `payback_id` and both versions.
- `results` ("Results this week"): dispute results whose money landed in this week, with `outcome`, `borneMinor`, `bearer`, who decided, and `undo` (send it to `undo_decision`; null once the dispute was reopened). Undo is offered even on a sealed week: it posts in the open week.
- `sumLine` `{spendMinor, paidBackMinor, driverMinor, fleetMinor, waitingOnUberMinor, stillOpenMinor}` for the seal box line, and `earlierResults` `{refundedMinor, toDriverMinor, toFleetMinor}` for the line under it.
- `blockers` each have `part` (the "Still open" list and its **Go to <part>** buttons). A refused `seal_week` returns `blocking` items with the same `part`: redraw Still open from them, never a generic error.
- `approvals` `{soleManager, thresholdMinor}`: the live owner is the only manager, so every button that needs a second person (Lost, Undo, a Refund received above J$5,000, reopen week, settings) shows a reason box (`self_approval_reason`, 8+ characters). Without it the server refuses `NEEDS_APPROVAL`.

**Driver Settlements → Disputes tab (UI2): `public.toll_v2_disputes(p_driver)`** → `active` (same rows, no refund candidates) and `byDriver` (`toSend`, `sent`, `late`, `leftMinor`) for the tab badges. Buttons: Mark as sent (`mark_dispute_sent`), Lost (`close_dispute_lost`), Open week (`chargeWeekKey`).

**Roam driver app (UI2): `GET /toll/v2/driver/disputes`** (fleet-toll, signed-in driver; the server finds the driver, never the request) → `{enabled, disputes}`: the driver's own `to_send` / `sent` disputes with the same row fields plus `text` (the dispute text, filled in). **Mark as sent:** `POST /toll/v2/driver/disputes/:id/sent` with `{command_id, expected_dispute_version}`; after the deadline it answers 409 `window_closed` with "The 9 days to dispute this toll have passed". Check which app is the "Roam driver app" before building (`apps/driver`; the old dispute screen was `apps/fleet/src/components/driver-portal/DriverClaims.tsx`).

**Fleet Policy → Tolls (UI2): `public.toll_v2_toll_settings()`** → `switches`, `disputePolicy`, `platforms`, `plazas` (tag price and each platform's rate: current = valid today, plus history), `templates`, `seeded`, `missing` (the same list the matcher refuses on), `approvals`. **Save** sends `change_toll_settings` (`platform_settings.<platform>.<snake_case field>`, `dispute_policy.lost_bearer` / `expired_bearer`); **Add rate** sends `plaza_rates_add: [{plaza_id, platform, rate_minor, effective_from}]`. No command accepts a tag price yet, so Add rate covers platform rates only.

**UI2 Stitch prompts written (21 Nov 2026):** `docs/stitch/toll-disputes-driver-prompt.txt` (Roam Driver: Home card, Tolls to dispute list, one toll with Copy text / Open Uber App / Mark as sent, sent, last day, time is up, short notice, empty — 10 screens) and `docs/stitch/toll-disputes-fleet-prompt.txt` (Driver Settlements → Disputes tab and Fleet Policy Configuration → Tolls tab, with Mark as sent, Lost, reason box, Add rate, price history, settings missing, phone — 12 screens). Screens made and saved 21 Nov 2026 (Keep / Drop / Fix below).

### Round P — proof on the local copy (21 Nov 2026)

**Done-test runner:** `scripts/toll-done-tests/run.ts` (Deno, own `deno.json` with `nodeModulesDir: none`, so it never touches the Fleet app's node_modules). Local database only (refuses any other URL). Each Part D story runs on its own fresh test company: files through the real import (`toll_sys_import`), the **real matcher** (`runTollMatcher` → claim → engine → store → nightly sweep), buttons through `public.toll_v2_command` as the signed-in owner and the driver route's RPC, and after every step the ledger accounts, the week desk read and the nightly money checks. Time passing is stood in for in two plain ways only: files dated in the past, and moving a dispute's sent clock or deadline back (the deadline is part of a dispute's identity, so the trigger is lifted for that one update, as the SQL tests do). Run: `npx supabase start`, then `deno run --config scripts/toll-done-tests/deno.json --allow-net --allow-env --allow-read scripts/toll-done-tests/run.ts` (`TOLL_DT_ONLY=5c,14` for some). Test companies stay in the local database (their ledger rows hold them); `npx supabase db reset` clears them.

**Result (21 Nov):** 23 of 24 pass — 1, 2, 3, 3b, 4, 5, 5b, 5c, 5d, 6, 7, 7b, 8, 8b, 9, 10, 12, 13, 14, 14b, 16, 17, 19. **15 fails (P-02).** 11 and 18 are staging-only (a copy of production data) and were not run. Done-test 4 is read with the C3 `settle_dispute` row: "the driver was charged" means an expiry with the driver as bearer (Lost is final), here with its week sealed before the refund — 5c is the same with the week open.

**Findings:**
- **P-01 (fixed, migration `20261121202246_toll_open_late_bearer.sql`):** a dispute that opens late (report after the 9 days) opened expired with the fleet's money but no `bearer` and no `posted_in_week_key`, so it never listed in Results this week, its chip read "Expired · decided", and the "earlier weeks: fleet pays" line left it out. `dispute_apply_fleet_open_late` now records `bearer = fleet` and the result week, as `dispute_expire` does. All 26 toll SQL files pass with it.
- **P-02 (open):** undo of a dispute result whose money posted in a week that was sealed afterwards (a refund won while the charge's week was open, then the week sealed) is refused `WEEK_SEALED`: `intent_undo_dispute_result` moves its reversal to the open week only for carried-fact entries, and reversing the result's allocations would change the sealed week. The desk still offers **Undo** on that row. R10 / done-test 15 need it to post the reversal and the restored "owed by Uber" in the open week as a carried fact, leaving the sealed week's allocations untouched. Not reachable live (switch off everywhere).
- **Test fix:** `toll_matcher_disputes_test.sql` section 2 dated its trip 6–12 days back depending on the weekday, so from Thursday to Sunday the dispute correctly opened expired and the file failed ("2 rpd got 0"). The trip is now 2 days back on any day.

### UI2 as built (21 Nov 2026)
- **Fleet — Driver Settlements → Disputes tab:** `apps/fleet/src/components/fleet-financials/recon/tolls-v2/disputes/` (`DriverDisputesTab.tsx`, `useTollV2Disputes.ts`). Reads `toll_v2_disputes(null)` once; the driver chip filters on screen, so the tiles always count every driver (tile totals are summed from the server's rows: this read has no tiles). Mark as sent (dialog) → `mark_dispute_sent`; Lost (dialog) → `close_dispute_lost`, reason box on NEEDS_APPROVAL; Open week → Week Reconciliation, Tolls step of the charge's week (opens on the first part with work, not straight on part 3). The tab and its amber badge (tolls to send) show only with the `toll_disputes` switch on.
- **Fleet — Fleet Policy Configuration → Tolls tab:** `tolls-v2/policy/` (`TollPolicyTab.tsx`, `tollPolicyLogic.ts`), added to `components/fuel/FuelConfiguration.tsx`. Shows once `seeded` (rollout step 2) or the switch is on; before that the page is unchanged. Save → in-app dialog with each change in words + reason → `change_toll_settings` with only the changed keys, `note` = the reason and `self_approval_reason` when sole manager. Add rate → `plaza_rates_add` (the generic reason box follows, because settings always need four-eyes). Tag price is read-only. Discard resets the draft. No browser "leave page?" prompt.
- **Missing settings (Fix):** the server's `missing` list holds `dispute_policy`, `platform_settings`, `plaza_rules`, `coverage_source` — not missing rates. The red banner shows those in plain words ("Ask Roam support" for plaza rules and coverage source, which no screen command sets). The red "Missing" chip is separate: a plaza with no current rate for a platform that takes disputes; it opens Add rate filled in.
- **Roam Driver app:** `apps/driver/src/components/tolls/` (`TollDisputesPage.tsx` with the Home card, `driverTollDisputes.ts`). Home card for fleet drivers with tolls to send; "Tolls to dispute" page (list → one toll → sheet); menu entry "Tolls to dispute" only while the server says `enabled`. Copy text, Open Uber App (`uberdriver://` through `openExternalUrl`), Mark as sent → `POST /toll/v2/driver/disputes/:id/sent`; `window_closed` → Time is up page. Consequence sentence from `bearerIfNotSent` / `openedLate` (B5, AG6).
- **Driver Fix:** the server stores no sent date in the driver row, so the sent page says "Sent. Nothing else to do." and one ticked row "Marked as sent" (no date).
- **Tests:** Fleet `DriverDisputesTab.test.tsx` (8) and `TollPolicyTab.test.tsx` (6); driver `driverTollDisputes.test.ts` (8: the calls, window_closed, wording). The driver app has no jsdom / Testing Library, so its screens were checked against Stitch instead of screen tests. All 247 Fleet and 61 driver tests and `pnpm check` pass.
- **Screen check:** every new screen drawn with server-shaped sample data at desktop and 390 px and compared with the Stitch screens; no sideways scroll. Fixed on the way: the Fleet Policy Save bar is an in-page sticky card (a full-width fixed bar would cover the app's side menu).

### UI2 Stitch screens: Keep / Drop / Fix (21 Nov 2026)

Saved in `docs/stitch/toll-disputes-driver/` (10 screens) and `docs/stitch/toll-disputes-fleet/` (12 screens). Same rule as UI1: Stitch = look, this audit and the S3 reads = content.

- **Roam Driver app — Keep:** the Home card (amber edge, "N tolls to dispute with Uber", "Uber still owes J$… on tolls from your trips", red chip for the oldest when 2 days or fewer, green Start); the "Tolls to dispute" list (summary card "N to send · J$… still owed" + "Sent and waiting on Uber: N", the 9-day tip, toll cards with a red left edge and "Send by …" when 2 days or fewer); the toll page (header card, three numbered step cards, message box, Copy text → "Copied" + toast, Open Uber App, Mark as sent, the consequence sentence); the confirm sheet; the sent page (green strip, blue chip, three ticked rows); last day (red banner); time is up (no step cards, "Back to tolls"); short notice (blue "the fleet pays it, not you" box); the empty state.
- **Driver — Drop:** Stitch's own Home cards ("This week's payout", "Active Shift"), its bottom tab bar and top bar (the app keeps its own); the "?" help icon in the top bar; "+ 7 more tolls" (the list shows every toll).
- **Driver — Fix:** the sent page's "Message copied" and "Sent in Uber" ticks are not recorded anywhere: show one ticked row "Marked as sent on <date>" only (the date the server stored). "Sent on <date>" in the green strip is the same date.
- **Roam Fleet — Keep:** Disputes tab (tab with amber count badge, one-line description, the three tinted tiles with count · amount, driver chips with a red dot when late, dispute rows with the trip pill, state chip, days left, "Week of …" chip, Mark as sent / Open week or Lost / Open week, "Show all N disputes"); one-driver card; the three dialogs (Mark as sent, Close as lost, reason); the empty state; the phone layout (stacked tiles, sideways chips, money box "Toll · Uber paid / J$… to dispute", stacked full-width buttons). Fleet Policy → Tolls tab: the switch chips strip ("Switched on by Roam support"), "When a dispute doesn't work out" with two segmented controls and the opened-late helper, the Platforms table (switches, How dropdown, Takes disputes, Days to dispute), the Toll prices table with Add rate and a chevron per row, the sticky footer (change count, Discard, Save), the Add rate dialog with its blue box, the price-history side panel ("Now" and "Starts …" chips), the red "Disputes can't open until these are set" banner with Add rate per line and red "Missing" chips, the Save reason dialog.
- **Fleet — Drop:** every app-frame / breadcrumb / footer change ("Driver Remittances", "Disputes Ledger", "© 2024 Roam Fleet Inc…", "Security & Compliance"); "Export Shortfalls", "Re-sync Toll Gateways", "Sort: Urgency", "Filters"; the progress bars and sub-lines inside the tiles ("Ready for driver submission", "Awaiting platform credit", "Expiring within 48 hours" — wrong: Late also covers sent disputes with no refund); "Showing 6 of 14 … Kingston Metropolitan Region", "Jamaica Transport Authority Standard"; "Policy v4.2 active", "Version 4.12 · Active Fleet Mandate"; platform sub-lines ("Rideshare API v2", "API v3.4 direct sync", "Last audited", "Configure webhooks", "3 Configured Integrations"); "Class 1" chips and the "Vehicle Class" picker; "Rates synchronized with Toll Authority…", "View historical rate archive", "View full tariff sheet", "Highway 2000 …" lines; the made-up helper lines under the who-pays controls ("Applies to unrecovered electronic toll transponder tolls", "Receipts must be forwarded within the platform SLA window", "Arbitration & Settlement Default", "72-hour filing window"); the red dot on the Tolls tab.
- **Fleet — Fix:** the settings-missing screen redrew the page (read-only who-pays and platform cards): keep the normal Tolls tab layout and add only the red banner and the "Missing" chips. "Lost" is a red-outline button, never red text alone. Tag price is read-only (no command accepts it). Every figure, count, name and date comes from `toll_v2_disputes` / `toll_v2_toll_settings` / the driver route, never from Stitch's samples.

### Rules the screens must respect (all enforced and tested on the server)
- **Switches (per company, all off on live):** `toll_disputes`, `logged_trips`, `rider_pays_driver`. With a switch off, the screen must look exactly as today (the reads return empty lists).
- **Dispute states:** `to_send`, `sent`, `won`, `part_won`, `lost`, `expired`. Only `to_send` can be marked sent; only `sent` can take Refund received or Lost; an `expired` dispute is settled by the matcher only (no Refund received button). Undone rows never appear in any read.
- The seal never waits on an open dispute: a disputed toll counts as decided for the seal but is shown in Disputes until it resolves.
- A sealed week's figures never change; later dispute results post in the week that is open then.

**First build vs second build:** the first build is D1–S3 (done), UI1, UI2 and P. The **second build** (after switch-on): staging with masked real-shaped data and a weekly refresh; raw upload files kept 7 years (`toll-evidence` bucket); a ledger reconstruction test since the 14 Nov 2026 switch; whole-batch refusal on a changed file layout (B18); dashboards, SLOs and the other runbooks (B19); property and chaos tests (B20); a 10× load test (B22); the `first_live_post` alert (B11). SMS is in neither. Not doing: sharding, an event bus, a rules engine, partitioning.

**Basics:** weeks are Monday–Sunday, Jamaica time (UTC−5, no daylight saving; ADR 0007); "the pay period after X" is the first full week that **starts after** X. Amounts are JMD minor units (`bigint`), displayed as "J$390.00".

---

## Vocabulary

### A6. States (derived, never stored)

- **Charge:** `duplicate`, `rejected`, `unverified` (blocks seal), `awaiting_cash` (Roam cash, doesn't block), `decided` (allocations = amount), `pending` (anything else).
- **Payback:** `pending`, `part_allocated`, `allocated`, `left_unlinked`, `reversed`.
- **Screen vocabulary (Y1):**
  - **`decided`** = Σ active allocations = amount, **provisional ones included**. This is the **seal criterion**.
  - **`disputed`** = `decided`, with an active **provisional dispute allocation**. The **Disputes** group.
  - **`resolved`** = `decided` with **no** active provisional allocation. The **Decided** group.
  - **`short_paid`** = not `decided`; a payback covers part and no dispute exists (only on `takes_disputes = no` platforms). The **Part-paid** group (no live occupant today).
  - So a disputed charge passes the seal (it is `decided`) and is still shown in Disputes (it isn't `resolved`).

---

### C3. Screens — every screen and every button

**Week Reconciliation, step 3 Tolls** (groups come only from the server state):

**Layout (owner, 17 Nov 2026):** one part at a time, like the Fuel step: a progress row of six parts (1 Matches, 2 Pick a trip, 3 Disputes, 4 No trip, 5 Other checks, 6 Seal), one card on screen, **Back** / **Next**. Next is never blocked; only **Seal tolls** waits. Each group below lives in one part: Suggested matches (both kinds) → part 1; Pick the right trip → 2; Disputes → 3; Tolls with no trip → 4; Part-paid, cash receipts, possible duplicates, paybacks with no toll → 5; Decided + Seal → 6. **Part 5 "Other checks"** = the items that are not about which trip a toll belongs to (AE1). **Part 6** has two sub-sections: **Decided** (list, **Undo** per row) and **Seal tolls** (sum line, blocking list, Seal button) (AE12). **Every figure on every part comes from the server**, never from the Stitch samples (AF4). Look and wording: Stitch prompt `docs/stitch/toll-step-slides-fleet-prompt.txt` (the Stitch screen is the spec for layout; this table is the spec for data and buttons).

**Stitch screens (saved 17 Nov 2026 in `docs/stitch/toll-step-slides/`, 10 screens):** only the area **inside the middle card, below the money tiles** is ported. Keep / Drop / Fix per the "Stitch = look, audit = content" rule:
- **Keep (the look):** the six-pill progress row with a status on each pill and the thin bar under it (take the pill style from `tolls_part_3_disputes_with_uber_12_to_send` for every part, so all six screens match); the part card (title, subtitle, status chip, footer with Back · "Part N of 6" · Next); the blue info box (on **Disputes only**; its one sentence is "<J$ waiting> is waiting on Uber. It doesn't stop you sealing this week. Refunds usually arrive in the next pay period or the one after.", AE3); the three summary tiles on Disputes (**To send** · **Sent, waiting on Uber** · **Late**; each tile shows the **count** with the amount beside it, as in Stitch, AH2; counted over every active dispute of the company, not only this week's, AD2; "Late" (Stitch said "Overdue"; renamed because it is a warning, not a loss, AH3) = a `to_send` dispute with 2 days or fewer left, or a `sent` dispute with one refund period in and nothing recovered (a refund can still come in the second period, so it is not a reason to press **Lost**); Stitch's chip "No refund after 2 pay periods" becomes "No refund yet after 1 pay period", because after two periods the dispute auto-closes, AE2); the dispute row (place and time, plate, money line "Toll · Uber paid · J$20.00 to dispute", trip pill, state chip, days left, buttons); the green "Nothing to review" empty rows; the **Still open** list with Go to buttons (on **part 6 Seal**: one line per part that still has work, from the server's `part` on each blocker, each with **Go to <part>**; AE4); the seal box with the sum line (displayed exactly as "Spend J$5,410.00 = Paid back J$5,170.00 + Driver pays J$0.00 + Fleet pays J$0.00 + Waiting on Uber J$240.00"; "Waiting on Uber" is the week's open dispute total, C4.4, AE5); the sealing spinner (shown until `seal_week` returns; one transaction, no separate time target) and the sealed banner ("Tolls for the week of <date> are sealed." with **Continue to Tag account →**, step 4; AE6).
- **Which Stitch screen covers which part (AE7):** part 1 = `tolls_part_1_matches`; part 2 = `tolls_part_2_pick_the_right_trip` (also the empty-state pattern for any part with nothing in it); part 3 = `tolls_part_3_disputes_with_uber_12_to_send` + `tolls_part_3_disputes_a_few_weeks_later_sent_won_lost` + `tolls_part_3_disputes_mobile_390px` (the phone pattern for every part); part 4 = `tolls_part_4_tolls_with_no_trip`; part 5 = `tolls_part_5_other_checks`; part 6 = `tolls_part_6_seal_tolls_still_blocked` + `tolls_part_6_seal_tolls_ready` + `tolls_part_6_sealing_and_sealed`.
- **Drop (Stitch made it up; the app keeps what it has today):** every app-frame, step-rail, header and right-column change (renamed steps such as "Telematics Ingest" or "Platform Clawbacks", "Batch #WK-46", "Assigned Controller", maps, "Ledger Batches", "Sync Verification", "Prepaid Tag J$48,650.00", other drivers, "Export Audit Trail", "Changelog"); the "Toll Recovery Velocity" card; the "Reconciliation Policy" box on Matches; "AUDIT BLOCK V", "STAGE 03", vehicle and trip-ref lines on receipts; the Decided table with transponder tags and invented cars (use one row per decided toll with its chip and **Undo**, as in C3); serif type (the app font is used).
- **Fix:** Matches rows on `tolls_part_1_matches` overlap (date, trip pill and amount are on top of each other): lay them out like the dispute row. The "Seal tolls (still blocked)" sum line must end with "+ Waiting on Uber J$240.00" (it is cut off). All figures come from the server, never from the Stitch samples.

| Group | Shows | Buttons |
|---|---|---|
| Suggested matches — **payback matches** (Uber) | Toll, trip, payback, score | **Confirm** (one), **Confirm all**. Commands: Confirm → `apply_suggestion` with the `suggestion_id` (as today); Confirm all → one `apply_suggestion` per suggestion, in order. Contrast the InDrive row below, which never uses `apply_suggestion` (AG7) |
| Suggested matches — **rider-pays-driver matches** (InDrive, AA1) | Toll, trip, and the reason "Rider owed it, driver collects in cash". **No payback and no score** (there is no payback to compare; the match is by time window only, AB1) | **Confirm Driver pays** (one), **Fleet pays** (one), **Confirm all Driver pays**. Commands: Confirm Driver pays → `driver_pays`; Fleet pays → `fleet_absorbs`; both carry the `suggestion_id` (AD5) |
| Pick the right trip | Toll and the 2 or more trips | **This trip** on each |
| **Disputes** (new) | "Portmore J$390 · Uber paid J$370 · J$20 disputed · Uber trip 6:27–8:25 AM", state, days left | **Mark as sent** (only on `to_send`), **Refund received** → pick the payback (only on `sent`), **Lost** (only on `sent`), **Open trip**. On an `expired` dispute there is **no** Refund received button: a late refund on an expired dispute is linked by the matcher only (system), so a person can't hand-link a refund to a dispute whose bearer is already charged (N3). **Which disputes show (AD2):** every active dispute (`to_send` / `sent`) of the company, whatever week its charge is in; a dispute whose charge week is not this week carries a chip "From week of 2 Nov". Below them, **Results this week**: dispute results whose `posted_in_week_key` is this week (won, part won, lost, expired, each with **Undo**); these are dispute results, not this week's charges. **Refund received** lists the driver's unlinked Uber paybacks near the trip date, both `adjustment` and `trip_line`; whichever is picked links to the **dispute**, never straight to the charge (R6, AF3) |
| **Part-paid — platform doesn't take disputes** (new, R8) | "J$390 · <platform> paid J$370 · J$20 left" | **Driver pays**, **Fleet pays** on the remainder. The only way to clear a `short_paid` charge. **No live occupant today** (AC3): Uber takes disputes, and InDrive produces no payback at all; the group exists for a future platform that pays part and takes no disputes |
| **Cash receipts to check** (exists today, AD1) | Driver-reported cash toll: date, place, driver, amount, receipt photo | **Check receipt** → dialog: **Receipt is fine** (`verify_cash_receipt`; if the amount was edited, `correct_charge_amount` first) or **Reject receipt** (`reject_cash_receipt` with a reason). Fine: the charge leaves `unverified` and is matched or decided like any toll. Reject: the charge becomes `rejected` and doesn't count |
| **Possible duplicates** (exists today, AD1) | The tag toll and the cash toll side by side, with the photo | **Same toll — keep the tag one** (`confirm_duplicate`: the cash one becomes `duplicate`) or **Different tolls — keep both** (`release_duplicate`) |
| **Uber paybacks with no toll** (exists today, AD1) | Payback: trip, paid on, amount, open amount, days since import (B17) | **Match to a toll** (`link_payback`) or **Keep with no toll** (`leave_payback_unlinked`; from switch-on it posts to `toll:other_income`, B17) |
| Tolls with no trip | Toll only | **Driver pays**, **Fleet pays** |
| Decided (part 6, top) | Toll and how it was decided. **Only charges of this week** (AG2); a charge decided in a sealed week is seen by opening that week | **Undo**, only while this week is open. A sealed week's decisions have no Undo on step 3 (sealed weeks are final, Part 0); a change goes through `reopen_week`. The one exception is a dispute result, undone from Disputes → Results this week (R10) |
| Seal tolls (part 6, bottom) | The sum line (AE5); while the server's blocker list is not empty, the **Still open** list (one line per part, e.g. "Part 5: 1 cash receipt to check") with **Go to <part>** | **Seal tolls**, disabled while anything blocks. If a seal is refused anyway (something changed between loading and pressing), the screen redraws the Still open list from the refusal's `blocking` items and their `part`; never a generic error (AD3) |

The three "exists today" groups are today's screens and commands (`ReconTollsV2Step.tsx`, `TollV2Sections.tsx`, `dialogs/` under `apps/fleet/src/components/fleet-financials/recon/tolls-v2/`), moved into part 5 unchanged; the redesign wraps them and does not rebuild them (AD1).

**Driver Settlements** — a **Disputes** tab per driver: open disputes, days left, overdue in red. Buttons: **Mark as sent**, **Lost**, **Open week**. No **Refund received** here: linking a refund is done on step 3 only (the driver app never settles either; the driver sees the card but cannot settle).

**Roam driver app** — a "Dispute this toll with Uber" card per `to_send` dispute: trip date and time, toll, amount owed, the dispute text. Buttons: **Copy text**, **Open Uber App** (opens the Uber driver app so the driver can start the dispute and paste), **Mark as sent** (Q6). The card also shows the consequence sentence from B5 (AD4). **Open Uber App** opens the Uber driver app only (`uberdriver://`, as the old `DriverClaims.tsx` did); there is no link straight to a trip's dispute form, so the driver finds the trip in Uber and pastes (AE13).

**Fleet Admin → Fleet Policy → Tolls** — fields: who pays a lost dispute, who pays an expired dispute; per platform: payback mode, pays tolls back (yes / no), takes disputes (yes / no), dispute window in days (Uber 9); per plaza: tag price and each platform's rate with a date. Buttons: **Save**, **Add rate**.

**Roam driver app card** shows the days left of the platform's window ("6 of 9 days left"); it turns red with 2 days left. **On the last day after the deadline has passed but before the nightly job runs (AG5)**, **Mark as sent** is hidden on the driver card and on step 3, and the row shows a red chip "Window closed — expires tonight", because `mark_dispute_sent` would refuse with `window_closed`.

---

## Part D — Done-tests (plain words, written before any build)

In Part D, "next week" means the first full pay period (Monday–Sunday) after the driver pressed **Mark as sent**, and "one week later" means the second (T6, X7).

1. A J$390 toll on an Uber trip, Uber pays J$370 → a J$20 dispute opens by itself, and the driver sees it in the app.
2. The week seals with that dispute open; Driver Settlements pays the driver; J$20 sits in "owed by Uber".
3. The driver taps **Mark as sent**; Uber's J$20 adjustment arrives in the next week's report → the dispute is won and the J$20 clears.
3b. The adjustment arrives one week later instead (the second pay period after sending) → still matched and won.
4. The same, but the fleet had charged the driver the J$20 → the charge is reversed in the open week.
5. The driver never sends it; 9 days from the trip pass → the dispute expires, and the driver bears J$20 in the open week.
5b. The Uber report is uploaded 10 days after the trip → the dispute opens directly as **expired** (`opened_late`), with no driver card → the fleet bears J$20, never the driver.
5c. The dispute expired and the driver bore J$20; Uber's J$20 refund then arrives within the two pay periods → the dispute is won, and the driver's J$20 is reversed in the open week (R5).
5d. The dispute opened late (`opened_late`), expired, and the fleet bore J$20; Uber then refunds J$10 → `part_won`; the fleet's charge drops by J$10; the other J$10 stays with the fleet; the driver is never charged (T2).
6. No refund in either of the two pay periods after sending → when the second report is uploaded, the dispute is lost by itself and the fleet bears J$20. (A person can also press **Lost** earlier.)
7. Uber pays J$10 of J$20 → the person closes it → J$10 recovered, J$10 to the lost bearer.
7b. Uber pays J$10 of J$20 and nobody closes it → when the second pay period's report is in, it becomes `part_won` by itself: J$10 recovered, J$10 to the lost bearer (R4).
8. A tag toll falls inside a hand-logged InDrive cash trip → it shows in **Suggested matches** as "Driver pays — rider owed this toll, driver collects it in cash"; the manager presses **Confirm Driver pays** → the driver bears it. Same toll, the manager presses **Fleet pays** instead (the driver couldn't collect) → the fleet bears it. Nothing in "no trip", no dispute.
8b. The driver paid an InDrive-trip toll in cash at the booth (a driver cash toll) → the same suggestion. The driver's cash at the booth is offset by the rider's cash he collected, so **Confirm Driver pays** records that the driver carries the toll, with the rider's money already in hand; the fleet doesn't pay him back. Fleet pays here would pay the driver back a toll the rider already covered, so it is only for a driver who didn't collect (AB9).
9. A toll during a Roam ride → native, unchanged.
10. A toll with no trip on any platform → only in "Tolls with no trip".
11. **Staging only** (forward-only, S11): replay a copy of the week of 9 Nov 2026 → 12 disputes (J$240) in **Disputes**, and the Portmore paybacks are exact matches at Uber's rate. Production's 9 Nov is never touched.
12. A dispute's charge week is sealed; the refund arrives → the dispute is won, the sealed week's ledger is unchanged, and the open week gets the posting (R1).
13. Uber's trip line for a disputed toll arrives late (a trip payback, not an adjustment) → it settles the dispute; the toll is never covered twice (R6).
14. Uber takes back a J$20 refund that had won a `sent` dispute → the dispute reopens as a new row in `sent` with the refund clock starting at the take-back, and J$20 is owed by Uber again in the open week (R7).
14b. Uber takes back a J$20 refund that had won an **expired** dispute (driver bearer) → it reopens as `expired`, not `sent`; the driver is charged the J$20 again in the open week; it is final at once and never stalls (T3).
15. A manager undoes a dispute result after its result week was sealed, with a second person approving → a reversing posting lands in the current open week; the sealed week is unchanged (R10).
16. The Uber reports for the two pay periods after sending never arrive → 23 days after sending, the dispute is lost (`no_report`), the fleet bears it, and the "Uber report late" alert was raised on day 3 after the first missing week (R3).
17. Driver taps **Mark as sent** after the deadline → refused, "The 9 days to dispute this toll have passed"; the nightly job expires it (S3).
18. **Staging only:** switch disputes on with a copy of production's 14–17 Nov toll data → the first nightly run passes every check: `receivable_platform_dispute` = 0, every `toll_week` statement has `disputed_minor` = 0 (the no-disputes baseline, N5), the existing `receivable_platform` check unchanged, `payback_unallocated` = undecided + the J$1,200.00 carve-out. No false alarm on day one (T4, S14).
19. A dispute is sent in one week and refunded two weeks later → the refund posts in the week that is open when it arrives (`posted_in_week_key`), not the week that was open when the dispute opened (T1).

---

## Roles and rollout

### L2.3 Role matrix

| Action | Driver | Fleet accountant | Fleet manager / owner | System |
|---|---|---|---|---|
| See own tolls, disputes, cash tolls | ✓ (own only) | — | — | — |
| See all drivers' tolls, disputes, cash tolls | — | ✓ | ✓ | — |
| Link a refund to a dispute by hand (**Refund received**) | — | — | ✓ (+ second person above J$5,000) | ✓ (matcher) |
| Log a cash toll | ✓ (own only) | — | ✓ | — |
| Mark a dispute sent | ✓ (own only) | — | ✓ | — |
| Upload files, confirm matches, Driver pays / Fleet pays | — | — | ✓ | — |
| Close a dispute lost, undo, correct amount or week, change toll settings | — | — | ✓ + second person above J$5,000 (B14) | — |
| Reopen a sealed week | — | — | ✓ + second person always (sole-manager exception with a reason, B14) | — |
| Open a dispute by hand (a platform paid nothing on a covered trip, B1 / W2) | — | — | ✓ | — |
| Open / settle / expire disputes, match, nightly checks | — | — | — | ✓ |
| View everything | — | ✓ | ✓ | — |

### L2.6 Rollout (round P)

0. **Proof on the local copy first:** every Part D done-test and the 9 Nov replay (on a copy, never production's real week).
1. **Deploy with every switch off.** Nothing live changes (each round was built so the switch-off path is byte-for-byte as before). Check the next nightly run is clean.
2. **Settings before switch-on (U1):** with the switch still off, `approve_settings_seed` for the live company (dry-run rows shown to the owner first; the owner self-approves with a reason, sole manager); check `coverage_source_id` = `uber_bundle` for Uber; enter Uber's plaza rates with `change_toll_settings` → `plaza_rates_add` from a checked list (without them nothing opens by itself).
3. **Switch on** `toll_disputes` (and, when ready, `logged_trips` and `rider_pays_driver`) for the owner's company. Right after: run `toll_system.record_legacy_kept` once; it must return **120000** (J$1,200.00). The nightly check must pass the next morning.
4. **One real week with screenshots;** the nightly check and the receivable check stay at 0 differences for 14 nights.
5. **Roll back by switching off:** no new disputes open; open ones keep their state and can be closed by hand.

---

## Part G — Owner questions still open

| # | Question | Working default until answered |
|---|---|---|
| Q1 | Scale in 1 and 3 years: companies, drivers, cars, weekly tolls and trips | Design for 10× today (≈150 tolls / 800 trips a week) |
| Q2 | Any audit, tax, insurer or data-residency rule on toll records (how long to keep them, where they must live)? | Keep 7 years (second build); project stays in `us-east-1` |
| Q3 | Who runs this day to day and who is on call? | The owner runs the weekly close; Claude plans and reviews; Cursor builds |
| Q8 | Which Supabase plan / backup level is production on (sets RPO / RTO)? | RPO ≤ 24 h, RTO ≤ 4 h targets, unconfirmed |
| Q9 | If the Uber reports for the two pay periods after sending never arrive, how many days before the dispute counts as lost? | **23 days** (`no_report_fallback_days`; built) |
| Q10 | When Uber's data arrives with under 2 days left to dispute, should the driver still get the dispute to send? | **Yes**; it's marked `opened_late`, so the fleet bears it if it expires (built) |
| Q11 | Who watches the staging refresh alert? (second build) | Claude |
| Q12 | When a platform pays **nothing** back on a trip, which trips count as "covered", so the system opens a dispute by itself? | A person opens these disputes by hand (`open_dispute`) |

**Answered (17 Nov 2026, details in git):** Uber's dispute window is 9 days; a refund always arrives in the next pay period or the one after; leave reconciled weeks and legacy data alone (Q7); InDrive is 100% cash, the rider owes the toll and the fleet decides whether the driver bears it (Q5); the dispute text needs no approval, the driver copies and pastes it into Uber (Q6); company isolation is a hard boundary (Q4, RLS + token-scoped writes).
