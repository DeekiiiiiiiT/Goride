# Fleet KV → Postgres — PERMANENT CUTOVER

Fleet business domains read and write `fleet.*` tables only.

- `FLEET_READ_TABLE_*` → always on
- `FLEET_TABLE_WRITE_*` → always on
- `LEGACY_KV_WRITE_*` → always off

Ephemeral KV remains for locks, ratelimits, dashboard cache keys, offset markers, etc.

## Ops

Backfill (idempotent): `POST /admin/migrate-fleet-all-from-kv`  
Parity: `GET /admin/parity`

Old KV rows can stay as archives; they are no longer the source of truth.
