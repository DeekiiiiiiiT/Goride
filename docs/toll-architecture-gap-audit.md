# Toll architecture: disputes and InDrive (plan + build status)

**Rev 27 · 18 Nov 2026 · Status: BUILDING (first build). The server side is complete (D1–S2b); next are the screen reads (S3), the screens (UI1, UI2) and the proof (P).** Rev 27 trims everything already built: the design of the built rounds, every review's fix list and the answered owner questions. All of it stays in git (`git log -- docs/toll-architecture-gap-audit.md`; Rev 26 is the last full version, Rev 19 the last full design).

## START HERE (for a new chat)

**What this is:** every toll the fleet pays ends with the right person bearing it. **First principle (owner):** on a trip the **passenger** always owes the toll, never the fleet. Uber pays it back (any shortfall is **disputed** by the driver within 9 days; the refund comes in the next pay period or the one after); InDrive trips are cash, so the **driver collects it from the rider** and the fleet decides Driver pays / Fleet pays; Roam charges the rider natively. The fleet or driver bears a toll only when recovery fails or there was no trip, always by an explicit decision or policy, never a default. **Forward only:** nothing here changes a reconciled week or legacy data (the 219 old `fleet.claims`, the J$1,200 already kept).

**Prompt to start a new chat:** "Continue the toll disputes build. Read `docs/toll-architecture-gap-audit.md` START HERE first. The server side (D1–S2b) is done and committed. Next step: write the Cursor prompt for round S3 (screen reads) in `docs/toll-build/`, following the playbook and the 'Rules for Cursor prompts' in START HERE, and keep me updated in short plain replies."

