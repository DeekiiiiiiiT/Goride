# Fuel log — offline-first audit

**Goal (one sentence):** A driver logs a fill at the pump in under a minute by taking two photos, with or without signal, and the fill always reaches the fleet.

## 0. Status (25 Nov 2026)

- **Rev 3 (25 Nov): BUILD COMPLETE — not live, not committed.** End-to-end on the local copy 25/25. Go-live steps at the end of this section.
- Rev 2 (25 Nov): round 2 done, plan closed. Screens checked against the plan (section 9). Added FO-18 + S9: the driver can't delete anything waiting on the phone. Nothing is built yet; next is the Data layer.
- Rev 1: review round 1.
- Started from Kenny Rattray's report: "fuel log loads forever, even after 10 minutes, for months".
- Apps: **Roam Driver** (`apps/driver`) and the driver section of **Roam Fleet** (`apps/fleet/src/components/driver-portal`). Server: `supabase/functions/_fleet-server`.
- **Stitch prompts written (25 Nov):** [docs/stitch/fuel-log-offline-driver-prompt.txt](stitch/fuel-log-offline-driver-prompt.txt) (16 screens) and [docs/stitch/fuel-log-offline-fleet-prompt.txt](stitch/fuel-log-offline-fleet-prompt.txt) (7 screens). The Roam Fleet driver section reuses the Roam Driver screens (FO-16), so it isn't redrawn.
- Screens made by the owner (25 Nov): `Downloads/logging fuel/stitch_roam_driver_fuel_logging`, `Downloads/fleet log fuel/stitch_roam_fleet_fuel_review`.
- **Data layer built (25 Nov, not live, not committed):**
  - Migration `supabase/migrations/20261125133536_driver_phone_outbox.sql`: table `fleet.driver_phone_outbox` (D1), view `public.fleet_driver_phone_outbox` with explicit columns (D2), and report call `public.driver_phone_outbox_report(...)` used by S1. Server only (service_role); no access for signed-in users or the public.
  - Checks `supabase/tests/driver_phone_outbox_checks.sql`: 20 checks, added to the Parts SQL checks workflow.
  - Proved on a throwaway local Postgres (Supabase image): migration applies, 20/20 pass, a wrong grant makes the checks fail, service_role can write and read, a signed-in user is refused. Repo checks pass (`validate-migration-sql`, `assert-migrations-utf8`).
  - Production paste file: `docs/driver_phone_outbox_LIVE_apply.sql` (migration + logbook line). Nothing uses the table until the Server layer ships.
  - D3 (fill fields) lives in the existing fill `metadata` and D4 (per-fill photo key) is in `/upload`, so both are built with the Server layer (S3–S6). D5 done (real UTC time; `npx supabase migration new` fails here with a Windows EPERM).
