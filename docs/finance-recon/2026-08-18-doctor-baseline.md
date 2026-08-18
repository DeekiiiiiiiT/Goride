# Finance-doctor baseline — 2026-08-18 (pre-cleanup)

Live `ledger.entries` before C1/C3/C6 removal. C2 trip rows are reimbursements — do not reverse.

| Class | Rows | Posted | Keep | Reverse |
|---|---|---|---|---|
| **C1** May 18 $10,495.77 | 2 | $20,991.54 | per-driver `…\|payout\|cash\|uuid` (payments_driver) | org `…\|payout\|CASH` |
| **C1** Aug 4 $29,976.26 | 2 | $59,952.52 | tagged payments_driver batch | blank-platform twin |
| **C1 total** | 4 | **$80,944.06** vs **$40,472.03** real | | |
| **C2** trip `toll_charge` | 194 | $72,710.00 | reclassify later | none |
| **C2** plaza `toll_ledger` | 233 | $88,210.00 | charge | none |
| **C3** “trip completed order” | 22 | $35,023.96 | none | all 22 |
| **C4** untagged money | 6 | | tag promo $95.76, fare $1,756.20, statement $3,660, Uber org bank $37,838.90 | blank cash (C1) + extra $15 support (C6) |
| **C5** statement+trip fare | 0 | | keep check forever | |
| **C6** case `91bae090` | 3 | $45.00 | `payment_line:uber_tx` $15 | 2 import `|toll_support|` copies |

Do **not** reverse the 24 sole-copy org `|payout|CASH` rows ($678k) — they are the only cash record for those weeks.

Kenny Aug 3–9 stored week (until rebuild): cash **$84,172.52**, settlement **−$18,867.05**. After cleanup + rebuild: cash **$54,196.26**, fleet owes **~$11,109**, tips **$580 withheld**.
