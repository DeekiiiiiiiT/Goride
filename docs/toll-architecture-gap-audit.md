# Toll architecture — as-built audit and what it lacks

**Rev 1 · 2026-11-17 · For: the architecture reviewer · Status: OPEN, no build until the reviewer and the owner agree a better architecture.**

The design doc is `docs/toll-architecture.md` (Rev 9, "Agreed", built Phase 0–3, live since the 14 Nov 2026 switch). This audit does not repeat it. It checks **what is actually built and live**, measured against what the business needs, and lists what is **missing**. Facts were checked in code and in the live database on 17 Nov 2026.

Rounds: the reviewer answers under each part. Claude replies and revises. The table at the end records each round.

---

## Part A — What the toll architecture is today (as built)

### A1. Purpose (from the design, unchanged)

Every toll the fleet paid gets one answer to "who bears this cost?" (platform, driver or fleet), and the week adds up: spend = platform + driver + fleet, nothing undecided. The tag account adds up separately (opening + top-ups − usage = closing).

### A2. Records (live row counts, 17 Nov)

| Table | Rows | What is in it live |
|---|---|---|
| `toll.charges` | 71 | **All** `tag_statement` / `tag`. **0** driver cash, **0** Roam, **0** manual |
| `toll.paybacks` | 70 | Uber only: `trip_line` (received by fleet or driver) and 1 `adjustment` (J$70, 11 Oct, linked to nothing) |
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

### A7. Seal

`seal_week` refuses until every charge is decided, with no unverified cash, no open duplicate pair and nothing unallocated (G1 in the design). Late facts after a sealed and paid week go through `carry_forward` into the open week (P18–P20).

### A8. Money

Double-entry postings P1–P20 to `org:<co>:toll:*` accounts (`payback_unallocated`, `receivable_platform`, `receivable_driver`, `recovered_in_driver_cash`, `platform_payout_clearing`…). The sealed result is `ledger.week_statements` `kind = 'toll_week'`. Driver settlement reads the sealed toll statement (`resolveTollInputs`).

### A9. Week Reconciliation use

- Step 1: tag usage, top-ups, cash tolls (driver-reported since WRA-72).
- Step 3 Tolls: groups *Suggested matches*, *Pick the right trip*, *Tolls with no trip*, *Decided*; Seal tolls.
- Step 4 Tag account: reads `toll_sys_tag_account_weeks`.
- Steps 7–8: settlement and close read the sealed toll statement.

---

## Part B — What it lacks

Each gap: what the business needs, what the **old system** did (retired 14 Nov), what v2 does, and the evidence.

### B1. Dispute life-cycle for under-paid tolls (missing)

- **Need:** when a platform pays back less than the toll, or nothing on a trip it should cover, the driver disputes it with the platform and the fleet tracks it to a result.
- **Old:** a `Toll_Refund` claim per shortfall, `Open → Sent_to_Driver → Submitted_to_Uber → Resolved | Rejected`, with the dispute message written for the driver. Resolution reasons: `Reimbursed`, `Charge Driver`, `Write Off`, `Business Expense` (`apps/fleet/src/types/data.ts` `Claim`). Live: 219 claims, all resolved, the last on 26 Oct.
- **v2:** no dispute record, state, message or list. The shortfall is just a remainder on the charge.
- **Evidence:** week of 9 Nov: 12 tolls part-paid (Uber J$370 on J$390, J$275 on J$280), J$240 total, with no dispute anywhere.

### B2. The seal forces an early decision on a shortfall (design conflict)

- **Need:** the week should close and drivers get paid while a dispute is still open.
- **v2:** `seal_week` requires every charge decided, so the person must press Driver pays or Fleet pays on the shortfall before the dispute could ever come back.
- **Effect:** the dispute's outcome can't be honoured without a manual undo/carry-forward.

### B3. Dispute refunds don't reliably find their toll (partial)

- **Old:** a dispute refund matched its claim and closed it; if the driver had been charged, the charge was reversed (`disputeRefundTripSyncEnabled`, 5 Jul 2026).
- **v2:** an Uber support adjustment becomes an `adjustment` payback, matched by driver + date **within 7 days only**. Disputes often take longer. Once the shortfall was decided, the charge is excluded (`fully_decided`), so the refund can't attach. It becomes unallocated money for a person, and a driver charge is never reversed automatically.
- **Evidence:** the one live adjustment (J$70, 11 Oct) is linked to nothing.

### B4. Lost or forgotten disputes have no rule (missing)

- **Need:** a dispute the platform rejects, or one the driver never sends, must end with a clear bearer.
- **v2:** no deadline, reminder, expiry or policy. The bearer is whatever a person picks on step 3, with no rule behind it.

### B5. The driver is never asked to dispute (missing)

- **Old:** `Sent_to_Driver` with a generated message.
- **v2:** nothing in the Roam driver app or the fleet screens.

### B6. Hand-logged InDrive trips are invisible to tolls (missing for how the business works)

- **v2:** only an InDrive **file** reaches `platform_trips`. The owner logs InDrive by hand, so a toll during an InDrive trip is shown as "Tolls with no trip".
- **Open business fact:** how InDrive tolls are paid. The trips are cash. Does the rider pay the toll to the driver in the fare (old system: **cash wash**), or does nobody pay it back?
- **Evidence:** `platform_trips` has `uber` only; 9 Nov has 8 hand-logged InDrive trips on Sun 15 (none had a tag toll that day, so no wrong row yet).

