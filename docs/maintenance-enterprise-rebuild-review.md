# Maintenance — enterprise rebuild review

## §0 Where we are (27 Nov 2026)

**Screens to main (28 Nov): PR #25 (`mm-screens`, clean copy `C:/Roam/Goride-screens` from origin/main).** Screens only: 78 Fleet/Dominion/Driver files + 169 pdf.js cMaps. Nothing under `supabase/`, so the merge redeploys no edge function and can't undo the research/parts server work that is live but not on main. The maintenance server and migrations stay deployed-not-on-main (mm3). Pre-push 7/7; Dominion 335/335, Driver 81/81 in the clean copy. CI pending.

**Build step 16 (revised, DSH design accepted by owner 28 Nov): database + fleet-ops LIVE 28 Nov, first run done; Fleet and Dominion screens in PR #25.**

Hard use = the car drives at least **2× the normal 10,000 km a year** over 90 days (from its odometer), **or** 30% of its trips are under 8 km (20+ trips). Back to normal after 60 days below the line. No readings → no decision. The fleet can keep either answer for 90 days with a reason. The baseline only sorts the cars; the shorter numbers come from the manual.

- **Database:** migration `20261128014142_mm_hard_use_distance_baseline`, paste file `docs/maintenance_rebuild_step16b2_LIVE_apply.sql` (with logbook line). Validator OK.
  - Policy: drops paid lines / slow / fuel / signs; adds `baseline_km_per_year` 10000, `high_use_multiple` 2.0, `min_span_days` 30, `kept_hard_days` 90; window 90, clear 60, min trips 20.
  - Car: `severe_duty_kept_hard_until`, source `fleet_kept_hard` allowed, new cars default to normal; view updated.
  - `mm_decide_hard_use` replaced (odometer + trips only); `mm_hard_use_line_label` dropped. The cron job is not touched: it stays paused.
  - **Rolled-back test on live:** 5179KZ hard use ("19,262 km in 88 days, 8.0× the normal 10,000 km a year · 30% of trips under 8 km"). 1505LM and 5404LK "Waiting for 30 days of odometer readings", normal. Only 5179KZ engine oil and oil filter move, 171,649 → 164,149 km. A second run changes nothing.
- **Server (16c), here + mm3, bundle rebuilt in both (185 routes):** new `maintenance_hard_use_routes.ts`.
  - PATCH `…/maintenance/severe-duty` takes `{ mode: auto | keep_normal | keep_hard, reason }`. Both keeps need 10+ characters. `auto` hands back and re-runs the decision for the company. The old `{ severe_duty }` body from the live Fleet build still works (off = keep normal, on = keep shorter).
  - GET `…/maintenance/hard-use`, plus GET/PUT `/admin/maintenance/hard-use-policy` (PUT owner only, change log with names).
  - Health card: 3 new rows. Deno 5/5 new + guards; type check clean.
- **Fleet (16d), here only:** the drawer shows one line ("Hard use: on · 19,262 km in 88 days, 8.0× … · Checked 28 Nov") and **Change for this car**. The dialog offers Let Roam decide / Use normal schedules / Use shorter schedules, with a reason for both keeps. Add a car: the Hard use / Normal use choice is gone; the step is now "Odometer reading". Vitest 2258/2258.
- **Dominion (16e), here only:** **Hard use rule** card on Part schedules (all 10 limits, owner-only Save, the change log with names); health card rows come from the server. Vitest 55/55.
- **To go live, in order:** 1) paste `docs/maintenance_rebuild_step16b2_LIVE_apply.sql`; 2) from `C:/Roam/Goride-mm3`, deploy fleet-ops; 3) screens go out with the next Fleet/Dominion push; 4) turn the cron job back on.
- **LIVE 28 Nov (steps 1–2):** pasted and fleet-ops deployed. Live check: logbook row, policy 10,000 km / 2× / 90 / 30 / 60 / 20, new view column, new function, old label function gone, both new routes answer 401 without sign-in. Fleet/Dominion screens not pushed.
- **First run 28 Nov 02:13 UTC (owner OK):** cron `mm-hard-use-nightly` back on (`45 6 * * *`), run by hand once. 5179KZ is on hard use ("19,262 km in 88 days, 8.0× the normal 10,000 km a year · 30% of trips under 8 km"). Engine oil and oil filter are next due at 164,149 km (both overdue; odometer 200,932). 1505LM and 5404LK are normal ("Waiting for 30 days of odometer readings"). 1 audit row. Step 16f done.

**Build step 16b — the database decides hard use: LIVE 28 Nov (pasted).** *Superseded by the revised design above, except the needs_checking fix and the resolver, which stay.* Live check: policy row, 6 view columns, 8 rules needs_checking, new resolver, cron `mm-hard-use-nightly 45 6 * * *`, logbook row. First run not yet: all 3 cars still off, never checked.
- **PAUSED 28 Nov (owner):** the owner finds the four-sign rule too complicated and too built around ride-hail, and wants a simple baseline of average use (e.g. 10,000 km a year) instead. DSH was asked for a second opinion. Cron `mm-hard-use-nightly` is set `active = false` on live; the function, columns and policy table stay. Turn it back on with `select cron.alter_job(job_id := jobid, active := true) from cron.job where jobname = 'mm-hard-use-nightly';`. The Roomy rule fix in the same migration stays live and is wanted either way.
- **Note for CI replay:** the committed migration still schedules the job as active. If the design changes, the follow-up migration must replace or unschedule it.

- **Migration** `20261128005456_mm_hard_use_decided_by_numbers`, paste file `docs/maintenance_rebuild_step16b_LIVE_apply.sql` (with logbook line). Validator OK.
  - `public.mm_hard_use_policy` (one row, the limits; server only) + `mm_hard_use_policy_log` (every change, who, before/after, by trigger).
  - `fleet.vehicles`: `severe_duty_source` (`auto` / `fleet_kept_normal`), `_why`, `_signs`, `_checked_at`, `_kept_normal_until`, `_clear_since`; also added to the `public.fleet_vehicles` view. New cars default to hard use.
  - `public.mm_decide_hard_use(p_org text default null)` (service role only). It adds up 30 days of completed trips, fuel litres and odometer km inside the database, per company and date range. It writes the decision and the numbers onto the car, logs every change in `fleet.maintenance_audit_log`, and recomputes changed cars.
  - Cron `mm-hard-use-nightly` `45 6 * * *` (1:45 AM Jamaica, before `fleet-maintenance-nightly` at 07:00 UTC).
  - Two added limits: short trips and slow traffic need at least 10 trips; fuel needs at least 40 L in the 30 days.
- **Found while testing (step-6b bug, fixed in the same migration):** the "likely, 2016–2020" Roomy copies were saved as **draft**, which the rule picker skips. So any recompute moved 5179KZ (2019) off Toyota's rules onto Roam's defaults: engine oil 15,000 km → Roam's 5,000 km, and the same for CVT oil, spark plugs and brake fluid. Today's rows still show Toyota numbers only because nothing has recomputed them yet.
  - Fix: the 8 copies become `needs_checking`, and `schedule_rule_for_part` now prefers a `needs_checking` rule when it is more specific to the car than the active one. An active rule wins a tie. The rest of the function is unchanged (diffed).
- **Live test, rolled back:**
  - Decision: all 3 cars on hard use. 5179KZ "Ride-hail work · 17.7 km/h average · 10.0 km/L (rated 18)" (233 trips, 27% short, so short trips does not count). 1505LM and 5404LK "Ride-hail work (the car's service line; no trips in 30 days)". 3 audit rows; cron job present. Signed-in users can't read the policy or run the function.
  - Recompute without hard use: **0** rows change. With hard use: only 5179KZ engine oil and oil filter, 171,649 → **164,149 km** (last change 156,649 + 7,500).
- **Safe to paste before 16c.** Paste now, because the step-6b fix protects 5179KZ's Toyota numbers on the next recompute. Until 16c ships, the step-12 "turn off with a reason" button is undone the next night. Nobody uses it today.
- **Next:** paste, then 16c (server).

**Build step 16 — hard use decided by the numbers (owner direction 28 Nov): PLAN written, 16a live, 16b built.** See "Build step 16" below. Hard use becomes automatic from each car's last 30 days: paid work, short trips, slow traffic, fuel. It turns on at once and off only after 28 clear days; the fleet can keep a car on normal use with a reason for 90 days. First job (16a): fill hard-use figures, since only 2 of 71 rules have one.

**16a checked on live (28 Nov), nothing written:**
- **The car-maker rules are already complete.** All 8 active Roomy rules have a hard-use figure (engine oil, oil filter: 7,500 km) or the "same as normal" tick (CVT oil, brake fluid, brake hose, coolant, fuel filter, spark plugs). No manual Roam holds has more to give.
- **The 63 without one are Roam's own defaults** (no manual behind them): 42 "as needed" jobs, which never fall due, and 21 timed ones (Oil 5,000 km / 3 months, Air filter, Cabin filter, Brakes, Rotate tyres and Tyre pressure at 10,000 km / 6 months, Belt, Transmission, Suspension, etc.).
- **What each car gets today:** 5179KZ has 9 maker rules and 23 Roam-default rows. 1505LM and 5404LK have **no maker rules at all** (no manual loaded for their models), so all 26 rows on each are Roam defaults. Hard use changes nothing on those two until Roam-default rules get a hard-use answer or their manuals are loaded.
- **Twin part found:** the Roomy sheet's "Air cleaner element" (50,000 km, 25,000 hard use) is still a draft and sits on the new part type from DOC-11, while 5179KZ's air filter row uses the Roam default "Air Filter schedule" (10,000 km) on the old part type. Same part, two types, as with the cabin filter in step 14. Fix: merge the twin with `mm_merge_part_type`, then approve the maker rule.
- **Decided (owner, 28 Nov): Roam defaults are "same as normal".** Roam's figures are already set for hard use (oil every 5,000 km is shorter than Toyota's own hard-use 7,500 km). No shorter figure is invented.
  - Migration `20261128004417_mm_roam_defaults_same_as_normal`, paste file `docs/maintenance_rebuild_step16a_LIVE_apply.sql` (with logbook line).
  - Tested on live, rolled back: 21 Roam rules ticked, 0 timed active rules left without a hard-use answer, 0 car rows changed.
  - **LIVE 28 Nov:** pasted; live check shows 21 ticked, 0 left without an answer, logbook row present. **16a done.** Next: merge the air-filter twin, then 16b.

**Build step 15 — health card, confirm-box copy, New package, inert button (MER-19, MER-21, MER-22, MER-24): server LIVE 28 Nov 00:27 UTC (fleet-ops v498); Dominion + Fleet screens local, go out with the next push.**

- **MER-19 (server, mm3 + main):** the health card's first row counts real fleet cars (with a catalogue car) minus the cars where a model/engine rule wins any schedule row. New label "Fleet cars on everyone's schedule only (no model or engine schedule)". The catalogue-size query is gone.
- **MER-21 (Dominion):** the before-saving box says "Cars update now. The nightly run re-checks tonight (2:00 AM Jamaica time)."
- **MER-24 (Dominion):** "How this works" is removed; the banner shows the three Stitch lines (how often · packages only group · whichever comes first).
- **MER-22 (Dominion + server + Fleet):** Packages tab has **New package**; the same drawer opens empty, needs a name and at least one job, and creates a global package with no part of its own.
  - **Found:** Fleet's Log service only ever listed packages already attached to the car (live: 1 of the 5 Dominion packages). With no attached package it fell back to hard-coded presets. So no new package could reach Fleet.
  - **Fix:** GET `/maintenance-schedule/:vehicleId` now also returns `packages`: active global packages that aren't on the car, with their jobs and no due dates. They are kept out of `schedule`, so no due counts change. Fleet adds them to the Log service list in the Hub, Vehicle detail and Vehicles page (`scheduleRowsWithPackages`). Fleet now shows the 5 real packages instead of the presets.
- **Checks:** Dominion vitest 52/52, Fleet vitest 332/332 (new `maintenanceCatalogOptions.test.ts`), tsc clean on changed files, fleet-ops bundle built in mm3, manifest 182 routes OK.
- **Live check (28 Nov):** fleet-ops v498 up (routes answer 401 without sign-in). Health card will read 2 (3 fleet cars, 1 has a model/engine rule). Fleet Log service will list all 5 Dominion packages.
- **Next:** screens go out with the next Dominion/Fleet push. Leftovers listed below stay open.

**Build step 14 — merge duplicate part types, no-rule rows (MER-20, MER-14): LIVE 27 Nov (database); Fleet drawer change local, goes out with the next Fleet push.**

- **Found:** "Cabin Air Filter" (no schedule) is a twin of "Cabin A/C Filter". 5179KZ's 20 May 2026 cabin filter (156,649 km) was logged under the twin, so the scheduled part still counted from 30 Oct 2025 and read 68,980 km overdue. Also, rows with no rule showed as "OK". "Engine oil" and "Engine oil (top-up)" are different jobs and stay apart.
- **Database:** migration `20261127231850_mm_merge_part_types`, paste file `docs/maintenance_rebuild_step14_LIVE_apply.sql`.
  - New `public.mm_merge_part_type(from, into, reason)` (service role only): moves job lines, ledger, job items, inspection items, packages, sections onto the part that stays; keeps the later last-done per car; recomputes; retires the twin. Refuses if the twin is used anywhere else.
  - Runs it for Cabin Air Filter → Cabin A/C Filter. Deletes no-rule rows with no history (none today).
  - Due view: new status `no_rule` (never OK, never overdue).
  - Tested on live, rolled back: twin retired, 0 twin rows left, ledger moved, 5179KZ cabin filter counts from 156,649 km / 20 May → next 166,649 km → still overdue by 34,283 km (real). The view change itself was not test-run (classifier blocked it); it only adds one status line to the step-7 view.
- **Fleet (main + mm3):** the drawer shows "No schedule yet · N" (Battery, Wheel Alignment, Front Stabilizer Link on 5179KZ); chip "No schedule". Vitest 264/264.
- **Not retired:** `fleet.maintenance_logs` (1 row, Aug; only read by the odometer ledger, nothing writes it). `maintenance_records` is the Business Finance bridge (17 rows in 30 days, 27 code uses); retiring it needs its own money plan, outside this rebuild.
- **Live check (27 Nov):** twin retired, 0 rows and 0 ledger left on it; 5179KZ cabin filter last 156,649 → next 166,649, overdue 34,283 km; statuses ok 2, no_rule 3, overdue 9, retired 7, history_unknown 71; logbook row present; merge function not callable by signed-in users.
- **Next:** step 15.

**Build step 13 — Driver: service due, Report a problem, don't-drive, pre-shift check (MER-16, MER-17, B6): BUILT 27 Nov, not live.**

- **28 Nov, owner: the pre-shift check is removed from the Driver app** (local, not committed). Gone: the "Start pre-shift check" button in `CarServiceSection.tsx`, its screen in `CarKitPage.tsx`, the old unused "Pre-shift inspection" link in `Dk1MyCarKit.tsx`, and `Dk7PreShiftDvir.tsx`. The line "The fleet will tell you when the car is cleared." moved into the Don't drive banner. Service coming up, Report a problem and the Don't drive banner stay. Driver vitest 81/81; no type errors in car-kit.
- **Left on the server, now unused:** the `pre_shift` template (10 items), `purpose: "pre_shift"` on the findings route, and the `pre_shift` odometer source. They do nothing unless called; remove them with the next server change if wanted.
- **Effect:** odometer readings now come only from Fleet, fuel logs and service logs.

**Found:** the pre-shift check took `templates.items[0]`, which is the garage's "Engine inspection" (2 items). Every item was pre-ticked Pass, and nothing in My car kit ever opened the screen (`showDvir` was never set true). Its reading was saved as source `service`.

- **Database:** migration `20261127230038_mm_pre_shift_check`, paste file `docs/maintenance_rebuild_step13_LIVE_apply.sql`. It adds the template `pre_shift` "Pre-shift check" with the 10 Stitch walk-around items; 6 are safety items (tyres, brakes, lights, windscreen, seat belts, warning lights). Tested rolled back: 10 items / 6 safety.
- **Server (mm3 + main):**
  - The templates route leaves out `pre_shift` unless `?code=pre_shift`.
  - The findings route takes `purpose: "pre_shift"` and saves the reading as source `pre_shift` (new ledger source and reference type `inspection`; label "pre-shift check").
  - The requests route stores `category` and `photoUrl`.
  - New `maintenance_driver_car_routes.ts`, GET `/maintenance-driver-car`: the driver's assigned car, do-not-drive state, the next 3 due items (overdue → "The fleet has been told", due soon → "in about 870 km", history unknown → "at the next service"; one line per part), the calm "Next: … in about … km", the open work order (garage + stage) and the last reading. Deno tests (2). Bundle 182 routes.
- **Driver app (main only, built from there):**
  - My car kit gets `CarServiceSection` (Stitch screens 1–3): the Don't drive banner with Call the fleet; Start pre-shift check, greyed while stopped; and Service coming up with Report a problem.
  - `ReportProblemSheet` (screens 4–5): category, how soon, text, photo → `/maintenance-requests` → "Sent to the fleet".
  - `Dk7PreShiftDvir` rewritten (screens 6–8): the `pre_shift` checklist; nothing pre-ticked; the odometer starts from the last reading and can't go lower; Fail needs a photo; the safety-fail warning; after sending, a safety fail shows "Don't drive this car" with Call the fleet.
  - `carServiceModel` with tests; driver vitest 81/81; no new type errors.
- **Fleet:** odometer history shows "Pre-shift check" for the new source.
- **Not done:** the Notifications screen (Stitch 9) and "See my check".
- **LIVE 27 Nov (server):** the paste is logged, the pre_shift template has 10 items live, and fleet-ops is deployed (`/maintenance-driver-car` answers 401 without a login). Checked on screen 27 Nov (local Driver app, owner signed in as the 5404LK driver): Service coming up shows the real items ("Rotate Tires · at the next service · Next visit"); Report a problem opens, Send is held with "Pick what's wrong."; the pre-shift check loads the live 10 items (6 SAFETY, nothing ticked, Send held with "Type the odometer."). Fixes made during the check: the section did not show on the "Kit not configured" path (it is now rendered for every My car kit state); the sheet and check had white-on-white text under the dark theme, and the sheet stretched full width on desktop. Nothing was sent. Drivers get it with the next Driver build.

**Build step 12 — do-not-drive works, hard use with a reason (MER-09, MER-25): BUILT 27 Nov, not live (server deploy only, no SQL).**
- **MER-09 was bigger than reviewed.** `fleetDb().from("vehicles")` (= `public.vehicles`, which does not exist) was used in 5 places, so do-not-drive never worked in Fleet at all:
  - Clear do not drive, reading and clearing (2);
  - an inspection safety Fail never set the flag (`routes_inspections.ts`);
  - the overview never showed a do-not-drive car;
  - finishing a work order never cleared it.
  - All 5 now use `fleet_vehicles` (mm3 + main). The `schema("fleet").from("vehicles")` calls were already right.
- **MER-25:**
  - PATCH `/vehicles/:id/maintenance/severe-duty` refuses turning hard use OFF without a reason of at least 10 characters (`hardUseChangeRefusal`, Deno test).
  - It writes `fleet.maintenance_audit_log` (`entity_type` `fleet.vehicles.severe_duty`, who / before / after / reason) on every change.
  - Fleet `MmHardUseDialog` redrawn to Stitch screen 7:
    - "Turn off hard use?" with the plate and car, "Why?" (at least 10 characters), "Saved with your name and today's date.", Keep hard use / red Turn off;
    - turning on needs no reason;
    - the old fixed reason "fleet maintenance" is gone;
    - the grey before/after interval box is left out, because the rules carry no hard-use numbers yet, so it would show invented numbers.
  - The drawer's "Mark as hard use" text link is now a real button, "Turn on hard use" (buttons never look like links).
  - A new car is hard use by default (step 8).
  - The 3 existing cars are all `severe_duty = false` and stay so until the owner turns it on.
- **Tests:** vitest vehicles 330/330 (new `MmHardUseDialog.test.tsx`), Deno maintenance 245/245, bundle rebuilt (181 routes).
- **LIVE 27 Nov** (owner deployed fleet-ops). Checked in Chrome: the overview loads on the fixed do-not-drive read; the 5179KZ drawer shows the "Turn on hard use" button; the dialog reads "Turn on hard use?" with the plate, car and "Saved with your name and today's date." It was cancelled, nothing changed.
- **Not clicked through:** Clear do not drive, because no car is flagged.

**Build step 11 — Work orders tab (MER-15): BUILT 27 Nov, not live.**

**Real bug found:** the server's lifecycle uses `open` / `scheduled` / `in_shop` / `awaiting_parts` / `closed`, but `maintenance_work_orders_status_check` only allowed draft / in_progress / completed / cancelled / planned. So Approve on a driver request (→ `open`) always failed. Nobody saw it, because 0 driver requests have ever been made. Also, `fleet_save_work_order` only edits draft / in_progress work orders, so an approved or at-the-garage work order could never be finished through Log service.

- **Database:** migration `20261127222307_mm_work_order_statuses`, paste file `docs/maintenance_rebuild_step11_LIVE_apply.sql`.
  - Widens the check to the lifecycle statuses.
  - Patches that one condition in `fleet_save_work_order`, in place (DO block, refuses unless it matches exactly once).
  - Tested in a rolled-back transaction: an `in_shop` row inserts and the function is patched.
- **Server (mm3 + main):** new `maintenance_work_order_board_routes.ts`, GET `/maintenance/work-orders/board`.
  - Stages: draft = Needs a decision; open / scheduled = Waiting to go in; in_shop / awaiting_parts = At the garage, with days off the road; in_progress = Being saved; completed / closed = Done; cancelled. Planned work orders and voided services never show.
  - Tiles: at the garage / waiting / done this month (a count) / needs decision.
  - Each card carries its jobs from the lines, the driver's request words, and the garage name (vendor, else the provider, never "Driver Request").
  - Deno test (2). Bundle rebuilt, 181 routes.
