# Uber CSV: driver_activity (two different things)

## A) Official weekly `REPORT_TYPE_DRIVER_ACTIVITY` (Overview Time Metrics)

Uber Fleet portal period report — **one row per driver**, totals only. Detected as file type `uber_driver_activity`. Feeds Driver Overview → Time Metrics via `DriverMetrics` (`onlineHours` / on-trip). Does **not** fill the Activity tab timeline.

Paste CSV data below (header row + sample rows):

```csv
Driver UUID	Driver first name	Driver last name	Trips completed	Time online (days : hours: minutes)	Time on trip (days: hours : minutes)
52ff47da-ef48-41b8-93d5-80a09b85ce5b	KENNY GREGORY	RATTRAYCAS	99	2:13:09	1:10:52

```

## B) Uber app activity timeline (Activity tab)

Uber does **not** export a per-event activity CSV. Operators copy-paste the driver-app activity log (or build an Excel from it). Import path:

- Data Center → Uber → **Activity timeline** panel (paste or `.txt` / `.csv` / `.xlsx`)
- Pick the driver (required — paste has no UUID)
- `POST …/drivers/:id/activity/import-uber-timeline`
- Writes `fleet.driver_activity_events` with `source=uber_app_activity`, `service_line=uber`

Example paste shape:

```
October 18 2026
Offline
10:57 AM
42m
Online
10:15 AM
37m
Accepted 1 trip
09:37 AM
Trip completed
10:13 AM
19m
…
```

Parser: `apps/fleet/src/utils/uberActivityTimelineParse.ts` (Deno twin under `_fleet-server`).

**Do not** drop a timeline Excel into the main trip/payment merge — filenames like `Driver_Activity*.xlsx` are no longer auto-classified as the weekly hours report unless headers match Time online / Driver UUID.
