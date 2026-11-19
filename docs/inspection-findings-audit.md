# Inspection findings ("found, not done yet") — build plan

**Rev 10 · 18 Nov 2026 — CLOSED. Live for every company (commit 33c64f85 on main, switch `inspection_findings` on for all).
Owner tried it live (inspection + "Not done yet" job). Follow-on gaps found in that run (Other item never reaches Dominion,
no front/rear on jobs, Roomy oxygen sensors missing) moved to their own audit: `docs/log-service-parts-gaps-audit.md`.**

**Goal:** when an inspection job is logged in Roam Fleet → Log service, the user adds the jobs the inspection found and marks each
**Done today** or **Not done yet**. Not-done jobs wait on the car's "Found by inspection" list until **Log it now** or **Not needed**.

---

## 0. Start here (new chat)

**How we work:** Cursor does data/server rounds (prompts in `docs/inspection-findings-build/`); Claude ports Stitch screens and
checks everything; the owner runs the live database. Owner is not a coder: short plain replies. No branch/push/prod steps in prompts.

**Done and proven (don't redo):**
- **D1 + D1-fix (database):** `supabase/migrations/20261118004433_inspection_findings.sql` — `records_findings` on jobs; found-line
  columns (`from_found_line_id`, `closed_at`, `closed_reason`, `closed_by`); `fleet_save_work_order` forces found lines to J$0 and
  reads `from_found_line_id` (IF-15 fix); finished-service lock allows "Not needed"; voiding a service closes its open found jobs;
  `fleet_open_found_work` / `fleet_found_work_counts` / `fleet_close_found_work`; repeat-alerts / parts usage skip found lines.
  Tests: `supabase/tests/inspection_findings_checks.sql`, `inspection_findings_db_test.sql` (all pass locally).
  **LIVE 18 Nov:** owner ran it in the SQL editor + logbook line; checked (logbook 1, columns 3, functions 3, index 1).
- **S1 (server):** switch `FEATURE_FLAGS.INSPECTION_FINDINGS` (off by default); finish step skips found lines; save strips their
  money/parts/items; routes `GET /maintenance-found-work`, `GET /maintenance-found-work/counts`,
  `POST /maintenance-found-work/:lineId/not-needed`; `found` status block on `GET /maintenance-work-orders/:id`. Deno 159 pass.
- **UI1 (Log service screens, Stitch 1–5):** `log-service/foundWork.ts` (logic), `log-service/FoundWorkSection.tsx` (look),
  wired in `LogMaintenanceServiceDialog.tsx` (new prop `fromFoundWork`, "Done today" stored as `values.found_today`).
  Unit tests 162/162. Real-stack spec `e2e/fleet-inspection-findings.spec.ts` **3/3 pass** (gate 9, done-tests 1–4).
  Existing Log service e2e green (discount 3/3, service items 6/6).

- **UI2 (fleet page, drawer, Not needed, history — Stitch 6–13):** `maintenance-logging/FoundByInspection.tsx`
  (`FoundByInspectionSection`, `NotNeededDialog`, `FoundToDoChip`, `FoundByInspectionKpiCard`, `FoundHistorySection`), wired in
  `MaintenanceDueItemsDrawer`, `MaintenanceHubKpiCards`, `MaintenanceOverviewPanel`, `FleetMaintenanceHub`, `ServiceHistoryRowDialogs`.
  Type-check: no new errors (Fleet still 321 old ones). Unit tests `FoundByInspection.test.tsx` 16; vehicles folder **178/178**.
  Real-stack spec `e2e/fleet-inspection-findings.spec.ts` **6/6 pass** (adds card + "2 to do" chip, drawer, Not needed overlay +
  second-close 409, Log it now → banner → save → list empty, history). Live screenshots checked against Stitch 6–11: match;
  history now lists "Done the same day" jobs first (Stitch 11). Stitch 12 (states) + 13 (phone) are covered by unit tests only, no live picture yet.
- **IF-16 (found in step 3, fixed):** Service history list showed found jobs (J$ 0 / Not needed) as jobs. The D1 migration now
  also redefines `fleet.maintenance_service_history_v` to skip `recommended` lines (only the history page uses it). Applied on the
  local copy; check added to `supabase/tests/inspection_findings_checks.sql`; e2e asserts it.

- **Code review (18 Nov), 10 findings → IF-17..IF-26 (section 5).** All checked against the code; all real. Screens half fixed by
  Claude (IF-20..IF-23 + client side of IF-17/IF-26): found jobs and "Done today" jobs now carry `values.found_by_job` = the
  inspection job id, so each inspection job only rebuilds, saves and counts its own found jobs; old Digital inspection lines and
  declined lines are kept and still get their old findings record; saved found lines keep their ids; `api.ts` reads a 404 body once;
  the fleet card uses `oldestVehicleId` from the counts when the server sends it. Unit tests **180/180**, tsc unchanged (321 old).

- **R1-fix (Cursor, checked by Claude 18 Nov):** IF-17 server, IF-18 (unique index dropped; link guard locks the found line and counts
  only live lines on non-voided services), IF-19 (only a completed child closes a found job; helper
  `inspection_findings_helpers.ts`), IF-24 (400 `found_line_invalid`), IF-25 (`Promise.all`), IF-26 (`oldestVehicleId`). Claude added
  a plain index `idx_mwol_from_found_line` (the dropped unique index left `from_found_line_id` unindexed). Proven on a fresh local
  database: 8 SQL check/test scripts pass, Deno 161 pass, migration/anon checks + `pnpm check` pass, and real-stack e2e **15/15**
  (inspection findings 6/6, Log service discount 3/3, service items 6/6).

- **Full test set (18 Nov, Claude) — PASS:** Fleet unit tests 2,036 (358 files); `pnpm check` 8/8; CI SQL checks 48/48 in CI
  order on a fresh `db reset --no-seed`; migration fingerprints match prod (125); Deno all server tests 1,791; real-stack e2e Fleet
  24/24 (inspection findings, Log service discount, service items, maintenance master). Dominion e2e 11/12: not caused by this
  build — `dominion-maintenance-master.spec.ts` D5 still expects "Roam Fleet car" in the impact box, which was removed on
  purpose (Dominion never counts Fleet cars). Per golden rule 9 the test must be updated; carried as LS-11 in
  `docs/log-service-parts-gaps-audit.md`. Note: running every `supabase/tests/*.sql` unordered on a used database gives false
  failures (fixtures/data); use CI order on a fresh reset.

**Next steps:** none — CLOSED 18 Nov.

---

## 1. Rules the build must keep (gates)
1. A not-done job adds J$0, never posts to history, never moves the schedule, never touches stock/parts/repeat alerts, carries no items.
2. A found job closes once only (done or not needed), only by a service on the same car and company.
3. Deleting the inspection service closes its open found jobs; deleting the service that did a job reopens it.
4. Only a **finished** service's found jobs are open; finished services stay locked except "Not needed".
5. Switch off → nothing changes for anyone (new routes 404, Log service looks exactly like today).
6. Existing screens keep everything; new parts only add. Buttons always look like buttons; in-app overlays only.

## 2. Stitch screens still to check (UI2)
Screens: `C:\Users\deeki\Downloads\fleet_inspection logging\stitch_fleet_inspection_ledger_follow_up\` (PNGs 3,4,5,7,10 are
cut off; use each `code.html`). Stitch decides the look; drop everything it invented.

| # | Screen | Keep | Drop |
|---|---|---|---|
| 6 | Fleet page | "FOUND BY INSPECTION · N jobs waiting · on N cars · oldest N days" card; lavender "N to do" chip | header/KPI subtexts/tabs/fuel chips/pagination Stitch redrew |
| 7 | Drawer | section header + count + helper; cards (name, grey Waiting chip, note box, "Found … · N days waiting · job at garage", black Log it now, bordered Not needed) | odometer sync, VIN, "UNSCHEDULED", per-job icons, "Esc to close" footer, redrawn Overdue/Due soon rows |
| 8 | Drawer empty | check + "Nothing waiting from inspections." + "All clear" | redrawn Tyre Rotation row |
| 9 | Not needed overlay | icon tile, title, body, "Found … · note" box, Cancel + Mark not needed | the drawer Stitch drew behind it |
| 10 | Log it now | blue banner "From inspection on … · job at garage" + note; From inspection chip | "Garage discovery note:" prefix, black bar |
| 11 | History | "What the inspection found" rows: Done (+ Open that service), Done the same day, Not needed (struck, by name), Closed · service deleted | SR ids, technician sign-off, invoice/print buttons, KPI tiles |
| 12 | States | loading / couldn't load + Try again / someone else closed + OK / closed · service deleted — inside the drawer section | the whole "state board" frame and all technical text |
| 13 | Phone | stacked cards, full-width Log it now / Not needed | app bottom nav, "SERVICE LOG" header, invented subtitles |

## 3. Go live (owner, after step 5)
1. Run `supabase/migrations/20261118004433_inspection_findings.sql` in the Supabase SQL editor, then
   `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261118004433', 'inspection_findings') ON CONFLICT (version) DO NOTHING;`
2. Commit + push (deploys server bundle `fleet-ops` and app). Switch stays off. **DONE 18 Nov:** only the 45 inspection
   files, on top of main (commit 33c64f85); toll work stays on the branch.
3. Turn on for EVERYONE (owner rule 18 Nov: no per-fleet step): key `feature_flag:inspection_findings` in
   `kv_store_37f42386` = `{"enabled": true}`, then the real run below with screenshots. **DONE 18 Nov:** on for everyone
   (fleet-ops deployed + smoke OK, Vercel OK). Next = the real run (section 4).

## 4. Done-tests (real run)
1. Inspection J$8,000 + Wiper Blades Done today + Brake rotor / Shock absorber Not done yet → bill = inspection + wiper only; found jobs not in history.
2. Car's Due items → "Found by inspection" lists both with notes; fleet page shows "2 to do".
3. Log it now on Brake rotor → Log service opens on it with the banner → save → leaves the list; history says Done + link.
4. Not needed on Shock absorber → confirm → leaves the list; history shows it struck through.
5. Delete an inspection with an open found job → job closed "service deleted".
6. Switch off → screens exactly as today.

## 5. Problems found and fixed (for reference)
IF-1 money · IF-2 finish skipped only declined · IF-3 never shown again · IF-4 no link · IF-5 no inspection marker · IF-6 closed_at ·
IF-7 void cascade · IF-8 edit lock · IF-10 lock blocked Not needed · IF-11 repeat alerts/parts usage · IF-12 old DVI call skipped ·
IF-13 Done today marker (`values.found_today`) · IF-14 found list loaded before Save line · IF-15 save read wrong key ·
IF-16 found jobs listed in Service history — all fixed.
Known edge: an unfinished "Log it now" service hides the found job until it's finished or deleted (the "Not finished" card shows it).

**Code review 18 Nov — IF-17..IF-26 (one fix each):**
- **IF-17** Switch off refused every save with a `recommended` line, so the old Digital inspection step (package → Inspect) failed.
  Fix: the off-check trips only on `fromFoundLineId`, `values.found_by_job` or `values.found_today`. Client tag done; server = R1-fix.
- **IF-18** Voiding the service that did a found job left the unique index holding the link, so the job could never be logged again.
  Fix: drop `idx_mwol_from_found_line_live`; the link guard locks the found line and counts only live lines on non-voided services. R1-fix.
- **IF-19** A draft/unfinished "Log it now" service counted as done. Fix: a child closes the found job only when its service is
  completed (DB helpers + `enrichApiLinesWithFound`). R1-fix. Replaces the old "known edge".
- **IF-20** Saving an inspection job dropped every `recommended` line (old Digital inspection, declined) and re-created found lines
  with new ids. Fix: only this inspection job's tagged lines are swapped; ids kept. **Fixed (client).**
- **IF-21** With the switch on, old Digital inspection lines lost their findings record. Fix: the old post skips only tagged lines. **Fixed.**
- **IF-22** Found lists were service-wide, so two inspection jobs shared them. Fix: drafts and the collapsed chip count per inspection job. **Fixed.**
- **IF-23** `listFoundWork` / `foundWorkCounts` read a 404 body twice. Fix: one read through `maintenanceSaveErrorFrom`. **Fixed.**
- **IF-24** `recommended` + `fromFoundLineId` hit a DB check as a 500. Fix: refuse with 400 `found_line_invalid` before saving. R1-fix.
- **IF-25** Two flag lookups one after the other on group load and save. Fix: `Promise.all`; pass the flag into the off-check. R1-fix.
- **IF-26** The fleet card downloaded every open found job to pick the oldest car. Fix: counts return `oldestVehicleId`;
  client uses it (falls back to the list until the server sends it). Client done; server = R1-fix.
