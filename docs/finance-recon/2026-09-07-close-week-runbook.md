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
| `TOLL_EVENT_MISSING` | Live tolls have no money event | Re-save / re-post those toll rows (or clear quarantine and save), then rebuild |
| `TOLL_EVENT_INELIGIBLE` | Events still on quarantined/voided rows | Re-open if closed → **Review sample & repair** → force-seal (not Restatement) |
| `TOLL_EVENT_AMOUNT_MISMATCH` | Event amount ≠ live ledger | Same repair path as ineligible (reverse + re-post) |
| `TOLL_PAYMENT_METHOD_UNKNOWN` | Toll rows missing cash/tag payment method | Set payment method on each row, then rebuild |
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

**Quarantine:** Stamping a toll quarantined reverses its `toll_usage` (forward-only). Clearing quarantine and saving re-posts a new generation — closed weeks are not silently refiltered at read.

## Ineligible toll events (Expenses vs Recon — Audit §10)

If Close Week shows **Ineligible toll events still on books** (`TOLL_EVENT_INELIGIBLE` / `TOLL_EVENT_AMOUNT_MISMATCH`):

1. Do **not** use Restatement Queue.
2. If the week is closed → **Re-open week** first.
3. Press **Review sample & repair** — spot-check quarantine reasons (fabricated trip id, Transjam plaza, etc.) and note **tag vs cash** impact.
4. Confirm → reverses ineligible `toll_usage`, rebuilds periods, force-reseals tolls.
5. Pause if cash impact looks wrong (settlement can move for cash quarantines).
6. Refresh → blockers clear → **Close week** again.

Ops write-up: [2026-09-07-toll-orphan-remediation.md](./2026-09-07-toll-orphan-remediation.md).

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
  and close_reason in ('toll_week_seal','close_precondition')
group by kind;
```

Residual for bare `toll_week_seal` / `close_precondition` should be **0** after housekeeping.

**Status 2026-09-07:** inventory query returns **0** rows for those bare reasons. Toll weeks `2026-08-10` / `2026-08-17` carry `toll_week_seal_financial_events`. Earnings use `commission_cash_engines`. To refresh a close hash after book fixes, Re-open → Close that week on Close Week.
