# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 11 · 2026-10-26 · money correct · Sep 7 tolls blocked by a double count on screen**

Rev 1–10 are in git history. Kenny's Oct 19 week still reads **+$37,397.13** (you owe Kenny). The Rev 10 fixes are live: fleet-toll was deployed at 13:00 UTC, the spend rule, `org_default`, and one active offset per tag toll.

## 1. Left

### 1.1 Sep 7 Tolls: "Money cards do not reconcile — $550" — Medium (blocks the close)
**Observed:**
- **Spend counts two tolls twice.** Toll Spend shows $4,145 = Uber $3,045 + Roam $550 + **Unlinked $550**. The two personal tolls (Sep 11 `090bd599…`, Sep 12 `ea0380fb…`, $275 each) are counted twice.
- **The database is fine.** It has 11 toll rows for the week and no duplicates.

**Root cause:** the same toll is returned by both lists the wizard adds together.
- `GET /unreconciled` (`toll_controller.tsx` L1991) keeps `!isReconciled || !tripId`.
- `GET /reconciled` (L2496) keeps `isReconciled`.
- A personal toll charged to the driver is reconciled **and** has no trip, so it matches both. Its unreconciled copy shows as Roam and its reconciled copy as Unlinked.
- `ReconciliationWizard.tsx` L894 and L903 build `[...pUnreconciled, ...pReconciled]` with no de-duplication.
- This was hidden until this round, because the old spend rule dropped these tolls.

**Correct week:** spend $3,595 − reimbursed $3,045 − charged $550 = **$0**. The server's event tally is also $0, so de-duplicating closes the gap.

**Fix (owner implements):**
1. De-duplicate by toll `id` where the two lists are merged. That's both places in the wizard, and any other screen that concatenates them.
2. Or change `/unreconciled` to `!isReconciled || (!tripId && !resolution)`, so a resolved personal toll lives in one list only.
3. Add a test: one resolved personal toll with no trip gives spend = its amount once.

### 1.2 The two personal charges have no ledger events — Low
- There are no `toll_charge` events for the two GPS tolls, and no `toll_charged_to_driver` events for the two charges.
- They cancel each other out ($550 spend, $550 recovered), so the check isn't affected. But the Business Finance P&L Tolls line misses both.
- **Do:** backfill the four events once. New charges should write them from now on.

### 1.3 Close Sep 7 → Oct 5 — Medium
- All five weeks are still open. Oct 12 after them is closed.
- **Don't force them closed in the database.**
- **Do:** after §1.1, close Sep 7, Sep 14, Sep 21, Sep 28, then Oct 5, logging only cash really received. After each close, Oct 19 must still read +$37,397.13.
- **Before closing each later week:** check it for the same issues. Per toll, offsets minus reinstates should be ≤ 1, and no personal toll should be counted twice.

## 2. Done (summary)
- Balance fix, corrections, halves, payments backfill, write-off rows ([script](../supabase/scripts/legacy_write_off_record.sql)).
- Sep 7 service line, duplicate "reimbursed" notes, and the spend rule for charged personal tolls.
