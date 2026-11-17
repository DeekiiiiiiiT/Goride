# Toll dispute life-cycle + all-platform matching — Audit

**Rev 1 · 2026-11-17 · Status: OPEN, nothing built.** Found on Week Reconciliation, week of 9 Nov 2026, step 3 (WRA-73).

**Goal (one sentence):** the new toll system (toll v2) must follow every toll a platform under-paid or never paid all the way to a result (paid back after a dispute, dispute lost, or dispute never opened), and must match tolls to InDrive and Roam trips, not only Uber, the way the old system did.

---

## 0. How the old system did it (what we lose today)

The old system (KV + `fleet.claims`, retired 14 Nov 2026) had a **claim per under-paid toll**:

`Open → Sent_to_Driver → Submitted_to_Uber → Resolved | Rejected` (`apps/fleet/src/types/data.ts` `Claim`, type `Toll_Refund`).

- `Sent_to_Driver`: the app wrote the dispute message for the driver to send to Uber.
- `Resolved` carried a reason: `Reimbursed` (a dispute refund came back, linked by `disputeRefundId`), `Charge Driver`, `Write Off` or `Business Expense`.
- A dispute refund that arrived later found its claim and closed it. If the driver had already been charged, it reversed that charge (`disputeRefundTripSyncEnabled`, 5 Jul 2026).
- Live: 219 `Toll_Refund` claims, all `Resolved`, the last on 26 Oct 2026. None since the switch.

Cash and app trips: a toll during a cash trip, where the rider paid the driver, was a **cash wash** (`Trip.tollRefundResolution = cash_wash`), so nobody was charged.

## 1. What the new system does today (checked in code and live data, 17 Nov 2026)

| Question | Today | Proof |
|---|---|---|
| Uber pays back only part of a toll | Understood: the charge keeps a remainder | 9 Nov: 12 tolls, Uber paid 370 for 390 and 275 for 280, remainder J$240 (`toll.allocations`) |
| Driver opens a dispute for the rest | **Not understood.** No dispute record, state or message. The remainder must be decided (Driver pays / Fleet pays) before the week can seal | `seal_week` refuses while any charge is undecided (G1, `docs/toll-architecture.md`) |
| Dispute refund comes back | **Only partly.** An Uber support adjustment becomes an `adjustment` payback, matched by driver + date **within 7 days** (`MATCHER_CONFIG_V1.adjustment_lookback_days`). Once the remainder was decided, the charge is `fully_decided` and excluded, so the refund can't attach and sits unassigned. No "undo the driver charge" | `packages/toll-core/src/v2/matcher/engine.ts` (`chargeExclusion`); live: 1 adjustment (J$70, 11 Oct), linked to nothing |
| Dispute lost, or never opened | **Not understood.** No deadline, no reminder, no rule for who pays | — |
| Roam trips | Understood: native. A crossing on a Roam ride is written with its payback at ride end, no matching | `20261112222929_toll_v2_roam_native.sql` |
| InDrive trips | **Not for how the owner works.** Only an uploaded InDrive export reaches `toll.platform_trips`. Hand-logged InDrive trips (`fleet.trips`, `isManual`, with request/drop-off times, cash) never do, so a toll during one shows as "no trip" | Live: `toll.platform_trips` holds platform `uber` only; 9 Nov has 8 hand-logged InDrive trips |

## 2. Findings (one fix each)

