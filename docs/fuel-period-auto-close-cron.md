# Fuel period auto-close cron

Daily job locks eligible Consumption Reconciliation weeks (no open actionables; unexplained under epsilon or gap accepted). Uses the same server finalize job as the UI (inherits NEW-7 partial-fail honesty and second-approver gates when snapshots settle money).

## Endpoint

`POST /make-server-37f42386/fuel/periods/auto-close?orgId=all`

Headers:
- `X-Fleet-Cron-Secret: <FLEET_CRON_SECRET>` (or `CRON_SECRET`)

Query:
- `orgId=<uuid>` — one org
- `orgId=all` — every org with open/ready periods

## Schedule

GitHub Actions: [`.github/workflows/fuel-period-auto-close-cron.yml`](../.github/workflows/fuel-period-auto-close-cron.yml) — daily 14:00 UTC (~09:00 Jamaica). Also `workflow_dispatch` for dry runs.

## Notifications

Writes `fuel_period_audit` action `auto_close` and an in-app `alert:fuel-autoclose:…` KV row for the notification bell.