### B7. Cash-trip tolls (cash wash) aren't modelled for non-Uber platforms

- **Old:** `tollRefundResolution = cash_wash`: the rider paid the toll to the driver in cash, so nobody is charged.
- **v2:** Uber cash trips are covered (a `trip_line` payback with `received_by = driver`, posted to `recovered_in_driver_cash`). Other platforms' cash trips have no path (follows from B6).

### B8. "Paid back less than the toll" has no state and is shown as "no trip"

- **v2:** a part-allocated charge with no live suggestion falls into *Tolls with no trip* ("No Uber trip at this time"), showing the full toll, not the remainder (WRA-73 in `docs/week-reconciliation-architecture-audit.md`). The screen decides the grouping; the server has no such state (A6).

### B9. A systematic platform rate difference isn't understood

- **Fact:** Uber refunds its own toll rate. Since the toll price rose, every Portmore crossing is J$20 short and every Spanish Town crossing J$5 short.
- **v2:** the 5% "amount close" rule just misses (J$20 on J$390), so these never auto-apply. `plaza_rules` is empty: there is no record of each plaza's tag price versus each platform's refund rate, so a known, repeating difference looks like 12 separate problems every week.

### B10. Configuration has no owner

- `toll.platform_settings` has **no rows**: `pays_tolls_back`, `payback_mode` and `auto_apply` are code defaults nobody set.
- The matcher's knobs live in code (`MATCHER_CONFIG_V1`) **and** in `toll.brain_policies` (A4).

### B11. Built paths never exercised live

Driver cash charges, Roam native charges, `carry_forward`, duplicate review, take-backs (`reverse_payback`) and `fleet_absorbs` have **0 live rows**. Their tests pass locally, but none has met real data.

---

## Part C — Questions for the reviewer, and a proposed direction

### C1. Questions

1. **Dispute as a record.** Should a dispute be its own record (`toll.disputes`, one per remainder a platform should have paid, with states such as `to_send → sent → won | part_won | lost | expired`), or a kind of allocation/decision on the charge?
2. **Seal with an open dispute (B2).** Is the right model a new account `toll:dispute_receivable`? At seal, the open dispute's amount posts there (owed by the platform, pending). The result posts later in the open week, the same way as `carry_forward` (won → refund clears it; lost/expired → policy bearer). That keeps the seal rule ("nothing undecided") without forcing an early guess.
3. **Refund matching (B3).** Should an `adjustment` payback look first for an open dispute (same driver and platform, amount ≤ owed, no 7-day limit, up to the dispute deadline + a grace period), and only then fall back to today's charge match? Should a refund on a toll already charged to the driver reverse that charge in the open week?
4. **Policy (B4).** Per company, in Fleet Policy: the dispute window (days to send), who bears a **lost** dispute, who bears an **expired** one. Is a nightly expiry job the right owner of `expired`?
5. **Driver task (B5).** Do disputes belong in the Roam driver app (a "Dispute this toll" card with the text ready, and a "Sent" button)? Is the driver's "Sent" enough evidence, or is proof needed?
6. **InDrive and cash wash (B6, B7).** Should hand-logged trips (any platform) feed `platform_trips` on save? Is "toll during a cash trip = rider paid the driver" a platform setting (`payback_mode = cash_in_fare`) rather than code?
7. **Plaza rates (B9).** Should `plaza_rules` hold each plaza's tag price by date and each platform's refund rate, so a known rate gap is decided by a rule (bearer per policy), and only an *unexpected* gap goes to a person or a dispute?
8. **Config (B10).** One home for matcher knobs (`platform_settings` + `plaza_rules`), retiring `brain_policies` from the v2 path. Who may change it?
9. **States (B8).** Add `short_paid` and `disputed` charge dispositions, derived on the server, so every screen and report shows the same thing.

### C2. Proposed direction (for the reviewer to accept, change or reject)

- New record `toll.disputes` and account `toll:dispute_receivable` (C1 Q1–Q2).
- Matcher order: open disputes first for adjustments (Q3).
- Fleet Policy: dispute window and bearers; nightly expiry (Q4).
- Platform adapter contract extended: `payback_mode` includes `cash_in_fare`; hand-logged trips are an adapter (Q6).
- `plaza_rules` gains rates; a "known rate gap" rule (Q7).
- Charge states gain `short_paid` and `disputed` (Q9).
- Invariants to add (each with a test): every dispute ends in exactly one result; a won dispute never leaves a driver charged; the seal never waits on a dispute; the week still adds up to the cent with disputes open.

### C3. What happens until this is agreed

On step 3 the owner decides each shortfall as the old claims did (Fleet pays = Business Expense, Driver pays = Charge Driver). A later refund needs a manual decision. WRA-73 (show "paid back less than the toll" correctly) can go ahead, because it changes no money.

---

## Rounds

| Round | Date | Who | Outcome |
|---|---|---|---|
| 1 | 2026-11-17 | Claude | Rev 1: as-built audit (Part A), gaps B1–B11, questions C1 and proposed direction C2 |
