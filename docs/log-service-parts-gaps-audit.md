# Log service parts gaps + Inspection "Not done yet": audit (Rev 31, 19 Nov 2026, trimmed)

## 0. START HERE (new chat)

**How we work:** `docs/how-we-build-playbook.md`.
- The owner is not a coder: short, plain replies, one step at a time.
- The owner runs anything on the live database: the SQL file in the Supabase SQL Editor, then a logbook INSERT. Always
  check one created object live afterwards; never trust the logbook alone.
- Stop any test server you start (`pnpm testcopy:stop`). Never save screenshots in the repo.

**Where we are (19 Nov, late):**
1. **Everything is built, tested and PUSHED to main as `613d7269`** (82 files). It was shipped from the worktree
   `C:/Roam/Goride-golive`, branch `golive-inspection-quotes`, made from origin/main. The branch `parts-auto-match`
   still carries the unshipped toll-dispute commits.
2. **All 7 of today's migrations are live + logbook lines checked:**
   - `20261119155611` add-parts link paths
   - `20261119164659` catalyst place on specific cars
   - `20261119211043` add found job to inspection
   - `20261119212407` Wheel bearing job
   - `20261119215824` quote amount
   - `20261119222412` quote detail (`fleet_add_found_job(text,uuid,uuid,uuid,text[],text,numeric,jsonb)`)
   - `20261119224647` outbox request delete
3. **DONE 19 Nov:**
   - **Deploy checked:** the edge deploy shipped every function (fleet-ops, fleet-core, platform-catalog,
     parts-sourcing-drain included).
   - Vercel, Parts SQL checks, Supabase function tests and the Stitch e2e runs are green.
   - CI's only red step is the old "migration versions parity": toll migration `20261117204932` is live but not on
     main, which is not this release.
   - **Worktree cleaned:** junctions removed, worktree + branch deleted, `pnpm install --offline` run.
   - The `parts-auto-match` working copy still holds the same changes uncommitted. Don't commit them there twice; main
     has them.
4. **NEXT STEPS, in order:**
   1. **Owner's real run:** on the 22 Aug Roomy inspection (Whol-Hearted, J$ 8,000) use **Not done yet → Add a job**
      to add Wheel bearing (Rear left + Rear right), Throttle Body Cleaning (quote J$ 6,800) and Throttle Body Relearn
      (J$ 2,000). Check that the cards show the quotes and the parts to buy. Later, **Done** → one service in Service
      history.
   2. Separate, later: the Add parts UX redesign (memory `add-parts-ux-redesign-needed`), and the Roomy wheel bearing
      part in Dominion (an "Ask Roam" request is already pending).

## 0b. LC-17 Add / Edit quote on a waiting job (BUILT 20 Nov, local, NOT live yet)

- **Migration `20261120000402_found_job_edit_quote.sql`:**
  - The line lock (`fleet.guard_completed_maintenance_wo_line`) gets ONE more allowed change: on an OPEN found line,
    only `values_json.quote` / `quote_amount` and `notes` may change.
  - New `fleet_set_found_quote(org, actor, line, quote, detail jsonb, note)` (service_role only).
  - SQL proofs 9–9e in `add_found_job_to_inspection_checks.sql` passed locally; the migration is in the CI paths.
- **Server:** `PUT /maintenance-found-work/:lineId/quote` (vehicles.edit, car access); errors are mapped in
  `mapFleetAddFoundJobError`. The fleet-ops bundle is rebuilt and the manifests are current.
- **Screens:**
  - Cards show "No garage quote yet" + **Add quote**, or the quote + **Edit quote** (`found-edit-quote`).
  - The button opens Log service with `addToInspection.editLine`: straight on that job's quote form, filled in
    (snapshot + note); Review → **Save quote** → `api.setFoundQuote`.
  - No Also do and no Add another job in this mode.
- **Tests:** fleet unit 33 files green; e2e N5 added → N1–N5 5/5.
- **To release:**
  1. The owner runs the migration + logbook line.
  2. Ship with the worktree recipe (worktree from origin/main; copy the LC-17 files: migration, SQL check,
     parts-sql-checks.yml lines, `maintenance_routes.ts`, `log_service_planned_guard(.test).ts`, fleet-ops bundle,
     `api.ts`, `LogMaintenanceServiceDialog.tsx`, `FoundByInspection(.test).tsx`, `addToInspection.tsx`,
     `FleetMaintenanceHub.tsx`, e2e spec).
  3. Remove the junctions before removing the worktree.

