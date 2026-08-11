# Fleet KV → Postgres migration runbook

Zero-downtime strangler for every fleet domain off `kv_store_37f42386` into `fleet.*`.

## Flags (per domain)

| Flag | Default | Meaning |
|---|---|---|
| `FLEET_TABLE_WRITE_<DOMAIN>=1` | ON | Mirror KV upserts/deletes into `fleet.<table>` |
| `FLEET_READ_TABLE_<DOMAIN>=1` | OFF | Read list endpoints from `fleet.*` |
| `LEGACY_KV_WRITE_<DOMAIN>=0` | ON (write KV) | Stop writing the KV prefix |

Domain names are uppercase with underscores, e.g. `DRIVERS`, `TOLL_LEDGER`, `PAYMENT_LEDGER_LINES`.

## Per-domain cutover checklist

1. Deploy edge with dual-write ON (default).
2. Backfill:
   ```http
   POST /make-server-37f42386/admin/migrate-fleet-domain-from-kv
   { "domain": "drivers" }
   ```
   Or all: `POST .../admin/migrate-fleet-all-from-kv`
3. Verify parity:
   ```http
   GET /make-server-37f42386/admin/parity/drivers
   GET /make-server-37f42386/admin/parity
   ```
4. Soak with write-mirror only (reads still KV).
5. Flip read: set `FLEET_READ_TABLE_DRIVERS=1`, redeploy, smoke UI.
6. Stop KV writes: `LEGACY_KV_WRITE_DRIVERS=0`.
7. Retire KV prefix (after backup):
   ```http
   POST /make-server-37f42386/admin/retire-fleet-kv-prefix
   { "dryRun": true, "domain": "drivers" }
   { "confirm": "RETIRE_KV_DRIVERS", "domain": "drivers" }
   ```
   Backup keys land at `fleet_kv_backup:drivers:driver:…`.

## Rollback

- Before step 7: set `FLEET_READ_TABLE_<DOMAIN>=0` (reads KV again).
- After step 7: restore from `fleet_kv_backup:<domain>:` keys into original keys; re-enable `LEGACY_KV_WRITE_<DOMAIN>`.

## Observability

`fleet.dual_write_metrics` logs ok/fail/skip per upsert/delete.

## KV left by design (do not table)

`lock:`, `ratelimit:`, `filter_stats:`, `dashboard:init:data`, `feature_flag_stats:`,
`*_backfill_run:`, `toll_pnl_offset_marker:`, `fuel_pnl_offset_marker:`, `toll_bridge:`, `error-log:`.

## Order

drivers/vehicles → trips/imports → tolls → fuel → expenses/banking → policy → config.
