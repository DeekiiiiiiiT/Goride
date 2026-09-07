# Toll Tag Spend Inflation — Root Cause Audit

**Reported:** Aug 10 – Aug 16, 2026 shows **Tag Tolls $13,120.00** on the driver Expenses screen — visibly out of line with every other week.
**Driver:** `73e5b1dc-01b4-45ee-a34a-25a3256b9841` · **Org:** `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`
**Date:** 2026-09-07
**Mode:** Diagnosis was read-only. Aug 10 orphan repair **was applied in production** (see §6.6 / remediation doc). **Audit §10 remains open:** Expenses still counts quarantined/voided `toll_usage` that Toll Recon excludes (~$116k fleet-wide) — remediated via reverse-on-quarantine restatement + eligibility close blockers.

---

## 1. Answer in one paragraph

The number is inflated by **exactly $8,500.00**. The week's real toll spend is **$5,260** (tag $4,620 + cash $640); the screen shows **$13,760** (tag $13,120 + cash $640). The cause is **24 orphaned `toll_usage` rows in `financial_events`** whose `source_id` points at toll-ledger rows that **no longer exist**. Something deleted or re-keyed those toll ledger rows without reversing their financial events, and the driver-period projection sums **events**, not the ledger — so the deleted tolls are still being counted.

**Blast radius: this is the only affected period in the entire database.** I checked every week for every driver. No other period has a single orphaned toll event.

**Driver money is not affected.** All 24 orphans are `tag_balance`, and the settlement formula never consumes tag spend. The driver's balance for that week is correct. What *is* wrong is the fleet's own books: the sealed toll statement for that week records a **Net Toll Loss of $8,500 when the true figure is $0.00**.

---

## 2. The evidence

### 2.1 What the ledger actually holds

`fleet.toll_ledger` for that driver, Aug 10–16 — **15 rows, $5,260**:

| Date | Rows | Payment | Amount |
|---|---|---|---|
| Aug 10 | 2 × 370 | tag_balance | 740 |
| Aug 11 | 2 × 370 | tag_balance | 740 |
| Aug 12 | 370 + 275 | tag_balance | 645 |
| Aug 13 | 4 × 370 | tag_balance | 1,480 |
| Aug 14 | 370 + 370 + 275 | tag_balance | 1,015 |
| Aug 15 | 350 + 290 | **cash** | 640 |
| | | **tag total** | **4,620** |
| | | **cash total** | **640** |
| | | **true spend** | **5,260** |

Note $4,620 — that is *exactly* the `toll_reimbursed` figure already stored on the period. The reimbursement side was computed from the real tolls and is correct.

### 2.2 What the projection counted

```sql
select count(*), sum(abs(amount_minor))/100.0
from financial_events
where driver_id = '73e5b1dc-…' and period_anchor = '2026-08-10'
  and event_type = 'toll_usage' and reversed_at is null and reverses_event_id is null;
-- 39 rows, 13760.00
```

**39 events, $13,760** — versus 15 real tolls, $5,260.

### 2.3 The 24 extra events are orphans

Every event has a distinct `source_id` and a distinct `idempotency_key`, and each appears exactly once. **This is not an idempotency failure.** The difference is referential:

| | Events | Amount |
|---|---|---|
| `source_id` **exists** in `fleet.toll_ledger` | 15 | $5,260 |
| `source_id` **missing** from `fleet.toll_ledger` | **24** | **$8,500** |

The orphans are 20 × $370 + 4 × $275 = **$8,500** — precisely the discrepancy. All 24 carry `payload.paymentMethod = "tag_balance"`.

### 2.4 Reconciliation

```
Screen tag      13,120
True tag         4,620
                ───────
Orphan tag       8,500  ✓ matches orphan event total exactly

Screen total    13,760  =  4,620 + 8,500 + 640
True total       5,260  =  4,620 + 640
```

Cash ($640) is correct — both cash tolls exist in the ledger and neither is orphaned.

---

## 3. Why it happened

### 3.1 The projection reads events, not the ledger

`supabase/functions/_fleet-server/driver_financial_periods.ts`

The toll-ledger loop is **skipped entirely** when the events flag is on:

