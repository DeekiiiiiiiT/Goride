# Close Week runbook

## How to close a week

1. Open **Close the Week** and pick the Monday week.
2. Clear Fuel / Tolls / Settlement blockers (Review deep-links).
3. Unverified lanes mean the statement is still draft — finalize fuel or seal tolls from events.
4. Press **Close week** only when blockers = 0 (warnings alone do not block).

## When Close is blocked

| Code | Meaning | Fix |
|------|---------|-----|
| `FUEL_STATEMENT_MISSING` / `UNVERIFIED` | No closed fuel statement | Finalize Consumption Reconciliation |
| `TOLL_STATEMENT_MISSING` / `UNVERIFIED` | No closed toll statement from events | Finish Toll Reconciliation / ensure events exist |
| `EARNINGS_STATEMENT_MISSING` / `UNVERIFIED` | No closed earnings seal | Close Week auto-seals from engines; or wait for seal |
| `FUEL_ENGINE_DRIFT` / `TOLL_ENGINE_DRIFT` / `EARNINGS_ENGINE_DRIFT` | Closed seal ≠ fresh engine | Reseal that lane before close |
| `TOLL_EVENT_ORPHANED` | Toll money events don’t match live tolls | Re-open if closed → **Repair orphan toll events** → force-seal tolls (not Restatement) |
| `TOLL_SPEND_SPLIT` | `toll_spend ≠ cash + tag` | Rebuild period after statement cutover; check tag/cash overwrite |
| `*_MISMATCH` | Period ≠ independent statement | Investigate drift; do not force-close |
| `CASH_SOURCE_MISMATCH` | Trip CSV vs ledger cash | Resolve cash source before close |
| `SETTLEMENT_PNL_MISMATCH` | Desk fleet P&L ≠ sealed statement P&L | Align projection to statements / reseal |
| `BUSINESS_WEEK_PNL_UNAVAILABLE` | Warn — no closed statements to build P&L | Seal lanes first |

## Orphan toll events (tag spend inflation)

If Close Week shows **Toll money events don’t match live tolls**:

1. Do **not** use Restatement Queue.
2. If the week is closed → **Re-open week** first.
3. Press **Repair orphan toll events** (reverses dead `toll_usage`, force-reseals tolls).
4. Confirm driver settlement did not move (tag orphans should not).
5. Refresh → blockers clear → **Close week** again.

Ops write-up: [2026-09-07-toll-orphan-remediation.md](./2026-09-07-toll-orphan-remediation.md).

**Until reverse-on-delete is deployed:** avoid Delete Center / bulk delete of toll transactions for closed weeks.

## How to restate (money correction — week stays frozen)

1. Late facts on a **Closed** week create a **draft** statement (version n+1).
2. Open **Restatement Queue** → **Open Close Week** for that week.
3. On Close Week, press **Sign restatements** (enabled when draft count > 0 and blockers = 0).
4. Never approve outside that flow. Do **not** use fuel `seal-fuel?force=true` as a restatement approver.

## How to re-open a closed week (unlock lane edits)

Use this when a week was closed by mistake or you need Fuel / Tolls / Settlement edits — **not** for routine money corrections (use restate).

1. Open **Close the Week** for the signed week.
2. Press **Re-open week** and enter a required reason.
3. If settlement money was already moved, confirm the settlement-risk checkbox.
4. Edit lanes as needed. Fuel Consumption recon stays locked until you use **Fuel reopen** separately.
5. Press **Close week** again when blockers = 0 (new close hash; prior seal is kept in `reopenHistory`).

## Legacy seal provenance

Statements sealed before Pass 3 may show bare `close_reason` values (`toll_week_seal`, `close_precondition`). After deploy, re-open those weeks and force-seal lanes so provenance is `toll_week_seal_events` / `_financial_events` / `_plaza` (or earnings engine suffixes). Inventory SQL:

```sql
select kind, count(*)
from ledger.week_statements
where status = 'closed'
  and close_reason in ('toll_week_seal','close_precondition','commission_cash_engines')
group by kind;
```
