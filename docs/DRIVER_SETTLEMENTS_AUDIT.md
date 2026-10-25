# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 6 · 2026-10-25 · screen + toll fix built (uncommitted, NOT deployed) · step 1 ran on the old server**

Rev 1–5 are in git history. Money tools verified to the cent in Rev 4.

**Owner decisions:**
- Each period uses its own split.
- Dec 2025 – Jan 12 2026 is cleaned up once (write off or keep), with no recalculation.

## 1. Built and checked this round
- **Past weeks screen:** the old card is gone. In its place:
  - a slim banner on the page;
  - a 4-step overlay with a stepper and plain summaries;
  - wording that says who owes whom, with Kenny's name and `formatMoney`;
  - partial write-offs;
  - "Clean-up complete", which hides the banner.

  It matches the Rev 5 design.
- **Tolls:**
  - Reopening a week now also reopens its tolls.
  - The Tolls step shows "Tolls locked" and a **Reopen tolls** button (asks for a reason).
- **Tests:** the 15 new and related tests pass.

## 2. Must fix

### 2.1 Today's code is not live — High
- **fleet-pay** was deployed at **12:07 UTC**.
  - The partial write-off code was written at 13:59 and the status route at 17:45, both after that deploy.
  - The bundle was rebuilt at 14:00 but never deployed.
- **fleet-toll and fleet-core** bundles were last built yesterday.
  - So the toll seal check, the Reopen tolls button's server side and the week-reopen toll fix aren't in any bundle.
- **Sep 7 is still toll-locked.** It has a closed toll statement and no toll period row.
- **The banner hides the problem.** `ReconRunPage` treats a failed seal check as "not locked", so the 404 from the undeployed route hides the "Tolls locked" banner.

**Do:**
1. Rebuild and deploy fleet-pay, fleet-toll and fleet-core.
2. In `ReconRunPage`, show "Couldn't check tolls" instead of hiding the banner when the seal check fails.

### 2.2 Step 1 wrote off all six older weeks in full — High (money)
Step 1 was posted at **14:41 UTC**, against the old server, which ignores the write-off amount. Observed in prod:

| Week | Balance | Reason entered | Result |
|---|---|---|---|
| Dec 8 | You owed Kenny $5,586.73 | take loss | written off |
| Dec 15 | Kenny owed $13,623.48 | take loss | written off |
| Dec 22 | Kenny owed $24,221.01 | take loss | written off |
| **Dec 29** | Kenny owed $23,429.49 | **half loss** | **written off in full** |
| Jan 5 | Kenny owed $16,162.56 | take loss | written off |
| **Jan 12** | You owed Kenny $5,203.22 | **half loss** | **written off in full** |

- **Nothing was kept.** There are no legacy movements, and the Oct 19 week is unchanged at −$20,504.88.
- **Assumption:** "half loss" meant keeping half.
  - That would be Dec 29: Kenny owes $11,714.75 kept.
  - And Jan 12: you owe Kenny $2,601.61 kept.
  - Net: **Kenny owes $9,113.14**, which should be on the open week.
- **It can't be redone in the app.** The six weeks are now marked done, so step 1 no longer lists them.

**Do:**
1. Owner: confirm what "half loss" meant.
2. Deploy (§2.1).
3. Add a one-off way to post the kept part for already-written-off weeks: a `legacy-balance:` correction on the open week, with the amount in `legacyKeptAmount`.

**Also:**
- **Written-off amounts leave no movement row.** Kenny's $77,436.54 forgiven and your $10,789.95 dropped are only in week metadata.
- **Guard the order.** A server must reject request fields it doesn't understand, or the app must check the server version first. This is the second time a new screen has run against an old server.

## 3. Then, in order
1. Fix §2.2 for Dec 29 and Jan 12.
2. **Reopen tolls for Sep 7**, redo the $275 charge, then close Sep 7 → Oct 5 in order.
3. **Fuel corrections** (+$67,015.15 to Kenny, plus the Oct 12 −$13,191.88 line). Post them while **Oct 19 is the newest open week**.
4. **Missing payments** ($15,715.16 into the history; balances don't change).
5. **Commit** the settlement and toll files separately from the Plug work.

## 4. Minor
- **Toll lock check across service lines.** `probeTollPeriodSealed` reads `toll_reconciliation_period` with `maybeSingle()` and no service-line filter. If a week gets both a rideshare and a delivery row (week reopen can now create one), every toll write that week errors. Filter by line.
- **The Oct 12 −$13,191.88 has no movement row.** It's in correction lines only.
- **Migration history:** prod records `finance_period_locks_rls` twice.

## 5. Done means
- Every week's payments minus reversals equal what the week says was paid.
- Correction movements total +$67,015.15, and Oct 19 shows the Oct 12 line.
- The kept parts of Dec 29 and Jan 12 appear on the open week, or the owner confirms full write-off.
- No open week before the latest closed week.