```ts
const useTollEvents = projectionReadsEventsForTolls();

for (const tx of weekTolls) {
  if (!useTollEvents) {          // ← ledger path disabled
    tollSpend += amt;
    if (cash) tollCashSpend += amt; else tollTagSpend += amt;
  }
  …
}
```

and replaced by a pure event scan:

```ts
if (useTollEvents) {
  for (const ev of activeFinEvents) {
    if (String(ev.event_type || "") !== "toll_usage") continue;
    const amt = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    tollSpend = round2(tollSpend + amt);
    if (cash) tollCashSpend = round2(tollCashSpend + amt);
    else      tollTagSpend  = round2(tollTagSpend  + amt);
  }
}
```

There is **no check that `ev.source_id` still resolves to a live toll row.** An event whose toll was deleted keeps posting spend forever.

### 3.2 Deleting a toll does not reverse its event

`financial_events` supports reversal properly — `reverses_event_id` and `reversed_at` are honoured by the projection's `activeFinEvents` filter. The mechanism exists and works.

What is missing is a **caller**: no toll-delete, period-reset or re-import path reverses the `toll_usage` events belonging to the rows it removes. The events are simply abandoned. That is why all 24 orphans are still `reversed_at IS NULL`.

This is the same shape as **H-3** in `RECONCILIATION_SYSTEM_AUDIT.md` — fuel reversal used `kv.del` and destroyed its audit trail — except here the row is removed on one side and the money event is left standing on the other.

### 3.3 Nothing could have caught it

This is the important part, and it is a genuine gap in the Pass 5 integrity loop:

| Control | Reads | Would it catch this? |
|---|---|---|
| `computeTollWeekNetting` | canonical events | ❌ same poisoned source |
| `sealTollWeek` | events / `financial_events` | ❌ same poisoned source |
| Pass 5 statement ↔ engine compare | statement (from events) vs engine (from events) | ❌ **both sides agree, both are wrong** |
| `closeInvariants` toll lane | statement vs projection (also from events) | ❌ same |
| `periodInvariants.toll_spend_split` | `toll_spend` vs `cash + tag` | ❌ split is internally consistent |

**Every control in the toll lane reads `financial_events` or canonical events. Not one of them reconciles against `fleet.toll_ledger`, which is the operational source of truth for what actually happened at a plaza.**

The Pass 5 work correctly moved the check upstream from *projection vs statement* to *statement vs engine*. This finding shows the ladder has one more rung: **engine vs operational ledger.** An event with no surviving toll behind it is invisible at every level above it.

### 3.4 The bad number is sealed and frozen

```
ledger.week_statements — kind=toll, week=2026-08-10, version=1, status=closed
{ totalSpend: 13760, tagSpend: 13120, cashWashSpend: 640,
  reimbursed: 4620, chargedToDriver: 640, netLoss: 8500 }
closed_by: "toll_week_seal"   close_reason: "toll_week_seal"
```

Two things to note.

**The recorded Net Toll Loss is $8,500, and the true figure is $0.00:**
```
true netLoss = tagSpend + cashWash − reimbursed − chargedToDriver
             = 4,620 + 640 − 4,620 − 640
             = 0.00
```
The entire $8,500 "loss" for that week is the orphan population. It flows into Business Finance P&L.

**`close_reason` is the bare string `"toll_week_seal"`** — not `toll_week_seal_events` or `toll_week_seal_financial_events`. Those provenance suffixes were added in Pass 3. This statement was therefore sealed by the **pre-Pass-3 code path and never re-sealed**, so it never went through the independence checks at all. Worth searching for other statements with bare legacy `close_reason` values.

---

## 4. Money impact

| Surface | Impact | Why |
|---|---|---|
| **Driver settlement / balance** | **$0 — unaffected** | `computePeriodSettlement` consumes only `tollCashWash` and `tollPersonal`. `tollTagSpend` is never an input. All 24 orphans are `tag_balance`, so neither figure moved. `toll_charged_to_driver` = $640 and is correct. |
| **Driver Expenses screen** | Tag Tolls overstated **$8,500** | Direct read of `toll_tag_spend`. |
| **Total Expenses KPI** | Overstated | `$214,855` toll expenses includes the $8,500. |
| **Fleet P&L / Net Toll Loss** | Overstated **$8,500** | Sealed statement says $8,500; true value $0.00. |
| **Week close artefact** | Frozen on a wrong number | Statement `closed`, period `closed`, close hash computed over the inflated row. |

