# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 9 · 2026-10-25 · money correct · 3 items left (close weeks, two write-off rows, commit)**

Rev 1–8 are in git history.

The balance fix is live: fleet-pay and fleet-core were deployed at 22:35 UTC. Kenny's Oct 19 week now reads **+$37,397.13** (you owe Kenny), and its statement (v28) agrees. Sep 7's tolls are sealed again.

## 1. Left

### 1.1 Close Sep 7 → Oct 5 — Medium
- All five weeks are still `open`, while Oct 12 after them is closed.
- Sep 7's tolls are sealed, so that week can close now.
- **Do:** close Sep 7, Sep 14, Sep 21, Sep 28, then Oct 5.

### 1.2 Two write-off rows record the full balance, not the half that was forgiven — Low (records only)
The new `legacy-write-off:` movement rows were inserted at 22:34 UTC by SQL that isn't in the repo. Two of them ignore the half that was kept:

| Week | Row says | Kept (already posted to Oct 19) | Should say |
|---|---|---|---|
| Dec 29 | −$23,429.49 | −$11,714.75 | −$11,714.74 |
| Jan 12 | +$5,203.22 | +$2,601.61 | +$2,601.61 |

- **Balances are not affected,** because nothing adds these rows into a balance. But the movement history counts the kept halves twice.
- **The totals are overstated.** Forgiven is really **$65,721.79**, not $77,436.54. Dropped is really **$8,188.34**, not $10,789.95.
- **Do:**
  1. Correct those two rows, or add offsetting rows.
  2. Save the SQL as a file under `supabase/scripts/` so the record can be rebuilt.

### 1.3 Commit — Low
The balance fix and the driver/fleet app changes are uncommitted: `driver_financial_periods.ts`, `driverPeriodSettlement.ts`, `legacy_weeks.ts`, the bundles and apps. That's 53 files, mixed with Plug and Ledgers work. Commit the settlement files on their own.

## 2. Done means
- No open week sits before the latest closed week.
- The write-off rows total −$65,721.79 / +$8,188.34.
- The settlement fix is committed.
