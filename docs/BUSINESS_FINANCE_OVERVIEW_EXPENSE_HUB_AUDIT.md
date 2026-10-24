# Business Finance Overview + Expense Hub — Audit

**Rev 9 · 2026-10-24 · third verification · open items only**

Scope: Business Finance Overview, Expense Hub, and the sections that feed them. Rev 1–8 are in git history.

## 1. Where things stand

**Live and verified:**
- **Edge functions:** fleet-ops, fleet-core, fleet-fuel and fleet-pay were deployed 20:51 UTC.
- **Recon worker:** rev `00009` was deployed 20:54 UTC.
- **Migrations:** the `week_start` fix (`20261025180000`) and the week sides / Rush scope migration (`20261025181000`) are applied. Prod migration versions now match the repo.
- **Bill functions:** a rolled-back probe shows the payment function works again.
- **Week locks:** 32 weeks are locked (Jan 12 → Aug 31, plus Oct 12).
- **Uber Aug 3 / Aug 24:** these now equal the Uber file totals in the ledger (Aug 3 63,479.40; Aug 24 74,006.18). The duplicate promotion is reversed.
- **Tests:** 53/53 pass.

**Not done:**
- The latest changes (34 files) are **uncommitted**, mixed with Plug work.
- The fleet web app deploy is not verified.

## 2. Must fix

### 2.1 Fare reversals are only understood by Business Finance — High
- **How the Aug 24 fix was posted (observed):** 66 `fare_earning` rows with a **positive** amount and `metadata.reversal = true`.
- **Who reads them correctly:** only `recognizedFareGross` (Business Finance) flips the sign.
- **Who adds them as fares (observed in code):**
  - The Ledgers Statement Summary (`ledger_query_summary_routes.ts`: `netFare += net`).
  - `ledgerMoneyAggregate`.
  - Driver periods (`driver_financial_periods.ts`).

  The shared reader sets `netAmount` from `amount_minor` with no sign.
- **Effect:** those screens should now show Aug 24 Uber as ≈ **87,138.96** instead of 74,006.18. Aug 3 promotions should show 287.28 instead of 95.76. This is the expected result from the code; I didn't open the screens.
- **Do, one of:**
  - Post corrections as negative amounts (or as a `prior_period_adjustment`).
  - Make the shared reader negate `reversal: true` rows, so every reader agrees.

  Then check the Ledgers summary for Aug 24.

### 2.2 Paying a bill from a closed week is refused — High
- The pay route calls `post_expense_bill` first. That function checks the **bill's** week lock even when the bill already exists.
- **Observed** (rolled-back probe): re-posting the insurance bill (15 Oct, locked week Oct 12) returns `week locked`.
- **Effect:** the owner can't record payment of the $113,994.65 insurance bill, or of any older bill, even though the payment date (today) is open.
- **Do:** in `post_expense_bill`, return early if the bill id already exists, before the lock check. A lock should block new bills in closed weeks, not payments made today.

### 2.3 Payouts check reads the wrong column — Medium
- `svc_finance_week_sides.closed_owed` sums `driver_financial_periods.settlement_amount`, but that column drops to 0 once the driver is settled.
- **Observed (Oct 12):** closed owed is $0, paid is $17,183.53. The check will show red for every settled week.
- **Do:** read the amount owed from the sealed settlement statement, or from the period's amount before payment.

### 2.4 Locked weeks still have open Uber gaps — Medium (data)
Jul 13 −3,340.09 · Jul 20 −2,220.82 · Jul 27 −1,172.21 · Aug 10 +1,500.00 · Sep 28 −1,139.19 · Oct 5 −500.43 · others ≤ $440.

Jul–Aug are now **locked**, so they can only be fixed with a dated adjustment in an open week, or after an explicit unlock. Decide which.

## 3. Lower priority
- **Bank check needs a confirmation.** It shows "Not confirmed" until someone confirms a deposit in Bank Deposits. Oct 12 has none.
- **Old fuel rows have no organisation.** 332 `fuel_expense` rows still have `organization_id` NULL. The fix only covers new postings. Backfill them from the matching `fleet.fuel_entries`.
- **Bill backfill copied nothing.** It reads `expense_doc:%` from `kv_store`, which has 0 rows (Hub docs live in the fleet tables). Voids of old bills are now tolerated, but the bill book is still only 6 rows.
- **Nightly job and locked weeks.** If a rule has an unposted date inside a locked week, the job throws for that rule every night (`fixed_expense_post_failed`). Skip locked dates instead.
- **Small cleanups:** old Uber import metadata still has `periodStart = periodEnd`; rename Week Recon's "P&L tie"; Driver Settlements still needs its own audit.

## 4. Order
1. Commit the Business Finance files on their own.
2. §2.2 (early return in `post_expense_bill`), then probe a payment on the insurance bill.
3. §2.1 (fare reversal sign), then check the Ledgers summary for Aug 24 = 74,006.18.
4. §2.3 (payouts source).
5. Deploy the web app after the above, then open the Oct 12 Overview.
6. §2.4 decision, then §3.

**Done means:**
- The insurance bill can be paid.
- Aug 24 shows 74,006.18 on every screen.
- The Oct 12 Payouts check shows ✓.
- All six checks show ✓ or "Not confirmed" for a real reason.