**Nothing was over-collected from the driver.** This is a books-and-reporting error, not a driver-money error.

---

## 5. Blast radius — checked, not assumed

You asked whether this is affecting other periods. I ran the orphan test across **every period and every driver**:

```sql
with ev as (
  select period_anchor, abs(amount_minor)/100.0 amt,
         (source_id in (select id from fleet.toll_ledger)) src_ok
  from financial_events
  where event_type='toll_usage' and reversed_at is null and reverses_event_id is null
)
select period_anchor, count(*) events,
       count(*) filter (where not src_ok) orphan_events,
       sum(amt) filter (where not src_ok) orphan_total
from ev group by 1 having count(*) filter (where not src_ok) > 0;
```

**Result — one row:**

| period_anchor | events | orphan_events | orphan_total |
|---|---|---|---|
| 2026-08-10 | 39 | 24 | **8,500.00** |

**No other period in the database has a single orphaned toll event.** This is an isolated incident, consistent with your read that you caused it in one specific action on one week.

### 5.1 One unrelated defect found while looking

Scanning all 36 periods for `toll_spend ≠ toll_cash_spend + toll_tag_spend`:

| period_anchor | toll_spend | cash | tag | drift | status |
|---|---|---|---|---|---|
| **2026-08-31** | 0.00 | 0.00 | 1,110.00 | **+1,110.00** | open |

Every other week ties to the cent. This is the row on your screenshot showing Total "–" with Tag $1,110 — a **different bug**, described in §6.1. It is currently confined to that one open week.

---

## 6. Related defects in the same code path

These did not cause your $13,120, but they are live in the same lane and worth fixing while you are in here.

### 6.1 The statement overwrite updates the total but not the split — **HIGH**

`driver_financial_periods.ts` — the `PROJECTION_READS_WEEK_STATEMENTS` cutover block:

```ts
if (toll) {
  row.tollSpend            = statementAmountMajor(toll, "totalSpend");
  row.tollChargedToDriver  = statementAmountMajor(toll, "chargedToDriver");
  row.tollReimbursed       = statementAmountMajor(toll, "reimbursed");
}
// row.tollCashSpend and row.tollTagSpend are NOT overwritten
```

Both are then persisted unchanged from the KV path. So after cutover `toll_spend` is statement-sourced while `toll_cash_spend` / `toll_tag_spend` are ledger-sourced, and they drift freely. That is the Aug 31 row: statement says $0, KV tag says $1,110, and the screen shows a total smaller than one of its own components.

The statement already carries `tagSpend` and `cashWashSpend` — the fix is to consume them.

### 6.2 `toll_spend_split` is checked nightly but not at close — **HIGH**

`periodInvariants.ts` has the right check:

```ts
pushDrift(drifts, row, 'toll_spend_split', tollSpend, round2(tollCash + tollTag));
```

It runs in the nightly `finance-recon` job only. `closeInvariants.ts` has **no** split check — grep for `toll_cash_spend` there returns nothing. A week whose parts do not sum to its total can be closed, signed and frozen. Given §6.1 puts weeks into exactly that state, this should be a close blocker.

### 6.3 Tag rows are exempt from every quarantine heuristic — **MEDIUM**

`packages/finance-core/src/tollLedgerIntegrity.ts`:

```ts
export function matchesSyntheticCashTollSignature(t) {
  const pm = String(t.paymentMethod || '').toLowerCase();
  if (!pm.includes('cash')) return false;   // ← non-cash exits immediately
  …
}
```

The whole Audit 1.1 synthetic-row detector — fabricated `manual_*` trip ids, highway-stuffed-into-plaza, no batch id — **only ever applies to cash rows**. A synthetic *tag* row with identical symptoms is never quarantined and flows straight into `tollTagSpend`.

Compounding it, `isCashPaid` is `paymentMethod.includes('cash')`, so **any row with a missing, null or empty `paymentMethod` is classified as tag** — and therefore also exempt. Bad data defaults into the unguarded bucket.