## 1. What is live (short)

- **Slices A + B + C (main `22773335`, `87432882`, `d60a7433`):**
  - unknown parts reach Dominion;
  - "Where on the car" places;
  - Parts that fit, with Copy part info (full block + Toyota bracket name);
  - Ask Roam, Plan it, the parts bell, and Dominion "Added — pick the part".
- **Switch:** `feature_flag:log_service_parts_gaps` is on for everyone; `inspection_findings` is also on.
- **`613d7269` adds:**
  - **LC-10:** a found job shows read-only "Parts to buy" (`PartsThatFitPanel toBuy`). Places use Toyota names:
    oxygen sensor Front (Air fuel ratio sensor) / Rear (Oxygen sensor No.2), other catalyst jobs Front / Rear.
  - **LC-11:** the Work orders + Inspections tabs are deleted and replaced by one **Not done yet** tab (every car; the
    KPI card opens it). Old `?tab=` links land there.
  - **LC-13:** a **From inspection** box with **View inspection** (Service details).
  - **LC-14:** **Add a job** on a saved inspection opens the real `LogMaintenanceServiceDialog` with
    `addToInspection`:
    - it starts on Work done;
    - Details in `quoteMode`;
    - Review is `AddToInspectionReview`;
    - it saves with `POST /maintenance-work-orders/:id/found-jobs` (`fleet_add_found_job`: one J$ 0 recommended line,
      the saved service is never changed);
    - Service details shows the button when `canAddFoundJobs`.
  - **LC-15/16 — the quote is the same job form:**
    - The snapshot is in `values_json.quote` and the total in `quote_amount`. Neither is in any total.
    - An inspection's Not done yet jobs get optional **quote cards**.
    - Cards show **Pending | Done** (Done = Log it now).
    - Done opens Date & mileage, then the quote filled in, plus "**Also done on this visit?**" ticks, so it saves as
      one service.
    - **Also do** shows on the job card (e.g. Throttle Body Cleaning → Relearn); a job's group loads on demand.
  - A **Wheel bearing** job (Suspension & steering, four corners).
  - Dominion Front / Rear wording, and the type dropdown is no longer clipped.
  - **Code review (9) fixed:**
    1. route manifests;
    2. outbox check `request_id IS NULL OR state IN (sent, merged)`;
    3. pending-parts Looking / Can't find only change open asks and notify only those;
    4. Other-item part number follows the switch;
    5. the drain cancels rows whose item, line or service is gone;
    6. "Added" partId must be a UUID;
    7. the name cache doesn't cache failures and is capped at 500;
    8. the queue shows only the current open round of a key;
    9. the drain loads a batch in 4 reads.

## 2. Tests (all green 19 Nov)

- Deno `_fleet-server`: 1227 on main / 1234 on the branch.
- Fleet vitest: 281. Dominion: 33.
- SQL checks: `add_found_job_to_inspection_checks.sql` (8 proofs), `log_service_parts_outbox_checks.sql`,
  `log_service_parts_that_fit_checks.sql`. All are in `parts-sql-checks.yml`.
- e2e (test copy, `--project=fleet`):
  - `fleet-inspection-not-done-yet.spec.ts` N1–N4;
  - `fleet-log-service-parts-that-fit.spec.ts` C1–C7;
  - `fleet-inspection-findings.spec.ts`;
  - the positions, unknown-parts and service-items specs.

## 3. Rules to keep

- A quote is never spend: only the Done save (Log it now) puts money in Service history.
- A saved service is locked. Adding found jobs only inserts J$ 0 lines.
- No part number boxes for users. Place names use the car maker's words.
- Features are switched on for everyone. In-app overlays only.
- **Test copy notes:**
  - Its catalogue has only "Shop fees" as a pickable group (live has all of them).
  - Deno tests run with `--node-modules-dir=none`.
  - After `_fleet-server` edits, rebuild with `node scripts/build-edge-bundle.mjs fleet-ops` and `… fleet-core`, then
    run `node scripts/edge-route-manifest.mjs --all --check`.
- The Supabase CLI `migration new` can hang: name files with `date -u +%Y%m%d%H%M%S`.
