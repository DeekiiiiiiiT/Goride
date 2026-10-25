# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 4 · 2026-10-24 · code CLOSED · data clean-up left (owner runs the tools)**

Rev 1–3 (full findings) are in git history.

**Owner decisions still in force:**
- Each period uses the split that was active then.
- Dec 2025 – Jan 12 2026 is cleaned up once (write off or carry), with no recalculation.

## 1. Verified this round (commit 852a1929, deployed 00:58 UTC 10-25)
- **Correction tool:** the preview, recomputed from prod, matches the audit exactly.
  - Aug 3 −7,040.65 · Aug 10 −19,810.51 · Aug 17 −12,116.67 · Aug 24 −28,731.46
  - Jan 19 → Aug 31 net **+$67,015.15**
  - The Oct 12 receivable of $13,191.88 is found.
  - It refuses to post if any of these don't match.
- **Payout back-fill:** it now records the missing Jun 15 payment. Its pre-check passes on prod data: after it runs, `pay − reverse = settlement_paid` in every week.
- **Kenny's split:** an end date can be set on the open window, as long as the closed weeks keep the same split. Tests cover this.
- **Small items:**
  - Lock dates are no longer readable by signed-in users, and the base table has row security.
  - The approver check counts only owner, manager and accountant seats in your company. For your company today the owner is the only approver.
  - Fuel totals are refused if the snapshots are missing, instead of trusting the browser.
  - The migration file name now matches prod.
- **Tests:** the 30 new tests pass.

## 2. Left to do (data, in this order)
1. **Legacy clean-up:** Dec 8, 15, 22, 29 and Jan 5 are still open. Choose write-off or carry for each.
2. **Finalise fuel and close Sep 7 → Oct 5 in order.** They're open while Oct 12 is closed.
3. **Run corrections:** preview, then confirm.
   - Run it while **Oct 19 is the newest open week**. The Oct 12 $13,191.88 is held on the Oct 19 row, and the tool only converts it when it posts to that same week.
   - If the Oct 26 week already exists, the $13,191.88 stays as cash held. It's still counted, just not shown as a correction line.
4. **Run the payout back-fill:** preview, then confirm.
5. **Check:** no posted correction or back-fill movements exist yet (0 and 0). After step 4, re-run the §4 checks.

## 3. Minor (non-blocking)
- **The Oct 12 −$13,191.88 has no movement row.** It goes into the open week's correction lines but not into `settlement_movements`. The movement log will total +$67,015.15, not +$53,823.27.
- **Migration history:** prod records `finance_period_locks_rls` twice (20261025005733 and 20261025210000); the repo has one file. Replay is harmless, but tidy it.
- **Generated bundle:** `supabase/functions/fleet-pay/index.ts` is modified but uncommitted. Commit it with the next deploy.

## 4. Done means
- `pay − reverse` = `settlement_paid` for every week.
- Correction movements total +$67,015.15, and the Oct 19 week shows the Oct 12 −$13,191.88 line.
- No open week before the latest closed week, except legacy-marked ones.