- **Server layer, round 1 built (25 Nov, not live, not committed):**
  - New `_fleet-server/fuel_offline_fill.ts` (rules) + `fuel_offline_fill.test.ts` (10 tests, pass; run with `--no-config --node-modules-dir=none` so `node_modules/.deno` isn't touched).
  - **S3** in `POST /transactions` (`register_residual_monolith_routes.tsx`): a driver re-send with the same `metadata.captureId` returns the stored fill at any age. The old 15-minute rule stays for fills without a captureId.
  - **S5** same route: a fill with a captureId and no total is stored Pending with `photoReadStatus = waiting` (`decisionReason WAITING_PHOTO_READ`), before station matching, auto-approval and posting. Old-app fills (no captureId) are unchanged.
  - **S4** in `POST /upload`: form fields `captureId` (uuid) + `photoKind` (`odometer` / `pump` / `receipt`) give the fixed key `<captureId>-<kind>.<ext>` on R2 and Supabase storage. The file is overwritten and the evidence row registered once. Anything else keeps the random key.
  - **S1 / S2** new `_fleet-server/driver_phone_outbox_routes.ts`, mounted in `fuel_controller.tsx`: `POST /fuel/phone-outbox` (drivers only; their own row) and `GET /fuel/phone-outbox` (`fuel.view`; one row per driver, two phones added up, oldest first, driver name + car from `fleet_drivers` by id or user_id).
  - **S8** `fuelPhotoFirstEnabled: false` in `/platform-feature-flags` defaults.
  - Checks: `deno check` of the new files clean. The fleet-fuel / fleet-core bundles still have their older type errors (57 / 120-plus), none on changed lines. Route lists regenerated (fleet-fuel 146 routes; other manifests only changed their timestamp); route contract, manifest overlap, duplicate-name and anon-lock checks pass.
- **Server layer, round 2 built (25 Nov, not live, not committed) — Server layer done:**
  - **Decision:** fills the server finishes later (S6 read from photos, S10 numbers added by the driver) land in the Review Queue **ready to approve** (`photoReadStatus = read`, `needsLogReview`, reason "Numbers read from the photos — check and approve"). Approval there is the one step that posts a fill (`ensureFuelEntryForApprovedTx`). Fills that arrive complete still approve themselves as today.
  - **S6** reader: `fuel_photo_reader.ts` (job; readers passed in) + `fuel_photo_reader_routes.ts` (`POST /fuel/photo-read/run`, cron / service role only; in the login-gate skip list). Reads the pump photo with the existing Gemini fuel reader (total, litres) and the odometer photo with the shared odometer reader, only when the fill has no reading. Values on the fill are never overwritten. A photo that won't open is retried at 10 / 30 min, then becomes Needs a look.
  - **S6 queue** (migration `20261125135228_fuel_photo_read_queue.sql`): `fleet.fuel_photo_read_queue` + `fuel_photo_read_enqueue` / `_claim` (max 20, 15-minute hold, skip-locked) / `_finish`. The cron `fuel-photo-read` runs every 10 minutes and makes no call when nothing is due. A queue instead of scanning transactions keeps Disk IO flat. S5 now enqueues.
  - `fleet-fuel-cron` takes `{"job":"photo-read"}` and was **added to the edge deploy list** (`ALL_FNS`). It wasn't on it, so changes to it never deployed.
  - **S7:** `withFixAgeFromCapture` sets the GPS `ageS` = photo time − fix time for phone fills. The station match already used the phone's own fix values, never arrival time.
  - **S9:** `buildRefusedFillReview`. A phone fill refused for good is stored as one Needs a look row (`refused-fill-<captureId>`, original payload kept):
    - Gas Card (`fuel-entries`): duplicate anchor, unlinked half, plausibility.
    - Gas Card + Cash (`fuel/split-fill`): module off, 409s.
    - A re-send of a stored phone fill skips the split-cash guard (`POST /transactions`) and is handed back on `fuel-entries` (S3 for Gas Card).
  - **S10:** `POST /fuel/driver-fill/:transactionId/numbers`. Only the fill's own driver (sign-in id or `fleet_drivers.user_id` match), only while `waiting` / `needs_look` and Pending. Total + litres → ready to approve, labelled `typedByDriver`; a new pump photo alone → back to the reader.
  - Checks:
    - 25 rule/job tests pass; the older repeat-save tests still pass (10).
    - `supabase/tests/fuel_photo_read_queue_checks.sql`: 14 checks, in CI. Proved on a throwaway local Postgres: both migrations apply and the cron registers; the outbox checks (20) and queue checks (14) pass; the empty queue makes no call; a wrong grant fails the checks (this first proof found a gap in the grant check, now fixed).
    - Type check: no new errors on changed lines. fleet-fuel is 58 (old 57 + one old error in `gemini_service.ts`, now part of that bundle).
    - Route lists, route contract, overlap, duplicate-name, anon-lock and migration checks pass.
  - Production paste file: `docs/fuel_photo_read_queue_LIVE_apply.sql` (after `docs/driver_phone_outbox_LIVE_apply.sql`).
- **Not tested end to end yet:** no route has been called against a real database or a real photo. That happens with the phone layer on a local copy (playbook Step 6).
- **Phone layer, round 1 built (25 Nov, not live, not committed) — the sender:**
  - **Approach:** the Driver app's existing waiting list (`OfflineProvider`, `offlineStorage`, `offlineBlobStore`) was hardened rather than replaced. It also carries trips, tolls and car-kit updates, and all of them get the same fixes.
  - **Shared rules** `packages/fuel-core/src/phoneOutbox.ts` (export `@roam/fuel-core/phoneOutbox`), 9 tests pass:
    - retry gaps 1 / 5 / 15 / 60 minutes, then hourly, never parked (FO-06);
    - a 90-second limit per send (FO-07);
    - due-on-a-timer (FO-08);
    - the phone report (S1);
    - plain error words ("no signal", "signal too weak").
  - **FO-06:** the "3 tries then suspended" rule is gone. A refusal the server keeps giving waits an hour between tries and is never dropped. Closed-week trips are held (not retried, not deleted) as before.
  - **FO-07:** each send is time-limited. The "already sending" check is a ref, not React state, so the list can't stay stuck on "Syncing"; it always resets in `finally`.
  - **FO-08:** sends on start, every 60 s while the app is open, when the app returns to the front (visibility + Capacitor `appStateChange`), and when signal returns. Timer runs are quiet; only *Send now* says what's still waiting.
  - **FO-09 (changed):** the list stays in localStorage. Instead, a photo missing from the phone no longer blocks a fill forever ("Offline … photo missing" thrown on every try). The fill is sent without it, marked `photoMissingOnPhone`, and the server sends it to review (S5/S6 "No pump photo"). Moving the list into IndexedDB would have meant rewriting every caller for little gain: both stores live and get cleared together.
  - **FO-10:** uploads of new-flow fills send `captureId` + `photoKind` (`packages/types` `UploadEvidenceMeta` / `appendUploadEvidenceMeta`), so the server keeps one file per photo (S4).
  - **FO-18:** removed the per-item delete, *Clear All*, the browser `alert` / `confirm` pop-ups, `removeFromQueue` / `clearQueue` from the context, and `offlineStorage.clearQueue`. `removeFromQueue` remains only for the sender, after the server confirms. The panel (`OfflineSyncManager`) is now "Waiting to send": *Send now*, "On this phone", "Last try 7:10 AM · no signal".
  - **S1:** after every run the phone reports to `POST /fuel/phone-outbox`. It has a 20-second limit, sends only when the count changes or every 10 minutes, and never blocks. A random device id is kept per install (`roam:driver:device-id`).
  - Checks: Driver app tests 61/61 pass. `tsc` shows no new errors in changed files; the trip call in `OfflineProvider` and two `api.ts` lines are older errors.
  - Left unused: `components/providers/offlineQueueRerun.ts` (+ its test). Nothing calls it now.
- **Screens, round 1 built (25 Nov, not live, not committed) — Roam Driver, behind `fuelPhotoFirstEnabled` (off):**
  - New folder `apps/driver/src/components/fleet/fuel-photo/`:
    - `FuelPhotoFlow.tsx`: the screens.
    - `fuelPhotoFill.ts`: draft and waiting-list item builder, 9 tests.
    - `fuelPhotoDraftStore.ts`: draft on the phone.
    - `fuelPhotoReport.ts`: Sentry step reports.
  - Hook `hooks/useFuelPhotoFirstEnabled.ts` keeps the last answer on the phone; `VITE_FUEL_PHOTO_FIRST=1` turns it on locally.
  - `DriverExpenses.tsx`: Fuel opens the new flow when the switch is on (`viewState 'photo_first'`), and a camera-resume with a draft reopens it. With the switch off, nothing changes.
  - **Built screens (Stitch numbers):**
    - 2 / 3 / 4 Odometer (before photo, number read, no signal), with the last-fill box.
    - 5 How did you pay? (drawn by us in the same style, Keep / Drop / Add).
    - 6 / 7 Pump or receipt.
    - 11 Pick up where you left off.
    - 13 Gas Card fill.
    - Round 2 drops applied: no invented labels or tab bar, "Skip" style, "Save" wording.
  - **FO-01:** each photo goes into the phone's file database the moment it's taken. The draft is saved on every change and offered again after a close or screen kill. A camera photo restored after Android closed the app is picked up (`consumeRestoredPhoto('fuel')`).
  - **FO-02:** the camera returns photos already shrunk to 1600 px (`captureNativePhoto(…, { maxSize: 1600 })`). Previews are file links, never full-size text copies.
  - **FO-03:** location starts when the flow opens, has a 20-second limit, and never blocks; the reason is kept when there's none. The "Locking your station location…" step isn't in this flow.
  - **FO-04 / FO-13:** odometer and pump readings run in the background with a 15-second limit and fill in only if the driver hasn't typed. Every number is optional.
  - **FO-05:** Save = one waiting-list item (id = captureId), then a send attempt. Same path online and offline.
  - **FO-12:** the Gas Card is looked up quietly (10-second limit, last card kept on the phone) and never needed to save. **Server:** `fuel-entries` attaches the active card for the car, then the driver, when a phone fill arrives without one (`pickActiveCardForFill`, test added, 21 rule tests pass). `cardAttachedByServer` / `cardNotFound` labels.
  - **FO-15:** Sentry warnings tagged `fuel_step` for location, readings, card lookup, camera, resume and save.
  - **Gas Card + Cash (changed for this round):** picking it hands the odometer photo and reading to the **current** Gas Card + Cash screen (split pairing logic unchanged).
  - **Screen check:** a temporary preview page in the browser pane (since deleted) showed screens 2, 3, 5, 6, 7, 11 and 13 in light and dark. Fixed during the check: car label crowding the title, "7:03 AM" time format, button colour fade between steps, money format "4,000.00", and the resume line now names the real next step. Save with no signal built one item: −J$4,000.00, 18.7 L, 200,412 km, photo time 07:03:40, pump photo attached; the draft was released.
  - Checks: Driver tests 70/70 pass. Type errors still 394 (none in new files); the fuel bundle is still 58.
  - `OfflineContext` is now exported (for tests and previews).
- **Screens, round 2 built (25 Nov, not live, not committed):**
  - **Roam Driver fuel list (screen 8), switch on only:**
    - The Stitch card "N fill(s) on this phone · It sends by itself when you have signal" with *Send now*.
    - Fills still on the phone listed first with "On this phone" (`fuel-photo/FuelListBits.tsx`). There's no Remove (FO-18).
    - Server fills get **Sent** (being read), **Read**, or **Needs a look** (`fillChipForServerFill`, test added), and "Amount coming" until the total is known.
  - **Needs a look (screen 10):** tapping the fill opens a bottom sheet (`FuelNeedsLookSheet.tsx`) with the reason, the odometer, and how it was paid.
    - *Add numbers* sends total + litres (S10, `api.addFuelFillNumbers`).
    - *Retake pump photo* uploads with the fixed key, then S10 sends it back to the reader. Both need signal and say so.
  - **Server:** `POST /fuel/fill/:transactionId/numbers` (`fuel.edit_entry`, own company), using `canFleetAddNumbers` / `applyFleetNumbers`.
    - It saves the owner's numbers, labelled `typedByFleet`, and the fill becomes ready to approve.
    - 22 rule tests pass; route lists are updated.
  - **Roam Fleet, Fuel Management → Review Queue (changed):** Fuel Management has no Overview tab, so the "Fills waiting on drivers' phones" card sits at the top of the Review Queue tab (`phone-fills/FuelPhoneWaitingCard.tsx`). It refreshes every 5 minutes and hides at zero.
  - **Review Queue "needs a look" (screen 2, as an inline row):** `phone-fills/FuelNeedsLookPanel.tsx` shows:
    - what was read (From photo), the reason and payment chips, station, and "No location from the phone";
    - both photos with an **in-app** full-size view (no new browser tab);
    - Total / Litres boxes, "J$… a litre · Typed by you";
    - *Reject* with an in-app reason box (no browser pop-up), *Save numbers*, and *Save and approve* (save, then the existing approve);
    - "N fill(s) being read from the photos".
  - **Guard:** fills still being read or needing numbers are kept out of the normal Review Queue table, so a J$0 fill can't be approved there by accident.
  - **Fleet Drivers list (screen 6):** "N on phone" chip next to each driver's name (desktop and phone layouts), with the hover text. Hidden at zero.
  - **Checks:**
    - Driver tests 71/71; Fleet fuel / drivers / services tests 173/173.
    - Type errors: driver unchanged (394); Fleet shows no errors in the new or changed lines. `recoverIfAlreadyLocked` in `FuelManagement.tsx` is an older error in the committed file.
    - Temporary previews (since deleted) of the Fleet card, the needs-a-look row with numbers typed, the chip, and the driver list pieces and sheet in light and dark. One fix from it: the sheet had two close buttons.
- **Round 3 built (25 Nov, not live, not committed) — build complete:**
  - **Driver screen 12, Where did you fuel?** (`stationQuestion`, 4 tests).
    - Inside a station's area: that station goes on the fill with no question.
    - Outside one: after Save, the nearest 3 verified stations within 5 km show with "0.1 km away", plus *Somewhere else*, *Done* and *Skip*. The choice is written onto the waiting fill before it sends.
    - No GPS: no question.
  - **Fleet screen 5, Where was this fill?** In a no-location review row: search box and up to 5 verified stations; the chosen one goes with *Save and approve* (`matchedStationId`).
  - **Gas Card + Cash in the new flow:**
    - Pump photo with Total + Litres (the one fill where they're needed: the cash part comes from the card statement). Builds one `SUBMIT_SPLIT_FUEL_FILL`; 2 tests.
    - The old hand-over to the previous split screen is removed.
    - **Server:** `fuel/split-fill` attaches the Gas Card for phone split fills with none (FO-12).
  - **FO-16 closed — not needed:** nothing in Roam Fleet opens `components/driver-portal/DriverExpenses.tsx`. Only `FuelLogForm` from that folder is used, by the owner on the Vehicles page. Drivers log fuel only in Roam Driver.
  - **Two server bugs found by the end-to-end run, fixed:**
    - One file per photo (S4) only worked with `EVIDENCE_TTL_ENABLED`. It now works either way.
    - A phone Gas Card fill with no GPS is parked as a held `transaction:<id>` before any fuel entry exists. A re-send wasn't recognised and could make a second learnt location. Now it gets the same held answer (S3). The held record also dropped the attached card; it now keeps `metadata.cardId`.
  - **End-to-end run on the local copy (real routes, real database, test seed users, made-up ids): 25/25 pass.**
    - How: Supabase CLI worked with `DO_NOT_TRACK=1` but couldn't reach Docker, so containers were started with `docker start`, the 4 missing migrations applied by hand (plus logbook rows), fleet-fuel and fleet-core run with Deno on ports 8801 / 8802. Afterwards everything was stopped and the scratch key file deleted.
    - Covered: sign-in; upload twice = one file; photo-only fill stored Pending and queued; re-send handed back; phone report saved and seen by Fleet; drivers-only report; reader refuses outsiders; reader runs and gives Needs a look after 3 tries (no Gemini key locally); viewer can't save numbers; owner Save numbers; approve → posted fuel entry; driver adds numbers; others refused; Gas Card fill gets the car's card; Gas Card re-send handed back.
    - Gas Card + Cash from the new flow: saved; re-send left exactly 1 cash row + 1 card row.
    - Not run: the phone screens against the local server with a real camera (checked on preview pages instead), and the Gemini pump reading (no key locally).
  - **Checks:** Driver 77/77, Fleet 173/173, server rules 27/27. No new type errors (fleet-fuel 58, fleet-core 305, Driver 394; Fleet only the old `recoverIfAlreadyLocked`). Route lists current.
- **To go live (owner):**
  1. Paste `docs/driver_phone_outbox_LIVE_apply.sql`, then `docs/fuel_photo_read_queue_LIVE_apply.sql`, in the Supabase SQL editor.
  2. Commit and push (deploys the server, including `fleet-fuel-cron`).
  3. Build and publish a new Roam Driver to Play.
  4. Switch on `fuelPhotoFirstEnabled` for all companies.
  5. Real run with Kenny: done-tests 1–11.
- **S10 (found while building; added to section 4):** the driver's *Add numbers* / *Retake pump photo* on a *Needs a look* fill needs its own route, because S3 hands back the stored fill on any same-captureId re-send.

---

## 1. What we found (evidence)

### 1.1 Kenny's phone crashes the app's screen almost every day

Sentry issue **ROAM-DRIVER-3 `webview_render_process_gone`** — 147 times since 17 Oct, one user, always the same phone:

- TECNO Spark 10 (KI5q), Android 13, low-end class, 4 GB memory, Jamaica, Roam Driver 1.0.29.
- Reason recorded: `kill`. Android killed the part of the app that draws the screen (the WebView) to free memory. It wasn't a code error.
- Seen on most days since 27 Oct, with up to 10 in half a day.

What the app does then (`apps/driver/android/.../MainActivity.java`): it **restarts the whole screen** (`recreate()`). Everything not yet saved is gone, including the odometer photo, the typed reading, the GPS fix and the receipt photo. After 3 kills inside a minute it gives up and Android closes the app.

The driver sees the app reload, spin, or close in the middle of logging. This is the main reason fuel logging "never finishes" on his phone.

### 1.2 What his phone sent this morning (25 Nov, 7:03 AM Jamaica)

From the server logs:
- 12:02 UTC: app opened, signed in.
- 12:03:05: Fuel tapped. 12:03:34: odometer photo sent, read in 3.3 s (worked).
- 12:03:40: Fuel tapped again (he was back at the start).
- After 12:03:41: **nothing more from his phone.** No photo upload and no save.

His last fill saved from his own phone was 21–22 Nov. The 23 and 24 Nov fills were typed in from the Fleet side (`admin-manual`).

### 1.3 How a fill works today (Roam Driver)

Steps, in order. Each one must finish before the next:

1. **Select Category** → Fuel.
2. **Scan Odometer** → *Take a photo* → photo sent to the AI (needs internet). *Use this reading* / *Cancel*.
3. **Locking your station location…** → waits for the phone's location with **no time limit** (`nativeLocationAccess.ts` → Capacitor Geolocation). *Skip for now* turns on after 3 s.
4. **Where did you fuel? / Location not detected / Looks like you've left the station** → station choice buttons.
5. **How did you pay for fuel?** → *Gas Card* / *Cash* / *Gas Card + Cash*. Gas Card looks up the card (needs internet).
6. **Fuel Details / Gas Card Fill / Gas Card + Cash** → receipt photo → AI reads it (needs internet) → total and litres → *Save Expense*.

The phone only keeps the fill for later at step 6. If the phone **says** it is offline, or the save fails with a network-looking error, the fill goes into the waiting list. Anything that goes wrong in steps 1–5 loses the fill.

### 1.4 The waiting list on the phone (`OfflineProvider.tsx`, `offlineStorage.ts`, `offlineBlobStore.ts`)

- The list itself is kept in the phone's small text storage (localStorage). Photos go in the phone's file database (IndexedDB).
- It only re-sends when the phone says it came back online, or when the app opens. There's no timer.
- **After 3 failed tries a fill is parked** ("suspended") until someone taps *Force Retry All*.
- The send calls (`saveTransaction`, sign-in check) have **no time limit**. One stuck call leaves the list in "Syncing" forever, and nothing else sends until the app restarts.
- Every retry **re-uploads both photos as new files**, leaving the earlier copies behind.

### 1.5 Server

- Saving the same fill twice (same id) is only treated as a repeat **within 15 minutes** (`fuel_tx_repeat_save.ts`, `REPEAT_FUEL_SAVE_WINDOW_MS`). A fill sent from the waiting list hours later runs the whole save again.
- The server can already read odometer and receipt photos (`scan-odometer`, `scan-receipt`), but only when the phone sends the photo and waits. Nothing reads a photo that's already saved.
- The Fuel Review Queue already exists and is the one place fuel gets approved. Fills the server can't finish go there.

### 1.6 Roam Fleet driver section

`apps/fleet/src/components/driver-portal/DriverExpenses.tsx` has the same step-by-step flow and **no waiting list at all**. Offline means the fill is lost.

### 1.7 Camera

- The odometer camera (`packages/ui/src/odometer-scanner.tsx`, shared since 24 Oct) uses the plain web file picker. It also turns the **full-size photo** into a text copy for the preview (`readAsDataURL`), on top of the shrink step. That is a lot of memory on a 4 GB phone.
- The native camera helper (`nativePhotoCapture.ts`, used for tolls) handles Android closing the app mid-photo. But it asks for full-size photos, with no width limit.

---

## 2. How it will work (the design)

1. **The photos are the fuel log.** Odometer photo → pump/receipt photo (not for Gas Card) → payment type → **Saved**. The fill is stored on the phone the moment the last tap happens, with its own id. No step before Saved needs internet.
2. **Nothing waits on the network.** Location starts quietly when the fuel screen opens; it works without internet and is attached whenever it arrives. The AI reading runs in the background, and the driver can type the reading or leave it. Every background job has a time limit.
3. **One sturdy outbox on the phone.** It keeps fills and photos in the phone's file database, survives the screen being killed, retries forever with growing gaps, never parks a fill, and uses the same id and the same photo files every try.
4. **The server finishes the fill from the photos.** It reads the odometer and receipt, works out total, litres and price, and matches the station (GPS, then the card statement). Anything it can't settle goes to the Fuel Review Queue with the photos and a label.
5. **Everyone can see where a fill is.** The driver sees *On this phone*, *Sent*, *Read* or *Needs a look* on each fill. The owner sees, in Fleet, how many fills each driver's phone is still holding and since when.
6. **Problems report themselves.** Every timed-out step, killed screen during a fill, and fill stuck over 24 h is sent to Sentry with the step name.
7. **Low memory.** Photos are shrunk by the camera itself before the app sees them. No full-size preview copies.

---

## 3. Data

| # | What | Rule |
|---|---|---|
| D1 | New table `fleet.driver_phone_outbox`, one row per driver phone: `organization_id`, `driver_id`, `device_id`, `app_version`, `pending_count`, `oldest_pending_at`, `last_error`, `last_seen_at`. | One row per (driver_id, device_id). `pending_count ≥ 0`. `oldest_pending_at` is null when `pending_count = 0`. |
| D2 | Public view `fleet_driver_phone_outbox` with **explicit columns** (see [[explicit-column-views]] rule) and grants matching the other fleet views. | Every new column also goes into the view. |
| D3 | Fuel fill fields (on the existing transaction / fuel entry `metadata`): `captureId` (phone id of the fill), `capturedAt` (photo time on the phone), `sentAt`, `photoReadStatus` (`waiting` / `read` / `needs_look`), `gpsFixAt`, `gpsAccuracy`, `gpsMissingReason`. | `capturedAt` is the fill time, never the upload time. Missing values stay missing (labelled), never invented. |
| D4 | Evidence files keyed by fill: `evidence/<org>/<type>/<captureId>-<kind>.jpg`. | Same fill + same kind = same file. A re-send replaces it and never adds another. |
| D5 | Migration made with `npx supabase migration new driver_phone_outbox`, real UTC time. The logbook line goes in the pasted SQL only. | CI migration checks pass. |

## 4. Server

| # | Action | What it must do | Test |
|---|---|---|---|
| S1 | `POST /fuel/phone-outbox` (driver) | Upsert D1 for the signed-in driver's own row only. | A driver can't write another driver's row. Counts update. |
| S2 | `GET /fuel/phone-outbox` (fleet) | List rows for the company: driver name, pending count, oldest pending, last seen, app version. | Only own company. |
| S3 | `POST /transactions` and fuel-entry save | Same id (`captureId`) from a driver = the same fill **at any age**. Return the stored fill and don't re-run the save. | A re-send after 3 days doesn't double-book or change the ledger. |
| S4 | `POST /upload` | When `sourceId` + `evidenceType` are given, write to the D4 key, replacing the old file. | Three uploads of the same fill leave one file. |
| S5 | Accept a fill with photos but no total, litres or reading | Save it as Pending with `photoReadStatus = waiting`. Never reject it for missing numbers. | Photo-only fill is stored. |
| S6 | Photo reader job (runs after S5, and every 10 min for any `waiting` fill) | Read the odometer and receipt from the stored files, fill in the missing numbers, then run the normal fuel engine. If it can't read them → `needs_look` → Fuel Review Queue with the reason. | Readable photos fill the numbers in. Blurry photos go to review with photos attached. |
| S7 | Station match uses `gpsFixAt` | Use the phone's fix time and accuracy. No fix → statement match → review. | Fill with no GPS still matches from the statement. |
| S8 | Go-live switch `fuelPhotoFirstEnabled` (platform feature flag) | Off = today's flow. On = the new flow, for **every company** at once. | Both settings tested. |
| S10 | `POST /fuel/driver-fill/:transactionId/numbers` (driver) | The driver adds total / litres (or a new pump photo URL) to **their own** fill while it is `waiting` or `needs_look`. Typed values are labelled "typed by driver"; then the fill goes through the normal save (station gate, approval). Refused for any other state or driver. | Driver adds J$1,000.00 / 4.59 L to a Needs a look fill → it leaves review; someone else's fill → 403. |
| S9 | Permanent refusals from the phone (closed week, module off, no vehicle) | Store the fill anyway as Pending with `photoReadStatus = needs_look` and the reason, and answer "received". Never send a "drop it" answer back to the phone. | A fill for a closed week arrives in the Review Queue with the reason "Week already closed". |

## 5. Screens

Every screen and button in the fuel flow, and what it does after the change. The owner makes the new look in Stitch; this list is the content.

### Roam Driver — Log fuel

| Screen | Button / item | Must do |
|---|---|---|
| Select Category | *Fuel* | Opens Odometer photo. Location starts quietly here. |
| Select Category | *Maintenance*, *Tolls*, *Other Expenses* | Unchanged. |
| Odometer photo | *Take a photo* | Native camera, photo already shrunk (max 1600 px). The photo goes into the outbox straight away. Small preview only. |
| Odometer photo | Reading box | Optional. Filled by the AI if it answers within 15 s; the driver can type over it. |
| Odometer photo | *Next* | Always works once a photo exists, whether or not there's a reading. |
| Odometer photo | *Cancel* | Back to Select Category; this fill's draft is removed. |
| How did you pay? | *Gas Card* / *Cash* / *Gas Card + Cash* | Picks the payment. Gas Card: no card lookup needed to continue (the server attaches the card). |
| Pump / receipt photo (Cash, Gas Card + Cash) | *Take a photo* | Same camera rules. Goes into the outbox straight away. |
| Pump / receipt photo | Total / Litres boxes | Optional. Filled by the AI if it answers in time. |
| Pump / receipt photo | *Save* | Saves the fill on the phone **at once**, shows "Saved", and returns to the fuel list. Sending happens on its own. |
| Gas Card + Cash | Cash amount box | Optional; the server works it out from the statement if left empty (existing statement rule). |
| Station question (only if GPS arrived and is unclear) | *I fuelled at …* / *A different station* / *New / not listed* | Optional. Shown after Save as a one-tap question on the fill, never before Save. |
| Fuel list | Each fill | Shows status: *On this phone*, *Sent*, *Read*, *Needs a look*. |
| Fuel list | *Send now* (only when something is waiting) | Tries to send right away. |
| One fill (On this phone / Needs a look) | *Send now*, *Add numbers*, *Retake pump photo* | No Remove button. A saved fill leaves the phone only by arriving at the fleet (FO-18). |
| Removed | *Locking your station location…* screen, *Skip for now*, *retry GPS* buttons, *Continue without GPS — pick station* | Gone. Location never blocks. |

### Roam Driver — outbox panel (existing `OfflineSyncManager`)

| Item | Must do |
|---|---|
| Waiting list | Each waiting item (fuel, toll, check-in) with its photo time and last try in plain words. |
| *Send now* | Replaces *Sync Now* / *Force Retry All*. There are no "suspended" items any more. |
| Removed | The per-item *Remove* button, the remove confirm, and *Clear all*. The driver can't delete anything that's waiting (FO-18). |

### Roam Fleet — driver section (`driver-portal`)

Same flow and buttons as Roam Driver, **with the same outbox** (it has none today).

### Roam Fleet — owner side

| Screen | Item | Must do |
|---|---|---|
| Fuel Review Queue | Fill with `needs_look` | Shows the photos, what was read, what's missing and why. |
| Fuel Review Queue → one fill | Total / Litres inputs, *Save numbers*, *Save and approve*, *Reject* | Typed numbers are stored on the same fill and the fuel engine re-runs. Save and approve also approves; Reject is the existing reject. |
| Fuel Review Queue → fill with no location | *Where was this fill?* station picker, *Use this station* | Sets the station on the fill. |
| Fuel Management → Overview | "Fills waiting on drivers' phones" card | One row per driver: count, since when, phone last seen, app version. From S2. Hidden when 0. |
| Drivers | "2 on phone" chip on the driver row | Same numbers as the card. Hidden when 0. |

## 6. Problems found

Each has one fix.

| # | Problem | Fix |
|---|---|---|
| FO-01 | Android kills the app's screen on low-memory phones (147 times on Kenny's), and the restart throws away the fill in progress. | Store each photo in the outbox the moment it's taken, and restore the open fill from the outbox after any restart. A kill then costs nothing. |
| FO-02 | Photos are full size: the camera gives full resolution and the odometer scanner makes a full-size text copy for the preview. Heavy memory use is what triggers FO-01. | Odometer and receipt photos use the native camera helper with `width: 1600`, and the preview uses a file link (`URL.createObjectURL`) instead of a text copy. |
| FO-03 | The location step waits with no time limit and blocks the flow. | Location starts at Select Category, has a 20 s limit, and never blocks; the fill saves with or without it (`gpsMissingReason` when absent). |
| FO-04 | The AI odometer and receipt readings must finish before the driver can move on. | Readings run in the background with a 15 s limit. The driver can move on any time. The server reads anything left unread (S6). |
| FO-05 | The fill is only kept for later at the final Save, and only when the phone says it's offline. | The fill goes into the outbox at the first photo and is sent from the outbox every time, online or not. There's one path, not two. |
| FO-06 | The waiting list parks a fill after 3 failed tries. | Retry forever with growing gaps (1 min → 5 → 15 → 60, then hourly). Only permanent answers (closed week, module off) stop it, and those go to the owner as *Needs a look*. |
| FO-07 | Send calls have no time limit, so one stuck call blocks all sending. | Every send call gets a 60 s limit, including the sign-in check. A timed-out call counts as a failed try. |
| FO-08 | The waiting list only re-sends when the phone says it came back online or the app opens. | Also re-send on a timer while the app is open, and when the app returns to the front. |
| FO-09 | The list lives in small text storage and the photos in another store, so they can drift apart. | Fills and photos live together in the phone's file database (one record per fill). |
| FO-10 | Every retry re-uploads both photos as new files. | Upload to the fixed per-fill key (D4 / S4). |
| FO-11 | The server only treats a re-send as a repeat within 15 minutes. | A driver re-send with the same `captureId` is a repeat at any age (S3). |
| FO-12 | Gas Card can't continue without an online card lookup. | Drop the lookup from the phone flow. The server attaches the card from the vehicle and driver when it saves. |
| FO-13 | The phone requires total and litres before Save. | Numbers are optional on the phone. The server fills them from the photo (S5, S6). |
| FO-14 | The owner can't see fills stuck on a driver's phone. | Phone reports its outbox (S1). Fleet shows the "Waiting on phone" badge (S2). |
| FO-15 | Stuck steps and screen kills during a fill aren't tied to the fuel flow in Sentry. | Report each timed-out step, each screen kill with an open fill, and any fill unsent for 24 h, tagged with the step name. |
| FO-16 | The Roam Fleet driver section has no waiting list at all. | Use the same outbox module as Roam Driver (shared package), not a copy. |
| FO-17 | After 3 screen kills in a minute, the app gives up and Android closes it. | Keep the give-up rule (it stops crash loops). With FO-01 the open fill survives, and the next app open returns to it. |
| FO-18 | The driver can delete fills that haven't been sent (*Remove* on each waiting item, *Clear all* in `OfflineSyncManager`; `offlineStorage.removeFromQueue` / `clearQueue`). Deleting a logged fill isn't the driver's decision (owner, 25 Nov). | Take every remove and clear action off the phone. A saved item leaves the phone only when the server confirms it arrived. A fill the server refuses for good is stored as *Needs a look* instead (S9), so the owner decides on it in Fleet. *Cancel this fill* stays only **before Save**, while nothing has been logged. |

## 7. Done-tests

Written before building, in plain words.

1. **Airplane mode at the pump:** take the odometer photo, take the pump photo, tap Cash, tap Save → "Saved" within 2 seconds. Turn signal on → within 5 minutes the fill is in Fleet with total, litres and odometer read from the photos.
2. **Weak signal (phone says online, nothing gets through):** same as 1. Save never spins, and the fill arrives when signal is real.
3. **Screen killed mid-fill:** take the odometer photo, force the app closed, reopen → the fill continues from the pump photo with the odometer photo still there.
4. **Location off:** the fill saves; Fleet shows "no location" and matches the station from the statement or sends it to review.
5. **Three days offline:** 3 fills on the phone → Fleet badge shows "3 fills on his phone since …" once the phone is online → all 3 arrive, each once.
6. **Re-send:** the same fill sent twice, a day apart → one fill, one set of photos, ledger unchanged on the second send.
7. **Blurry receipt:** the fill goes to the Fuel Review Queue as *Needs a look* with both photos.
8. **Gas Card, no signal:** odometer photo → Gas Card → Save works offline; the card is attached on the server.
9. **Roam Fleet driver section:** tests 1, 3 and 6 pass there too.
10. **No delete on the phone:** with a fill waiting, there's no Remove or Clear button anywhere in the app. The fill stays until it arrives. A fill for a closed week arrives in the Review Queue as *Needs a look*.
11. **Kenny's phone, real run:** 5 real fills in a week, all arrive, and no fill lost to a screen kill (Sentry ROAM-DRIVER-3 events during fills come with the fill intact).

## 8. Build order

Each layer is finished and checked before the next.

1. **Data:** D1–D5.
2. **Server:** S3, S4, S5 first (safe re-sends and photo-only fills), then S6, S7, S1, S2, S8.
3. **Phone outbox (shared package):** FO-05 to FO-10, FO-16.
4. **Phone flow:** FO-01 to FO-04, FO-12, FO-13, FO-17, with screens from Stitch.
5. **Owner side:** FO-14 badge, review-queue reasons.
6. **Reports:** FO-15.
7. **Tests:** the done-tests above, plus a test for each FO fix. A new Play build of Roam Driver goes out (bundled app, so the phone change needs a store update).

## 9. Round 2 — screens vs plan (25 Nov)

Screens checked: `Downloads/logging fuel/stitch_roam_driver_fuel_logging` (15 screens) and `Downloads/fleet log fuel/stitch_roam_fleet_fuel_review` (7 screens). Stitch owns the look; this list owns the content.

### Rules for every screen

- **Drop everywhere (invented):**
  - Driver app: the bottom bar *Fuel / Log / Trips / Settings* (keep the app's real bottom bar), and page titles "Log Entry Form", "Fuel Fill Audit Review", "Log Fuel Stop", "Fuel Fill Details" (use the plan titles: *Odometer*, *How did you pay?*, *Pump or receipt*, *Gas Card fill*, *Fuel*, *Fuel · <date>*, *Waiting to send*).
  - Fleet: the footer (*Roam Fleet Engine · System Operational / Security Standards / Ledger Verification / Support Desk*), the *Kingston Express Fleet* switcher, and breadcrumbs like "Ledger Control / Fleet Financial Audit". The app frame stays as it is today.
  - Both: every "OCR", "confidence %", "verified", "auto-detected", "sync", "ledger", "telemetry", "batch #", "ID #", "#FL-…", "Fleet ID", "Unit #" and "Queue Locked" label.
- **Money** always shows as "J$" with 2 decimals, never "$" or "JMD".
- **Buttons:** "Skip for now" and "Save numbers" must be bordered buttons, not text.

### Roam Driver

| # | Screen file | Keep | Drop | Add |
|---|---|---|---|---|
| 1 | log_new_expense_pick_fuel | 2×2 tiles, car line, the tile subtitles ("Highway & bridges", "Repairs & fluids", "Parking & misc") | "Tap card to proceed directly to pump details" | — |
| 2 | odometer_photo_before_photo | dashed photo button, Kilometres box + Optional tag, helper line, disabled Next, red Cancel this fill | "Pre-fill verification", the "Offline ready · On this phone" strip (nothing is saved yet) | — |
| 3 | odometer_photo_number_read | photo tile + Retake, the 200,412 box with tick, "Read from your photo…" line, the **last-fill box** ("Last fill 199,840 km · +572 km") | "Logged on this phone / Auto-syncing" strip, "Auto-detected", "Cluster Snapshot", "OCR Verified", "CLUSTER READ", "Fuel & Trip Entry", "Delta calculated", "Verified Driver" pill | Last-fill box shows only when the last odometer is known (from tank status, kept on the phone) |
| 4 | odometer_photo_no_signal | amber signal pill, photo tile, empty box, Next, Cancel | "Auto-detected frame", "High confidence", "Photo captured" | Helper line in plan words: "You can leave it blank. We'll read it from the photo when you're back online." |
| 5 | *(not made)* How did you pay? | — | — | **Build in the same style**: three payment choice cards (Cash / Gas Card / Gas Card + Cash) as the plan's SCREEN 5, odometer summary row on top, Next + Cancel this fill |
| 6 | pump_photo_before_photo | photo button, two optional boxes, "Leave them blank and we'll read them from the photo.", disabled Save, Cancel | "Instant OCR auto-fill", the "Payment Method · Driver Petty Cash · Verified" box | Button label "Save" |
| 7 | pump_photo_ready_to_save | photo tile + Retake, filled boxes with ticks, "J$213.90 a litre" | "On this phone · Ready" strip (not saved yet), "Unleaded Premium" | Button label "Save" |
| 8 | saved_fuel_list | Log fuel button, amber "1 fill on this phone" card with Send now, fill cards, toast | "Auto-sync" pill | The amber card's line wraps to two lines instead of cutting off |
| 9 | one_fill_on_this_phone | everything else | **Remove this fill** (FO-18) | — |
| 10 | one_fill_needs_a_look | header card, photo pair, rows, optional boxes, Add numbers, Retake pump photo | "Verified" tag on the odometer photo | — |
| 11 | pick_up_where_you_left_off | resume card (Continue, Cancel this fill), fill list | "Synced", "Draft in progress", "Filter", "3 recorded", fuel grades ("Regular 90", "E10 87"), the "Tamper-Proof Audit Logging" card | "Odometer done" instead of "Odometer confirmed" |
| 12 | where_did_you_fuel | sheet, station rows with **distance** ("0.1 km away"), Somewhere else + Search, Done | "Quick GPS Match", "Detected near pump", "balance receipts faster"; the background list's "Toyota HiAce #12", "Shell Spanish Town" | "Skip" as a bordered secondary button. Distances come from the phone's GPS fix to each station; hide them when there's no fix |
| 13 | gas_card_ready_to_save | summary card, Litres box, Save, Cancel | "Confirmed Reading / Verified", "Fleet sync active", "Odo capture #942", "Your fleet matches this to the card receipt." | Line: "No pump photo needed. The amount comes from the card statement." Button "Save" |
| 14 | gas_card_cash_pump_photo_taken | photo tile, boxes, Cash part box and its line, Save, Cancel | "Driver: Kenny…", "Auto-detected", "JMD" | — |
| 15 | waiting_to_send_list | signal pill, count, item rows with last try, info card, Send now, "Safe to close the app" | **Remove buttons** (FO-18), "Queue ID #8841-JM", "Offline encrypted storage" (the phone doesn't encrypt) | Amounts as "J$" ("J$380.00") |
| 16 | remove_a_fill_confirm | — | **Whole screen** (FO-18) | — |

### Roam Fleet

| # | Screen file | Keep | Drop | Add |
|---|---|---|---|---|
| 1 | fuel_management_overview_waiting_on_phones | the waiting-on-phones card: driver rows, count + since, phone last seen, app version, "They send by themselves…" | "Fleet Desk" chip, "Locally cached tickets… telematics", *Check Signals*, "Fleet ID #KNG-…", "Queue Locked", "Auto-retry ping cycle (every 180s)", the "This week" and "Review Queue" cards, "Recent Approved Activity" table, *Export Logs* / *Record Fuel Card* | The rest of Overview stays exactly as it is today; only the card is new |
| 2 | fuel_management_review_queue_manual_fill_entry | **This becomes the review layout for a fill that needs a look** (an inline open row, not a side panel): three summary tiles, the row header, "Total not read / Litres not read / 200,243 km · From photo", the chips, the photo pair with View full size, Total and Litres inputs, station and payment boxes, "J$ … a litre", Reject / Save numbers / Save and approve | "Fleet Financial Audit · Ledger Sync Active", "Queue Urgency", *Open photo zoom*, "Glare Detected", the "Ledger OCR Confidence 42%" box, "Kenny quoted J$4,000.00 in dispatch chat", "based on station parish pricing ledger", **pre-filled inputs** (they start empty), "Verified", "GPS verified location", "Fleet petty-cash disbursal", "Within standard tolerance (±0.8%)", the success dialog with "#FL-8823", the "Source Image Zoom" dialog with OCR text, the 1–5 numbering | Labels "From photo", "From location", "Typed by you" (plan S6/S7). Buttons named *Reject*, *Save numbers*, *Save and approve*. The heading reads "Missing numbers" |
| 3 | review_queue_fill_needs_a_look_side_panel | — | **Whole screen**: the panel is cut off and screen 2 covers it | — |
| 4 | review_queue_numbers_typed_rate_calculated | the "Typed by you" tag and "J$217.72 a litre" line (added to screen 2's layout) | the rest (cut-off panel, "14 Transactions", "J$68,450.00", Marcus A. Campbell / Devon St. Patrick Reid rows, "Standard Hub Index") | — |
| 5 | review_queue_fill_with_no_location_station_picker | open row with "No location from the phone", the *Where was this fill?* card, search box, station rows, *Cancel*, *Use this station* | "Automated OCR receipt extraction…", "142", "Auto-OCR Accuracy 98.4%", "Suggested / Frequent station / 1.2 km from last ping", "Last Fill Rate", "Known Fleet Hub / Pre-authorized", "Zone Radius 14.8 km", the "telemetry vector / Highway 2000" box, *View trip route map*, the "Automatic Station Geofencing / Configure Driver App Policy" card | Line: "The phone didn't send a location for this fill." |
| 6 | drivers_waiting_on_phone_chip | the amber "2 on phone" chip and its tooltip | everything else on the page (phone numbers, Unit #, Active Shifts, Sync Ledger, All clear, Assign Driver, invented drivers and counts) | The Drivers page stays as it is today; only the chip is added to each driver row |
| 7 | fuel_management_mobile_waiting_on_phones | the waiting card and one review row with *Open* | "Desk Ops", "Live Sync Active", "Station Mesh #04", "14 PUMPS", "Batch #4802", "Lane 02", "Sun Glare Fault", "Odo Verified", *Send SMS prompt / SMS Push*, the invented bottom bar | — |

### Result of round 2

- One plan change: FO-18 + S9 (no delete on the phone; refused fills go to review).
- One screen to build without a Stitch picture: driver screen 5 (*How did you pay?*), in the same style.
- No new Stitch round needed. **Plan closed — ready to build** (Data layer first, section 8).

## 10. Outside this plan

- Tolls, check-ins and trip logs use the same waiting list. They benefit from FO-06 to FO-09 but their own screens aren't changed here.
