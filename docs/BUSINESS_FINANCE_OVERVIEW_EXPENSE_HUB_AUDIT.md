# Business Finance Overview + Expense Hub — Audit

**Rev 7 · 2026-10-24 · verification of the owner's implementation · open items only**

Scope: the Business Finance Overview, the Expense Hub, and how Bank Deposits, Week Reconciliation, Driver Settlements, Courier Settlements, InDrive Wallet and Ledgers feed them. Earlier revisions (Rev 1–6) are in git history.

## 1. Where things stand

The **code** for most fixes is in and its tests pass (61 vitest + 9 Deno). The edge functions were redeployed on 2026-10-24.

Three things stop this from being "done":

1. **Old data was not corrected.** The fuel and Uber fixes only apply to new uploads, so every past week still has the wrong numbers (§3.1, §3.2).
2. **Recurring bills will stop posting.** Saving a rule now writes bills only up to today, and nothing posts the next bill when it falls due (§3.3).
3. **The bigger rebuild hasn't started.** The Expense Hub v2 migration isn't applied, nothing reads it yet, and Business Finance still doesn't read from Week Reconciliation, Driver Settlements or Rush (§4).

**All of it is uncommitted** (136 changed files, mixed with Roam Plug and maps work). Commit the Business Finance set on its own before going further.

## 2. Verified done (not repeated below)

- **Access**
  - `expenses.*` permissions are back.
  - The server imports the shared catalog.
  - A parity test covers both.
  - The Hub page is gated.
- **Expense Hub writes**
  - "Paid now" works.
  - Owner self-approval is decided by the server and labelled.
  - Void posts a reversal.
  - Overpayment is refused and payments are idempotent.
  - Another org's id returns 404.
  - Renew and reverse-occurrence actions exist.
- **Fixed costs**
  - The end date no longer bills a second year.
  - The GPS 15 Oct row is reversed in production.
  - Saving a rule no longer writes future rows.
- **Settlement (X-13)**
  - Fuel finalize credits only driver-paid fuel.
  - Pay must equal the closed statement.
  - The **$13,191.88** is booked on Kenny's Oct 19 week.
- **Overview**
  - It foots, and the fees / commission / other income rows are shown.
  - Profit shows "Unavailable" when the ledger fails.
  - The error banner is structured and reappears on new errors.
  - The period is in the URL and carried to the Hub.
  - Service-line scope reaches driver periods.
  - High-cash drivers are counted once each.
  - Health counts are labelled "all time".
  - The "Other" card no longer double-counts.
- **Imports, for new uploads only**
  - Promotions are not added twice.
  - Cancellation fees count as earnings.
  - Aug 3 / Aug 24 are held on import.
  - Gas-card uploads dedupe by card + day + amount + upload.
  - "Reimbursement" cash fills get a ledger row.
- **Bank and Ledgers**
  - Nil-driver "so.payout" lines are ignored as deposits.
  - The Ledgers Statement Summary adds bank and cash rows instead of overwriting them.

## 3. Must fix now

### 3.1 Fuel ledger history is still wrong — High (data)
Production ledger `fuel_expense` vs `fleet.fuel_entries` (Manual_Entry excluded):

| Week | Ledger − records |
|---|---|
| Aug 3 | **+$18,404.80** |
| Aug 10 | **+$21,088.80** |
| Aug 17 | −$5,000.00 |
| Aug 24 | −$7,000.00 |
| Aug 31 | −$4,000.00 |
| Sep 7 | −$4,000.00 |
| Sep 14 | **+$27,000.00** |
| Sep 21 | −$1,000.00 |
| Oct 12 | −$1,500.00 |

- **Oct 12–18 is not fixed:**
  - The duplicate card row `03807df5` ($4,000, floating, no odometer) is still in **both** `fleet.fuel_entries` and the ledger.
  - The Buds cash fill `1b4ed81c` ($1,500) still has no ledger row.
  - Ledger fuel is still $21,500; the real figure is $19,000.
- **Do:**
  1. Remove the duplicate fuel entries.
  2. Post the missing cash fills.
  3. Rebuild ledger fuel rows for every week from the reconciled fuel records.
  4. Check each rebuilt week against its closed fuel statement.

