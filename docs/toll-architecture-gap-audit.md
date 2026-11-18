# Toll architecture — as-built audit and what it lacks

**Rev 19 · 2026-11-17 · For: the architecture reviewer · Status: OPEN, no build until the reviewer and the owner agree.**

**What it's for (one sentence):** every toll the fleet pays ends with the right person bearing it: the platform (paid back first time, or after a dispute), the driver or the fleet. Nothing is decided before the facts are in, and the week still closes on time.

**The first principle (owner, 17 Nov 2026): on a trip, the passenger is always responsible for the toll, never the fleet.** Every rule in this document is a way of getting the passenger's toll money back through the channel that trip used:
- **Uber:** Uber charges the rider and pays the toll back on the trip line; any shortfall is disputed (B1–B4).
- **InDrive:** the rider pays the driver in cash, and the driver collects it (B7).
- **Roam:** the rider is charged the actual tolls by the ride app (native).

The fleet or the driver bears a toll only when that recovery fails or doesn't apply: a dispute lost or never sent, a driver who couldn't collect, or a toll with no trip at all (personal driving or deadhead). Those are always explicit, recorded decisions or policy rules, never a default.

**Two senses of "bears" (AB2).** **Economic:** who is responsible for paying the toll; on a trip, always the passenger. **Accounting:** whose account the money finally leaves when recovery fails; the fleet or the driver, by decision or policy. The first principle is about economic responsibility. Every "the fleet bears" or "the driver bears" in this document is about accounting.

The design doc is `docs/toll-architecture.md` (Rev 9, "Agreed", built Phase 0–3, live since the 14 Nov 2026 switch). This audit does not repeat it. Following the build playbook (`docs/how-we-build-playbook.md`):
- **Part A** is Step 2, "look before you plan": what is actually built and live, checked in code and in the live database on 17 Nov 2026.
- **Part B** lists the problems found, numbered, each with **one chosen fix**.
- **Part C** is the blueprint for those fixes (Data → Server → Screens with every button → Tests).
- **Part D** holds the done-tests, written before any build.
- **Part 0** (scope, scale, targets), **Part L2** (the platform envelope: what exists, gaps B12–B20, roles, state tables, flows, rollout) and **Part G** (owner questions) were added in Rev 5 after reviewer round 1. Rev 7 closed reviewer round 2 (R1–R10, S1–S16); Rev 8 closed round 3 (T1–T6, U1–U15); Rev 9 closed round 4 (W1–W2, X1–X15, N1–N7); Rev 10 closed round 5 (Y1–Y3, Z1–Z4, N8–N12); Rev 13 closed round 6 (AA1–AA3, AB1–AB9, AC1–AC7); Rev 17 closed round 7 (AD1–AD5, AE1–AE14, AF1–AF4); Rev 18 closes round 8 (AG1–AG7, AH1–AH4), which the reviewer called **signable**; see the Rounds table.

The reviewer challenges any part. Claude replies and revises until no gap is left. The table at the end records each round.

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

## Part A — What the toll architecture is today (as built)

### A1. Purpose (from the design, unchanged)

Every toll the fleet paid gets one answer to "who bears this cost?" (platform, driver or fleet), and the week adds up: spend = platform + driver + fleet, nothing undecided. The tag account adds up separately (opening + top-ups − usage = closing).

### A2. Records (live row counts, 17 Nov)

| Table | Rows | What is in it live |
|---|---|---|
| `toll.charges` | 71 | **All** `tag_statement` / `tag`. **0** driver cash, **0** Roam, **0** manual |
| `toll.paybacks` | 70 | Uber only: `trip_line` (received by fleet or driver) and 1 `adjustment` (J$70, 11 Oct; the owner kept it "with no toll" on 15 Nov) |
| `toll.platform_trips` | 512 | **Uber only** (card and cash). No InDrive, no Roam |
| `toll.allocations` | 83 | Platform and driver slices |
| `toll.payback_unlinked_decisions` | 3 | "Keep with no toll" |
| `toll.decisions` | 114 | Intents used: `import_batch`, `apply_suggestion`, `driver_pays`, `leave_payback_unlinked`, `seal_week` |
| `toll.suggestions` | append-only | Matcher output; withdrawn rows supersede |
| `toll.carried_facts`, `duplicate_reviews`, `reported_take_backs`, `alerts` | 0 each | Never exercised live |
| `toll.platform_settings` | **0** | No platform row, so `pays_tolls_back` / `auto_apply` / `payback_mode` use code defaults |
| `toll.plaza_rules` | **0** | No duplicate windows or plaza rates |
| `toll.tag_topups` | 4 | |

### A3. Inputs (adapters) and how each reaches the toll system

| Source | Path | Live |
|---|---|---|
| Tag usage statement | Step 1 upload → `toll/v2/import` (`tag_statement`) | Yes |
| Tag top-ups | Step 1 upload → `tag_topups` | Yes |
| Uber weekly CSV | Step 1 upload → `platform_trips` + `paybacks` (`trip_line` per trip toll refund; support adjustments → `adjustment`) | Yes |
| Driver cash toll | Roam driver app → `POST toll/v2/driver-cash` → `charges` (`driver_cash`, unverified until a receipt check) | Path exists; **0 rows** live |
| Roam rides | Rides hooks `native_ride_charge` / `native_cash_settled` write charge + native payback + allocation | Built; **0 rows** live |
| InDrive | Adapter reads an **InDrive export file** only (`packages/toll-core/src/v2/adapters/indrive.ts`) | **Never used.** The owner logs InDrive trips by hand (`fleet.trips`, `isManual`, request and drop-off times, cash), and those never reach `toll.platform_trips` |

### A4. The matcher

- Code: `packages/toll-core/src/v2/matcher/engine.ts`, config `MATCHER_CONFIG_V1` (hard-coded): approach 45 min, post-trip 15 min, amount "close" = 5%, auto-apply at score ≥ 90 and only when the platform setting allows it (no setting row, so off).
- A trip payback pairs with a charge by **time window on the trip** (vehicle/driver). Amount only changes the score.
- An `adjustment` payback (no trip) pairs by **driver + date, at most 7 days back** (`adjustment_lookback_days: 7`).
- Excluded: charges already fully decided, sealed weeks, legacy rows, duplicates.
- Runs after every import and on a sweep (`toll-matcher-sweep` cron). A pair that is no longer a candidate gets a `withdrawn` suggestion.
- **A second, older config also exists:** `toll.brain_policies` (default row: approach 45, post-trip 15, variance 5%, `trip_time_mode trust_utc`…), used by the `toll-brain` edge function (v181, geofence and classify). The v2 matcher does not read it. Two sources of truth for the same knobs.

### A5. Commands (17 intents in `toll_v2_command`)

`import_batch`, `apply_suggestion`, `link_payback`, `driver_pays`, `fleet_absorbs`, `leave_payback_unlinked`, `undo_decision`, `confirm_duplicate`, `release_duplicate`, `verify_cash_receipt`, `reject_cash_receipt`, `correct_charge_amount`, `correct_charge_week`, `reverse_payback`, `carry_forward`, `seal_week`, `reopen_week`. Each carries `command_id` + record versions; every command is an append-only decision.

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

### A7. Seal

`seal_week` refuses until every charge is `decided` (Σ active allocations = amount, **provisional allocations count**: today for Roam `awaiting_cash`; with disputes, also the provisional dispute allocation, Y1), with no unverified cash, no open duplicate pair and nothing unallocated (G1 in the design). Late facts after a sealed and paid week go through `carry_forward` into the open week (P18–P20).

### A8. Money

Double-entry postings P1–P20 to `org:<co>:toll:*` accounts (`payback_unallocated`, `receivable_platform`, `receivable_driver`, `recovered_in_driver_cash`, `platform_payout_clearing`…). The sealed result is `ledger.week_statements` `kind = 'toll_week'`. Driver settlement reads the sealed toll statement (`resolveTollInputs`), which takes only the driver's own allocations.

**With disputes (R9):** `toll_week` gains `disputed_minor`, the open dispute amounts at seal (Σ provisional dispute allocations, W1). A dispute's result posts in the week open at the moment of posting (T1). `resolveTollInputs` ignores it, because a disputed amount is never the driver's until the dispute ends. Reports show a sealed week's `disputed_minor` as **provisional** and the dispute's result in the week it lands (the open week). A combined view per charge sums both, so a reader sees the toll's final answer without the sealed week ever changing.

### A9. Week Reconciliation use