**How we work (owner's playbook, `docs/how-we-build-playbook.md`):**
- Build layers in order: Data → Server → Screens → Tests, one round at a time.
- **Cursor** builds the data and server rounds (S3 is the last one) from a prompt file in `docs/toll-build/`. **Claude** reviews every round by reading the code and running the tests itself, fixes what's wrong, commits only the relevant files, and the owner pushes. No branches.
- **Claude ports the screens** (UI1, UI2), not Cursor.
- Never touch the live database. **Nothing of this build is live yet** (all commits are local until the owner pushes; every switch is off on the live company).
- Migration files are created with `npx supabase migration new <name>` (real UTC time).
- **How to run the tests on the local copy:**
  1. Start Docker Desktop.
  2. `npx supabase start`, then `npx supabase db reset`.
  3. In Git Bash, `export MSYS_NO_PATHCONV=1`, then for each file: `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`. The toll files (25): every `toll_v2_*` (18), `toll_disputes_*` (2), `toll_sealed_week_guard_test`, `toll_dispute_commands_test`, `toll_four_eyes_settings_income_test`, `toll_matcher_disputes_test`, `toll_sweep_logged_trips_test`. All must pass.
  4. Engine tests: `npx vitest run packages/toll-core/src/v2/matcher` from **PowerShell** at `C:\Roam\Goride` (74 tests). Runner: `deno test --allow-all --no-check supabase/functions/_fleet-server/toll_v2_matcher_run.test.ts` (7 tests). Then `node scripts/validate-migration-sql.mjs` and `pnpm check`.
  5. `npx supabase stop` after. (Deno runs can upset the local Fleet app: if it errors, the owner stops it and runs `pnpm install`.)

**Where the build is (18 Nov 2026):**

| Round | Who | What | Status |
|---|---|---|---|
| D1, D2 | Cursor | Data: switches, settings, `plaza_rates`, `dispute_policy`, templates, `disputes`, `dispute_links`; the database refuses money changes in a sealed week | **Done** (97bec27e, beec4537) |
| S1 | Cursor | Dispute commands and money (open, sent, settle, lost, expire, undo), seal blockers with `part`, `disputedMinor`, P21–P24 | **Done** (3a3dfbb6, a7be5937) |
| S1b | Cursor | Four-eyes approvals, toll settings commands + seed approval, refuse to match without settings, kept money → `toll:other_income` (P25), J$1,200 carve-out. ADR 0024 | **Done** (d66300cd; 5 review fixes) |
| S2a | Cursor | Matcher v2: dispute first, Uber plaza rates, opens / settles disputes by itself on clear matches, take-back reopens | **Done** (66b62bc9; 9 review fixes) |
| S2b | Cursor | Nightly / after-upload dispute sweep, "Uber report late" alert + runbook, hand-logged trips → tolls, InDrive "Driver pays" suggestions | **Done** (367b0256; 4 review fixes) |
| **S3** | Cursor | **NEXT: Claude writes the prompt.** Screen reads: the Week Recon step-3 payload in six parts (C3), disputes company-wide with a "From week of" chip, Results this week, blockers with `part`, the "Late" tile rule, Refund received candidates; driver-app dispute read + a `mark_dispute_sent` route for the driver (own disputes only, L2.3); Driver Settlements Disputes read; Fleet Policy toll settings read. Undone rows (`close_reason = 'undo'`) never show as active | — |
| UI1 | Claude | Port the six-part Tolls step from `docs/stitch/toll-step-slides/` (C3 Keep / Drop / Fix) + its tests | — |
| UI2 | Claude | Driver app dispute card, Driver Settlements Disputes tab, Fleet Policy toll settings + tests | — |
| P | Claude + owner | Proof on the local copy (Part D done-tests, 9 Nov replay); then live with every switch off; settings seed and switch-on (L2.6); one real week with screenshots | — |

The owner still has to **push** the local commits (through 367b0256 plus this trim).

### What the built server does (S3 and the screens must follow this)

**Switches (per company, `toll.switch_state`, all off on live):** `toll_disputes` (disputes, four-eyes, refuse-to-match, P25 income, the sweep and the report-late alert), `logged_trips` (hand-logged trips → tolls), `rider_pays_driver` (InDrive suggestions). With a switch off, everything it controls behaves exactly as before.

**Dispute money (one way only):** **charge week open** → by reversing and inserting allocations (P21 provisional / P6 / P7 / P8). **Charge week sealed** → by one net posting (P22 refund, P23 to the bearer, P24 refund on expired) in `posting_week`, tied to a `dispute_result` carried fact; the sealed week's ledger never changes. A dispute always opens **with** its money. Undo reverses exactly the undone command's ledger rows; a reversal never lands in a sealed week.

**Dispute rows:** states `to_send`, `sent`, `won`, `part_won`, `lost`, `expired` (L2.4). An undone row keeps its state and gets `close_reason = 'undo'` (a withdrawn `to_send` shows state `lost` + `undo`): **readers must skip `close_reason = 'undo'`**. A reopen writes a new row with `reopens_id`. The deadline is the end of the 9th Jamaica day after the trip (9 Nov + 9 → 18 Nov 23:59:59). `opened_late` is set when the dispute opens with under 2 days left (then the fleet bears it if it expires); past the deadline it opens `expired` and the fleet bears it at once.

**Who opens and closes disputes:**
- The **matcher** (with `toll_disputes` on) opens a dispute by itself when a trip payback is a **clear** match (sole candidate both ways, on-trip with a drop-off, score ≥ 90, verified) and pays less than the toll. Uber's plaza rate (`plaza_rates`, entered with `change_toll_settings`) makes J$370 on a J$390 toll score 100; **without a rate nothing opens by itself**. It settles a dispute by itself when a refund is the **only** candidate both ways, inside the refund window, on a `sent` (or, adjustments only, `expired`) dispute. Anything less clear stays a suggestion (`toll.suggestions`, `kind`: `payback`, `dispute_refund`, `rider_pays_driver`).
- A **person's** link of a trip payback that leaves a remainder opens the dispute at once (`auto-dispute:<decision>`). Undoing that link while the dispute is `to_send` withdraws it; once sent, the undo is refused `DISPUTE_IN_PROGRESS`. After a person undoes a matcher link, the matcher never re-links it by itself.
- The **sweep** (`toll_system.dispute_sweep`, nightly before the checks and after every matcher drain) expires `to_send` past the deadline; auto-closes `sent` once all refund periods' reports are in (`lost` / `part_won`); closes `no_report` (fleet) after 23 days with a report missing; **holds** (lists, doesn't close) a dispute while an unmatched refund of that driver sits in its window. Its results (`dispute_expire`, `dispute_auto_close`) undo like a person's result.
- "Report in" = every day of the week covered by a committed `fleet.import_batches` row of the platform's `coverage_source_id` (Uber `uber_bundle`). The **report-late alert** (`toll.alerts`, kind `report_late`, severity `page`) opens on day 3 after a week ends without coverage, only for weeks from the switch-on date (`switch_state.toll_disputes_on_at`); runbook `docs/runbooks/toll-uber-report-late.md`.
- A take-back (`reverse_payback`) of a refund that settled a dispute reopens it in the state it was settled from (`sent` with a fresh `clock_from`, or `expired` with the bearer charged again), open or sealed charge week.

