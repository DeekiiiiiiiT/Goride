# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 25 · 2026-10-27 · §1–§4 shipped in code · deploy fleet-fuel + fleet-pay + fleet UI · then close Sep 14 → Oct 5**

Rev 1–24 are in git history. Rev 24 found the four blockers. This revision records the fixes.

> **Next action:** deploy `fleet-fuel` + `fleet-pay` + fleet web. Then close Sep 14 → Sep 21 → Sep 28 → Oct 5 with Settle from balance against Oct 19.
> Still owner-side: add the `GCP_RECON_*` GitHub secrets, and check Oct 19 = +37,397.13 after the 01:12 UTC nightly before netting.

## 1. Fuel step is blank: "This week is no longer on the list" — Fixed
**Fix shipped:** `isHollowOpenFuelPeriodRow` is hollow only when never prepared (`!computedAt` + $0 + 0 vehicles). Prepared open weeks with $0 spend stay on the landing list as `in_progress`.

## 2. Unusual-fill check splits one fill into pieces — Fixed
**Fix shipped:** `weekHasUnreviewedImplausibleFills` / `listUnreviewedImplausibleFills` collapse rows into stops by `fillGroupId`, else `jaaReceiptNumber`. Split stops use `splitPumpTotal` / `splitPumpLiters`; card+log pairs use one amount/liters. Duplicate odometer compares stops, not rows. Sep 21 false positives covered by tests.

## 3. No way to accept a genuinely unusual fill — Fixed
**Fix shipped:**
- `POST /fuel/periods/:id/implausible-fills/accept` (`fuel.finalize`, note 8+) writes `implausible_fills_reviewed_at` + note + audit.
- Closable payload includes `implausibleFills` stop list.
- Finalize blocked card shows **Accept unusual fills** with reason box.
- Reopen clears the implausible review stamps.

## 4. A week where the driver owes can only close with cash — Fixed
**Fix shipped:**
- `POST /settlements/settle-from-balance` posts linked `correction` movements with shared `offsetId` (+X on owing week, −X on credit week) through `postedAdjustments`.
- Refuses frozen weeks, oversize X, and duplicate idempotency.
- Settlement preview: **Settle from balance** beside Collect.
- Expected after netting all four weeks: Oct 19 → **11,084.45** owed to Kenny.

## 5. Checked and clear (no action)
- **Tolls:** finish seals and refreshes blockers. All four weeks have no duplicate offsets and every toll has a service line.
- **Tag account:** complete on Sep 14.
- **Fuel "reviewed" marks:** leakage, odometer chain, fills without odometer, data-quality reviews and stop-to-stop accepts each have a writer.
- **Declined swipes:** excluded from spend, the gap note and the unusual-fill check.
- **Not yet exercised (will check when reached):** the Trips & earnings auto-seal of the draft earnings statement (`EARNINGS_STATEMENT_UNVERIFIED`), and the Close step itself.

## Close runbook (after deploy)
For each week **Sep 14 → Sep 21 → Sep 28 → Oct 5**:
1. Fuel wizard opens the week (§1)
2. Work Fuel → Trips → Tolls → Settlement as usual
3. If Finalize blocks on unusual fills: Accept with reason (§2/§3)
4. Settlement preview: **Settle from balance** against Oct 19 for the full driver-owes residual (§4)
5. Close when residual is 0
6. Confirm Oct 19 fleet-owes dropped by that week’s amount

After all four: Oct 19 should show **11,084.45**. Pay that with normal Pay when ready.
