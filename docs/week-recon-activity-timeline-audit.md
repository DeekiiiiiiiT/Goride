# Week Reconciliation — Uber activity timeline (audit + build plan)

**Rev 2 · 16 Nov 2026** · Own audit (not part of `docs/week-reconciliation-architecture-audit.md`). Closes WRA-47 from that audit along the way.

## Status (Rev 2)

**Code complete (C1 + UI1–UI3), not committed or live.** Next: go live (migration + push), then G3 on real weeks.

UI round (Claude, 16 Nov):
- **UI1:** step 1 lists "Uber activity timeline" with an **Optional** chip (every optional source now shows it) and the 7 day dots. **Upload** opens the same Uber upload under that card. The upload box now says "Add each driver's activity timeline here too — with the reports or on its own." (`ReconSourcesStep.tsx`, `CloseWeekUberReimportDialog.tsx`)
- **UI2:** in Tolls → "Tolls with no trip", an offline crossing gets a red "Driver offline at 11:30 AM · likely personal" mark, and **Driver pays** becomes the filled first button. The header adds "N crossed while the driver was offline · J$…". An online crossing gets the grey note "Driver was online on Uber, waiting or driving to a pickup", and a day without a timeline gets "No activity timeline for this day". (`TollV2ChargeRow.tsx`, `TollV2Sections.tsx`, `types.ts`)
- **UI3:** step 6 "Activity vs trips" shows, per driver, week totals and a 7-day table (Online · Waiting · Driving to pickup · On trip · Trips · Driver cancels · Roam online when used). Trips are checked against Uber's trip file: green "match every day", amber marks with "4 (file 5)", or "trip file not uploaded". Weeks without a timeline keep the old card. (`ReconActivityTimelineCard.tsx`, `ReconTripsEarningsStep.tsx`, `reconApi.ts` `fetchWeekActivityAndTimeline`)
- Tests: `ReconActivityTimelineCard.test.tsx` (5), `TollV2ChargeRow.test.tsx` (+4), `ReconSourcesStep.test.tsx` (+1). All Week Reconciliation + timeline vitest: **133 pass**. No type errors in the changed files.
- Not yet seen on a real screen: this needs the migration and push first (G3).

What Claude's check of Cursor's C1 found and fixed:

| # | Problem in C1 | Fixed |
|---|---|---|
| C1-01 | `driver_status_at` had no `REVOKE` (every other `toll_system` function has one). | Revoked from PUBLIC / anon / authenticated / service_role. Checked locally: anon and authenticated can't run it. |
| C1-02 | It only found timeline rows through a `fleet.drivers` row, so a driver id with no row always read `no_timeline`. | Matches the charge's driver id directly, and also through the driver's id / legacy id. |
| C1-03 | Slack ran one way only: a crossing 4 minutes after "Offline" read offline. Uber and Roam on/off were also mixed, so going offline in Roam while online on Uber read offline. | Online if online on **any** app at any moment within 5 minutes either side. Latest on/off is taken **per app**. |
| C1-04 | The SQL check would have failed: it inserted a `week_key` column that `toll.platform_trips` doesn't have. Its D2 checks only compared fixed words, and it never ran. | Rewritten. Made-up charges go through the real `week_desk`. **13/13 PASS on the local copy.** |
| C1-05 | The step 6 route dropped every Sunday (the window ended Sunday 04:59 UTC), read at most 1000 rows, and showed driver ids instead of names. | The window is Monday 00:00 → next Monday 00:00 Jamaica, starting a day early so an overnight online carries in. Reads are paged and names come from `fleet_drivers`. |
| C1-06 | The route changed `activity` into `{ totals, timeline }`, which would have broken today's step 6 card (it reads `activity.status`). | `activity` keeps its old shape, and `timeline` sits beside it. |
| C1-07 | Hours: "driving to pickup" ran from the last offer to the next start, so stacked trips counted on-trip time twice and the waiting floor hid it. | Rewritten as one state per driver (offline / waiting / driving to pickup / on trip), with stacked trips and offline-mid-trip handled. The real weeks match Uber's own reports: **26 Oct online 54.85 vs Uber 54.87 h, on trip 32.61 vs 32.60**. 19 Oct: 51.58 vs 50.95, on trip 29.76 vs 29.70. |
| C1-08 | The server test fixture was the 12–19 Oct paste under a 26 Oct name, checking only "more than 20 trips". | The fixture is now the real 26 Oct Uber copy. The test checks the per-day trips 7/12/4/13/12/12 = 60, 24 driver cancels, and hours against Uber within 0.25–0.5 h. |
| C1-09 | The wrong-driver check (S3) read the Uber ID only from the old KV record. | It reads `fleet_drivers.uber_driver_id` first, then KV. |
| C1-10 | `recon_routes.ts` imported `weekDayKeys` twice, a compile error that blocks deploy. | Duplicate removed. The remaining type errors in that file are old lines. |
| C1-11 | The week upload helper refused the 19 Oct layout (Date / Time + Uber ID) as "no ID". | Reads both layouts: owner layout newest-first, Date / Time oldest-first. |
| C1-12 | The step 1 Uber dialog sent timeline files into the cash / toll steps, so a timeline-only upload failed ("Need both payments_driver…"). The dialog also closed before its timeline messages could be read. | Timelines are split off. A timeline-only upload works, and the dialog stays open when a timeline fails. |
| C1-13 | Cursor deleted the "Rebuild week books" confirm (out of scope). | Restored. Pop-ups are handled in `docs/no-browser-popups-audit.md`. |
| C1-14 | Deleting `node_modules/.deno` after the Deno tests left broken links (`npx supabase`, vite-node). | Owner: stop the local apps, then `pnpm install` at `C:\Roam\Goride`. |

