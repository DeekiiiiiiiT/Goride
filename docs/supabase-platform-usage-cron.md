# Supabase Platform Usage — hourly sync cron

Keeps Dominion API Command Center → **Supabase Platform** gauges fresh without a manual Sync.

## Endpoint

`POST /functions/v1/make-server-37f42386/api-center/supabase/sync-cron`

Headers (one of):

- `X-Fleet-Cron-Secret: <FLEET_CRON_SECRET>`
- `X-Rides-Cron-Secret: <RIDES_CRON_SECRET>`
- `Authorization: Bearer <same secret>`

## Suggested schedule

Hourly: `0 * * * *` (UTC)

Example (external scheduler / GitHub Action / cron job):

```bash
curl -sS -X POST \
  "https://<project-ref>.supabase.co/functions/v1/make-server-37f42386/api-center/supabase/sync-cron" \
  -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET"
```

## Required secrets

- `ROAM_MGMT_PAT` — Management / platform access token (needs org usage + analytics read)
- `ROAM_PROJECT_REF` — optional GoRide project ref (else derived from platform `SUPABASE_URL`)
- `ROAM_ORG_SLUG` — optional; auto-resolved from Management API when omitted
- `FLEET_CRON_SECRET` or `RIDES_CRON_SECRET`

**Note:** Do not name these `SUPABASE_*` — the dashboard rejects that prefix for custom secrets.

## Notes

- Manual Sync in Dominion is rate-limited to ~1/min; cron uses `force: true`.
- Supabase usage meters can lag up to ~1 hour (same as dashboard).
- Snapshot keys: `api_supabase_usage:latest`, `api_supabase_usage:YYYY-MM-DD`, `api_supabase_plan`, `api_supabase_alerts`.