### 6.4 Read-time merge dedupes on `id` only — **MEDIUM**

`toll_controller.tsx :: loadMergedTollTxArray` merges `toll_ledger` entries with `transaction:*` toll rows into a `Map` keyed by `id`. A ledger row and its legacy twin only collapse if they happen to share an id. `finance-core` already exports `findDuplicateTollLedgerEntry` and `fingerprintFromTollLike` for exactly this, but they are used **only at import time**, never at read.

This did not fire here (I checked — `fleet.transactions` holds only the two `Adjustment` driver-charge rows for that week, and `isReconcilableTollExpense` correctly excludes them). But it is an open door for the same class of inflation.

### 6.5 Trip cash-wash loop is not flag-guarded — **LOW / verify**

The `weekTolls` loop is wrapped in `if (!useTollEvents)`. The trip cash-wash loop immediately below it is **not**, and adds to `tollSpend` / `tollCashSpend` / `tollCashWashEligible` unconditionally. If a cash-wash trip ever also emits a `toll_usage` event, both would count.

I could not confirm this fires today — Aug 10's cash figure ($640) matches its two cash ledger rows exactly, so there is no evidence of doubling. Flagging it as a latent risk to verify, not a confirmed defect.

---

## 6.6 Implementation status — verified 2026-09-07

Re-audited at `8f178574` plus working-tree changes. **All five code recommendations are implemented and wired.** Verification: `finance-core` **136/136** · `fuel-core` **38/38** · `toll-core` **53/53** · `@roam/fleet` **1,306 passed / 1 skipped** · **9/9 CI guards pass**.

| Item | Status | Where |
|---|---|---|
| §6.1 cutover overwrites cash/tag split | ✅ Done | `driver_financial_periods.ts` — statement `cashWashSpend` / `tagSpend` now consumed |
| §6.2 `TOLL_SPEND_SPLIT` close blocker | ✅ Done | `closeInvariants.ts` |
| §6.3 quarantine applies to all payment methods | ✅ Done | `matchesSyntheticTollStructuralSignature` |
| §7.2 reverse events when a toll dies | ✅ Done | new `toll_financial_reset.ts`, wired to delete / void / period-reset / bulk-delete / nightly |
| §7.3 engine-vs-ledger orphan check | ✅ Done | new `tollEventLedgerRecon.ts` + `TOLL_EVENT_ORPHANED` block, at close preview, close and nightly |

### Three gaps found during verification — now also fixed

**1. `TOLL_SPEND_SPLIT` fired with no diagnosis.** §6.3 introduced an `unknown` payment-method class that deliberately lands in `toll_spend` but in neither split bucket, so the split blocker trips. That is the right instinct — fail loud — but the operator saw only *"period.toll_spend ≠ toll_cash_spend + toll_tag_spend"*, which names no cause and offers no fix. A single toll row with a blank `paymentMethod` would have hard-blocked the week with nothing to act on.

Added `TOLL_PAYMENT_METHOD_UNKNOWN` (severity `block`):

> `1 toll row(s) have no cash/tag payment method ($370.00) — set the payment method on each, then rebuild the week before close`

The projection now counts unknown-PM rows on **both** the ledger and events paths into `metadata.financeCore.tollUnknownPm{Count,Amount}`. When the split gap is fully explained by those rows, `TOLL_SPEND_SPLIT` is suppressed so one cause raises one blocker; when it is *not* fully explained, both fire.

*Blast radius checked: **zero** unknown-PM rows in production today (0 of 284 ledger rows, 0 of 460 events). This trap was latent, not active.*

**2. The orphan check was one-directional.** `summarizeTollUsageOrphansForWeek` walked the event set and asked "does a ledger row still exist?" — so it caught *overstatement* (your $8,500) but was blind to the opposite: a live toll row with **no** money event, which understates spend and would never have been noticed. `ledgerSpendMajor` was computed only over ids that already had events, so the two sides always agreed.

The probe now scans the full week's `fleet.toll_ledger` and reports `missingEventCount` / `missingEventAmountMajor`, surfaced as `TOLL_EVENT_MISSING` (severity `block`):

> `2 live toll row(s) have no money event ($640.00 of spend not counted) — re-post before close`

