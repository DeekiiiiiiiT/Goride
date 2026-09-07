# Pass 2 cutover — week statements → projection (2026-09-07)

How to flip from shadow compare to statement-backed projection, then run restatements.

## 1. Shadow (flag off — default)

- `PROJECTION_READS_WEEK_STATEMENTS` is unset / not `true`.
- `rebuildDriverFinancialPeriod` still builds fuel / toll / earnings from the legacy path
  (events + KV / ledger).
- When `week_statements` rows exist for the driver-week, rebuild **always** runs
  `shadowCompareStatementsVsProjection` and logs drifts
  (`[DriverFinancialPeriods] statement shadow drift …`).
- Ops gate: zero (or accepted) drifts for a full org-week before flipping the flag.

## 2. Flag on

Set in the fleet-server / Deno env:

```bash
PROJECTION_READS_WEEK_STATEMENTS=true
```

- Rebuild still computes the legacy projection (for shadow logs).
- Before persist, when closed/draft statements exist, fuel / toll / earnings projection
  fields are **overridden** from statement `amounts_minor` (via `statementAmountMajor`).
- H-9 toll charged already prefers `financial_events`; with the flag on, toll statement
  amounts win for the persisted row.
- Nightly `finance-recon` continues to emit close-invariant + `FUEL_EVENT_MISSING_ACCOUNTS`
  drifts — clear those before trusting statement cutover.

## 3. Restatement queue

- New facts on a **closed** week never overwrite in place: `requestRestatement` publishes
  version `n+1` **draft** that supersedes the closed row.
- API (fleet-server):
  - `GET /settlements/week-close/restatements` — pending draft restatements for the org
  - `POST /settlements/week-close/restatements` — `{ statementId, reason, amountsMinor? }`
- Fleet UI: **Restatement Queue** (`/restatement-queue`) lists driver / week / kind / reason
  with **Close Week** to sign the draft through the normal close path.
- Close Week signs draft statements (including restatements) and freezes the period hash.

## Rollout checklist

1. Publish fuel / toll / earnings statements for a quiet week; run rebuilds; confirm shadow logs clean.
2. Flip `PROJECTION_READS_WEEK_STATEMENTS=true` in staging; rebuild one org-week; compare desk totals.
3. Flip production; watch finance-recon for `FUEL_*` / statement drifts.
4. Use Restatement Queue + Close Week for any post-close corrections.
