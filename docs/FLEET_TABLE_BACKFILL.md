# Fleet KV → Postgres — PERMANENT CUTOVER + KV RETIRED

Fleet business domains read and write `fleet.*` tables only.

- `FLEET_READ_TABLE_*` → always on
- `FLEET_TABLE_WRITE_*` → always on
- `LEGACY_KV_WRITE_*` → always off

Ephemeral KV remains for locks, ratelimits, dashboard cache keys, offset markers, dedup keys, etc.

## Status (2026-08-11)

1. Gap backfill completed for domains that were table-behind (import meta/insights, banking, vendors, equipment, checkins, etc.).
2. Alias-prefix domains (`expense_vendor` ⊆ `platform_vendor`, `expense_category` ⊆ `platform_expense_category`) are unique-entity-parity correct even when raw KV key counts were higher.
3. **KV retirement completed:** 5,526 mapped keys backed up to `fleet_kv_backup:{domain}:{originalKey}` then deleted from live prefixes.
4. Post-retire verification: original prefixes empty; `fleet.drivers` / `vehicles` / `trips` / `transactions` counts intact; live `/drivers`, `/vehicles`, `/trips` still 200.

## Ops

Backfill (idempotent): `POST /admin/migrate-fleet-all-from-kv`  
Parity: `GET /admin/parity` (expects `kvCount=0`, `tableCount` = live rows after retire)  
Retire (already done): `POST /admin/retire-fleet-kv-prefix` with `{ domain, confirm: "RETIRE_KV_<DOMAIN>" }`

Factory reset: wipe `FACTORY_RESET_FLEET_TABLES` + remaining active `FACTORY_RESET_PREFIXES` (including `fleet_kv_backup:`).
