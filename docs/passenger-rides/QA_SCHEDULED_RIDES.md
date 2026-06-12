# QA matrix — scheduled / reserve rides

Run after enabling `SCHEDULED_RIDES_ENABLED=1` and `VITE_SCHEDULED_RIDES=1`.

## Regression (must still pass)

| Flow | Expected |
|------|----------|
| HomePage on-demand quote → book | Unchanged; status `matching` immediately |
| Trip intents / book-for-others | Unchanged |
| Driver dispatch accept → complete | Unchanged |
| Admin ride ops (immediate rides) | Unchanged |

## Scheduled rides

| Step | Expected |
|------|----------|
| Services → Schedule Ride (flag on) | Real places, quote, time picker |
| Create scheduled 2+ hours out | Status `scheduled`; appears in Activity → Scheduled |
| Active ride hub | Does **not** show scheduled booking |
| Cancel scheduled | Status `cancelled`; removed from upcoming |
| Cron / internal dispatch | Row → `matching`; driver can accept |
| Book on-demand while scheduled exists | Both allowed |
| On-demand active trip at dispatch time | Scheduled dispatch skipped (`system_rider_busy`) |
| Missed dispatch window | Row cancelled (`system_missed_window`) |

## API smoke

```bash
# Quote (JWT)
POST /rides/v1/scheduled-rides/quote
# Create
POST /rides/v1/scheduled-rides
# List
GET /rides/v1/scheduled-rides
# Cron (secret)
POST /rides/v1/internal/dispatch-scheduled-rides
Header: X-Rides-Cron-Secret: $RIDES_CRON_SECRET
```

## Deploy checklist

1. Apply migration `*_scheduled_rides.sql`
2. Deploy `rides` Edge function with `SCHEDULED_RIDES_ENABLED=1`
3. Schedule cron: dispatch every 2 min + existing reconcile-matching
4. Deploy passenger app with `VITE_SCHEDULED_RIDES=1`
