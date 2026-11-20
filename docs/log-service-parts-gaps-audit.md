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

## 0b. LC-17 Add / Edit quote on a waiting job — LIVE 20 Nov (main 44a785f2; migration run by owner; fleet-ops/fleet-core deployed; worktree cleaned). Not yet re-checked live via SQL (MCP was down): confirm fleet_set_found_quote exists

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

## 0c. 20 Nov release — LIVE (main 4fdc39a3; edge + Vercel deployed, function tests green; worktree removed)
- LC-18 folding blocks per inspection (arrow at the row end).
- LC-19 batteries (size + type). Owner ran migration `20261120013338` + the REVOKE/GRANT lines added after
  (section e of the file) — "Success" 20 Nov. Not re-checked via MCP (was down).
- Tier 5 parts say **"Fits by size"**; the "Skip — I don't know the part" button is gone.
- **Car size line:** `/parts/find` returns `carSizes`; the panel shows "Toyota lists for your car · Battery size:
  M-42 · EFB" above the parts ("Your car takes" when the source isn't the car maker's catalogue). Best-effort lookup,
  never blocks the list.
- **Roomy data (live):** variants `3cd9cbf3…` + `7c71d591…` battery_jis **M-42**, battery_type **EFB** — source Toyota
  EPC on Amayama for frame M900A-0344862 (1611– drawing; N-55 is only the 2020/09+ car). By-size part: GS Yuasa
  ER-M-55/55B20L (EFB) = bigger sister in the same B20L case. Toyota gives no battery part number (only the size).
- Open: CI "migration parity" red = toll migration `20261117204932` live but not on main (not this work).

## 0c2. LC-21 "I used a different …" (label search) — BUILT 20 Nov (local, not shipped; replaces LC-20 Brand/Part number boxes)
- **Why (owner, Roomy battery run):** the battery in the car (Interstate PF-NS60L-5-INTL, Standard, B24L) isn't on the
  Roomy's list. Users don't know part numbers — they read the label. Roam must find it if known, else the user adds it
  and it goes to Dominion to confirm. The user is never told Roam is "looking it up".
- **Owner rules (20 Nov):** close matches only (keeps the 9 Nov "own verified cars only" rule): one kind of part (the
  job), ≥4 letters, ≤5 hits, brand / name / number only, no list of cars. A part is classified by what it is (size +
  type), never "for the Roomy" — the size/type rules (LC-19) keep it off the Roomy's list. The service history keeps
  what is really in the car, with a grey "Not what Toyota lists (Battery size: M-42 · EFB)." line.
