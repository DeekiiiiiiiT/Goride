# Pass 4 shadow run — week statements vs projection — 2026-09-07

**Project:** GoRide (`csfllzzastacofsvcdsc`)  
**Org:** `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`  
**Driver:** `73e5b1dc-01b4-45ee-a34a-25a3256b9841` (only active DFP driver in window)  
**Window:** `2026-08-10` … `2026-08-31`  
**Flag:** `PROJECTION_READS_WEEK_STATEMENTS` remains **OFF** (gate failed)

Method: latest `closed`/`draft` `week_statements` per lane vs `ledger.driver_financial_periods` columns (1¢ tolerance), same field map as `shadowCompareStatementsVsProjection`.

## Gate result: **FAIL — do not flip flag yet**

| Week | Fuel | Toll | Earnings | Verdict |
|------|------|------|----------|---------|
| 2026-08-10 | tie | tie | tie | **CLEAN** |
| 2026-08-17 | tie | tie | tie | **CLEAN** |
| 2026-08-24 | drift | drift | tie | **DIRTY** |
| 2026-08-31 | tie | **missing statement** | tie | **INCOMPLETE** |

## Clean weeks (ready for cutover)

### 2026-08-10
All lanes closed and match projection (fuel / toll / earnings).

### 2026-08-17
All lanes closed and match projection.

## Dirty week — 2026-08-24

Standing statements are **ahead** of the period row (independent seals ran; DFP not rebuilt afterward).

| Field | Statement (closed) | Period projection | Δ (stmt − period) | Statement provenance |
|-------|-------------------:|------------------:|------------------:|----------------------|
| fuel.driverShare | 5,784.98 | 0.00 | +5,784.98 | `fuel_week_seal:consumption_strip` v3 |
| fuel.companyShare | 29,211.62 | 14,213.32 | +14,998.30 | same |
| toll.totalSpend | 5,920.00 | 6,210.00 | −290.00 | `toll_week_seal_events` v6 |
| toll.chargedToDriver | 2,190.00 | 0.00 | +2,190.00 | same |
| toll.reimbursed | 8,350.00 | 3,605.00 | +4,745.00 | same |
| earnings.* | (tie) | (tie) | 0 | `close_precondition` v1 |

**Written reason (accepted residual until rebuild):** Period columns still reflect earlier auto-seal / pre-events netting. Closed statements are the independent sources Close Week trusts. A `rebuildDriverFinancialPeriod` for this driver-week (flag still off) should either (a) recompute projection to match events, then re-shadow, or (b) after flag-on, take statement amounts as SSOT on rebuild.

Fuel history for this week: v1 period-copy → v2 rebuild → **v3 consumption_strip (standing)**.  
Toll history: v1 period columns → multiple event reseals → **v6 events (standing)**.

## Incomplete week — 2026-08-31

| Lane | Status |
|------|--------|
| fuel | closed, ties (0 / 0) |
| earnings | closed, ties |
| toll | **no statement** (period toll fields also 0) |

If the week truly has no toll activity, seal may correctly skip. Close Week will still raise `TOLL_STATEMENT_MISSING` unless a zero-activity closed toll statement is published or close treats zero-toll weeks as N/A. **Follow-up:** confirm zero toll activity; if yes, publish an explicit zero toll statement or allow missing toll when period toll spend/charged ≈ 0.

## Recommendation

1. **Do not** set `PROJECTION_READS_WEEK_STATEMENTS=true` yet.
2. Rebuild DFP for org `8cfa606a-…` driver `73e5b1dc-…` weeks `2026-08-24` (and seal toll for `2026-08-31` if needed).
3. Re-run: `node scripts/shadow-week-statements.mjs --since=2026-08-10 --org=8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`
4. Flip the flag only when the script exits 0 (gate PASS).

## Re-run script

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/shadow-week-statements.mjs --since=2026-08-10
```

Writes `docs/finance-recon/<date>-shadow-week-statements.json` and exits `2` on any drift or missing lane.
