# Toll orphan inflation — Aug 10 remediation checklist

**Incident:** Tag Tolls showed $13,120 for week `2026-08-10` (driver `73e5b1dc-01b4-45ee-a34a-25a3256b9841`). True tag spend $4,620; $8,500 was 24 orphan `toll_usage` events.

## Pre-fix snapshot (2026-09-07)

| Field | Value |
|-------|-------|
| DFP `toll_spend` / tag / cash | 13760 / 13120 / 640 |
| Statement `netLoss` | 8500 |
| Settlement / payout | **7697.14 / 13456.54** (must not move) |
| Orphan events | 24 × tag_balance = $8,500 |

## §7.1 data repair — DONE in production (2026-09-07)

1. Reversed 24 orphans via `ledger_post_financial_event` (reason `orphan_toll_usage_no_ledger_row`).
2. Confirmed **0 orphans** for `2026-08-10`; active spend **$5,260** (15 events).
3. Updated DFP: spend **5260**, tag **4620**, cash **640** — settlement unchanged.
4. Updated sealed toll statement: spend **5260**, netLoss **0**, `close_reason` → `toll_week_seal_financial_events`.
5. Fixed open week `2026-08-31` split: toll_spend **1110** (= tag).

## After fleet-server deploy — DONE 2026-09-07

1. Deployed `make-server-37f42386` (`pnpm deploy:edge`) and `finance-recon`.
2. Prod verify: orphans **0**; DFP **5260 / 4620 / 640**; settlement **7697.14 / 13456.54**; toll statement netLoss **0**.
3. Aug 31 open week split already **1110 = 0 + 1110**.
4. Bare `toll_week_seal` / `close_precondition` inventory: **0**.
5. **Your click:** Close Week → week `2026-08-10` → Re-open → Refresh → Close (refreshes close hash to match corrected books). Optional force sealToll before Close.

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
- Silently filter quarantined tolls at events-path read on closed weeks — use reverse-on-quarantine instead.

## Audit §10 — ineligible events still on books (Expenses vs Recon)

**Symptom:** After Aug 10 repair, weeks like `2026-08-17` still show Expenses toll spend ≫ Toll Recon (e.g. $10,580 vs $5,060). Cause: active `toll_usage` on **quarantined / voided / amount-mismatched** ledger rows. Orphans = $0.

**Locked policy:** Spend truth = `isTollIncludedInSpend` (quarantined + voided out). Rejected stays as spend this cutover. Fix by reversing events, not filter-at-read.

### Ops sequence (per week)

1. Dry-run: `GET …/toll/periods/:weekKey/ineligible-usage-report` (sample + tag/cash totals).
2. Spot-check quarantine reasons on Close Week → **Review sample & repair**.
3. If week closed → **Re-open** (not Restatement).
4. Apply: `POST …/ineligible-usage-report` with `{ apply: true }` (or UI Reverse and re-seal).
5. Force-seal tolls → Close Week again when blockers clear.
6. Pause if cash impact looks wrong (settlement can move).

### Production restatement (2026-09-07)

- Sample confirmed Audit 1.1 reasons (`transjam_highway_as_plaza`, `fabricated_manual_trip_id`); quarantined impact was **100% cash**.
- Reversed all ineligible active `toll_usage` via `ledger_post_financial_event` (reason `toll_ledger_ineligible_restatement`) — **remaining ineligible active = 0**.
- Rebuilt DFP toll spend/cash/tag from remaining events (**27** periods).
- Aug 17 driver Expenses now **$5,060** (tag $4,660 + cash $400) — matches Toll Recon.
- Closed toll statements patched for restated weeks; **Re-open → Force-seal → Close** on Close Week still required to refresh close hashes and charged/netLoss from the live seal engine.

### Close blockers added

| Code | Meaning |
|------|---------|
| `TOLL_EVENT_INELIGIBLE` | Active event on quarantined/voided ledger |
| `TOLL_EVENT_AMOUNT_MISMATCH` | abs(event) ≠ abs(ledger) on live spend row |

Missing-event scan skips non-spend rows so reverse-on-quarantine does not create false `TOLL_EVENT_MISSING`.

