# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 12 · 2026-10-26 · Sep 7 closed correctly · 4 weeks left to close**

Rev 1–11 are in git history. This revision lists open items only.

## Verified this round (prod)
- **The double count is fixed.** `uniqueTollRowsById` is used at both merges in `ReconciliationWizard.tsx` (L895, L904) and has a test in `tollSpend.test.ts`.
- **Sep 7 is closed and settled at 0.00.** The toll statement reads spend 3,595 − reimbursed 3,045 − charged 550 = net 0.
- **Sep 7 money ties:**
  - Cash held: 52,025.61 collected + 550 tolls − 5,000 returned − 23,800 fuel paid = 23,775.61.
  - Payout: 28,739.70 driver share − 4,264.24 fuel = 24,475.46.
  - 24,475.46 − 23,775.61 = **699.85 owed to Kenny**. One cash `pay` of 699.85 was posted at 17:22 UTC, which leaves 0.
- **Later weeks didn't move.** Sep 14 recomputed after the close and is still −8,102.23. Oct 19 still reads +37,397.13.

## 1. Left

### 1.1 Confirm the $699.85 cash really went to Kenny — owner check
- The close posted it as a real cash payment.
- If it was not handed over, reverse it. Don't edit the row.

### 1.2 Close Sep 14 → Oct 5, in order — Medium
Pre-check on `fleet.toll_ledger` + offsets:

| Week | Tolls | No trip (pending) | Duplicate offsets | Missing service line |
|---|---|---|---|---|
| Sep 14 | 4 | 4 | 0 | 0 |
| Sep 21 | 12 | 11 | 0 | 0 (1 top-up, org) |
| Sep 28 | 6 | 5 | 0 | 0 (1 top-up, org) |
| Oct 5 | 12 | 9 | 0 | 0 |

- None of the Sep 7 bugs appear again.
- 29 tolls still have no trip. Match each one in the Tolls step, or resolve it there (personal / business / write-off). That's normal work, not a bug.
- After each close, log only cash really received. Check that Oct 19 still reads +37,397.13.

### 1.3 The two personal charges have no ledger events — Low
- There are still no `toll_charge` or `toll_charged_to_driver` events for Sep 11 `090bd599…` or Sep 12 `ea0380fb…`.
- **Kenny's settlement is not affected.** It reads the charge from the toll week statement (550).
- Only the Business Finance P&L Tolls line misses the two pairs.
- **Do:** backfill the four events once. Check that new personal charges write them.

### 1.4 Commit
- The fixes are in the working tree, uncommitted.