**InDrive:** app-logged `fleet.trips` rows (InDrive and other platforms; never Uber or Roam) are mirrored into `toll.platform_trips` (`source = 'logged'`, `platform_trip_id = 'logged:<id>'`; cancelled / deleted → `withdrawn_at`). A toll inside such a trip on a `rider_pays_driver` platform gets a `rider_pays_driver` suggestion (no payback, never automatic). **Confirm Driver pays** → `driver_pays` with `suggestion_id`; **Fleet pays** → `fleet_absorbs` with `suggestion_id`; `apply_suggestion` refuses it. No dispute ever opens on InDrive.

**Four-eyes (B14):** `undo_decision`, `correct_charge_amount`, `correct_charge_week`, `close_dispute_lost` and a person's `settle_dispute` above J$5,000, and `reopen_week`, `change_toll_settings`, `approve_settings_seed` always, need a second person (`request_approval` → `approve_request`; `reject_request` / `withdraw_request`). Refused `NEEDS_APPROVAL` with `{amount_minor, threshold_minor, sole_manager}`. A **sole manager** (one active owner / fleet_manager seat) self-approves with `self_approval_reason` ≥ 8 characters (`toll.self_approvals` lists them). The live owner is a sole manager, so every screen with a gated button needs the reason box.

**Settings (one owner, ADR 0024):** `toll.platform_settings` (incl. `takes_disputes`, `dispute_window_days` 9, `refund_periods` 2, `no_report_fallback_days` 23, `coverage_source_id`), `toll.dispute_policy` (`lost_bearer` fleet, `expired_bearer` driver), `toll.plaza_rules`, `toll.plaza_rates`. Changed only by `change_toll_settings` (missing key = leave it; returns before / after); first seeded by `approve_settings_seed`. With `toll_disputes` on, `match_claim` refuses `SETTINGS_MISSING` (listing what's missing) instead of guessing.

**Kept money:** from switch-on, "Keep with no toll" (`leave_payback_unlinked`) posts P25 to `toll:other_income`. The J$1,200 kept before is recorded once by `toll_system.record_legacy_kept` (must come to 120000 on live); after that a pre-switch keep can't be undone (`LEGACY_KEEP_FINAL`).

### Rules for Cursor prompts (learned the hard way, D1–S2b)
Cursor's "done" is never trusted until Claude has run every test. In every round so far it has reported done while: tests failed or were missing; it changed a design rule quietly (S1b blocked the sole manager from reopening a week); it bent money logic to keep old tests green and left a required path unbuilt (S2a "deferred" dispute money, no sealed-week take-back); it dropped money checks from its own test and claimed a skipped case was covered elsewhere (S2b). So every prompt says:
- Never bend logic to keep an old test green: if a designed change breaks one, stop and report.
- Build and test **every** path in the prompt, sealed charge weeks included.
- The S1 `dispute_apply_*` helpers post **at** the `p_line` given: pass "last used + 1"; two writers in one command never reuse a line.
- In one test transaction every row has the same `now()`: find rows by their own keys, never "latest `created_at`".
- Check balances as changes with `toll_system.natural_balance`, never absolute numbers or raw `balance_minor` signs. Run `nightly_checks` after every money step.
- Seal only weeks that have ended; give trips dates that keep a dispute inside its window on **any** day (CI runs every day, Mondays included).
- Run the new test from start to end after every change.
- A trigger on a shared table (like `fleet.trips`) must never block the app's own write.
- Change only the listed files; never an existing migration or test. End with: "In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents."

**First build vs second build:** the first build is everything above plus S3, UI1, UI2 and P. The **second build** (after switch-on) is: staging with masked real-shaped data and a weekly refresh; raw upload files kept 7 years (`toll-evidence` bucket); a ledger reconstruction test since the 14 Nov 2026 switch; whole-batch refusal on a changed file layout (B18); dashboards, SLOs and the other runbooks (B19); property and chaos tests (B20); a 10× load test (B22); the `first_live_post` alert (B11). SMS is in neither. Not doing: sharding, an event bus, a rules engine, partitioning.

**Basics:** weeks are Monday–Sunday, Jamaica time (UTC−5, no daylight saving; ADR 0007); "the pay period after X" is the first full week that **starts after** X. Amounts are JMD minor units (`bigint`), no FX; proportional splits round half-even with the last slice taking the remainder.

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

## Roles and dispute states

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
