# Trip Analytics: what's left

**Rev 5 · 2026-10-22** · D1–D4 are closed. T1–T4 stay closed. Earlier revisions are in git history.

## Open

None.

## Closed this pass

| # | Result |
|---|---|
| D1 | A delete now stops before anything is removed. Imported trips are refused. A closed pay week is refused, and the trip stays. A trip with no pay week can be deleted, and that is not reported as a locked week. An edit of an app-logged trip is refused when the current week or the new date’s week is closed. CSV imports are not blocked by this rule. On a closed week the confirm screen no longer offers Delete. |
| D2 | Sunday fares that had been dated Monday are back on the trip’s week. `manual_1c4f6742` is on Oct 4: Sep 28–Oct 4 is 71 trips, J$91,958.20 gross, cash still J$40,791.60, driver share J$32,101.37. Oct 5–Oct 11 is 63 trips and J$84,612.76 gross. The three Jan 4 Uber cash trips (`1a6f6466-23e8-4c84-8819-58f671581e0a`, `0e47b4ff-b8ef-4da3-b2f7-c95406577caa`, `d5cf1bfa-7d06-402b-85ac-0ae996626398`) are on Dec 29–Jan 4: 97 trips, J$95,776.53 gross, cash still J$59,697.17, driver share J$26,649.43. Jan 5–Jan 11 is 60 trips and J$90,150.07 gross. Closed weeks were not changed. A rebuild now logs any fare that lands outside its trip’s week. |
| D3 | View route stays available when someone cannot edit trips. Edit and Delete stay behind `transactions.edit`. Imported trips still have no menu. |
| D4 | The fuel files are now `20261022133427_fuel_who_pays.sql` and `20261022133437_fuel_route_cache.sql`, matching production. The SQL was not changed. |

## Verified this pass

- Sep 28–Oct 4: 71 trips, J$91,958.20 gross, J$40,791.60 cash.
- Oct 5–Oct 11: 63 trips, J$84,612.76 gross. The J$2,500 fare is no longer on that week.
- Dec 29–Jan 4: 97 trips, J$95,776.53 gross, J$59,697.17 cash.
- Jan 5–Jan 11: 60 trips, J$90,150.07 gross. Those three Sunday fares are no longer on that week.

## Data limits (unchanged)

Uber and InDrive imports have no request, accept, arrive or start times, no rider ids, ratings or promos, and Uber has no GPS. The funnel, wait time and repeat-rider metrics stay Roam-only.