Same one-cause-one-blocker rule applies: when a gap is explained by missing events, the generic `TOLL_EVENT_ORPHANED` drift is suppressed.

**3. `cashSourceMismatch` was never declared on `CloseInvariantInput`.** It is read at `closeInvariants.ts:457` and `:462` to power the M-1 block, but the field was missing from the type — the doc comment sat directly above the next field with nothing under it. Every caller passing it was an excess-property type error, and the read inside the function was untyped. **M-1's cash-mismatch block was not type-safe.** Declared it.

Deno typecheck on `week_close.ts` went from **62 → 59** errors: none added, three pre-existing removed. The remaining 59 (and 57 on `driver_financial_periods.ts`) pre-date this work — mostly `unifiedLedger/queries.ts` `driverId` optionality — and are out of scope here.

### One gap deliberately **not** fixed — needs your decision

**Quarantine is inert on the events path.** When `PROJECTION_EVENTS_TOLLS` is on (it is), the projection sums `financial_events` and applies **no** `isTollIncludedInSpend` gate. The KV/ledger path filters quarantined rows via `scopedTolls`; the events path does not filter at all. So the whole Audit 1.1 quarantine — including the §6.3 improvement just made — **has no effect on live numbers today.**

> ### ⚠️ CORRECTION (see §10)
>
> **The sentence above is wrong, and it was the most consequential error in this
> document.** "No effect on live numbers" was an assumption I did not test. It has
> a **$116,480** effect across 32 weeks — it is the single largest defect in the
> toll lane, larger than the $8,500 orphan this audit was opened for. I ranked it
> as a latent decision item when it was an active, visible, six-figure divergence.
> §10 has the measured numbers.

I did not change this, because applying quarantine to the events path would **retroactively remove spend from historical closed weeks**. That is a money change on signed data and it is your call, not mine. Two options:

- **Filter at read** — skip events whose `source_id` resolves to a quarantined toll. Immediate, retroactive, changes closed weeks.
- **Filter at write** — reverse the `toll_usage` events for any toll that becomes quarantined (the `toll_financial_reset.ts` machinery already does exactly this for delete and void). Forward-only, leaves history alone, and each change is an auditable reversal rather than a silent recompute.

The second is more consistent with the append-only rule the toll module already follows everywhere else. Either way it should be a deliberate, dated cutover — not a quiet behaviour change.

---

## 7. What to fix, in order

> **Status:** §7.2, §7.3 and §7.4 are **done and verified** (see §6.6). What
> remains is §7.1 (the data repair — needs your go-ahead), §7.5 (housekeeping),
> the quarantine cutover decision in §6.6, and deploying the edge functions.

### 7.1 Correct the data (one week) — ⏳ **NOT DONE — needs your go-ahead**

I deliberately did not touch production. This reverses money events and thaws a
signed, frozen week, which is not something to do on my own initiative. The code
to do it safely now exists; say the word and I will run it, or you can.

The 24 orphan events should be **reversed, not deleted** — same rule the toll module already documents for itself. Identify them with:

```sql
select id, source_id, amount_minor, occurred_at, payload->>'paymentMethod' as pm
from financial_events
where event_type = 'toll_usage'
  and reversed_at is null and reverses_event_id is null
  and period_anchor = '2026-08-10'
  and source_id not in (select id from fleet.toll_ledger)
order by occurred_at;
-- expect 24 rows, 850000 minor total
```

Then, through the normal reversal path (not raw SQL):
1. Post a reversal for each, carrying `reverses_event_id` and a reason such as `orphan_toll_usage_no_ledger_row`.
2. Thaw the week, re-seal the toll statement (it will re-derive $5,260 / netLoss $0.00), rebuild the projection, re-close and re-sign.
3. Expected post-fix state: `toll_spend 5260`, `toll_cash_spend 640`, `toll_tag_spend 4620`, statement `netLoss 0.00`.

Driver settlement should not move. If it does, stop — that means something else is wrong.

### 7.2 Close the hole that allowed it — ✅ **DONE**

**Reverse events when their source row dies.** Every toll delete / period reset / re-import path must reverse the `toll_usage` events for the rows it removes. This is the actual root cause; everything else here is detection.

### 7.3 Add the missing rung to the integrity ladder — ✅ **DONE**