| # | Finding | Fix |
|---|---|---|
| TD-1 | **No dispute record.** An under-paid or unpaid platform toll (remainder after a trip payback, or a toll on a trip whose platform paid nothing) goes straight to Driver pays / Fleet pays. | New table `toll.disputes`: one per charge remainder that a platform should have paid. Fields: charge, platform, trip, amount owed, state (`to_send` → `sent` → `won` / `part_won` / `lost` / `expired`), sent date, deadline, decided bearer, linked payback(s), decision ids. The matcher opens one automatically for every remainder on a platform-paid trip. A person can also open one. |
| TD-2 | **The week can't seal while a dispute is open, so the person is forced to decide early.** | An open dispute counts as **decided for the seal**: the remainder posts to a new account `toll:dispute_receivable` (owed by the platform, pending). Seal and driver pay go ahead. The dispute's result posts later in the open week (same `carry_forward` rule as P18): `won` clears the receivable from the refund; `lost` / `expired` moves it to the bearer from the policy (TD-4). |
| TD-3 | **Dispute refunds only match within 7 days and can't attach to a decided toll.** | An `adjustment` payback first looks for an open dispute (same driver, same platform, amount ≤ owed, any age up to the dispute deadline + 30 days). If one fits, it settles that dispute (TD-2 `won` / `part_won`). Only if none fits does it fall back to today's 7-day charge match. A refund for a toll already charged to the driver reverses that charge in the open week (old `disputeRefundTripSyncEnabled` behaviour, built in). |
| TD-4 | **No rule for a lost or forgotten dispute.** | Fleet policy settings (Fleet Admin → Fleet Policy, per company): dispute window in days, from the trip date to "send by"; who pays a **lost** dispute; who pays an **expired** one (never sent in time). The nightly run moves `to_send` past its window to `expired` and posts it to the policy bearer. Each state change is a decision with a reason (audit trail). |
| TD-5 | **The driver isn't told to dispute.** | `to_send` disputes show in the Roam driver app ("Dispute this toll with Uber": trip, toll, amount, ready-to-send text, a "Sent" button). The fleet sees the same list on step 3 and on Driver Settlements. A dispute not sent within 2 days of opening shows as overdue to both. |
| TD-6 | **Hand-logged InDrive trips never reach the toll matcher.** | Feed `fleet.trips` InDrive rows (request + drop-off times, payment method) into `toll.platform_trips` on save and on the nightly run. A toll on a **cash** InDrive or Uber trip where the rider paid the driver is a **cash wash**: the toll is decided as covered by the rider's cash (`received_by driver`), and no one is charged twice. A toll on a card InDrive trip with no payback opens a dispute (TD-1) only if that platform pays tolls back. Otherwise it goes to the policy bearer. |
| TD-7 | **Step 3 calls an under-paid toll "Tolls with no trip"** (WRA-73). | Covered by WRA-73's server state, with one more state: `disputed` (open dispute, amount, state, days left). The step shows a "Disputes" group. Driver pays / Fleet pays on a disputed toll asks to close the dispute first. |

## 3. Layers

- **Database:** `toll.disputes`; account `toll:dispute_receivable` (+ chart rows); policy columns for the window and bearers; matcher scope adds open disputes; nightly expiry job; InDrive feed from `fleet.trips`. One migration per step, current UTC date, logbook line each.
- **Server:** commands `open_dispute`, `mark_dispute_sent`, `close_dispute(won | part_won | lost)`, all with `command_id` + versions like the other toll commands; `seal_week` treats an open dispute as decided (TD-2); the adjustment-payback path (TD-3).
- **Screens:** step 3 Disputes group (TD-7); Driver Settlements dispute list; Roam driver app dispute card (TD-5); Fleet Policy settings (TD-4).
- **Gates:** seal never blocks on an open dispute; driver pay never double-charges (a won dispute after Charge Driver reverses it); every dispute ends in exactly one result.

## 4. Done-tests (write these first)

1. 390 toll, Uber pays 370 on the trip → a dispute for J$20 opens by itself; the week seals; J$20 sits in `toll:dispute_receivable`.
2. Dispute sent; Uber adjustment of J$20 arrives 20 days later → the dispute is `won`, the receivable clears, and nobody is charged.
3. Same, but the driver had been charged J$20 → the charge is reversed in the open week.
4. Dispute never sent past the window → `expired` → posted to the policy bearer in the open week.
5. Dispute `lost` → posted to the lost-dispute bearer.
6. Part refund J$10 of J$20 → `part_won`; J$10 to the lost-dispute bearer.
7. Hand-logged cash InDrive trip covers a toll → cash wash, no "no trip" row, no dispute.
8. A toll during a Roam ride → native, unchanged.
9. A toll with no trip on any platform → "Tolls with no trip" only.
10. Week of 9 Nov replay: the 12 shortfalls open 12 disputes (J$240); the step shows them in "Disputes", not "no trip".

## 5. Open / next

- Build order: TD-1 + TD-2 (the money model) first, then TD-3, TD-4, TD-6, then the screens (TD-5, TD-7).
- Until this is built: on step 3, decide each shortfall as the old claims did (Fleet pays = Business Expense, Driver pays = Charge Driver). A later refund then needs a manual decision.
- Related: `docs/toll-architecture.md` (money model P1–P20), `docs/week-reconciliation-architecture-audit.md` WRA-73.
