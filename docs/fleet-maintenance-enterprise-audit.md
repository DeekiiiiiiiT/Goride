# RoamFleet Maintenance — Enterprise Audit

**Rev 2 · 31 Oct 2026 (evening)** · Audit only — no code was changed.
**Scope:** the whole Maintenance section (`Vehicle Operations → Maintenance`): By vehicle, Service ledger, Find parts (only where it touches maintenance), Add Service Log dialog (every step), Bootstrap schedules, driver service requests, the overdue digest, the odometer feed, and the database behind them.
**Lens:** systems architect + UI/UX lead + senior developers.
**Telematics:** out of scope. It stays **Coming soon** (see §6.4 for the slot it plugs into later).
**Checked against:** the code in this repo, the live GoRide database (read-only queries on 31 Oct 2026), and two screenshots of `localhost:3000/maintenance` (hub + Add Service Log dialog, 31 Oct 2026).

### What changed in Rev 2
- Re-checked every Rev 1 finding against code and live data: **all 18 are still open** (no maintenance code changed since Rev 1; same 2 work orders, no cron job, 0 inspection findings, 0 Fit odometer readings).
- Mapped the new **"No-Telematics Phase 1"** guide (manual odometer, nightly rules engine, table separation, event bus) onto this system — §2.1.
- New findings: **M-19** odometer is optional on a service log (0 is saved), **M-20** the "current odometer" is the highest reading ever, including readings flagged as anomalies, **M-21** the dialog asks for odometer last, **M-22** nightly job is per vehicle, must be per task.
- **M-16 corrected:** Rev 1 said "refuse a completion odometer below the latest reading". That would block back-dated services (e.g. the Roomy's 6 Jan service typed in today). The check is now against readings **around the service date**.
- Dialog UX findings from the new screenshot: **U-15 – U-22**.
- §6.1 corrected: the maintenance tables live in **`public`**, not `fleet` (only `fleet.maintenance_logs` and `fleet.odometer_readings` are in `fleet`).

---

## 1. Verdict

**Current level: 2 of 5 ("Recorded and scheduled").** Target: **Level 4 ("Managed")**. Level 5 ("Predictive") needs telematics and a year of clean data, so it stays later.

| Level | Name | What it means | You today |
|---|---|---|---|
| 1 | Logbook | Services typed in after the fact | ✅ |
| 2 | Recorded + scheduled | Catalogue intervals, per-vehicle schedule, overdue status, cost posts to finance | ✅ mostly — but the status numbers are wrong in places (§3) |
| 3 | Operational | Work orders with a real lifecycle, inspections that raise defects, driver requests triaged, alerts that actually fire, vendors | ❌ The tables and routes exist; the screens and workflow do not |
| 4 | Managed | KPIs (cost/km, downtime, on-time PM %), audit trail, approvals by amount, parts used from stock, warranty, one source of truth | ❌ |
| 5 | Predictive | Condition-based triggers from telematics, failure prediction | ❌ Coming soon |

**The good news:** the hard backend pieces are already there — work orders, work-order lines, inspection templates (11) and items (17), inspection findings, parts usage, warranty claims, a service ledger, component (per-corner) schedules, catalogue templates from Dominion, a canonical odometer feed (587 readings from check-ins, fuel, manual and service), and finance posting. You are not building Level 3 from scratch. You are **finishing and wiring** what exists.

**The bad news:** the screen in the screenshot is lying in two of its two rows (§3, M-01 and M-03), the overdue alert job does nothing (M-05), and "a service happened" is stored in four different places (M-04). Those must be fixed before adding anything new, or every new feature inherits wrong numbers.

---

## 2. What to take from the pasted blueprint (and what to drop)

The blueprint is a good **map of capabilities**. Its **technology choices** are for a fleet of thousands of trucks with a platform team. You run on Supabase (Postgres + edge functions) with a small fleet. Use the same ideas with the tools you already have:

| Blueprint box | Keep the idea? | Build it as (in this repo) |
|---|---|---|
| Event Bus (Kafka / EventBridge) | ✅ idea | `fleet.maintenance_events` **outbox table** in Postgres + a trigger or edge worker. Telematics later writes rows to the same table. No Kafka. |
| Stream processing (Flink / Lambda) | ✅ idea | `pg_cron` job + the existing `fleet-ops` edge function. |
| API Gateway | ✅ already have | `fleet-ops` / `fleet-core` routes with `requireAuth`. |
| Microservices | ❌ | One **maintenance domain module** inside `_fleet-server` (split into files, §7). Separate deployables add cost, not value, at this size. |
| PM & Trigger Engine | ✅ — already exists | `packages/finance-core/src/maintenanceScheduleEngine.ts` + `maintenanceOverdueDetails.ts`. Needs fixes (M-01, M-03, M-09), not a rewrite. |
| Work Order Service | ✅ — tables exist | `maintenance_work_orders` + `_lines`. Needs a lifecycle + screens (M-06). |
| Vehicle Service | ✅ — exists | `fleet.vehicles` + Dominion catalogue. |
| Parts Service (inventory, reorder, POs) | ⚠️ later | `fleet.inventory` exists. Stock-out on work orders is Phase 4. **Find parts stays info-only** (no prices, suppliers, quotes or orders) until you launch selling. |
| Analytics & Predictive | ✅ analytics now, ❌ prediction later | SQL views over work orders. Prediction waits for telematics. |
| Data lake (S3), SageMaker, InfluxDB | ❌ | Not needed. Supabase Storage already holds invoices/photos. Time-series goes in a partitioned Postgres table when telematics arrives. |
| Technician mobile app | ⚠️ later | A mobile-friendly **Work order** screen in Fleet is enough until you employ in-house mechanics. |
| Driver portal (pre-trip inspection) | ✅ | Driver app already submits service requests and odometer at check-in. Add the DVIR (M-07). |
| Fuel card feeds | ✅ already have | Fuel odometer readings already feed the canonical odometer. |

**Rule for the whole build:** Postgres is the event bus, the work order is the source of truth, and everything else (schedule state, service ledger, alerts, KPIs) is **derived** from completed work orders + odometer readings.

### 2.1 The "No-Telematics Phase 1" guide, mapped to this system (Rev 2)

The guide is right about the **behaviour**: people are the odometer source, a nightly job finds what is due, and every completed service sets the next due point. Its diagram is a generic cloud stack. Here is each box, what exists today, and what to build.

| Guide says | What you have today | Build it as | Finding |
|---|---|---|---|
| Fleet manager web app (React/Next.js) | `apps/fleet` (React + Vite) | Same app | — |
| Driver / mechanic app (React Native), manual odometer | Driver app already records odometer at check-in (33 readings) and fuel (550 readings) | Add odometer to the DVIR and "Report a problem"; no separate mechanic app until you employ mechanics | M-07 |
| **Odometer mandatory on the service log** | **Not mandatory.** Blank → saved as **0** | Required field, first step of the dialog, prefilled from current odometer | **M-19, M-21** |
| `OdometerUpdated` event | `fleet.odometer_readings` (587 rows, sources fuel / checkin / service / manual) — written directly, no event | Every insert also writes `odometer.recorded` to `maintenance_events` | §6.3 |
| Asset service (vehicles + odometer) | `fleet.vehicles` (relational, 2 rows) **but** maintenance reads vehicles through the KV bridge | Read `fleet.vehicles` + `fleet.odometer_readings` directly | M-10 |
| Current odometer = last reading | Current odometer = **highest reading ever**, anomalies included | Latest trusted reading | **M-20** |
| Nightly rules engine (cron 2 AM) | `/maintenance/overdue-digest` exists, **no cron job**, writes 0 alerts | `pg_cron` at 07:00 UTC (02:00 Jamaica), reads `maintenance_due_v` | M-05, **M-22** |
| Rule `current_odometer >= next_due_km OR next_due_date <= today` per **vehicle** | Per schedule row, no look-ahead | Per **(vehicle × component × position)**, with due-soon window | M-09, **M-22** |
| Service completed → next due = odometer + interval | Schedule rows are written by several paths and drift | `recompute_maintenance_schedule(vehicle_id)` from completed work-order lines | M-03 |
| Separate tables: vehicles, schedules, work_orders, service_logs | **Too many**, not too few: 4 places store a service, 2 schedule tables, 2 compat views, an empty `explorer.odometer_reading` | One write path (work orders + lines), one schedule table, everything else a view | M-04 |
| API gateway (Kong / AWS) | `fleet-ops` / `fleet-core` edge functions with `requireAuth` | Keep | — |
| Event bus (Kafka / RabbitMQ) | None | `maintenance_events` outbox table in Postgres | §6.3 |
| Redis cache for status | None | **Not needed.** `maintenance_vehicle_status_v` view (indexed) answers in one query at this size | M-10 |
| S3 blob storage (inspections, receipts) | Supabase Storage via `uploadEvidenceFile` (invoice upload already works) | Keep; add inspection photos to the same bucket | M-07 |
| Notification service (alerts, email) | Notification bell exists; maintenance never writes to it | `maintenance_alerts` → bell now, email/WhatsApp Phase 3 | M-05 |
| Kubernetes / microservices | Supabase edge functions | Keep; split the 3,362-line file into modules | M-12 |
| Phase 2 telematics → TimescaleDB | — | Same `odometer_readings` table with `source='telematics'` (partition by month when it passes ~1M rows) + `maintenance_events` | §6.4 |

---

## 3. Findings

Severity: **Critical** = shows wrong numbers or loses/duplicates data · **High** = a core enterprise workflow is missing or broken · **Medium** = scale, consistency, UX · **Low** = polish.

Each finding has one fix.

### M-01 · Critical · Honda Fit shows "Healthy" with no odometer at all
- **Evidence:** screenshot row 1 — Odometer **0**, Status **Healthy**, Next due **5,000**, 25 schedule rows. Live DB: `fleet.odometer_readings` has **0 rows** for `1505LM`. All 25 `vehicle_component_schedule` rows have `last_performed_miles` filled in (`never_done = 0`), even though no service was ever logged for this car.
- **Why:** `maintenance-fleet-summary` (`maintenance_routes.ts:2330`) falls back to `metrics.odometer ?? 0`. With odometer 0 every km-based task looks far away, so the car is "Healthy". Bootstrap also writes a fake "last performed" baseline.
- **Fix:** When a vehicle has no odometer reading, its status is **"Odometer needed"** (grey, with a "Log odometer" action) and km-based rows are not evaluated; only date-based rows are. Bootstrap writes `last_performed_* = NULL` and a new column `baseline_source = 'bootstrap'` with `baseline_odometer` / `baseline_date`, so "never serviced" and "serviced" are different states.

### M-02 · Critical · One service created two work orders
- **Evidence:** live DB — two work orders for `5179KZ`, same date (2026-01-06), same odometer (123,000), same cost (J$16,800), created 3 seconds apart: `d3aaacdd…` stuck in **`in_progress`**, `9a0e45b7…` **`completed`**.
- **Why:** `LogMaintenanceServiceDialog.tsx:800-852` makes two calls (`createWorkOrder` then `completeWorkOrder`) and on *any* error falls back to `saveMaintenanceLog`. A retry or partial failure leaves an orphan, and the fallback can write the same service a second way.
- **Fix:** One server call — `POST /maintenance-work-orders` with `{ completeNow: true, idempotencyKey }` that creates, completes, advances the schedule and posts finance in **one database transaction** (Postgres function). Unique index on `(organization_id, idempotency_key)`. Remove the client fallback. Data clean-up: set `d3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a` to `cancelled` with reason `duplicate of 9a0e45b7`, and confirm only one finance posting exists for J$16,800.

### M-03 · Critical · The Roomy's schedule disagrees with its own history
- **Evidence:** live DB for `5179KZ`:
  - Only service on record: **2026-01-06 at 123,000 km**.
  - Package schedule row says last performed **2026-04-18 at 121,952 km** (later date, *lower* km), next due 126,952 / 18 Jul.
  - Component rows say next due **128,000** / 6 Apr.
  - Current odometer **195,192** (fuel reading, 31 Oct).
  - Screen: "Next due (km) **128,000**", "Services due **2**". A car ~67,000 km past its last service shows only 2 items due.
- **Why:** schedule rows are written by bootstrap and by several code paths, not recomputed from completed work. Each table drifts on its own.
- **Fix:** Schedule state is **derived**: for each (vehicle, task/component, position) the "last done" is the latest **completed work order line** for it; next due = last done + interval (or baseline + interval if never done). One Postgres function `fleet.recompute_maintenance_schedule(vehicle_id)` runs on every work-order completion, edit, delete and on bootstrap. A nightly check flags any row where stored ≠ recomputed.

### M-04 · Critical · "A service happened" is stored in four places
- **Evidence:** `public.maintenance_records` (1 row), `fleet.maintenance_logs` (1 row), `public.maintenance_work_orders` (2 rows) + `_lines` (2), `public.maintenance_service_ledger` (2 rows). Two schedule tables too: `vehicle_maintenance_schedule` (package) and `vehicle_component_schedule` (component). Hub status merges both (`maintenance_routes.ts:2339-2426`).
- **Fix:** **Work order + lines are the only write target.** `maintenance_service_ledger` becomes a view (or trigger-maintained projection) over completed lines. `maintenance_records` / `fleet.maintenance_logs` become read-only compat views for old readers, then are dropped after readers move. Keep **one** schedule table (`vehicle_component_schedule`, which already supports position) and express a "package" (e.g. Basic Service) as a group of components via `maintenance_package_categories`, which already exists.

### M-05 · High · The overdue alert job does nothing
- **Evidence:** `maintenance_routes.ts:3297-3361` counts overdue rows and returns `alertsWritten: 0` (hard-coded). It never writes an alert. No `cron.job` exists for it (live DB). It reads odometer from `vehicle.odometer` (not the canonical odometer the hub uses) and ignores component schedules. `docs/maintenance-overdue-digest-cron.md` says it posts alerts — it does not.
- **Fix:** Build the digest on the same derived view as the hub (§6.2, `fleet.maintenance_due_v`), write one row per (vehicle, task, day) into a real `fleet.maintenance_alerts` table (idempotent key already designed in that doc), show them in the notification bell, and schedule it with `pg_cron` daily at 07:00 UTC / 02:00 Jamaica (M-22). Email/WhatsApp to the fleet manager in Phase 3.

### M-06 · High · Work orders have no lifecycle and no screen
- **Evidence:** the only path creates a work order already `in_progress` and completes it immediately (M-02). There is no work-order list, no "open" state, no assignee, no shop/vendor, no "awaiting parts", no approval, no downtime. The hub has no Work orders tab.
- **Fix:** Add the lifecycle below and a **Work orders** tab (§5.3). "Log new service" stays as the fast path and simply creates a work order with `completeNow`.

```
draft ──► open ──► scheduled ──► in_shop ──► completed ──► closed (posted to finance)
  │         │          │            │
  └─────────┴──────────┴────────────┴──► cancelled (reason required)
                       in_shop ◄──► awaiting_parts
```
Required fields per state: `open` (vehicle, reported odometer, at least one line, priority) · `scheduled` (vendor or in-house, booked date) · `in_shop` (`off_road_at`) · `completed` (`back_on_road_at`, completion odometer ≥ last reading, actual cost per line, invoice photo when cost > 0) · `closed` (finance posted — automatic).

### M-07 · High · Inspections exist but are never used
- **Evidence:** 11 inspection templates and 17 items in the DB, **0 findings ever**. The inspection panel is only reachable inside the Log dialog; findings are saved only from "recommended" lines and errors are swallowed (`LogMaintenanceServiceDialog.tsx:846`). A failed item does not create anything. Drivers have no pre-trip inspection (DVIR).
- **Fix:** Inspections become their own flow: **driver DVIR** in the driver app at shift start (pass / attention / fail per item, photo required on fail, odometer captured → writes `fleet.odometer_readings` with `source='inspection'`). Any **fail** creates a `draft` work order line automatically; a fail on a safety item (brakes, tyres, lights, steering) sets the vehicle to **Do not drive** until a work order clears it. Fleet sees them in an **Inspections** tab (§5.4).

### M-08 · High · Driver requests skip triage
- **Evidence:** hub "Complete" turns a request straight into a completed service; "Dismiss" sets it `Cancelled` with no reason. The driver's **priority** is sent (`DriverDashboard.tsx:448`) but never shown. No photo. The driver never hears back.
- **Fix:** A driver request becomes a **`draft` work order** with `source='driver_request'`. Triage actions: **Approve → open**, **Merge into existing work order**, **Decline (reason required)**. Show priority + photo. Every status change notifies the driver in the driver app.

### M-09 · High · "Due soon" is really "due now"
- **Evidence:** `analyzeMaintenanceScheduleRow` (`packages/finance-core/src/maintenanceOverdueDetails.ts:43-95`) marks `pending` only when odometer ≥ next due or today ≥ due date. There is no look-ahead window, so a manager gets no warning before something is due.
- **Fix:** Add org settings `due_soon_km` (default **1,000 km**) and `due_soon_days` (default **14 days**). Status = Overdue if past; Due soon if within the window; OK otherwise. Also show a **projected due date** for km-based tasks using the vehicle's average km/day over the last 30 days of odometer readings (the Roomy has 587 readings — enough).

### M-10 · Medium · Fleet summary will not scale
- **Evidence:** `maintenance-fleet-summary` reads every vehicle through the KV bridge (`fromKvStore().like("key","vehicle:%")`), filters by org in JavaScript, then calls `getPackageChecklist` once per due row inside `Promise.all` (N+1 queries). The digest does `kv.get` per schedule row. Fine for 2 cars; slow and costly at 100+ and against your Disk IO budget.
- **Fix:** One SQL view `fleet.maintenance_due_v` (per vehicle × task: last done, next due km/date, km/days remaining, status, projected date) and `fleet.maintenance_vehicle_status_v` (one row per vehicle). Hub, digest, driver app and Dashboard all read these views. Org filter in SQL with RLS, not in JS.

### M-11 · Medium · Catalogue templates are thin and bootstrap is inconsistent
- **Evidence:** only **5** templates, all global, all `recurring` (Basic 5,000 km/3 mo, Inspection 5,000/3, Intermediate 10,000/6, Major 40,000/24, Long-term 100,000/60). No model-specific intervals. The Fit got 25 component rows; the Roomy got 1 package + 2 component rows.
- **Fix:** Templates are defined per **component** (oil + filter, air filter, cabin filter, spark plugs, brake pads F/R, rotors, tyres ×4 rotation, coolant, ATF/CVT fluid, battery, wipers, alignment, timing belt/chain where applicable) with catalogue-level overrides in Dominion. Bootstrap always creates the **same full set** for every vehicle, then the recompute (M-03) sets real due values. Rideshare duty uses the **severe-service** interval by default (org setting).

### M-12 · Medium · Two very large files carry the whole domain
- **Evidence:** `maintenance_routes.ts` is 3,362 lines; `LogMaintenanceServiceDialog.tsx` is 1,753 lines.
- **Fix:** Split by bounded context (§7). No behaviour change in the split commit.

### M-13 · Medium · Vendor is free text
- **Evidence:** work order `provider` is a string. `fleet.platform_vendors` has 32 rows but maintenance does not use it.
- **Fix:** `vendor_id` foreign key on work orders (nullable for "in-house"), vendor picker with "Add vendor". Enables spend by vendor and comeback rate (same component redone within 30 days / 3,000 km).

### M-14 · Medium · No downtime, no cost KPIs on the hub
- **Evidence:** no off-road tracking anywhere; hub shows no spend. For a rideshare fleet, a day off the road is lost earnings.
- **Fix:** `off_road_at` / `back_on_road_at` on work orders (M-06). KPI views: maintenance cost per km (by vehicle, by month), PM compliance % (PM tasks completed before overdue ÷ PM tasks due), mean days off road per work order, unplanned vs planned spend %. Show on the hub header (§5.1).

### M-15 · Medium · No audit trail on maintenance edits
- **Evidence:** work orders and records can be edited/deleted (`PATCH/DELETE /maintenance-logs/...`) with no history row. Deleting a log reverses finance (sign-off doc) but nothing records who/why.
- **Fix:** `fleet.maintenance_audit_log` (who, when, before/after JSON, reason) written by trigger on work orders and lines. Completed work orders cannot be deleted — only **voided** with a reason, which reverses finance and recomputes the schedule.

### M-16 · Medium · Odometer entry has no front door in Maintenance *(fix corrected in Rev 2)*
- **Evidence:** readings arrive from check-in, fuel, service and manual elsewhere, but the hub has no "Log odometer". A service odometer that does not fit the vehicle's other readings is not checked at all.
- **Fix:** "Log odometer" action per vehicle (writes `source='manual'`, photo optional). For any service or manual reading, the server finds the nearest trusted reading **on or before** the service date and the nearest **after** it. If the new reading is below the earlier one (−50 km tolerance), above the later one (+50 km), or implies more than 1,500 km/day, it is **saved with `is_anomaly = true`** and shown with a **"Check reading"** label and the two neighbouring readings. It is never refused (capture, don't gate) and never used as the current odometer until someone clears the label (M-20). Back-dated services are therefore allowed.

### M-17 · Low · Parts used are not recorded against stock
- **Evidence:** `maintenance_parts_usage` 0 rows, `part_warranty_claim` 0 rows; `fleet.inventory` not touched by work orders.
- **Fix (Phase 4):** work-order part lines can pick from `fleet.inventory` and decrement on completion; warranty end date stored per fitted part so a repeat failure inside warranty prompts a claim. No prices or suppliers shown in Find parts (info-only rule stands).

### M-18 · Low · The docs overstate what is live
- **Evidence:** `docs/maintenance-overdue-digest-cron.md` (says alerts are posted), `docs/fleet-maintenance-finance-audit.md` (says the core loop is complete).
- **Fix:** Point both at this audit with a one-line banner: "Superseded by fleet-maintenance-enterprise-audit.md".

### M-19 · Critical · Odometer is optional on a service log, and blank is saved as 0 *(Rev 2)*
- **Evidence:** the Odometer field (`LogMaintenanceServiceDialog.tsx:1565-1574`) has no required check; Save Log is disabled only when there are no lines (`:1740`). The client sends `Number(formMeta.odo) || 0` (`:805`, `:817`). The server's complete route takes `body.odometer`, else the work order's odometer, **else 0** (`maintenance_routes.ts:2920-2922`); the log bridge does `Number(body.odometer ?? body.odo ?? 0)` (`:2052`). A service at 0 km then sets "next due" to one interval from zero, so the car reads Healthy for its next 5,000 km of a 195,000 km life (same failure as M-01).
- **Fix:** Odometer is **required and > 0** on every service, work-order completion and driver request. The field is prefilled with the current odometer (M-20) and shows "last read 31 Oct · fuel". The server returns **400 `odometer_required`** when it is missing or 0 — on `POST /maintenance-work-orders`, `/complete`, and the log bridge (until the bridge is removed by M-02). The sanity check on the value itself is M-16 (label, not block).

### M-20 · High · "Current odometer" is the highest reading ever, including flagged anomalies *(Rev 2)*
- **Evidence:** `loadOdometerSupplementMaps` (`canonical_vehicle_odometer.ts:30-54`) takes the **max** reading per vehicle where `is_voided = false` and `is_hard = true`. It does **not** exclude `is_anomaly = true`. Live: **89 of 550** fuel readings for the Roomy are flagged anomaly (16%). Today the highest anomaly (191,722) is below the true max (195,192), so the screen is not wrong yet. One typo (e.g. 1,951,920 at a pump) would make the car permanently "overdue by 1.7 million km", and nothing but a manual void would fix it.
- **Fix:** Current odometer = the reading with the **latest `recorded_at`** among `is_voided = false AND is_anomaly = false` readings (ties → highest). Expose it once, from SQL: `fleet.vehicle_current_odometer_v (vehicle_id, reading, recorded_at, source)`. Hub, digest, Log dialog prefill and driver app all read that view. Anomalies stay stored and visible with their label (M-16).

### M-21 · High · The dialog asks for the odometer last, after all the work is picked *(Rev 2)*
- **Evidence:** screenshot 1 — step "pick" shows packages, quick jobs and inspection, but no vehicle, date or odometer. Odometer and date appear only on the **review** step (`stepDescription('review')`, `:291`), after the user has built every line. The dialog header also does not say **which car** is being logged.
- **Fix:** Dialog header always shows **vehicle name · plate · current odometer (last read date · source)**. The first step becomes **"When and at what mileage?"** — Date (default today) and Odometer (required, prefilled, M-19) — then the existing pick step. Review shows them read-only with an Edit link. When opened from the top "Log service" button with no vehicle chosen, step 0 is a vehicle picker.

### M-22 · Medium · The guide's nightly rule is per vehicle; due state must be per task *(Rev 2)*
- **Evidence:** the pasted guide's rule `SELECT * FROM vehicles WHERE current_odometer >= next_due_km OR next_due_date <= TODAY` assumes one `next_due_km` per vehicle. This repo already tracks 25 component rows for the Fit and per-corner positions (`vehicle_component_schedule`). Collapsing to one number per vehicle is what produces today's misleading "Next due (km) 128,000" column (U-05).
- **Fix:** The nightly job (M-05) evaluates `maintenance_due_v` — one row per **(vehicle, component, position)** — and the vehicle's status is the **worst** of its rows (Do not drive > Overdue > Odometer needed > Due soon > OK). The job runs at **07:00 UTC (02:00 Jamaica)** via `pg_cron`, writes alerts (M-05) and the drift check (§9 item 4), and stores one `maintenance_job_runs` row (started, finished, vehicles checked, alerts written, error) so a missed night is visible on the hub ("Last checked 02:00 today"). Status on screen is still computed live from the view; the job never "sets" a status column.

---

## 4. UI/UX audit of the current screen

| # | Issue on the screenshot | Fix |
|---|---|---|
| U-01 | "**+ + Log new service**" — the icon and the text both show a plus | Text "Log service", icon only |
| U-02 | "Bootstrap schedules" is a one-time admin/setup action sitting in the main toolbar | Move to a "⋯ More" menu, and show it only to `platform_owner` / fleet admin; run automatically when a vehicle gets a catalogue match |
| U-03 | "Compatible parts" button duplicates the Find parts tab | Remove the button; the tab stays |
| U-04 | "Schedule rows" column is an internal count | Replace with **Last service** (date · km) |
| U-05 | "Next due (km) 128,000" on a car at 195,192 means nothing | Replace with **Next due**: "Oil & filter — **overdue 64,692 km**" or "in 820 km · ~6 Nov" |
| U-06 | "Overdue: 208 d · 64,692 km" mixes two units in one cell | Merge into the Next due cell above; sort by most urgent |
| U-07 | Services due hidden behind an eye icon | Show the count as a red/amber pill; row click opens a **vehicle maintenance drawer** with every due item, history, open work orders |
| U-08 | Status is colour + word only, no reason | Status pill with reason: "Overdue · Oil & filter", "Odometer needed", "In shop", "Do not drive" |
| U-09 | No search, filter or sort | Search (plate / make / model), filters: Status, Service line (Rideshare / Delivery), Driver; default sort Overdue → Due soon → OK |
| U-10 | No summary numbers | KPI strip (§5.1) |
| U-11 | "Go to Vehicles" floating bottom-right | Remove; the vehicle name in each row links to Vehicle detail |
| U-12 | Empty state tells the user to "bootstrap schedules from the vehicle profile" (jargon) | "This car has no service plan yet. **Set up plan**" — one button that runs bootstrap for that car |
| U-13 | Driver requests appear above the table only when present, layout jumps | Move to their own **Requests** tab with a count badge |
| U-14 | Telematics not represented | A disabled "Live vehicle health · Coming soon" card in the vehicle drawer (no fake data) |

**Add Service Log dialog (screenshot 1, Rev 2)**

| # | Issue | Fix |
|---|---|---|
| U-15 | Package card shows an internal id: "SERVICE PACKAGE · **TPL 5EFCDC04**" (`LogMaintenanceServiceDialog.tsx:1131`) | Show the interval and state instead: "Every 5,000 km or 3 months · **Overdue**" / "Due in 820 km". Never show ids |
| U-16 | One package card on a 4-column grid, 3 empty slots; the other 4 catalogue packages (Inspection, Intermediate, Major, Long-term) are not offered | List every package that applies to this vehicle (merged global + catalogue templates), sorted most-due first, due ones highlighted |
| U-17 | **Tires & wheels** and **Brakes** use the same circle icon; Engine uses a droplet-like icon next to Fluids' droplet | One distinct icon per system in `maintenanceCategoryIcons.ts` (tyre, brake disc, engine block, droplet only for Fluids) |
| U-18 | 11 system tiles, no search — "brake pads" takes two clicks and a guess | Search box above Quick jobs that matches components across all systems ("oil", "pads", "wiper") and jumps straight to the line form |
| U-19 | Quick-job tiles give no hint what is due on this car | Red/amber dot + "2 due" on any system tile with overdue / due-soon rows for this vehicle (from `maintenance_due_v`) |
| U-20 | "Open digital inspection" sits at the bottom of a service log as a dashed card — inspections are a separate job | After M-07 the main entry is the Inspections tab; in this dialog it becomes a small text link "Do an inspection instead" |
| U-21 | Tab **"Service ledger"** (circled) reads as money; its own copy says "Not expense books" | Rename per §5: **Overview** (was By vehicle) and **Service history** (was Service ledger); "Outstanding" moves to Schedule |
| U-22 | Dialog title "Add Service Log" but toolbar says "Log new service" and save says "Save Log" | One verb everywhere: **Log service** (button, title, save) |

---

## 5. Target screens (Level 4)

Hub tabs, left to right: **Overview · Work orders · Schedule · Inspections · Requests · Service history · Find parts**. Keep the existing **Find parts** tab exactly as it is (do not replace a screen you like). Keep "By vehicle" content — it becomes the table inside **Overview**.

### 5.1 Overview (replaces "By vehicle")
- **KPI strip:** Overdue vehicles · Due in 14 days · In shop now · Do not drive · Spend this month (JMD) · Cost per km (30 days) · PM on-time % (90 days).
- **Vehicle table:** Vehicle (link) · Plate · Driver · Odometer (+ "last read 2 h ago, fuel") · Status pill with reason · Next due · Last service · Open WOs · Actions (Log service, Create work order, Log odometer).
- **Row click → vehicle drawer:** due list (each with "Create work order"), open work orders, last 10 services, spend YTD, cost/km, "Live vehicle health · Coming soon".

### 5.2 Schedule
Per vehicle × component grid: last done, next due (km + date), projected date, status. Bulk select overdue items → **Create one work order** with all selected lines (this is how "draft work orders for the manager to approve" from the blueprint is done — one click, not a separate approval queue).

### 5.3 Work orders
Board (columns = lifecycle states) and list views. Work-order page: header (vehicle, odometer, priority, vendor, dates, off-road time), lines (component, position, labour, parts, cost, declined), photos/invoice, linked inspection/request, timeline (audit log). Approval rule: work orders with total ≥ org setting `wo_approval_threshold_jmd` (default **J$50,000**) need a second user with `maintenance.approve` before `scheduled`.

### 5.4 Inspections
List of DVIRs and shop inspections: date, vehicle, driver, result (pass / attention / fail), defects open. Defect → linked work order.

### 5.5 Requests
Driver requests with priority, photo, odometer, age. Actions: Approve, Merge, Decline (reason).

### 5.6 Service history (replaces "Service ledger")
Filterable list of completed work-order lines; export CSV. "Outstanding" sub-view moves to Schedule.

### 5.7 Driver app
Pre-trip DVIR (≤ 90 seconds, big pass/fail buttons, photo on fail), "Report a problem" (= request), "My car's next service" card, notifications when a request changes state or the car is marked Do not drive.

---

## 6. Target architecture

### 6.1 Data model (RLS by `organization_id`)

*Rev 2 correction:* today the maintenance tables are in **`public`**; only `maintenance_logs` and `odometer_readings` are in `fleet`. New tables go in `fleet` (matches the rest of the fleet domain); existing `public.maintenance_*` tables stay where they are — moving them is not worth the risk. `public.fleet_maintenance_logs` / `public.fleet_odometer_readings` are compat views; `explorer.odometer_reading` (0 rows) is unrelated to Fleet and is not used.

| Table | Purpose | Status |
|---|---|---|
| `maintenance_work_orders` | Header, lifecycle, vendor_id, priority, source, off/on road, idempotency_key, approval | exists → add columns |
| `maintenance_work_order_lines` | Component, position, labour, parts, cost, declined, warranty | exists |
| `vehicle_component_schedule` | Derived due state (only schedule table) | exists → add `baseline_source`, `baseline_odometer`, `baseline_date` |
| `maintenance_task_templates` + `maintenance_package_categories` | Dominion catalogue intervals | exists |
| `maintenance_inspections` + `_inspection_findings` | DVIR + shop inspections | findings exist → add header table |
| `maintenance_events` | Outbox / event bus (see 6.3) | **new** |
| `maintenance_alerts` | Idempotent alerts for bell + email | **new** |
| `maintenance_audit_log` | Before/after history | **new** |
| `fleet.odometer_readings` | Canonical odometer (already 587 rows) | exists → add `source='inspection'`, `flag` |
| `maintenance_records`, `fleet.maintenance_logs`, `maintenance_service_ledger` | Become views over work orders | migrate |

| `maintenance_job_runs` | One row per nightly run (M-22) | **new** |

Views: `vehicle_current_odometer_v` (M-20), `maintenance_due_v`, `maintenance_vehicle_status_v`, `maintenance_kpi_monthly_v`.

### 6.2 Trigger (PM) engine
- Inputs: catalogue intervals, completed work-order lines, canonical odometer, calendar, org settings (due-soon window, severe service).
- Output: `vehicle_component_schedule` rows via `recompute_maintenance_schedule(vehicle_id)`; status via `maintenance_due_v`.
- Runs: on WO complete/void/edit, on new odometer reading (debounced, max once per vehicle per hour), nightly full pass + drift check.
- Pure functions stay in `packages/finance-core` (`maintenanceScheduleEngine.ts`, `maintenanceOverdueDetails.ts`) with unit tests; the SQL function and the TS function must agree — add a parity test.

### 6.3 Event bus (Postgres outbox)
`maintenance_events(id, organization_id, vehicle_id, type, payload jsonb, occurred_at, processed_at)`.
Types now: `odometer.recorded`, `inspection.failed`, `request.created`, `wo.status_changed`, `wo.completed`, `schedule.due_soon`, `schedule.overdue`.
A `pg_cron` worker (every minute) or DB trigger processes unprocessed rows: recompute schedule, write alerts, notify driver, post finance.

### 6.4 Telematics slot (Coming soon — do not build)
Later, a `telematics` adapter writes `odometer.recorded` (source `telematics`), `engine_hours.recorded`, and `fault.detected` (DTC) into the **same** `maintenance_events` table. A fault creates a `draft` work order exactly like a failed inspection. Nothing in §6.1–6.3 changes. In the UI, show only a disabled "Coming soon" card — no placeholder numbers.

### 6.5 Finance
Keep the existing posting (`appendCanonicalMaintenanceIfEligible`), but call it **only** from the WO `closed` transition inside the same transaction (M-02). Void → reversal. One posting per work order, keyed by work-order id.

### 6.6 Permissions
`maintenance.view`, `maintenance.log`, `maintenance.manage` (create/edit WOs), `maintenance.approve`, `maintenance.admin` (templates, bootstrap, settings). Server checks every route; client tables mirror the server list.

---

## 7. Code structure (split, no behaviour change first)

```
supabase/functions/_fleet-server/maintenance/
  routes_templates.ts      (Dominion templates + categories)
  routes_schedule.ts       (schedule, bootstrap, due view)
  routes_work_orders.ts    (lifecycle)
  routes_inspections.ts
  routes_requests.ts
  routes_history.ts        (service history, outstanding)
  digest.ts                (cron)
  index.ts                 (mounts all)
apps/fleet/src/components/maintenance/
  hub/ (Overview, KPI strip, vehicle drawer)
  work-orders/ (board, list, page, complete form)
  schedule/  inspections/  requests/  history/
  log-service/ (today's dialog split into steps: Vehicle → Lines → Costs → Evidence → Review)
```

---

## 8. Build order

Each phase ends with its checks green before the next starts.

**Phase 0 — Make today's numbers true (Critical)**
M-19 + M-20 first (every later number depends on the odometer), then M-01, M-02 (+ orphan clean-up), M-03, M-04, M-09, M-18.
*Done when:* a service cannot be saved without an odometer; current odometer comes from `vehicle_current_odometer_v` and ignores anomalies; Fit shows "Odometer needed"; Roomy shows every overdue component with correct km; recompute = stored for every row; a double-clicked save creates one work order; one finance posting per work order.

**Phase 1 — Speed + structure**
M-10 (views), M-12 (split), U-01…U-13 on the existing screen, M-16, M-21 + U-15…U-22 on the dialog.
*Done when:* hub loads from views in one query; no `fromKvStore` in maintenance; tsc no worse than baseline.

**Phase 2 — Level 3 workflow**
M-06 work orders + tab, M-08 requests, M-13 vendors, M-05 + M-22 nightly job + alerts, M-11 full component templates.
*Done when:* request → draft WO → open → in_shop → completed → closed works end-to-end; digest writes alerts once per day; bell shows them.

**Phase 3 — Inspections + driver**
M-07 DVIR, Do not drive, driver notifications, email digest.

**Phase 4 — Level 4 management**
M-14 KPIs + downtime, M-15 audit trail + void, approval threshold, M-17 parts from stock + warranty.

**Later — Level 5:** telematics (§6.4), predictive.

---

## 9. Checks to add (CI + nightly)

1. **Unit:** schedule engine + due analysis (due-soon window, no-odometer, once-milestone, max window).
2. **Parity:** SQL `recompute_maintenance_schedule` vs TS engine on fixtures.
3. **Idempotency:** same `idempotencyKey` twice → one WO, one finance row.
4. **Nightly SQL drift checks (alert on any row):**
   - schedule row ≠ recompute
   - work order `in_progress`/`in_shop` older than 14 days
   - completed WO with cost > 0 and no finance posting, or more than one
   - vehicle with schedule but no odometer reading in 7 days
   - completion odometer < previous reading
5. **e2e:** log service, request → WO lifecycle, DVIR fail → draft WO.
6. **Odometer (Rev 2):** API returns 400 `odometer_required` for missing / 0; a back-dated service below today's reading saves (labelled only if it breaks its date neighbours); an anomaly reading higher than all others does **not** change current odometer.
7. **Nightly job (Rev 2):** a `maintenance_job_runs` row exists for every day; alert if yesterday's is missing or errored.

---

## 10. Open items found in live data (31 Oct 2026)

| Item | Value |
|---|---|
| Orphan work order | `d3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a` (`in_progress`, duplicate of `9a0e45b7…`) |
| Honda Fit `1505LM` | 0 odometer readings; 25 component rows with fake "last performed" |
| Toyota Roomy `5179KZ` | odometer 195,192; last service 123,000 (6 Jan 2026); schedule rows disagree (121,952 vs 128,000) |
| Overdue digest | not scheduled; writes 0 alerts |
| Inspections | 11 templates, 17 items, 0 findings |
| Templates | 5, all global, all recurring |
| Odometer readings (Rev 2) | 587 total, all Roomy: fuel 550 (**89 flagged anomaly**), check-in 33, service 3, manual 1 (voided); 0 readings at 0 km |
| Rev 1 findings fixed since Rev 1 | none (code and data unchanged) |