Pass 5 established *statement vs engine*. This incident shows the need for **engine vs operational ledger**:

```
for each (driver, week):
  Σ active toll_usage events  ≟  Σ fleet.toll_ledger rows in spend
  every event.source_id       must resolve to a live, non-voided toll row
```

Run it in nightly `finance-recon`, persist to `ledger.finance_recon_drift` (the table already exists), and make it a **close blocker** via a new `TOLL_EVENT_ORPHANED` code. That single check would have caught this the night it happened, and would have refused to close the week.

### 7.4 The three smaller fixes — ✅ **DONE** (plus three more found in review, §6.6)

- **§6.1** — consume `tagSpend` / `cashWashSpend` from the toll statement in the cutover block.
- **§6.2** — add the `toll_spend_split` check to `closeInvariants` as `severity: 'block'`.
- **§6.3** — split the synthetic-row detector so the structural signals (fabricated `manual_*` trip id, highway-as-plaza, no batch) apply to **all** payment methods; keep only the genuinely cash-specific rules behind the cash gate. Separately, treat a missing `paymentMethod` as `unknown` rather than silently tag.

### 7.5 Housekeeping — ⏳ **NOT DONE**

Search for statements sealed by the pre-Pass-3 code path and re-seal them so they carry real provenance:

```sql
select kind, count(*)
from ledger.week_statements
where status = 'closed'
  and close_reason in ('toll_week_seal','close_precondition','commission_cash_engines')
group by kind;
```

Anything in that set was closed without the independence guarantees that Pass 3 introduced.

---

## 8. Summary

| Question | Answer |
|---|---|
| Is the $13,120 wrong? | Yes. True tag spend is **$4,620**. Overstated by **$8,500**. |
| Why? | 24 `toll_usage` events whose toll ledger rows were deleted without reversing the events. The projection sums events, not the ledger. |
| Does it affect other periods? | **No.** Verified across all periods and all drivers — 2026-08-10 is the only one. |
| Did the driver get overcharged? | **No.** All orphans are `tag_balance`; settlement never reads tag spend. Driver balance is correct. |
| What *is* wrong? | Fleet books. Net Toll Loss for that week reads **$8,500**; the true figure is **$0.00**. |
| Why did no control catch it? | Every toll control reads `financial_events`. **Nothing reconciles events against `fleet.toll_ledger`.** |
| Is it contained? | Yes — one week, one driver, and the amount is known to the cent. |

There is one separate, unrelated defect: **week 2026-08-31** has `toll_spend $0` against `toll_tag_spend $1,110` (§6.1). §6.1 has now landed, and that week is still open, so a rebuild should clear it.

---

## 10. The Aug 17–23 divergence — Toll Reconciliation vs Expenses

**Reported:** Aug 17 – Aug 23 shows **$10,580** on driver Expenses, while the Toll Reconciliation wizard for the same week shows **Toll Spend $5,060**.

### 10.1 First — what changed and what did not

I need to answer this precisely, because the report was that a number "was perfectly fine before".

| Week | Earlier screenshot | Now | Verdict |
|---|---|---|---|
| Aug 31 – Sep 6 | Total **"–"**, Tag $1,110 | Total **$1,110**, Tag $1,110 | **Fixed** — §6.1 split repair |
| Aug 24 – 30 | $6,195 / tag $6,195 | $6,195 / tag $6,195 | Unchanged |
| **Aug 17 – 23** | **$10,580** / cash $5,920 / tag $4,660 | **$10,580** / cash $5,920 / tag $4,660 | **Identical — not changed** |
| Aug 10 – 16 | $13,760 / tag **$13,120** | $5,260 / tag **$4,620** | **Fixed** — orphan repair |
| Toll Expenses card | $214,855 | $207,465 | −$7,390 = −8,500 orphan +1,110 split |

`ledger.driver_financial_periods` confirms it: **Aug 17's row has `updated_at = 2026-09-06 15:19:21`** — the day before this session began. It has not been rewritten by anything done here, and the value is byte-identical in both of your screenshots.

