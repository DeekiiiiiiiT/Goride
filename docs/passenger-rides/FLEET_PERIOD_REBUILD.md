# Fleet financial period rebuild (Layer B backfill)

**Do not** insert Start Trip / Manual Entry into `rides.ride_requests` or Roam Cash-in-Hand.

When Trip Analytics and Cash Wallet disagree for a driver week (e.g. Kenny), rebuild Layer B periods only.

## API (fleet server)

```http
POST /make-server-37f42386/driver-financial-periods/rebuild
Authorization: Bearer <service or admin JWT>
Content-Type: application/json

{ "driverId": "<uuid>", "periodAnchor": "YYYY-MM-DD" }
```

- Omit `periodAnchor` to rebuild current/open weeks per server defaults.
- Run **one driver first**, compare Cash Wallet call outstanding vs Trip Analytics passenger cash, then expand.

## Bulk backfill

```http
POST /make-server-37f42386/driver-financial-periods/backfill
{ "driverId": "<uuid>", "dryRun": true }
```

Re-run with `"dryRun": false` after reviewing the dry-run payload.

## Kenny verification checklist

1. Confirm trips exist in fleet KV with correct `cashCollected` / payment method.
2. Rebuild periods for that driver’s week Mondays.
3. Cash Wallet “cash still owed” / passenger cash matches Trip Analytics for the week.
4. Driver app **Fleet Settlement** shows the same weeks (client calc from trips + txs).
5. Driver app **Roam Earnings** stays $0 if there were no passenger-app Roam trips.

See [`MONEY_LEDGER_RULES.md`](MONEY_LEDGER_RULES.md).
