# Earnings History Read Model

## Principles

1. History never auto-loads full lifetime weeks/months.
2. History uses the Overview date range when available.
3. Default is limited (hard caps + `hasMore`).
4. Weekly grain prefers `driver_financial_periods` (`mode=periods`).
5. Daily/monthly still use date-scoped ledger (`mode=ledger`).

## API

`GET /ledger/driver-earnings-history`

| Param | Meaning |
|---|---|
| `driverId` | Required |
| `periodType` | daily \| weekly \| monthly |
| `startDate` / `endDate` | Required for performance; defaults to last 7 days |
| `mode` | `periods` (default weekly SSOT) or `ledger` |
| `limit` | Max rows (default 500) |
| `cursor` | Period start / anchor for next page |

## Response envelope

```json
{
  "success": true,
  "data": [],
  "durationMs": 123,
  "readModel": "driver_financial_periods",
  "hasMore": false,
  "nextCursor": null,
  "truncated": false
}
```

## Phases

| Phase | Status |
|---|---|
| 1 Guardrails (date-scoped, caps, hasMore) | Done |
| 2 Prefer periods for weekly | Done |
| 3 Materialize rollups on write | Helper ready |

## Files

- `supabase/functions/_fleet-server/index.tsx` — route
- `supabase/functions/_fleet-server/earnings_history_limits.ts`
- `supabase/functions/_fleet-server/earnings_period_materialize.ts`
- `apps/fleet/src/components/drivers/DriverEarningsHistory.tsx`