### 3.2 Uber earnings history is still wrong — High (data)
Ledger Uber earnings vs Uber's real total (org deposit + cash − toll refunds). This formula matches both Uber screenshots to the cent.

| Week | Ledger vs Uber |
|---|---|
| Jul 13 | −$3,340.09 |
| Jul 20 | −$2,220.82 |
| Jul 27 | −$1,172.21 |
| **Aug 3** | **−$34,956.66** |
| Aug 10 | +$1,500.00 |
| Aug 17 | −$52.50 |
| **Aug 24** | **+$6,447.50** |
| Aug 31 | −$178.50 |
| Sep 7 | −$437.68 |
| Sep 14 | −$163.42 |
| Sep 21 | −$262.50 |
| Sep 28 | −$1,139.19 |
| Oct 5 | −$500.43 |
| Oct 12 | −$52.50 |

- The cancellation-fee fix only applies to new imports.
- **Do:**
  1. Re-import each week, or post adjustments.
  2. Get the Uber statements for Aug 3 and Aug 24 before touching those two weeks.
  3. Recompute driver share for **open** weeks. Restate closed weeks only by decision.

### 3.3 Recurring bills stop posting — High (regression)
- `projectFixedExpenseFromAssignment` now posts only up to today (`expense_hub_routes.ts:146`). No scheduled job posts later due dates; the only nightly finance jobs are recon/doctor, and neither touches fixed costs.
- Effect: a monthly or yearly bill that comes due next month never reaches the P&L unless someone edits the rule or presses "Sync historical".
- **Do:** a nightly job that runs `appendCanonicalFixedExpenseIfEligible` through today for every active rule. It's idempotent, so re-running is safe.

### 3.4 Insurance renewal not entered, and "Renew" would double-book it — High
- The insurance rule still says 15 Oct 2025 → 15 Oct 2026.
- The real renewal bill ($120,504.08 on 15 Oct 2026) is already in the ledger from the old rule.
- Pressing **Renew** with the default dates starts cover on 16 Oct and posts **another** $120,504.08.
- **Do:**
  1. Renew with start **2026-10-15**, end **2027-10-14**, and the new premium.
  2. Then use **reverse-occurrence** on the *old* rule for 2026-10-15.
- **Code fix:** `renewalCoverage` sets end = start + 1 term, a 366-day cover that overlaps the next renewal. It should be start + term − 1 day.
- When Amber GPS renews, use Renew the same way.

### 3.5 Future Fitness rows still in the ledger — Medium (data)
- Three `fixed_expense` rows dated 2028-08-24, 2029-08-24 and 2030-08-24 ($4,500 each) were written by the old 5-year horizon.
- **Do:** reverse them; the nightly job (§3.3) will post them when due.

### 3.6 Overview "Fuel charged to the company" is not the company share — High
- It uses `pnl.fuelBreakdown.fleetLoss`, which only nets `fuel_charge_offset` events.
- The driver's fuel share from settlement (Oct 12: $1,808.12) is never netted, so profit still subtracts full pump spend.
- **Do:** for closed weeks, take the company share from the sealed fuel statement (Oct 12: $17,191.88); for open weeks, from the fuel engine.

### 3.7 Driver payouts still show $0 — High
- Business Finance still reads `driver_payout` ledger events. No code writes them.
- Payouts live in `settlement_movements`: 28 payouts, **$128,768.71** since 6 Sep.
- The Cash view therefore never subtracts what drivers were paid.
- **Do:** read payouts and collections from `settlement_movements`.

### 3.8 "Does this week agree?" only checks Business Finance against itself — High
- The card shows footing, pump vs company fuel, and bank received vs expected. All three are Business Finance's own numbers.
- "Week status" is hard-coded to "Provisional".
- None of the cross-section checks exist yet:

| Check | Compare against |
|---|---|
| Revenue | sealed earnings |
| Fuel | sealed fuel statement |
| Tolls | sealed toll statement |
| Payouts | `settlement_movements` |
| Bank expected | Bank Deposits |
| Statement Summary | Ledgers |

- The helpers exist but nothing uses them: `tieOut`, `uberEarningsTie` and `fuelLedgerDrift` in `businessStatement.ts`.
- **Do:** wire those six checks, and show "Closed" when the week's statements are sealed.

