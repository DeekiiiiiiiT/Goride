# Close Week heal backlog

**Org:** GoRide  
**Flag:** `PROJECTION_READS_WEEK_STATEMENTS=true` (Pass 4 cutover; required for seal→period stamp)

## 2026-09-09 — Engine-drift reseal shipped

**Deployed:** `make-server-37f42386` (fleet-server) with:

- Force closed→closed reseal for fuel / toll / earnings on Close sync when preview hints or `forceAllLaneReseals`
- Slim sync still skips writes on healthy Clear weeks
- Never draft-over-closed from Close sync
- Client maps `*_ENGINE_DRIFT` → force reseal hints on Refresh

**Mass heal:** Skipped this session (ops time). Prefer when ready:

```powershell
.\scripts\heal-week-close-sync.ps1
# or chunked:
.\scripts\heal-week-close-sync.ps1 -Weeks "2025-12-08,2025-12-15,…"
```

Partial Deno heal ran on early weeks only (Dec 8 → Feb 16); not a full backlog pass. Re-run scans after full heal.

## Spot-check (2026-09-09)

| Week | Lane seals (latest) | Notes |
|------|---------------------|--------|
| 2026-02-16 | fuel/toll/earnings **closed** | May still show period↔seal / cash residuals until Refresh + Cash desk |
| 2026-08-17 | fuel/toll/earnings **closed** | Was Clear / close-ready earlier; Refresh should stay slim if Clear |
| 2026-08-24 | fuel/toll/earnings **closed** | Earnings engine drift → **Refresh** (force reseal). Toll identity −$245 → **Tolls recon**, not Restatement Queue |

## Operator path (no Prepare)

1. Open week on Close Week → Refresh  
2. If `*_ENGINE_DRIFT` → sync force-reseals closed→closed  
3. Remaining red: Tolls recon (identity) or Cash desk (collect/pay)  
4. Close when Clear  

See [`2026-09-07-close-week-runbook.md`](2026-09-07-close-week-runbook.md).

## Older scans (pre-reseal)

Toll period drift / unpublished-lane SQL still useful after mass heal. Do not SQL-UPDATE period amounts.
