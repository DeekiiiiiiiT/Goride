# Driver Activity — ops runbook

## Symptoms

| Signal | Meaning |
|---|---|
| `activity_ingest` logs absent / watermarks stale | Ingest cron dead or edge unauthorized |
| `presence_log` empty while drivers online | Sweeper or transition writes not landing |
| Timeline empty + `coverageHonesty.presenceRecorded=true` | Mapper/vocabulary gap or wrong driver id |
| Drift check `driftCount > 0` | Projection vs `fleet.trips` mismatch for a closed day |

## Jobs (pg_cron)

- `fleet-activity-presence-sweep` — every minute — `SELECT fleet.sweep_stale_presence(300)`
- `fleet-activity-ingest` — every minute — `SELECT private.invoke_fleet_activity_ingest()`
- `fleet-activity-drift-check` — 05:45 UTC daily — yesterday's drift vs trips
- `purge_fleet_activity_400d` — 05:30 UTC daily — retention

Ingest uses `private.fleet_ops_secrets.fleet_cron_secret` + hardcoded project URL (not `app.settings.*`).

## Manual backfill (ACT-19)

```bash
# Prefer cron door (verify_jwt=false)
curl -X POST "$SUPABASE_URL/functions/v1/fleet-activity-cron/backfill" \
  -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Or SQL
SELECT private.invoke_fleet_activity_ingest();  -- incremental
```

Backfill resets watermarks for rides/delivery/presence then re-ingests. Presence history
before Wave 0 cannot be rebuilt — coverage banner must say “presence not recorded.”

## Drift / lag alerts (ACT-20)

- Nightly `fleet-activity-drift-check` → `POST …/internal/activity/drift-check?day=YYYY-MM-DD`
- Alert if: ingest lag > 15m (watermark `updated_at`), zero inserts while source non-empty,
  or `unmapped_event_types` > 0 in ingest results.
- Replay day: call backfill, then drift-check for that UTC day.

## Enable tab

1. Confirm ingest watermarks advancing and projection non-empty.
2. Confirm anon cannot execute activity RPCs / read activity views.
3. Flip KV `feature_flag:driver_activity` enabled (org list or global).
4. UI gets `driver_activity` from `/enterprise/me/modules` (wired from the same flag).
