# Maintenance overdue digest cron

Daily job posts in-app `alert:*` rows for overdue / due-soon schedule items.

## Endpoint

`POST /make-server-37f42386/maintenance/overdue-digest`

Headers:
- `X-Fleet-Cron-Secret: <FLEET_CRON_SECRET>` (or `X-Rides-Cron-Secret` / `RIDES_CRON_SECRET`)

## Suggested schedule

Daily morning (e.g. `0 13 * * *` UTC ≈ 8am Jamaica).

## Idempotency

Alert id: `maint-overdue:{orgId}:{vehicleId}:{templateId}:{yyyy-mm-dd}`  
Same-day re-runs skip existing keys.

## Ops note

No email/SMS in this phase — managers see alerts in the existing notification bell / Dashboard alerts list.
