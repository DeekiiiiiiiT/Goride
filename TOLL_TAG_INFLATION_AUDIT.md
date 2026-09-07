# Toll Tag Spend Inflation — Root Cause Audit

**Reported:** Aug 10 – Aug 16, 2026 shows **Tag Tolls $13,120.00** on the driver Expenses screen — visibly out of line with every other week.
**Driver:** `73e5b1dc-01b4-45ee-a34a-25a3256b9841` · **Org:** `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`
**Date:** 2026-09-07
**Mode:** Read-only audit — code inspection plus read-only SQL against production. **No code changed, no data changed.**

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

## 7. What to fix, in order

### 7.1 Correct the data (one week)

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

### 7.2 Close the hole that allowed it

**Reverse events when their source row dies.** Every toll delete / period reset / re-import path must reverse the `toll_usage` events for the rows it removes. This is the actual root cause; everything else here is detection.

### 7.3 Add the missing rung to the integrity ladder

Pass 5 established *statement vs engine*. This incident shows the need for **engine vs operational ledger**:

```
for each (driver, week):
  Σ active toll_usage events  ≟  Σ fleet.toll_ledger rows in spend
  every event.source_id       must resolve to a live, non-voided toll row
```

Run it in nightly `finance-recon`, persist to `ledger.finance_recon_drift` (the table already exists), and make it a **close blocker** via a new `TOLL_EVENT_ORPHANED` code. That single check would have caught this the night it happened, and would have refused to close the week.

### 7.4 The three smaller fixes

- **§6.1** — consume `tagSpend` / `cashWashSpend` from the toll statement in the cutover block.
- **§6.2** — add the `toll_spend_split` check to `closeInvariants` as `severity: 'block'`.
- **§6.3** — split the synthetic-row detector so the structural signals (fabricated `manual_*` trip id, highway-as-plaza, no batch) apply to **all** payment methods; keep only the genuinely cash-specific rules behind the cash gate. Separately, treat a missing `paymentMethod` as `unknown` rather than silently tag.

### 7.5 Housekeeping

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

There is one separate, unrelated defect: **week 2026-08-31** has `toll_spend $0` against `toll_tag_spend $1,110` (§6.1). That week is still open, so it can be fixed by a rebuild once §6.1 lands.

---

*Read-only audit. No source files and no data were modified. All figures verified by direct query against production `csfllzzastacofsvcdsc` on 2026-09-07.*
