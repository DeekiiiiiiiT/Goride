# Toll architecture: disputes and InDrive (plan + build status)

**Rev 22 · 18 Nov 2026 · Status: BUILDING (first build).** Rev 22: S1b reviewed by Claude, 5 findings fixed (R1–R5 under "Things learned"), 23 toll SQL files pass; next is S2. Rev 21: S1b prompt written; S1b choices added under "Things learned". The reviewer signed the design (round 8, Rev 18). Rev 20 trims everything already done (review rounds, as-built evidence, finished build rounds); the full history is in git (`git log -- docs/toll-architecture-gap-audit.md`, Rev 1–19).

## START HERE (for a new chat)

**What this is:** every toll the fleet pays ends with the right person bearing it. **First principle (owner):** on a trip the **passenger** always owes the toll, never the fleet. Uber pays it back (any shortfall is **disputed** by the driver within 9 days; the refund comes in the next pay period or the one after); InDrive trips are cash, so the **driver collects it from the rider** and the fleet decides Driver pays / Fleet pays; Roam charges the rider natively. The fleet or driver bears a toll only when recovery fails or there was no trip, always by an explicit decision or policy, never a default.

**How we work (owner's playbook, `docs/how-we-build-playbook.md`):**
- Build layers in order: Data → Server → Screens → Tests, one round at a time.
- **Cursor** builds the data and server rounds from a prompt file in `docs/toll-build/`. **Claude** reviews every round by reading the code and running the tests itself, fixes what's wrong, commits only the relevant files, and the owner pushes.
- **Claude ports the screens** (UI rounds), not Cursor.
- Cursor's "done" is not trusted until Claude has run the tests: twice so far it reported done with failing or missing tests.
- How to run the database tests on the local copy:
  1. Start Docker Desktop.
  2. Run `npx supabase start`, then `npx supabase db reset`.
  3. In Git Bash, set `MSYS_NO_PATHCONV=1`, then `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql` for every `toll_v2_*` (18), `toll_disputes_*` (2), `toll_sealed_week_guard_test`, `toll_dispute_commands_test` and `toll_four_eyes_settings_income_test` file (23 files). All must pass. (Earlier revs said 20/21 files; the real count was always 3 higher.)
  4. Run `npx supabase stop` after.
- Never touch the live database. Nothing of this build is live yet.
- Migration files are created with `npx supabase migration new <name>` (real UTC time).
- No branches; the owner pushes.
- Every Cursor prompt ends: "In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents."

**Where the build is (18 Nov 2026):**

| Round | Who | What | Status |
|---|---|---|---|
| D1 | Cursor | Data: switches (`toll_disputes`, `rider_pays_driver`, `logged_trips`, all off), platform_settings dispute fields, `plaza_rates`, `dispute_policy`, `dispute_text_templates`, `disputes`, `dispute_links`, allocation `dispute_id`, `seed_dispute_setup` (dry-run). `supabase/migrations/20261117234730_toll_disputes_data.sql` | **Done** (97bec27e) |
| D2 | Cursor | The database refuses money changes in a sealed week (B13). `20261118000711_toll_sealed_week_guard.sql` | **Done** (beec4537) |
| S1 | Cursor | Dispute commands and money: `open_dispute`, `mark_dispute_sent`, `settle_dispute`, `close_dispute_lost`, `dispute_expire` / `dispute_auto_close` (functions, not scheduled), undo of a dispute result, `driver_pays` / `fleet_absorbs` with `suggestion_id`, seal blockers with `part`, `disputedMinor`, posting rules P21–P24, nightly checks extended. `20261118001833_toll_dispute_commands.sql` + `supabase/tests/toll_dispute_commands_test.sql` | **Done** (3a3dfbb6, a7be5937). 20 toll SQL files pass |
| S1b | Cursor | B14 four-eyes (second person above J$5,000; `reopen_week` and settings changes always; sole-manager self-approve with reason), B12 `change_toll_settings` + `approve_settings_seed` + refuse to match without settings, B17 `toll:other_income` (P25 on each keep from switch-on; `legacy_carve_outs` row, 120000 on live, in the nightly check). `20261118060401_toll_four_eyes_settings_income.sql` + `supabase/tests/toll_four_eyes_settings_income_test.sql`, ADR 0024 | **Done** (reviewed + 5 fixes by Claude, 18 Nov). 23 toll SQL files pass |
| **S2** | Cursor | **NEXT: Claude writes the S2 prompt (`docs/toll-build/cursor-S2-...md`).** Matcher: dispute first, plaza rates, `rider_pays_driver` suggestions (never auto-apply). Opens disputes when a trip payback leaves a remainder on a `takes_disputes` platform. Schedules nightly `dispute_expire` + `dispute_auto_close` + the 23-day `no_report` fallback. Logged-trips adapter. Report-late alert. **Also `reverse_payback` on a payback linked to a dispute (R7, in C2 below), which S1 did not build** | — |
| S3 | Cursor | Screen reads: the step-3 payload in six parts; disputes company-wide with a "From week of" chip; Results this week; blockers with `part`; driver-app dispute read + `mark_dispute_sent` route | — |
| UI1 | Claude | Port the six-part Tolls step from `docs/stitch/toll-step-slides/` (C3 Keep / Drop / Fix) + its tests | — |
| UI2 | Claude | Driver app dispute card, Driver Settlements Disputes tab, Fleet Policy toll settings + tests | — |
| P | Claude + owner | Proof on the local copy (Part D done-tests, 9 Nov replay); then live, switched off; settings seed (L2.6 step 0); switch on; one real week with screenshots | — |

**Things learned while building (the build follows these, not older text below):**
- Uber's `payback_mode` is `per_trip` (the design said "trip_line").
- A provisional platform allocation needs `dispute_id` instead of `payback_id`.
- The dispute bearers live in `toll.dispute_policy`.
- Dated plaza rates live in `toll.plaza_rates` (append-only).
- `toll:other_income` was added in S1b. Its class is `revenue` (the ledger has no "income" class).
- **S1b choices (18 Nov):** (1) four-eyes, "refuse to match without settings" and the P25 income posting all turn on with the company's `toll_disputes` switch; with it off, every command is as today, so deploying S1b changes nothing live. The two settings commands work with the switch off, because the seed comes first (L2.6 step 0). (2) Approvals live in their own `toll.approval_requests` table (prepare + approve, the Week Recon pattern), because a decision row can't be changed after insert; the executed command gets its own decision row with `approved_by` and `approval_id`. (3) A settings change has no J$ amount, so it **always** needs a second person (B14 said "above J$5,000"). (4) The J$1,200 carve-out is a stored row (`toll.legacy_carve_outs`), recorded once at switch-on by `record_legacy_kept`, not a number in code; after that, undoing a pre-switch keep is refused (`LEGACY_KEEP_FINAL`) so the carve-out stays exact.
- **S1b review (18 Nov), fixed by Claude:** R1 Cursor had blocked self-approval for `reopen_week`, which would lock a sole-manager owner out of ever reopening a week; now every gated intent follows the same sole-manager rule. R2 "does this keep have a P25 posting" was checked per payback, so a payback with a pre-switch part-keep and a later keep looked fully posted (wrong carve-out, wrong week check, and undo would reverse a P25 that never existed); now checked per keep decision (`unlinked_has_p25(company, decision_id)`). R3 `change_toll_settings` now returns `changes` (before / after per row) on the decision response. R4 once the carve-out is recorded, keeps always post P25 and pre-switch keeps stay final even if the switch is turned off later. R5 undo of a dispute result in a sealed charge week counted as J$0 (its money is in postings, not allocations), so it skipped four-eyes; it now counts the `dispute_result` carried fact. Test sections 6, 9 and 10 cover these.
- `SETTINGS_MISSING` checks company-wide (every platform, plaza and the policy the company's live records use), not just the claim scope. Stricter than the prompt; kept. A new plaza stops matching until its rule is added (S2 / the report-late alert should surface this).
- Cursor changed two existing tests (beyond its allow list) and reported it: `toll_v2_postings` rule count 36 → 37 (P25) and the S1 F7 reopen now goes through `request_approval` / `approve_request` with a second manager. Both are correct.
- First-build proof uses the local Docker copy; staging comes in the second build.
- **Money rule (S1):** a dispute's money moves one way only. **Charge week open:** by reversing and inserting allocations (P21 / P6 / P7 / P8). **Charge week sealed:** by one net posting (P22 refund, P23 to bearer, P24 refund on expired) in `posting_week` (the Monday after the latest week whose current statement is closed), tied to a `dispute_result` carried fact.
- Undo reverses exactly the ledger rows of the undone command and restores the prior state's money. A reversal never lands in a sealed week.
- An undone dispute row keeps its state and gets `close_reason = 'undo'`. The one-open-dispute-per-charge rule skips undone rows.
- The deadline is the end of the Nth Jamaica day after the trip (9 Nov + 9 → 18 Nov 23:59:59).

**Prompt to start a new chat:** "Continue the toll disputes build. Read `docs/toll-architecture-gap-audit.md` START HERE first. Next step: S1b is done and committed; write the Cursor prompt for round S2 (the matcher) in `docs/toll-build/`, following the playbook, and keep me updated in short plain replies."

**First build vs second build:** the first build is the P0 items (L2.2) plus the dispute flow, InDrive `rider_pays_driver`, logged trips, the settings seed and the report-late alert. The second build is staging, the load test, property tests and B18's whole-batch refusal. SMS is in neither. Forward only: nothing here changes a reconciled week or legacy data (the 219 old `fleet.claims`, the J$1,200 already kept).

---

## Part 0 — Scope, scale and non-functional targets (added Rev 5, reviewer round 1)

**Two layers** (reviewer round 1):
- **L1, the toll domain** (Parts A–D): who bears each toll, and do the numbers add up?
- **L2, the platform envelope** (Part L2, after Part D): can we run, prove, secure, change and recover it?

**Forward only (owner, 17 Nov 2026):** nothing in this document changes, re-runs or back-fills a week that is already reconciled, or any legacy data (the old toll records, the 219 old `fleet.claims`, money already decided). Every fix applies from the day it is switched on, to open weeks and new records only.

**The reviewer has no access to the app or the database.** Every "exists" claim in this document cites a file, a migration or a live query result (17 Nov 2026), so the reviewer can judge without seeing the system.

| Item | Today (fact) | Target |
|---|---|---|
| Companies on toll v2 | 1 (`tolls_v2` on for one company since 14 Nov 2026) | Multi-company by design; size: owner fact needed (Part G, Q1) |
| Drivers / vehicles | 1 driver, 1 car with a TransJam tag | Owner fact needed (Part G, Q1) |
| Weekly volume | ~15 tag tolls, ~70–80 Uber trips, ~14 trip paybacks, 0–1 adjustments, ~10 hand-logged InDrive trips | Design for 10× (≈150 tolls / 800 trips a week) with no architecture change; load-test once at that level |
| Timezone | Every week is Monday–Sunday, Jamaica (UTC−5, no daylight saving; ADR 0007). Platform times are stored as UTC instants and shown in Jamaica time. "`trust_utc`" (old `brain_policies`) means the Uber CSV times are taken as UTC, as written. | Unchanged |
| Currency | JMD only, all amounts in minor units (cents) as `bigint`; no FX | Unchanged; any other currency is refused at import until an FX policy exists |
| Rounding | Proportional splits round half-even per slice, and the last slice takes the remainder so the slices sum exactly (design C3, `docs/toll-architecture.md`) | Unchanged |
| Data residency | Supabase project `us-east-1` (US) | Owner fact needed: any Jamaican residency or insurer rule (Part G, Q2) |
| Environments | Production + each developer's private local copy (Docker, `supabase start`); **no standing staging** | Add staging (B16 fix) |
| Settlement cutoff | Weeks are closed by hand when the inputs are in; no fixed weekly deadline yet | Uber report uploaded within 2 days of week end (needed for the 9-day dispute window); toll seal available by the following Monday 09:00 |
| RPO / RTO | Not set; depends on the Supabase plan's backups (owner fact, Part G, Q8) | RPO ≤ 24 h (daily backup), RTO ≤ 4 h, plus a ledger reconstruction test (B16 fix) |
| Retention | Raw upload files are **not** kept: they go to the `ephemeral-evidence` bucket, which `evidence-cleanup` empties. Each import batch keeps `file_sha256`, file name, `rows_parsed / committed / duplicate / rejected`, coverage dates | Raw files kept 7 years, immutable (B16 fix) |

---

## Vocabulary

### A6. States (derived, never stored)

- **Charge:** `duplicate`, `rejected`, `unverified` (blocks seal), `awaiting_cash` (Roam cash, doesn't block), `decided` (allocations = amount), `pending` (anything else).
- **Payback:** `pending`, `part_allocated`, `allocated`, `left_unlinked`, `reversed`.
- There is **no state for "the platform under-paid this toll"**, and none for "a dispute is open".
- **Proposed vocabulary (Y1), used everywhere from here on:**
  - **`decided`** = Σ active allocations = amount, **provisional ones included**. This is the **seal criterion** (A7). Unchanged from today.
  - **`disputed`** = `decided`, with an active **provisional dispute allocation** (W1 rule 1). A screen state: the **Disputes** group.
  - **`resolved`** = `decided` with **no** active provisional allocation. A screen state: the **Decided** group.
  - **`short_paid`** = not `decided`; a payback covers part and no dispute exists (only on `takes_disputes = no` platforms). The **Part-paid** group.
  - So a disputed charge passes the seal (it is `decided`) and is still shown in Disputes (it isn't `resolved`).

---

## The problems this fixes (summary; the full write-ups are in git history, Rev 19)

| # | Problem | Fix (one) |
|---|---|---|
| B1 | No dispute life-cycle for under-paid tolls | `toll.disputes` with to_send / sent / won / part_won / lost / expired (built in D1 + S1) |
| B2 | The seal forced an early Driver / Fleet decision on a shortfall | A provisional dispute allocation counts as decided; the seal passes and shows `disputedMinor` (S1) |
| B3 | Dispute refunds don't reliably find their toll | Matcher settles a disputed charge's dispute first, adjustments and trip paybacks (S2) |
| B4 | Lost or forgotten disputes have no rule | 9-day window per platform; lost → fleet, expired → driver, opened late → fleet (policy in `dispute_policy`); nightly expiry and auto-close (functions S1, scheduled S2) |
| B5 | The driver is never asked to dispute | Driver-app card per `to_send` dispute: Copy text / Open Uber App / Mark as sent, with the "what happens if you don't" sentence (UI2) |
| B6 | Hand-logged InDrive trips are invisible to tolls | Logged-trips adapter writes `fleet.trips` to `toll.platform_trips` (S2) |
| B7 | InDrive cash-trip tolls have no path | `payback_mode = rider_pays_driver`: suggestion "Driver pays", never automatic; buttons Confirm Driver pays / Fleet pays (S2, UI1) |
| B8 | "Paid back less than the toll" shown as "no trip" | Server states `disputed` / `short_paid`; screens never group on their own (S1, S3) |
| B9 | Uber's lower plaza rate looks like 12 problems a week | `plaza_rates` by date; matcher compares with the platform's rate (S2; rates seeded from a checked file) |
| B10 | Configuration has no owner | `platform_settings` seeded explicitly; one home for matching settings (seed L2.6 step 0) |
| B11 | Built paths never exercised live | `first_live_post` alert; synthetic runs in the second build |

---

## Data still to build (most of C1 is built: D1, D2, S1)

| Record | One row per | Fields and rules |
|---|---|---|
| **Pay period (T6)** | — | One Monday–Sunday Jamaica week (Part 0 timezone rule; the same week as ADR 0007). "The pay period after X" = the first full week that **starts after** X. "Both refund periods in" = the platform reports for the first and second full weeks starting after `clock_from` are **in** |
| `toll.platform_settings` (dispute fields) | One per platform per company | `takes_disputes` (Uber: yes), `dispute_window_days` (**Uber: 9**), `refund_periods` (**Uber: 2**, the pay periods after sending in which a refund can arrive), `no_report_fallback_days` (**23**, R3, owner Q9). Why 23 (U9): the second full weekly pay period after `clock_from` ends at most 21 days later (up to 7 days to the next Monday, then 14 days), and the Uber report is due within 2 days after a week ends (Part 0). So 23 is the earliest day on which a missing report is really late. It never closes a dispute while its second period is running or its report is still due. On a platform with `takes_disputes = no`, an adjustment follows only today's 7-day charge match, and a refund on an already-decided shortfall is left unlinked by design for a person (S16b). |
| Fleet Policy (extended) | One per company | `toll_dispute_lost_bearer` (default `fleet`), `toll_dispute_expired_bearer` (default `driver`); a dispute with `opened_late` is always borne by the fleet. |
| "Report in" (R3 definition) | — | A pay period's platform report is **in** when a committed `import_batch` for that platform has `coverage_start ≤ period start` and `coverage_end ≥ period end`. It applies only to platforms with `takes_disputes = yes`. `rider_pays_driver` platforms have no disputes and no refund periods, and are excluded from the auto-close job (AB8). |

---

## Server still to build (S1b, S2; the rest of C2 is built in S1)

| Command / job | Who | What it does |
|---|---|---|
| Auto-close (system, on each platform upload and nightly) | System | Applies only to `sent` disputes with `clock_from` set (U13). Once both refund periods after `clock_from` are **in** (C1 definitions): `recovered = 0` → `lost` (`no_refund_two_periods`); `0 < recovered < owed` → `part_won` (`partial_refund_two_periods`, T5), the rest to the lost bearer (R4). **Allocations:** the provisional platform allocation is reversed by the unrecovered amount and a lost-bearer allocation (`driver_pays` or `fleet_absorbs`) is written for it (C1 W1 rule 3); the same for the `no_report` fallback. **Fallback (R3):** if `clock_from` + `no_report_fallback_days` (23) passes while a report is still missing → `lost` (`no_report`), fleet bears, and the "Uber report late" alert is already open (B19). |
| Nightly `expire_disputes` | System | `to_send` past `deadline` → `expired` (`window_closed`); the provisional platform allocation is reversed and the expired-bearer allocation is written (driver, or fleet if `opened_late`) (C1 W1 rule 3). |
| `reverse_payback` on a linked payback (changed, R7, T3, U10) | System (import of a take-back) | Reverses that one `dispute_link` and writes a **new** dispute row (`reopens_id` = the closed one, `close_reason` of the old row stays; the new row's `owed_minor` = **the reversed link's `amount_minor`**; any other links stay on the original row, untouched). The new row reopens **in the state the dispute was in when that payback settled it**: <br>• it was `sent` → new row `sent`, `clock_from` = the reversal time, so it gets two fresh refund periods and the normal auto-close; <br>• it was `expired` → new row `expired` at once, and the bearer's charge (driver, or fleet if `opened_late`) is posted again for the reversed amount. Final immediately; nothing can stall. <br>**Allocations (C1 W1 rule 5):** the firm platform allocation written by that link is reversed, and the reopened state's allocation is written: the provisional platform allocation again (`sent`), or the bearer allocation again (`expired`), in one transaction, reversal first (C1 Y3). Money moves in the open week. The one named system exception to the final-state rule. |
| Matcher (changed) | System | Adjustments and trip paybacks for a disputed charge: the dispute first (B3, R6). Trip paybacks: compared with the platform's rate on the trip date (B9, S6). A toll on a trip of a `rider_pays_driver` platform (InDrive): a suggestion "Driver pays — rider owed it, driver collects in cash", shown in **Suggested matches**; a fleet manager confirms Driver pays or picks Fleet pays (B7). The `auto_apply` check is skipped for these matches (AA2, AC7). **Buttons → commands (AD5):** **Confirm Driver pays** → `driver_pays` with `suggestion_id` on the decision; **Fleet pays** → `fleet_absorbs` with `suggestion_id`; **Confirm all Driver pays** → one `driver_pays` per suggestion, in order, each its own decision. Never `apply_suggestion` (there is no payback to allocate). |
| Settings seed (S16) | Owner | At switch-on, the seed values for `platform_settings` and `plaza_rules` are shown to the owner, and approving them writes a decision row. Matching refuses to run for a company whose rows are missing (B12). |
| Logged-trips adapter | System, on trip save and nightly | Upserts hand-logged `fleet.trips` into `toll.platform_trips` (B6). |

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

### C4. Tests — rules that must always hold (each one a test)

1. Every dispute **row** ends in exactly one of `won`, `part_won`, `lost`, or stays `expired` (bearer-set); a logical dispute can be a chain of rows via `reopens_id`, and each row ends in exactly one of these states, independently of the row before it (AB3). Each row's amounts add up: recovered + borne = owed (N12, Z1).
2. No final dispute state leaves anyone bearing more than the policy says (U5, X5): in `won`, the current bearer bears 0. The **driver** bears an amount in exactly two final cases: `expired` with `opened_late = false` (the unrecovered amount), and `lost` / the rest of `part_won` on a `sent` dispute when the company's lost bearer is `driver`. In every other final state the driver bears 0. Any refund on an `expired` dispute reduces its bearer's allocation by exactly the recovered amount (T2).
3. The seal never waits on an open dispute; it never seals a `short_paid` charge, and the "Part-paid" group's buttons are the only way to clear one (R8).
4. The week adds up to the cent (Z3). **Open week:** spend = platform + driver + fleet + the week's open disputes (`to_send` / `sent`, i.e. its provisional dispute allocations). **Sealed week:** spend = platform + driver + fleet + `disputed_minor` **as at the seal**; later results land in later weeks, so the current `receivable_platform_dispute` may differ, and the combined view (A8) reconciles the two per charge. **A result of a dispute from an earlier week (AG3)** is not part of this week's spend: spend counts only this week's tolls, so the equation above is unchanged. It posts as a `dispute_result` carried line in this week's ledger (it clears `receivable_platform_dispute` against the refund, or moves the amount to the bearer), and the screen shows it apart from the equation: in Disputes → **Results this week**, and as one line under the seal box sum, "Earlier-week dispute results this week: J$20.00 refunded by Uber · J$20.00 charged to drivers".
5. `receivable_platform_dispute` = Σ (owed − recovered) over **disputes holding an active provisional allocation (`to_send` and `sent`)**, every night, matching C1 and C4.4. An `expired` dispute is not final (Z1), but its amount sits with its bearer, not in this account, so it is **not** summed (AA3). The `owed_by_platforms` report = `receivable_platform` + `receivable_platform_dispute`, and no report adds the group to its members (R2, T4).
6. A refund is matched to a dispute only in the two pay periods after `clock_from`. Auto-close applies only to `sent` disputes with `clock_from` set (U13). Once both periods are in: no refund → `lost` (`no_refund_two_periods`), part refund → `part_won` (`partial_refund_two_periods`) (R4, T5). A missing report closes it at 23 days as `no_report` (R3). Reopened `expired` disputes follow T3, not this rule.
7. A toll on a `rider_pays_driver` (InDrive) trip never opens a dispute and is never charged to anyone without a person's decision. `auto_apply` is off for this mode (C1 seed, AA2), and the matcher skips the auto-apply check for these matches; the suggestion is always "Driver pays" (AE14).
8. A sealed week's money never changes. Settling, losing, expiring or undoing a dispute whose charge week is sealed **succeeds**: the sealed ledger stays byte-identical, and the posting lands in **the open week at the moment of posting**, which is stored as `posted_in_week_key` (R1, R10, T1). A dispute that stays open across several weeks posts its result in whatever week is open when it closes, and is **shown in the Disputes part of every open week until it resolves**, whatever its charge week (AD2).
9. A trip payback never allocates to a charge with an open dispute; it settles the dispute instead (R6).
10. Reversing a payback that settled a dispute reopens it as a new row, in the state it was settled from (`sent` with a fresh `clock_from`, or `expired` with the bearer charged again), with `owed` = the reversed link's amount, and reverses the money in the open week (R7, T3, U10). No reopened dispute can stall.
11. Every dispute transition leaves its charge `decided` (Σ active allocations = amount): after `open_dispute` (provisional), after `settle_dispute` to `won` on a not-yet-sealed charge (all firm), after `lost` / `part_won` / `expired`, and after a reopen. For a sealed charge, its frozen allocations + its `dispute_result` carried facts sum to the amount (W1).
12. `open_dispute` on a charge whose week is sealed is refused (`charge_sealed`) (W2).
13. `payback_unallocated` holds only undecided money **plus** `legacy_kept_minor` = 120000 cents = J$1,200.00 (kept before switch-on, S14, X9); the check subtracts that fixed carve-out. (This one can be fixed, because kept-with-no-toll money never moves again; the platform receivable can't, T4.)
14. After `open_dispute`, the charge is `decided` (the seal passes) **and** shown as `disputed` (Disputes group); once the dispute is `won` / `part_won` / `lost` / `expired`, it is `resolved` (Decided group). No charge is ever shown in two groups (Y1); the Disputes part's "Results this week" list shows dispute results, not charges, so it doesn't break this rule (AD2).
15. Every reverse-and-replace (refund, loss, expiry, transfer, reopen, undo) runs in one transaction with the reversal first; `allocations_caps` never fires, and Σ active allocations never exceeds the amount after any single row (Y3).
16. An InDrive (`rider_pays_driver`) match shows **Confirm Driver pays** and **Fleet pays**. Pressing Fleet pays writes a fleet allocation; pressing Confirm Driver pays writes a driver allocation; either way the charge is `resolved` and nobody else is charged (AA1).
17. Every `seal_week` refusal for open work returns each blocking item with its `part`; the Still open list is built only from that list, and a refused seal never shows a generic error (AD3).
18. The driver card states the consequence of not sending: the amount charged to the driver when `opened_late = false` and the expired bearer is the driver; "the fleet pays it" otherwise (AD4).
19. Confirm Driver pays / Fleet pays write a `driver_pays` / `fleet_absorbs` decision carrying the `suggestion_id`; no `apply_suggestion` decision is ever written for a `rider_pays_driver` suggestion (AD5).

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

## Platform envelope still to build

### L2.2 Gaps found, each with one chosen fix

| # | Gap | Fix (one) | Priority |
|---|---|---|---|
| **B12** | **Config has two owners** (`MATCHER_CONFIG_V1` in code and `toll.brain_policies`); `platform_settings` has 0 rows (silent defaults); `plaza_rules` has 0 rows | Seed `platform_settings` + `plaza_rules` at switch-on, refuse to match when a company's row is missing (loud, not silent). The v2 matcher reads only these. `brain_policies` stays owned by `toll-brain` (v181) **for Roam ride geofence detection and quotes only**, and an ADR records that boundary. Every settings change is a decision row (actor, before, after, reason); the switch-on seed values are approved by the owner as a decision row (S16) | P0 |
| **B14** | **No four-eyes check on risky money commands** | `undo_decision`, `correct_charge_amount`, `correct_charge_week`, `close_dispute_lost`, a person's `settle_dispute`, and policy changes need a second person **above J$5,000**; `reopen_week` **always** needs one. Uses the existing Week Recon approval pattern (prepare + approve). **Sole-manager exception (S15):** when the company has exactly one active owner / fleet_manager seat (checked at the moment of the command), they may self-approve with a written reason of at least 8 characters, stored on the decision. Both actors (or the self-approval and its reason) are stored on the decision | P0 |
| **B15** | **Role matrix not written down** ("a person" in this doc) | Matrix (below, L2.3) mapped to the existing permissions; the driver can only act on their own disputes and cash tolls | P0 |
| **B16** | **Raw files not kept; no staging; RPO/RTO not set; no rebuild test** | Store every uploaded file in a private, versioned bucket (`toll-evidence`, never cleaned) keyed by `file_sha256`, kept 7 years. A standing **staging** project with masked, real-shaped data, where every release runs the done-tests and the never-used paths (B11). Its data is refreshed automatically each week by a scheduled job (masked copy of the last 4 weeks), so it can't go stale without an owner; the job's failure raises an alert in the shared table (B19). Who watches that alert is owner question **Q11** (U15). A **ledger reconstruction test**: rebuild every `toll:*` balance from decisions + records **since the 14 Nov 2026 switch** and prove it equals the ledger (extends the nightly check). Restore drill each quarter | P0 (files, rebuild test) / P1 (staging, drill) |
| **B17** | **Kept-with-no-toll money has no end** | `payback_unallocated` holds J$1,200 decided "keep with no toll" (J$70 + J$780 on 15 Nov, J$350 on 17 Nov). Fix: from switch-on, a left-unlinked payback posts on to `toll:other_income` (the fleet's toll income) at the decision, so `payback_unallocated` only holds undecided money from then on; a daily "unallocated paybacks" list with age. The J$1,200 already kept stays as it is (forward only) and is recorded once as a fixed carve-out, `legacy_kept_minor = 120000` (J$1,200.00), which the C4.13 check subtracts, so the invariant holds from day one (S14) | P0 |
| **B18** | **Adapters don't detect a changed file layout** | Each adapter validates required columns and their types before writing anything. An unknown or missing column fails the **whole batch** with a named error and nothing is written. Data-level problems in single rows keep today's behaviour: the row is rejected and counted, and the good rows commit (S8). The failed file is kept (B16) and can be re-run after a fix; a contract test per adapter uses a real, masked sample file | P1 |
| **B19** | **No dashboards, SLOs or runbooks for tolls** | Dashboards: dispute funnel, unallocated paybacks, receivable vs open disputes, import row counts, matcher lag, nightly results. SLOs: matcher done ≤ 2 min after an import; nightly check 0 differences; 0 sealed-week changes; Uber report in ≤ 2 days after week end (alert on day 3). Runbooks: import failed, matcher stalled, nightly check failed, seal blocked, dispute job missed, Uber report late. **One alert table** for all of these plus B11's `first_live_post` (kind, company, first seen, last seen, owner, runbook link). The Uber-report-late alert is **P0**, because the 9-day window makes it a hard operational deadline | P1 (report-late alert P0) |
| **B20** | **No property tests for money rules** | Property tests (random charges / paybacks / allocations / disputes): sums conserved, no negative owed, exactly one final dispute state, week adds up; plus chaos cases: kill the matcher mid-run, a corrupt CSV row, replay a batch | P1 |
| **B22** | **No load test** (Part 0 asks for one at 10×) | One staging run at ~150 tolls / 800 trips a week: import, match, seal and nightly checks each finish within their SLOs (B19). Run once before switch-on and again if weekly volume passes 5× today. Owner of the run: the planner (Claude), per Q3 (N7) | P1 |
| **B7** (priority, AC4) | **InDrive `rider_pays_driver`** (full fix in Part B, B7) | Listed here only to give it a priority: unblocked by Q5; needs B6 (logged-trips adapter) and B10 (settings seed) first (AE9) | P0 |

**Explicitly not doing** (reviewer agrees): no sharding, no Kafka or event bus, no generic rules engine, no partitioning at this size.

**Blocked on the owner (S13):** B7 is **unblocked** (Q5 answered 17 Nov); Q6 is answered (no approval; copy and paste); the R3 fallback length (23 days) waits for **Q9**; the late-dispute behaviour (S4) waits for **Q10**; the staging alert owner waits for **Q11**. Everything else can be built in the P0 → P1 order.

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

### L2.4 State tables (for the C4 tests to run as a matrix)

**Dispute** (state × event → state):

| From | `mark_dispute_sent` | refund fits (`settle_dispute`) | person closes (`close_dispute_lost`) | both refund periods after `clock_from` in | report missing 23 days after `clock_from` | deadline passes |
|---|---|---|---|---|---|---|
| (opened after the deadline) | — | — | — | — | — | opens as `expired` (`opened_late`, fleet bears) |
| `to_send` | `sent`, sets `clock_from` (refused after the deadline: `window_closed`) | — (Y2) | — | — | — | `expired` (`window_closed`) |
| `sent` | — | full → `won` (`refund`); part → stays, `recovered` up | `recovered = 0` → `lost`; `> 0` → `part_won` (both `platform_said_no`) | `recovered = 0` → `lost` (`no_refund_two_periods`); `0 < recovered < owed` → `part_won` (`partial_refund_two_periods`) | `lost` (`no_report`, fleet) | — |
| `expired` | — | adjustments only (U14): full → `won` (`refund`); part → `part_won` (`refund`); **transfers the recovered amount from the bearer's allocation to the platform** (driver if not `opened_late`, fleet if `opened_late`); the rest stays with that bearer (R5, T2, X3) | — | — | — | — |
| `won`, `part_won`, `lost` | final | final | final | final | final | final |

A `to_send` dispute can't be settled: B3's matching needs `sent_at` (the refund clock), and C3 hides the manual link. Only `sent` disputes, and `expired` ones by an adjustment, can be settled (Y2).

**`expired` is bearer-set, not final (Z1):** its bearer is charged, but a refund (adjustment) can still settle it to `won` / `part_won`. The final states are only `won`, `part_won` and `lost`.

**The only two exits from a final state**, each writing a **new** dispute row with `reopens_id` (C1), each posting its money in the open week:
- `reverse_payback` on a linked payback (R7, T3): reopens in the state it was settled from. `sent` → new `sent` row with `clock_from` = the reversal time (normal auto-close applies). `expired` → new `expired` row; the firm platform allocation is reversed and the bearer's allocation is written again for the reversed amount, **posted in the open week** (X8): final at once. The new row owes only the reversed link's amount (U10).
- `undo_decision` (R10): the state before the undone result, with that state's `clock_from`.

**Charge** (derived, Y1 vocabulary in A6): `pending` → (a payback covers part) → `disputed` (dispute opened; already `decided` for the seal) → `resolved` (the dispute is `won` / `part_won` / `lost` / `expired`, so no provisional allocation remains). On a `takes_disputes = no` platform: `pending` → `short_paid` → `resolved` (Driver / Fleet pays in the Part-paid group). Plus the existing `duplicate`, `rejected`, `unverified`, `awaiting_cash`. A `takes_disputes = no` platform that later switches to yes doesn't move existing `short_paid` charges; they stay in Part-paid (N11). `short_paid` is defined for completeness but has no live occupant today: InDrive uses `rider_pays_driver` (B7), and Uber takes disputes; Roam is native (no dispute) (AC2, AE11).

### L2.5 Key flows (sequence)

```mermaid
sequenceDiagram
  participant U as Uber report upload
  participant M as Matcher
  participant D as toll.disputes
  participant S as Seal
  participant L as Ledger
  U->>M: trip payback J$370 on a J$390 toll
  M->>D: open_dispute J$20 (to_send, deadline = trip + 9 days)
  D->>L: provisional platform allocation J$20 → toll:receivable_platform_dispute
  Note over D: driver app card, Mark as sent
  S->>L: seal week accepts it (disputed_minor = J$20 on the statement)
  U->>M: next week: adjustment J$20
  M->>D: settle_dispute → won
  D->>L: dispute_result in the week open now: provisional → firm platform allocation; refund clears the receivable
```

```mermaid
sequenceDiagram
  participant N as Nightly / next upload
  participant D as toll.disputes
  participant L as Ledger
  N->>D: to_send past deadline → expired (driver, or fleet if opened_late)
  N->>D: sent, both refund periods after clock_from in: no refund → lost (fleet); part → part_won
  N->>D: sent, a report still missing 23 days after clock_from → lost (no_report, fleet)
  D->>L: carry_forward the bearer's share in the week open now (posted_in_week_key)
```

### L2.6 Rollout

0. **Settings first (U1)**, before the "refuse to match without settings" check (B12) ships: (a) run the seed for the live company in dry-run, showing every `platform_settings` and `plaza_rules` value; (b) the owner approves it, which writes a decision row; (c) commit the seed; (d) only then deploy and switch on the refusal. The live matcher never sees a missing row.
1. Build behind a per-company switch (`toll_disputes`, `rider_pays_driver`, `logged_trips`), all off.
2. Prove on staging with the done-tests + property tests + the 9 Nov replay.
3. Switch on for the owner's company; one real week with screenshots; the nightly check and receivable check must stay at 0 differences for 14 nights.
4. Roll back by switching off: no new disputes open; open ones keep their state and can be closed by hand.

**First build vs second build (AH4):** the **first build** is the P0 items in L2.2 only (disputes and their screens, `rider_pays_driver`, the logged-trips adapter, the settings seed, the report-late alert and its runbook). P1 items (the staging project, the load test, property tests, B18's whole-batch refusal) are the **second build**. SMS (S10) is not in either. Owner answers that arrive later (Q9, Q10, Q11) replace their working defaults in whichever build is under way.

---

## Part G — Questions only the owner can answer (reviewer round 1)

| # | Question | Answer |
|---|---|---|
| Q1 | Scale in 1 and 3 years: companies, drivers, cars, weekly tolls and trips | _owner_ |
| Q2 | Any audit, tax, insurer or data-residency rule on toll records (how long to keep them, where they must live)? | _owner_ |
| Q3 | Team: who runs this day to day and who is on call when something breaks? | Today: the owner runs the weekly close; Claude (planner) and Cursor (builder) build; no separate ops engineer. _owner to confirm_ |
| Q4 | Is company isolation a hard security boundary? | **Answered from the code:** yes. RLS is on every toll table, and server writes go through functions that take the company from the user's token (L2.1) |
| Q5 | InDrive: does the rider pay the toll to the driver inside the cash fare? (B7) | **Answered 17 Nov** (see the log): the rider owes it; the driver collects it in cash; the fleet decides whether to charge the driver. The design default (suggest **Driver pays**; a manager can choose **Fleet pays**) matches this policy (AB7) |
| Q6 | Who writes and approves the dispute text the driver sends to Uber? | **Answered 17 Nov:** no approval. The app gives the driver the text; the driver opens a dispute in Uber and pastes it (B5) |
| Q7 | Does finance still need the 219 old claims, and for how long? | **Answered:** leave legacy data alone; they stay in `fleet.claims` untouched |
| Q8 | Which Supabase plan / backup level is the production project on (sets RPO / RTO)? | _owner_ |
| Q9 | If the Uber reports for the two pay periods after sending never arrive, how many days before the dispute counts as lost? (R3; the design uses 23 until answered, reasoning in C1) | _owner_ |
| Q10 | When Uber's data arrives with under 2 days left to dispute, should the driver still get the dispute to send? (S4; the design says yes, and the fleet bears it if it expires) | _owner_ |
| Q11 | Who watches the staging refresh alert and keeps staging working? (U15) | _owner_ |
| Q12 | When a platform pays **nothing** back on a trip, which trips count as "covered" (so the system should open a dispute by itself)? For example: every card trip on Uber that crossed a plaza? (W2; until answered, a person opens these disputes) | _owner_ |

**Sign-off rule for open questions (X15):** before build starts, every question is either answered (logged below) or marked **deferred** with what it blocks and until when. Today: Q5 and Q6 are answered; Q9 / Q10 / Q11 have working defaults in the design (23 days; send late disputes; Claude watches staging) and can be confirmed later; Q1, Q2, Q8 shape Part 0 targets only; Q12 is a follow-up and doesn't block the first build.

**Answers log (U12).** Every owner answer is recorded here with its date, and the rows it changes are revised in the same revision.

| Date | Q | Answer (owner's words) | Changed |
|---|---|---|---|
| 2026-11-17 | — | Uber gives the driver 9 days to dispute a toll | Rev 3: `dispute_window_days` = 9 |
| 2026-11-17 | — | A dispute refund always arrives in the next pay period or the one after, never later | Rev 4: `refund_periods` = 2, auto-close |
| 2026-11-17 | Q7 | Leave reconciled weeks and legacy data alone | Rev 6: forward-only rule; B21 dropped |
| 2026-11-17 | Q5 | InDrive can take digital payments but never does: 100% cash trips. The toll is paid with the tag or with cash. It's still the rider that should pay it; the driver should collect the toll from the passenger on a cash trip, and the fleet decides whether to charge it to the driver or not | Rev 11: B7 rewritten (`cash_in_fare` auto-wash → `rider_pays_driver` with a "Driver pays" suggestion the fleet confirms or changes); C1 setting, C2 matcher, C4.7, done-tests 8 + 8b, rollout switch |
| 2026-11-17 | Q6 | It does not need approval. In the old system the driver app showed something the driver could copy and paste to Uber; the driver opens a dispute on Uber and pastes whatever the app gave him | Rev 14: B5 card = Copy / Open Uber App / Mark as sent; template has no approval fields; Q6 no longer blocks |

---
