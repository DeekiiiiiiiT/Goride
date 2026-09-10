# Close Week runbook

## How to close a week

1. Finish **Fuel** and **Tolls** week recon (and Cash desk) where that work lives.
2. Open **Close the Week** and pick the Monday week.
3. Close Week **auto-syncs** ended open weeks on load and Refresh when seals/books need repair (publishes missing/draft seals, **force-reseals closed seals that drifted from engines**, rebuilds open driver books). Healthy Clear weeks stay preview-only. You do not need a Prepare button.
4. Auto-sync **never** creates Restatement Queue drafts. Draft-over-closed seals are only from Restatement Queue / intentional frozen-week toll restatements.
5. Clear remaining blockers via **Review** (Fuel / Tolls / Cash).
6. Press **Close week** only when blockers = 0 (warnings alone do not block). Close force-reseals fuel + tolls + earnings (closed→closed) + rebuilds before signing.

### After Refresh: Collect appears

If Tolls / Fuel show **Clear** but Settlement still needs Collect or Pay, that residual is usually **real** — book refresh stamped charged/reimbursed onto periods and settlement reopened. Finish **Collect / Pay on Cash desk**, then **Refresh**. Do not hand-edit `driver_financial_periods` or run SQL heals for period↔seal drift.

### Earnings unverified

Retry **Refresh**. Do **not** use Restatement Queue for this. If it persists after deploy of write guards, engines could not produce a closed seal — investigate earnings engines, not Collect.

### Restatement Queue spam cleanup

If the queue filled with Earnings drafts after sync: run `.\scripts\cleanup-sync-restatement-drafts.ps1` (deletes open-week / `close_precondition_unverified` draft+supersedes only). Queue listing only shows drafts on **frozen** weeks.

## Engineering contract (seal → rebuild)

Any code path that publishes a **closed** `week_statement` for an open org-week must **rebuild open driver periods** for that week so Pass E can stamp seal → books (`PROJECTION_READS_WEEK_STATEMENTS=true`). Owned today by: Fuel finalize, Toll seal HTTP, Close Week sync (`POST …/prepare` or `…/sync`), and Close.

`publishWeekStatement` refuses draft-over-closed unless `allowRestatementDraft: true` (Restatement Queue / intentional frozen toll restatement only).

## When Close is blocked

| Code | Meaning | Fix |
|------|---------|-----|
| `FUEL_STATEMENT_MISSING` / `UNVERIFIED` | No closed fuel statement | Finalize Consumption Reconciliation, then Refresh Close |
| `TOLL_STATEMENT_MISSING` / `UNVERIFIED` | No closed toll statement from events | Finish Toll Reconciliation / ensure events exist, then Refresh |
| `EARNINGS_STATEMENT_MISSING` / `UNVERIFIED` | No closed earnings seal | Refresh Close — not Restatement Queue |
| `FUEL_ENGINE_DRIFT` / `TOLL_ENGINE_DRIFT` / `EARNINGS_ENGINE_DRIFT` | Closed seal ≠ fresh engine | **Refresh** Close Week (sync force-reseals closed→closed, then rebuilds). Not Restatement Queue. |
| `TOLL_SPEND_MISMATCH` / `TOLL_CHARGED_MISMATCH` | Period toll_* ≠ seal | **Refresh** Close Week (sync reseals + rebuilds). Do not SQL-align periods. |
| `PERIOD_REBUILD_FAILED` | Rebuild after seal failed for one+ drivers | Retry Refresh / Close; check worker limits |
| `TOLL_EVENT_ORPHANED` | Toll money events don’t match live tolls | Re-open if closed → **Repair orphan toll events** → force-seal tolls (not Restatement) |
| `TOLL_EVENT_MISSING` | Live tolls have no money event | Re-save / re-post those toll rows (or clear quarantine and save), then rebuild |
| `TOLL_EVENT_INELIGIBLE` | Events still on quarantined/voided rows | Re-open if closed → **Review sample & repair** → force-seal (not Restatement) |
| `TOLL_EVENT_AMOUNT_MISMATCH` | Event amount ≠ live ledger | Same repair path as ineligible (reverse + re-post) |
| `TOLL_PAYMENT_METHOD_UNKNOWN` | Toll rows missing cash/tag payment method | Set payment method on each row, then rebuild |
| `TOLL_SPEND_SPLIT` | `toll_spend ≠ cash + tag` | Rebuild period after statement cutover; check tag/cash overwrite |
| `*_MISMATCH` | Period ≠ independent statement | Investigate drift; do not force-close |
| `CASH_SOURCE_MISMATCH` | Trip CSV vs ledger cash | **Accept statement cash** on Close Week (reason required), or re-import the Uber bundle. Settlement already uses statement cash. Not Restatement; not SQL. Supersedes one-off `pass5CashAck`. |
| `SETTLEMENT_PNL_MISMATCH` | Desk fleet P&L ≠ sealed statement P&L | Align projection to statements / reseal |
| `BUSINESS_WEEK_PNL_UNAVAILABLE` | Warn — no closed statements to build P&L | Finish lane recon / Refresh sync first |
| `SETTLEMENT_DRIVER_OWES` / `SETTLEMENT_FLEET_OWES` / `SETTLEMENT_CASH_HELD` | Cash residual | Collect / Pay on Cash desk, then Refresh |

## Uber statement cash ≠ trip cash (`CASH_SOURCE_MISMATCH`)

Uber fleet imports are a **bundle**: statement cash comes from `payments_driver` (`financeCore.uberCash`); trip sum from payment lines (`financeCore.uberTripCash`). Settlement already trusts statement cash.

1. On Close Week, open the rose banner — see driver, statement $, trip $, difference.
2. Prefer **Accept statement cash** with a short reason (does not change collected money; clears the close block).
3. Or **Re-import Uber bundle** if trips/payments look incomplete.
4. Do **not** use Restatement Queue or SQL. After Accept, Refresh → Close week when blockers = 0.
5. If rebuild later changes the mismatch beyond ε, Accept is invalidated and must be done again.

## Ops scan — open weeks with toll period ≠ seal (read-only)

Use [toll-period-seal-drift-scan.sql](./toll-period-seal-drift-scan.sql) and [unpublished-lane-statements-scan.sql](./unpublished-lane-statements-scan.sql). Heal via Close Week sync (`scripts/heal-week-close-sync.mjs` or open each week on Close) — the scans do **not** mutate data.

Preview field `tollPeriodSealDriftCount` (set on sync) is the same class of metric for the selected week.

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