So the $10,580 is not new and was not introduced by this work. **But you are right that it is wrong**, and the reason it now looks wrong is that the week beside it got fixed — Aug 10 dropping from $13,760 to its true $5,260 made the untouched $10,580 stand out. The bug was always there; the repair made it visible.

**Where I was wrong:** §6.6 said this gap had "no effect on live numbers today." That was an assumption I never measured, and it is false. Below is what it actually costs.

### 10.2 The real defect — two spend gates, only one enforced

The two screens do not disagree about the *tolls*. They disagree about **which tolls count as spend**.

| | Toll Reconciliation | Driver Expenses |
|---|---|---|
| Reads | `fleet.toll_ledger` via `loadMergedTollTxArray` | `financial_events` (`toll_usage`) |
| Applies `isTollIncludedInSpend`? | **Yes** — `.filter(isReconcilableTollExpense).filter(isTollIncludedInSpend)` | **No — no gate at all** |
| Aug 17–23 result | **$5,060** | **$10,580** |

Tag agrees exactly: Recon's Uber $4,660 == Expenses' Tag $4,660. The entire $5,520 gap is on the **cash** side, and it is composed of rows the ledger has explicitly marked as not-spend.

Every active `toll_usage` event for Aug 17–23, joined to its ledger row:

| Payment | Ledger `quarantined` | Ledger `status` | Events | Amount |
|---|---|---|---|---|
| cash | **true** | pending | 6 | **$4,090** |
| cash | **true** | **voided** | 1 | **$850** |
| cash | **true** | rejected | 2 | **$580** |
| cash | — | rejected | 1 | $400 |
| tag_balance | — | reconciled | 12 | $4,660 |
| | | | **22** | **$10,580** |

$4,090 + $850 + $580 + $400 = **$5,920** — exactly the Cash Tolls figure on screen. Recon keeps only the one non-quarantined cash row ($400) plus tag ($4,660) = **$5,060**.

### 10.3 Three distinct classes, all on the events path

**Class 1 — quarantined rows counted as spend.** Nine cash rows for this week carry `metadata.quarantined = true` (Audit 1.1 synthetic-cash signature: Transjam-highway-as-plaza, no batch id). Toll Recon excludes them. Expenses counts every one.

**Class 2 — a voided row whose event still carries the original amount.** Row `419794d1` is `status = voided` with `amount = 0`, but its `toll_usage` event still posts **$850**. The void zeroed the ledger and left the money event standing.

This one matters beyond this week: **the orphan check added in §7.3 cannot catch it.** That check asks "does `source_id` still resolve to a ledger row?" — and here it does. The row exists; it is simply voided and zeroed. Fleet-wide there are exactly **2 such rows, $1,230**, where the event amount exceeds the ledger amount. The check needs to compare *amount and status*, not just existence.

**Class 3 — rejected rows counted as spend.** `status = rejected` rows are still summed ($980 this week).

### 10.4 Blast radius — measured, fleet-wide

Every active `toll_usage` event joined to its ledger row:

| Bucket | Amount | Share |
|---|---|---|
| **Clean** — live, non-quarantined, not voided/rejected | **$58,265** | 33.3% |
| Quarantined but counted | **$101,870** | 58.3% |
| Rejected but counted | **$13,380** | 7.7% |
| Voided (ledger zeroed, event alive) | **$1,230** | 0.7% |
| Orphaned (no ledger row) | **$0** | 0% ✅ |
| **Total counted by Expenses** | **$174,745** | |

**$116,480 — 66.7% of all toll spend Expenses reports — is excluded by Toll Reconciliation.** It affects **32 of 36 weeks**. Several weeks are 100% quarantined: Jul 13 ($4,320), Jun 8 ($3,040), Jun 1 ($5,890), May 25, May 18, May 11, Mar 30, Mar 23, Mar 16, Mar 9, Feb 16 — for those the entire Expenses toll figure is rows the ledger says should not count.

The orphan row is the good news: **$0**. The Aug 10 repair worked and no orphans remain fleet-wide.

### 10.5 When this started

The quarantine flags were written on **2026-09-01 and 2026-09-02** — 157 rows. Before that date nothing was flagged, so both screens agreed and the numbers looked fine. The Audit 1.1 remediation correctly marked the synthetic rows, Toll Recon immediately honoured it, and Expenses never did.

