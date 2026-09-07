# Toll orphan inflation — Aug 10 remediation checklist

**Incident:** Tag Tolls showed $13,120 for week `2026-08-10` (driver `73e5b1dc-01b4-45ee-a34a-25a3256b9841`). True tag spend $4,620; $8,500 was 24 orphan `toll_usage` events.

## Pre-fix snapshot (2026-09-07)

| Field | Value |
|-------|-------|
| DFP `toll_spend` / tag / cash | 13760 / 13120 / 640 |
| Statement `netLoss` | 8500 |
| Settlement / payout | **7697.14 / 13456.54** (must not move) |
| Orphan events | 24 × tag_balance = $8,500 |

## Done in remediation (2026-09-07)

1. Reversed 24 orphans via `ledger_post_financial_event` (reason `orphan_toll_usage_no_ledger_row`).
2. Confirmed **0 orphans** for `2026-08-10`; active spend **$5,260** (15 events).
3. Updated DFP: spend **5260**, tag **4620**, cash **640** — settlement unchanged.
4. Updated sealed toll statement: spend **5260**, netLoss **0**, `close_reason` → `toll_week_seal_financial_events`.
5. Fixed open week `2026-08-31` split: toll_spend **1110** (= tag).

## After fleet-server deploy

1. Deploy fleet-server so delete/void reverse events + Close Week orphan blocker + repair CTA are live.
2. Optional: Close Week → Re-open `2026-08-10` → **Repair orphan toll events** (should report 0) → force **sealToll** → rebuild → re-close to refresh close hash.
3. Force re-seal legacy-provenance weeks still pending engine refresh:
   - Earnings `2026-08-10` / `2026-08-17` (were `close_precondition`)
   - Toll `2026-08-17` (was bare `toll_week_seal`)
4. Rebuild open `2026-08-31` once more after §6.1 cutover code is live.

## Verify

```sql
-- orphans (expect 0)
select count(*) from financial_events
where event_type='toll_usage' and reversed_at is null and reverses_event_id is null
  and period_anchor='2026-08-10'
  and source_id not in (select id from fleet.toll_ledger);

-- DFP (expect 5260 / 4620 / 640; settlement unchanged)
select toll_spend, toll_tag_spend, toll_cash_spend, settlement_amount, payout_net
from driver_financial_periods
where period_anchor='2026-08-10'
  and driver_id='73e5b1dc-01b4-45ee-a34a-25a3256b9841';
```

## Do not

- Hard-delete financial events.
- Use Restatement Queue for orphan event repair.
- Re-close while `TOLL_EVENT_ORPHANED` is still firing.
