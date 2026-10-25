# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 3 · 2026-10-24 · verification of the owner's implementation · open items only**

Rev 1–2 (the full findings) are in git history.

**Owner decisions still in force:**
- Each period uses the split that was active then.
- Dec 2025 – Jan 12 2026 is cleaned up once (write off or carry), with no recalculation.

## 1. Where things stand

**Done and verified:**
- **Policy routes:** need login + `fuel.configure`, are scoped to the company, log every change, and archive instead of deleting.
- **Policies in prod:** your 3 policies are stamped with your company; the other 2 companies each have their own Standard.
- **Closed weeks:** all 8 settlement money routes refuse closed and finance-locked weeks.
- **Dual approval:** finalize takes the threshold and spend from the server. A one-owner company is detected on the server and the acknowledgement is logged. The settings have their own key and a change log.
- **Settlement approvals:** self-approval is blocked when a second approver exists.
- **Rule cards:** show what drivers are charged, and "applies to new periods only".
- **Schedule:** gaps are flagged, and the "last week included" label is fixed.
- **Engine:** open weeks include posted corrections, which aren't folded into cash held.
- **Close order:** closing a week is blocked while an earlier week is open (override needs a reason).
- **Cleanup:** the admin/driver duplicate settlement maths and the dead fuel engine are removed.
- **Deploy:** fleet-core, fleet-fuel and fleet-pay were deployed after the last edit. The migration is applied.
- **Tests:** finance-core and policy tests pass (345 of 345).

**Not done:**
- **All of this is uncommitted:** 68 files, mixed with Plug work.
- **None of the three one-off tools has been run in prod** (0 new movements): corrections, legacy clean-up, payout backfill. Two of them must be fixed first (§2.1, §2.2).

## 2. Must fix before running the tools

### 2.1 The correction tool undercounts August by $17,519.20 — High
- **How it computes today:** `settlement_corrections.ts` uses `driver-paid fuel − sealed company share`.
- **Why that's wrong for August:** August's settlement was frozen with the *old* period figures, and the driver share was restated as well. So the true difference is the full rebuild of the week minus the stored settlement.
- **Jan 19 – Jul 27 and Aug 31** match.

| Week | Tool | Full rebuild (correct) | Short by |
|---|---|---|---|
| Aug 3 | −289.56 | −7,040.65 | −6,751.09 |
| Aug 10 | −13,480.68 | −19,810.51 | −6,329.83 |
| Aug 17 | −6,718.07 | −12,116.67 | −5,398.60 |
| Aug 24 | −29,691.78 | −28,731.46 | +960.32 |

- **Do:** compute each week's correction as `rebuild − stored settlement_amount`, using the same rebuild as the audit (its own split, credit = driver-paid fuel). Preview first; the Jan 19 → Aug 31 net should be **+$67,015.15** to the driver.

### 2.2 The payout backfill doubles the Jun 15 error — High
- **The problem:** Jun 15 already has a $2,565.44 *reversal* with no matching payment. `settlement_payout_backfill.ts` adds **another reversal**, so the movement total would drop to $1,889.62 when it should be $7,020.50.
- **Do:** backfill the missing **payment** of $2,565.44 (the one that was reversed), not a reversal. After running, `pay − reverse` should equal `settlement_paid` in every week.

### 2.3 You can't change Kenny's split going forward — High
- **What's blocked:** High Performer's window runs open-ended from Apr 6, so it covers closed weeks Apr 6 → Oct 12.
  - Any edit to that window is refused with 409 ("covers a closed week"), including just giving it an end date.
  - Adding a new window for Kenny from next Monday collides with it (400).
- **Do:** allow changes that only touch open weeks. For example, setting an end date on or after the first open week is fine, as long as the closed part of the window is unchanged.

## 3. Then run, in this order
1. **Legacy clean-up** (Dec 8 → Jan 12): choose write-off or carry per week. Until this runs, the new close-order blocker stops later weeks closing without an override.
2. **Finalise fuel and close Sep 7 → Oct 5 in order.**
3. **Corrections** (after §2.1). This also turns the Oct 12 $13,191.88 receivable into a correction line.
4. **Payout backfill** (after §2.2).
5. **Commit** the settlement/policy files on their own.

## 4. Lower priority
- **Locked-week dates are visible across companies.** `public.finance_period_locks` is readable by any signed-in user of any company (the base table has no RLS). It's only dates, but it crosses companies; add an org filter or revoke `authenticated`.
- **"Is there a second approver?" counts the wrong people.** `anotherApproverExists` counts any company user in `platform.user_roles` (0 rows today), not people who can approve. Confirm it's the table your team members live in, and count only approvers.
- **The browser can still lower total spend in one path.** The fuel materialize step still falls back to the browser's `totalSpend` when snapshots are missing, and that value later feeds the approval gate. Refuse instead.
- **Migration name mismatch.** The migration file `20261024213000_…` is recorded in prod as `20261025000401`. Rename it so a fresh replay matches.

## 5. Done means
- `pay − reverse` = `settlement_paid` for every week.
- The posted corrections sum to +$67,015.15 (Jan 19 → Aug 31) plus −$13,191.88 (Oct 12).
- No open week before the latest closed week, except legacy-marked ones.
- An end date can be set on Kenny's current window from the next open week.