That is why "it was fine before" is a fair description of what you saw: **the divergence has existed since Sep 1–2**, five days before this session, and it became conspicuous only when the neighbouring week was corrected.

### 10.6 Why no control catches it

Same root as §3.3, one level deeper. Every toll control reads `financial_events`, and the quarantine flag lives on `fleet.toll_ledger`:

- `computeTollWeekNetting`, `sealTollWeek` — canonical/financial events, no quarantine gate.
- Statement↔engine compare — both sides event-derived, so they agree.
- `TOLL_EVENT_ORPHANED` (§7.3) — existence-only; a quarantined or voided row still *exists*.
- `TOLL_SPEND_SPLIT` — internally consistent ($5,920 + $4,660 = $10,580), so silent.

The one control that would catch it is the §7.3 check extended from *existence* to *eligibility and amount*.

### 10.7 What to decide — nothing here is safe to change unilaterally

This is a **$116,480 restatement across 32 weeks, most of them closed and signed**. It needs your decision, not mine.

1. **Confirm the quarantine calls are correct.** 157 rows, $58,025 of ledger value, flagged Sep 1–2 by the Transjam-highway heuristic. If any were flagged wrongly, fixing Expenses would wrongly *remove* real spend. Verify a sample before anything else.
2. **Choose a direction** (unchanged from §6.6, but now with the real price tag):
   - *Reverse-on-quarantine* — reverse the `toll_usage` events for quarantined rows. Forward-only, auditable, reuses `toll_financial_reset.ts`. Restates closed weeks via explicit reversals.
   - *Filter-at-read* — apply the gate in the events aggregation. Immediate and retroactive, but silently restates history with no audit trail. **Not recommended.**
3. **Extend the §7.3 check** from existence to eligibility: flag when an event's ledger row is quarantined, voided, rejected, or when the event amount ≠ the ledger amount. That closes Classes 1–3 and the "zeroed but alive" hole in one place.
4. **Decide the `rejected` policy explicitly.** Recon excludes rejected rows; whether a rejected toll is fleet spend is a business question this audit cannot answer.

### 10.8 On my changes

To be straightforward about it: the working tree has **my** uncommitted edits to `closeInvariants.ts` (+ its test), `periodPersistBody.ts`, `driver_financial_periods.ts`, `toll_financial_reset.ts` and `week_close.ts`, alongside **your** edits to `CloseWeekPage.tsx`, `weekCloseBlockers.ts`, `toll_controller.tsx` and `toll_quarantine_reverse.test.ts`.

Mine add detection only — new close blockers, a counter, and a type declaration. None of them alter `tollSpend` / `tollCashSpend` / `tollTagSpend` arithmetic, and none are deployed. They are not the cause of anything on these screens, but if you want them out while you work, say so and I will revert only my files and leave yours untouched.

---

## 9. What is left for you

| # | Item | Status |
|---|---|---|
| 1 | **§7.1 Aug 10 orphan data repair** | **Done in production** — 24 orphans reversed; DFP 5260 / 4620 / 640; settlement unchanged. |
| 2 | **Quarantine cutover** (§6.6) | **Locked:** reverse-on-quarantine (forward path shipped). Filter-at-read rejected. |
| 3 | **Rebuild week 2026-08-31** | **Done** — split 1110 = tag. |
| 4 | **Deploy edge functions** | Prior cut deployed; §10 finish redeploys with ineligible report + blockers. |
| 5 | **§7.5 housekeeping** | Bare `toll_week_seal` / `close_precondition` inventory **0**. |
| 6 | *(optional)* Pre-existing Deno type errors | Non-blocking. |
| **7** | **§10 ineligible restatement** | **Done 2026-09-07:** sample OK → reversed 281 events → DFP rebuilt → Aug 17 = **$5,060**. Remaining ineligible active **0**. Still click: Close Week **Re-open → Force-seal tolls → Close** on restated weeks for seal/charged/close-hash refresh. Rejected policy: keep as spend. |

---

*Diagnosis: verified against production `csfllzzastacofsvcdsc` on 2026-09-07. Aug 10 orphan repair and forward reverse-on-quarantine are in production. Audit §10 historical restatement + eligibility close blockers are the remaining toll-lane money work.*