- **Fleet (main + mm3):**
  - New **Work orders** tab (`work-orders/WorkOrdersTab.tsx`, Stitch screens 4 and 5 with the Round 2 drops):
    - tiles; Open / Done / Cancelled / All chips; search;
    - open cards with Open, Approve / Decline, "It's at the garage", Cancel work order (reason, at least 5 characters), and "Mark done and log service". Mark done opens Log service on the driver request, and its save finishes the work order (the existing `handleCompleteRequest` path);
    - Done recently with "View service", which opens the existing Service details dialog;
    - the panel shows Where and when, Came from (the request words and photo) and Jobs.
  - Requests cards get **Open work order**; the "No linked work order" toast becomes a plain explanation.
  - The old `?tab=work-orders` link now lands on the tab.
  - Model and test `workOrderBoardModel` (4). Vitest vehicles 327/327, no new type errors.
- **Left for later:** "New work order", "+ Add a job" and the panel's Do-not-drive switch (step 12). There are no open work orders live today, so the open list will be empty until a driver sends a request.
- **LIVE 27 Nov:** the owner pasted and deployed; the check constraint and the function patch are verified live. Checked in Chrome: the tab loads (0 / 0 / 0, "No open work orders…"); Done lists the real services with garage, date, km and total; View service opens the Service details. Fixed after the check: Done was ordered by when the record was made (Mar 2026 above Aug 2026), now newest by service date (client-side, test added). Not clicked through: Approve, at the garage, Cancel and Mark done, because there is no driver request live to try them on.

**Build step 10 — the due line (MER-18, MER-04 display, B5): BUILT 27 Nov.**
- **Server** (`maintenance_master_fleet_enrich.ts`, mm3 + main; bundle rebuilt; NOT deployed). Each due line now carries:
  - `source_page` (printed page = evidence_page − the manual's page_offset);
  - `counting_from_*` (a logged service, or history filled in; null when unknown);
  - `retired_reason` and `schedule_id`.
  - As-needed parts are dropped from the due list entirely.
  - Deno test `maintenance_due_line.test.ts` (2).
- **Fleet** (main + mm3, local). Each due line shows:
  - a part icon;
  - "Car maker · page N", "Roam policy — no manual yet" or "Fleet override — reason";
  - "Counted from your service on … at … km";
  - the red overdue amount;
  - **Log this**, only on overdue, due-soon and history-unknown lines (Round 2: never on OK lines);
  - for retired lines, the engine's real reason.
- **Log this** opens Log service on that part: a new dialog prop `startOnPart`, reusing the "Log it now" shortcut to that job's details. Checked in the owner's Chrome: Brake pads · LF → after Date & mileage the wizard opens on Brake pads details. It was cancelled, so nothing was saved.
- **Known small gap:** the wheel position (LF) is not pre-ticked.
- **Tests:** vitest vehicles 323/323 (new `dueLine.test.ts`), no new type errors.
- **Not done in this step:** the Why-this-schedule popover redraw (Stitch screen 8).
- **LIVE 27 Nov:** the owner deployed fleet-ops. Checked in Chrome on 5179KZ: "Car maker · page 5" (Roomy maintenance sheet) on maker rules, "Roam policy — no manual yet" on the rest, "Counted from your service on 25 May 2026 at 157,378 km", the red overdue amounts and Log this all show.

**Build step 9 — split the Log service wizard (MER-23): DONE 27 Nov, local (main + mm3), no behaviour change.**
- The four steps were already separate files (`LogServiceDateMileageStep`, `…WhatWasDoneStep`, `…LineDetailsStep` / `…MultiStep`, `…ReviewStep`).
- Moved out of `LogMaintenanceServiceDialog.tsx` (3,230 → 2,909 lines):
  - **`log-service/logServiceDialogModel.ts`:** all module-level types and helpers (313 lines, moved by script, word for word). The dialog re-exports `quickJobTypeLabel`, `AddToInspectionTarget` and `LogMaintenanceServiceDialogProps`, so import paths are unchanged.
  - **`log-service/logServiceSave.ts`:** the save's plain rules (pre-save checks in the same order and words; the inspection findings; the shelf warning text; the follow-up queue; the network/discount failure wording). It has a new test file (5).
- The dialog keeps the state, API calls and toasts.
- **Proof:**
  - The whole Fleet vitest suite passes unchanged: 379 files, 2,244 tests, 1 skipped.
  - No new type errors.
  - The wizard opens on 5179KZ in the owner's Chrome and moves from step 1 to step 2. It was cancelled, so nothing was saved.

**Build step 8 — odometer required + "Odometer needed" alert (MER-13, MER-26), with the add-car "use" choice from step 12 (MER-25, same Stitch screen 6): BUILT 27 Nov, not live.**
- **Database:** migration `20261127213249_mm_odometer_needed_alert`, paste file `docs/maintenance_rebuild_step8_LIVE_apply.sql`.
  - `fleet.mm_sync_odometer_needed_alerts(org)` keeps exactly one open alert per car with no valid reading: severity `odometer_needed`, no part, payload "Odometer reading needed". It resolves that alert once the car has a reading.
  - A trigger on `fleet.odometer_readings` closes the alert the moment a reading lands.
  - The nightly check runs the sync.
  - The paste runs the sync once, so 1505LM and 5404LK get their alerts now.
  - Tested on live in a rolled-back transaction: 2 opened, a second run opened 0, and a reading on 1505LM resolved its alert at once.
- **Server (mm3 + main):** the alerts route labels a part-less alert from `payload.categoryName`. The bundle is rebuilt (180 routes).
- **Fleet (main + mm3):**
  - The bell shows "Log a reading so due dates can be worked out".
  - Add a car has a new step 5, "Odometer and use" (`OdometerUseStep.tsx`, Stitch screen 6 with the Round 2 drops; the dashboard-photo button is left out because there is no upload behind it). It holds:
    - the odometer, required (number above 0, no future date), with the date;
    - Hard use / Normal use, with Hard use chosen by default;
    - "Fill in history now", which opens the Fill in history dialog after saving.
  - After the car saves, the screen writes the reading (source `manual`) and the use choice: `patchVehicleSevereDuty` with a reason, either way.
  - The step bar now has 6 steps.
  - The due drawer's hard-coded "1505LM" odometer banner hack is removed.
- **Tests:** vitest add-vehicle + maintenance-logging 283/283, no new type errors.
- **LIVE 27 Nov:** the owner pasted (sync returned 2) and deployed fleet-ops. Checked in the owner's Chrome on local Fleet: the bell shows "1505LM / 5404LK · Odometer reading needed · Log a reading so due dates can be worked out"; the 1505LM drawer shows the first-reading banner + Log odometer, "25 parts have no known history" and the History unknown section. Not clicked through in the browser: the new Add-a-car step (it needs a real document scan; covered by vitest). The Fleet screens go live only with a Fleet push.

**Build step 7 — History unknown + Fill in history (MER-11, MER-12): BUILT 27 Nov, not live.** Database: migration `20261127211316_mm_history_unknown` (paste file `docs/maintenance_rebuild_step7_LIVE_apply.sql`). It adds three columns on `vehicle_component_schedule` (`history_check_at_next_service`, `history_filled_at` / `_by`). In `fleet.maintenance_due_v` it adds a `history_unknown` status: no last-done km/date on a scheduled part means never Overdue, never OK, no projected date. Columns are unchanged, so the public view needs no change. It adds `mm_fill_part_history(org, vehicle, rows, actor)`: a dated row becomes a `manual` history and is recomputed; tick-only records "Check at next service"; a logged service is never overwritten; everything is audited. Open alerts on now-unknown parts are superseded, because `maintenance_alerts_supersede_open` is an empty stub, noted for step 14. Tested on live in a rolled-back transaction: 5179KZ goes from 22 overdue to 9 overdue + 6 OK + 21 unknown; 1505LM and 5404LK show 25 unknown each; open alerts drop from 19 to 4; brake fluid at 198,000 km on 1 Nov 2026 becomes OK, next 1 Nov 2028. Server (mm3 + main): new `maintenance_history_fill_routes.ts` (GET/POST `/maintenance/vehicles/:id/history`); the overview skips undated component rows in its own overdue maths, adds `dueCounts.historyUnknown` and `historyUnknownParts/Cars`, and a car status "History unknown". Fleet (main + mm3): `MmFillHistoryDialog` (Stitch screen 2) plus `fillHistoryModel`; the due drawer gets a violet "N parts have no known history · Fill in history" card and a History unknown section; a KPI card; violet chips in the overview and Which-car lists. Deno 138/138, Fleet maintenance vitest 247/247, no new type errors. LIVE 27 Nov (owner pasted + deployed fleet-ops): live statuses match the test exactly. Checked in owner's Chrome on local Fleet (localhost:3000): KPI "History unknown 71 parts on 3 cars", violet chips on 1505LM / 5404LK, 5179KZ drawer card "21 parts…" + Fill in history dialog matching Stitch. Fixes after the check (screens only, local): dialog width (shadcn sm:max-w-lg overrode it), pill on one line, and older rows with a service date but NULL last_performed_source are now locked as "From your service records" (km with commas) so a real service date cannot be overwritten. Note: the RPC itself only protects work_order/service_log sources; the screen protects NULL-source rows. The 9 still-overdue 5179KZ parts are real service dates (Cabin A/C filter last 121,952 km Oct 2025 — probably later work logged on twin "Cabin Air Filter", MER-20). Nothing saved on real cars. Fleet screens live only after a Fleet push (owner's word).

