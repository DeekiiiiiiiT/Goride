# Pick up here — Toll Architecture + Week Reconciliation

**Written 2026-11-12, end of session.** Next session: read this file first, then paste the reviewer's round 6 feedback.

## 1. Where we are

**Toll rebuild (main work now)**
- The design is in `docs/toll-architecture.md`, now **Rev 9** (12 Nov). **Round 9 was the LAST review: Agreed, "ship it". No more rounds; changes come from failing tests.** (Round 8: Agreed in architecture, Phase 0 cleared.) Rev 8 closes their 8 edge gaps (G1.1–G1.8); G1.9 (cash-trip take-back) is tracked before Phase 2; G1.10 = the Business Finance bank-key bug, rated High, to be fixed (own audit) before Phase 0 exits. Next: owner says go → Phase 0 from Part D; later changes come from failing tests, not review rounds.
- **Round 6: the reviewer approved Phase 0 to begin.** EC1 (check 3 across weeks) and EC2 (Roam cash payback order) are Phase 0 *exit* criteria; both are in Rev 6, along with the eight small notes. Rev 6 asks the reviewer to mark the design **Agreed**.
- **BUILD STARTED 12 Nov:** tracker = Part F of `docs/toll-architecture.md` (rounds R0–R7, done-tests). Next = owner runs `supabase/tests/toll_v2_r0_live_look.sql` (read-only) and pastes results; then Claude writes the R1 Cursor prompt.
- **Separate item for the owner (not toll):** the Business Finance bank-confirm save and delete take their record key's company from the browser (`register_fleet_bank_routes.ts:35`, `:120`; A13).
- *(Rounds 1–6 history below kept for reference.)*
- **Older next step:** the owner pastes the round 6 feedback.
  - Check every reviewer claim against the code before changing anything. The reviewer has no app access, and each round some of their claims have turned out wrong.
  - Write Rev 6 into the same file and log the round in its Rounds table.
- **If round 6 approves Phase 0:** still build nothing until the owner says go ("no prompts until the plan is closed"). Then start Phase 0 from Part D of `docs/toll-architecture.md`.
- The reviewer said round 5 was the last round about the money model; later rounds should be about build and operations.

**How each revision has been written (keep the same way)**
- The reviewer's text goes under **Reviewer**, the reply under **Claude**.
- Any claim checked against code says "checked" and cites `file:line`.
- Unverified items are marked *(to check)*.
- The Rounds table gets a new row.
- The file has been rebuilt each round with a small node script: keep Part A (A1–A12), replace Part B onward. The Part B text was drafted in the scratchpad first.

## 2. Key facts already checked (don't re-derive)

- **The toll section must serve every platform:** Roam (native: its geofence crossings are certain), Uber, InDrive, and future ones such as Lyft.
- **Who receives toll paybacks:** card or in-app trip → the platform payout → the fleet; cash trip → the driver in hand. The driver's cash owed is `passengerCash` (`driver_financial_periods.ts:1275`), which already includes the rider's toll.
- **Ledger:**
  - `ledger.entries` is double-entry; `ledger.financial_events` is single-sided.
  - Toll rows aren't posted to `ledger.entries` today (dual-write is off).
  - Today's toll accounts (`platform:fleet_toll_expense`, `platform:driver_receivable`, `platform:clearing`) are shared by every company.
  - `ledger.post_entry` has no sealed-week check, and its `idempotency_key` is unique across all companies.
- **Company:** the Fleet server uses the service key (`service_client.ts:22`), which skips row security. It already takes the company from the verified sign-in (`org_scope.ts:73`).
- **Week:** ADR 0007, Monday–Sunday Jamaica time, through `periodKeyFor`. Sealed weeks are stored in `ledger.week_statements`.
- **Settlement:** pay / collect don't check the toll seal (`settlement_commands.ts`). Business Finance's bank confirmations live in the key-value store (`fleet_bank_confirm:`).
- **Open facts** are in Part E of `docs/toll-architecture.md` (9 items, none blocking Phase 0).

## 3. Week Reconciliation (paused for the toll rebuild)

- **Audit:** `docs/week-reconciliation-architecture-audit.md` Rev 28. 17 of 21 browser done-tests pass.
- **Left:** tests 5, 6, 9t and 13.
  - **5** waits on WRA-42 (dispute refunds with no toll can't be cleared).
  - **13** waits on WRA-43 (no recalculation after toll decisions).
  - **6** waits on WRA-41 (the Fuel step says "This week is no longer on the list").
  - **9t:** re-run after the auto-match fix.
- **The toll findings** (WRA-42, WRA-44, and WRA-43 in part) are now covered by the toll rebuild. Week Reconciliation keeps its current Tolls step until the rebuild's Phase 4. WRA-41 (Fuel) is still Week Reconciliation's own to fix.
- **Uncommitted fixes from 12 Nov:**
  - the step error boundary (`ReconStepBoundary.tsx`);
  - the Tag account save error;
  - the fleet-claims week check (+ client header);
  - the auto-match header exemption;
  - test set-up retries;
  - the Tag Co seed;
  - toll charge sync on in the test copy.
- **Nothing is committed or live.** Commit only when the owner says.

## 4. Files

- `docs/toll-architecture.md`: the design, Rev 5.
- `docs/week-reconciliation-architecture-audit.md`: Week Reconciliation, Rev 28.
- `docs/week-reconciliation-toll-review.md`: superseded by the toll architecture (rounds 1–2 only).
