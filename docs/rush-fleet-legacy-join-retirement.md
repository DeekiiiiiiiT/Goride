# Legacy `POST /driver/join-fleet` retirement

`LEGACY_DRIVER_JOIN` defaults **off**. The route returns 403 with invite-code guidance.

## Telemetry

Structured log: `[JoinFleet] legacy call` with `legacyEnabled`, `userId`, `fleetId`.

Query logs (30-day window):

```
[JoinFleet] legacy call
```

## Retirement criteria

1. `legacy_driver_join` flag off globally for 30 days.
2. Zero `[JoinFleet] legacy call` entries in that window.
3. `node scripts/check-no-join-fleet-client.mjs` green (no client references).

## Removal steps

1. Delete route block in `supabase/functions/_fleet-server/index.tsx` (`/driver/join-fleet`).
2. Remove `LEGACY_DRIVER_JOIN` from feature flag catalog if unused.
3. Tighten `check-no-join-fleet-client.mjs` to forbid any `join-fleet` string in driver app.

Until criteria met, keep route for observability only.
