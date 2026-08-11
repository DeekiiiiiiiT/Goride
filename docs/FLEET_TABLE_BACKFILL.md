# Fleet KV → Postgres — PERMANENT CUTOVER (native SQL)

Fleet business domains read and write `fleet.*` tables only.

## Native read layer (2026-08-11 production hardening)

- Hot paths (`/batches`, `/fuel-entries`, `/trips`, `/claims`, `/payment-ledger-lines`,
  `/dashboard/*`) use `queryFleet` / `listByBatch` / `countBy` with real SQL filters.
- Legacy chained builders use `fromKvStore()` in `fleet_sql_bridge.ts` (SQL pushdown —
  **not** full-prefix memory load). The old `fleet_kv_query_compat` Proxy wrap is gone.
- `maintenance_log:` migrated to `fleet.maintenance_logs`.

## Ops

- Route map: [FLEET_DOMAIN_ROUTE_MAP.md](./FLEET_DOMAIN_ROUTE_MAP.md)
- Snapshot: [FLEET_NATIVE_CUTOVER_SNAPSHOT.md](./FLEET_NATIVE_CUTOVER_SNAPSHOT.md)
- Parity: `GET /admin/parity`
- Factory reset: wipe `FACTORY_RESET_FLEET_TABLES` + remaining `FACTORY_RESET_PREFIXES`
- **Do not delete `fleet_kv_backup:*` until an off-box copy is confirmed**