Tests now: vitest **118/118** (timeline, upload helper, file detection, Data Center panel, every Week Reconciliation test). Deno **11/11**. SQL check **13/13** on the local copy (migration applied there).

## Goal (one sentence)

Every week, the Uber app activity timeline is uploaded inside Week Reconciliation with the other Uber files, matched to its driver by Uber ID, and used to show real working hours in step 6 and to flag tolls crossed while the driver was offline in step 3.

## Product rules (owner, 16 Nov)

1. **Never pick a driver.** Every Uber file finds its driver from the Driver UUID in the file, the same as all other Uber uploads. No ID in the file → a plain message saying which columns to add. ID on no driver → a plain message saying to save it on the driver's Profile. Nothing imports until it matches.
2. **Owner's file layout = Uber's own copy, with 3 columns in front**: `Driver UUID, Driver first name, Driver last name, Activity`. The ID and names are on the first row only, and the rest of the `Activity` column is Uber's text exactly as copied (newest first, `October 31 2026` day lines). The AI-fixed layout (`Date, Time, Activity / Event, Duration / Status` + UUID) keeps working.
3. **Offline tolls are flagged, never auto-charged.** A tag crossing made while the driver was offline (and on no trip on any platform) is flagged in step 3 with **Driver pays** as the first button. The owner decides each one.
4. **No effect on pay.** The timeline never changes share, tiers, tips, quota or the settlement amount. It shows hours and flags tolls, nothing else. Personal kilometres and fuel wait for telematics.
5. **Never blocks Close.** The timeline is an *optional* step 1 source, and the step 6 card is read only (WRA-21 rule).
6. **One screen.** Upload happens inside Week Reconciliation (Uber upload in step 1). Data Center keeps its own Activity timeline panel for one-off uploads.

## What the real files show (checked 16 Nov)

| Week | File | Events | Trips completed (timeline) | Trips completed (Uber trip file) |
|---|---|---|---|---|
| 19 Oct | AI-fixed layout | 429 rows | 61 (20 Oct 11 · 21 Oct 6 · 22 Oct 16 · 23 Oct 16 · 25 Oct 12) | 61, every day equal |
| 26 Oct | Owner layout (Uber copy + 3 ID columns) | 481 | 60 (26 Oct 7 · 27 Oct 12 · 28 Oct 4 · 29 Oct 13 · 30 Oct 12 · 31 Oct 12) | 60, every day equal |

The timeline shows driver cancels the trip file hides: 19 Oct week 19 vs 2, 26 Oct week 24. It also shows exact offline times.

## Done already (R0, 16 Nov, by Claude, not committed)

- `apps/fleet/src/utils/uberActivityTimelineParse.ts`: reads the owner layout (`splitUberTimelineCsvWithDriverColumns`, `uberTimelinePasteFromDriverColumns`). On the real 26 Oct file it gives 481 events, 60 trips and 0 warnings.
- `apps/fleet/src/components/imports/UberActivityTimelineImportPanel.tsx` (Data Center): the driver comes only from the file, with no picker and no paste box. It shows the red messages from rule 1, and Import stays off until the driver matches.
- Tests: `uberActivityTimelineParse.test.ts` (14) and `UberActivityTimelineImportPanel.test.tsx` (3) pass.

