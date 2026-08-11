# Fleet native cutover — Phase 0 snapshot

Captured: 2026-08-11 (production hardening start)

## fleet.* row counts (parity recheck after hardening — unchanged)

| table | count |
|-------|------:|
| checkins | 31 |
| claims | 195 |
| drivers | 3 |
| equipment | 17 |
| fuel_entries | 425 |
| import_batches | 34 |
| maintenance_logs | 1 |
| payment_ledger_lines | 60 |
| stations | 207 |
| transactions | 1464 |
| trips | 2933 |
| vehicles | 2 |

## KV backup archive

- `fleet_kv_backup:%` keys remaining: **kept** (user chose not to delete yet)
- Live business prefixes empty; `maintenance_log:` retired into `fleet.maintenance_logs`

## Main fleet org (null-org backfill target)

`8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`

## Post-deploy smoke (2026-08-11)

All 200: `/batches` (34, ~2.6s), `/batches/:id/delete-preview` (~3.4s, no OOM), `/fuel-entries`, `/trips`, `/claims` (195), `/equipment` (17), `/payment-ledger-lines` (60), `/dashboard/init`, `/toll-ledger` (0 rows expected).