- **Screen (`OtherPartSearch.tsx`, in `PartsThatFitPanel`):** "I used a different {job}" → one box "Search by what's on
  the label" → matches (badge: the card's own fit, or "Not on your car's list") → tap; or `Add "Interstate NS60L" as the
  battery I used`. Chosen: "Using Interstate NS60L" (+ "Added by you") + grey line + Change. Every pick state; never on
  Parts to buy. A match that is a card above picks that card.
- **Server:** `GET /parts/match` (fleet-core, `fleet_parts_match.ts`): part_master of the job + universal_part of the
  job's size keys (`specKeysForComponent`, now exported from parts_finder), every typed word must match (hyphens
  ignored); unlinked car → no matches. Save check (`log_service_part_fit.ts`, fleet-ops): a part not listed for the car
  is accepted when it is a part of the line's own job (`firstRefusedLine`) — capture, never gate.
- **Saving:** the pick lives in the job's values (`part_pick_source` size|found|added, `part_pick_name`,
  `part_pick_key`, `part_not_listed_for`) + brand / number on the line; part_id only for a found part_master part.
  An added part rides to Dominion as a hidden Other item (`partPick.ts` carrier; existing outbox → drain sends Other
  items on an is_part job with the job as the part); hidden in Items used, Review and Service details.
- **Bug fixed on the way (live since 4fdc39a3):** tapping a "Fits by size" card stored the universal_part id as the
  line's part_id → save refused ("Battery: that part does not fit this car"; part_id FK is part_master). Size picks
  now save brand + number only; Plan it with a size part plans with no part.
- **Tests:** fleet_parts_match.test.ts (6), log_service_part_fit.test.ts (+2), partPick.test.ts (4),
  PartsThatFitPanel.test.tsx (LC-21 ×6); Fleet maintenance-logging 236/236; server 55/55; route contract ok.
- **To release:** fleet-core + fleet-ops deploy and Fleet (Vercel), via the worktree recipe (this branch carries other
  unshipped work). Files: `fleet_parts_match(.test).ts`, `fleet_find_parts_routes.ts`, `parts_finder.ts`,
  `log_service_part_fit(.test).ts`, ci.yml line, Fleet `api.ts` (partsMatch), `OtherPartSearch.tsx`,
  `PartPickLines.tsx`, `partPick(.test).ts`, `PartsThatFitPanel(.test).tsx`, `partsThatFit.ts`, `itemsUsed(.test).ts`,
  `LogServiceReviewStep.tsx`, `ServiceHistoryRowDialogs.tsx`, `LogMaintenanceServiceDialog.tsx` (LC-21 hunks only).

## 0c3. LC-22 Warranty period + "Cost" label — BUILT 20 Nov (local, not shipped; Fleet only)
- Ticking **Warranty** opens an in-app overlay (`WarrantyDialog.tsx`): 3 / 6 months, 1 year, 18 months, 2 / 3 years,
  Other (months/years); shows "Covered until …" from the service date. Saved in the job's values
  (`warranty_months`, `warranty_until`; `warrantyPeriod.ts`); the tick lands on Save, Cancel leaves it off, untick
  clears. Shown under the box ("Warranty: 1 year · until 19 Nov 2027" + Edit), on Review and in Service details.
- The part price box reads **Cost** on every job (Fleet overrides Dominion's "Parts / materials" label, key `material`).
- Customer copy rule (owner 20 Nov): no text about Roam's database / lookups anywhere in Fleet (label search stripped).
- Tests: warrantyPeriod.test.tsx (5); suite 242/242.

## 0c4. LC-21b Dominion side of an added part — BUILT 20 Nov (local, not shipped)
- **Real run (owner, 20 Nov):** Roomy service 10 Mar 2026, J$12,000, Interstate PF-NS60L-5-INTL "Added by you", warranty
  6 months → outbox sent → request REQ-3381D6DD (origin service_log) open in Pending catalog.
- **Gaps found:** (1) "A fluid, oil or size part" (FluidPartFlow) could not save without ticking a car, and ticking a car
  OVERWRITES its spec (Roomy M-42 → 46B24L); it never asked Standard/EFB/AGM and saved every product as genuine/car-maker
  catalogue. (2) "Added — pick the part" listed only parts fitting the car, and listed by-size parts by their
  universal_part id, which the resolve RPC (part_master only) refuses. (3) Resolving sends "… is now on file" to the
  company even for a part they logged themselves.
- **Fixes:** FluidPartFlow — Who makes it? (car maker / another brand → oem+car_maker_catalogue / aftermarket+
  part_maker_catalogue), Battery type for battery_jis, Save with no cars → `parts/add` (spec) only, "No car specs were
  changed." Candidates (platform-catalog `pending_parts_catalog_routes.ts`) — by-size rows swapped to their part_master
  twin (`universal_part.extra.partId`, written by every by-size save; GS Yuasa row has none → left out), plus close
  matches of the request's need_text labelled "Not listed for this car" (`candidateItems`, `universalTwinIds` in
  fleet_parts_match.ts). Fleet /parts/match lists a by-size battery once (twin skipped). Migration
  `20261120150348_resolve_request_no_notice_for_service_log.sql`: notice loop skips origin service_log.
- **Source link optional (owner 20 Nov):** for a by-size product saved with no cars. Migration
  `20261120151201_size_product_source_link_optional.sql` (universal_part.evidence_url nullable; save_universal_part +
  save_self_serve_part_in_batch link checks relaxed for fitMode spec with no factory numbers; no link → Needs checking).
  Ticking cars (car specs) still needs a link: the screen says "Add the page you found it on to change car specs."
- **Auto-close (LC-21c, owner 20 Nov):** every Add parts save (parts/add, fluid-bundle, catalog-page in catalog_routes.ts)
  runs `autoResolveFromBatch` (catalog_request_autoresolve.ts): service-log requests close when the typed text holds
  the saved part's number; car asks close when the part is now listed for that car. 10 tests. REQ-3381D6DD (Interstate)
  closed by hand with the same RPC on 20 Nov (resolved 1, companies 0 — no notice).
- **Tests:** FluidPartFlow.test.tsx (1), fleet_parts_match.test.ts (+2 → 8).
- **To release:** owner runs the migration + logbook line; deploy platform-catalog + fleet-core + fleet-ops; Fleet +
  Dominion (Vercel). Then: Pending catalog → Interstate → Added — pick the part → the Interstate row.

## 0c5. Gemini model retired — FIXED 20 Nov (local, not shipped)
- Google retired `gemini-2.5-flash` for new users (research paused: gemini_http_404). One shared name now:
  `gemini_models.ts` GEMINI_TEXT_MODEL = `gemini-3.8-flash` (already used live by the vehicle document reader).
- Switched: catalog research (`catalog_research_gemini.ts`), `gemini_service.ts` (4 calls), analyze-fleet /
  parse-invoice / parse-inspection (were 1.5 / 2.0 models, also retired); price row added in `api_pricing.ts`.
- **To release:** deploy `catalog-research` by hand (`pnpm deploy:catalog-research` — NOT in the workflow's ALL_FNS)
  + fleet-core; then Dominion Pending catalog → Resume Dispatcher; the failed wheel-bearing job → Reprocess.

## 0d. LC-19 Batteries: right size, right type — BUILT 20 Nov (local). Migration `20261120013338_battery_size_and_type.sql` + `supabase/tests/battery_size_and_type_checks.sql` (B1–B4 pass locally; in CI). Dominion: `Step2BySpec` Battery type (+ test), `addPartsApi` sends `batteryType`, car spec group shows `battery_type`. NEXT: owner runs the migration + logbook line; release with LC-18; then Dominion data: Roomy `battery_jis`=B24L + `battery_type` (EFB if Eco Idle), add real batteries by size

**What exists:**
- The car spec `battery_jis` ("Battery size") in Dominion's car spec sheet.
- A Battery part type whose by-size field is `battery_jis` ("JIS size", example 46B24L).
- `universal_parts_for_variant` matches a by-size part to a car on EXACT text (`lower(btrim())`). Wipers already have
  one extra rule (connector in `universal_part.extra`).

**Gaps (owner's question: can the app log "2019 Roomy → JIS B24L / N-55, EFB if Eco Idle"):**
1. No battery TYPE (Standard / EFB / AGM) on the car or on the battery part, so a standard battery is offered to a
   stop-start car.
2. Sizes only match on exact text: "B24L" ≠ "46B24L" ≠ "N-55".
3. There is nowhere to say the car has Eco Idle. The battery type on the car covers it: EFB = stop-start.

**Fix:**
- **DB migration:**
  - a) new car spec key `battery_type` (Standard / EFB / AGM; not a by-size key, so no section of its own);
  - b) `battery_case_key(text)`: "46B24L" / "55B24L" / "B24L" → `B24L`; idling-stop codes K/M/N/Q/S/T-nn(R) → the JIS
    case (K=B19, M=B20, N=B24, Q=D23, S=D26, T=D31; R suffix = right terminal, else left);
  - c) `universal_parts_for_variant`: for `battery_jis`, match on `battery_case_key` both sides. Type rule from the
    car's `battery_type`: Standard / none → any part; EFB → EFB or AGM; AGM → AGM only. A part with no type isn't
    offered to an EFB / AGM car;
  - d) the by-size save stores `extra.battery_type` from the form (live `save_self_serve_part_in_batch` patched in
    place, the same way as `20261119164659`).
- **Dominion Add a part (by size):**
  - battery parts get a **Battery type** choice (sent as `batteryType`);
  - the wiper-only boxes (Connector, Which blade) show only for wipers.
- **Dominion car spec sheet:** `battery_type` shown in the Battery group.
- **Fleet:** nothing new — Parts that fit already lists by-size parts, so the right batteries appear on the Battery job.
- **Done-tests:**
  - B1: Roomy `battery_jis` = B24L + `battery_type` = EFB → an EFB battery entered as "N-55" fits; a Standard B24L
    doesn't; an AGM B24L does.
  - B2: a car with no type → all B24L batteries.
  - B3: a B20L battery never fits a B24L car.
  - B4: Dominion saves `extra.battery_type`.

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