---

## Database

| # | Finding | Fix |
|---|---|---|
| D1 | Nothing in the database can say what a driver was doing at a given minute. | New `toll_system.driver_status_at(p_company uuid, p_driver_id text, p_vehicle_id text, p_at timestamptz, p_precision text) RETURNS text`, giving one of `on_trip`, `online`, `offline`, `no_timeline` or `unknown`. Rules, in order: (1) `p_precision = 'date_only'` or no driver → `unknown`. (2) Any `toll.platform_trips` row (any platform) for that driver **or** vehicle whose window `request_at − approach_minutes … coalesce(dropoff_at, pickup_at, request_at) + post_trip_minutes` (same minutes as `MATCHER_CONFIG_V1`) holds `p_at` → `on_trip`. (3) No `fleet.driver_activity_events` row with `service_line = 'uber'` on that Jamaica day for the driver → `no_timeline`. (4) The latest `went_online` / `went_offline` event at or before `p_at + 5 minutes`, on any service line (Uber or Roam), decides the answer: `went_online` → `online`, `went_offline` or none → `offline`. The 5 minutes allow for clock differences between the tag and Uber. Resolve the driver the same way `week_desk` does (`d.id::text = driver_id OR d.legacy_kv_id = driver_id`). STABLE, SECURITY DEFINER, `search_path = ''`. No grants to `anon` or `authenticated`. |
| D2 | `toll_system.week_desk` gives each charge no driver status. | Each charge in `week_desk` gets two new fields: `driverStatus` (from D1) and `offlineFlag` (true only when `section = 'no_trip'`, `state = 'pending'` and `driverStatus = 'offline'`). The desk `summary` gets `offlineFlagged` (count) and `offlineFlaggedMinor` (sum of `openMinor`). Everything else in the desk stays byte-for-byte the same. |
| D3 | Step 1 can't show timeline coverage, because `recon.compute_source_coverage` has no timeline source. | Add `uber_activity_timeline` to `daily_sources`. `recon._day_has_daily_rows` returns true for it when any `fleet.driver_activity_events` row with `source = 'uber_app_activity'` exists for the org on that Jamaica day. |
| D4 | Checks. | New `supabase/tests/week_recon_activity_timeline_checks.sql` with made-up rows in a transaction that ends in ROLLBACK. It covers each D1 answer, the 5-minute slack, a crossing inside an InDrive trip (→ `on_trip`), a day with no timeline (→ `no_timeline`), D2's flag set only on a pending no-trip charge, and D3 covered vs missing days. Every check prints `PASS`/`FAIL`. |

## Server (edge)

| # | Finding | Fix |
|---|---|---|
| S1 | Step 6 (`recon_activity.ts` + `GET /runs/:line/:weekKey/activity`) only reads Uber's weekly hour totals. | New pure module `supabase/functions/_fleet-server/recon_activity_timeline.ts`: `shapeWeekTimeline(events, trips, weekKey, tz)` returns, per driver and per Jamaica day: `onlineHours`, `enrouteHours` (`offer_accepted` → `job_started`), `onTripHours` (`job_started` → `job_completed`), `waitingHours` (online − en route − on trip, never below 0), `tripsCompleted` (timeline), `tripsInUberFile` (`fleet.trips` platform Uber, status completed, that day), `driverCancels`, `riderCancels`, `offersAccepted`, and `roamOnlineHours` (Roam `went_online` → `went_offline`, which closes WRA-47). Rules: an online stretch crossing midnight is split at Jamaica midnight, and an online stretch with no `went_offline` ends at that day's last event (never invent time). The activity route returns `{ totals (existing), timeline: { status: 'none' \| 'ok', drivers[] } }`. The old `driverActivity` totals stay as they are. |
| S2 | The import route `POST /drivers/:id/activity/import-uber-timeline` refuses when the `driver_activity` feature flag is off, so the week upload could fail with no reason the owner can see. | The import route no longer checks the flag. It only writes `fleet.driver_activity_events`, and the flag stays for the Driver → Activity tab. |
| S3 | The import route accepts any driver id from the caller. | The body carries `uberDriverUuid`. The route loads the driver and refuses with 409 `uber_id_mismatch` ("This timeline belongs to another driver") when the driver's saved Uber ID differs. |
| S4 | The source manifest has no timeline row. | Add `uber_activity_timeline` (line `rideshare`, kind `upload`, label "Uber activity timeline", coverage `daily_rows`, feeds `["trips_earnings","tolls"]`, `optional` when the rideshare line is on and the org has Uber drivers) to `packages/finance-core/src/reconSources.ts` **and** `supabase/functions/_fleet-server/recon_sources_mirror.ts` (drift test `recon_sources_mirror.drift.test.ts` must stay green). |
| S5 | Tests. | `recon_activity_timeline.test.ts`: the 26 Oct real file is parsed (shared parser fixture copied to `supabase/functions/_fleet-server/fixtures/uber-timeline-2026-10-26.txt`, the Uber text without the ID columns) and gives 60 trips (7/12/4/13/12/12), with online/on-trip hours > 0 each worked day. Plus made-up cases for the midnight split and a missing `went_offline`. Route test for S3's 409. |

