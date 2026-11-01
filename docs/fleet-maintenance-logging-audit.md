# RoamFleet Maintenance Logging — Audit

**Rev 2 · 1 Nov 2026** · Audit only — no code was changed.

### What changed in Rev 2
- The owner's Stitch screens arrived: 12 screens, copied to `docs/stitch/roam-fleet-app/maintenance-logging/` (each folder has `code.html` + `screen.png`; tokens in `fleet_operational_engine/DESIGN.md`).
- **Stitch is now the spec.** Port each screen exactly. Elements on a screen that the app has no feature for get **built** (§8), not dropped.
- **Built in the app today: 0 of 12 screens.** No maintenance code has changed since Rev 1, and every L-finding is still open.
- New findings the screens expose: **L-14** (a completed service can be edited or deleted, so "Immutable Ledger" would be false) and **L-15** (data the screens show that the database doesn't hold yet).
- §4.4 now points at the port plan in §8.
**Goal:** make **how maintenance gets logged** enterprise-grade, with no telematics. People are the data source: they log the service and the odometer, the system works out what is due next, and a nightly check flags anything overdue.
**Scope:** only the logging loop:
1. **Add Service Log** dialog (every step) and the **Log** button on each vehicle row.
2. The **odometer** that a log writes and reads.
3. What a saved log **updates**: work order, schedule ("next due"), status.
4. The **nightly rules check**.
5. The two tabs that show the results: **By vehicle** and **Service ledger**.

**Not in scope:** work-order lifecycle, inspections/DVIR, driver requests, vendors, KPIs, parts and the wider system design. Those are in `fleet-maintenance-enterprise-audit.md`.
**Lens:** systems architect + UI/UX lead + senior developers.
**Checked against:** code in this repo, the live GoRide database (read-only, 31 Oct 2026), and two screenshots of `localhost:3000/maintenance` (hub and Add Service Log, 31 Oct 2026).

---

## 1. Verdict

Logging works when a careful person fills in every field. It isn't enterprise-grade, because **nothing makes the data trustworthy**:

- The odometer can be left blank, and it is then saved as **0**.
- "Current odometer" is the highest reading ever, and includes readings already flagged as wrong.
- One save makes two separate calls, and has already created a duplicate work order.
- "Next due" isn't recalculated from what was actually done, so it drifts.
- No nightly check runs.

The guide's four rules are the right target. Section 2 maps each one to this app, and section 3 lists what must change to meet it.

---

## 2. The guide, mapped to this app

| Guide rule | Today | Target | Finding |
|---|---|---|---|
| **1. Odometer is entered on every service log** | Optional; blank saved as 0; asked on the last step | Required, first step, prefilled, sanity-labelled | L-01, L-02, L-03 |
| …and it updates the vehicle's odometer | Written to `fleet.odometer_readings` (`source='service'`); the write can fail silently | Written in the same transaction as the service | L-04 |
| Current odometer = latest reading | **Highest** reading ever, anomalies included | Latest trusted reading, one SQL view | L-05 |
| **2. Nightly rules engine flags Overdue / Upcoming** | Endpoint exists, **no cron job**, writes 0 alerts | `pg_cron` 02:00 Jamaica, per component, with a run log | L-09, L-10 |
| Upcoming = before it is due | "Due soon" only once it is already due | Look-ahead window (km + days) | L-11 |
| **3. Completed service sets next due = odometer + interval** | Schedule rows written by several code paths and drift from history | Recomputed from completed work-order lines | L-07 |
| Vehicle with no odometer | Shown **Healthy** | Shown **Odometer needed** | L-08 |
| **4. Clean separate tables** (vehicles, schedules, work orders, service logs) | One service is written to **4** places; **2** schedule tables | One write target, one schedule table, the rest views | L-06 |
| Event bus (Kafka / RabbitMQ) for `OdometerUpdated`, `ServiceLogged`, `MaintenanceOverdue` | None | `fleet.maintenance_events` outbox table in Postgres, no Kafka needed at this size | L-12 |
| Redis for status, API gateway, S3 | — | Not needed: SQL views, the existing `fleet-ops` edge routes, Supabase Storage (invoice upload already works) | — |
| Telematics "Phase 2" | — | Stays **Coming soon**; later writes `source='telematics'` readings and the same events. Nothing below changes | — |

---

## 3. Findings

Severity: **Critical** = wrong numbers or duplicate/lost data · **High** = a guide rule is not met · **Medium** = consistency/scale · **Low** = polish. One fix per finding.

### L-01 · Critical · Odometer is optional, and blank is saved as 0
- **Evidence:** the form starts at `odo: 0` (`LogMaintenanceServiceDialog.tsx:340`). The Odometer input (`:1565-1574`) has no required check. **Save Log** is disabled only when there are no lines (`:1740`). The client sends `Number(formMeta.odo) || 0` (`:805`, `:817`). On the server, complete takes `body.odometer`, else the work order's odometer, **else 0** (`maintenance_routes.ts:2920-2922`). The log bridge does the same: `Number(body.odometer ?? body.odo ?? 0)` (`:2052`).
- **Effect:** a service saved at 0 km sets next due one interval after zero, so a 195,000 km car shows Healthy.
- **Fix:** Odometer is **required and > 0**. The client disables Save until it is filled. The server returns **400 `odometer_required`** on `POST /maintenance-work-orders`, `POST /maintenance-work-orders/:id/complete`, and the log bridge, for as long as the bridge exists (L-04).

### L-02 · High · The dialog asks for date and odometer last, and never says which car
- **Evidence:** screenshot 1. The first step shows packages, quick jobs and inspection, but no vehicle, date or odometer. Those only appear on the **review** step (`stepDescription('review')`, `:291`), after every line is built. The header says only "Add Service Log".
- **Fix:**
  - The dialog header always shows **vehicle · plate · current odometer (last read date · source)**.
  - New first step: **"When and at what mileage?"**, with Date (default today) and Odometer (required, prefilled from L-05).
  - Then the existing pick step.
  - Review shows date and odometer read-only, with an **Edit** link.
  - From the top toolbar button (no vehicle chosen), step 0 is a vehicle picker.

### L-03 · High · An odometer that doesn't fit the car's history is accepted silently
- **Evidence:** no check against other readings on any save path. Back-dated logs are normal. The Roomy's only service (6 Jan 2026, 123,000 km) sits below today's 195,192, so a plain "must be ≥ latest" rule would wrongly block it.
- **Fix:** on save, the server finds the nearest trusted reading **on or before** the service date and the nearest **after** it. The reading is flagged when it is:
  - below the earlier reading by more than 50 km,
  - above the later reading by more than 50 km, or
  - more than 1,500 km/day away from either neighbour.
  
  A flagged reading is **saved with `is_anomaly = true`** and shown with a **"Check reading"** label plus the two neighbouring readings. It is never refused. It isn't used as the current odometer until someone clears the label.

### L-04 · Critical · One save is two calls with a silent fallback, and it has already duplicated a service
- **Evidence:** the dialog calls `createWorkOrder` (status `in_progress`), then `completeWorkOrder`. On *any* error it falls back to `saveMaintenanceLog` (`LogMaintenanceServiceDialog.tsx:800-852`).
  - On the server, the odometer write after a save can fail and is only logged (`maintenance_routes.ts:1667`, `:1949`, `:1997`: `console.error(... odometer ledger projection failed)`).
  - Live: two work orders for `5179KZ` on 2026-01-06 at 123,000 km, J$16,800, created 3 s apart. `d3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a` is stuck `in_progress`, and `9a0e45b7…` is `completed`.
- **Fix:**
  - **One call:** `POST /maintenance-work-orders` with `{ completeNow: true, idempotencyKey }`. It runs one Postgres function that, in **one transaction**, does all of this:
    1. creates and completes the work order with its lines,
    2. writes the odometer reading,
    3. recomputes the schedule (L-07),
    4. posts finance once,
    5. writes the `service.logged` event (L-12).
  - Unique index on `(organization_id, idempotency_key)`. The client makes the key when the dialog opens and reuses it on retry.
  - Remove the client fallback.
  - **Data clean-up:** set `d3aaacdd…` to `cancelled` with reason `duplicate of 9a0e45b7`, and confirm exactly one finance posting exists for J$16,800.

### L-05 · High · "Current odometer" is the highest reading ever, including flagged ones
- **Evidence:**
  - `loadOdometerSupplementMaps` (`supabase/functions/_fleet-server/canonical_vehicle_odometer.ts:30-54`) takes the **max** reading with `is_voided = false AND is_hard = true`, and doesn't exclude `is_anomaly = true`.
  - Live: **89 of 550** Roomy fuel readings are flagged anomaly.
  - Today the highest flagged value (191,722) is below the true max (195,192). One pump typo (e.g. 1,951,920) would still make the car "overdue by 1.7 million km" until someone voided it by hand.
  - The overdue digest reads yet another value: `vehicle.odometer` from KV (`maintenance_routes.ts:3328`).
- **Fix:** one view, `fleet.vehicle_current_odometer_v (vehicle_id, reading, recorded_at, source)`. It returns the reading with the **latest `recorded_at`** among `is_voided = false AND is_anomaly = false` rows (ties → highest). The hub, dialog prefill, schedule recompute and nightly job all read only this view.

### L-06 · Critical · One service is stored in four places, and schedules in two
- **Evidence (live row counts):**
  - `public.maintenance_records` 1, `fleet.maintenance_logs` 1, `public.maintenance_work_orders` 2 + `_lines` 2, `public.maintenance_service_ledger` 2.
  - Schedules: `public.vehicle_maintenance_schedule` 1 (package) and `public.vehicle_component_schedule` 27 (component). The hub merges both (`maintenance_routes.ts:2339-2426`).
- **Fix:**
  - **Work orders + lines are the only write target.**
  - `maintenance_service_ledger` becomes a view over completed lines.
  - `maintenance_records` and `fleet.maintenance_logs` become read-only compat views, then are dropped once nothing reads them.
  - Keep **one** schedule table, `vehicle_component_schedule` (it already has position). A package like Basic Service becomes a group of components via the existing `maintenance_package_categories` (37 rows).

### L-07 · Critical · "Next due" isn't recalculated from what was done
- **Evidence (live, `5179KZ`):**
  - The only service is 6 Jan 2026 at 123,000 km.
  - The package row says last performed **18 Apr 2026 at 121,952 km**: a later date but *lower* km.
  - The component rows say next due **128,000**.
  - The car is at 195,192, and the hub shows "Services due 2".
- **Fix:** schedule state is **derived**. For each (vehicle, component, position):
  - **last done** = the latest completed work-order line;
  - **next due km** = last done km + interval;
  - **next due date** = last done date + interval.
  
  One function, `fleet.recompute_maintenance_schedule(vehicle_id)`, runs inside the save (L-04), on edit, on void, and on bootstrap. The nightly job (L-09) flags any row where stored ≠ recomputed.

### L-08 · Critical · A car with no odometer shows "Healthy"
- **Evidence:** screenshot 2 shows the Honda Fit `1505LM` at Odometer **0**, **Healthy**, next due 5,000.
  - Live: **0** odometer readings for this car. All 25 component rows have `last_performed_*` filled in by bootstrap, although no service was ever logged.
  - The summary falls back to `metrics.odometer ?? 0` (`maintenance_routes.ts:2330`).
- **Fix:**
  - No reading in `vehicle_current_odometer_v` → status **"Odometer needed"** (grey) with a **Log odometer** action. Only date-based rows are evaluated for that car.
  - Bootstrap writes `last_performed_* = NULL` plus new columns `baseline_source = 'bootstrap'`, `baseline_odometer` and `baseline_date`. "Never serviced" and "serviced" become different states.

### L-09 · High · The nightly check never runs and never alerts
- **Evidence:**
  - `POST /maintenance/overdue-digest` (`maintenance_routes.ts:3297-3361`) counts overdue rows and returns `alertsWritten: 0` (hard-coded).
  - It reads the KV odometer and ignores component schedules.
  - No `cron.job` exists (live).
  - `docs/maintenance-overdue-digest-cron.md` says it posts alerts. It doesn't.
- **Fix:** `pg_cron` runs daily at **07:00 UTC (02:00 Jamaica)**:
  1. Read `fleet.maintenance_due_v` (L-10).
  2. Insert one `fleet.maintenance_alerts` row per (vehicle, component, position, day), using key `maint:{org}:{vehicle}:{component}:{position}:{yyyy-mm-dd}`. These show in the notification bell.
  3. Run the L-07 drift check.
  4. Write one `fleet.maintenance_job_runs` row (started, finished, vehicles checked, alerts written, error).
  
  The hub header shows "Last checked 02:00 today", or "Nightly check missed" in red when there is no run row for today. Add a banner to the old digest doc pointing at this audit.

### L-10 · Medium · The guide's rule is per vehicle; due state must be per component
- **Evidence:** the guide's `WHERE current_odometer >= next_due_km OR next_due_date <= TODAY` assumes one next-due per vehicle. This app tracks 25 components for the Fit, with per-corner positions. Squashing them into one number is why the hub shows "Next due (km) 128,000" for a car at 195,192.
- **Fix:** add the view `fleet.maintenance_due_v`, with one row per (vehicle, component, position): last done, next due km/date, km and days remaining, and status. The vehicle status is the **worst** of its rows: Overdue > Odometer needed > Due soon > OK. Status is always computed live from the view; the nightly job never sets a status column.

### L-11 · High · "Upcoming / due soon" has no warning window
- **Evidence:** `analyzeMaintenanceScheduleRow` (`packages/finance-core/src/maintenanceOverdueDetails.ts:43-95`) only marks an item once odometer ≥ next due or today ≥ due date.
- **Fix:**
  - Add org settings `due_soon_km` (default **1,000**) and `due_soon_days` (default **14**).
  - **Overdue** = past due. **Due soon** = inside the window. **OK** = everything else.
  - Show a **projected due date** for km-based items, using the car's average km/day over the last 30 days of trusted readings.

### L-12 · Medium · Nothing records that something happened
- **Evidence:** saves write tables directly. There is no event row for "odometer recorded", "service logged" or "became overdue", so nothing can react later (alerts, driver notice, telematics).
- **Fix:** add the outbox table `fleet.maintenance_events (id, organization_id, vehicle_id, type, payload jsonb, occurred_at, processed_at)`.
  - Types: `odometer.recorded`, `service.logged`, `schedule.due_soon`, `schedule.overdue`.
  - Written inside the same transaction as the change (L-04, L-09).
  - Telematics later only adds rows with `source='telematics'`. Nothing else changes.

### L-13 · Medium · Logging reads vehicles through the KV store
- **Evidence:** the fleet summary reads every vehicle via `fromKvStore().like("key","vehicle:%")` and filters by org in JavaScript. The dialog-side helpers call `kv.get("vehicle:…")` (`maintenance_routes.ts:1233`, `:2524`, `:2580`). The relational table `fleet.vehicles` (2 rows) already exists.
- **Fix:** every maintenance route reads `fleet.vehicles` + `vehicle_current_odometer_v` + `maintenance_due_v`, with the org filter in SQL (RLS). There should be no `kv.get` / `fromKvStore` calls in maintenance.

### L-14 · High · A completed service can be edited or deleted with no history *(Rev 2)*
- **Evidence:** `PATCH` (`maintenance_routes.ts:1690`) and `DELETE` (`:1969`) on `/maintenance-logs/:vehicleId/:id` change or remove a completed service. There is no history row and no reason. Service history (Stitch Screen 10) carries an **"Immutable Ledger"** chip, and that chip would be false.
- **Fix:**
  - Completed work-order lines can't be updated or deleted. A trigger on `maintenance_work_orders` / `_lines` refuses both once the status is `completed`.
  - The only correction is **Void with reason**. It sets `voided_at`, `voided_by` and `void_reason`, reverses the finance posting, recomputes the schedule (L-07), and writes `fleet.maintenance_audit_log (who, when, before jsonb, after jsonb, reason)`.
  - To change a wrong value, void the service and log it again.
  - Service history hides voided lines by default, with a "Show voided" toggle.

### L-15 · Medium · The screens show data the database doesn't hold yet *(Rev 2)*
- **Evidence:** fields on the Stitch screens with no source today. Checked against live columns on 1 Nov 2026: `fleet.vehicles` has `vin` but no unit id or home base; `fleet.odometer_readings` has `is_anomaly` / `is_verified` but no reason or verifier; `maintenance_work_order_lines` already has `values_json`, `condition`, `part_number`, `brand`, `material`; `maintenance_service_categories` already has `code`, `op_code`, `description`, `fleet_tip`.
- **Fix:** add only these columns. Each is nullable, and the screen hides the element when the value is empty:

| Table | Column | Shown on |
|---|---|---|
| `fleet.vehicles` | `fleet_unit_id text` ("TR-19-KGN") | Screen 1 under the name, Screen 2 footer "Vehicle ID" |
| `fleet.vehicles` | `home_base text` ("Kingston Bay #04", "KGN-HUB") | Screen 2 footer, Screen 6 note label, Screen 12 card |
| `fleet.odometer_readings` | `anomaly_reason text`, `verified_by uuid`, `verified_at timestamptz` | Screen 9 reason line, "Marked verified by …" |
| `public.maintenance_service_categories` | `overdue_effect text` ("Air intake throttled") | Screen 2 overdue badge |
| `public.maintenance_task_templates` | `is_mandatory boolean default false` | Screen 5 "Mandatory" |
| `public.maintenance_work_orders` | `log_number text unique` (`LOG-2026-000123`, from a sequence), `idempotency_key` (L-04), `voided_*` (L-14) | Screen 6 header, Screen 11 save-failed card |
| `fleet.maintenance_job_runs` | (new, L-09) | Screens 1, 2, 10, 11 |

  Measurements ("3.2 mm remaining", "12.6 V", "fluid clarity 94%") go in the existing `values_json` of the line, as `{ "measure": { "value": 3.2, "unit": "mm", "label": "remaining" } }`. No new table.

---

## 4. UI/UX — logging screens

### 4.1 Add Service Log dialog (screenshot 1)

| # | Issue | Fix |
|---|---|---|
| U-01 | No car, date or odometer on the first step | Header with vehicle and odometer, plus a new first step (L-02) |
| U-02 | Package card shows an internal id: "SERVICE PACKAGE · **TPL 5EFCDC04**" (`LogMaintenanceServiceDialog.tsx:1131`) | Show the interval and state instead: "Every 5,000 km or 3 months · **Overdue**" / "Due in 820 km". Never show ids |
| U-03 | One package card on a 4-column grid; 3 empty slots | List every package that applies to this car (global + catalogue templates merged), most-due first, due ones highlighted |
| U-04 | **Tires & wheels** and **Brakes** use the same circle icon; Engine looks like Fluids' droplet | One distinct icon per system in `apps/fleet/src/constants/maintenanceCategoryIcons.ts` |
| U-05 | 11 system tiles and no search | Search box above Quick jobs that matches components across all systems ("oil", "pads", "wiper") and jumps to the line form |
| U-06 | Tiles give no hint of what's due on this car | Red/amber dot + "2 due" on any system with overdue / due-soon rows (from `maintenance_due_v`) |
| U-07 | Three names for one action: "Log new service", "Add Service Log", "Save Log" | One verb everywhere: **Log service** |
| U-08 | Save can be clicked twice while the first save is still running | The button shows a spinner and stays disabled until the response; the idempotency key (L-04) covers retries |
| U-09 | Odometer field gives no context | Under the field: "Last trusted reading 195,192 · 31 Oct · fuel". Show the "Check reading" label inline when L-03 flags it |

### 4.2 By vehicle tab (screenshot 2, circled)

| # | Issue | Fix |
|---|---|---|
| U-10 | "Next due (km) 128,000" on a car at 195,192 | **Next due** column: "Oil & filter — overdue 64,692 km" or "in 820 km · ~6 Nov" (from L-10, L-11) |
| U-11 | "Overdue: 209 d · 64,692 km" mixes two units in one cell | Merge into the Next due cell; sort Overdue → Odometer needed → Due soon → OK |
| U-12 | Odometer "0" for a car with no reading | "—" + **Odometer needed** pill + **Log odometer** button (L-08) |
| U-13 | Odometer has no age or source | Small line under the number: "2 h ago · fuel" |
| U-14 | "Schedule rows" is an internal count | Replace with **Last service** (date · km) |
| U-15 | Services due hidden behind an eye icon | Count as a red/amber pill; click lists each due component |
| U-16 | "+ + Log new service": the icon and text both show a plus | Icon + "Log service" |

### 4.3 Service ledger tab (circled)

| # | Issue | Fix |
|---|---|---|
| U-17 | "Service ledger" reads as money; its own copy says "Not expense books" (`MaintenanceServiceLedgerPanel.tsx:111`) | Rename the tab to **Service history**, and rename **By vehicle** to **Overview** |
| U-18 | It mixes "still due" and "done" in one panel | **Service history** = completed lines only (from the L-06 view), with filters for vehicle, component and date, plus CSV export. "Still due" lives only on By vehicle / Overview |
| U-19 | Shows 2 ledger rows for 1 real service (the L-04 duplicate) | Fixed by L-04 + L-06 (the view only reads completed, non-cancelled work orders) |

### 4.4 Stitch screens to build

Prompt: `docs/stitch/fleet-maintenance-logging-prompt.txt`. Export (the spec): `docs/stitch/roam-fleet-app/maintenance-logging/`. The element-by-element port plan is **§8**; the U-items above are done when §8 is done.

| Screen | What it is | Covers |
|---|---|---|
| 1 | Overview tab (was By vehicle) | L-08, L-09 (nightly line), L-10, U-10…U-16, U-17 |
| 2 | Due items drawer for one car | L-10, L-11, U-15 |
| 3 | Log service — which car? | L-02 |
| 4 / 4b / 4c | Log service — date and mileage; check-reading box; empty odometer | L-01, L-02, L-03, U-01, U-09 |
| 5 | Log service — what was done? | U-02…U-06 |
| 6 | Log service — details per line (unchanged + car header) | L-02 |
| 7 / 7b | Log service — review and save; saving state | L-04, U-07, U-08 |
| 8 | Log odometer dialog | L-08, L-03 |
| 9 | Odometer history drawer (clear or void a "Check reading") | L-03, L-05 |
| 10 | Service history tab (was Service ledger) | U-17, U-18, U-19 |
| 11 | States (loading, nightly check missed, save failed, empty, no plan, no permission) | L-04, L-09 |
| 12 | Phone (390px) | all |

Screens 1–12 show backend results (per-part due state, current odometer, nightly-run line, single save). Those need L-01…L-15 to be live first, or the screens will show today's wrong numbers (see §8.3).

---

## 5. Build order

**Step 1: trustworthy odometer.** L-01, L-05, L-03, L-02, U-01, U-09.
*Done when:* a service can't be saved without an odometer; the hub, dialog and digest all read `vehicle_current_odometer_v`; a high anomaly doesn't move the current odometer; a back-dated service saves.

**Step 2: one save, one record.** L-04 (+ clean-up), L-06, U-07, U-08, U-19.
*Done when:* a double-clicked save creates one work order and one finance posting; the ledger is a view.

**Step 3: true next due.** L-07, L-08, L-10, L-11, L-13, U-10…U-16.
*Done when:* the Fit shows Odometer needed; the Roomy lists every overdue component with correct km; recompute = stored on every row.

**Step 4: nightly check.** L-09, L-12.
*Done when:* a `maintenance_job_runs` row appears every day; alerts appear in the bell once per item per day.

**Step 5: lock and extend the data.** L-14, L-15.
*Done when:* a completed service can only be voided (with a reason); every column in the L-15 table exists.

**Step 6: Stitch port.** All 12 screens, in the order of §8.3 (this replaces the U-items as separate work).

---

## 6. Checks to add

1. **API:** missing or 0 odometer → 400 `odometer_required` on every save path.
2. **Odometer:** a back-dated service below today's reading saves without a label when it fits its date neighbours; a reading that breaks them saves with `is_anomaly = true`; an anomaly higher than all other readings doesn't change `vehicle_current_odometer_v`.
3. **Idempotency:** the same `idempotencyKey` twice → one work order, one finance row.
4. **Parity:** SQL `recompute_maintenance_schedule` vs `packages/finance-core/src/maintenanceScheduleEngine.ts` on the same fixtures.
5. **Due window:** unit tests for Overdue / Due soon / OK at the km and day boundaries, and for "no odometer".
6. **Nightly SQL checks (alert on any row):** schedule row ≠ recompute; a work order `in_progress` for more than 1 day from the log path; a completed work order with cost > 0 and zero or several finance postings; a vehicle with schedule rows but no trusted reading in 7 days; no `maintenance_job_runs` row for today.

---

## 7. Live data (31 Oct 2026)

| Item | Value |
|---|---|
| Odometer readings | 587, all Roomy: fuel 550 (**89 flagged anomaly**), check-in 33, service 3, manual 1 (voided) |
| Honda Fit `1505LM` | 0 readings; 25 component rows with bootstrap "last performed" |
| Toyota Roomy `5179KZ` | current 195,192; last service 123,000 (6 Jan 2026); schedule rows say 121,952 / 128,000 |
| Duplicate work order | `d3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a` `in_progress`, duplicate of `9a0e45b7…` |
| Nightly job | none in `cron.job` |
| Service stored in | `maintenance_records` 1 · `fleet.maintenance_logs` 1 · work orders 2 / lines 2 · `maintenance_service_ledger` 2 |
| VIN (1 Nov) | both cars have one: 5179KZ `M900A0344862`, 1505LM `GP51327108` |
| Inspection templates (1 Nov) | 10 templates with items, 1–3 items each (not "24-point") |
| Stitch screens built in app (1 Nov) | 0 of 12 |

---

## 8. Stitch port plan (Rev 2)

**Spec:** `docs/stitch/roam-fleet-app/maintenance-logging/<screen folder>/code.html` + `screen.png`. Port the layout, text, order, spacing, icons and states exactly. Use the Material Symbols names in each `code.html` (e.g. `oil_barrel`, `tire_repair`, `motion_photos_on`) so the icons match.

**Done for a screen** = a side-by-side screenshot of the app and `screen.png` at 1600 px wide (390 px for Screen 12), every row of that screen's table present and showing real data, and dark mode working.

### 8.1 Rules for the whole port

These rules decide every element that isn't a normal feature. Each has a single answer.

1. **The app shell isn't part of this port.** That means the black top bar, the nav row, the dark search bar and the page footer. The 12 screens contradict each other here: Screens 1, 2, 3, 8, 9, 10 and 11 use the real nav, while Screens 4–7 use an invented one ("Inventory & Parts · Telemetry & Diagnostics · Work Orders", "TELEMETRY GATEWAY: CONNECTED"). The shell is shared by every page in Fleet. Keep the app's current shell, including the org chip "DE · Deeki T · platform" in place of "Kingston Hub #01".
2. **What's behind a dialog or drawer is Screen 1.** The grey content behind every dialog and drawer is Stitch filler ("Nissan NV200 8823HY", "148 Active Fleet Units", "Telemetry Accuracy 99.4%", "Scheduled PM Inspections", "Hub Fleet Asset Register"). It's never built. The real Overview page shows behind.
3. **Stitch preview controls aren't features.** These only switch between or describe states:
   - the "Primary Form | 4b: Check reading | 4c: Empty validation" switch (Screen 4)
   - "Screen Mode: State 7a / 7b" (Screen 7)
   - on Screen 11: the "SPEC-11 · STATE MATRIX" sheet header, the "SPEC 02.A…" labels and their meta rows, the "Idempotent Retries Active" / "Offline Fallback Ready" chips, and the "State Engine Health & Edge Fallback Policies" panel
   - on Screen 12: "VIEWPORT 390 × 844", the "FRAME 1/2" labels and the bottom spec strip

   Build the states they show, not the controls.
4. **Never claim telematics or sensors.** There are none (telematics is Coming soon). Any label that says telemetry, sensor or prediction keeps its position and style, but shows the manual-data equivalent named in the tables below.
5. **Every number is real.** Sample values in Stitch (counts, km, dates, costs, codes, part numbers) are replaced by live data from the views in §3. When the data doesn't exist for a car, the element is hidden, not faked.
6. **Parts stay information only.** Part numbers and "verified fit" come from the Dominion parts catalogue. No stock, supplier, quote or order is shown anywhere in this flow.

### 8.2 Screen by screen

#### Screen 1 · Overview tab — `fleet_maintenance_overview`
Today: partly exists as the "By vehicle" tab. Fidelity is about 20%: the table and header differ, and the KPI cards, explainer cards and footer strip are missing.

| Element on screen | Build it as |
|---|---|
| Title row: orange wrench tile, "Fleet maintenance", sub-line "What each car is due for, what was done, and parts for your cars." | Replace today's title and sub-line |
| Buttons in order: Refresh · Bootstrap schedules · Compatible parts · **+ Log service** (black) | Reorder; one plus icon (U-16); Log service opens Screen 3 |
| Nightly line: green dot · "Nightly check ran 02:00 today · 2 cars checked · **3 alerts flagged**" (alerts in red) | From the latest `maintenance_job_runs` row (L-09); red dot + the Screen 11 banner when it's missing |
| KPI **OVERDUE SERVICE** "1 unit (critical)", red bar | Cars whose worst status is Overdue; bar = that ÷ all cars |
| KPI **TELEMETRY MISSING** "1 pending manual input" | Rule 4: cars with **no trusted reading in the last 7 days** (`vehicle_current_odometer_v`); bar = that ÷ all cars; label kept |
| KPI **NEXT SCHEDULED WINDOW** "Today · Kingston Bay #03" | Earliest projected due date across the fleet (L-11) in words ("Today", "Tomorrow", "6 Nov"); grey text = that car's `home_base`, else its plate; bar = days until it ÷ 30 |
| KPI **PARTS REQUISITION** "Ready · Filters / Synthetic 5W-30" | Rule 6: "Ready" when every overdue / due-soon item has a matched catalogue part, else "Needs part numbers"; grey text = the part names; bar = matched ÷ due items |
| Tabs: **Overview** + count "2" · Service history · Find parts | Count = cars Overdue or Odometer needed; icons as Screen 1 on every screen |
| Card "Vehicle Service Ledger" + chip "Sorted by urgency" + search "Filter plate or model…" | Search filters by plate / make / model as you type |
| Columns: VEHICLE · PLATE · ODOMETER · STATUS · NEXT DUE · DUE ITEMS · LAST SERVICE · ACTIONS | U-10…U-15 |
| Vehicle cell name + "Fleet ID: #TR-19-KGN" | `fleet_unit_id` (L-15); hidden when empty |
| Odometer "195,192 km" + "2 h ago · fuel fill log" | `vehicle_current_odometer_v`; fuel → "fuel fill log", checkin → "check-in", service → "service log", manual → "manual entry" |
| Status pill "Overdue · Oil & filter" (alert icon) / "Odometer needed" (gauge icon) | L-08, L-10 |
| Next due "Oil & filter — overdue 67,192 km" + "and 1 more overdue schedule" | L-10 |
| Fit: "Log an odometer reading to see km-based items" + "Time-based check due in 14 days" | Second line = nearest date-based item |
| Due items "● 2 overdue" + "1 due soon" | Click opens Screen 2 |
| Last service "6 Jan 2026 · 123,000 km" / "Never serviced" | Latest completed, non-voided work order |
| Actions: "Log service" + "⋯"; Fit: black "Log odometer" + "Log service" | "⋯" = Log odometer, Odometer history |
| Footer "Showing 2 of 2 fleet registered assets" · "● Kingston Main Depot Bay 01/02 Synchronized" · "Go to Vehicles ›" | Sync text = "<org name> Synchronized" with the time of the last data load |
| Card **Automatic Diagnostic Polling** | Title and icon kept; text: "The nightly check scans odometer logs from driver shifts and fuel receipts daily at 02:00 EST. An alert is raised for every item past its limit." (Rule 4: no instant work orders exist) |
| Card **Jamaica Parts Cross-Compatibility** | Kept as written; links to Find parts |

#### Screen 2 · Due items drawer — `fleet_maintenance_due_items_drawer`
Today: doesn't exist (the eye icon opens a small list).

| Element | Build it as |
|---|---|
| Header: name + plate chip; "195,192 km · 31 Oct 2026 · fuel"; "Checked by the nightly check at 02:00 today"; ✕ | L-05, L-09 |
| Tiles **CRITICAL** 2 · **IMPENDING** 1 · **COMPLIANT** 22 | Overdue / Due soon / OK counts from `maintenance_due_v` |
| "Overdue 2 · Immediate maintenance required"; card: icon, name, "Interval: Every 5,000 km or 3 months", "Last done: 6 Jan 2026 at 123,000 km", "Log this" | — |
| Red bar "Overdue 67,192 km · 208 days" + tag **CRITICAL** | "CRITICAL" when overdue by more than one full interval (km or time), else "OVERDUE" |
| Tag **AIR INTAKE THROTTLED** | Component `overdue_effect` (L-15); falls back to CRITICAL/OVERDUE |
| "Due soon 1 · Schedule for next hub window" | — |
| "Wear sensor threshold: 3.2mm remaining" | Rule 4: label **"Last measured:"** + latest measurement in `values_json` with its date; hidden when none |
| Amber bar "Due in 820 km · about 6 Nov" + **NEXT 4 OPERATING DAYS** | Days = km left ÷ 30-day average km/day (L-11) |
| "OK 22 · Verified compliant · Show" + chips "+18 more"; expanded rows | One detail per row, first that exists: latest measurement → "Inspected <date>" → "Replaced <n> km ago" → "Good for <n> km" |
| Footer "Vehicle ID: V-5179KZ-JM" · "Kingston Fleet Bay #04" · black "+ Log service for this car" | `fleet_unit_id` (else plate), `home_base` |
| "Log this" → dialog **Record Maintenance Event**: pre-selected item ✓, Service Odometer (KM), Date Conducted, Hub Technician / Bay Notes, Cancel · **Save & Reset Interval** | Quick log through the same single call (L-04): odometer required (L-01), checked (L-03), recompute (L-07); one line, action Replaced; "Reset interval" = the L-07 recompute |

#### Screen 3 · Which car? — `fleet_maintenance_log_service_which_car`
Today: doesn't exist.

| Element | Build it as |
|---|---|
| "Log service" / "Which car was serviced?" / ✕; search with "ESC" | Esc clears, second Esc closes |
| Car cards: radio, tile, name + plate chip, "195,192 km · 2 h ago · fuel", due pills / "Odometer needed"; selected = black border + check | — |
| Tip "Logging service automatically recalculates service intervals for every component on the selected vehicle." | True once L-07 is live |
| Cancel · **Continue →** (disabled until a car is picked) | — |

#### Screen 4 · Step 1 date and mileage (+ 4b, 4c) — `fleet_maintenance_log_service_step_1_date_mileage`
Today: date and odometer are on the last step; odometer is optional (L-01, L-02).

| Element | Build it as |
|---|---|
| Black car strip: icon, "Toyota Roomy 2019 · 5179KZ", "Current 195,192 km · 31 Oct · fuel", ✕ | On every step |
| Step bar 1 Date & mileage · 2 Work done · 3 Details · 4 Review (done = black check, active = black dot) | — |
| "When and at what mileage?" / "We use this to work out when each part is due next." | — |
| Date of service · Odometer (km) * with "km" prefix, right-aligned mono; "Last trusted reading …"; info "Logging an older service?…" | Prefilled from L-05 |
| **4b** "Expected: ~123,100 km for this time period" + amber "Check reading" box, neighbours, Fix the number · Keep it and continue | Expected = straight-line estimate between the two neighbouring trusted readings (L-03); hidden with only one side |
| **4c** red field "Enter the odometer reading"; info "Odometer reading required. The mileage log correlates predictive oil lifecycle…" | Rule 4: second sentence = "The mileage log sets the oil and timing chain intervals for this engine series." |
| Cancel · **Continue →** | — |

#### Screen 5 · Step 2 what was done? — `fleet_maintenance_log_service_step_2_what_was_done`
Today: the pick step exists (screenshot 1), with fidelity about 30%.

| Element | Build it as |
|---|---|
| Eyebrow "SERVICE LOG WIZARD", "What was done?", chip "VIN: M900A-0129482" | `fleet.vehicles.vin`; hidden when empty |
| Search with ESC; panel "Suggested Operations": icon · name · "— system" · "Due" · → | This car's due items first, then text match on category `name` / `plain_name` |
| "Service packages · Sorted by operational priority" | Overdue → Due soon → OK, then km left |
| Card: state tag + icon, name, interval, right text "+820 km past" / "Mandatory" / "In 420 km", "+" | From `maintenance_due_v`; "Mandatory" when `is_mandatory` (L-15) and due; no template ids |
| "Quick jobs · Pick a part of the car, then a component." 11 tiles with the `code.html` icons and sub-lines ("Air, cabin, fuel"…) | Sub-line = system `description`, else first three child names; due tiles show "1 overdue" / "1 due soon"; labels "Lighting & vis.", "Suspension" |
| "Open digital inspection" + chip "24-point" + **Launch ›** | Chip = real item count of the car's template (today 1–3) |
| ← Back · "Step 2 of 4" · **Continue to Details →** | — |

#### Screen 6 · Step 3 details — `fleet_maintenance_log_service_step_3_line_details`
Today: one line at a time ("Save line"). Fidelity is about 10%.

| Element | Build it as |
|---|---|
| "Log service · Bay Session #LOG-2023-994" | Number = `log_number` (L-15), reserved when the dialog opens |
| "Service line details — Basic Service", sub-line, chip "● Basic Service (3 components selected)" | — |
| One card per line, black left edge; eyebrow "ENGINE SYSTEM / LUB-01"; name; helper ("Viscosity: 0W-20 / 5W-30 Rec.") | Eyebrow = system / component `code`; helper = `fleet_tip`, else `description` |
| Action segmented Replaced · Inspected · Topped up | From the component's `field_schema`; saves `action` |
| "Specification / Grade: Synthetic 5W-30 (3.1L)" (tune icon) | Saves `material`; prefilled from the car's catalogue oil spec |
| "Part matched (OEM): Toyota 04152-40060 ✓ Verified fit (1KR-FE)" | Rule 6: Dominion fitment for car + component → `part_number`, `brand`, `part_id`; "Verified fit" only when verified, else amber "Fit not verified"; none = "No matched part" + free text |
| "Cost (JMD landed)" · **✓ Save line** per card | — |
| "3 lines configured · ALL OEM MATCH CRITERIA CLEARED · Subtotal J$ 10,700" | Else "<n> LINES WITHOUT A VERIFIED PART" in amber; never blocks |
| "Mechanic Note / Work Order Reference" + "Optional · Kingston Bay #04" | "Optional · <home_base>", else "Optional" |
| ← Back · **Continue to review →** | — |

#### Screen 7 · Step 4 review (+ 7b) — `fleet_maintenance_log_service_step_4_review_and_save`
Today: the review step exists, with fidelity about 25%.

| Element | Build it as |
|---|---|
| "Review and log" / "Verify recorded service details before committing to the vehicle ledger." | — |
| SERVICE DATE · RECORDED ODOMETER · Edit ✎ | Back to Step 1, lines kept |
| Invoice row: "Scan invoice / receipt", "● Uploaded", filename · size, view, download | Existing evidence upload |
| "TASK & PARTS REQUISITION · COST (LANDED)": icon, name, "REPLACED" chip, "· Synthetic 5W-30 Premium", J$ | Detail = `material`, else "brand part_number" |
| Service provider (tick icon) · Currency "JMD (Jamaican Dollar)" | Autocompletes from this org's past providers; tick when it matches one |
| TOTAL; "What happens next" two cards | Preview from the L-07 function, not saved |
| ← Back · **Discard draft** · **✓ Log service** | Draft kept in browser storage per user + vehicle; Discard clears it and closes |
| **7b** body 60% opacity, "Logging…" spinner, disabled | U-08 |

#### Screen 8 · Log odometer — `fleet_maintenance_log_odometer`
Today: doesn't exist.

| Element | Build it as |
|---|---|
| Car card "Honda Fit 2018", plate, "· Chassis #GK3-3209", chip "● No reading yet" | Chassis = `vin`; chip = age of last reading when one exists |
| "Date and time" + "Eastern Standard Time" | Default now |
| "Odometer *" + "Initial cluster verification" (first reading only), mono input + "KM" | Required > 0; L-03 |
| Info "This is the car's first reading…" (first reading only) | — |
| "Photo of dashboard (optional)" + "Cluster proof", PNG/JPG up to 10MB | `uploadEvidenceFile` |
| Cancel · **✓ Save reading**; toast "● Reading saved · 1505LM now 84,210 km" | `source='manual'` + `odometer.recorded` (L-12) |

#### Screen 9 · Odometer history — `fleet_maintenance_odometer_history_drawer`
Today: doesn't exist.

| Element | Build it as |
|---|---|
| Header + "Odometer history & verified readings log" | — |
| CURRENT ODOMETER card + chip "Telemetry Verified"; "Latest trusted reading · …"; "+3,470 km past 30 days"; "Sampling avg 115 km/day" | Rule 4: chip = **"Trusted reading"**; the others are real calculations |
| "AUDIT STREAM FILTER · Total: 587 logs"; pills All · Check reading · Fuel · Check-in · Service · Manual; "SEQUENTIAL MILEAGE RECORD · Order: Descending" | — |
| Row: date, source chip, "● Trusted" / "⚠ Check reading", reading, context line | fuel_entry → "<litres> L <grade> · <station>"; checkin → "Shift departure · <location>"; maintenance_log → "<log_number> · <work> · <provider>"; manual → "Manual · <user>" |
| "(-3,158 km jump backward)"; "Driver entry mismatch flag"; ✓ It's correct · ⊘ Void | Jump vs previous trusted reading; reason = `anomaly_reason` |
| Void → reason select + Confirm · Cancel → "Voided" | `is_voided`, `void_reason` |
| It's correct → "Accepted" + "Marked verified by <name>" | `is_anomaly=false`, `is_verified=true`, `verified_by`, `verified_at` |
| Note "Validation Rule Enforced — … never used as the active odometer calculation base." · Export CSV · **Close drawer** | True once L-05 is live |

#### Screen 10 · Service history — `fleet_maintenance_service_history_tab`
Today: the "Service ledger" tab exists, with fidelity about 15%.

| Element | Build it as |
|---|---|
| Title chip "AUDIT CONSOLE" | — |
| Strip: nightly line · "🛡 Log integrity: Verified · Kingston Operational Depot" | Verified = last night's drift check (§6 item 6) found 0 rows, else "<n> issues" in red; place = org name |
| "Maintenance Audit Trail" / "Every service that was done, one line per part." + "Immutable Ledger" | Chip true only after L-14 |
| Filters VEHICLE · PART · TIMELINE · KEYWORD · Export CSV | U-18 |
| Columns DATE · VEHICLE (+plate) · PART · ACTION · ODOMETER · PROVIDER · COST · INVOICE | One row per completed, non-voided line (L-06) |
| "Completed service lines only. Pending schedule work orders are quarantined to the Overview tab." + "Subtotal: J$ … (n parts logged)" | Subtotal of the filtered rows |
| "Showing 1–4 of 4 completed lines" · Previous · 1 · Next | 25 per page |
| Strip "● Systems Operational / Latency: 24ms / Kingston Edge Node #01 / America/Jamaica (EST) / Roam Maintenance OS v3.18.4" | Real only: API health route, last measured round-trip, Supabase region, app build version |

#### Screen 11 · States — `fleet_maintenance_states_loading_error_empty_no_permission`
Rule 3 applies: build the six states, not the specimen sheet.

| State | Build it as |
|---|---|
| Red banner "Nightly check didn't run last night." · "Due items may be out of date across fleet asset registries." · "SYNC REF #ERR-8041" · "● Last automated attempt: 03:14 AM EST" · **Run now** | On all three tabs when there's no successful run today; ref = short id of the last run; Run now = a manual run (admin only) |
| Overview skeleton + "Fetching 184 assets…" | Count = vehicles being loaded |
| Dialog skeleton "Step 2 of 4" + "Job package and task templates initializing from Jamaican OEM catalog…" | While templates load |
| Save failed: "Log 90,000 km Scheduled Service", car; SERVICE TECH · LOGGED LANDED COST · IDEMPOTENCY KEY; red "Couldn't log this service. Nothing was saved. Try again." + detail + **Try again**; "🔒 Retry keeps the same request so a retry never logs twice." | Title = "Log <package or first line>"; SERVICE TECH slot shows the **service provider** (the flow has no technician field); key = L-04 key; detail = server error; draft kept |
| "No cars yet" + Go to Vehicles; footnote "…CSV or telematics API appear immediately." | Rule 4: "Cars added in Vehicles appear here immediately." |
| No plan (Screen 2 row) | — |
| No permission: "SECURITY POLICY · TIER 2 FLEET OPERATOR", "Maintenance Access Restricted", ← Return to Dashboard, ✉ Request Dispatch Role; "Active User: … · IAM_ROLE: …" | Eyebrow and footer = the user's real role; Request = in-app notification to the org's fleet admins |

#### Screen 12 · Phone 390 px — `fleet_maintenance_phone_390px_mobile_experience`

| Element | Build it as |
|---|---|
| Phone header, bell, menu; bottom nav Maintenance · Vehicles · Parts · Orders | Rule 1: app shell, not ported |
| "● Nightly check ran 02:00 · Jamaica UTC-5" | — |
| Tabs Overview (2) · Service history · Find parts · "Sched…" | Three tabs. The cut-off "Schedule" tab has no desktop screen and belongs to `fleet-maintenance-enterprise-audit.md` §5.2 |
| "PRIORITY VEHICLES (2) · Sorted: Urgency" | — |
| Car card: name, status, plate + "KGN-HUB", "Next due …", "Telemetry synced 195,192 km · 2 h ago · fuel", pills "+3 inspected", **Log service** | `home_base`; Rule 4: "Telemetry synced" → "Last reading"; "+n inspected" = OK items last action Inspected in 30 days |
| Fit card: "Last reported: — · No reading yet", **Log odometer** + Log service | — |
| "Hub 01 Compliance · 87.4% up to spec ›" | "<org name> Compliance"; % = due rows not Overdue; opens Screen 1 sorted by Overdue |
| Sheet: Back · Log service · ✕; black car strip; "Step 1 of 4: Date & Mileage · 25% complete" + bar | — |
| "1. VERIFIED BASELINE" date + odometer (Required) | — |
| "2. SERVICE PACKAGES · Tap to apply" cards with description and "J$ 4,500"; "QUICK-JOB CATEGORIES" rows; "Service Notes (Optional)" | The phone keeps the four desktop steps: packages and quick jobs are Step 2, notes Step 3. Description = template `description`; price = this org's **average logged cost** for that package in the last 12 months, hidden when none |
| Sticky Cancel · **Continue →** | — |

### 8.3 Port order

The screens show numbers the backend doesn't produce yet. Port in this order so no screen ever shows a fake or wrong value:

1. §5 Steps 1–5 (L-01…L-15).
2. Screens 4, 3, 5, 6, 7 (the dialog), then 8.
3. Screens 1, 2, 9.
4. Screens 10, 11.
5. Screen 12 last, from the finished desktop components.

**Check after each screen:** side-by-side screenshot with `screen.png`, every row in its table ticked, light + dark, and fleet `tsc` no worse than the baseline.
