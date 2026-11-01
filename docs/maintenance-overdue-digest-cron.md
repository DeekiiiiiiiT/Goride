# Maintenance overdue digest cron

> **Updated:** Nightly maintenance is defined in [fleet-maintenance-logging-audit.md](./fleet-maintenance-logging-audit.md). Prefer `pg_cron` at **07:00 UTC** (02:00 Jamaica) calling `fleet.run_maintenance_nightly_check()`.

Daily job writes `fleet.maintenance_alerts` rows for overdue / due-soon schedule items (notification bell).

## Endpoint

`POST /fleet-ops/maintenance/overdue-digest`  
(or `POST /fleet-ops/maintenance/nightly-run`)

Headers:
- `X-Fleet-Cron-Secret: <FLEET_CRON_SECRET>` (or `X-Rides-Cron-Secret` / `RIDES_CRON_SECRET`)

## Suggested schedule

**07:00 UTC daily** (`0 7 * * *`) — applied via migration `20261101030856_fleet_maintenance_logging.sql` when `pg_cron` is enabled.

Legacy note: older docs suggested 13:00 UTC; Jamaica 02:00 aligns with 07:00 UTC.

## Idempotency

Alert key: `maint:{orgId}:{vehicleId}:{categoryId}:{position}:{yyyy-mm-dd}`  
Same-day re-runs skip existing keys.

## Ops note

No email/SMS in this phase — managers see alerts in the notification bell / Dashboard alerts list.
