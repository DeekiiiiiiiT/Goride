# Trip Analytics: what's left

**Rev 8 · 2026-10-22** · E1 is closed and verified in production. E2 and E3 are built but not shipped. Earlier revisions are in git history.

## Open

| # | Sev | Item | Next step |
|---|---|---|---|
| F1 | **Medium** | **The closed-week fix (E2) and the driver-app fix (E3) are still only on your machine.** Neither is committed and neither is deployed. **Until they ship, the nightly check still compares closed weeks against today's trips, and drivers on the current app version don't get the closed-week handling.** | Commit everything below, rebuild and deploy `finance-recon`, `fleet-core` and the function that runs week close, then ship a new driver-app build. |

What's not committed or deployed:

- **New files (untracked):**
  - `packages/finance-core/src/closedWeekLiveCompare.ts` and its test
  - `apps/driver/src/utils/closedWeekTrip.ts` and its test
- **Edited but not committed:**
  - `driver_financial_periods.ts` (probe-trip filter)
  - `week_close.ts` (skip frozen weeks)
  - `finance-recon/index.ts` (open weeks only)
  - 6 driver-app files
- **Deployed functions are older than these changes:**
  - `finance-recon` v26 was deployed on Oct 21; the edits are from Oct 22, 10:58.
  - The local `fleet-core` bundle was built at 09:21, before the 10:58 edits, and it has no `isProbeTripRef`.

## Verified this pass

- **Aug 24–30 (Kenny) is corrected in production.**
  - 68 trips and J$96,442.57 gross, which matches the trips table.
  - Driver share J$33,474.90 and fleet share J$62,167.67. The driver share dropped J$2,275, which is 35% of J$6,500.
  - Still owed J$5,268.32. J$8,277.32 already paid stays applied, and the week is still closed.
  - Earnings statement v10 (`probe-trips-removed-after-close`) holds those amounts; v9 is kept as `restated`.
- **All 12 open pay weeks still match the trips table exactly.**

## Not part of this audit

There are 4 open finance drift alerts, all from statement-vs-engine checks run in September. Two are Jan 12 fuel share (closed week) and two are Sep 7 tolls (open week). They belong to the fuel and toll audits.

## Data limits (unchanged)

Uber and InDrive imports have no request, accept, arrive or start times, no rider ids, ratings or promos, and Uber has no GPS. The funnel, wait time and repeat-rider metrics stay Roam-only.
