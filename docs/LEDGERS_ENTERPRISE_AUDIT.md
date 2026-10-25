# Ledgers Section — Enterprise Audit (Rev 4)

**Date:** 2026-10-25 · **Scope:** Business Finance → Ledgers · **Mode:** audit only, no code changed.
**Rev 4:** checks the Rev 3 steps. Only open items are listed.
**Re-checked 2026-10-25, late:** no change. The last fix is still uncommitted, and no Uber Oct 19 data exists yet (that week ends today), so item 3 and the last exit check have to wait for that import.

## Status: code complete and live

- **Database:** migration `20261026010000_ledgers_audit_remediation` is applied.
  - 9 Uber deposit rows each point to the week before them.
  - 7 carry-in rows carry `carriedFromWeek`.
  - Roam net is no longer set to gross.
  - InDrive commission is recorded (243.80 on Oct 5).
- **Server:** fleet-core v139 went live at 22:31:46 UTC, after the last edit (22:31:23).
- **Checks:** finance-core 337/337, fleet `tsc` 464 (baseline).
- **Uber totals match Uber to the cent:** `statement_week_rollup` returns Uber's figures for Oct 5 and Oct 12 on every line, with `other = 0`.

## Open

1. **Commit the last fix.** These changes are live but uncommitted:
   - `statementCard.ts`: `statementRowMatchesWeek`, which stops next Monday's org bank row from counting toward this week's tie;
   - its golden test;
   - the `statement_summary_build.ts` client change.
2. **Confirm the roamfleet.co frontend is deployed.** I can't see the live bundle from here.
3. **Remove the `00000000…` deposit fallback** (`statementCard.ts`, `bankRole()`) once the next Uber import shows new `payout_bank` rows saved with `bankRole='actual_deposit'` and `periodStart`.

## Exit checks (in the app)

| Check | Pass condition |
|---|---|
| Uber Oct 12 card | "Deposited 2026-10-19 · 33,757.62", Ties ✅ |
| Uber Oct 5 card | Deposit 2026-10-12 · 67,384.03, Ties ✅ |
| Driver card with no driver bank row | "Not checked", not ✅ |
| Statement → Cancellation, after visiting Trip Ledger | Trip Ledger filtered to the cancelled trips |
| Oct 19 Uber card | "Carried from week" lists 7 weeks, net +5,516.62 (the Aug 10 row is −1,500) |
| Fuel Expenses for a period with more than 500 rows | Totals shown, not "truncated" |
| Next Uber CSV import (Oct 19) | `fare_other = 0` on normal trips; Fare block matches the Uber app |

When all of these pass, this audit is closed.
