# Toll golden-master baseline

`toll-analytics-baseline.json` is a snapshot of what the toll system reported on
2026-08-26, taken before any Toll System Remediation change landed.

It exists so that every later phase can answer one question: *did this change only
what it intended to change?* Re-run `baseline.sql` against the same database, diff
the result against the JSON, and every difference should map to a specific,
deliberate fix.

## What the snapshot already shows is wrong

These numbers are the bug, not the target. Do not "preserve" them.

- `byPlaza` is keyed off a free-text `plaza` column that mostly holds the **operator
  name**, not a plaza. `TransJamaica Highways` alone appears under 12 different
  spellings and casings, and 53 usage rows have no value at all. Once `plaza_id`
  is surfaced and backfilled (Phase 2), this collapses to the 12 real plazas.
- `rowsMissingPlazaId: 197` of 262 is the root cause of "Unknown Plaza" dominating
  the Spend-by-Plaza chart.
- `voidedRows: 2` are currently counted in spend totals.
- `plazasWithRates: 0` means geofence detection cannot fire for any plaza.
- `verifiedPlazas: 0` while all 12 plazas are used for live charging.

## Re-capturing

```bash
psql "$DATABASE_URL" -f baseline.sql
```

Keep the original file when re-capturing; add a new dated snapshot alongside it so
the before/after trail survives.