### 3.9 The $13,191.88 shows as "cash held" — Medium
- The receivable was booked as `openingCashCustody`, so Kenny's Oct 19 "cash still held" reads $23,491.88: $10,300 of real fare cash plus the $13,191.88 overpayment.
- On the Overview and in Driver Balances it looks like cash he's carrying.
- **Do:** show it as a separate "Owed by driver (overpaid Oct 12)" line. The note text exists (`fuelCreditNote`), but the amount is still inside cash held.

## 4. Rebuild work not started

| Item | State | Note |
|---|---|---|
| Expense Hub v2 tables + posting functions | Migration `20261024193000` written, **not applied**. Routes still use the KV shim, and nothing calls `post_expense_bill` / `record_expense_payment`. | Writes are still non-transactional; the overpay check is not atomic |
| Spread yearly costs over cover (accrual) | `recognise_coverage_through_today` exists in the unapplied migration, but nothing writes `expense_coverage_periods` and Business Finance doesn't read `finance_period_lines`. `amortisedPrepaid` is unused. | Insurance still hits one week in full |
| Amortisation details to fix before applying | Daily rounding drifts: $120,504.08 ÷ 366 → 329.25 × 366 = $120,505.50. Service line is hard-coded `rideshare`. The drift check compares the formula with itself, so it can't fail. | Put the remainder on the last day; store the service line; check against the bill instead |
| Period locks | No check on Hub posting or rule edits; `week_close_locks` has 1 row ever | Use closed statements + period status |
| Rule edits rewrite history | `projectFixedExpenseFromAssignment` still deletes all ledger rows for the rule before re-posting | Renew avoids it; editing doesn't |
| Closed weeks as the source (X-01) | Business Finance still re-derives everything from the raw ledger | See §3.6–3.8 |
| Rush + courier money (X-06) | Business Finance doesn't read `rush_money` or COD | |
| Toll tag top-ups (X-07) | Still written twice (`tag_top_up` + `toll_top_up`); not shown as a transfer | |
| One read model / endpoint | Not built | Do after §3 |

## 5. Lower priority

- **Fuel dedupe can merge two genuine fills.** Card + day + amount + upload will merge two real identical fills (e.g. two $4,000 fills in one upload). Add litres or time to the key.
- **Bad import metadata stays.** Uber import metadata still carries `periodStart = periodEnd` (e.g. 2026-10-19 for the Oct 12 week). The new code works around it; existing rows are still wrong.
- **Other apps keep their own settlement math.** The admin and driver apps have separate copies (`cashSettlementCalc.ts`, `buildLedgerPayoutPeriodRows.ts`). Confirm drivers see the corrected Oct 12 figures.
- **InDrive wallet loads** are computed in two places (Business Finance client vs Wallet Center server).
- **Week Recon's "P&L tie"** is a driver-lane contribution, not a P&L. Rename it.
- **Driver Settlements** still needs its own full audit. It's the only place money left the business wrongly.

## 6. Order

| # | What | Type |
|---|---|---|
| 1 | Commit the Business Finance changes separately | ops |
| 2 | Nightly fixed-cost posting job | code |
| 3 | Enter the insurance renewal (start 2026-10-15) + reverse the old 2026-10-15 occurrence; fix the `renewalCoverage` end date | data + code |
| 4 | Clean fuel data: Oct 12 duplicate + Buds fill, then rebuild all weeks | data |
| 5 | Uber re-import / adjust; Aug 3 + Aug 24 with statements | data |
| 6 | Reverse the 2028–2030 Fitness rows | data |
| 7 | Overview: company fuel share, payouts from `settlement_movements`, receivable as its own line | code |
| 8 | Wire the six cross-section checks + "Closed" status | code |
| 9 | Fix and apply the v2 migration; move the Hub onto it; switch to accrual spread | code |
| 10 | Period locks, no-delete rule edits, Rush/COD, toll top-ups, read model | code |

**Done means** (each one checkable with a single SQL query):
- Every week's fuel ledger equals the fuel records.
- Every week's Uber ledger equals org deposit + cash − refunds.
- The Oct 12–18 Overview shows ≈ **+$19,900** operating profit.
- All six cross-section checks show ✓.