**6b upload check in Chrome (27 Nov, real Roomy owner's manual): two fixes, built, waiting for the fleet-ops deploy.** The form got the document type, country and name right. It got two things wrong. (1) **Car not placed:** the M900 family's platform row has maker `family`, so "Toyota" never matched. Now every catalogue car under a family (Roomy, Tank, Thor, Justy) can match, and the family's make comes from its cars. (2) **Pages:** only front page 3, 5 and 516 were picked, because the reader saw only the first 15 pages. Now the browser also sends the first 100 characters of every page (read locally, for free). The prompt asks for the whole specifications chapter as one run (`{"from","to"}`, handled by `toPages`), plus the oil and tyre-pressure pages. Files: `maintenance_manual_identify.ts` (+ test, 133/133), `maintenance_manual_routes.ts`, `UploadManualDialog.tsx`, `manualsApi.ts`; type-check clean, vitest 70/70. The mm3 bundle is rebuilt (178 routes). Deployed as v489: pages now right (front page, 404 oil, 407 tyres, 520–526 specs). Two more fixes built after that (not live): (3) the Roomy has two families, 2WD M900 and 4WD M910, so the match was a tie and the choices were dropped; now `close_families` (with the platform label) is returned and the form shows them as Pick buttons. (4) DeepSeek's page offset varied (4, then 2); now `offsetFromPageHeads` counts PDF page − printed number over the page headers and overrides the guess when 20+ pages agree. Deno 134/134, vitest 70/70, bundle rebuilt. Deployed as v490; then the real upload ran (manual "Toyota Roomy 2021 owner's manual", 2WD family, 2020-on, 11 pages, 27 values, nothing approved). Values match the book (tank 36/38, battery M-42 / N-55, tyres 260/250/420 kPa, H4 60/55). Found and fixed, built in mm3, NOT deployed: (5) DeepSeek answered empty for printed 521–523 (oil, grades, coolant, CVT); now an empty answer is double-checked by Gemini in the same attempt (`answeredNothing: pageAnswerIsEmpty`, maintenance-manual-worker), and DeepSeek stays the reader. (6) The 2016–2020 cars were pre-ticked; now `versionsInYears` ticks only versions that start inside the book's years. (7) The version labels were indistinguishable; now they carry the model name (Roomy, Tank, Thor, Justy). (8) Tyres came out twice (pages 407 and 525) because the prompt asked for the tyre page too; the prompt now asks for the specs chapter only. (9) The front-page tab showed "1"; it now says "Front page 3". Deno 136/136, vitest 70/70. Both deployed (owner, 27 Nov); test upload 26334d7b removed (all drafts; its R2 file maintenance-manuals/26334d7b-….pdf is left behind, 9 MB). Clean re-upload a9a56b3f-d01a-4199-bb99-daddb1baa356: 8 pages (front page + 520–526), 37 values, all of MDV-01…07 incl. oil 2.9/3.1 L 0W-20 (5W-30), coolant 4.4/5.0, CVT 5.8/6.4, transfer 0.57, diff 0.83; page 523 came from Gemini's empty-answer check. Only the 2020-on Roomys pre-ticked; labels carry model names. APPROVED 27 Nov by Claude at owner's word: 30 active (FE coolant 4.4 / CVT 5.8 → Custom G only; VET 5.0 / 6.4 → Custom G-T only), 6 rejected (5 4WD-only + duplicate oil grade p522), 1 draft left: fuel_grade (no spec_key; catalogue keeps fuel grade as a vehicle_catalog column inside the variant identity index — needs its own decision). Car page shows Tyres / Battery / Bulbs cards. Bug found: approving a column value (oil, coolant, tank) left an older CSV copy in catalog_spec_value (3.2 / 4.5) that "Now" reads; fix = migration 20261127210227_mm_spec_approve_updates_spec_copy (paste file docs/maintenance_rebuild_spec_copy_LIVE_apply.sql) — PASTED + verified live 27 Nov: oil 2.9, coolant 4.4 / 5.0 confirmed maker_document on both versions, logbook row present. Small follow-up: loadVersions omits engine_code, so "1KR-FE"/"1KR-VET" remarks are never auto-ticked. Left for the owner on the check screen: 1KR-FE vs 1KR-VET rows (VET = the turbo version) are "needs checking"; 4WD-only rows (38 L tank, transfer, diff) belong to the 4WD family and should be rejected here; engine oil grade appears twice (521 and 522). Open question for later: the owner's manual covers 2WD and 4WD, but a manual belongs to one family.

**Build step 6b — documents in, values out (database + server): BUILT 27 Nov 2026. No screen, nothing deployed.**

- **Database — three migrations, one paste file.** `maintenance_manual` gains `doc_type` (`schedule` | `owners_manual`), `pages int[]` (the list is the truth; a trigger keeps `page_from`/`page_to` as its min and max, so every existing reader, page job and screen still works), `page_offset` (printed page = PDF page − offset), `year_from`/`year_to` and `printed_date`; every rule made from a dated manual copies its years. Then `vehicle_tyre` and `vehicle_bulb` per catalogue version (with `manual_id` + `evidence_page`, RLS on, no access for anon or authenticated), the six fluid `spec_key` rows from G3, the three part types (Differential oil and Transfer oil under the driveline group, Air cleaner element under filters), `catalog_spec_value.trust_route` accepting `maker_document`, and `maintenance_manual_spec_row` with the approve / reject / current-value functions plus the history line every approval writes into the existing `dominion_audit_log` (DOC-12). Nothing is dropped or renamed, and every statement is safe to run twice.
- **The 27 Nov Roomy fix ships inside the migration and prints what it changed.** Manual `155b08f1-d9f7-43b1-98b5-8df29d2dcd31` (printed 1 June 2021) is bound to 2020 onward; its eight live rules to 2020 onward; each gets a `likely` draft copy for 2016–2020 with the note "Read from the June 2021 sheet. Confirm against a 2016–2020 document." The SQL editor's output carries one `NOTICE` per row changed, so the rows changed are listed, not assumed. Its existing draft rows for differential oil and air cleaner element are pointed at the new part types and stay drafts.
- **Server (fleet-ops, beside the existing manual routes; same permissions, owner-only to approve or reject).** `POST /maintenance-manuals/identify` — the browser's text (or the first page pictures for a scan) → make, model, printed date, market, document type, title, page offset, the pages worth reading with a reason each, and sure/unsure with a reason per field; then the catalogue family from make + model and the years the printed date covers. `upload-url` / `uploaded` accept `doc_type`, `pages`, `page_offset`, `year_from`, `year_to`, `printed_date` and queue **exactly** the listed pages. The page worker reads an `owners_manual` with a specs prompt (fluids with and without filter, grades, fuel by drive, tyres and pressures, battery, bulbs, each with `applies_to`) and writes spec rows, plus any interval the page also prints. `GET /maintenance-manuals/:id` returns the spec rows with, per version, the catalogue's current value, so the screen can show Now → Manual and "Matches". `POST /maintenance-manual-spec-rows/:id/approve`, `/reject`, `PATCH`, and `POST /maintenance-manuals/:id/approve-specs` write to the ticked versions only and log who, when, old, new, manual and printed page. Every page number the routes return for people is the printed page; the PDF page stays in the row.
- **The real book, read for real (two runs of the specifications chapter, PDF 524–530, DeepSeek `deepseek-flash`, about 5 s a page, key from mm3's `supabase/functions/.env`):** tank **36 L 2WD / 38 L 4WD**; oil **2.9 L** and **3.1 L with the filter**, grade **SN PLUS 0W-20** with **5W-30** allowed; coolant **4.4 L (1KR-FE) / 5 L (1KR-VET)**; CVT **5.8 / 6.4 L**; transfer **0.57 L** and differential **0.83 L** with the SX 85W-90 grade, both marked 4WD; battery **M-42** with the N-55 / electric-parking-brake note; washer **2.0 L**; three tyre sizes at **260 kPa**, the optional **175/55R15 at 250 kPa**, the spare **T115/70D14 at 420 kPa**; and every lamp position, of which only the headlamp prints a number (**H4 60/55**) — the rest come back as "Unknown" or "LED" rows for the owner, never silently dropped. That is MDV-01…07's set. **Not every page answers:** one run left the battery page (528) empty; a page that yields nothing leaves its rows unwritten, and the check screen shows what did come back.
- **Proven by:** `supabase/tests/maintenance_rebuild_step6b_checks.sql` (13 checks, including "approving one value writes two versions and two history lines, a third model's car untouched", the eight-rules-bound / eight-drafts result on fixtures, and a 2019 car that still resolves a number), plus step 1's 10 checks, step 3's 8 and `maintenance_master_checks.sql` + its fixtures re-run unchanged on a database **replayed from empty** (439 migration files, one transaction each); the paste file re-applied on top (safe to run twice); `node scripts/validate-migration-sql.mjs` and the UTF-8 check pass; **Deno 131/131** (108 `maintenance_manual*`, 23 `maintenance_master*`) and `deno check` clean on the changed server files. The two real files are read by the tests, not described: the sheet's own text says ルーミー and 2021年6月1日 and page 5 carries the replacement table (so it is identified from its text), while the owner's manual is 568 pages whose useful pages carry **no text layer** (so those pages go to the reader as pictures).
- **To go live**, from `C:/Roam/Goride-mm3`, in this order:
  1. Paste [`maintenance_rebuild_step6b_LIVE_apply.sql`](maintenance_rebuild_step6b_LIVE_apply.sql) into the SQL editor (three migrations + their logbook lines). Read the `NOTICE` lines: they are the Roomy rows that changed.
  2. `npx supabase functions deploy fleet-ops --project-ref csfllzzastacofsvcdsc --use-api --yes` and then `npx supabase functions deploy maintenance-manual-worker --project-ref csfllzzastacofsvcdsc --use-api --yes`.
  3. Check afterwards: `select doc_type, pages, page_offset, year_from from public.maintenance_manual;` answers, and `select count(*) from public.maintenance_manual_spec_row;` returns a number (not an error).
- **Deployed, not on main (true once the paste and the two deploys above run):** the three migrations + this paste file; `supabase/functions/_fleet-server/maintenance_manual_routes.ts` (identify, page list and printed pages, spec routes), the new `maintenance_manual_identify.ts` and `maintenance_manual_specs_prompt.ts`, `maintenance_manual_worker.ts` (specs branch, reader recorded on both paths), `maintenance_manual_job_db.ts` (spec writer, versions), and — carried in from the step-3b copy so both folders match — `maintenance_manual_reader.ts`, `maintenance_manual_settings.ts`, `maintenance_manual_text.ts`, `maintenance_manual_prompt.ts`, `maintenance_manual_draft.ts`, `maintenance_manual_match.ts`, `deepseek_models.ts`; the rebuilt `fleet-ops/index.ts` + `routes.generated.json` (177 routes) + `_shared/extractionStatus.generated.ts`; the new tests and `supabase/tests/maintenance_rebuild_step6b_checks.sql`; `scripts/mm-specs-real.ts` (the evidence run) and `scripts/mm_replay.sh` (the local replay harness).

**Build step 1 — the database — is LIVE (owner pasted the SQL, 27 Nov 2026).** Claude checked live: 16 part schedules, 5 packages, 47 As needed rules (valve clearance + wheel alignment have none), `maintenance_manual` with RLS on and no access for signed-in users, market rank JM 1 / JP 3, all four logbook lines recorded, and 7 As needed rows on 5179KZ moved to `retired` (out of the due list). 5179KZ still shows 22 overdue: that is the counting fault MER-11 fixes in step 7. Nothing is committed and no server code is deployed.

- **Built (build order rows 1 and 2):** MER-03 `due_kind` gains `part_schedule` + `inspection` and the 16 part rules are set to `part_schedule`; MER-04 the 47 "As needed" part types get one `manual_only` rule each and the engine never makes a car row, a due date, or an Overdue / Due soon / OK count for them; MER-07 + MER-06 `maintenance_manual` (family, market, file, hash, pages, page range, checker), `manual_id` + `evidence_page` + `market` on rules, and the fixed market rank JM 1 · GEN 2 · JP 3 · OTHER 4 in one SQL function; the database half of MER-05 (`severe_same_as_normal`). **No server route and no screen was built.**
- **Proven by:** `supabase/tests/maintenance_rebuild_step1_checks.sql` (10 checks), plus `maintenance_master_checks.sql` and `powertrain_schedule_db_test.sql` re-run unchanged; every migration replays from empty; `node scripts/validate-migration-sql.mjs` passes.
- **To put it live**, the owner pastes one file into the SQL editor: [`maintenance_rebuild_step1_LIVE_apply.sql`](maintenance_rebuild_step1_LIVE_apply.sql). It holds the four new migrations in order, each followed by its `supabase_migrations.schema_migrations` logbook line. **Step 1 is the paste only — nothing else is deployed for it.**
- **Server change (parseDueKind / bootstrap skip) is in the step-3 deploy copy** (below), not in step 1's paste. Nothing of it is live yet.

**Build step 6b screens — BUILT by Claude 27 Nov 2026 (local, uncommitted).** Upload is now two steps (choose the PDF → "Roam found this", filled in by the identify route from the PDF's own text, or page pictures for a scan); document type, page chips in printed numbers, years from the printed date; model page shows Service schedule / Owner's manual pills and a "Specs from the owner's manual" card; the check page switches to "Check the specs" for an owner's manual (Now → Manual, version ticks, approve / edit / reject / approve all); the Vehicles car overview gets Tyres / Battery / Bulbs cards. New files: `manuals/CheckSpecsView.tsx`, `manuals/specsFormat.ts` (+ test), `vehicles-stitch/MakerSpecsCards.tsx`; pdf.js character maps shipped in `apps/admin/public/pdfjs-cmaps/`. Server additions (in mm3 + here): the manual detail sends plain-word `versions`; new `GET /maintenance-manuals/vehicle-specs/:vehicleCatalogId`. **Dominion `vercel.json` CSP** now allows R2 (`connect-src`, `frame-src`) and `worker-src 'self' blob:` — without it the live Dominion site cannot upload manuals or show page pictures. Needs: one fleet-ops deploy from mm3; the CSP and screens reach the live site only with a push to main. Tests: Dominion vitest 70/70, tsc clean; server Deno 131/131; manifest 178 routes.

**Build steps 4 + 6 — Dominion "Which cars" fix and the Manuals tab: BUILT by Claude 27 Nov 2026, server part NOT deployed yet, screens local only (uncommitted).**
- **Screens (this folder, `apps/admin/src/components/admin/maintenance-master/`):** new Manuals tab (`manuals/ManualsTab.tsx`, `ManualModelPage.tsx`, `CheckNumbersPage.tsx`, `EditManualRowDrawer.tsx`, `UploadManualDialog.tsx`, `PdfPagePreview.tsx`, `pdfTools.ts`, `manualsUi.tsx`, `manualsApi.ts`) = Stitch screens 1–6, 10, 11; schedule drawer rebuilt to screens 8–9 (`MaintenanceMasterScheduleDrawer.tsx`, `MmCarPicker.tsx`, `scheduleDrawerModel.ts`): four choices Everyone / One model / One engine / One car version, Make → Model → Years → Version picker, each choice saves a real id (MER-01); normal + harder driving side by side with "The manual gives one figure" (MER-05); a car maker number needs its manual + page (MER-07). Ladder has four rungs and lists every model with its own number by plain name (MER-02). Round-2 drops applied (no invented IDs, frames or labels). Not built this round: Stitch screen 7 (Part schedules table with As needed / No schedule yet) — it belongs with build step 10's display work.
- **Server (in `C:/Roam/Goride-mm3` and this folder):** `maintenance_master_routes.ts` — new `GET /admin/maintenance/car-scope`; rule saves accept `manual_id`, `evidence_page`, `severe_same_as_normal` (and fill the manual as evidence); plain-words save errors (400) instead of raw constraint text; "One model" car count includes every name the model is sold under; **bug fixed:** "Make active" on a NEW schedule used to answer "Use draft status or proposal flow" and save nothing — it now saves live and recomputes. `maintenance_manual_routes.ts` — model list gives plain names (`name`, `also_sold_as`) and search finds "Toyota Roomy". New `maintenance_family_names.ts`. Bundle + manifest rebuilt in mm3 (172 routes, `--check` ok).
- **Seen in the owner's Chrome 27 Nov (after fleet-ops deploy):** Manuals tab empty state, upload overlay, Add schedule drawer with One model + Car maker + no manual (screen 9), and the four-rung ladder all match Stitch; the live car lookup answered "Covers Toyota Roomy, Daihatsu Thor, Subaru Justy, Toyota Tank". Fixed on the spot: car picker two-by-two (four in a row clipped), flags removed (Windows shows letters). **Found and fixed:** since step 1 went live, Part schedules said 63 — the 47 As needed rules were counted as schedules; the summary and tab count now leave them out and those rows read "Done when needed · As needed". This needs one more fleet-ops deploy from mm3. Not yet seen: the model page, check screen and edit drawer — they need a real manual uploaded (and `localhost:3001` in R2 CORS to upload locally).
- **Proven by:** Deno 36/36 (step-4 + reader tests) and 18/18 existing maintenance-master tests in the clean copy; Dominion vitest 45/45 (11 new); `tsc` clean. **Not yet seen in a browser** (needs the owner's sign-in) and the new routes need the fleet-ops deploy below before the drawer's car lookup and the plain names work.
- **To go live:** owner runs from `C:/Roam/Goride-mm3`: `npx -y supabase@latest functions deploy fleet-ops --project-ref csfllzzastacofsvcdsc --use-api --yes`. No SQL this time. For **local** uploads and page pictures, `http://localhost:3001` must be in the CORS allowed origins of R2 bucket `roam-private` (GET, PUT); production origins are already there.
- **Deployed, not on main (after that deploy):** step 3's list below plus `maintenance_master_routes.ts`, `maintenance_manual_routes.ts`, `maintenance_family_names.ts`, `maintenance_master_step4.test.ts`, rebuilt `fleet-ops/index.ts` + `routes.generated.json` + `_shared/extractionStatus.generated.ts`.

**Build step 3 — the owner's manual reader (server only): LIVE 27 Nov 2026** (owner pasted the SQL and deployed fleet-ops v480 + maintenance-manual-worker v1 from `C:/Roam/Goride-mm3`). Claude checked live: page-job table with RLS on and no access for signed-in users, both logbook lines, the minute job with its empty-queue skip, `/maintenance-manuals` answering 401 without login, the worker refusing a caller without the cron secret (403), and no fleet-ops errors after the deploy. **Deployed, not on main:** the step-3 list below. No screen yet. Claude re-checked 27 Nov: 31/31 Deno tests (clean copy), step-3 8/8, step-1 10/10, master 11/11, powertrain ok; live fleet-ops = a fresh build of origin/main (sha 92395ffe…), so the deploy undoes nothing. Claude added one change to `20261127122306_mm_manual_reader_cron.sql` (both copies + both paste files): the minute job makes no call when no page is due, so an empty queue writes no `net` row.

- **Built (build order section D row 3, MER-08 + B4):** upload that never passes a file through a function (a one-time PUT link to the private R2 bucket), a "uploaded" check that the file really is the PDF with those pages and that SHA-256, a page queue (`maintenance_manual_page_job`, one row per page, minute cron), a worker that reads one page per Gemini call (pdf-lib cuts the page, typed and scanned pages alike), the draft rules it writes (`status = 'draft'`, `source_type = 'maker_manual'`, page, market copied, needs-checking rows marked with a plain note), and the ten routes the Manuals tab needs (list, detail, page link, edit a draft, approve / reject / stop / reread).
- **Proven by:** 31 Deno tests in the clean copy (`maintenance_manual_prompt` / `_pdf` / `_draft` / `_worker` tests), `supabase/tests/maintenance_rebuild_step3_checks.sql` (8 checks), step 1's 10 checks + `maintenance_master_checks.sql` + `powertrain_schedule_db_test.sql` re-run unchanged, a full migration replay from empty, `node scripts/validate-migration-sql.mjs`, and one real end-to-end run on the local copy (see below).
- **The real end-to-end run:** a made-up 8-page manual with a typed table on page 4 and a **scanned picture** of a table on page 5 → `upload-url` → the PDF went straight to R2 → `uploaded` queued pages 4–5 → the worker made **real Gemini calls** and wrote 4 draft rows with pages 4 and 5 → `approve all` made 3 live and left "Cabin air filter" as **needs checking** (it fits both "Cabin A/C Filter" and "Engine Air Filter", so the reader says so instead of guessing) → the fixture car of that family then used the manual's numbers: Engine oil 10 000 km / 12 months, Spark plugs 100 000 km / 60 months, and **Brake fluid 40 000 km / 24 months read from the scanned page**. The page-5 link came back cached (the worker had stored the one-page PDF). Cost: **USD 0.00022** for the two Gemini calls (1 752 input and 297 output tokens, priced by the app's own `api_pricing.ts`).
- **To put it live**, in this order:
  1. Paste [`maintenance_rebuild_step3_LIVE_apply.sql`](maintenance_rebuild_step3_LIVE_apply.sql) into the SQL editor (two migrations + their logbook lines).
  2. Deploy the two functions **from the clean copy** (never from this folder — it carries other unshipped work):
     ```
     cd C:/Roam/Goride-mm3
     npx supabase functions deploy fleet-ops --project-ref csfllzzastacofsvcdsc --use-api --yes
     npx supabase functions deploy maintenance-manual-worker --project-ref csfllzzastacofsvcdsc --use-api --yes
     ```
  3. Check afterwards: `select count(*) from public.maintenance_manual_page_job;` returns a number (not an error) and `select jobname from cron.job where jobname = 'maintenance-manual-worker';` returns one row. Then open the Manuals tab (step 6) when it exists.
- **Deployed, not on main — this is the step-3 list** (it becomes true the moment the two deploy commands above run; nothing of it is on `main` yet): the clean copy `C:/Roam/Goride-mm3` (branch `mm-step3`, from `origin/main` e38dd9c72) carries **only** these files added or changed: `supabase/functions/maintenance-manual-worker/index.ts` (new function), the nine `supabase/functions/_fleet-server/maintenance_manual_*.ts` sources (new), `supabase/functions/_fleet-server/maintenance/index.ts`, `supabase/functions/fleet-ops/src/main.ts`, `supabase/functions/fleet-ops/index.ts` (rebuilt bundle, 171 routes), `supabase/functions/fleet-ops/routes.generated.json`, `supabase/functions/_shared/extractionStatus.generated.ts`, the step-1 server edits in `maintenance_routes.ts` (`parseDueKind` / `defaultDueKindFor`) and `maintenance_service_ledger_core.ts` (bootstrap skip), `supabase/config.toml` (`[functions.maintenance-manual-worker] verify_jwt = false`), the two migrations, and the `ALL_FNS` line in `.github/workflows/deploy-supabase-edge.yml`. **Files step 3 was expected to touch that needed no change on main:** `rbac_middleware.ts` (main already stopped skipping `/upload`) and the rest of `maintenance_routes.ts` (main's `countListings` work stays as it is).
- **Live check before deploying:** live's `fleet-ops` was downloaded and compared with a bundle built from `origin/main` — **byte-identical** (SHA-256 `92395ffe…`), so nothing live was newer and nothing had to be carried in.
- **Next: step 4** (Dominion "Which cars" — MER-01/MER-02) and **step 6** (the Manuals tab that uses these routes).

**Build step 3b — DeepSeek page reader, with Gemini as the backup: LIVE 27 Nov 2026** (owner pasted the SQL and deployed maintenance-manual-worker v4 from mm3; fleet-ops v484 carries the step 4/6 + As-needed-count fixes). Claude checked live: `reader` column, 5-argument finish function not callable by signed-in users, logbook line 20261127143144, worker refuses callers without the cron secret (403), no failed cron runs.
- **Side-by-side run by Claude 27 Nov (key now set on live and in mm3 `supabase/functions/.env`):** page 4 (typed): both readers 6 rows, **no differences**; DeepSeek 4.4 s / $0.00086, Gemini 32.9 s / $0.00018. Page 5 (scanned Japanese): both 5 rows, **no differences**, names in English; DeepSeek 4.8 s / $0.00076, Gemini 8.2 s / $0.00016. DeepSeek is faster and about 5× the cost (still under a tenth of a cent a page). Default stays `"deepseek"`.
- **Built:** a second page reader next to Gemini in `maintenance_manual_reader.ts`. DeepSeek gets the **same one-page PDF and the same prompt**: the page PDF is uploaded to DeepSeek's Files API with the document-parsing purpose `rich_layout_recognition` (so a scanned picture of a table keeps its figures), read by `deepseek-flash` (the one model constant is in `deepseek_models.ts`) with JSON output and thinking off, and the uploaded file is deleted as soon as the page is read — on success and on failure. The strict rows and the dropped-row count are the same `parseManualPage` Gemini uses. The prompt now also says the page may be Japanese and the part names must come back in English (e.g. エンジンオイル → Engine oil).
- **Which reader runs is a setting:** `manual_reader` (`"deepseek"` | `"gemini"`, default `"deepseek"`) in kv_store key `maintenance_manual:settings` (`maintenance_manual_settings.ts`, same shape as `part_pictures:settings`). The worker reads it fresh every run, so the choice needs no deploy. A DeepSeek failure on a page (error, timeout, or a bad JSON answer twice) reads **that page** with Gemini **in the same attempt**; the page job records which reader produced its rows (`maintenance_manual_page_job.reader`, new column) so a fallback is visible instead of silent.
- **Spend:** every DeepSeek call goes through `trackedProviderCall` (provider `"deepseek"`, tokens, cost) exactly like Gemini. `api_pricing.ts` now holds DeepSeek's peak rates ($0.30/1M input cache-miss, $1.20/1M output — peak on purpose so the budget guard never undercounts) and file parsing at $0.225 per 1,000 pages. The pause and budget rules are unchanged: out of budget **waits**, it never fails the page, and a pause on one provider never becomes a fallback to the other.
- **Proven by:** 81 Deno tests, all passing: the 11 `maintenance_manual_*` / `maintenance_master_*` files (72 tests, including the new 11 reader tests, 5 settings tests, 10 prompt tests and 7 worker tests) plus `api_pricing` (9). `deno check` is clean on every changed server file; `node scripts/validate-migration-sql.mjs` passes.
- **Real side-by-side, same pages, real calls** (`scripts/mm-reader-compare.ts`, 8-page test manual: page 4 typed table, page 5 a scanned picture of a Japanese table):

  | Page | Reader | Rows | Time | Tokens in/out | Cost |
  |---|---|---|---|---|---|
  | 4 typed | Gemini | 6 (all numbers right) | 11.2 s | 945 / 364 | $0.000180 |
  | 4 typed | DeepSeek | **not run** — no key | — | — | — |
  | 5 scanned (Japanese) | Gemini | 5 (all numbers right, names in English) | 8.5 s | 945 / 286 | $0.000157 |
  | 5 scanned (Japanese) | DeepSeek | **not run** — no key | — | — | — |

  **The brief said the DeepSeek key was already set; it is not.** Checked 27 Nov 2026: `supabase secrets list` on `csfllzzastacofsvcdsc` has no `DEEPSEEK_API_KEY`, and `C:/Roam/Goride-mm3/supabase/functions/.env` does not exist. So the DeepSeek half of the comparison could not be run and **nothing is claimed about DeepSeek's accuracy**. The script rebuilds the 8-page manual (typed page 4, scanned Japanese page 5) on every run, so the comparison is one command away once the secret exists: `deno run --allow-read --allow-write --allow-env --allow-run --allow-net scripts/mm-reader-compare.ts`. Until the secret is set, the default reader is still `"deepseek"` as the brief asked, and every page falls back to Gemini (a missing key sends no request).
- **No Japanese page exists in the repo fixtures**, so the "real Japanese page" part of the comparison is the generated scan on page 5 (Japanese table, read correctly by Gemini: Engine oil, Oil filter, Spark plugs, Brake fluid, Coolant).
- **To put it live**, in this order, from `C:/Roam/Goride-mm3`:
  1. Set the key (the owner's value; it never touches a file in the repo): `npx -y supabase@latest secrets set DEEPSEEK_API_KEY=<the key> --project-ref csfllzzastacofsvcdsc`
  2. Paste [`maintenance_rebuild_deepseek_LIVE_apply.sql`](maintenance_rebuild_deepseek_LIVE_apply.sql) into the SQL editor (one migration + its logbook line; paste it **before** the worker deploy, the worker calls the 5-argument finish function).
  3. `npx -y supabase@latest functions deploy maintenance-manual-worker --project-ref csfllzzastacofsvcdsc --use-api --yes`
  **No fleet-ops deploy:** no fleet-ops route or file changed. The shared `api_pricing.ts` / `api_usage_logger.ts` edits are additive (a new provider row and test-only seams) and fleet-ops behaviour is unchanged.
- **Live check before deploying (27 Nov 2026):** the live `maintenance-manual-worker` and `fleet-ops` were downloaded into a scratch folder (not over the copy). The worker's live modules are the step-3 versions: every string in them exists in the copy, and the only live tokens missing from the copy are the pre-change lines of the files this round edits (old `finish_page` column list, old prompt wording, `callManualPageReader`). Live `fleet-ops` registers the **same route set** as the copy's bundle (185 `.get/.post/...` calls, no route only on one side). Nothing live is newer than the copy.
- **Deployed, not on main — the step-3b list** (true once the paste and the worker deploy above run): `supabase/functions/_fleet-server/maintenance_manual_reader.ts` (DeepSeek reader, fallback, delete), `maintenance_manual_worker.ts` (records the reader), `maintenance_manual_job_db.ts` (`reader` column + `p_reader`), `maintenance_manual_prompt.ts` (Japanese→English rule), `api_pricing.ts` (DeepSeek rates), `api_usage_logger.ts` (test-only guard/log seams), the new `deepseek_models.ts` and `maintenance_manual_settings.ts`, `supabase/functions/maintenance-manual-worker/index.ts` (setting + both readers), the migration `20261127143144_mm_manual_page_reader.sql`, and the new tests (`maintenance_manual_reader.test.ts`, `maintenance_manual_settings.test.ts`, additions to the prompt / worker / pricing tests). On the branch but not deployed: `supabase/.env.example` (the new key's name), `scripts/mm-reader-compare.ts`, `scripts/mm_reader_compare_scan.py`, this paste file.

**Rev 2 · 27 Nov 2026** (Rev 1 was 27 Nov 2026). Review only. The review pass changed no code.
**Live project:** `csfllzzastacofsvcdsc`. Everything below was read live with `SELECT`-only SQL, or read from the files named.

## Changed in Rev 2

- **MER-04 narrowed.** Only **49** service, repair and labour part types become as-needed — not all unscheduled parts. `frequency_kind` already allows **`manual_only`**, and that is what it means, so **no new value is added**. The other **102** part types are labelled **"No schedule yet"** (a holding state, not a claim that they have an interval). The live count is corrected from 136 to **151** (167 part types − 16 with a schedule). Every one of the 151 is listed with its call in **Appendix A**.
- **MER-06 moved market off the car.** Market lives on `maintenance_manual` and on each rule copied from it — not on `vehicle_platform` and not on `vehicle_catalog`, because writing "JM" on a car built for Japan is false data. The manual winner order (Jamaica → nearest market for that model → Japan) is written into **B1** and **B2**.
- **MER-11 no longer hides a real risk.** A part whose history nobody knows gets its own status, **History unknown**. It is shown and counted on its own — never as Overdue, never as OK — and asks "Check at next service". It ends the moment "last done" is filled in. Added how the **3 existing cars** get their history filled, not only new ones.
- **MER-05 no longer blocks real manual data.** A car maker rule needs normal numbers, plus either severe numbers or a ticked **"the manual gives no severe number"**. Severe then equals normal and both screens say so. A save is never refused for a number the manual does not have.
- **MER-08 / B4 expanded.** The owner picks the **page range** of the maintenance table; **scanned pages are read as images**; the upload runs as a **background job with progress**, because a full manual cannot finish inside the 150 s edge limit (the saved-page upload already hit a 504 — `docs/saved-page-parts-audit.md:21`).
- **Two new findings:** **MER-25** (harder driving is off for every car, the reason sent is a fixed string, and nothing is recorded) and **MER-26** (a car can be added with no odometer at all — which is why two of the three cars have no readings).
- **DVIR odometer checked:** it **does** write a reading, so no finding. Fuel and weekly check-in readings already feed the odometer ledger too (577 and 33 on the only car in use).
- **MER-23** (split the Log service file) moved into the build order as **step 9**, before any Fleet screen work.
- Kept as checked and true: **MER-01, MER-03, MER-09, MER-13, MER-16, MER-24**, and the `first_reading` cause behind MER-11.

**The short answer.** Do not tear the whole section down. The hard part is already built and it is good: one rule table with a proper "who wins" order, a recompute engine, per-car overrides with a reason, a due view with your own thresholds, and opening/closing alerts. What is wrong is small and local: one type limit blocks "part schedule", as-needed exists but is unused, three screen choices can never save, the manual has no home, and a part nobody has touched since the car joined is reported as overdue instead of "history unknown". Fix those, add a home for the manual, and stand up a Driver surface that today does not exist. That is roughly a third of a rebuild, at a fraction of the risk.

---

## 0. Scope — every screen, sub-page, dialog and button (listed once, in full)

### Roam Dominion (`apps/admin`) — Vehicles › Master data › Maintenance templates
`MaintenanceMasterPage.tsx` — one page, six tabs, and a screen for each part:

| # | Screen | What is on it |
|---|---|---|
| D1 | Page shell | Breadcrumb `DOMINION › MASTER DATA › VEHICLES › MAINTENANCE TEMPLATES`; title "Maintenance templates"; subtitle "How often each part is serviced, for which cars, and why."; tab bar with live counts; "You can look but not change schedules" (analyst); "Maintenance master governance is off" (flag off) |
| D2 | **Part schedules** tab | Info banner + "How this works"; 3 summary cards (Part schedules / Where numbers come from / Needs your attention); search; **Preview a car**; **Add schedule**; source chips (All sources · Car maker · Part maker · Roam policy); status chips (All status · Active · Needs checking · Draft · Retired); "Who it covers" select (All · Everyone only · Has more specific); area grouping; mobile card list; desktop table with 7 columns; 3 explainer cards; "Due is whichever comes first" footnote |
| D3 | Part detail (ladder) | ← Part schedules; part name + op code; 5 rungs — One car version · Platform · Platform family · Engine · Everyone — each with **Edit** / **Retire** / **Add schedule for this part**; "Used by"; "Linked packages"; "Last changed" |
| D4 | Add / Edit schedule drawer | Which part select; Which cars chips (Everyone · Engine · Platform family · Platform · One car version); car search (one car version only); "Covers N catalogue cars"; class chips car/van/truck; Year from / Year to; Every `_` km / or every `_` months; **Severe duty (shorter interval)** + severe km + severe months; source radios (Car maker's manual or catalogue · Part maker's catalogue · Roam policy); **Load Roam policy starter set**; Evidence link; Confidence (Confirmed/Likely/Uncertain); summary line; Cancel / Save as draft / Make active; "Edit schedules on a larger screen" under 768 px |
| D5 | Before-saving confirmation | "Save this schedule?" / "Send this change for approval?" / "This schedule is a draft"; before → after; "Every app picks up the new schedule tonight"; Cancel / Save schedule / Send to owner for approval |
| D6 | Preview a car | Search catalogue car (datalist); **Hard use (severe duty)** checkbox; table Part · Interval used · Comes from · Source · Status with "instead of everyone's …"; "Not on this car" list; **Export breakdown**; close |
| D7 | **Service packages** tab | Info banner; one card per package: name, status chip, "Every N", "N jobs", **Edit jobs**, part tiles (Required / Check only / interval / action chip), "+ N more jobs", check-only note |
| D8 | Edit service package drawer | Name (with duplicate-name guard); Visit rhythm; Every km / or months; Add a part search + candidates; per-part "Required at this visit" checkbox; Remove; Cancel / Save package |
| D9 | **Jobs** tab | Search; group/section tree; **Manage sections**; **Add job**; per job Edit / Retire / Restore; job drawer; May-need list + **Add may-need** dialog; Fits section + **Group fits** drawer; **Retire job** dialog |
| D10 | **Supplies** tab | Supply list, **Add supply**, supply drawer (name, unit, notes), **Retire supply** dialog |
| D11 | **Review list** tab | "Things that need your decision"; toggle Two schedules for the same cars / Waiting for owner approval; conflict cards with **Keep A** / **Keep B** / **Retire both**; support-request cards with **Approve** / **Reject** + reason; "All clear" state |
| D12 | **History** tab | Search; kind toggle All / Jobs / Sections / Also-do links / Schedules; date range 7/30/90/All; **Export CSV**; entries grouped by day with before/after; loading skeleton; error + "Try again"; empty + "Show all time" |
| D13 | Part types (in the Jobs tab) | Part-type table; **Retire part type** dialog |
| D14 | Health card (lives on **Catalog Quality**, not this page) | 7 counts including "Schedules by source: Car maker 0 · Part maker 0 · Roam policy 16" |

### Roam Fleet (`apps/fleet`) — Maintenance
| # | Screen | What is on it |
|---|---|---|
| F1 | Hub header | Title; **Refresh**; **Log service**; "Nightly check didn't run last night" banner + Refresh |
| F2 | KPI cards | Overdue count, cars with no telemetry, fleet total, next scheduled window, parts requisition, cost/km, PM on-time %, found-by-inspection chip |
| F3 | Tabs | Overview · Service history · Find parts · Not done yet · Requests · Schedule (Work orders and Inspections were folded into "Not done yet", `FleetMaintenanceHub.tsx:177-188`) |
| F4 | Overview table | Filters: plate/model search + 5 source chips (All · Roam policy · Car maker · Needs checking · Waiting for odometer); columns Vehicle · Plate · Odometer · Status · Next due · Due items · Last service · Actions; per row **View due items**, **Log odometer**, **Log service**, ⋯ (Log odometer / Odometer history), **Clear do not drive** (with reason dialog, min 10 characters); footer "Showing N of M"; **Go to Vehicles** |
| F5 | Due items drawer | Car card + odometer + **Hard use** / **Mark as hard use**; "We need a first odometer reading" banner + **Log odometer**; Found-by-inspection block; Overdue / Due soon / OK lists; per line **Why this schedule?**, **Set custom schedule**, source chip, "Custom: every …", Needs-checking / Custom / Updated-by-Roam / Waiting-for-odometer chips; footer **Log odometer**, **Log service** |
| F6 | Why this schedule? popover | Where the number comes from, counting-from, last change, **Set custom** |
| F7 | Set custom schedule dialog | Custom km/months + reason (must be shorter than Roam's) |
| F8 | Mark as hard use dialog | On/off switch + Save (no reason box today) |
| F9 | Odometer history drawer | Readings list; **It's correct**; **Void** |
| F10 | Log odometer dialog | Date, reading, first-reading note |
| F11 | Which car dialog | Car list with status; **Continue** |
| F12 | Log service wizard | 4 steps — Date & mileage · What was done · Line details · Review — plus the system picker, part picker, Where-on-car chips, Found work, Items used, Parts that fit, Job fit, Also done on this visit, Plan job, Warranty, Pick part, Other part search, Add to inspection, quote mode, discount, invoice upload, Save states |
| F13 | Service history panel | Filters Car · Date window · Search; 3 stat cards; Not finished services; "Recorded maintenance events" table with expandable job cards, invoice link, **View service**, **Delete** a job, discount → total, pagination |
| F14 | Service detail dialog / Delete dialog | Whole service view; per-job delete with reason |
| F15 | Requests tab | Driver request cards (car, type, priority, photo); **Approve**; **Decline** + reason |
| F16 | Schedule tab | Car select; due table with checkboxes on overdue; **Create work order (N)** |
| F17 | Notifications bell | Open / Closed alerts; part notices ("Roam added the … for your …") |
| F18 | Find parts tab | Part search, quotes, "Use in service" |

### Roam Driver (`apps/driver`) — car kit and reports
| # | Screen | What is on it |
|---|---|---|
| P1 | My car kit | Back to Vehicle; **Pre-shift inspection**; plate chip; progress ring; weekly check-in line; "N reports fixed by the fleet"; Required inventory rows with status actions and **Report**; "Also in this car"; **Report something else**; "Need depot assistance?" |
| P2 | Report a problem sheet | Issue chips Damaged / Missing / Not working; photo (optional); notes; **Send report** |
| P3 | Report sent | Confirmation |
| P4 | My reports / Update a report | Report list; update sheet |
| P5 | Pre-shift inspection (DVIR) | Odometer; item list with **Pass** / **Attention** / **Fail**; photo required on Fail; notes; **Submit DVIR** |
| P6 | *(missing)* | Nothing shows a driver what is due, or that the car is flagged do-not-drive |

### Server and database
`supabase/functions/_fleet-server/`: `maintenance_routes.ts` (5,294 lines), `maintenance_master_routes.ts` (1,266), `maintenance_jobs_admin_routes.ts`, `maintenance/` split (alerts/KPI, inspections, work orders), `maintenance_completion.ts`, `maintenance_service_ledger_core.ts`, `maintenance_bootstrap_core.ts`, `maintenance_master_fleet_enrich.ts`, `maintenance_master_starter.ts`, `canonical_from_ops.ts`, `odometer_ledger.ts`, `saved_page_text.ts`, the research worker files.
Database: `maintenance_task_templates`, `vehicle_component_schedule`, `vehicle_maintenance_schedule`, `maintenance_service_categories`, `maintenance_package_categories`, `maintenance_supply`, `maintenance_job_*`, `maintenance_unit`, `maintenance_rule_conflict`, `maintenance_work_orders` + lines, `maintenance_inspection_*`, `maintenance_parts_usage`, `maintenance_records`, `maintenance_service_ledger`, `catalog_component_applicability`, plus `fleet.*` (`maintenance_due_v`, `maintenance_alerts`, `maintenance_events`, `maintenance_job_runs`, `maintenance_audit_log`, `maintenance_logs`, `driver_maintenance_notifications`, `odometer_readings`, `fuel_entries`, `transactions`, `vehicles`) and the functions `mm_*`, `schedule_rule_for_part`, `run_maintenance_nightly_check`, `recompute_*`, `maintenance_alerts_supersede_open`.

### Outside focus
- `apps/plug` — no maintenance screens; it reads fuel only. Not reviewed.
- `apps/dash-customer`, `apps/dash-merchant`, `apps/dash-courier` — no maintenance screens.
- `apps/rush-command` — no maintenance screens.
- `apps/haul`, `apps/enterprise`, `apps/rides-passenger` — out of scope; nothing read.
- Parts database / Find parts / part research depth — reviewed only where maintenance depends on it (part types, fit, evidence).
- Business Finance screens — reviewed only as the receiving end of a logged service.

---

## What I checked live (the six things we already knew, plus Rev 2 checks)

| Claim | Live result | Notes |
|---|---|---|
| 16 part schedules active, all `global`, all `roam_policy`, no evidence | **True.** 16 rules with a part attached, 21 rows total, **all** `template_scope = global`, **all** `source_type = roam_policy`, **all** `evidence_url` empty, `verified_at` empty on every row | `maintenance_task_templates` |
| No car maker and no model-specific rule | **True.** `source_type` counts: car maker 0, part maker 0, Roam policy 21. `vehicle_catalog_id`, `platform_id`, `engine_family_id` are null on every row | The screen's "Car maker 0 · Part maker 0" is honest |
| `severe_interval_km` / `severe_interval_months` empty on every row | **True — 0 of 21.** The drawer has both fields and the server writes both | So "Hard use" changes nothing today |
| cars have a `severe_duty` switch | **True — and it is off on all 3, and nothing sets it when a car is added** | `fleet.vehicles.severe_duty`; `AddVehicleFlow.tsx` has no such field |
| Many parts show with no schedule | **True, and the number is 151, not 136.** 167 part types, 16 with a schedule, **151 without** (Engine service labor, Throttle Body Relearn, Throttle Body Cleaning, Leak Inspection, Fuel Injector Cleaning, Spark Plug Wires …) | Full call for each of the 151 in Appendix A |
| Service packages live in the same table as the part schedules | **True.** 5 packages (Basic Service, Oil & safety check, Intermediate Service, Major Service, Long-Term Service), task_code null, no part attached | **My call: one table is right.** The mistake is not the mix — see MER-03 |
| Saved-page upload detects PDFs then refuses them | **True.** `fileKindInfo` returns `pdf`; `isWebPage` returns `{ok:false, kind:"pdf"}` → "This file is a PDF" stop card | `saved_page_text.ts:38-73`, test `saved_page_text.test.ts:302-308` |

**Checked in Rev 2:**

| Check | Result |
|---|---|
| Does `frequency_kind = 'manual_only'` already mean "as needed"? | **Yes.** The database allows it and three server routes accept it; nothing in the engine ever gives it a due date, because `mm_recompute_schedule_row` and `schedule_rule_for_part` read only the km and month intervals. It is never set: the Dominion drawer does not send `frequency_kind` at all, and no screen renders it. **So use it, do not add a value.** |
| Do fuel logs become odometer readings? | **Yes, already.** 5179KZ: **577** readings with source `fuel`, **33** with source `checkin`, **19** with source `service` — out of 613 fuel entries, 578 of which carry an odometer. `odometer_ledger.ts` projects every one. |
| Why do 1505LM and 5404LK have no readings? | Because they have **no fuel entries at all** (0 rows each) and no check-in rows and no DVIR. Nothing is broken; there is simply nothing to convert, and nothing ever asked for a reading when the car was added. |
| Does the pre-shift DVIR write an odometer reading? | **Yes.** `maintenance/routes_inspections.ts:246-264` calls `projectFromMaintenanceLog`, which writes a **verified** reading (`odometer_ledger.ts:547-571`). It records it with source `service`, so a pre-shift read looks like a garage service. It has never run live: `maintenance_inspection_findings` has **0 rows**. |
| Does switching harder driving record who or why? | **No.** `MmHardUseDialog.tsx` sends the literal string `"fleet maintenance"`, and `PATCH /vehicles/:id/maintenance/severe-duty` (`maintenance_master_routes.ts:1114-1145`) stores the flag and returns the reason without writing it anywhere. The dialog title also renders `Hard use Â· <plate>` with a broken character. |
| Can a car be added with no odometer? | **Yes.** `AddVehicleFlow.tsx` never asks for one. |

**Also checked and fine** (so nobody re-checks):
- The "who wins" order is real and correct: one chassis (1) › model family (2) › engine family (3) › everyone (4).
- `maintenance_task_templates_part_rule_evidence_check` already **forces** an evidence link on any car-maker or part-maker part rule. Your "marked Car maker with the manual as evidence" rule is half-built in the database.
- Revisions exist: every change writes `platform_revision` with actor + before/after, and each car's row stores `rule_revision_no`.
- Fleet's own override exists and already needs a reason, and can only make the interval **shorter**, and is dropped automatically if Roam tightens the rule below it.
- The due view is good: your own `due_soon_km` (1,000) and `due_soon_days` (14), km-overdue, days-overdue, and a projected date from average km/day over 30 days.
- The nightly job runs (07:00 UTC, `fleet.run_maintenance_nightly_check`) and records drift; 19 open alerts, and only **1 of 19** is stale. Alert open/update/supersede works.
- A part that cannot be on a car (powertrain fit) is retired automatically with a reason.
- Service history reads work orders + lines only, and hides voided lines — one clean source.
- A safety-critical DVIR **Fail** really does set do-not-drive and writes an audit event (`maintenance/routes_inspections.ts:207-230`).
- The DVIR odometer write works and is marked verified (see above).

---

## A. Verdict per layer

| Layer | Verdict | Why, in plain words |
|---|---|---|
| **Database** | **FIX** | The valuable parts are already right: one rule table with a proper "who wins" order, severe columns, revisions, an evidence rule, a resolver, a recompute engine, per-car overrides with a reason, a due view with your own thresholds, and alerts that open and close. One type list blocks "this is a part schedule"; as-needed (`manual_only`) already exists but is unused; there is no market and no page number anywhere, and no "history unknown" state. Fix those in place. |
| **Server** | **FIX** | Behaviour is sound and the money/odometer/void paths are careful. Problems are local: one route writes to a table that does not exist, the preview route uses a different year than the car itself, the hard-use switch records nothing, and the research engine can only read saved web pages, never a PDF. Do not rewrite 5,294 lines of working maintenance routes. |
| **Dominion screens** | **FIX** | Six tabs, 13 Stitch screens, sensible layout, honest chips. But three of the five "Which cars" choices can never save, severe numbers are optional, and there is no screen that says "this model family has no manual yet". Fix the drawer, add one tab. |
| **Fleet screens** | **FIX** | The hub, the due drawer, the wizard and the history are real and used. Missing: a due line cannot be logged on the spot ("Log this"), there is no screen listing open work orders, "Clear do not drive" is broken, and harder driving is off and unrecorded. None of that needs a rebuild. |
| **Driver screens** | **REBUILD** (this layer only) | There is nothing to fix because nothing is wired. The Driver app has three maintenance API calls and calls none of them. The only inspection screen loads whatever template is first and reports to a place the driver never sees. A driver cannot see what is due, cannot ask for a service, and is not told the car is flagged. Stand this layer up from scratch inside the existing car-kit shell. |
| **Crons** | **KEEP** | Nightly recompute + alert write at 07:00 UTC, and the 5-minute event sweep, both active and working. One addition only: an "Odometer needed" alert. |

---

## B. The target design for an enterprise-level maintenance system

### B1. How schedules are stored

**One rule table, four legal "who it covers" levels, one authority field.** Keep `maintenance_task_templates`. Change five things.

| Concept | Today | Target |
|---|---|---|
| What a row is | `due_kind` allows only `service_package` / `statutory_inspection`, so all 21 rows claim to be a package | `rule_kind`: `part_schedule` · `service_package` · `inspection` · `other`. Set on the 16 part rules and the 5 packages |
| Who it covers | One chassis › model family › engine family › everyone. Three of the four cannot be created from the screen | Same four levels, and "Model family" is stored as a `platform` rule pointed at the **family** platform (the parent), because that is exactly what the resolver already prefers. Screen label: **Model family** |
| Authority | `source_type`: car maker (`maker_manual`), part maker (`part_maker`), Roam policy (`roam_policy`). Evidence is already forced on the first two | Keep. Add `evidence_page` so the citation is "Owner's manual, page 214", not a bare URL |
| Normal vs severe | Both column sets exist; severe is empty on every row | Both are required for a car-maker rule, **unless the manual gives no severe figure** — then a tick records that, severe equals normal, and both screens say "no severe figure in the manual". Never refuse a save for a number the manual does not have |
| Distance and time | `interval_km` + `interval_months` + `interval_km_max` (a range) | Keep. "Whichever comes first" stays |
| As needed | No rule uses it, though `manual_only` already exists | `frequency_kind = 'manual_only'` **is** as-needed: no interval, no due date, never counted. Applies to the 49 repair, cleaning, inspection, adjustment, machining and labour part types in Appendix A |
| Not scheduled yet | Nothing distinguishes "no interval" from "nobody has filled this in" | Every other part type (the 102 in Appendix A) reads **"No schedule yet"** — a holding state, waiting for a manual or a Roam policy rule |
| Cars a rule fits | `applicable_vehicle_classes`, `year_from`/`year_to` | Keep. A manual page usually covers a year range, so this is the right shape |
| Market | Nothing on the car, and nothing on a manual because there are no manuals. `vehicle_catalog.market` is null on **2,679 of 2,679** rows — and writing "JM" there would be false, because these cars were built for Japan | `market` lives on **`maintenance_manual`**, and every rule copied from a manual carries the same market. The car and the model family carry no market at all. A small fixed rank table decides between manuals: **Jamaica (JM) 1 · the nearest market for that model 2 · Japan (JP) 3 · anything else 4** |
| Evidence and revisions | `evidence_url` + `platform_revision` history | Keep both. Every rule points at one `maintenance_manual` row and one page; every change keeps its before/after and actor |

**Who wins when one family has several manuals.** Specificity first, then market: the most specific rule wins (one chassis → model family → engine family → everyone); if two rules are equally specific, the manual they came from decides — **Jamaica first, then the nearest market for that model, then Japan**, then any other market. For this fleet, where every car is a Japanese import, that means a Jamaican-market manual always beats the Japanese one, and Roam policy only runs where there is no manual at all.

**Why one table and not two.** A package is a thing with a rhythm that groups parts for one visit. A part schedule is a thing with a rhythm that is due. They are the same shape, they join to the same part list, and the existing package screen already says "a package does not change when a part is due" — that separation is a property of the *data* (`maintenance_package_categories`), not of the table. Splitting them would duplicate the revision, evidence and scope machinery for no gain. **The mix is right. The missing `rule_kind` is the problem.**

### B2. How a car gets its schedule

1. **The car is identified by chassis code, not VIN.** The fleet already does this: 5179KZ → `M900A` → platform `M900A — Toyota Roomy, Toyota Tank` → parent family `M900-2WD-FAMILY — Roomy / Tank / Thor / Justy · 2WD (M900)`. 1505LM → `GP5 — Honda Fit`. 5404LK → `ZYX10 — Toyota C-HR`. Adding a car means picking the chassis code, which picks the variant, the family, the engine family and the powertrain. **This is already the data model. No VIN lookup is needed and none should be built.**
2. **Which rule wins** (already implemented, keep): one chassis → model family → engine family → everyone. If two rules tie, the newer one wins and a "needs checking" flag appears in the Review list.
3. **Which manual wins** when a family has more than one: **Jamaica first, then the nearest market for that model, then Japan**, then any other market. Market is a property of the manual and the rule, never of the car — so a Japanese-market manual can never silently outrank a Jamaican one for a car built for Japan.
4. **Powertrain gate** (already implemented, keep): if the part cannot be on this car's powertrain, the schedule row retires with the reason "Job doesn't fit this car's powertrain".
5. **Harder driving (severe) is the default, not a switch somebody remembers.** Every car added is marked hard use — 100% of this fleet is Kingston ride-hail. A manager can switch it off only with a written reason, and the change is recorded with who, when and why. Today all 3 cars are `false` and nothing is recorded (MER-25).
6. **The fleet's own override**: a manager can set a shorter interval with a reason. It is stored on the car's row (`custom_interval_*` + `custom_reason` + who + when), it shows as "Custom", and Roam tightening the rule below it removes it automatically. Keep exactly as it is.
7. **Every car row records `rule_id` and `rule_revision_no`**, so "why is this number on this car" is always answerable.

### B3. How due and overdue is worked out

- **The clock starts at the last time the part was really done** — km and date from a logged service or a filled-in history.
- **When nobody knows when it was last done**, that is its own answer, not a guess. The part shows **History unknown**, counted on its own, with the prompt **"Check at next service"** — never Overdue, never OK. It ends the moment "last done" is filled in, and the normal status takes over on the next recompute.
- **How the 3 existing cars get their history filled.** Each car gets a one-off pass with the same screen used at onboarding: a list of the parts on that car's schedule with "last done km / date" boxes, and a **"Check at next service"** tick for anything the owner cannot date. 5179KZ has 28 parts (12 of which currently have no rule at all), 1505LM and 5404LK have 16 each. Until the pass is done, those parts stay History unknown; the pass is a task on the Fleet overview, not something anyone has to remember.
- **Next due** = start km + interval km; **next due date** = start date + interval months. **Due when either is reached.** (Already the rule.)
- **Status** = your thresholds: overdue, due soon within 1,000 km or 14 days, otherwise OK. (Already the rule.)
- **No reading at all** → "Waiting for odometer", and one alert so somebody acts.
- **Nightly** recompute every car, record any drift, and keep exactly one open alert per car + part, superseded the moment the number changes. (Already the rule.)
- **Never sum in the app.** The database computes; the screens ask. (Already the rule.)

### B4. How the manual gets in

New, and it is the centre of the rebuild:

1. **Pick the family, once.** Owner opens the family (e.g. "M900 — Roomy / Tank / Thor / Justy · 2WD").
2. **Upload the PDF once, and say which pages matter.** A new `maintenance_manual` row: family, **market**, title, file, page count, file hash, **the page range of the maintenance table**, who uploaded, when. Owner's manuals run to hundreds of pages, so the upload asks for the range up front and only that range is read.
3. **The system reads the table.** A new PDF reader takes the chosen pages, pulls the text where the PDF has text, and **renders scanned pages to images** where it does not, then asks the existing research AI for rows: part, normal km, normal months, severe km, severe months, and the page each row came from.
4. **It runs in the background, with progress.** A whole manual cannot finish inside the 150 s edge limit — the saved-page upload already hit a 504 (`docs/saved-page-parts-audit.md:21`). So the upload returns at once, the work runs as a job (the same pattern as `catalog_research_job` and its minute cron), and the screen shows "Reading page 214 of 232".
5. **Rows land as drafts** — `status = draft`, `source_type = maker_manual`, `confidence = likely`, `evidence_url` = the manual, `evidence_page` = N, `market` = the manual's market. Nothing is live yet.
6. **The owner checks.** One screen: the manual's page on the left, the parsed rows on the right, one row per part. "Approve" or "Approve all". Approved rows become `active` with `confidence = confirmed` and `verified_by` / `verified_at`. A row the manual gives no severe figure for is approved with the "no severe figure" tick.
7. **Live.** Every car in that family recomputes immediately and the due list changes.
8. **Forever after**, any number on any screen can be answered with "Owner's manual, page 214" in one click.

**Roam policy stays as the fallback**, labelled exactly that: "Roam policy — no manual yet". The moment a family gets a manual, its policy rows are replaced by car-maker rows, not deleted, so a family can fall back again.

### B5. What Fleet sees

- **Hub**: same six tabs. Add a "Where this number comes from" line on the due rows: **Car maker · page 214** or **Roam policy — no manual yet** or **Fleet override — reason**.
- **Due items drawer**: each line gets **Log this**, which opens the wizard already on that part (missing today). Retired parts show the real reason. Each line shows the counting-from point. Parts with unknown history sit in their own **History unknown** section with **Check at next service**.
- **New: Work orders tab.** Open work orders with status, vendor, priority, off-the-road since, and the jobs on them. This is the screen Requests already depends on.
- **Do-not-drive**: reason, who set it, when; clearing works; the driver is notified.
- **Log service**: unchanged. It is good and it is where the money is.

### B6. What Driver sees

- **My car kit** gains one card at the top: **Service due** — the next 3 items with km or date, "nothing due" when clear, and **Report a problem** which files a request against that car.
- **Do-not-drive banner** on the same screen when the car is flagged, with the reason and "Call fleet support".
- **Pre-shift DVIR**: the template for this car's class (not simply the first row), the odometer pre-filled from the last reading, and after a safety Fail: **"This car is now do-not-drive. Call the fleet."** The reading it captures is saved with its own source, so a pre-shift read is never mistaken for a garage service.
- **Notifications**: the `driver_maintenance_notifications` table and its route exist and are unused. Wire them.

---

## C. Findings

Each has one fix. No options.

| ID | What's wrong | Where | One fix |
|---|---|---|---|
| **MER-01** | Three of the five "Which cars" choices can never save: **Platform**, **Platform family** and **Engine**. The drawer sends only the scope name and never sends `platform_id` or `engine_family_id`, and "Platform family" is not even a legal value. Save fails on the database check. This is why there are 0 rules below "Everyone". | `MaintenanceMasterScheduleDrawer.tsx:127-151` and `:271-304`; constraint `maintenance_task_templates_scope_check` | Add a platform picker (searchable, by chassis code) and an engine-family picker; send the id with the scope; drop the "Platform family" chip and let a family be chosen as a *platform* (the family row) instead. |
| **MER-02** | The part ladder promises a **Platform family** rung that no rule can ever occupy, so it always says "No schedule at this level". The resolver reads a family as a platform, not as a scope. | `PartScheduleLadderView.tsx:6-12`, `:65-127`; `mm_part_rule_rank` | Resolve the family rung by the car's parent platform (rank 2 in `mm_part_rule_rank`) instead of looking for a `platform_family` scope, and label it "Model family". |
| **MER-03** | The database cannot say "this row is a part schedule". `due_kind` allows only `service_package` and `statutory_inspection`, so all 21 rows — 16 part rules and 5 packages — claim to be service packages. Part and package are told apart only by whether a part is attached. | constraint `maintenance_task_templates_due_kind_check`; all 21 rows | Add `part_schedule` and `inspection` to the allowed values of `due_kind` and set it on the 16 part rules and the 5 packages. |
| **MER-04** | **151 of the 167 part types have no schedule, and the screen shows all of them as "—".** Two different things are being shown the same way: work you only do when a job calls for it (relearn, leak inspection, cleaning, diagnosis, service labour), and a part a manual does have an interval for (spark plug wires, timing belt, battery). Marking all 151 as-needed would be as wrong as marking none: it would quietly say a timing belt never needs doing. | `frequency_kind` allows `manual_only` but **no rule uses it** (0 rows) and nothing sets it; `PartSchedulesTab.tsx:266-268`; `maintenance_master_routes.ts:1188-1190` | Split the 151 (full list in **Appendix A**): set `frequency_kind = 'manual_only'` on the **49** service/repair/labour types and make the engine treat `manual_only` as "As needed" (no due date, no car row, never counted); label the other **102** "**No schedule yet**" until a manual or a Roam policy rule fills them. **No new value is added — `manual_only` already means exactly this.** |
| **MER-05** | Severe numbers exist on the screen but are empty on **all 21 rules**, so "Hard use" changes nothing on any car. Requiring severe numbers unconditionally would have the opposite problem: many manuals print no severe figure, and the owner would be unable to enter what the manual actually says. | 0/21 rows have `severe_interval_*`; drawer `:380-408`; `maintenance_master_fleet_enrich.ts:56-68` vs `schedule_rule_for_part` | A **Car maker** rule needs normal km and normal months, plus **either** severe km and months **or** a ticked **"the manual gives no severe number"**; the tick copies normal into severe and both screens print "no severe figure in the manual". The engine reads severe from the rule, never from the display fallback. |
| **MER-06** | There is no market anywhere, so "prefer the manual for Jamaica or the nearest market" has nothing to stand on. `vehicle_catalog.market` is null on 2,679 of 2,679 rows — and putting a market on the car would be false data, because these cars were built for Japan. The only "JM" in the code is a hardcoded research default. | `vehicle_catalog.market`; `catalog_research_worker.ts:269`; no manual table | Put `market` on **`maintenance_manual`**, and copy it onto every rule made from that manual; add a fixed rank (**JM 1 · nearest market for that model 2 · JP 3 · other 4**) and use it to choose between two equally specific rules. Never put a market on `vehicle_platform` or `vehicle_catalog`. |
| **MER-07** | A manual has no home. Evidence is one bare URL; there is no page number, no file, no "read once per family", and no record of who checked it. | `maintenance_task_templates.evidence_url` only; no manual table exists | Add one `maintenance_manual` table (family, market, title, file, hash, pages, page range read, uploaded/checked by) and one `evidence_page` column on rules; point every number at a manual row plus a page. |
| **MER-08** | A PDF is detected and then turned away, and nothing anywhere can read a PDF's text. So the one thing you need most often — an owner's manual — cannot get in. A manual is hundreds of pages and often a scan, so a simple "read the PDF" would also time out at the edge like the saved-page upload did. | `saved_page_text.ts:38-73` (`isWebPage` → `not_web_page`), test at `:302-308`; the 150 s limit and the 504 are recorded in `docs/saved-page-parts-audit.md:21` | Add a PDF reader that returns the same `{ lines, containers }` shape as the saved-page reader, taking **the page range the owner picks**, **rendering scanned pages as images**, and running **as a background job with progress** instead of inside the request. |
| **MER-09** | **"Clear do not drive" is broken.** It writes to `public.vehicles`, which does not exist — the table is `fleet.vehicles`, reachable through `public.fleet_vehicles`. The call fails with a missing-relation error, so a car can be flagged but never cleared from Fleet. | `maintenance/routes_alerts_kpi.ts:212-229` (`fleetDb().from("vehicles")`) | Use `fleet_vehicles` in that route, exactly as the severe-duty route already does (`maintenance_master_routes.ts:1124-1130`). |
| **MER-10** | "Preview a car" can show different numbers from the car itself: preview picks the year with `production_start_year`, while a real car's rule uses its model year first. Two different rules can win for the same car. | `maintenance_master_routes.ts:244`; `mm_vehicle_catalog_for_fleet` | Preview must take a year from the screen (defaulting to the catalogue row's production start) and pass it through the same `mm_pick_part_rule` path the car uses, printing the year it used. |
| **MER-11** | **A part whose history nobody knows is reported as Overdue, measured from the day the car joined the fleet.** It counts from the car's first-ever reading and never moves. On 5179KZ that is 22 of 25 parts overdue, one by 68,980 km — and some of those genuinely are overdue (brake fluid, coolant), which is exactly why they must not be hidden, and must not be mixed in with parts we can actually date. | `mm_recompute_schedule_row` (`baseline_odometer`, `baseline_source='first_reading'`); live rows for 5179KZ | Add a **`history_unknown`** status to the due view: parts with no logged service and no declared history are shown and counted on their own with **"Check at next service"**, never as Overdue and never as OK; the status ends the moment `last_performed_km` / `last_performed_date` is filled. |
| **MER-12** | There is no onboarding step for history at all, and no way to fill it in afterwards either. A car is added, a schedule is generated from the day it arrives, and nobody is asked what was done before. | `FleetMaintenanceHub.tsx`, vehicle add flow; `maintenance_bootstrap_core.ts`; nothing in the due drawer | Add one **"Fill in history"** screen per car: the parts on that car's schedule with "last done km / date" boxes and a "Check at next service" tick. It is used at onboarding **and** for the 3 existing cars (28 + 16 + 16 parts). |
| **MER-13** | Two of the three cars have **no odometer reading at all**, so 50 of 87 schedule rows can never show a km due date, and nothing asks for a reading. The drawer shows a banner only if someone opens that car. | live: 1505LM and 5404LK have 0 readings; 50 rows at `odometer_needed` | Make the nightly check open one "Odometer needed" alert per car with no reading, so it appears in the bell like any other job. |
| **MER-14** | 12 schedule rows on 5179KZ have **no rule at all** but still appear in the due drawer as "OK", with no interval. They are dead parts left over from the old bootstrap and they pad a list that should be short. | `vehicle_component_schedule` rows with `schedule_status='no_rule'`; `fleet.maintenance_due_v` includes every row | Show a row with no rule only when it has a service history, and hide it from the Overdue/OK counts; otherwise drop it from the due list. |
| **MER-15** | Fleet has **no screen that lists open work orders**. The Work orders and Inspections tabs were folded into "Not done yet", yet Requests approve/decline runs through a work order and fails with "No linked work order" when there isn't one. All 40 work orders are closed or cancelled, so nobody can see the queue. | `FleetMaintenanceHub.tsx:177-188`; `MaintenanceRequestsTab.tsx:50-65` | Put a **Work orders** tab back, listing open work orders with status, vendor and off-the-road date, and make each request card open the work order it belongs to. |
| **MER-16** | The Driver app has **no maintenance surface**. Three calls are defined and never used: create a request, read the schedule, read driver notifications. A driver cannot see what is due or ask for a service. | `apps/driver/src/services/api.ts:1575`, `:1611`, `:1675` (no callers) | Add one read-only **Service due** card to My car kit fed by `getMaintenanceSchedule`, with **Report a problem** creating a request. |
| **MER-17** | Pre-shift DVIR uses **whatever template happens to be first**, ignores the car's class, and after a safety Fail the driver is told "do not drive until cleared" but never shown that the car is now flagged — nor does the next screen tell them. | `Dk7PreShiftDvir.tsx:28-45` (`templates.items?.[0]`) | Ask for the template that matches the car's class, and after submit show the car's real do-not-drive state with the reason. |
| **MER-18** | A part that has been retired from a car hides its reason. The drawer only prints "No longer scheduled by Roam", so the real reason (for example "Job doesn't fit this car's powertrain") is lost to the person looking at the car. | `MaintenanceDueItemsDrawer.tsx:138`; `retired_reason` on the row | Print `retired_reason` on the retired line, in the same words the engine used. |
| **MER-19** | The maintenance health card shows a meaningless number: "Cars in use with no specific schedule" subtracts a count of **rules** from a count of **catalogue cars** (2,679 − 0 = 2,679) while only 3 real cars exist. | `maintenance_master_routes.ts:683`; shown in `CatalogQualityPage.tsx:245` | Count real fleet cars whose winning rule is the "everyone" rule, and label it that way. |
| **MER-20** | Duplicate part names split one job across two records: "Cabin A/C Filter" (has a schedule) vs "Cabin Air Filter" (has a history, no schedule); "Brake Fluid" schedule vs "Brake fluid (top-up)" part. A service can be logged against the twin that has no schedule, so it never clears the due item. | `maintenance_service_categories` live rows; 5179KZ schedule rows | Pick one part type per real job and merge the twins (keep the one with the schedule, move history to it, retire the other). |
| **MER-21** | The before-saving box says "Every app picks up the new schedule tonight". In fact any change to an active rule recomputes every affected car immediately, and the nightly run only re-checks. The screens disagree about when a change lands. | `MaintenanceMasterImpactDialog.tsx:60`; `maintenance_master_routes.ts:1231-1235` | Say "Cars update now. The nightly run re-checks tonight." |
| **MER-22** | A **service package can be edited but never created**. There are 5 packages and the only button is "Edit jobs"; they were seeded. | `PackagesTab.tsx:107-111`; `MaintenanceMasterPage.tsx:395-406` | Add **New package**, creating a package row with no part attached, then reuse the same drawer. |
| **MER-23** | The whole Log service wizard is one 3,117-line file, and step 3 alone is split across seven sub-dialogs. Every future change to logging lands in that file. | `LogMaintenanceServiceDialog.tsx` (3,117 lines) | Split it into the four steps it already renders plus a save module, with no change to behaviour, before any other Fleet work. |
| **MER-24** | The "How this works" button on Part schedules does nothing at all — it has no click handler. It is the only help in the section, and it is inert. | `PartSchedulesTab.tsx:101-103` | Remove the button and put the three sentences it should have opened directly under the banner, as plain text. |
| **MER-25** | **Harder driving is off on every car and nothing records a decision either way.** All 3 cars are `severe_duty = false`; the only control is inside a per-car drawer; the add-car flow never asks; the dialog sends the literal reason `"fleet maintenance"`; the server stores the flag and throws the reason away; and the dialog title renders `Hard use Â· <plate>` with a broken character. So the one lever that makes a ride-hail car's intervals realistic is off by default and leaves no trace when someone changes it. | `MmHardUseDialog.tsx:35`; `maintenance_master_routes.ts:1114-1145` (no audit write); `AddVehicleFlow.tsx` (no field); `fleet.vehicles.severe_duty` | Every car is harder driving by default when added; switching it off opens a reason box (10 characters minimum) and writes a `fleet.maintenance_audit_log` row with who, when and why. |
| **MER-26** | **A car can be added with no odometer at all, and then nothing can ever be due.** `AddVehicleFlow` never asks. The pipeline itself works: 5179KZ has 577 fuel readings and 33 weekly check-in readings. The other two cars have **0 fuel entries, 0 check-ins and 0 readings** — they are on the books with no activity, so their 50 schedule rows can never date anything. | `AddVehicleFlow.tsx` (no odometer field); live: `fleet.fuel_entries` has no rows for 1505LM or 5404LK; `fleet.odometer_readings` likewise | Make **current odometer a required field** when a car is added, saved as its first reading (source `manual`), so every car starts with one dated reading from day one. |

**The three that matter most:** MER-11 (parts with no known history are reported as overdue by 69,000 km — the one car with data looks catastrophic, and the genuinely overdue brake fluid is buried in it), MER-01 + MER-06 + MER-07 together (there is no way to say "this family, this market, this manual, page 214" — and that is the whole direction you want judged), and MER-16 (the driver is not in the system at all).

---

## D. Build order, layer by layer, with the test that proves each step

Nothing below is committed to this document as work done — it is the order I would build in.

| # | Layer | Step | The test that proves it is done |
|---|---|---|---|
| 1 | Database **— built locally 27 Nov 2026** | `due_kind` gains `part_schedule` + `inspection` (MER-03); set `manual_only` on the 49 as-needed types; label the other 102 "No schedule yet" (MER-04) | A query by `due_kind` returns 16 part schedules and 5 packages; 49 part types read **As needed** and create no car row; 102 read **No schedule yet**; nothing is counted as Overdue or OK for a `manual_only` rule |
| 2 | Database **— built locally 27 Nov 2026** | `maintenance_manual` (market, file, hash, pages, page range, checker), `evidence_page` and inherited `market` on rules, and the market rank JM 1 · nearest 2 · JP 3 · other 4 (MER-06, MER-07) | One family holds two manuals (JM and JP); with both loaded the JM rules win for every part; a car-maker rule cannot save without a manual and a page; nothing on `vehicle_platform` or `vehicle_catalog` gains a market |
| 3 | Server | PDF reader: page range, scanned pages rendered as images, background job with progress (MER-08) | A 300-page manual with only pages 210–232 selected finishes in the background, progress reaches 100%, no 504; a scanned page still yields its table rows; a PNG is still refused with the right card |
| 4 | Dominion | "Which cars" sends a real id and only legal scopes; family rung resolves through the parent (MER-01, MER-02) | Create a **Model family** rule for M900-2WD-FAMILY; preview a Roomy (M900A) and it wins; preview a Honda Fit (GP5) and it does not |
| 5 | Dominion | Severe optional-with-tick on the drawer and the ladder (MER-05) | A rule with no severe figure saves with the tick, shows "no severe figure in the manual", and a hard-use car gets the normal numbers |
| 6 | Dominion | New **Manuals** tab: family list with "manual loaded / no manual yet", upload with page range, parsed rows side by side, Approve / Approve all (B4) | Upload the Roomy manual; rows appear as Drafts with page numbers; approve one; that part's rule is live and Fleet shows **Car maker · page N** |
| 7 | Database + Fleet | **History unknown** status, and the **Fill in history** screen for new and existing cars (MER-11, MER-12) | 5179KZ's untouched parts read **History unknown** and are counted separately; filling brake fluid at 198,000 km on 1 Nov gives a normal due of 203,000 km / 1 Feb; 1505LM and 5404LK can be filled the same way |
| 8 | Database + Fleet | Odometer required when a car is added; "Odometer needed" nightly alert (MER-13, MER-26) | A car cannot be added without a reading, and it appears with source `manual`; a car with no reading appears once in the bell and the alert closes when a reading arrives |
| 9 | Fleet | Split the Log service wizard into four steps + a save module, no behaviour change (MER-23) | The wizard behaves identically on all four steps and in add-to-inspection mode; its existing tests pass unchanged |
| 10 | Fleet | Due line: **Log this**, source + page, counting-from, retired reason; as-needed parts never appear (MER-18, MER-04 display) | Tap Log this on Brake fluid → wizard opens on Brake fluid; a retired part shows the engine's reason; no as-needed part appears in any due list |
| 11 | Fleet | Work orders tab + request opens its work order (MER-15) | An open work order appears in the tab; Approve on a request with a linked work order works; one without shows a clear reason, not "No linked work order" |
| 12 | Fleet | Fix Clear do not drive; hard use default-on at add, off only with a real reason, recorded (MER-09, MER-25) | A cleared car lets the driver go online; a newly added car reads "Hard use" immediately; switching it off writes an audit row with the person, time and reason |
| 13 | Driver | Service due card, do-not-drive banner, DVIR class template + flagged state, DVIR reading under its own source (MER-16, MER-17) | On a car with 2 due items the driver sees both; a safety Fail shows the banner with the reason; the DVIR reading appears in the odometer history labelled as a pre-shift check, not a service |
| 14 | Database | Retire leftover writes (`fleet.maintenance_logs`, new `maintenance_records`), drop the dead rows, merge duplicate part types (MER-14, MER-20) | After a week of real logging: no new rows in either legacy table, the money still ties in Business Finance, a merged part shows one line |
| 15 | Dominion + Fleet | Health card, confirm-box copy, New package, inert button (MER-19, MER-21, MER-22, MER-24) | The health card reads a real car count; the confirm box says "Cars update now"; a new package can be created and shows on Fleet; no button on the page does nothing |
| 6b | Dominion + server | **Documents in, values out** (DOC-01 … DOC-12 below): auto-fill on upload, two document types, several page ranges, printed page numbers, year-bound rules, and new homes for owner's-manual specs | See "Done when" under the step |

---

## Build step 6b — Documents in, values out (plan, 27 Nov 2026)

**Goal, in one sentence:** the owner drops in any car document (maintenance booklet, maintenance sheet or owner's manual), checks what Roam found, and every value lands in the right Dominion place, so Fleet, Plug and Driver pull the car maker's numbers.

**What we learned from the Roomy (why this step exists):**
- A Japanese owner's manual has almost no service intervals; the schedule lives in the maintenance sheet or booklet. The owner's manual's value is its **specs**: fluids and capacities, tyres and pressures, battery, bulbs (see `docs/manual-data-value-review.md` A1–A4 and G1–G3).
- Typing the car, country, name and pages by hand caused a real mistake (years left on "2020–" instead of "2016–2020").
- The useful pages of an owner's manual are in several places (PDF 3, 406–411, 416–417, 524–530), not one range.
- Printed page = PDF page − 4 in this book, so citations must show the printed number.
- The sheet is dated **June 2021**; its numbers were approved for every Roomy 2016–2020 as "confirmed". A dated document must say which years it covers (MDV-13).
- Most documents have a real text layer once pdf.js is given its Japanese cMaps, so finding the right pages is free and local; AI is only needed to read the chosen pages.

**Dominion only.** Everything here is master data. Which car is normal or hard use stays a Fleet setting per car.

### Findings and the one fix for each

| ID | What's wrong | One fix |
|---|---|---|
| **DOC-01** | The owner types car, country, name and pages by hand. | **Choose the PDF first.** The browser reads the text layer of the first 15 pages and the contents page (free, pdf.js with cMaps). One small DeepSeek call on that text returns: make, model, the printed date, market, document type, title, the page offset (printed vs PDF), and the suggested pages. Roam matches make and model to the catalogue and picks the years from the printed date. The form is filled in; the owner checks it and presses Upload. A scanned document with no text layer sends the first 6 page pictures instead. |
| **DOC-02** | Roam can't tell a schedule document from an owner's manual. | New column `maintenance_manual.doc_type`: `schedule` (maintenance booklet, maintenance sheet, export manual's schedule chapter) or `owners_manual`. A `schedule` document is read for intervals only; an `owners_manual` is read for specs and for any intervals it prints. Auto-fill sets it; the owner can change it. |
| **DOC-03** | One page range per manual. | Replace `page_from/page_to` use with a page list: new column `maintenance_manual.pages int[]` (kept in step with `page_from/page_to` for old rows). Auto-fill suggests the list (e.g. 3, 406–411, 416–417, 524–530); the upload form shows it as editable chips with page pictures. |
| **DOC-04** | Citations show the PDF page, not the printed one. | New column `maintenance_manual.page_offset int default 0` (printed = PDF − offset). Every "page N" a person sees is the printed page. Stored rows keep the PDF page in `evidence_page`; screens add the offset. |
| **DOC-05** | A dated sheet is applied to every year of the model. | New columns `maintenance_manual.year_from`, `year_to` (from the printed date and the catalogue years the owner confirms). Every rule made from a manual copies them into the existing `year_from/year_to` on `maintenance_task_templates`, so a 2021 sheet covers the 2020-on cars only. **The Roomy rules approved on 27 Nov** get `year_from = 2020` and a draft copy for 2016–2020 marked "likely — read from the 2021 sheet", until a 2016–2020 document is loaded. |
| **DOC-06** | The reader only knows intervals. | A second reading mode for `owners_manual` pages: the same page job and DeepSeek reader, a specs prompt, and strict JSON rows for fluids (grade, capacity with/without filter), tyres (size, load/speed index, wheel, pressure front/rear, spare, optional), battery, bulbs (position, bulb, watts, LED), fuel (grade, tank size by drive). The same text-layer-first rule as the interval reader. |
| **DOC-07** | Tyres have no home (G1). | New table `vehicle_tyre` as G1 describes, **per catalogue version** (`vehicle_catalog_id`), with `manual_id` + `evidence_page`, RLS on and server-only like `maintenance_manual`. |
| **DOC-08** | Bulbs have no home (G2). | New table `vehicle_bulb` as G2 describes, per catalogue version, with `manual_id` + `evidence_page`, same security. |
| **DOC-09** | CVT, transfer, differential and washer capacities have no key (G3). | Add the six `spec_key` rows from G3. Values go into the existing `catalog_spec_value` with `trust_route = 'maker_document'`, the manual and the page. Oil and coolant capacity go into the existing columns (MDV-02, MDV-03). |
| **DOC-10** | Specs differ by version (2WD 36 L / 4WD 38 L, turbo coolant 5.0 L), but a manual is read once per model. | Spec drafts carry an "applies to" note from the page (2WD, 4WD, turbo, with electric parking brake). The check screen shows the model's catalogue versions as tick boxes under each spec row, pre-ticked from the note; approving writes the value to the ticked versions only. |
| **DOC-11** | Parts Roam has no type for are stuck (differential oil, transfer oil, air cleaner element). | Add **Differential oil**, **Transfer oil** and **Air cleaner element** part types (MDV-12), so those rows can be matched and approved. |
| **DOC-12** | Approving a manual's specs would overwrite catalogue values silently. | The check screen shows "Now: 3.2 L → Manual: 2.9 L" for every spec that already has a value. Approving replaces it and writes a history line (who, when, old, new, manual + page). Nothing is overwritten without being shown. |

**Not in this step:** inspection checklists and pass limits (G4, G5, MDV-15) go with the DVIR work in build step 13.

### Screens (new Stitch designs needed, Dominion file)
1. **Upload, step 1:** choose the PDF (drop zone only).
2. **Upload, step 2 — "Roam found this":** car (Make → Model → Years → Version, filled in), country, document type, name, printed date, and the page chips with pictures; one line per field that Roam was unsure of.
3. **Model page:** two document cards side by side, "Service schedule" and "Owner's manual", each with its state; under them, "Specs from the manual" (fluids, tyres, battery, bulbs) with their source page.
4. **Check screen, specs section:** spec rows grouped Fluids / Tyres / Battery / Bulbs, each with "Now → Manual", the version tick boxes, Approve / Edit.
5. **Catalogue car page (Vehicles):** a read-only Tyres and Bulbs card for one version, with "Owner's manual · page 525".

### Done when (tests first)
- Uploading `maintenancelist_2106_roomy_passenger.pdf` fills in: Toyota, Roomy, years 2020–, Japan, schedule, page 5, with nobody typing.
- Uploading `roomy-2021.pdf` fills in: Toyota, Roomy, Japan, owner's manual, offset 4, pages 3 + 406–411 + 416–417 + 524–530 (PDF), and reads 16 pages, not 568.
- After approving the owner's manual: the Roomy versions read oil 2.9 L / 3.1 L with filter, coolant 4.4 L (5.0 L turbo), tank 36 L 2WD / 38 L 4WD, 3 tyre rows, 8 bulb rows, battery M-42 (N-55 with EPB), each citing its printed page; every changed value has a history line.
- The 27 Nov Roomy rules are bound to 2020-on, with a "likely" 2016–2020 draft; Fleet's 5179KZ (2019) still gets numbers.
- Every page a person sees is the printed page number.
- Existing tests: all maintenance_manual, maintenance_master and step-1/3 SQL checks still pass.

### Round 2 — the owner's Stitch screens checked (27 Nov 2026)

All 7 screens came back ([docs/stitch/maintenance-docs-in-dominion/](stitch/maintenance-docs-in-dominion/)); screens 5 and 6 came in two versions. **Build from `screen_5_check_the_specs_2` and `screen_6_catalogue_car_page_tyres_battery_and_bulbs_2`** (the `_1` versions carry a wrong CVT figure and an upload overlay left on top). **The plan closes with this list; no screen needs redrawing.** Build from each screen's layout and look, the prompt file's wording, and these drops:

**Every screen:**
- **Keep** the layouts, the "Check this" amber fields, the page chips with pictures, the "Now → Manual" lines, the version tick boxes and the sticky check footer.
- **Drop** the page pictures' contents: they are drawn, and screen 3's picture shows wrong values (CVT 5.7 L, coolant 3.8 L, 240 kPa, LED headlamp). The build shows the real page pictures.
- **Drop** every invented label or number: "OCR Confidence 99.4%", "Parsed by Roam engine v2.3", "OCR engine v3", "OCR verified reference database", "Reading high-resolution OCR vector text…", "Target matching OCR block at coordinates…", "Discrepancy detected against baseline DB catalog", "Diff Detected", "New Data", "Last synchronized today at 04:12 JST", "Toyota Japan Publications · Issue OM-ROOMY-21", "Values deactivated until confirmation", "Dual units conversion available", "Automatically translated", "Verified master", "Verified profile", "Switch variant", and the sidebar footer "Dominion v4.18 · Tokyo DB" (the real one reads "KGN-DC-01 · JMD READY").
- **Drop** codes on screen: "M900A / M910A", "M900A series", "1KR-FE", "Naturally aspirated · 1KR-FE".
- **Drop** invented standards and claims: "JIS D 4230 COMPLIANT", "JIS D 5301 LEAD-ACID", "ECE R37 CONVENTIONAL", "12V EFB / ISS", "Smart Stop system requires high charge acceptance cell", "Unleaded 91+ RON". Neither document says the battery is EFB.
- **Drop** invented background pages: screen 3's "Maintenance Reference Library" (Yaris Cross, Nissan Note, Honda Freed) and screen 7's "Processed Guides 1,408 · Indexed Fleet Makes 42 · Parser Confidence 96.8% · Indexed Tokyo Pipeline". Dominion shows no counts like that; the background is the real Manuals tab.

**Per screen:**
| Screen | Keep | Change |
|---|---|---|
| 1 Choose the file | Drop zone, three example cards | The background is the real Manuals tab, not an invented spec card |
| 2 Sheet found | All of it | — |
| 3 Manual found | Fields, page chips, the "no full schedule" panel | Real page pictures |
| 4 Model page | Two document cards, the specs card in four sections with page buttons | File name is the real `roomy-2021.pdf · 8.8 MB`; the spare tyre cites page 525 |
| 5 Check the specs (`_2`) | Page left, spec cards right, versions, footer | Card subtitles stay plain ("Standard and filter replacement volume" is fine; nothing about OCR) |
| 6 Car page (`_2`) | Tyres, Battery, Bulbs cards with "Owner's manual · page N" | Battery card reads only "M-42" and "N-55 on cars with the electric parking brake" |
| 7 Scanned | All of it | Background is the real Manuals tab |

### Build order
1. Database: DOC-02, 03, 04, 05, 07, 08, 09, 11 in one migration set (paste file + logbook lines).
2. Server: auto-fill route (DOC-01), specs reader (DOC-06), spec approve with versions + history (DOC-10, DOC-12), year binding (DOC-05), printed pages (DOC-04).
3. Stitch screens 1–5 → owner makes them → Round 2 check.
4. Dominion screens from the Stitch designs.
5. Load the Roomy's owner's manual for real and check every value against `docs/manual-data-value-review.md`.

---

## Build step 16 — Hard use decided by the numbers (plan, 28 Nov 2026)

**The owner's direction (28 Nov):** a fleet should never have to turn hard use on. Roam already has each car's numbers, so the system decides from them. Dominion owns the rule and every app follows it.

### What the car makers say

The manuals give the "severe" (hard use) schedule for these conditions. Toyota's list is typical:
- taxi, police or delivery use;
- repeated short trips (under 8 km);
- a lot of stop-and-go driving or long idling;
- dusty or rough roads;
- towing or heavy loads.

A Kingston ride-hail car meets the first three on most days.

### What was checked on live (28 Nov)

| Check | Result |
|---|---|
| Who decides hard use today | Nobody, automatically. `fleet.vehicles.severe_duty` is a switch, and it is **off on all 3 cars**. Step 12 made it a button with a reason. |
| Rules that have a hard-use number | **2 of 71** active part rules: Engine oil and Oil filter (15,000 → 7,500 km). 6 more are marked "same as normal". So turning hard use on today only changes those 2 parts. |
| Trip distance and time | `fleet.trips.distance` / `duration` are **empty on every trip**. The real numbers are in `fleet.trip_facts` (`distance_km` / `duration_min` on 4,036 / 4,057 of 4,132 trips). |
| 5179KZ, last 30 days | 227 trips on 24 days (9.5 a day), all ride-hail (Uber, InDrive, Roam). Average trip 13.0 km; 26% under 8 km. Average speed on trips 17.8 km/h. 6,225 km on the odometer (about 207 km a day). About 10.2 km per litre (608 L). |
| 1505LM, 5404LK, last 30 days | No trips, no fuel, no odometer readings. |

### The rule

The decision runs every night for every car, on its last 30 days. Every limit below is a Dominion setting with this starting value.

| Sign | Counts when | Comes from |
|---|---|---|
| **Paid work** | The car did ride-hail, taxi, courier or delivery trips in the 30 days. If it had no trips, the fleet's service line is used instead. | `fleet.trip_facts.service_line`, the fleet's service lines |
| **Short trips** | 30% or more of trips are under 8 km | `trip_facts.distance_km` |
| **Slow traffic** | Average trip speed under 25 km/h | `trip_facts` distance ÷ time |
| **Hard on fuel** | km per litre at least 15% worse than the catalogue's rated figure for that car. Skipped when Dominion has no rated figure. | `fleet.fuel_entries` (litres + odometer), the catalogue |

- **Hard use turns on** when **Paid work** counts, or any 2 of the other three count. It turns on that night, and the car's due dates are worked out again at once.
- **Hard use turns off** only after 28 days in a row with no sign counting, so it does not flip back and forth.
- **No numbers at all** (no trips, fuel or readings in 30 days): the car keeps its last decision. A new car starts on hard use, as in step 8.
- **The fleet can keep a car on normal use.** It gives a reason (at least 10 characters), which is saved with name and date in `fleet.maintenance_audit_log`. That choice lasts 90 days, then the numbers decide again, so it is never forgotten.

**On today's numbers:**
- 5179KZ turns on: paid work, slow traffic (17.8 km/h), and fuel too if the Roomy has a rated figure.
- 1505LM and 5404LK turn on through paid work, from the fleet's ride-hail service line, because they have no trips in the 30 days.

### Where it runs

- **Database, not the apps** (the database adds up; the apps ask for the answer). A new function `public.mm_decide_hard_use(p_org uuid)`:
  - reads `trip_facts` and `fuel_entries` only for that company and the last 30 days, adding up inside the database;
  - writes the decision onto the car;
  - calls the existing recompute for every car that changed.
- **Nightly:** a new pg_cron job at 1:45 AM Jamaica time, before the 2:00 AM re-check. The existing cron jobs stay as they are.
- **New columns on `fleet.vehicles`, also added to the explicit-column public view (see the F-14 lesson):**
  - `severe_duty_source`: `auto` or `fleet_kept_normal`;
  - `severe_duty_why`: the plain sentence;
  - `severe_duty_signs`: the numbers behind it;
  - `severe_duty_checked_at`;
  - `severe_duty_kept_normal_until`.
- **New Dominion setting table `public.mm_hard_use_policy`:** one row holding the limits above. Only the platform owner can change it, and every change is logged.

### What each app shows

- **Fleet, due items drawer:** the "Turn on hard use" button goes. In its place is one line, for example "Hard use: on (automatic). Taxi work · 17.8 km/h average · checked 28 Nov." Next to it is a **Keep normal use** button, which opens the reason box from step 12.
- **Fleet, add a car:** the Hard use / Normal use choice goes. The numbers decide, and a new car starts on hard use.
- **Dominion:** a **Hard use rule** card in Maintenance settings with the limits, and two new rows on the health card: "Cars on hard use (automatic)" and "Cars kept on normal use by the fleet".
- **Driver:** nothing changes on screen. The service list just uses the right numbers.

### Hard-use numbers in the rules

Turning hard use on means little while 63 of the 71 rules have no hard-use figure. So the build starts by filling them in from the manuals the system already reads (step 6b reads normal **and** severe km/months per page). Any part whose manual prints no severe figure gets the existing "same as normal" tick.

### Build order

| # | Layer | What | Done when |
|---|---|---|---|
| 16a | Dominion data | Fill hard-use figures from the manuals already read (Roomy first), "same as normal" where the manual has none | Every active car-maker rule has a severe figure or the tick |
| 16b | Database | `mm_hard_use_policy`, the new car columns + public view, `mm_decide_hard_use`, the 1:45 AM cron job | A rolled-back run on live puts all 3 cars on hard use with the reasons above |
| 16c | Server | `GET /vehicles/:id/maintenance/hard-use` returns the decision and the signs. The PATCH becomes "keep normal use" only (reason + 90 days). | Deno tests: turns on, turns off after 28 days, kept-normal expires |
| 16d | Fleet | Drawer line + **Keep normal use**; add-car choice removed | Vitest; 5179KZ drawer shows the automatic line |
| 16e | Dominion | Hard use rule card + 2 health rows | The card saves a limit and the log shows who changed it |
| 16f | Live | First nightly run | All 3 cars on hard use; 5179KZ engine oil due at 7,500 km after its last change |


## Build step 16 — second opinion (DSH)

**Asked 28 Nov 2026:** the four-sign rule is too complicated and too built around ride-hail. Would a baseline of average use (about 10,000 km a year) be a better standard? This is a review only: no code, database or cron change was made. The job stays paused.

**Verdict: replace the detector, keep the plumbing.** The flag on the car, its six columns, the nightly database function, the audit log, the recompute call, the car maker's severe columns, the resolver and the "km or months, whichever comes first" engine are all right. What is wrong is *what the detector reads*: it reads rideshare signals, it treats a label as a number, and on live it changes two parts on one car. One baseline number should decide.

### What was checked on live (28 Nov, read-only)

| Check | Result |
|---|---|
| Cars | 3, all Active, all with service line `rideshare` |
| Odometer readings | 633 rows, **all on 5179KZ** (517 in the last year). 1505LM and 5404LK have none at all |
| Fuel entries | 613 rows, all on 5179KZ |
| Completed trips | 3,459 completed of 4,132 trip rows. 5179KZ: 227 in 30 days, last 25 Nov. 1505LM: 3, all in Jul–Aug (58.6 km). 5404LK: none |
| 5179KZ distance | 6,225 km across 28 days (30-day window); 19,262 km across 88 days (90-day window); current reading 200,932 on 26 Nov |
| 5179KZ trips vs odometer | 2,958 trip km in 30 days against 6,225 odometer km — the platform trips are **less than half** the real distance (deadhead, personal and unrecorded trips are missing) |
| 5179KZ trip speed / short trips | 17.8 km/h average; 59 of 227 trips (26%) under 8 km |
| 5179KZ fuel | 607.95 L in 30 days; 10.2 km/L against the catalogue's rated **18** |
| Active rules | 76: **2** with a severe km, **0** with a severe month, 27 marked same-as-normal, 47 with no severe answer |
| Policy / job | one `mm_hard_use_policy` row; `mm-hard-use-nightly` present but **`active = false`**; no run history; `severe_duty_checked_at` is null on all 3 cars — the first run never happened |
| 5179KZ engine oil | last done 156,649 km on 20 May 2026; rule 15,000 km / 12 months, severe 7,500. Normal next 171,649 (**29,283 km overdue**); severe next 164,149 (**36,783 km overdue**) |

### What the car makers actually say

Toyota, Honda, Nissan and Suzuki list the same conditions in different words: repeated short trips (Toyota and Honda use under 8 km; Honda adds freezing weather), stop-and-go and long idling, towing or heavy loads, dusty or rough roads, and — Toyota — taxi, police or delivery work. **None of them defines severe service by annual distance.** A 40,000 km-a-year car that spends its life at 90 km/h on the highway is the easy case; a 6,000 km-a-year car doing twenty 3 km school runs a day is the textbook severe case. The 10,000 km baseline ranks those two the wrong way round.

That is not a reason to drop the idea. It is a reason to be exact about what the number measures, and to keep the one maker condition a distance rate cannot see.

### The owner's idea, judged

**Agree with:**
- One number instead of four. A fleet manager can explain "twice the average" in one sentence; nobody can explain `mode() WITHIN GROUP (ORDER BY service_line)`.
- It works for any use — rental, delivery, government, private. The odometer is on every car and is already the number the schedule is denominated in.
- It removes the service-type labels. A car is not hard use because someone ticked "rideshare"; it is hard use because of what it did.
- It fits the existing engine: the flag only chooses normal or severe numbers; it does not invent a new interval.

**Disagree with, and correct:**
- **Distance is quantity, not harshness.** It is a good proxy for commercial duty (a Kingston ride-hail car does 8× the average), but it will flag a high-mileage highway car and miss a low-mileage stop-go car. Both makers' lists are about the second car.
- **The km interval already scales with distance.** `next_due_km = last + interval_km`, so a car doing 80,000 km a year already gets oil about every 68 days on a 15,000 km interval. Shortening it again for distance is double counting; the honest gain is that the maker's severe figure is the right figure for that duty, not that Roam computed a shorter one.
- **Never divide the normal interval by the baseline ratio.** If a car does 8× the average, the oil interval does not become 15,000 ÷ 8. The maker's printed severe figure is 7,500. The baseline classifies; the manual supplies the number.
- **The time side is where low-km harsh use bites**, and today no active rule has a severe month. For the school-run car the 12-month normal date is the one that fires. A pure distance rule cannot fix that; filling `severe_interval_months` where the manual prints it can, and the fleet override covers the rest.

### Against "km or months, whichever comes first"

The engine is already right: `next_due_km = last_performed_km (or baseline) + interval_km`; `next_due_date = last_performed_date (or baseline) + interval_months`; a part is overdue when either passes. That produces a clean split:

- **High-use car** (5179KZ): 15,000 km at 219 km a day is every 68 days; the 12-month date never fires. The **km** number is the one that must be right, so a normal/severe choice on km is the whole game.
- **Low-use car** (a 6,000 km-a-year private car): the 12-month date fires long before 15,000 km. The **month** number is the one that must be right. A distance baseline cannot pick it; the maker's severe month and the short-trip line can.

So the owner's baseline is the right standard for the km half and insufficient for the time half. The design below uses it for the km half and keeps one condition line for the other.

### The design I recommend

**The rule, in five sentences.**
1. Every night, for each car, Roam measures how far it actually drove: the last odometer reading in the window minus the first, divided by the days between them, over the last 90 days.
2. It compares that with the fleet's average-use baseline (one Dominion number, 10,000 km a year to start, which is 27 km a day, 192 a week, 833 a month) and turns hard use on when the car is doing at least **twice** the baseline — 20,000 km a year, 55 km a day.
3. It also turns hard use on when the car's own completed trips show **30% or more under 8 km**, with at least 20 trips in the window — the one maker condition a distance rate cannot see — and only for fleets that record trips.
4. It turns hard use off after 60 days in a row below both lines; a car that cannot be measured keeps its last answer.
5. The fleet can keep either answer for 90 days with a written reason; the shorter figure always comes from the car maker's own severe column, never from dividing the normal one.

**The baseline classifies; the manual supplies the number.**

### The numbers, and where they live

| Number | Starting value | Where it lives |
|---|---|---|
| Normal use | 10,000 km a year = 27 a day · 192 a week · 833 a month | `public.mm_hard_use_policy.baseline_km_per_year` (new column) |
| Hard use starts at | 2× normal = 20,000 km a year = 55 a day | `public.mm_hard_use_policy.high_use_multiple` (new, 2.0) |
| Measuring window | 90 days, with at least 30 days between the first and last reading | `window_days` (90), `min_span_days` (new, 30) |
| The car's rate | (last reading − first reading) ÷ days between | `fleet.odometer_readings.reading`, `reading_date`, `is_voided`, `is_anomaly` |
| Short-trip line | 30% of trips under 8 km, minimum 20 trips | `short_trip_km` (8), `short_trip_share` (0.30), `min_trips` (20); `fleet.trip_facts.distance_km` where `status_bucket = 'completed'` |
| Back to normal | after 60 clear days | `clear_days` (60) |
| Fleet override | 90 days, either direction | `kept_normal_days`, `kept_hard_days` (new) |
| What actually changes | the severe km/months where the rule has them | `public.maintenance_task_templates.severe_interval_km`, `severe_interval_months`, `severe_same_as_normal`, read by `public.schedule_rule_for_part` |
| The decision and the evidence | on/off, why, the numbers, when checked | `fleet.vehicles.severe_duty`, `severe_duty_source`, `_why`, `_signs`, `_checked_at`, `_clear_since`, plus the new `_kept_hard_until` |

The numbers are not new data: the odometer is already the source of `fleet.maintenance_due_v.avg_km_per_day`, and the baseline is the same idea applied at the car's whole-use level instead of a 30-day blip.

### What Fleet sees, and what it can change

On the car's due-items drawer, in place of the step-12 chip and "Turn on hard use":

> **Hard use: on** — 19,262 km in 90 days, 8.0× the normal 10,000 km a year. Engine oil and oil filter now come due every 7,500 km. Checked last night, 1:45 AM.

- **Change for this car** opens one dialog with two choices: **Use normal schedules** or **Use shorter schedules**, and a reason (10 characters minimum either way). The choice holds 90 days, then the numbers decide again. Every change is written to `fleet.maintenance_audit_log` with the person, date and reason.
- A car with a number but no override shows only the line; there is no on/off switch.
- The words "Hard use" stay (they are the owner's and the makers' words), but the sentence never claims a named maker condition. It says what was measured: distance against average.
- **Dominion** gets one card under Maintenance settings — "Normal use: 10,000 km a year", "Hard use starts at 2× normal", "Short trips: 30% under 8 km, minimum 20 trips", "Measured over 90 days; normal after 60 clear days", "Fleet override: 90 days" — and three health rows: **Cars on hard use (automatic)**, **Cars kept on normal by the fleet**, **Cars with not enough distance data**.
- **Driver** changes nothing on screen; the service list simply uses the right numbers.

### A car with no data

- **Fewer than two readings, or less than 30 days between them:** no decision that night. It keeps its last answer and the drawer says "Not enough distance data to decide. It keeps the last answer."
- **A car that has never had a decision:** normal use, shown as "Waiting for 30 days of readings". This changes 16b's default (`severe_duty` default `true`). It is safe: the first decision lands by day 30, and at 240 km a day a car has done 7,200 km — still short of a 15,000 km oil interval. For the Roam defaults that are same-as-normal it makes no difference at all.
- **The fleet can still set it** through the override, either way, for 90 days.
- On live this is the case that matters: 1505LM and 5404LK have no readings, no fuel and (bar three old trips) no trips. The built rule calls both hard use because of their service line; this design calls neither, changes neither's due dates, and says why.

### What this design does not fix

- **Towing, heavy loads, dust and rough roads.** No data anywhere in the system. Do not pretend to detect them; the fleet override is the honest answer.
- **Low-km short-trip cars in a fleet that records no trips.** They will read normal. The override covers it; if the owner wants it automatic, the answer is trip recording, not a more clever formula.
- **The 47 active rules with no severe answer.** The flag cannot shorten what the manual never printed. That is 16a data work, not code.
- **The missing odometers.** Two of three cars have no reading, so 25 parts each read History unknown and no km due date exists at all. A better hard-use classifier does not put an odometer on those cars. This is still the bigger problem, and step 8 (first reading at add) and step 13 (pre-shift reading) remain the fix.

### Result on the three cars

Computed from the live data with the design's arithmetic; nothing was run or written.

| Car | What the odometer says | Rate vs 10,000 a year | This design | What changes in the schedule |
|---|---|---|---|---|
| **5179KZ** Toyota Roomy 2019 | 19,262 km in 88 days (6,225 km in the last 28); reading 200,932 on 26 Nov | **219 km/day · 1,533/week · 6,660/month · 79,900/year = 8.0×** | **Hard use on** — distance alone, no other line needed | Engine oil and oil filter 15,000 → **7,500 km**. Engine oil: last 156,649 (20 May), next 171,649 → **164,149**, so **36,783 km overdue** instead of 29,283. Nothing else: the other maker rules are same-as-normal |
| **1505LM** Honda Fit 2018 | No odometer, no fuel; 3 trips in Jul–Aug (58.6 km), last 29 Aug | — | **No decision — stays normal** | **Nothing.** All 25 rows use Roam defaults marked same-as-normal; with no reading they read History unknown (the oil carries a 27 Nov placeholder from Roam's 5,000 km / 3-month default) |
| **5404LK** Toyota C-HR 2018 | No odometer, no fuel, no trips | — | **No decision — stays normal** | **Nothing.** 25 parts, all History unknown on Roam defaults; it needs a first odometer reading before any of this can be trusted |

**The built design on the same data:** all three on hard use — 5179KZ on paid work (and slow traffic, and fuel), the other two on the service line alone. On 1505LM and 5404LK it changes **no due date at all**, because their rules are same-as-normal. That contrast is the whole case for the change: the label moves, the schedule does not.

**The uncomfortable number:** 5179KZ has driven **44,283 km since its last logged oil change** (156,649 on 20 May → 200,932 on 26 Nov). It is overdue under the normal schedule already. Normal versus severe changes the size of the overdue figure, not the action. The car needs an oil change, not a better classifier.

### Exactly what would change

None of 16c, 16d or 16e is built yet (checked 28 Nov). The Fleet drawer's step-12 button is live; the Dominion card does not exist; the add-car choice is in the local code. So most of the screen list below is work not yet done, plus one live behaviour to replace. Nothing here was applied.

**Database — one new migration, not pasted now**

1. `public.mm_hard_use_policy`:
   - drop `paid_service_lines`, `slow_kmh`, `fuel_worse_share`, `signs_needed`, `min_fuel_litres`;
   - add `baseline_km_per_year` (10000), `high_use_multiple` (2.0), `min_span_days` (30), `kept_hard_days` (90);
   - set `window_days` 90, `clear_days` 60, `min_trips` 20; keep `short_trip_km`, `short_trip_share`, `kept_normal_days`;
   - the log trigger and server-only grants stay as they are.
2. `fleet.vehicles`:
   - keep the six columns; allow `severe_duty_source = 'fleet_kept_hard'` in `vehicles_severe_duty_source_check`;
   - add `severe_duty_kept_hard_until timestamptz`;
   - change `severe_duty` default back to `false`;
   - add the new column to the explicit-column `public.fleet_vehicles` view.
3. Replace `public.mm_decide_hard_use(text)`: one odometer aggregate and one trip aggregate per car, a 90-day window, no fuel entries, no catalogue rating, no `mode()`, no service lines; write the ratio and the raw numbers into `severe_duty_signs`; keep the same audit row, the same recompute call and the same "keep" handling, extended to both directions.
4. Drop `public.mm_hard_use_line_label(text)` — it only exists to name paid-work lines.
5. Cron: leave `mm-hard-use-nightly` paused on live until 16c–16e ship. Do not add another schedule. The committed 16b file still schedules it active, so the follow-up must not re-activate it on live; the owner turns it on with `cron.alter_job`.
6. Step 0 and 0b of 16b (the `needs_checking` fix and the resolver) stay — wanted either way.

**Server**

1. `supabase/functions/_fleet-server/maintenance_master_routes.ts`
   - PATCH `/vehicles/:vehicleId/maintenance/severe-duty` (line ~1225) becomes `{ mode: 'auto' | 'keep_normal' | 'keep_hard', reason }`; the reason is required (10+ characters) for **both** keeps; set `severe_duty`, `severe_duty_source`, the matching `_kept_*_until`; keep the recompute and the audit row.
   - New `GET /vehicles/:vehicleId/maintenance/hard-use` (16c) returns the decision, the source, the sentence, the numbers (`km_per_day`, baseline, multiple, short-trip share, window) and the checked time.
   - `hardUseChangeRefusal` becomes `hardUseOverrideRefusal` (both directions need a reason).
   - Health route (line ~795): add the three rows above; keep the existing ones.
   - New platform-owner `GET`/`PUT /maintenance/hard-use-policy` for the Dominion card, writing `updated_by`.
2. `supabase/functions/_fleet-server/maintenance_master_fleet_enrich.ts`: no change to how `severe_duty` picks the interval; carry the new fields so the drawer can show the sentence in one call.
3. Deno tests: no fuel sign, no service-line fallback, ratio on/off at the 2× line, short-trip line only with 20+ trips, no-data keeps the last answer, both overrides expire back to auto.

**Screens**

1. `apps/fleet/src/components/vehicles/maintenance-logging/MaintenanceDueItemsDrawer.tsx`: replace the `mm-hard-use-chip` / `mm-hard-use-turn-on` buttons (lines ~259–285) with the one status line plus **Change for this car**; keep a read-only badge for users without `vehicles.edit`.
2. `MmHardUseDialog.tsx`: rewrite for the override — two choices, reason always, the measured number shown, no "Turn on/Turn off" language.
3. `apps/fleet/src/components/vehicles/add-vehicle/AddVehicleFlow.tsx` and `OdometerUseStep.tsx`: remove the Hard use / Normal use choice and the `patchVehicleSevereDuty` call on add; the car starts on auto/normal.
4. `apps/fleet/src/services/api.ts`: change `patchVehicleSevereDuty` to the new body; add `fetchVehicleHardUse`.
5. Fleet tests: `MmHardUseDialog.test.tsx`, `AddVehicleFlow.test.tsx` (the two hard-use assertions), and the drawer test for the chip.
6. `apps/admin/src/components/admin/maintenance-master/maintenanceMasterApi.ts` and a new `HardUseRuleCard` on `MaintenanceMasterPage.tsx`; add the health rows to `MaintenanceMasterHealthCard.tsx`.
7. Driver: nothing.

### What stays

`fleet.vehicles.severe_duty` and its six columns; `fleet.maintenance_audit_log`; the nightly function's shape (database adds up, writes the car, recomputes); the audit + recompute on change; `mm_hard_use_policy` and its change log; the maker's `severe_*` columns and `severe_same_as_normal`; `schedule_rule_for_part`; the "km or months, whichever comes first" engine; the 90-day fleet override; the step-6b resolver fix.

**Owner confirmed (28 Nov):** both data gaps are real. 5179KZ has had no oil change logged since 20 May (156,649 km). 1505LM and 5404LK have never had an odometer reading.

### The one number for the owner to decide

The multiple. **2× (20,000 km a year)** is the start above: above average is not hard use, double is a different duty cycle. **1.5× (15,000 km a year)** would put more cars on the shorter schedule and cost more oil changes. Everything else (10,000 baseline, 90-day window, 60 clear days, 30% short trips) is a policy number that can move later without touching the code.

**Effect on the rest of this plan.** If the owner accepts this, 16f's expected result changes: only 5179KZ goes on hard use, and the 16c–16e rows are replaced by the server and screen list above. Where the F5 and F8 rows in section E still describe a manual on/off switch, this section supersedes them.


## E. Every screen and button in scope — keep / change / remove / new

| App | Screen | Element | Call |
|---|---|---|---|
| Dominion | D1 Page shell | Breadcrumb, title, subtitle | **Keep** |
| | | Tab bar with counts, analyst notice, governance-off message | **Keep** |
| | D2 Part schedules | Info banner + "How this works" | **Remove** — the button is inert (MER-24); its three sentences go under the banner as plain text |
| | | 3 summary cards | **Change** — "Where numbers come from" also counts **families with no manual yet**, and add "Parts with no schedule yet (102)" |
| | | Search, area grouping, mobile list | **Keep** |
| | | Source chips (All / Car maker / Part maker / Roam policy) | **Keep** |
| | | Status chips (All / Active / Needs checking / Draft / Retired) | **Keep** |
| | | "Who it covers" select (All / Everyone only / Has more specific) | **Change** — add "Model family" and "No manual yet" |
| | | Desktop table interval column | **Change** — reads "As needed" or "No schedule yet" instead of "—" (MER-04) |
| | | **Preview a car** | **Keep** (fix the year it uses — MER-10) |
| | | **Add schedule** | **Keep** (fix the three broken choices — MER-01) |
| | | 3 explainer cards, footnote | **Keep** |
| | D3 Part detail (ladder) | Back, part name, op code | **Keep** |
| | | 5 rungs + Edit / Retire / Add schedule for this part | **Change** — "Platform family" becomes "Model family" and resolves through the parent; add a "Manual page" line on each rung |
| | | "Used by", "Linked packages", "Last changed" | **Keep** |
| | D4 Schedule drawer | Which part select | **Keep** |
| | | Which cars chips | **Change** — 4 chips (Everyone / Engine family / Model family / One chassis) and a working picker for each |
| | | Car search, "Covers N cars" | **Keep** |
| | | Class chips, Year from/to | **Keep** |
| | | Every km / every months | **Keep** |
| | | Severe checkbox + severe km/months | **Change** — visible for car maker, plus the tick "the manual gives no severe number" (MER-05) |
| | | Source radios | **Keep** |
| | | **Load Roam policy starter set** | **Keep** — this is the fallback loader |
| | | Evidence link | **Change** — becomes "Manual" picker + page box |
| | | Confidence | **Keep** |
| | | Summary line | **Keep** |
| | | Cancel / Save as draft / Make active | **Keep** |
| | D5 Confirmation | Text and before → after | **Change** — copy says "Cars update now" (MER-21) |
| | | Save / Send for approval | **Keep** |
| | D6 Preview a car | Search, table, "Not on this car", **Export breakdown** | **Keep** |
| | | **Hard use** checkbox | **Keep** — and it starts working once severe numbers exist |
| | | — | **New** — a "Year" box so preview matches the car (MER-10) |
| | D7 Service packages | Info banner, cards, tiles, **Edit jobs**, "+ N more", check-only note | **Keep** |
| | | — | **New** — **New package** button (MER-22) |
| | D8 Package drawer | Name + duplicate guard, rhythm, part search, Required checkbox, Remove, Save | **Keep** |
| | D9 Jobs tab | Tree, Manage sections, Add job, Edit / Retire / Restore, may-need, fits, retire dialog | **Keep** |
| | D10 Supplies tab | List, Add supply, drawer, Retire | **Keep** |
| | D11 Review list | Toggle, conflict cards, Keep A / Keep B / Retire both, Approve / Reject, states | **Keep** |
| | D12 History | Filters, kind toggle, date range, **Export CSV**, before/after, states | **Keep** |
| | D13 Part types | Table, Retire dialog | **Keep** |
| | D14 Health card | 7 counts | **Change** — the "no specific schedule" count must be real cars (MER-19) |
| | — | — | **New — Manuals tab**: family list with manual status, upload with page range, progress, parsed rows, Approve / Approve all, manual + page view (B4) |
| | — | — | **New — Family coverage**: every family in use with "manual loaded" or "Roam policy — no manual yet" |
| Fleet | F1 Hub header | Title, **Refresh**, **Log service**, nightly banner | **Keep** |
| | F2 KPI cards | All 8 | **Change** — add "Parts with history unknown" so the new state is visible at the top |
| | F3 Tabs | Overview, Service history, Find parts, Not done yet, Requests, Schedule | **Change** — add **Work orders** (MER-15) |
| | F4 Overview table | Search, 5 source chips, 8 columns | **Keep** |
| | | **View due items**, **Log odometer**, **Log service**, ⋯, **Go to Vehicles** | **Keep** |
| | | **Clear do not drive** + reason dialog | **Change** — make it work (MER-09) |
| | F5 Due drawer | Car card, **Hard use** badge | **Change** — badge is on by default; tapping it opens a real reason box (MER-25) |
| | | "No first reading" banner + **Log odometer** | **Keep** |
| | | Found-by-inspection block | **Keep** |
| | | Overdue / Due soon / OK lists | **Change** — each line shows where the number came from and where the clock started; **New: Log this** per line; retired lines show the real reason |
| | | — | **New — History unknown section** with **Check at next service** and **Fill in history** (MER-11, MER-12) |
| | | **Why this schedule?**, **Set custom schedule** | **Keep** (extend "Why" with manual + page) |
| | | Footer **Log odometer**, **Log service** | **Keep** |
| | F6 Why popover | Fields | **Change** — add "Car maker · page N" and "counting from" |
| | F7 Custom schedule dialog | km/months + reason | **Keep** |
| | F8 Hard use dialog | Switch + **Save** | **Change** — real reason box (10 characters minimum), audit row written, broken `Â·` in the title fixed (MER-25) |
| | F9 Odometer history | **It's correct**, **Void** | **Change** — show a pre-shift check as its own source, not as "Service" |
| | F10 Log odometer | Date, reading, first-reading note | **Keep** |
| | F11 Which car | List, **Continue** | **Keep** |
| | F12 Log service wizard | 4 steps + all sub-dialogs, discount, invoice, quote mode | **Keep** — split the file (MER-23), change nothing else |
| | F13 Service history | Filters, stat cards, Not finished, table, expand, invoice, **View service**, **Delete**, pagination, discount row | **Keep** |
| | F14 Service / delete dialogs | Whole-service view, delete with reason | **Keep** |
| | F15 Requests | Cards, **Approve**, **Decline** + reason | **Change** — show and open the linked work order (MER-15) |
| | F16 Schedule tab | Car select, due table, checkboxes, **Create work order** | **Keep** |
| | F17 Bell menu | Open / Closed, part notices | **Keep** — and add Odometer-needed alerts (MER-13) |
| | F18 Find parts | Search, quotes, **Use in service** | **Keep** |
| | — | — | **New — Work orders tab**: open work orders with status, vendor, priority, off-road since, jobs, **Open service** (MER-15) |
| Driver | P1 My car kit | Back, **Pre-shift inspection**, plate, progress ring, weekly check-in, fixed reports, inventory rows + **Report**, extras, **Report something else**, support line | **Keep** |
| | | — | **New — Service due card** (next 3 items + **Report a problem**) and **Do-not-drive banner** with reason (MER-16) |
| | P2 Report sheet | Issue chips, photo, notes, **Send report** | **Keep** |
| | P3 Report sent | Confirmation | **Keep** |
| | P4 My reports / update | List, update sheet | **Keep** |
| | P5 Pre-shift DVIR | Odometer, Pass / Attention / Fail, photo on Fail, notes, **Submit DVIR** | **Change** — class-matched template, odometer pre-filled, real do-not-drive state after submit, reading saved under its own source (MER-17) |
| | — | — | **New — Driver notifications** in the app (table + route already exist) |
| | — | — | **New — Vehicle add: odometer and hard use** on the add-car flow (MER-25, MER-26) |

### What is removed, and what replaces it

Nothing that works is removed. These five go, each with its replacement already named:

| Removed | Why | What replaces it |
|---|---|---|
| The **"How this works"** button (D2) | Inert — no click handler (MER-24) | The same three sentences, printed under the banner |
| The **"Platform family"** chip in the schedule drawer and ladder rung (D3, D4) | Cannot save, and no rule can occupy it (MER-01, MER-02) | **"Model family"**, which is a platform rule pointed at the family row and resolves through the parent |
| The **`vehicle_maintenance_schedule`** table (1 row) | Superseded by `vehicle_component_schedule` | `vehicle_component_schedule` — already the only table the engine and screens read |
| The **`fleet.maintenance_logs`** table (1 row) and new writes to **`public.maintenance_records`** | Three tables carry a "service"; only work orders are read | `maintenance_work_orders` + `maintenance_work_order_lines` for the service, `maintenance_service_ledger` for the money trail, `maintenance_records` kept read-only for the finance hooks that still point at it |
| The **duplicate part types** ("Cabin Air Filter" beside "Cabin A/C Filter", and their like) | One job split across two records, so a service can miss the schedule (MER-20) | One part type per real job, with the history moved onto the one that carries the schedule |

**Screens that need a new Stitch design** (Stitch owns the look; do not design them here). Existing designs already cover Dominion D1–D13 (`docs/stitch/dominion-maintenance-master`) and Fleet F1–F16 (`docs/stitch/roam-fleet-app/maintenance-logging`). New designs needed, in this order:
1. **Dominion → Manuals** — family list with manual status, upload with a page range and progress, and the page-left / rows-right check screen. This is the heart of the rebuild and has no design yet.
2. **Dominion → Schedule drawer, revised "Which cars"** — a family picker by chassis code, normal and severe side by side, and the "no severe figure" tick.
3. **Fleet → Work orders** — the list and the per-work-order panel.
4. **Fleet → Due line and History unknown** — one line with source, counting-from and **Log this**; the History-unknown section and **Fill in history**.
5. **Driver → Service due card** on My car kit, plus the do-not-drive banner.
6. **Driver → DVIR** revised (class-matched, flagged-car state).
7. **Fleet → Add vehicle** — odometer and "hard use" on the add-car flow.

**Stitch prompts written (27 Nov 2026, one file per app):** [Dominion](stitch/maintenance-rebuild-dominion-prompt.txt) (11 screens), [Fleet](stitch/maintenance-rebuild-fleet-prompt.txt) (8 screens), [Driver](stitch/maintenance-rebuild-driver-prompt.txt) (9 screens). Two changes from the list above, on purpose: car pickers are Make → Model → Years → Version dropdowns, never chassis codes; Fleet never says "no manual yet", only "Roam policy". Two Appendix A calls move from "As needed" to "No schedule yet": Valve Clearance Adjustment and Wheel Alignment.

### Round 2 — the owner's Stitch screens checked against this plan (27 Nov 2026)

All 28 screens came back: [Dominion](stitch/maintenance-rebuild-dominion/) 11, [Fleet](stitch/maintenance-rebuild-fleet/) 8, [Driver](stitch/maintenance-rebuild-driver/) 9. **The plan closes with this list; no screen needs redrawing.** Build from each screen's layout and look, the wording in the prompt files, and the drops below. Stitch adds made-up labels to its screens; none of those are features.

**Every screen, every app:**
- **Keep** the layout, cards, colours, chip styles and spacing of every screen.
- **Drop** every made-up ID, version or system label: `OCR Pipeline V4.9`, `OCR Engine v4.8.2`, `Scan DPI 300 · PDF/A-2b`, `Doc DPI · Auto-OCR`, `Conf. 99.4%`, `SPEC-REF`, `SPEC-DATABASE ID#`, `DOC-ID`, `TMPL-…`, `UID: PRT-…`, `ID: FLD-…`, `WO-2026-…`, `Ref #RF-…`, `Ref #CK-…`, `Fleet ID #RM-442`, `Fleet #402`, `ID: DRV-…`, `SYNCED: CLUSTER A7`, `Registry Version 14.1`, `Global Roam v4.8`, `Sync Engine Real-time 99.8%`, `v2.4`, VINs, and engine or chassis codes (`1KR-FE`, `1KR-VET`, `NZE161`).
- **Drop** every made-up background number: fleet health %, compliance %, "42 vehicles", "Telematics heartbeat live", "Depot: Kingston Central (KGN-01)", "Depot North", and the invented cars and drivers (Marva Simpson, Andre Blake, Isuzu NPR, Nissan NV200, Toyota HiAce, Toyota Hilux). Background pages are the real ones.
- **Change** every button that is plain text or a soft fill with no border (Open, Log this, Fill in history, Upload a manual, Cancel, Save, Report a problem, Report, "Fleet Support 24/7" link). Each becomes a real button by the button rule: primary solid, secondary with a visible border, danger with a red border.

**Dominion:**
| Screen | Keep | Drop | Change / add |
|---|---|---|---|
| 1 Manuals tab | All of it | — | Row buttons get visible borders |
| 2 Upload a manual | Content (the HTML is complete; the picture is cut off by the export) | — | — |
| 3 Model page, reading | Progress card, page thumbnails, Japan card, "What every Roomy uses today" | The invented tab bar "Overview · Schedules · Manuals · Parts & Fluids · Telemetry" | Use the Maintenance templates tab bar |
| 4 Check the numbers | Split screen, page tabs, row cards, sticky footer | Pipeline / DPI labels, "Auto-verified via OEM schema", the grey sub-lines under part names ("Primary lubrication service schedule") | Panel title "Numbers found on page 414" (not "Parsed Specification Entities") |
| 5 Edit one row | Drawer layout, normal / harder-driving boxes, first-time box, page box | "ROW #6 EXTRACTION", IDs, "BASELINE CADENCE", "SEVERE OPERATIONS", "FACTORY PRE-FILL LIMIT", "standard OEM duty cycle policy", the "Turbo 1KR-VET" heading behind it | Help line reads "Due is whichever comes first."; Cancel and Save become real buttons |
| 6 Model page, approved | Banner, two manual rows, the "What every Roomy uses now" table with Page 414 buttons | "SYNCED", "Priority Resolution Pipeline", "LIVE RULE ENGINE", the "Baseline configuration locked… fleet contracts" footer, sub-lines like "0W-20 Synthetic" | — |
| 7 Part schedules | Info panel, three summary cards, filters, table, As needed / No schedule yet pills | The whole invented frame (Roam Dominion Core sidebar, Telemetry Stream, OEM Specifications, Compliance Audit), "Toyota Hilux VIII" in the attention card, the four footer cards | Real Dominion frame; attention card names Toyota Roomy; keep the real part codes already on the live screen (ENG-OIL), not the invented ones (LUB-ENG-001) |
| 8 Add schedule, one model | Four choice cards, Make/Model/Years/Version, side-by-side boxes, source, manual + page, sureness, summary line | Invented frame and background page, "CONFIGURATION WIZARD", "TAXONOMY-CATALOG", "Select applicability scope", "Specific Line", "OEM Primary / Tier-1 Spec / Internal Override", sub-line under the part, the broken icon on Everyone | Real frame; Everyone card gets a public icon |
| 9 Add schedule, no page | Red harder-driving box and message, no-manual dropdown + Upload a manual, disabled Make active with its reason | Invented frame, "CONFIGURATION WIZARD • SPEC DRAFT", "Taxonomy Tier-1", "CAT-…", "OEM Authoritative", "Tier-1 Catalog", "Fleet Fallback" | Real frame |
| 10 Reading failed | Amber panel, two thumbnails, the two buttons, "Check the 9 numbers found" | "SPEC-REF #HF15-GK3 Master Blueprint", DOC-ID, OCR engine line, the extra camera-glare sentence, "Registry Version 14.1" | — |
| 11 Empty | Centred card, three steps | "Import from OEM repository" (no such feature), "Policy fallback: Global Roam v4.8", "Policy rules" link, "Strict OCR extraction active • PDF v1.4…" | — |

**Fleet:**
| Screen | Keep | Drop | Change / add |
|---|---|---|---|
| 1 Due items drawer | Header card, violet history card, all five sections, the line layout | "Immediate action requested", "Scheduled next 14 days", "Odometer benchmark missing", "In healthy cadence", "Log this" on OK lines | Background is the real Overview |
| 2 Fill in history | Dialog and rows | The invented fleet table behind it | — |
| 3 Overview | To do card, chips with counts, car table | "Verified via depot", "Depot: Kingston Central", invented drivers on 1505LM / 5404LK (show the real assigned driver or nothing) | Tile labels are OVERDUE / DUE SOON / HISTORY UNKNOWN / WAITING FOR ODOMETER, not "Immediate attention / Awaiting baseline / Unsynced units"; tiles fully visible |
| 4 Work orders | Filter chips, open cards, done list | "2 vehicles off operational duty", "Scheduled morning intake slot", "November – March 2026", the NEW badge after launch | Tile labels AT THE GARAGE / WAITING TO GO IN / DONE THIS MONTH; a done tile counts work orders, not money |
| 5 Work order panel | Every card in the drawer | "Dispatch triage", "Est. 2.5 hrs", file size, the invented work-order table behind it | — |
| 6 Add a car | Step bar, odometer box, two use cards, history card | "Depot", VIN, "Baseline telemetry", "Triggers shorter 5,000 km fluid cycles", "High / Standard Cadence 30 / 90-day checks", "Auto-saving draft…" | Card lines are the prompt's words |
| 7 Turn off hard use | All of it | "in audit records" | — |
| 8 Why this schedule? | The popover | Everything else in that drawer that differs from screen 1 ("6.5mm front", "1KR-FE uses lifetime timing chain", "Recommended every…") | Drawer behind it = screen 1 |

**Driver:**
| Screen | Keep | Drop | Change / add |
|---|---|---|---|
| 1 My car kit, service due | Last-reading pill, Start button, Service coming up card, kit card | "Dedicated Fleet Unit", "1 Critical", "Friday, 2 Dec · Morning slot (08:30 AM)" (2 Dec 2026 is a Wednesday, and there is no slot data) | Booked line is "Whol-Hearted Car Service on 2 Dec" |
| 2 Don't drive | Banner, greyed Start, service card | "Fleet Van", "Grounding Notice", "Vehicle kit & insurance" row (no such feature) | — |
| 3 All good | Calm card | "Regular routine care", "Authorized Driver verified" card | — |
| 4 Report a problem | Sheet | Background "Fleet ID", "42,890 km", "Health State" | Background is the real My car kit |
| 5 Report sent | Tick, summary, the two buttons | "Ref #", "Depot Queue #4 · Bay 2 technicians", "Typical response within 2 hours", **"Vehicle cleared for light transit…"** (false and unsafe) | — |
| 6 Pre-shift, odometer | Odometer card, item cards | "~2 mins remaining", "Standard" tag | — |
| 7 Safety item failed | Failed card with photo, notes and warning | "Safety Stop Protocol" title, "mechanic dispatch has been alerted", "Ready to submit" pill | Warning reads exactly the prompt's sentence |
| 8 Check sent, car stopped | Red circle, car card, Call the fleet | "Ground Notice", "Ref #", "A replacement vehicle or depot taxi can be arranged…" (no such feature) | — |
| 9 Notifications | The four cards | "Fleet is running on schedule" banner, "Directions", "Telemetry", "View Log", "Official maintenance partner" card, the leftover "= 48px) -->" text | — |

---

## Your direction, judged

| Your call | My judgement |
|---|---|
| Car maker's manual is the main authority; Roam policy is only the fallback | **Agree, and the database is already built for it.** `source_type` has `maker_manual` and the evidence check already forces a link for it. What is missing is a way to store a manual and a page, not a change of principle. |
| Japanese-market manuals may give longer intervals than Jamaica needs; prefer Jamaica or the nearest matching market | **Agree, and Rev 2 puts it in the right place.** Market belongs to the manual, not to the car: writing "JM" on a car built for Japan would be false. With the order Jamaica → nearest market → Japan, a Jamaican manual always outranks the Japanese one for these cars, and the Japanese manual is still there when there is nothing better. |
| Store both normal and severe numbers | **Agree, with one honest exception** — a manual that prints no severe figure must not be blocked. Record the tick, copy normal into severe, and say so on screen. |
| Ride-hail in Kingston counts as severe by default | **Agree, and today it is the opposite** — all 3 cars are `false`, the switch is buried, and no decision is recorded. Make it on by default at add, off only with a written reason. |
| Chassis codes (e.g. M900A) pick the model family, not VINs; free US VIN lookups don't work | **Agree, and it is already how the data works.** 5179KZ → M900A → family M900; 1505LM → GP5; 5404LK → ZYX10. No VIN lookup exists and none should be built. |
| Out of scope: buying MOTOR/ALLDATA/DataOne data | **Agree.** You have 2,679 catalogue rows and 1,210 families; the gap is manual content, not data breadth. |
| Out of scope: engine hours | **Agree.** Nothing in the fleet reads engine hours and no vehicle has the hardware. |
| Out of scope: OBD/telematics devices | **Disagree, mildly — with the reason.** Not because you need live telematics, but because *mileage is the input the whole system runs on*, and today 2 of your 3 cars have **zero** readings — not because a pipeline is broken (fuel and check-in already work: 577 and 33 readings on the one car in use) but because nothing ever asked for a reading and those two cars have never been fuelled or checked in. The cheap fix comes before any device: **a required odometer when the car is added**, plus the driver reading the dash at every pre-shift (the DVIR already asks and writes it). A $15 OBD plug per car would remove the guesswork; it is not required, but do not call mileage "solved" until every car has a reading every week. |
| Mileage comes from fuel and service logs | **Mostly agree, and it already works this way.** Fuel gives a reading per fill (577 on the one active car), weekly check-in gives one a week (33), service gives one per visit (19). What is missing is the car that never fuels — which is why the reading must be captured when the car is added and at every pre-shift. |

**One more thing on your "I'm fine with tearing it all down".** You would lose four things that are hard to rebuild and that already work: the "who wins" resolver with four levels, the recompute engine that handles baseline, severe, custom overrides and odometer gaps, the due view with your thresholds and projected dates, and the alert open/update/supersede lifecycle. Replace those and you would be rebuilding the same logic without the live proof that it works on 3 cars and 87 schedule rows. Rebuild the Driver layer, add the manual layer, and fix the types — that is the enterprise answer at your scale.

---

## Appendix A — all 151 unscheduled part types and their call

**How the call was made.** Two questions, in order. (1) Is this a *job you do to the car* — cleaning, inspection, diagnosis, relearn, adjustment, machining, overhaul, a consumable you top up, or a labour/fee line? Then it is **As needed** (`frequency_kind = 'manual_only'`) — no manual anywhere gives it a km or month figure. (2) Otherwise it is a **part or fluid that wears**, and it is **No schedule yet** until a car maker manual or a Roam policy rule fills it in. "No schedule yet" is a holding state, not a claim that the part has an interval — that is why it is safe to put a hose clamp there. Where a manual later prints a figure for something called as-needed here, the manual wins and the part moves to the scheduled list.

Counts: **49 as needed · 102 no schedule yet · 151 total.**

**Note (build step 1, 27 Nov 2026):** two of the 49 moved to "No schedule yet" — `valve_clearance_adjustment` and `wheel_alignment` — so **47 As needed rules were built**, and those two are now two of the **104** part types that keep no rule (see §0).

### As needed — 49

| # | Part | Code |
|---|---|---|
| 1 | A/C Evaporator Cleaning | `ac_evaporator_cleaning` |
| 2 | A/C Recharge | `ac_recharge` |
| 3 | A/C Vent Disinfection | `ac_disinfection` |
| 4 | AdBlue / DEF Top-up | `adblue_topup` |
| 5 | Battery Terminal Cleaning | `battery_terminal_cleaning` |
| 6 | Carburetor Cleaning | `carburetor_cleaning` |
| 7 | Charging Port Inspection & Cleaning | `ev_charging_port_cleaning` |
| 8 | Connecting Rod Bearing Replacement | `rod_bearings` |
| 9 | Coolant *(top-up)* | `coolant_part` |
| 10 | Crankshaft Machining / Polishing | `crankshaft_machining` |
| 11 | Cylinder Head Machining / Resurfacing | `cylinder_head_machining` |
| 12 | Cylinder Honing / Boring | `cylinder_honing` |
| 13 | DPF Cleaning / Regeneration | `dpf_cleaning` |
| 14 | EGR Valve Cleaning | `egr_cleaning` |
| 15 | Engine Bay Degreasing | `engine_bay_degreasing` |
| 16 | Engine oil (top-up) | `engine_oil_part` |
| 17 | Engine Overhaul / Rebuild | `engine_overhaul` |
| 18 | Engine service labor | `engine_service_labor` |
| 19 | Exhaust Flange Gasket | `exhaust_flange_gasket` |
| 20 | Exhaust Manifold Gasket | `exhaust_manifold_gasket` |
| 21 | Exhaust System Inspection | `exhaust_inspection` |
| 22 | Fuel Injector Cleaning / Induction Service | `fuel_induction_service` |
| 23 | Head Gasket | `head_gasket` |
| 24 | HV Battery Cooling Fan & Duct Cleaning | `hv_battery_fan_cleaning` |
| 25 | HV Battery Health Check | `hv_battery_health_check` |
| 26 | HV Cable & Insulation Resistance Inspection | `hv_insulation_inspection` |
| 27 | Inspection / diagnostic fee | `inspection_diagnostic_fee` |
| 28 | Intake Manifold Gasket | `intake_manifold_gasket` |
| 29 | Intake Valve Carbon Cleaning (Walnut Blasting) | `walnut_blasting` |
| 30 | Intercooler Cleaning | `intercooler_cleaning` |
| 31 | Leak Inspection | `leak_inspection` |
| 32 | MAF / MAP Sensor Cleaning | `maf_map_sensor_cleaning` |
| 33 | Main Bearing Replacement | `main_bearings` |
| 34 | Oil Pan Gasket | `oil_pan_gasket` |
| 35 | Piston Replacement | `piston_replacement` |
| 36 | Piston Ring Replacement | `piston_rings` |
| 37 | Puncture Repair | `puncture_repair` |
| 38 | SCR / AdBlue System Service | `scr_service` |
| 39 | Throttle Body Cleaning | `throttle_body_cleaning` |
| 40 | Throttle Body Relearn | `throttle_body_relearn` |
| 41 | Turbo Decoking | `turbo_decoking` |
| 42 | Valve Clearance Adjustment | `valve_clearance_adjustment` |
| 43 | Valve Cover Gasket | `valve_cover_gasket` |
| 44 | Valve Grinding & Seating | `valve_grinding_seating` |
| 45 | Valve Stem Seal Replacement | `valve_stem_seals` |
| 46 | Washer fluid | `washer_fluid_part` |
| 47 | Wheel Alignment | `wheel_alignment` |
| 48 | Wheel Balancing | `wheel_balancing` |
| 49 | Wheel Straightening & Refurbishing | `wheel_straightening` |

### No schedule yet — 102

| # | Part | Code |
|---|---|---|
| 1 | ABS wheel sensor | `abs_wheel_sensor` |
| 2 | Adjuster lock for rear brake spring | `adjuster_lock_for_rear_brake_spring` |
| 3 | Air cleaner hose | `air_cleaner_hose` |
| 4 | Air cleaner housing | `air_cleaner_housing` |
| 5 | Air cleaner inlet | `air_cleaner_inlet` |
| 6 | Air conditioner amplifier | `air_conditioner_amplifier` |
| 7 | Alternator | `ELEC-ALT` |
| 8 | Aspirator pipe | `aspirator_pipe` |
| 9 | Ball joint | `ball_joint` |
| 10 | Battery | `ELEC-BATT` |
| 11 | Battery Coolant Pump | `ev_battery_coolant_pump` |
| 12 | Battery Thermal Management Coolant Service | `ev_battery_coolant_service` |
| 13 | Blower motor | `blower_motor` |
| 14 | Blower resistor | `blower_resistor` |
| 15 | Brake and tail bulb | `LGT-TAIL` |
| 16 | Brake backing rear plate | `brake_backing_rear_plate` |
| 17 | Brake caliper | `brake_caliper` |
| 18 | Brake drum | `brake_drum` |
| 19 | Brake hose | `brake_hose` |
| 20 | Brake rotor | `brake_rotor` |
| 21 | Brake shoes | `brake_shoes_drums` |
| 22 | Cabin Air Filter *(duplicate of the scheduled "Cabin A/C Filter" — MER-20)* | `cabin_air_filter` |
| 23 | Catalytic Converter | `catalytic_converter` |
| 24 | Charging Port | `ev_charging_port` |
| 25 | Clutch kit | `clutch_kit` |
| 26 | Coil spring | `coil_spring` |
| 27 | Cooler evaporator | `cooler_evaporator` |
| 28 | Cooler expansion valve | `cooler_expansion_valve` |
| 29 | Cooler thermistor | `cooler_thermistor` |
| 30 | Damper for airmix servo | `damper_for_airmix_servo` |
| 31 | DC-DC Converter | `ev_dc_dc_converter` |
| 32 | DPF Differential Pressure Sensor | `dpf_pressure_sensor` |
| 33 | DPF Replacement | `dpf_replacement` |
| 34 | Drain cooler hose | `drain_cooler_hose` |
| 35 | Drive belt tensioner | `drive_belt_tensioner` |
| 36 | Electric A/C Compressor | `electric_ac_compressor` |
| 37 | Engine mount | `engine_mount` |
| 38 | EVAP / Charcoal Canister | `evap_canister` |
| 39 | Exhaust Clamp | `exhaust_clamp` |
| 40 | Exhaust Gas Temperature (EGT) Sensor | `egt_sensor` |
| 41 | Exhaust Hanger / Rubber Isolator | `exhaust_hanger` |
| 42 | Exhaust Manifold / Header | `exhaust_manifold` |
| 43 | Exhaust Pipe / Tailpipe | `exhaust_pipe` |
| 44 | Flex Pipe | `flex_pipe` |
| 45 | Fog light bulb | `fog_light_bulb` |
| 46 | Front coil spring upper insulator | `front_coil_spring_upper_insulator` |
| 47 | Front spring bumper | `front_spring_bumper` |
| 48 | Front spring seat | `front_spring_seat` |
| 49 | Front Stabilizer Bar | `front_stabilizer_bar` |
| 50 | Front Stabilizer Link | `front_stabilizer_link` |
| 51 | Fuel filter | `fuel_filter` |
| 52 | Fuel Injector Replacement | `fuel_injector` |
| 53 | Glow Plugs | `glow_plugs` |
| 54 | Handbrake cable | `handbrake_cable` |
| 55 | Headlight assembly | `headlight_assembly` |
| 56 | Headlight bulb | `LGT-HEAD` |
| 57 | Heater hose | `heater_hose` |
| 58 | Heater radiator unit | `heater_radiator_unit` |
| 59 | Hose clamp | `hose_clamp` |
| 60 | HV Battery Cooling Fan Filter | `hv_battery_fan_filter` |
| 61 | HV Battery Module Replacement | `hv_battery_module` |
| 62 | HV Battery Pack Replacement | `hv_battery_pack` |
| 63 | HV Cable / Connector Replacement | `hv_cable` |
| 64 | Ignition coil | `ignition_coil` |
| 65 | Indicator bulb | `LGT-IND` |
| 66 | Inverter Coolant Pump | `inverter_coolant_pump` |
| 67 | Inverter Coolant Service | `inverter_coolant_service` |
| 68 | Mass air flow sensor | `mass_air_flow_sensor` |
| 69 | Master cylinder | `brake_master_cylinder` |
| 70 | Muffler | `muffler` |
| 71 | NOx Sensor | `nox_sensor` |
| 72 | Oil filter | `oil_filter` |
| 73 | On-Board Charger | `ev_onboard_charger` |
| 74 | Oxygen sensor | `oxygen_sensor` |
| 75 | Parking brake shoe strut set | `parking_brake_shoe_strut_set` |
| 76 | PCV Valve | `pcv_valve` |
| 77 | Purge Valve | `purge_valve` |
| 78 | Quick heater | `quick_heater` |
| 79 | Radiator hose | `radiator_hose` |
| 80 | Rear brake automatic adjust lever | `rear_brake_automatic_adjust_lever` |
| 81 | Rear Stabilizer Bar | `rear_stabilizer_bar` |
| 82 | Rear Stabilizer Link | `rear_stabilizer_link` |
| 83 | Rear wheel cylinder kit | `rear_wheel_cylinder_kit` |
| 84 | Reduction Gear Oil Change | `ev_reduction_gear_oil` |
| 85 | Resonator | `resonator` |
| 86 | Shock absorber | `shock_absorber` |
| 87 | Shoe return for rear brake spring | `shoe_return_for_rear_brake_spring` |
| 88 | Spark Plug Wires | `spark_plug_wires` |
| 89 | Spring for rear brake shoe hold down | `spring_for_rear_brake_shoe_hold_down` |
| 90 | Stabilizer bar bush | `stabilizer_bar_bush` |
| 91 | Starter motor | `ELEC-START` |
| 92 | Strut mount | `strut_mount` |
| 93 | Thermostat | `thermostat` |
| 94 | Tie rod end | `tie_rod_end` |
| 95 | Timing Belt | `timing_belt` |
| 96 | Timing Chain & Tensioner | `timing_chain` |
| 97 | Tire Valve Stem | `tire_valve_stem` |
| 98 | Traction Motor | `ev_traction_motor` |
| 99 | Ventilation pipe | `ventilation_pipe` |
| 100 | Water pump | `water_pump` |
| 101 | Wheel bearing | `wheel_bearing` |
| 102 | Wheel cylinder | `brake_wheel_cylinder` |

---

## What I did not touch
_This section describes the Rev 2 review pass. What build step 1 changed is listed in §0._

- No file other than this one was created or edited.
- No migration was written, and no `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `GRANT` or config change was run. Every statement against `csfllzzastacofsvcdsc` was a `SELECT`.
- Nothing was committed, pushed or deployed. No server was started.
- The older audits (`fleet-maintenance-enterprise-audit.md`, `fleet-maintenance-logging-audit.md`, `fleet-maintenance-finance-audit.md`, `maintenance-*.md`, `saved-page-parts-audit.md`) were read for history only and left unchanged.