## Upload path inside Week Reconciliation (data, no new screen)

| # | Finding | Fix |
|---|---|---|
| U1 | `apps/fleet/src/utils/csvHelpers.ts` `detectFileType` doesn't recognise the owner layout (no Date/Time columns), so a timeline dropped into the step 1 Uber upload is called something else or `generic`. | Detect `uber_activity_timeline` when the headers hold a Driver UUID / first name / last name column **and** an `Activity`/`Event` column with no `Date`/`Time` columns. This rule goes before the driver-activity rule. Also detect a headerless Uber copy (first line `Month D YYYY`) as `uber_activity_timeline`, which then shows rule 1's "add the columns" message. |
| U2 | The step 1 Uber dialog (`CloseWeekUberReimportDialog`) skips timeline files (`csvHelpers.ts` line ~1200 drops them from metrics, which is right) and imports nothing for them. | After the Uber reports commit, each `uber_activity_timeline` file is imported on its own: read the Uber ID (`extractUberTimelineDriverIdentity` or the split helper), find the driver by saved Uber ID in the roster, and call `api.importUberActivityTimeline(driverId, { text, timeZone, assumeChronological, uberDriverUuid })`. A timeline failure never undoes or blocks the Uber reports. The dialog result lists each timeline file as `Imported for <driver> (<n> days)` or the rule-1 message. Put the logic in a new pure helper `apps/fleet/src/utils/importUberTimelinesForWeek.ts` with unit tests. |
| U3 | Re-uploading the same week replaces that driver's timeline for the dates in the file (existing route behaviour). | Keep it. Test that a second upload of the same file leaves the same event count. |

## Screens (Claude builds these, not Cursor)

No new page. Three small additions to existing step screens, in their current look:

| # | Where | Add |
|---|---|---|
| UI1 | Step 1 source list | A row "Uber activity timeline · optional" with the usual 7 day dots (covered or missing). Its Upload button opens the same Uber upload. |
| UI2 | Step 3 Tolls, "No trip" section | On a charge with `offlineFlag`: a red chip "Driver offline at <time>". **Driver pays** comes first and is filled, **Fleet pays** second. The section header shows "<n> crossed while offline · J$<sum>". A charge with `driverStatus = 'no_timeline'` gets a grey note "No activity timeline for this day". |
| UI3 | Step 6 "Activity vs trips" | Per driver, a 7-day table: Online · Driving to pickup · On trip · Waiting · Trips (timeline vs Uber file, amber when different) · Driver cancels · Roam online. Weeks with no timeline keep today's card. |

Each screen change comes with its test in the same round (`ReconSourcesStep.test.tsx`, `TollV2ChargeRow.test.tsx`, a new `ReconActivityTimelineCard.test.tsx`).

## Gates

- G1: `pnpm --filter fleet exec vitest run` for the changed files, and `deno test` for the new server tests. All green.
- G2: `supabase/tests/week_recon_activity_timeline_checks.sql` passes on the local Docker copy (all PASS).
- G3: on the owner's real data, upload the 19 Oct and 26 Oct timelines in step 1. Step 6 shows 61 and 60 trips with every day equal to the Uber file. Step 3 shows offline flags only on no-trip crossings, and a sealed week is unchanged.

## Build order

1. **C1 (Cursor): D1–D4 + S1–S5 + U1–U3.** Data and server only. Prompt: `docs/week-recon-activity-timeline-build/cursor-C1.md`.
2. **Claude: check C1** (read the files, run the tests, then run the SQL check locally).
3. **Claude: UI1–UI3** with their tests.
4. Owner: run the migration, upload the 19 Oct and 26 Oct timelines in step 1, and send screenshots of steps 3 and 6 (G3).
