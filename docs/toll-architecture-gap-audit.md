# Toll architecture: disputes and InDrive (plan + build status)

**Rev 36 · 21 Nov 2026 · Status: LIVE, ON FOR EVERY COMPANY.** Toll disputes, InDrive logged trips and "rider pays driver" are switched on for every company, and every new company starts with them on and its settings set up (migration `20261121214215_toll_on_for_everyone.sql`). Switching on surfaced 4 bugs, all fixed and live (L2.6 below; the 4th, the sealed-week fingerprint, in `20261121215609_toll_week_hash_disputed_zero.sql`). Left: watch the nightly money check and one real week. Rev 34 removed finished build notes; they stay in git.

## START HERE (for a new chat)

**Prompt to start a new chat:** "Continue the toll disputes build. Read `docs/toll-architecture-gap-audit.md` START HERE first. Everything is live and on for every company. Check the latest nightly money check (`toll.nightly_results`) and the owner's first real week of reconciling, and fix anything that comes up. Keep me updated in short plain replies."

**What this is:** every toll the fleet pays ends with the right person paying it. **First principle (owner):** on a trip the **passenger** always owes the toll, never the fleet.
- **Uber** pays it back. If Uber pays short, the driver **disputes** it with Uber within 9 days; the refund comes in the next pay period or the one after.
- **InDrive** trips are cash, so the **driver collects the toll from the rider**, and the fleet decides Driver pays / Fleet pays.
- **Roam** charges the rider itself.
- The fleet or driver pays a toll only when getting it back fails or there was no trip, always by a person's decision or a policy, never by default.
- **Forward only:** nothing here changes a reconciled week or old data (the 219 old `fleet.claims`, the J$1,200 already kept).