- Step 1: tag usage, top-ups, cash tolls (driver-reported since WRA-72).
- Step 3 Tolls (as built on 17 Nov, before the redesign): groups *Suggested matches*, *Pick the right trip*, *Tolls with no trip*, *Cash receipts to check*, *Possible duplicates*, *Uber paybacks with no toll*, *Decided*; Seal tolls. The redesigned step is six parts, one at a time (C3, AE8). (The proposed **Disputes** group and the **Part-paid** group, which is only for platforms that don't take disputes, are in C3, U6, X13.)
- Step 4 Tag account: reads `toll_sys_tag_account_weeks`.
- Steps 7–8: settlement and close read the sealed toll statement.

---

## Part B — Problems found (what it lacks), each with one chosen fix

Each gap: what the business needs, what the **old system** did (retired 14 Nov), what v2 does, and the evidence.

### B1. Dispute life-cycle for under-paid tolls (missing)

- **Need:** when a platform pays back less than the toll, or nothing on a trip it should cover, the driver disputes it with the platform and the fleet tracks it to a result.
- **Old:** a `Toll_Refund` claim per shortfall, `Open → Sent_to_Driver → Submitted_to_Uber → Resolved | Rejected`, with the dispute message written for the driver. Resolution reasons: `Reimbursed`, `Charge Driver`, `Write Off`, `Business Expense` (`apps/fleet/src/types/data.ts` `Claim`). Live: 219 claims, all resolved, the last on 26 Oct.
- **v2:** no dispute record, state, message or list. The shortfall is just a remainder on the charge.
- **Evidence:** week of 9 Nov: 12 tolls part-paid (Uber J$370 on J$390, J$275 on J$280), J$240 total, with no dispute anywhere.
- **Fix (one):** a dispute record per amount a platform should have paid and didn't (`toll.disputes`, C1). It carries its own states and always ends in exactly one result. **Who opens it (W2):** the system opens it **automatically when a platform payback leaves a remainder** (the 9 Nov case). When a platform paid **nothing** on a trip it should cover, a person opens it with the same command. Detecting "no payback on a covered trip" automatically needs a rule for what "covered" means (owner question **Q12**), so it is a follow-up. A charge whose week is already sealed can't get a dispute (`charge_sealed`).

### B2. The seal forces an early decision on a shortfall (design conflict)

- **Need:** the week should close and drivers get paid while a dispute is still open.
- **v2:** `seal_week` requires every charge decided, so the person must press Driver pays or Fleet pays on the shortfall before the dispute could ever come back.
- **Effect:** the dispute's outcome can't be honoured without a manual undo/carry-forward.
- **Fix (one):** an open dispute counts as decided for the seal. When it opens, it writes a **provisional platform allocation** for the amount owed, posted to a new account `toll:receivable_platform_dispute` (owed by the platform, pending; a sibling of `receivable_platform`, reported together as `owed_by_platforms`, R2, T4). The seal already accepts provisional allocations (Roam `awaiting_cash`), so it accepts this one too (W1). The dispute’s result posts later in the open week, using the existing `carry_forward` rule (C1, C2).

### B3. Dispute refunds don't reliably find their toll (partial)

- **Old:** a dispute refund matched its claim and closed it; if the driver had been charged, the charge was reversed (`disputeRefundTripSyncEnabled`, 5 Jul 2026).
- **v2:** an Uber support adjustment becomes an `adjustment` payback, matched by driver + date **within 7 days only**. Disputes often take longer. Once the shortfall was decided, the charge is excluded (`fully_decided`), so the refund can't attach. It becomes unallocated money for a person, and a driver charge is never reversed automatically.
- **Evidence:** the one live adjustment (J$70, 11 Oct) found no toll and was kept "with no toll" by hand on 15 Nov. There was no dispute for it to settle.
- **Fix (one):** a payback for a disputed amount always goes to the dispute, never to the charge directly:
  - **An `adjustment`** first looks for an open or expired dispute: same driver and platform, amount ≤ owed − recovered (S7), in the platform report for one of the two pay periods after the dispute was sent (owner, 17 Nov 2026: a refund always comes in one of those two, never later). No 7-day limit. Only if none fits does today's 7-day charge match run.
  - **A `trip_line` payback** for a charge that has an open dispute is linked to the dispute (`settle_dispute`), and any suggestion to allocate it to the charge is withdrawn, so the same toll is never paid twice (R6). Trip lines only look at **open** disputes, while adjustments also look at `expired` ones, on purpose (U14): a trip line is the platform's same-trip refund and comes in the trip's own weekly report, before any dispute could expire; a late correction always arrives as a support adjustment.
  - **A refund on an `expired` dispute** (an adjustment; trip lines never look at `expired`, see above, X6) settles it and reverses **the bearer's charge by the recovered amount** in the open week through `carry_forward` (R5, T2): the driver's charge when `opened_late = false`, the fleet's when `opened_late = true`. A part refund → `part_won`, and the unrecovered rest stays with that same bearer. The same applies to a toll already charged to the driver by hand.

### B4. Lost or forgotten disputes have no rule (missing)

- **Need:** a dispute the platform rejects, or one the driver never sends, must end with a clear bearer.
- **v2:** no deadline, reminder, expiry or policy. The bearer is whatever a person picks on step 3, with no rule behind it.
- **Fix (one):** the dispute window is the **platform's** rule, so it lives on the platform setting: **Uber = 9 days**. The deadline is the end of the 9th Jamaica calendar day after the trip date (23:59:59 America/Jamaica) (S5). Fleet Policy holds, per company:
  - a **lost** dispute is borne by the **fleet** (as old `Business Expense`);
  - an **expired** dispute the driver had time to send is borne by the **driver** (as old `Charge Driver`).
  - When the platform data arrives **after the deadline**, the dispute opens directly as `expired` with `opened_late = true`, borne by the **fleet**. No driver card appears, and nothing races the nightly job (S4).
  - When it arrives with **under 2 days left**, it opens as `to_send` with `opened_late = true`. The driver can still send it, and a win reduces the fleet's loss. If it expires, the **fleet** bears it, never the driver.
  - The owner can change the two bearers. A nightly job expires overdue disputes and posts the bearer (C1, C2).
- **What 9 days means for the architecture:** a dispute can only be sent while the window is open, so it must open the moment the platform's data arrives, not when the week is reconciled. The Uber weekly report must be uploaded within days of the week ending. Weeks reconciled weeks later (as with October, done in mid-November) can't be disputed. The late-open rule above applies only while the charge's week is still **open**. A sealed week's shortfall is decided by a person (Part E), because `open_dispute` refuses a sealed charge (W2, Z4).

### B5. The driver is never asked to dispute (missing)

- **Old:** `Sent_to_Driver` with a generated message.
- **v2:** nothing in the Roam driver app or the fleet screens.
- **Fix (one):** the Roam driver app shows every `to_send` dispute as a card with the trip, toll, amount owed and the dispute text ready to copy, plus a **Mark as sent** button. The driver's Mark as sent (time-stamped) is the evidence; no screenshot is required. The dispute stores the `text_version` the driver was shown. A new dispute raises an in-app notification and a badge on the app's home screen; SMS is not needed for the first build (S10). **The text needs no approval (Q6, answered 17 Nov):** the system fills a fixed per-platform template with the trip and toll facts, and the driver copies it, opens a dispute in the Uber app and pastes it. This is how the old system worked (`apps/fleet/src/components/driver-portal/DriverClaims.tsx`: a **Copy** button on `claim.message`, an **Open Uber App** button and a mark-submitted button), so the card keeps those three buttons: **Copy text**, **Open Uber App**, **Mark as sent** (C3). **The card states what happens if the driver does nothing (AD4):** when `opened_late = false` and the company's expired-dispute bearer is the driver, "If you don't send this by <deadline>, J$20.00 will be charged to you on your settlement"; when `opened_late = true` (or the expired bearer is the fleet), "If this isn't sent in time, the fleet pays it, not you. If you send it and Uber refunds, the fleet gets the money back." (AG6) The amount and date come from the dispute row.

### B6. Hand-logged InDrive trips are invisible to tolls (missing for how the business works)

- **v2:** only an InDrive **file** reaches `platform_trips`. The owner logs InDrive by hand, so a toll during an InDrive trip is shown as "Tolls with no trip".
- **Open business fact:** how InDrive tolls are paid. The trips are cash. Does the rider pay the toll to the driver in the fare (old system: **cash wash**), or does nobody pay it back?
- **Evidence:** `platform_trips` has `uber` only; 9 Nov has 8 hand-logged InDrive trips on Sun 15 (none had a tag toll that day, so no wrong row yet).
- **Fix (one):** every hand-logged trip (any platform, `fleet.trips` with request and drop-off times) is written to `toll.platform_trips` when it is saved and again on the nightly run (a new adapter, "logged trips").

### B7. Cash-trip tolls (cash wash) aren't modelled for non-Uber platforms

- **Old:** `tollRefundResolution = cash_wash`: the rider paid the toll to the driver in cash, so nobody is charged.
- **v2:** Uber cash trips are covered (a `trip_line` payback with `received_by = driver`, posted to `recovered_in_driver_cash`). Other platforms' cash trips have no path (follows from B6).
- **Owner facts (Q5, 17 Nov 2026):** InDrive trips are cash in practice (digital payment exists but is never used). The toll itself is paid by the **tag** or in **cash** at the booth. The **rider** owes the toll, and on a cash trip the **driver** must collect it from the rider. The fleet then decides whether to charge it to the driver.
- **Fix (one):** a new platform payback mode, **`rider_pays_driver`** (InDrive's setting; `takes_disputes = no`). A toll during a trip on such a platform (found through B6's logged trips) is matched to the trip like any other, and the system **suggests "Driver pays — the rider owed this toll and the driver collects it in cash"**. Nothing is automatic. A fleet manager confirms **Driver pays** (the default) or chooses **Fleet pays** (for example, the driver couldn't collect). This applies whether the booth was paid by tag or by the driver's cash: either way, **assuming the driver collected from the rider** (the default assumes it; the fleet picks Fleet pays when he didn't), the rider's toll money is in the driver's hand (AB4). No dispute opens, and nobody is charged without a person's decision: **`auto_apply` is always off for this mode** (AA2).
- **Screen (AA1):** the match shows in **Suggested matches** with its own buttons: **Confirm Driver pays**, **Fleet pays**, **Confirm all Driver pays** (C3).
- **Depends on B6 (AC6):** with the logged-trips adapter off, InDrive tolls have no trip and appear in **Tolls with no trip**.
- **Assumes a cash trip (AB5):** `rider_pays_driver` is right only because InDrive trips are cash (Q5). If InDrive starts taking digital payments, those trips need their own rule (likely `trip_line`, if InDrive pays tolls back). That's a follow-up, not a build blocker.
- Priority: see L2.2 (AC4).

### B8. "Paid back less than the toll" has no state and is shown as "no trip"

- **v2:** a part-allocated charge with no live suggestion falls into *Tolls with no trip* ("No Uber trip at this time"), showing the full toll, not the remainder (WRA-73 in `docs/week-reconciliation-architecture-audit.md`). The screen decides the grouping; the server has no such state (A6).
- **Fix (one):** two new charge states, derived on the server: `short_paid` (a platform paid part, the rest not yet in a dispute) and `disputed` (an open dispute covers the rest). Every screen and report reads the state; no screen does its own grouping (WRA-73 builds the display).

### B9. A systematic platform rate difference isn't understood

- **Fact:** Uber refunds its own toll rate. Since the toll price rose, every Portmore crossing is J$20 short and every Spanish Town crossing J$5 short.
- **v2:** the 5% "amount close" rule just misses (J$20 on J$390), so these never auto-apply. `plaza_rules` is empty: there is no record of each plaza's tag price versus each platform's refund rate, so a known, repeating difference looks like 12 separate problems every week.
- **Fix (one):** `toll.plaza_rules` gains each plaza’s tag price by date and each platform’s refund rate by date. The matcher compares a payback with the **platform's rate in force on the trip date** (S6), so Uber J$370 at Portmore is an exact match. The known gap (J$20) still opens a dispute, and the screen explains it: "Uber pays J$370, tag J$390".

### B10. Configuration has no owner

- `toll.platform_settings` has **no rows**: `pays_tolls_back`, `payback_mode` and `auto_apply` are code defaults nobody set.
- The matcher's knobs live in code (`MATCHER_CONFIG_V1`) **and** in `toll.brain_policies` (A4).
- **Fix (one):** one home for every matching and payback setting: `toll.platform_settings` (one row per platform per company, created at switch-on, defaults written, not implied) + `toll.plaza_rules`. The v2 matcher reads only these, and `toll.brain_policies` is not used by v2. Only a fleet owner or manager may change them, and every change is a decision row.

### B11. Built paths never exercised live

Driver cash charges, Roam native charges, `carry_forward`, duplicate review, take-backs (`reverse_payback`) and `fleet_absorbs` have **0 live rows**. Their tests pass locally, but none has met real data.

- **Fix (one):** every release runs each never-exercised path (driver cash, Roam native, `carry_forward`, duplicates, take-backs, `fleet_absorbs`) as synthetic traffic on the standing **staging** project (B16) (S12). In production, the first live posting of each path raises a `first_live_post` alert (one shared alert table with B19), so its first real use is looked at.

---

## Part C — Blueprint for the fixes (Data → Server → Screens → Tests)

### C1. Data

| Record | One row per | Fields and rules |
|---|---|---|
| **`toll.disputes`** (new) | One amount a platform should have paid on one charge and didn't | `organization_id`, `charge_id`, `charge_week_key` (the charge's week: the week whose sealed statement shows this dispute in `disputed_minor`, so the R9 combined view can join the provisional figure to its result; also indexed for that view, U2), `platform`, `platform_trip_id`, `driver_id`, `owed_minor` > 0 (**immutable after insert**; only a reopen row has a different `owed_minor`, equal to the reversed link's amount, X1), `state` (`to_send` \| `sent` \| `won` \| `part_won` \| `lost` \| `expired`), `close_reason` (`refund` \| `partial_refund_two_periods` \| `platform_said_no` \| `no_refund_two_periods` \| `no_report` \| `window_closed` \| `opened_late` \| `undo` \| `reversal`; who acted is on the decision row; a dispute opened directly as `expired` gets `opened_late` at open, T5, U11, X2), `opened_at`, `sent_at`, `clock_from` (the start of the refund clock: `sent_at` normally, the reversal time on an R7 reopen, T3), `deadline` (end of the Nth Jamaica day after the trip date, N = the platform's `dispute_window_days`), `opened_late` (boolean), `text_version` (→ `toll.dispute_text_templates`, U3), `recovered_minor`, `bearer` (set on `lost` / `expired` / the rest of `part_won`), `posted_in_week_key` (**set when a result posts**: the open week at that moment, never stored at open, T1), `reopens_id` (R7), `decision_ids`, `version`. **DB rules:** check `owed_minor > 0`, `0 ≤ recovered_minor ≤ owed_minor`; a partial unique index allows at most one non-final dispute per charge; foreign keys to the charge and the platform trip. **Final-state rule (Z1):** the final states are `won`, `part_won` and `lost`. `expired` is **bearer-set, not final**: its bearer is charged, and a refund (adjustment) can still move it to `won` / `part_won`. A final state never changes, with two named exceptions: `undo_decision` (R10) and a reversal of a linked payback (R7). Each exception writes a **new** dispute row with `reopens_id`, so the history is never edited; one logical dispute can be a chain of rows (N12). The partial unique index allows at most one row per charge that is not `won` / `part_won` / `lost`. |
| `toll.dispute_links` (new) | One payback slice that settled a dispute | `dispute_id`, `payback_id`, `amount_minor`, `decision_id`, `reversed_by`. **DB rule:** Σ active links ≤ `owed_minor`. |
| Account `org:<co>:toll:receivable_platform_dispute` (new leaf account) | — | What the platform owes while a dispute is open (R2). **Two leaf accounts, no ledger parent (T4):** the existing `toll:receivable_platform` (trip and adjustment paybacks owed by the platform, live balance J$9,425.00 on 17 Nov 04:25 UTC) stays exactly as it is, and the new account is its sibling. Reports show one **reporting group, `owed_by_platforms`** (the only name any screen or report uses, N2), that sums the two leaves; no report sums a group plus its members, so nothing counts twice. This needs no carve-out: a fixed carve-out of the existing balance would not stay fixed, because every platform payout (P10) reduces it. **Nightly check:** `receivable_platform_dispute` = Σ (`owed_minor` − `recovered_minor`) over `to_send` and `sent` disputes, the only states that hold a provisional allocation (an `expired` dispute's amount sits with its bearer) (starts at 0 on switch-on); the existing `receivable_platform` check is unchanged. |
| **How a dispute moves the charge's allocations (W1)** | — | A charge is `decided` when Σ active allocations = its amount, provisional ones included (A6, Y1), and the seal accepts **provisional** allocations (it already does for Roam `awaiting_cash`). `toll.allocations` already has `bearer`, `payback_id`, `provisional`, `decision_id` and `reversed_by` (live, 17 Nov; `decision_id` links each row to the command that wrote it, N9); it gains **`dispute_id`**. <br>**How an allocation changes (Y3):** a row is never edited or partly reversed. "Reverse X by N" means: set `reversed_by` on the whole row, then insert the replacement rows (the moved slice, and the remainder if any). Live fact: `allocations_caps` is an AFTER-each-row trigger and **not deferrable**, so it checks after every single write. Therefore every rule below runs **in one transaction, reversal first, then inserts**, so Σ active never exceeds the amount at any row. <br>**1. Open:** `open_dispute` writes **one provisional platform allocation** for `owed_minor` (`bearer = platform`, `provisional = true`, `dispute_id`). The charge is `decided` (passes the seal) and shows as `disputed` (Y1). Its money posts to `toll:receivable_platform_dispute`, and `disputed_minor` = Σ these allocations in the week. <br>**2. Refund (`won` / part):** reverse the provisional allocation (the whole row; the remainder is a new row, Y3, AC5); insert a **firm** platform allocation for the recovered slice (`payback_id`, `dispute_id`), and, if anything is still owed, a new provisional allocation for the rest. Money moves from `receivable_platform_dispute` to the normal payback flow. <br>**3. `lost` / `part_won` rest / `expired`:** reverse the provisional allocation; insert a **bearer allocation** for the unrecovered amount (`driver_pays` → bearer driver, or `fleet_absorbs` → bearer fleet). <br>**4. Refund on `expired`:** **transfer**: reverse the bearer allocation; insert a firm platform allocation for the recovered slice (linked to the payback) and, if anything is unrecovered, a new bearer allocation for the rest. Never a parallel entry. <br>**5. `reverse_payback` / `undo_decision`:** reverse exactly the allocations the undone step wrote (found by their `decision_id`), and insert those of the reopened state (a provisional allocation again for `sent`; the bearer allocation again for `expired`). <br>**Where it happens:** if the charge's week is **open**, these allocation rows are written on the charge directly. If it is **sealed**, the charge's allocations stay frozen (B13), and the same money legs post as a `dispute_result` carried fact in the week open at that moment (`posted_in_week_key`). The combined view (A8) adds both, so the charge's final split is always readable. |
| **`toll.dispute_text_templates`** (new, U3) | One version of the dispute text per platform (no approval step, Q6) | `platform`, `version` (unique **per platform**: the key is `(platform, version)`, X4), `body` (with placeholders: trip date and time, plaza, toll, paid, owed), `created_at`, `retired_at`. Append-only: a version is never edited, only retired. The dispute stores the `text_version` the driver was shown, so the exact text can always be rebuilt. **Retiring** (`retired_at`) stops new disputes using a version; a dispute that already has that `text_version` still shows that text (AE10). A fleet manager or owner adds or retires a version; no approval step (Q6, AF2) |
| **Pay period (T6)** | — | One Monday–Sunday Jamaica week (Part 0 timezone rule; the same week as ADR 0007). "The pay period after X" = the first full week that **starts after** X. "Both refund periods in" = the platform reports for the first and second full weeks starting after `clock_from` are **in** |
| `toll_week` statement (changed, R9) | One per company per sealed week | Gains `disputed_minor` (open dispute amounts at seal). Ignored by `resolveTollInputs`; shown as provisional (A8). |
| `toll.platform_settings` (filled) | One per platform per company | Adds the `payback_mode` value `rider_pays_driver`. Written at switch-on with explicit seeds (AB6): **Uber** `payback_mode = trip_line` + adjustments, `takes_disputes = yes`, `dispute_window_days = 9`, `refund_periods = 2`, `auto_apply = false`. **InDrive** `payback_mode = rider_pays_driver`, `takes_disputes = no`, `dispute_window_days` and `refund_periods` not used, `auto_apply = false`. **Roam** `payback_mode = native`. **`auto_apply` rule (AA2):** always `false` while `payback_mode = rider_pays_driver`. The seed writes `false`, the settings screen refuses to turn it on in that mode, and the matcher skips the auto-apply check for these matches. If the mode later changes, the setting keeps whatever the owner chose. |
| `toll.plaza_rules` (extended) | One per plaza | Adds `tag_price_minor` and `platform_rates` (by platform, each with `valid_from`). |
| `toll.platform_settings` (dispute fields) | One per platform per company | `takes_disputes` (Uber: yes), `dispute_window_days` (**Uber: 9**), `refund_periods` (**Uber: 2**, the pay periods after sending in which a refund can arrive), `no_report_fallback_days` (**23**, R3, owner Q9). Why 23 (U9): the second full weekly pay period after `clock_from` ends at most 21 days later (up to 7 days to the next Monday, then 14 days), and the Uber report is due within 2 days after a week ends (Part 0). So 23 is the earliest day on which a missing report is really late. It never closes a dispute while its second period is running or its report is still due. On a platform with `takes_disputes = no`, an adjustment follows only today's 7-day charge match, and a refund on an already-decided shortfall is left unlinked by design for a person (S16b). |
| Fleet Policy (extended) | One per company | `toll_dispute_lost_bearer` (default `fleet`), `toll_dispute_expired_bearer` (default `driver`); a dispute with `opened_late` is always borne by the fleet. |
| "Report in" (R3 definition) | — | A pay period's platform report is **in** when a committed `import_batch` for that platform has `coverage_start ≤ period start` and `coverage_end ≥ period end`. It applies only to platforms with `takes_disputes = yes`. `rider_pays_driver` platforms have no disputes and no refund periods, and are excluded from the auto-close job (AB8). |
| Charge states (derived) | — | Adds `short_paid` (part paid, no dispute: only on a `takes_disputes = no` platform, because the system opens a dispute otherwise) and `disputed` to the list in A6. |
| `toll.platform_trips` | — | New source: the "logged trips" adapter from `fleet.trips` (B6). |

### C2. Server (commands and jobs; each carries `command_id` + versions and writes a decision)

| Command / job | Who | What it does |
|---|---|---|
| `open_dispute` | System (the matcher, when a trip payback leaves a remainder on a `takes_disputes` platform) or a person (fleet manager / owner) | **Refused with `charge_sealed` when the charge's week is sealed** (W2): a sealed week's shortfall is decided by a person (Part E). Otherwise creates a `to_send` dispute for the remainder and writes the **provisional platform allocation** (C1 W1 rule 1); charge → `decided` (provisional), state `disputed`. **Late branch (S4, X12):** when the deadline has already passed, it creates the dispute directly as `expired` (`opened_late`, `close_reason = opened_late`) and writes the **fleet allocation** (`fleet_absorbs`) for the remainder at once, in the same transaction; the nightly job has nothing to do for it. |
| `mark_dispute_sent` | Driver (own disputes only) or a fleet manager / owner | `to_send` → `sent`; stamps `sent_at` and sets `clock_from = sent_at`. **Refused with `window_closed` after the deadline** (S3); the nightly job then expires it. |
| `settle_dispute` | System (the matcher, when an `adjustment` or a `trip_line` payback fits) or a person (fleet manager / owner only; second person above J$5,000, B14; the accountant cannot, U8) | Writes a `dispute_link` for at most `owed − Σ active links` and raises `recovered_minor`. Links are applied **one at a time**, and the bound is re-checked for each, so two refunds in one batch can never over-pay (S7, N4). A refund that would exceed the bound is **refused** for this dispute and goes on to today's 7-day charge match, or is left unlinked for a person; it is never dropped silently (N8). All allocation writes run in one transaction, reversal first (C1 Y3). **Allocations:** turns that much of the provisional platform allocation firm, linked to the payback (C1 W1 rule 2). Full → `won` (`refund`), and the charge is `decided` with firm allocations only. **On an `expired` dispute (R5, T2; adjustments only, U14):** it **transfers** the recovered amount from the bearer's allocation to a firm platform allocation linked to the payback (C1 W1 rule 4): the driver's allocation when `opened_late = false`, the fleet's when `opened_late = true`. Full → `won` (`refund`); part → `part_won` (`refund`), and the unrecovered rest **stays with that same bearer** (the lost-bearer rule applies only to `sent` disputes). A toll already charged to the driver by hand is transferred the same way, by the recovered amount. |
| Auto-close (system, on each platform upload and nightly) | System | Applies only to `sent` disputes with `clock_from` set (U13). Once both refund periods after `clock_from` are **in** (C1 definitions): `recovered = 0` → `lost` (`no_refund_two_periods`); `0 < recovered < owed` → `part_won` (`partial_refund_two_periods`, T5), the rest to the lost bearer (R4). **Allocations:** the provisional platform allocation is reversed by the unrecovered amount and a lost-bearer allocation (`driver_pays` or `fleet_absorbs`) is written for it (C1 W1 rule 3); the same for the `no_report` fallback. **Fallback (R3):** if `clock_from` + `no_report_fallback_days` (23) passes while a report is still missing → `lost` (`no_report`), fleet bears, and the "Uber report late" alert is already open (B19). |
| `close_dispute_lost` | Fleet manager / owner (second person above J$5,000) | Closes a `sent` dispute early: `lost`, or `part_won` if some was recovered; `close_reason = platform_said_no` either way (U11). Rest to the lost bearer, with the same allocation writes as auto-close (C1 W1 rule 3). |
| Nightly `expire_disputes` | System | `to_send` past `deadline` → `expired` (`window_closed`); the provisional platform allocation is reversed and the expired-bearer allocation is written (driver, or fleet if `opened_late`) (C1 W1 rule 3). |
| `reverse_payback` on a linked payback (changed, R7, T3, U10) | System (import of a take-back) | Reverses that one `dispute_link` and writes a **new** dispute row (`reopens_id` = the closed one, `close_reason` of the old row stays; the new row's `owed_minor` = **the reversed link's `amount_minor`**; any other links stay on the original row, untouched). The new row reopens **in the state the dispute was in when that payback settled it**: <br>• it was `sent` → new row `sent`, `clock_from` = the reversal time, so it gets two fresh refund periods and the normal auto-close; <br>• it was `expired` → new row `expired` at once, and the bearer's charge (driver, or fleet if `opened_late`) is posted again for the reversed amount. Final immediately; nothing can stall. <br>**Allocations (C1 W1 rule 5):** the firm platform allocation written by that link is reversed, and the reopened state's allocation is written: the provisional platform allocation again (`sent`), or the bearer allocation again (`expired`), in one transaction, reversal first (C1 Y3). Money moves in the open week. The one named system exception to the final-state rule. |
| `undo_decision` on a dispute result (changed, R10) | Manager + second person (B14) | Never edits the sealed ledger. Posts a reversing `dispute_result` through `carry_forward` in the open week, and writes a new dispute row (`reopens_id`, `close_reason = undo` on the old one) in the state before the undone result, with that state's `clock_from`. **Allocations:** reverses exactly the allocations the undone step wrote (by `decision_id`) and writes those of the restored state, in one transaction, reversal first (C1 W1 rule 5, Y3). |
| `seal_week` (changed) | Manager | Accepts a charge whose only provisional allocation is an open dispute's (C1 W1 rule 1), exactly as it already accepts Roam `awaiting_cash`; puts `disputed_minor` = Σ those provisional allocations on the statement (R9). Still refuses a `short_paid` charge (R8 gives it a screen and buttons). **Refusal is structured (AD3):** today `seal_week` already refuses with `PENDING_NOT_RESOLVED` and a `blocking` list from `toll_system.seal_blockers` (`kind`, `id`, `amountMinor`, `reason`; `supabase/migrations/20261112185355_toll_v2_command_core.sql`). Change: each item also carries **`part`** (1–5, the part of step 3 that clears it), set by the server, so the screen never does its own grouping (B8). A new `short_paid` blocker has `part` = 5. **Server assignment, first matching rule wins (AG4):** `unverified` charge → 5; `short_paid` charge → 5; open duplicate pair (`review_pair`) → 5; unallocated payback or undecided carried share (`payback`, `carried`) → 5; `pending` charge with 2 or more candidate trips → 2; `pending` charge with a live suggestion → 1; any other `pending` charge → 4. The 2-trips rule comes before the suggestion rule because a charge with two trips also has suggestions. A charge is never in two parts. |
| Dispute result after the seal | System | Posted through `carry_forward` (new `kind` `dispute_result`) in **the open week at the moment of posting**, recorded as `posted_in_week_key` when it posts (T1). The sealed week's money is never touched (R1). |
| Matcher (changed) | System | Adjustments and trip paybacks for a disputed charge: the dispute first (B3, R6). Trip paybacks: compared with the platform's rate on the trip date (B9, S6). A toll on a trip of a `rider_pays_driver` platform (InDrive): a suggestion "Driver pays — rider owed it, driver collects in cash", shown in **Suggested matches**; a fleet manager confirms Driver pays or picks Fleet pays (B7). The `auto_apply` check is skipped for these matches (AA2, AC7). **Buttons → commands (AD5):** **Confirm Driver pays** → `driver_pays` with `suggestion_id` on the decision; **Fleet pays** → `fleet_absorbs` with `suggestion_id`; **Confirm all Driver pays** → one `driver_pays` per suggestion, in order, each its own decision. Never `apply_suggestion` (there is no payback to allocate). |
| `driver_pays` / `fleet_absorbs` (changed, AG1) | Fleet manager / owner | Accept an optional `suggestion_id`. When present it is checked the way `apply_suggestion` already checks it today (same company, same charge, not stale; `supabase/migrations/20261113023100_toll_v2_decisions.sql`), stored on the decision, and the suggestion is superseded by a `withdrawn` row in the same transaction (the matcher's existing append-only withdraw, `20261113011349_toll_v2_matcher.sql`), so a later matcher run can't bring it back. Without `suggestion_id` they behave as today. |
| Settings seed (S16) | Owner | At switch-on, the seed values for `platform_settings` and `plaza_rules` are shown to the owner, and approving them writes a decision row. Matching refuses to run for a company whose rows are missing (B12). |
| Logged-trips adapter | System, on trip save and nightly | Upserts hand-logged `fleet.trips` into `toll.platform_trips` (B6). |

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

## Part E — Until this is agreed

On step 3 the owner decides each shortfall as the old claims did (Fleet pays = Business Expense, Driver pays = Charge Driver). A later refund needs a manual decision. WRA-73 (show "paid back less than the toll" correctly) can go ahead, because it changes no money. It must take each charge's group from the **server** state (B8), never compute it on the screen, so the later `short_paid` / `disputed` states slot in without a screen rewrite.

---

## Part F — First build: rounds and status (owner said "start", 17 Nov 2026)

**Look-first at build start (planner, checked against the migrations, 17 Nov).** Four places where this document and the real database differ; the build follows the right-hand column:

| # | The document says | The database has | The build does |
|---|---|---|---|
| F1 | Uber `payback_mode = trip_line` | `payback_mode` CHECK is `per_trip`, `adjustments`, `none`, `native` (`20261112183806_toll_v2_foundations.sql`) | Uber = `per_trip`; add `rider_pays_driver` to the CHECK. "trip_line" in this document means `per_trip` |
| F2 | W1 rule 1: a provisional **platform** allocation with no payback | CHECK `allocations_platform_bearer_payback`: a platform row **must** have a `payback_id` | Replace the CHECK: a platform row has a `payback_id`, **or** is `provisional` with a `dispute_id`; a non-platform row never has a `payback_id` |
| F3 | Fleet Policy holds the two dispute bearers | No fleet-policy table exists in the database | New `toll.dispute_policy` (one row per company); the Fleet Policy screen edits it |
| F4 | `toll:other_income` (B17); staging for proof (L2.6 step 2) | No `toll:other_income` account; no staging project (staging is second build, AH4) | Add the account in S1 with its posting rule; first-build proof runs on the local Docker copy (playbook step 6) |

Also: `toll.plaza_rules` is keyed by plaza only (not per company), so the dated rates go in a new append-only `toll.plaza_rates` table (one row per plaza, kind, platform, `valid_from`), not as columns, so a rate change never edits history.

**Rounds (playbook step 5: Data → Server → Screens → Tests; one round at a time, each checked before the next):**

| Round | Who | What | Status |
|---|---|---|---|
| **D1** | Cursor | Data: switches, settings fields, `plaza_rates`, `dispute_policy`, `dispute_text_templates`, `disputes`, `dispute_links`, allocation `dispute_id` + F2 CHECK, `carried_facts` kind `dispute_result`; SQL tests. Prompt: `docs/toll-build/cursor-D1-disputes-data.md` | **Done** (97bec27e). Review fixed 3 bugs: the link cap counted the new link twice (a valid first refund was refused), the seed crashed on its second run, InDrive was seeded as "pays tolls back". 14 toll SQL test files pass on the local copy |
| D2 | Cursor | B13 sealed-week database guard (trigger + session flag), run against every existing toll SQL test. Prompt: `docs/toll-build/cursor-D2-sealed-week-guard.md` | **Done** (beec4537). Review: the nightly test now expects the refusal (and forces the tamper case past the triggers to keep proving check 5); `plaza_rate` closed to signed-in users; bypass helpers closed to service_role. 19 toll SQL files pass |
| S1 | Cursor | **Built, not committed. Review found money posted twice on every open-week result (F1–F3), wrong sealed-week postings (F4–F5), an undo that reverses the wrong rule and edits frozen rows (F6), the wrong posting week after a reopen (F7), a deadline a day early (F8), and a nightly check blind to disputes (F9). Fix round: `docs/toll-build/cursor-S1-fix-dispute-money.md`.** **S1-fix applied and committed; Claude review fixed four more issues: the week-flow nightly check ignored P21, the payback_unallocated nightly formula was a guess, undo reversals could land in a sealed week, and three test-order bugs. Cursor had reported done while its test failed. All 20 toll SQL files pass. Missing tests (undo for part_won / lost / expired; open vs sealed exact balances): `docs/toll-build/cursor-S1-fix2-missing-tests.md`.** Prompt: `docs/toll-build/cursor-S1-dispute-commands.md`. Commands: `open_dispute`, `mark_dispute_sent`, `settle_dispute`, `close_dispute_lost`, `driver_pays` / `fleet_absorbs` with `suggestion_id`, `seal_week` (`part`, `disputed_minor`), posting rules (`receivable_platform_dispute`, `other_income`) | — |
| S1b | Cursor | B14 four-eyes, B12 refuse to match without settings, B17 `toll:other_income` | — |
| S2 | Cursor | Matcher (dispute first, plaza rates, `rider_pays_driver` suggestions), nightly expire + auto-close + `no_report`, logged-trips adapter, report-late alert | — |
| S3 | Cursor | Screen reads: step-3 payload with the six parts, disputes company-wide, Results this week, blockers with `part`; driver-app dispute read + `mark_dispute_sent` route | — |
| UI1 | Claude | Port the six-part Tolls step from `docs/stitch/toll-step-slides/` (C3 Keep / Drop / Fix) + its tests | — |
| UI2 | Claude | Driver app dispute card, Driver Settlements Disputes tab, Fleet Policy toll settings + tests | — |
| P | Claude + owner | Proof on the local copy (done-tests, 9 Nov replay), then live switched off, settings seed (L2.6 step 0), switch on, one real week | — |

---

## Part L2 — The platform envelope (added Rev 5, reviewer round 1)

### L2.1 What already exists (facts for the reviewer, checked 17 Nov 2026)

| Reviewer asked for | Status | Evidence |
|---|---|---|
| Migrations in version control, forward-only, tested on a fresh copy | **Exists** | `supabase/migrations/` (timestamped); `scripts/validate-migration-sql.mjs` refuses future dates; CI `verify-migrations-replay.yml` replays every migration on an empty database; `scripts/assert-migration-versions-parity.mjs` compares the repo with production's version list |
| DB-enforced amount rules | **Exists** | Check constraints (`amount_minor > 0`, allowed `source`, `kind`, `paid_by`, `evidence_status`, `time_precision`); triggers `charges_amount_caps`, `paybacks_amount_caps`, `allocations_caps`, `payback_unlinked_caps` (allocations can't exceed the amount) |
| Idempotent imports | **Exists** | Unique `(organization_id, source, source_ref)` on charges, `(organization_id, platform, reference)` on paybacks, `(organization_id, platform, platform_trip_id)` on trips; `(organization_id, command_id)` on decisions |
| Append-only audit backbone | **Exists** | Triggers `decisions_append_only`, `suggestions_append_only`, `audit_log_append_only`, `nightly_results_append_only` |
| File provenance on the batch | **Exists** | `fleet.import_batches`: `file_sha256`, `file_name`, `semantic_key`, `supersedes`, `rows_parsed/committed/duplicate/rejected/spilled`, `coverage_start/end`, `week_keys` |
| Import failure semantics | **Exists, two levels (S8)** | **Data rows:** a bad row is rejected and counted (`rows_rejected`, `rows_spilled`), and the good rows commit. **File layout:** not checked today; B18 adds a whole-batch refusal (nothing written) for a missing or unknown column |
| Company isolation | **Exists, two levels** | RLS on every `toll` table (25 of 25 today; the two new tables `disputes` and `dispute_links` make 27, and both join the RLS checklist and the permission drift test, S9); the Fleet server uses the service key (which skips RLS), so every write goes through `toll_system.*` functions that take the company from the user's token (design B7) |
| Single-writer matcher | **Exists** | `toll_system.match_claim` claims queue rows with `FOR UPDATE SKIP LOCKED` and a 10-minute lease; a retried run gets `claim_gone` and does nothing |
| Recompute after money changes (outbox) | **Exists** | Triggers `toll_*_period_refresh` queue a period refresh; Week Recon queues driver-week rebuilds (WRA-67) and desk rebuilds (WRA-43) |
| Nightly proof the books add up | **Exists** | `toll.nightly_results`: 4 nightly runs (14–17 Nov), 15 checks per run (19 check names in all), 60 rows, all `ok`. Each `toll:*` account's ledger balance equals its records |
| Alerts | **Exists, barely used** | `toll.alerts` (one open per company + problem), 0 rows; metric list in `docs/toll-architecture.md` "Metric and alert definitions" (views, not dashboards) |
| Feature switch per company | **Exists** | `toll.switch_state.tolls_v2` |
| Deploy through CI only | **Exists** | `deploy-supabase-edge.yml`, `deploy-recon-worker.yml`, `vercel-path-deploy.yml`; pre-push checks (`scripts/check-before-push.mjs`) |
| Roles | **Exists, coarse** | Permissions in code (`packages/auth-client/src/permissions.ts`): `toll.manage` = owner or an active fleet_owner / fleet_manager seat; `toll.view` adds fleet_accountant; the database mirrors it, and a drift test guards it. Driver cash: the driver's own user only (`toll/v2/driver-cash` uses the caller's driver context) |
| Correlation IDs and structured logs | **Partly** | Week Recon: `x-recon-correlation-id`, JSON `reconPhase` logs; toll commands carry `command_id`; no trace across import → matcher → ledger |
| Week-close approval (four eyes) | **Partly** | Week Recon Close: prepare + approve, or self-approve with a written reason (WRA-32). Toll commands have none |

### L2.2 Gaps found, each with one chosen fix

| # | Gap | Fix (one) | Priority |
|---|---|---|---|
| **B12** | **Config has two owners** (`MATCHER_CONFIG_V1` in code and `toll.brain_policies`); `platform_settings` has 0 rows (silent defaults); `plaza_rules` has 0 rows | Seed `platform_settings` + `plaza_rules` at switch-on, refuse to match when a company's row is missing (loud, not silent). The v2 matcher reads only these. `brain_policies` stays owned by `toll-brain` (v181) **for Roam ride geofence detection and quotes only**, and an ADR records that boundary. Every settings change is a decision row (actor, before, after, reason); the switch-on seed values are approved by the owner as a decision row (S16) | P0 |
| **B13** | **Sealed-week protection is in the commands only**, not in the database | Scoped to **money in the sealed week** (R1): a trigger refuses any insert, update or delete of `allocations`, `payback_unlinked_decisions` and ledger postings whose counted week is sealed, and any change to a sealed-week charge's or payback's amount or week (except the seal and reopen functions themselves, by a session flag). **Dispute state is never blocked by this trigger (R1, X11):** a dispute's identity fields (charge, platform, driver, `owed_minor`) never change; a non-final dispute may move between states; a final one changes only through a new `reopens_id` row (C1). Every money effect of a dispute posts in the week open **at the moment of posting** (`posted_in_week_key`, T1), so the trigger only ever sees money in open weeks | P0 |
| **B14** | **No four-eyes check on risky money commands** | `undo_decision`, `correct_charge_amount`, `correct_charge_week`, `close_dispute_lost`, a person's `settle_dispute`, and policy changes need a second person **above J$5,000**; `reopen_week` **always** needs one. Uses the existing Week Recon approval pattern (prepare + approve). **Sole-manager exception (S15):** when the company has exactly one active owner / fleet_manager seat (checked at the moment of the command), they may self-approve with a written reason of at least 8 characters, stored on the decision. Both actors (or the self-approval and its reason) are stored on the decision | P0 |
| **B15** | **Role matrix not written down** ("a person" in this doc) | Matrix (below, L2.3) mapped to the existing permissions; the driver can only act on their own disputes and cash tolls | P0 |
| **B16** | **Raw files not kept; no staging; RPO/RTO not set; no rebuild test** | Store every uploaded file in a private, versioned bucket (`toll-evidence`, never cleaned) keyed by `file_sha256`, kept 7 years. A standing **staging** project with masked, real-shaped data, where every release runs the done-tests and the never-used paths (B11). Its data is refreshed automatically each week by a scheduled job (masked copy of the last 4 weeks), so it can't go stale without an owner; the job's failure raises an alert in the shared table (B19). Who watches that alert is owner question **Q11** (U15). A **ledger reconstruction test**: rebuild every `toll:*` balance from decisions + records **since the 14 Nov 2026 switch** and prove it equals the ledger (extends the nightly check). Restore drill each quarter | P0 (files, rebuild test) / P1 (staging, drill) |
| **B17** | **Kept-with-no-toll money has no end** | `payback_unallocated` holds J$1,200 decided "keep with no toll" (J$70 + J$780 on 15 Nov, J$350 on 17 Nov). Fix: from switch-on, a left-unlinked payback posts on to `toll:other_income` (the fleet's toll income) at the decision, so `payback_unallocated` only holds undecided money from then on; a daily "unallocated paybacks" list with age. The J$1,200 already kept stays as it is (forward only) and is recorded once as a fixed carve-out, `legacy_kept_minor = 120000` (J$1,200.00), which the C4.13 check subtracts, so the invariant holds from day one (S14) | P0 |
| **B18** | **Adapters don't detect a changed file layout** | Each adapter validates required columns and their types before writing anything. An unknown or missing column fails the **whole batch** with a named error and nothing is written. Data-level problems in single rows keep today's behaviour: the row is rejected and counted, and the good rows commit (S8). The failed file is kept (B16) and can be re-run after a fix; a contract test per adapter uses a real, masked sample file | P1 |
| **B19** | **No dashboards, SLOs or runbooks for tolls** | Dashboards: dispute funnel, unallocated paybacks, receivable vs open disputes, import row counts, matcher lag, nightly results. SLOs: matcher done ≤ 2 min after an import; nightly check 0 differences; 0 sealed-week changes; Uber report in ≤ 2 days after week end (alert on day 3). Runbooks: import failed, matcher stalled, nightly check failed, seal blocked, dispute job missed, Uber report late. **One alert table** for all of these plus B11's `first_live_post` (kind, company, first seen, last seen, owner, runbook link). The Uber-report-late alert is **P0**, because the 9-day window makes it a hard operational deadline | P1 (report-late alert P0) |
| **B20** | **No property tests for money rules** | Property tests (random charges / paybacks / allocations / disputes): sums conserved, no negative owed, exactly one final dispute state, week adds up; plus chaos cases: kill the matcher mid-run, a corrupt CSV row, replay a batch | P1 |
| **B22** | **No load test** (Part 0 asks for one at 10×) | One staging run at ~150 tolls / 800 trips a week: import, match, seal and nightly checks each finish within their SLOs (B19). Run once before switch-on and again if weekly volume passes 5× today. Owner of the run: the planner (Claude), per Q3 (N7) | P1 |
| **B7** (priority, AC4) | **InDrive `rider_pays_driver`** (full fix in Part B, B7) | Listed here only to give it a priority: unblocked by Q5; needs B6 (logged-trips adapter) and B10 (settings seed) first (AE9) | P0 |
| ~~B21~~ | ~~Old claims not mapped~~ | **Dropped (owner: leave legacy data alone).** The 219 `fleet.claims` stay as they are | — |

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

## Rounds

| Round | Date | Who | Outcome |
|---|---|---|---|
| 1 | 2026-11-17 | Claude | Rev 1: as-built audit (Part A), gaps B1–B11, questions and a proposed direction |
| 2 | 2026-11-17 | Claude | Rev 2 (owner: follow the playbook): one-sentence goal; one chosen fix per problem (B1–B11); blueprint C1 Data, C2 Server, C3 Screens with every button, C4 rules; Part D done-tests; no open options |
| 3 | 2026-11-17 | Claude | Rev 3 (owner fact: Uber gives drivers 9 days to dispute): window moved to the platform setting (Uber 9); disputes open the moment platform data arrives; `opened_late` → fleet bears; done-test 5 + 5b |
| 4 | 2026-11-17 | Claude | Rev 4 (owner fact: a dispute refund always arrives in the next pay period or the one after, never later): refund matching limited to those two periods; a dispute with no refund after both is lost automatically; done-tests 3, 3b, 6 |
| 5 | 2026-11-17 | Reviewer | Round 1: L1 domain strong; L2 envelope (NFRs, security, observability, resilience, release, governance) almost absent; asked for Part 0, L2 gaps, roles, state tables, diagrams, rollout, 7 questions |
| 6 | 2026-11-17 | Claude | Rev 5: checked every L2 point against the code and live data (L2.1, with evidence; much already exists). Added Part 0, gaps B12–B21 each with one fix and a priority, role matrix, dispute/charge state tables, sequence diagrams, rollout, Part G owner questions. Corrected: the J$70 adjustment was kept "with no toll" by the owner (not ownerless); found J$1,200 of kept-with-no-toll money with no end account (B17) |
| 7 | 2026-11-17 | Claude | Rev 6 (owner: don't touch reconciled weeks or legacy data): forward-only rule in Part 0; B21 dropped; B17 and the reconstruction test from switch-on only; Q7 answered |
| 8 | 2026-11-17 | Reviewer | Round 2 on Rev 6: structure accepted; 10 blocking (R1 sealed-week trigger vs dispute settlement, R2 receivable double-count, R3 auto-loss depends on reports that may never come, R4 partial-refund stall, R5 expired + refund bearer, R6 trip payback vs open dispute, R7 reversal reopen, R8 `short_paid` screen home, R9 week-statement semantics, R10 undo after seal), 16 should-fix, rounds table corrupted. Rev 7 |
| 9 | 2026-11-17 | Claude | Rev 7: R1 B13 scoped to sealed-week money, disputes carry `charge_week_key` / `result_week_key`; R2 `receivable_platform:dispute` sub-account, C4.5 = Σ (owed − recovered); R3 "report in" defined + 21-day `no_report` fallback (Q9); R4 auto-`part_won`; R5 refund on expired reverses the driver charge; R6 trip paybacks settle the dispute; R7 reversal reopens as a new row (`reopens_id`); R8 "Part-paid" group; R9 `disputed_minor` provisional, ignored by settlement; R10 undo via reversing carry-forward. S1 rounds repaired (rows 6–7 had been cut by a script quirk); S2–S16 applied; nits: Part E moved before L2, nightly row count explained, `opened_late` = boolean + `expired` state, shared alert table, Refund received only on `sent`, person-settle in B14. New done-tests 5c, 7b, 12–17; Q9, Q10 |
| 10 | 2026-11-17 | Reviewer | Round 3 on Rev 7: round 2 (R1–R10, S1–S16) closed. 6 new blocking from joint-cases of the round-2 fixes — T1 `result_week_key` vs "open week at posting", T2 R5 wrong bearer for `opened_late` and partial recovery, T3 R7 reopens `expired` as `sent` (stall), T4 `receivable_platform` Σ-children fails on legacy balance, T5 `close_reason` missing `partial_refund_two_periods`, T6 "pay period" undefined. 15 should-fix (U1–U15). New done-tests D5d, D14b, D18. Rev 8 |
| 11 | 2026-11-17 | Claude | Rev 8: T1 `result_week_key` dropped, `posted_in_week_key` set at posting; T2 a refund on `expired` reduces the actual bearer's charge (driver, or fleet if `opened_late`) by the recovered amount, rest stays with that bearer; T3 reopen in the state settled from (`sent` with fresh `clock_from`, or `expired` final at once); T4 changed from the proposed carve-out to **two sibling leaf accounts + a reporting group**, because the live `receivable_platform` (J$9,425.00 on 17 Nov) moves with every payout, so a fixed carve-out would break; T5 `partial_refund_two_periods` added, `person` removed (actor is on the decision); T6 pay period = Monday–Sunday Jamaica week. U1–U15 applied; U9 changed the fallback from 21 to **23 days** (the second period can end 21 days after `clock_from`, plus the 2-day report deadline). New done-tests 5d, 14b, 18, 19; Q11; answers log |
| 12 | 2026-11-17 | Reviewer | Round 4 on Rev 8: round 3 (T1–T6, U1–U15) closed; T4's two-leaf receivable is better than the proposed carve-out. **2 blocking from the round-3 fixes' own mechanics** — W1 dispute-resolution commands don't write the **charge's allocations**, so a `won` on a not-yet-sealed charge leaves it `short_paid` and the seal refuses; W2 `open_dispute` on a sealed-week charge undefined, and B1's "zero paid → automatic dispute" has no trigger (matcher requires a payback to exist). 15 should-fix (X1–X15), 7 nits. New Q12. Rev 9 |
| 13 | 2026-11-17 | Claude | Rev 9: **W1** solved with the design's existing **provisional allocation** (live `toll.allocations` already has `bearer`, `payback_id`, `provisional`, `reversed_by`; adds `dispute_id`): opening a dispute writes a provisional platform allocation (the seal already accepts provisional ones, as for Roam `awaiting_cash`), and each result turns it firm, moves it to the bearer, or transfers between them (5 rules in C1, named in every C2 command, C4.11). The receivable is now posted when the dispute opens, not at seal. **W2** `open_dispute` refuses sealed charges (`charge_sealed`, C4.12); B1 says auto only for a remainder, zero-paid by a person until Q12. X1–X15 and N1–N7 applied (B22 load test added as P1; C4 renumbered 11–13) |
| 14 | 2026-11-17 | Reviewer | Round 5 on Rev 9: round 4 (W1, W2, X1–X15, N1–N7) closed; the provisional-allocation design is right. **3 new blocking from W1's own mechanism** — Y1 `decided` (seal criterion, includes provisional) vs `disputed` (screens) vs L2.4's progression contradict each other and will produce three implementations; Y2 L2.4 `to_send` row allows `settle_dispute` that B3 and C3 forbid; Y3 W1 reverse-and-replace must be one transaction, reversal-first, or `allocations_caps` fires mid-transaction. **4 should-fix** — Z1 `expired` is settleable but listed as final with only two exceptions; Z2 role matrix missing "open a dispute by hand"; Z3 C4.4 holds for open weeks only; Z4 B4's late-open rule can't apply to a sealed-week charge (W2 refuses it). 5 nits. Rev 10 |
| 15 | 2026-11-17 | Claude | Rev 10: **Y1** vocabulary in A6 (`decided` = seal criterion incl. provisional; `disputed` / `resolved` / `short_paid` = screen states), A7, L2.4 and C4.14. **Y2** `to_send` can't be settled. **Y3** checked live: `allocations_caps` is an AFTER-each-row trigger and not deferrable, so **order** matters, not just one transaction; also, a row can't be partly reversed, so every rule now reverses the whole row and re-inserts the moved slice plus any remainder (C1, C2, C4.15). **Z1** `expired` = bearer-set, not final; the nightly receivable sums `to_send` / `sent` only. Z2–Z4 and N8–N12 applied (N9: `allocations.decision_id` already exists live) |
| 16 | 2026-11-17 | Claude | Rev 11 (owner answered Q5): InDrive is cash in practice; the rider owes the toll and the driver collects it; the fleet decides whether to charge the driver. B7 changed from an automatic cash wash (`cash_in_fare`, nobody charged) to `rider_pays_driver`: the toll is matched to the InDrive trip and the system **suggests Driver pays**, which a fleet manager confirms or changes to Fleet pays. No dispute, nothing automatic. B7 unblocked |
| 17 | 2026-11-17 | Claude | Rev 12 (owner principle): "the passenger is always responsible for the toll, never the fleet" stated at the top as the first principle; every platform rule (Uber dispute, InDrive driver-collects, Roam native) is a recovery channel for the passenger's toll; fleet / driver bear a toll only when recovery fails or there is no trip, always by an explicit decision or policy. No other rule changed: it already matched |
| 18 | 2026-11-17 | Reviewer | Round 6 (Rev 12): signable after fixes. Blocking AA1 (InDrive matches need their own buttons, not payback scores), AA2 (`auto_apply` must never fire for `rider_pays_driver`), AA3 (receivable check must sum only active provisional disputes). Should-fix AB1–AB9 (two senses of "bears", C4.1 independence, cash-trip assumption, report-in scope, done-test 8b, Q5 default). Nits AC1–AC7 (`short_paid` occupant, B7 priority row, remainder row, B6 dependency, matcher note) |
| 19 | 2026-11-17 | Claude | Rev 13 closes round 6: AA1 Suggested matches split (payback vs rider-pays-driver) with **Confirm Driver pays** / **Fleet pays** / **Confirm all Driver pays** and new C4.16; AA2 `auto_apply` always off for `rider_pays_driver` (seeds, C2, C4.7); AA3 C4.5 sums `to_send` / `sent` only. AB1–AB9 and AC1–AC7 applied inline (economic vs accounting "bears", B7 assumes cash trip and depends on B6, report-in only for `takes_disputes = yes`, B7 P0 row in L2.2, `short_paid` has no live occupant, Q5 default matches owner policy) |
| 20 | 2026-11-17 | Claude | Rev 14 (owner answered Q6): the dispute text needs no approval; the system fills a per-platform template and the driver copies it into Uber's dispute form, as the old `DriverClaims.tsx` did. B5 card buttons Copy / Open Uber App / Mark as sent; `approved_by` / `approved_at` removed from `dispute_text_templates`; SMS not in the first build; nothing is blocked on Q6 |
| 21 | 2026-11-17 | Claude | Rev 15 (owner): step 3 Tolls becomes one part at a time like the Fuel step (six parts, Back / Next, only Seal waits); C3 maps every group to a part; Stitch prompt `docs/stitch/toll-step-slides-fleet-prompt.txt` added. No data or rule changed |
| 22 | 2026-11-17 | Claude | Rev 16: owner's Stitch screens for the one-part-at-a-time Tolls step saved in `docs/stitch/toll-step-slides/` (10 screens). C3 gets a Keep / Drop / Fix list: only the middle card below the tiles is ported; everything Stitch invented around it is dropped; Matches row overlap and the cut-off seal sum are fixed in the port |
| 23 | 2026-11-17 | Reviewer | Round 7 on Rev 16: round 6 closed; six-part step and Keep/Drop/Fix are right. 5 blocking at the seams of the new structure: AD1 part 5's three groups not in C3; AD2 disputes from sealed weeks have no home; AD3 seal refusal has no message or navigation; AD4 driver card doesn't state the consequence of not sending; AD5 InDrive buttons don't name their commands. 14 should-fix (AE1–AE14), 4 nits (AF1–AF4) |
| 24 | 2026-11-17 | Claude | Rev 17 closes round 7, checked against the code: AD1 three C3 rows from today's screens (Receipt is fine / Reject receipt; Same toll / Different tolls; Match to a toll / Keep with no toll), wrapped not rebuilt; AD2 Disputes shows every active dispute company-wide with a "From week of" chip plus Results this week (C4.8, C4.14); AD3 `seal_week` already returns a structured `blocking` list, now with `part`, Still open list on part 6 (C4.17); AD4 consequence sentence follows the expired-bearer policy (C4.18); AD5 `driver_pays` / `fleet_absorbs` with `suggestion_id` (C4.19). AE1–AE14 and AF1–AF4 inline (Overdue redefined, since two periods auto-close; Open Uber App = `uberdriver://`, no deep link; A9, L2.2 B7 and L2.4 fixed) |
| 25 | 2026-11-17 | Reviewer | Round 8 on Rev 17: round 7 closed; **signable**, no new blocking items (no wrong-money path, no stale-sealed-week path, no screen the builder can't build). 7 should-fix: AG1 `suggestion_id` on `driver_pays` / `fleet_absorbs`; AG2 Decided scope; AG3 earlier-week dispute results in C4.4; AG4 blocker `part` table; AG5 0-days-left state; AG6 opened_late card incentive; AG7 Uber Confirm = `apply_suggestion`. 4 nits AH1–AH4 |
| 26 | 2026-11-17 | Claude | Rev 18 closes round 8, checked against the code: AG1 optional `suggestion_id` checked like today's `apply_suggestion`, suggestion withdrawn in the same transaction; AG2 Decided = this week only, no Undo on sealed weeks except dispute results; AG3 **corrected the premise**: an earlier-week dispute result is not in this week's spend, so C4.4's equation is unchanged; it shows in Results this week and as one line under the seal sum; AG4 `part` table in first-match order, with 2-trips before suggestions (a 2-trip charge also has suggestions) and the existing `carried` blocker → 5; AG5 Mark as sent hidden after the deadline; AG6 incentive sentence; AG7 Uber Confirm → `apply_suggestion`; AH2 tiles = count + amount; AH3 Overdue → Late; AH4 first vs second build |
| 27 | 2026-11-17 | Claude | Rev 19: owner said start. Part F added: look-first at build start found 4 differences from the database (F1 payback_mode is per_trip; F2 the platform-allocation CHECK needs a payback, so it must change for provisional disputes; F3 no fleet-policy table, new toll.dispute_policy; F4 no toll:other_income account and no staging, so first-build proof is on the local copy); dated plaza rates go in a new toll.plaza_rates table; first-build rounds D1, D2, S1–S3 (Cursor), UI1–UI2 (Claude), P (proof + switch-on). D1 given to Cursor |
