# Trip Analytics: close-out

**Rev 3 closed · 2026-10-22** · R1–R12 from Rev 2 stay closed. T1–T4 are done.

| # | Sev | Result |
|---|---|---|
| T1 | High | Ledgers → Trips can edit, delete, and view the route for trips logged in the app. Uber, InDrive, Lyft, and Bolt imports stay read-only. The extra copy `manual_dee530d3` is gone. `manual_664e9f4d` remains. A second save of the same driver, start time, amount, and pickup now keeps the trip that is already there. |
| T2 | Low | The duplicate warning only pairs two completed trips. It now marks 0 trips. |
| T3 | Low | Stage times are calculated (offered, accepted, arrived, started, completed). The funnel card stays hidden. The switch `trip_analytics_roam_funnel` is still off. |
| T4 | — | Trip Analytics was opened on a desktop window and at phone width, before and after the extra trip was removed. |

## Pay week and distance

Week of Mon 28 Sep–Sun 4 Oct, Kenny Gregory Rattray. The week is still open.

| | Before | After |
|---|---|---|
| Gross | J$91,958.20 | J$89,458.20 |
| Cash collected | J$43,291.60 | J$40,791.60 |
| Trips | 71 | 70 |

Driver share and the amount owed were recalculated by the existing week builder. Driver share is J$31,226.37. The driver still owes the fleet for that week; the balance moved with the cash.

Sep 22–Oct 21 completed distance was 3,068.03 km before the extra trip was removed and **3,055.12 km** after. The live site rounds that to whole kilometres (3,068 then 3,055) until the fleet website is published. The page at phone width showed the same figure.

## Verified this pass

- Delete went through the app path. The fare, the analytics row, and the open week all moved together. The week was not reopened.
- On Ledgers → Trips, a driver-logged row offers Edit trip, Delete trip, and View route. An imported Uber row does not. Delete names the date and amount, and says the fare and cash come off the open week. View route opens the map. On a phone-width screen the same three actions sit on the row panel with a 44px tap target.
- The duplicate list no longer includes the Oct 3 pair.

## Data limits (unchanged)

Uber and InDrive imports have no request, accept, arrive or start times, no rider ids, ratings or promos, and Uber has no GPS. The funnel, wait time and repeat-rider metrics stay Roam-only.
