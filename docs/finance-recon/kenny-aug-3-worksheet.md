# Kenny Aug 3–9 2026 — reconciliation worksheet

**Filled:** 2026-08-18 from live `ledger.driver_financial_periods` + `ledger.entries` + `fleet.trips`.
**Driver:** Kenny Gregory Rattray (`73e5b1dc-01b4-45ee-a34a-25a3256b9841`)

## Engine A snapshot (Settlements desk)

| Line | Value |
|---|---|
| Gross (earnings_gross) | 88,375.16 |
| Tips (Uber tip events in week) | 580.00 |
| Cash collected (projection) | **84,172.52** |
| Cash returned | 16,000.00 |
| Fuel fleet share | 25,887.89 |
| Fuel deduction | 1,412.11 |
| Toll cash spend | 1,720.00 |
| Toll charged to driver | 595.00 |
| Cash still held | 41,159.63 |
| Payout net | 22,292.58 |
| Settlement | **−18,867.05** (driver_owes) |

## Trip physical cash (abs cashCollected)

| Platform | Cash |
|---|---|
| Uber | 29,976.26 |
| InDrive | 13,720.00 |
| Roam | 10,500.00 |
| **Trip total** | **54,196.26** |

## Why Settlements is $84,172.52

Two `payout_cash` rows dated 2026-08-04 for **the same $29,976.26**:

1. Tagged to driver `52ff47da-…` (not Kenny’s roam id) with periodStart 2026-08-10
2. Untagged (`driverId` null, `platform` null)

Rebuild summed both, then added InDrive + Roam trip cash:

`29,976.26 × 2 + 13,720 + 10,500 = 84,172.52`

## Why Overview is $55,147.05

CSV Uber cash **$30,927.05** + InDrive $13,720 + Roam $10,500 = **$55,147.05**.

Gap vs Settlements: **$29,025.47** — exactly one extra copy of Uber cash plus a $950.79 CSV vs trip difference.

## D1 decision applied

Authoritative Uber cash = **one** ledger `payout_cash` posting per week after de-dupe = **$29,976.26**.

Correct passenger cash for this week:

`29,976.26 + 13,720.00 + 10,500.00 = 54,196.26`

CSV $30,927.05 disagrees by **$950.79** — that must show as a warning, not overwrite.

## Recalculated settlement (same fuel/toll/returned; corrected cash)

Still held = 54,196.26 + 595 − 16,000 − 25,887.89 − 1,720 = **11,183.37**
Settlement = 22,292.58 − 11,183.37 = **+11,109.21** (fleet owes Kenny), before the tip-quota gate.

Tips $580: week gross+tips is below a $100,000 quota, so tips stay with the fleet.