**How we work (owner's playbook, `docs/how-we-build-playbook.md`):**
- Layers in order: Data → Server → Screens → Tests, one round at a time. Claude builds, tests and commits only toll files; the owner pushes. No branches.
- A server fix is a new migration named with the real current UTC time (`npx supabase migration new <name>`), never a future date (CLAUDE.md).
- The live database is changed only by migrations (`npx supabase db push`), never by hand.
- The working copy also holds the owner's other unfinished work (maintenance, parts, log-service, research). Commit only toll files; if a shared file has other lines in it, stage only the toll lines.

**Where the build is (21 Nov 2026):**

| Round | What | Status |
|---|---|---|
| D1–S3 | Data, dispute commands and money, four-eyes, settings, matcher, nightly sweep, "Uber report late" alert, InDrive logged trips, screen reads, driver dispute route | **Done** (574f0775) |
| UI1 | Week Reconciliation → Tolls step in six parts (`apps/fleet/.../recon/tolls-v2/`) | **Done** (98baf2fd) |
| UI2 | Roam Driver "Tolls to dispute" (`apps/driver/src/components/tolls/`), Driver Settlements → Disputes tab (`tolls-v2/disputes/`), Fleet Policy Configuration → Tolls tab (`tolls-v2/policy/`) | **Done** (62acff92) |
| **P** | Proof on the local copy, then live, switched on for every company | **LIVE** — 24 / 24 done-tests; on for every company (20261121214215) |

**Owner to-dos:** none. Everything through c0e2e100 is pushed and live.

**Where the new screens show:** for every company: the six-part Tolls step, the Driver Settlements Disputes tab and Fleet Policy → Tolls. The driver's dispute card shows in the next Roam Driver app build.

---

## Round P — proof (21 Nov 2026)

**Done-test runner:** `scripts/toll-done-tests/run.ts` (Deno, own `scripts/toll-done-tests/deno.json` with `nodeModulesDir: none`, so it never touches the Fleet app's node_modules). Local database only (refuses any other URL). Each Part D story runs on its own fresh test company: files through the real import (`toll_sys_import`), the **real matcher** (`runTollMatcher` → claim → engine → store → nightly sweep), buttons through `public.toll_v2_command` as the signed-in owner and through the driver route's RPC, and after every step the ledger accounts, the week desk read and the nightly money checks. Time passing is stood in for in two plain ways only: files dated in the past, and moving a dispute's sent clock or deadline back (the deadline is part of a dispute's identity, so its trigger is lifted for that one update, as the SQL tests do).

**Result (21 Nov, after P-02, fresh `db reset`):** **24 of 24 pass**: 1, 2, 3, 3b, 4, 5, 5b, 5c, 5d, 6, 7, 7b, 8, 8b, 9, 10, 12, 13, 14, 14b, 15, 16, 17, 19. The same run: 26 / 26 toll SQL files, engine 74, Fleet screens 247, driver app 61, server Deno 43, `validate-migration-sql`, `pnpm check` (9 / 9). 11 and 18 need a copy of production data (Q13) and were not run. Done-test 4 is read with the `settle_dispute` rule: "the driver was charged" means an expiry with the driver as bearer (Lost is final), here with its week sealed before the refund; 5c is the same with the week still open.

**Findings:**
- **P-01 (fixed, migration `20261121202246_toll_open_late_bearer.sql`):** a dispute that opened late (report after the 9 days) had the fleet's money but no `bearer` and no `posted_in_week_key`, so it never listed in Results this week and was left out of the "earlier weeks: fleet pays" line. `dispute_apply_fleet_open_late` now records `bearer = fleet` and the result week, as `dispute_expire` does.
- **P-02 (fixed, migration `20261121204321_toll_undo_sealed_result.sql`):** undoing a dispute result whose week was **sealed after** the result posted (for example a refund won while the charge's week was open, then the week sealed) was refused `WEEK_SEALED`, though the week desk offered **Undo** on that row. Cause: `intent_undo_dispute_result` reversed the result's entries at their own date (the sealed week) and reversed its allocations, which the sealed-week guard forbids.
  - **Now:** if any of the result's own entries (not carried) sit in a sealed week, the undo leaves that week's ledger **and** allocations alone. It works out the net money the result moved (P21 / P6 / P7 / P8) and posts it back, reversed, in the open posting week as P22 / P23 / P24, the way a result that arrives after its charge week sealed posts it. These entries are tagged with a new `dispute_result` carried fact (from the sealed week to the posting week). Results: a refund win comes back as "owed by Uber" again; a Lost or expiry takes the J$ back off the bearer; an expired-then-refunded dispute charges the bearer again. The new dispute row reopens as before.
  - **Knock-on fix:** `dispute_apply_rule2_refund` with a sealed charge week no longer needs an active provisional allocation (a dispute reopened this way has none), so the next refund still wins it in the open week.
  - **Also:** a second undo of the same result is now refused `WRONG_STATE already_undone`; before, it failed with a raw `DISPUTE_FINAL_LOCKED`.
  - **Limit:** the undone refund payback stays linked to the charge in the sealed week's allocations, so it cannot be picked again for this toll. Its money is back in "payback unallocated" on the ledger, and the nightly check allows for that through P22. A refund wrongly matched to the toll is the reason a manager undoes, so this is acceptable.
  - **Tests:** `toll_dispute_commands_test.sql` p02-won / p02-lost / p02-expire / p02-expired-refund cover all four result types. Each checks the sealed week's ledger hash, its allocations, the carried fact, that the undo posts only in the posting week, the balances, and the nightly checks. p02-won also checks the second-undo refusal and a second refund. Done-test 15 now passes; it also refuses a second undo and checks that a new Uber refund wins the dispute again in the open week. Undo is four-eyes only above J$5,000 (B14), so the J$20 undo needs no approval. Screen reads unchanged: Results this week already offered Undo here, and now it works.
- **Test fix (done):** `toll_matcher_disputes_test.sql` section 2 dated its trip 6–12 days back depending on the weekday, so it failed from Thursday to Sunday; the trip is now 2 days back on any day.

**Local proof is complete.** Next: L2.6 below.

---

## How to run every toll test (local copy only)

1. Start Docker Desktop. `npx supabase start`, then `npx supabase db reset` (a reset also clears the done-test companies, which stay in the local database because their ledger rows hold them).
2. **SQL (26 files)** in Git Bash: `export MSYS_NO_PATHCONV=1`, then for each file `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`. The files: every `toll_v2_*` (18, incl. `toll_v2_contract`), `toll_disputes_*` (2), `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`, `toll_matcher_disputes_test`, `toll_sweep_logged_trips_test`, `toll_screen_reads_disputes_test`. All must pass.
3. **Done-tests:** `deno run --config scripts/toll-done-tests/deno.json --allow-net --allow-env --allow-read scripts/toll-done-tests/run.ts` (`TOLL_DT_ONLY=15` to run some).
4. **Engine:** from PowerShell at `C:\Roam\Goride`: `npx vitest run packages/toll-core/src/v2/matcher` (74 tests).
5. **Fleet screens:** from PowerShell at `C:\Roam\Goride\apps\fleet` (from the repo root they stop on missing app settings; never from a `/c/` Git Bash path, it loads React twice): `npx vitest run src/components/fleet-financials src/components/fuel` (247 tests).
6. **Driver app:** from `C:\Roam\Goride\apps\driver`: `npx vitest run` (61 tests; this app has no jsdom / Testing Library, so its toll tests cover the server calls and wording, and its screens were checked against Stitch).
7. **Server (Deno):** `deno test --allow-all --no-check` on `supabase/functions/_fleet-server/` `toll_v2_matcher_run.test.ts`, `toll_v2_driver_disputes_controller.test.ts`, `toll_route_auth.test.ts`, `toll_v2_command_errors.test.ts` (43 tests). Then `node scripts/validate-migration-sql.mjs` and `pnpm check`.
8. `npx supabase stop` after, and stop any dev server started. (`deno test` with the root config can upset the local Fleet app: if it errors, the owner stops it and runs `pnpm install`. The done-test runner's own config does not.)

---

## Rules the build must keep (enforced and tested on the server)

- **Switches (on for every company, and on from creation):** `tolls_v2`, `toll_disputes`, `logged_trips`, `rider_pays_driver`. They stay only as an emergency off: with one off, that company's screens look as before (the reads return empty lists).
- **Dispute states:** `to_send`, `sent`, `won`, `part_won`, `lost`, `expired`. Only `to_send` can be marked sent; only `sent` can take Refund received or Lost; an `expired` dispute is settled by the matcher only. `won`, `part_won` and `lost` are final (an undo writes a new row). Undone rows never appear in any read.
- The seal never waits on an open dispute: a disputed toll counts as decided for the seal and is shown in Disputes until it resolves.
- **A sealed week's figures never change;** later results and reversals post in the week that is open then.
- **Four-eyes (B14):** Lost, Undo and Refund received above J$5,000, reopen week, and every toll-settings change need a second manager; the live owner is the only manager, so they self-approve with a reason (`self_approval_reason`, 8+ characters).
- **States (derived, never stored):** charge `decided` = active allocations add up to the amount, **provisional ones included** (the seal test); `disputed` = decided with an active provisional dispute allocation (shown in Disputes); `resolved` = decided with none (shown in Decided); `short_paid` = a payback covers part on a platform that takes no disputes (no live occupant).
- **Basics:** weeks are Monday–Sunday, Jamaica time (UTC−5, no daylight saving); "the pay period after X" is the first full week that **starts after** X. Amounts are JMD minor units (`bigint`), shown as "J$390.00".

**Second build (after switch-on, not now):** staging with masked real-shaped data and a weekly refresh; raw upload files kept 7 years (`toll-evidence` bucket); a ledger reconstruction test since the 14 Nov 2026 switch; whole-batch refusal on a changed file layout (B18); dashboards, SLOs and runbooks (B19); property and chaos tests (B20); a 10× load test (B22); the `first_live_post` alert (B11). Not doing: SMS, sharding, an event bus, a rules engine, partitioning.

---

## Part D — Done-tests (plain words)

"Next week" = the first full pay period after the driver pressed **Mark as sent**; "one week later" = the second.

1. J$390 toll on an Uber trip, Uber pays J$370 → a J$20 dispute opens by itself; the driver sees it in the app.
2. The week seals with that dispute open; the driver's settlement has no J$20; J$20 sits in "owed by Uber".
3. Driver taps **Mark as sent**; Uber's J$20 adjustment arrives in next week's report → won, the J$20 clears. 3b. It arrives one week later → still won.
4. The same, but the driver had been charged the J$20 → the charge is reversed in the open week.
5. Never sent; 9 days pass → expired, the driver bears J$20 in the open week. 5b. Uber report uploaded 10 days after the trip → opens expired (`opened_late`), no driver card, the fleet bears it. 5c. Expired, driver bore J$20, then Uber's refund arrives within the two pay periods → won, driver reversed. 5d. Opened late, expired, fleet bore J$20; Uber refunds J$10 → `part_won`, fleet's cost drops by J$10, driver never charged.
6. No refund in either pay period → when the second report is in, lost by itself, the fleet bears J$20.
7. Uber pays J$10 of J$20 → a person presses Lost → J$10 recovered, J$10 to the lost bearer. 7b. Nobody closes it → after the second report, `part_won` by itself.
8. A tag toll inside a hand-logged InDrive cash trip → "Driver pays — rider owed this toll, driver collects it in cash"; **Confirm Driver pays** → driver bears; **Fleet pays** → fleet bears; no dispute, nothing in "no trip". 8b. A driver cash toll during an InDrive trip → the same suggestion.
9. A toll during a Roam ride → native, unchanged.
10. A toll with no trip on any platform → only in "Tolls with no trip".
11. **Staging only:** replay a copy of the week of 9 Nov 2026 → 12 disputes (J$240) in Disputes, Portmore paybacks exact at Uber's rate. Production's week is never touched.
12. The dispute's charge week is sealed; the refund arrives → won, the sealed week's ledger unchanged, the open week posts it.
13. Uber's trip line for a disputed toll arrives late → it settles the dispute; the toll is never covered twice.
14. Uber takes back a refund that won a `sent` dispute → reopens as a new `sent` row, J$20 owed by Uber again. 14b. Take-back on a won **expired** dispute (driver bearer) → reopens `expired`, driver charged again, final at once.
15. A manager undoes a dispute result after its result week was sealed, with a second person approving → a reversing posting lands in the open week; the sealed week is unchanged. **(P-02)**
16. Uber reports for both pay periods never arrive → 23 days after sending, lost (`no_report`), the fleet bears it; the "Uber report late" alert was raised 3 days after the first missing week.
17. Driver taps **Mark as sent** after the deadline → refused "The 9 days to dispute this toll have passed"; the nightly job expires it.
18. **Staging only:** switch disputes on with a copy of production's 14–17 Nov toll data → the first nightly run passes every check (`receivable_platform_dispute` = 0, every `toll_week` statement `disputed_minor` = 0, `payback_unallocated` = undecided + the J$1,200.00 carve-out).
19. Sent in one week, refunded two weeks later → posts in the week open when it arrives.

---

## L2.6 Rollout (round P)

0. **Proof on the local copy: done (21 Nov).** 24 / 24 done-tests. Done-tests 11 and 18 (production-data copy) were not run: the owner chose to go live without them (21 Nov). The nightly money check is the guard instead.
1. **Deployed (21 Nov):** push to `main` (f7680517); 9 toll migrations applied with `db push`; edge functions deployed (`fleet-toll` included); live checks: switches off at that point, no disputes, CI version check green, last nightly 20 / 20 ok.
2. **Switched on for every company (21 Nov, migration `20261121214215_toll_on_for_everyone.sql`).** No per-company step remains:
   - every switch defaults to on; every fleet company is switched fully on; a new fleet company is switched on and set up when it is created (trigger on `public.organizations`, `toll_system.setup_company`);
   - settings (Uber / InDrive / Roam platform settings, dispute policy: Lost → fleet, Expired → driver, the Uber dispute text, plaza rules) are set up automatically, and the matcher sets up anything new (a new plaza) by itself instead of stopping with `SETTINGS_MISSING`; Fleet Policy shows "set up" when the settings exist;
   - Uber refund rates at the 3 live plazas, read from what Uber actually paid on every linked trip: `b826e0b1…` J$370 (toll J$390), `f825d1d0…` J$275 (toll J$280), `9970b3af…` J$780;
   - the J$1,200.00 already kept (`record_legacy_kept`, checked 120000 on live before the switch-on).
   - **Bugs found by switching on, fixed in the same migration:** (a) an Uber take-back of a payback whose leftover was kept as income never reversed that income (books short by the kept amount); (b) linking a payback that opened a dispute answered with an out-of-date toll version, so the screen's next action was refused "changed"; (c) linking only part of an Uber payback opened a dispute against Uber though money was left on the payback. Dispute rules now: a dispute opens by itself only when the trip payback is used up and the toll is still not covered.
   - Tests: the older toll files now run with every switch on (the live state), except where a file covers the hand path (`toll_v2_commands`, part of `toll_v2_fact_corrections`), which switch it off on purpose. 26 / 26 SQL, done-tests 24 / 24 (their companies now use the automatic setup), engine 74, Fleet screens 247, driver app 61, server 43.
   - **Where settings live (owner, 21 Nov, `20261121222218_toll_platform_rules_roam_wide.sql`):** how Uber / InDrive / Roam pay tolls back is one Roam-wide list (`toll.platform_defaults`), edited by Roam staff in **Roam Fleet Admin → Toll platforms** (`/fleet-admin/toll-platforms`); saving updates every fleet, new fleets follow it, and the matcher re-applies it. Toll prices are Dominion's (plaza prices); Fleet no longer shows or sets any. **Fleet Policy → Tolls keeps only "When a dispute doesn't work out"**; `change_toll_settings` from Fleet accepts only `dispute_policy` (`platform_settings` / `plaza_rates_add` refused). Saving needs no reason and no second manager (`20261121221245`). The Uber refund rates per plaza (J$370 / J$275 / J$780) stay as hidden matching data only.
3. **Watch:** the nightly money check (`toll.nightly_results`, about 11:25 pm Jamaica) stays all ok; one real week of reconciling with the new Tolls step.
4. **Emergency off:** set that company's switch to false; no new disputes open; open ones keep their state and can be closed by hand.

---

## Part G — Owner questions still open

| # | Question | Working default until answered |
|---|---|---|
| Q13 | Production-data copy for done-tests 11 / 18 | **Answered 21 Nov: not needed; go live now** |
| Q1 | Scale in 1 and 3 years: companies, drivers, cars, weekly tolls and trips | Design for 10× today (≈150 tolls / 800 trips a week) |
| Q2 | Any audit, tax, insurer or data-residency rule on toll records? | Keep 7 years (second build); project stays in `us-east-1` |
| Q3 | Who runs this day to day and who is on call? | The owner runs the weekly close; Claude plans, builds and reviews |
| Q8 | Which Supabase plan / backup level is production on (sets RPO / RTO)? | RPO ≤ 24 h, RTO ≤ 4 h targets, unconfirmed |
| Q11 | Who watches the staging refresh alert? (second build) | Claude |
| Q12 | When a platform pays **nothing** back on a trip, which trips count as "covered", so a dispute opens by itself? | A person opens these by hand (`open_dispute`) |

**Answered (details in git):** Uber's window is 9 days; a refund arrives in the next pay period or the one after; leave reconciled weeks and legacy data alone (Q7); InDrive is 100% cash, the rider owes the toll and the fleet decides whether the driver bears it (Q5); the dispute text needs no approval (Q6); company isolation is a hard boundary (Q4); no report for 23 days → lost (Q9, built); under 2 days left → still sent to the driver, marked `opened_late`, the fleet bears it if it expires (Q10, built).
