# Log service — Roam gives the parts (and jobs know where on the car) — build plan

**Rev 6.3 · 19 Nov 2026. Slices A and B are LIVE on main (`22773335`) behind the switch `log_service_parts_gaps`, which is
still OFF. Slice C (Roam shows the parts that fit, "Ask Roam to find it", "Plan it") is built in Data, Server and Screens
and passes its real-stack tests C1–C7 and the code review (9 fixed), local only and uncommitted on branch `parts-auto-match`. Next: go live (step 4, owner).**

**Goal:** a fleet owner (not a mechanic) never types a part number. When they log a part job (Oxygen sensor · Front), Roam
shows the parts that fit their car; if Roam doesn't have it, one tap asks Dominion to find it; they can plan the job before
buying and log price and labour later.

---

## 0. Start here (new chat)

**How we work:** `docs/how-we-build-playbook.md`. Claude writes builder prompts, Cursor builds, Claude checks Cursor's code and
runs the tests. Claude ports the Stitch screens. The owner runs anything on the live database. The owner is not a coder: short,
plain replies; one step at a time. Builder prompts never contain branch, push or production steps. Stop any test server you
start (`pnpm testcopy:stop`). Never save screenshots in the repo.

**What's left, in order:**
1. **Slice C Screens (Claude) — DONE 19 Nov (local, uncommitted).** What was built (all only while the switch is on):
   - Fleet `log-service/PartsThatFitPanel.tsx` + `partsThatFit.ts` (LC-01/02): replaces Brand / Part number / Link part on
     part jobs; waits for a place; cards (maker tile, name, maker, "For the parts store" number + Copy, badge); Chosen +
     "Using … Change"; Skip collapses it; nothing on file → Ask Roam (sends `positionCodes` as picked, "Not sure" included,
     so the "looking" key matches) → "Roam is looking · Asked on"; error + Try again; car not linked → plain line.
     Wired in `LogMaintenanceServiceDialog.tsx` (`partsPanelFor`, `pickFitPart`: clearing only clears a panel-picked part,
     so an old typed brand/number re-saves unchanged).
   - `log-service/PlanJobDialog.tsx` (LC-05): overlay → `POST /maintenance-planned-jobs`; the job then leaves this
     service (closes the window if it was the only job). Not offered when editing a service or on Log it now.
   - `FoundByInspection.tsx`: planned cards (job · place, "Planned <date>", part + number + Copy, note, Not needed / Log it
     now); title "Not done yet" only when a planned job is listed. Log it now opens with the planned part picked, banner
     "From your Not done yet list (planned …)", and the two cost hints under Labor / Parts.
   - LC-04: Other item Part number box removed; Pick a part → Type it in hides Part number while the switch is on.
   - LC-03/08 `FleetMaintenanceAlertsMenu.tsx`: unread "Part on file" rows above the alerts, marked read on open; tap opens
     Find parts (`?tab=find-parts&vehicle=…&part=<job>`). Server addition for this: `/parts/notices` items now carry
     `vehicleId` (one of the fleet's cars of that model; `vehicleIdByCatalog` + Deno test). fleet-core bundle rebuilt.
   - LC-09 Dominion `AddedPickPartPanel.tsx` in `PendingPartRequestDrawer.tsx`: "Added — pick the part" → candidates →
     "Use this part" → toast with the company count.
   - Unit tests: fleet 209/209 in maintenance-logging + find-parts + bell; Dominion pending-parts 11/11; Deno 67/67.
   - Local repair: the fleet/admin `node_modules/@roam` links pointed at the deleted `Goride-golive` worktree; fixed with
     `pnpm install --frozen-lockfile --offline`. Add to the worktree recipe: run that after removing a worktree.
2. **Slice C Tests (Claude) — DONE 19 Nov.** `e2e/fleet-log-service-parts-that-fit.spec.ts` C1–C7 **7/7** (in the `fleet`
   project). Its own made-up Roomy (`…c1`) and two Toyota oxygen sensors written into the catalogue; company B cloned as
   `md-disc-c`. Re-runs: `fleet-log-service-unknown-parts` 14/14 (done-tests 8, 9, 11, 21 updated for LC-04: no number is
   asked, so rows group by name), `fleet-log-service-positions`, `fleet-service-items`, `fleet-inspection-findings`,
   `fleet-maintenance-log-service` 19/19, Dominion `dominion-maintenance-master` D1–D6 6/6. Unit tests 189/189.
   Two screen bugs the run found, fixed: (a) the bell captured its list on open, so opening it before the messages
   loaded showed none — it now lists every unread message while open and marks each read once; (b) the cost hints only
   sat under "Labor"/"Parts" boxes, which the oxygen sensor job doesn't have — they now sit under the labour row and
   above Items used (`plannedHints`). Run command is in the spec's header.
   Previous wording of this step: New real-stack spec `e2e/fleet-log-service-parts-that-fit.spec.ts` for done-tests C1–C7
   (section 3), added to the `fleet` project's `testMatch` in `playwright.config.ts`. Re-run the existing specs:
   `fleet-log-service-unknown-parts`, `fleet-log-service-positions`, `fleet-service-items`, `fleet-inspection-findings`,
   `fleet-maintenance-log-service`, Dominion `dominion-maintenance-master` D1–D6. Update the Slice B spec where Slice C removes
   the part number boxes (LC-04).
3. **`/code-review` — DONE 19 Nov.** 10 findings; 9 fixed, 1 needs no change:
   - #1 Find parts' "asked" key dropped wheel places (LF…) → it now uses every picked place.
   - #2 Plan it now also needs the inspection findings switch (server 404 `inspection_findings_off`; screen hides the
     button), else a planned job had nowhere to show.
   - #4/#5/#9 one part-fit rule (`partFitsVerifiedCar`, `linesNeedingPartFit` in `log_service_part_fit.ts`) for every
     save and Plan it: unlinked car not checked (today's saves keep working), not-done-yet lines skipped (their part is
     never stored), all parts checked at once.
   - #6 drain report counts `notSent` and `other`. #7 the 7 missing Deno files and the Slice B/C SQL checks +
     migrations are now in CI. #8 the bell reads only this company's cars of those models (`fleet_vehicles` view, not
     every company's cars). #10 dead label code removed; one `loadJobPositionMeta` (`job_position_meta.ts`) for the
     three job lookups.
   - #3 no change: `20261118181439` (and the other two log-service migrations) are already live with logbook lines;
     the toll migration `20261118182336` dated between them is not live and goes in by hand like the others, so
     nothing runs out of order.
   - Re-checked: Deno 153/153, fleet unit 189/189, e2e Slice C 7/7, Slice B 14/14, service items 6/6. fleet-ops +
     fleet-core bundles rebuilt.
4. **Go live — IN PROGRESS 19 Nov.** Done: migration `20261119012823` run on live + logbook line (checked live);
   Slice C pushed alone to main as `87432882` + follow-up `d60a7433` (SQL check makes its own platform/engine rows;
   two non-secret "idempotency key" lines marked `gitleaks:allow`). Deploy log: fleet-ops, fleet-core,
   platform-catalog, parts-sourcing-drain deployed; Vercel deploy green. CI's "migration version list matches
   production" was already red before this push (prod has toll migration `20261117204932`, not on main); inventory
   done-test 06 is flaky (passed on re-run). **The live switch `log_service_parts_gaps` was already `{"enabled": true}`**
   (checked 19 Nov), so Slices A+B+C are live for everyone. Left: the real Roomy run (step 5 / LS-20 for real parts).
   Original list:
   - run `supabase/migrations/20261119012823_log_service_parts_that_fit.sql` on live, then its logbook line
     `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261119012823', 'log_service_parts_that_fit') ON CONFLICT (version) DO NOTHING;`
   - ship Slice C **alone** to main (the branch also carries toll-disputes work whose 7 migrations aren't live): use the
     worktree recipe in memory `golive-worktree-recipe` (worktree from `origin/main`, copy only this feature's files, rebuild
     fleet-ops + fleet-core bundles, test, push). Check the deploy log for fleet-ops, fleet-core, platform-catalog.
   - switch `log_service_parts_gaps` on **for every company**:
     `INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('feature_flag:log_service_parts_gaps', '{"enabled": true}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`
   - one real Roomy run with the owner's screenshots against C1–C7.
5. **LS-20 (owner, any time; needed before C1/C4 can be proven live):** add the Roomy front and rear oxygen sensors in Dominion
   → Add a part (Before / After cat) for M900A 1KR-FE, M900A 1KR-VET and M910A 1KR-FE, from the Toyota source. Shop numbers
   89467-B1040 / 89465-B1120 alone are only "Needs checking". Then answer any open asks with Dominion's new "Added — pick the
   part".

**Already live (do not redo):** migrations `20261118181439_log_service_positions`, `20261118185817_found_work_positions`,
`20261118195343_log_service_parts_outbox` (with logbook lines); edge secret `PARTS_SOURCING_DRAIN_SECRET` and the same value in
`private.fleet_ops_secrets` (`parts_sourcing_drain_secret`); edge function `parts-sourcing-drain` deployed.

**Test copy tips:** `pnpm testcopy` serves `parts-sourcing-drain` with the local secret `testcopy-local-drain-secret`. If md-disc
teardowns fail with "permission denied to set parameter session_replication_role", run as `supabase_admin`
(`PGPASSWORD=postgres`, `-h 127.0.0.1`): `GRANT SET ON PARAMETER session_replication_role TO postgres;`. Deno tests always with
`--node-modules-dir=none`. After `_fleet-server` edits rebuild bundles: `node scripts/build-edge-bundle.mjs fleet-ops` and
`… fleet-core`.

**Outside this plan (small, separate, when wanted):**
- Dominion e2e D7 onwards opens a "Part types" tab that is now "Jobs".
- `catalog_research_claim_checks.sql` expects `daily_limit` but gets `busy` (its own earlier claim leaves a job `researching`).
- `catalog-research` is missing from `deploy-supabase-edge.yml` `ALL_FNS`.
- `e2e/dominion-pending-parts-visual.spec.ts` (in no project; fakes the server) still uses `fleetCount`.

---

## 1. Rules (gates)
1. A service saves exactly as today, even when Dominion can't be reached; asking Roam never blocks a save.
2. A logged item reaches Dominion at most once, and only after its service is finished (Slice B outbox).
3. Dominion shows only the car model, the part, its place and its source. No fleet names, plates, counts or prices.
4. Wheel jobs keep LF/RF/LR/RR, their buttons and their schedule effect exactly as today.
5. A non-wheel place never moves a schedule or a repeat alert.
6. A "not done yet" job (inspection or planned) is J$ 0 with no items.
7. Existing saved lines re-save unchanged.
8. No screen asks a fleet user for a part number.
9. One ask per part per car model across all fleets (key v2).
10. Parts are information only: no prices, stock or selling.
11. Switch `log_service_parts_gaps` off = today's screens and answers exactly. It goes on for every company, never one first.

---

## 2. What is built (Slice C Data + Server, local, checked)

**Data — `20261119012823_log_service_parts_that_fit.sql`** (checks: `supabase/tests/log_service_parts_that_fit_checks.sql`)
- Work order status `planned`: a job planned before buying; one not-done-yet line, J$ 0; never finished, booked or counted.
  `maintenance_found_line_is_open` accepts a `planned` parent, so the Not done yet list, Not needed and Log it now work as-is.
- `fleet_open_found_work` also returns `source` (`planned` / `inspection`), `partId`, `partName`, `partBrand`, `partNumber`.
- `fleet_plan_job(org, actor, vehicle, job, places[], partId, note, idempotencyKey)` → `{workOrderId, lineId, created,
  alreadyListed}`; checks places, car, job, part; one per car + job + places (locked against double taps).
- `fleet_parts_notices`: `vehicle_catalog_id`, `maintenance_component_id`, `position_codes`, `read_at`;
  `fleet_parts_notices_mark_read(org, ids[])`.
- `catalog_resolve_request_group(groupKey, partId, actor)`: answers every open ask in the group with that part, marks the
  research job `added`, one "Part on file" notice per company answered by that call.

**Server (fleet-core / fleet-ops / platform-catalog), behind the switch where it changes Fleet behaviour**
- `GET /make-server-37f42386/parts/find?vehicleId&componentId&places=before_cat` — places filter (wheel codes go through the
  wheel filter, others through the place filter: `splitPlacesForFind` in `parts_finder.ts`); each part has `fitLabel`
  (`made_for_car` / `also_fits` / `check_before_buying`) and `listingPlace`; plus
  `ask: { state: "none" | "looking", askedAt, byYou }` (same key as a real ask).
- Ask Roam = existing `POST /make-server-37f42386/parts/request` with `{ kind: "add_part_info", vehicleId,
  maintenanceComponentId, positionCodes, needText }` (no part number).
- `POST /maintenance-planned-jobs` (fleet-ops) `{ vehicleId, jobId, places, partId, note, idempotencyKey }`; the part must fit
  the car (`line_part_not_for_car`); switch off → 404 `log_service_parts_gaps_off`.
- Planned work orders: left out of `GET /maintenance-work-orders` unless `status=planned`; PATCH / complete / void → 409
  `planned_job`. History and KPI views already skip them.
- A chosen `partId` on a saved line must fit the car (every save path, incl. editing a logged service); unchanged lines skip.
- `GET /make-server-37f42386/parts/notices` → `{ items: [{ id, kind, title, body, createdAt, read, carLabel, jobId, jobName,
  places }], unreadCount }`; `POST …/parts/notices/read { ids }`.
- Dominion: `GET …/admin/pending-catalog/parts-queue/:groupId/candidates` → `{ items: [{ partId, name, brand, number, place,
  fitLabel }] }`; `PATCH …/parts-queue/:groupId { action: "added", partId }` → `{ ok, resolved, companies }`.
- Tests: Deno 124/124 (finder places, ask key vs a real ask, planned guards, part fit, plus all Slice A/B suites).
- Builder prompts used: `docs/log-service-parts-gaps-build/cursor-C-data.md`, `cursor-C-server.md`.

---

## 3. Slice C — what the screens must do (findings LC-01 … LC-09)

- **LC-01 Parts that fit this car (Fleet, Log service).** On a part job (`is_part`), once a place is picked, replace the old
  Brand / Part number / Link part boxes (`LogServiceLineDetailsStep.tsx` ~427 / ~492) with the panel: cards from
  `/parts/find?places=…` (logo, name, maker, "For the parts store" number + Copy, badge from `fitLabel`). Tap = the line's
  `partId`. "Skip — I don't know the part" collapses it. Labour / Service charge stay.
- **LC-02 Ask Roam.** No parts → "Roam doesn't have this part for your <car> yet" + **Ask Roam to find it**; after the tap (or
  when `ask.state = looking`) → "Roam is looking for it · Asked on …"; the button never shows twice.
- **LC-03 / LC-08 Roam added.** The maintenance bell (`FleetMaintenanceAlertsMenu.tsx`) shows unread parts messages from
  `/parts/notices` above the alerts and marks them read when opened; tapping opens Find parts for that car and job.
- **LC-04 No part number boxes.** Remove "Part number (optional)" from the Other item (`ItemsUsedSection.tsx`) and from Pick a
  part → Type it in (`PickPartDialog.tsx`); Brand stays. Old saved numbers still show in history.
- **LC-05 Plan it.** "Plan it — I'll buy it first" → in-app overlay → `POST /maintenance-planned-jobs`; the Not done yet list
  (`FoundByInspection.tsx`) shows planned jobs with their part and **Log it now** / **Not needed**; Log it now opens the job
  with the part chosen and the cost hints "What did the garage charge for fitting it?" / "What you paid for the part".
- **LC-06** Slice B's automatic send after saving stays (name only, never a user part number).
- **LC-07** (server, done) Find parts tells front from rear oxygen sensors.
- **LC-09 Dominion "Added — pick the part".** In the Pending parts drawer (`PendingPartRequestDrawer.tsx`), an action that
  lists `…/candidates` and calls `PATCH … { action: "added", partId }`.
- **LC-10 (found 19 Nov, owner's real Roomy run) An inspection's "not done yet" job never says what to buy.** Logging an
  inspection with "Oxygen sensor · Front · Not done yet" shows no parts at all. They only appear later, after **Log it now**,
  when the part has already been bought. The review row also drops the place ("Oxygen sensor", not "· Front").
  **Fix:** show a read-only "Parts to buy for your <car>" block, which is the same cards from `/parts/find` for that job +
  place, with Copy part info and no "tap the one you're using":
  (a) under the found job in Log service step 3, once it is Not done yet and a place is picked;
  (b) on every inspection-found card on the Not done yet list (`FoundByInspection.tsx`), looked up live, so jobs already
  saved get it too. No database change.
  The review row and the found card title show the place (`Oxygen sensor · Front (Air fuel ratio sensor)`).
  Done-test **C8:** inspection + Oxygen sensor Front Not done yet → step 3 and the Not done yet card both show the Toyota
  89467-B1040 card with Copy part info. The review row reads "Oxygen sensor · Front (Air fuel ratio sensor)".
  **BUILT 19 Nov (local, not on main):**
  - `PartsThatFitPanel` `toBuy` mode: read-only cards, "Parts to buy for your <car>", no Skip / Plan it / Using; Ask Roam
    stays.
  - `FoundWorkSection` `renderParts` is wired as `renderFoundParts` in `LogMaintenanceServiceDialog`.
  - `ReviewFoundGroup` names the place.
  - `FoundByInspection` inspection cards get the place in the title plus `FoundPartsToBuy`.
  - Server: `GET /maintenance-found-work` now also returns `partsGapsEnabled` and each item's `jobCode` (for Toyota's
    place names). fleet-ops is rebuilt; **the list card needs the fleet-ops deploy before it shows on the owner's app.**
  - Unit tests: fleet 219/219. Not yet: e2e C8 and the code review.
- **LC-11 (19 Nov, owner) Pending jobs need their own tab; Work orders and Inspections were dead.**
  - Inspections only listed 11 driver-check template names. 0 findings ever on live.
  - Work orders was a board of draft/open/scheduled/in-shop/awaiting-parts jobs. All 39 live work orders are completed or
    cancelled, so it was always empty, and found or planned jobs never showed there.
  **Fix (BUILT 19 Nov, local):**
  - Both tabs are removed: `MaintenanceWorkOrdersTab.tsx` and `MaintenanceInspectionsTab.tsx` are deleted, and so are
    their CSS hide rules.
  - New hub tab **Not done yet** (`not-done-yet`, amber count badge) is `FoundByInspectionSection` with no `vehicleId`,
    so it lists every car's jobs. Each card names its car (`found-card-car`). The title is "Not done yet", and the empty
    line is "Nothing waiting on any car."
  - The "Found by inspection" KPI card opens this tab, and `openOldestFoundCar` is removed.
  - Old `?tab=work-orders` / `?tab=inspections` links land on the new tab.
  - The tab reloads after a Log service save.
  - The per-car Due items drawer is unchanged.
  - e2e `fleet-inspection-findings` done-test 2 is updated for the tab.
  - Unit tests: fleet vehicles 262/262.
- **LC-14 (19 Nov, owner; REPLACES LC-12) "Add a job" belongs to the inspection.** The owner wants no standalone
  button. Each saved inspection can take more found jobs, and they show "From inspection · <date> · <garage>" exactly
  like ones logged with it. The picker looks like Log service's Work done step.
  **BUILT 19 Nov (local, not on main):**
  - Migration `20261119211043_add_found_job_to_inspection.sql` adds `fleet_add_found_job` (service_role only).
    - It only INSERTS one J$ 0 recommended line (`values_json.found_by_job` = the service's inspection job), so the
      locked service row (total, version, date) is never updated.
    - It refuses: deleted or unsaved service, service without an inspection, inspection as the job, bad place, other
      company, no actor.
    - Same car + job + places already waiting → `alreadyListed`, using the same advisory lock as `fleet_plan_job`.
    - Check `supabase/tests/add_found_job_to_inspection_checks.sql` (6 proofs) passed on the local copy and is wired
      into `parts-sql-checks.yml`.
  - Server (fleet-ops, rebuilt):
    - `POST /maintenance-work-orders/:id/found-jobs` (vehicles.edit, inspection-findings switch, car access, place
      check), with `mapFleetAddFoundJobError` + Deno test.
    - `GET /maintenance-work-orders/:id` also returns `canAddFoundJobs` + `inspectionJobName`.
  - Screens (REBUILT 19 Nov on owner's word: "it should work the same way logging a service works"). The separate
    `AddFoundJobToInspectionDialog` is deleted. **Add a job** opens the real `LogMaintenanceServiceDialog` with
    `addToInspection = { workOrderId, inspectionLine }`:
    - Starts on Work done (no Date & mileage; step 1 can't be clicked; Back from an empty Work done closes). There are
      no service packages and no draft saving.
    - Same tiles, search, job-fit hiding, sections and multi-tick. Inspection jobs are refused with a toast.
    - Details passes `findOnly` to `LogServiceLineDetailsStep`: only Where on the car (chips or wheel buttons),
      Parts to buy (`partsPanelFor` → read-only `toBuy`; services show none) and a note. No action, prices, labour,
      warranty, items or total.
    - Review is `AddToInspectionReview` (`log-service/addToInspection.tsx`): each job · place, note, J$ 0, Edit /
      Remove. **Add N jobs to this inspection** calls `/found-jobs` once per job. A failed job stays listed, so a
      retry never adds a job twice. The toast reports added / already listed.
    - Hosts pass `onAddToInspection`: Not done yet tab + Due items drawer (`FoundByInspectionSection`), and Service
      details via `MaintenanceServiceHistoryPanel` / `ServiceHistoryViewDialog` (when `canAddFoundJobs`). The hub
      opens Log service through `prepareLogForVehicle(…, addTo)`.
    - The standalone tab button and `AddPendingJobDialog` are deleted.
    - Unit tests: `addToInspection.test.tsx`, `LogServiceLineDetailsFindOnly.test.tsx`, and FoundByInspection's
      callback test. Fleet vehicles: 31 files, all pass. A real-stack e2e for this flow is still to write.
  - Unit tests: fleet vehicles, 30 files, all pass.
  **Owner to run on live:** the migration + logbook line, then go live with the fleet-ops deploy.
- **LC-15 (19 Nov, owner) Garage quote + Pending / Done.** An inspection gives a price; it isn't paid until the work
  is done. **BUILT 19 Nov (local, not on main):**
  - **Quote (optional), never spend.** It is stored only as `values_json.quote_amount` on the J$ 0 found line, so it
    never touches `line_total`, the service total or spend.
    - Entered in the inspection's "Not done yet" rows (`QuoteInput` in `FoundWorkSection`, `FoundDraft.quote`) and
      in add-to-inspection Details (`findOnly.quote`).
    - Migration `20261119215824_found_job_garage_quote.sql` replaces `fleet_add_found_job` with an optional
      `p_quote`: rounded, 0 = none, negative → `quote_invalid`.
    - `/found-jobs` takes `quote`; `GET /maintenance-found-work` returns each item's `quoteAmount`.
    - SQL check proofs 7/7b passed on the local copy; Deno mapping test.
  - **Card:** "Garage quote J$ 12,000 · not paid". The tab shows "J$ X quoted, waiting". **Pending | Done** replaces
    the Log it now button (Pending is the default; Done keeps the `found-log-it-now` test id).
  - **Done** = Log it now: Date & mileage with its estimate and "Use one of these", then the job.
    - The banner shows the quote.
    - A service job's charge is filled with the quote; part jobs show the planned cost hints.
    - Review → Service history. Closing the window leaves the job Pending.
  - **Also done on this visit?** (`AlsoDoneOnVisit.tsx`): the car's other pending jobs, ticked into the same
    service. Each card closes its own found line (`foundFor` → `fromFoundLineId`), and a job already in the service
    can't be ticked twice.
  - Add mode also hides "costs and labour" and the subtotal.
  - Unit tests: fleet vehicles 31 files, all pass.
  **Owner to run on live:** `20261119215824` + logbook line.
- **LC-16 (19 Nov, owner) The quote is the SAME job form as Log service.** "They must work almost the same way."
  This replaces LC-15's single quote number box. **BUILT 19 Nov (local, not on main):**
  - **Quote mode** (`LogServiceLineDetailsStep` `quoteMode`): the normal form (charge / labour / parts boxes, Items
    used, positions, Parts to buy) with a "Garage's quote — not paid yet" banner, a note, and the total reading
    "Quote total". `findOnly` and `QuoteInput` are deleted.
  - Used for add-to-inspection jobs, and for **quote cards**: every "Not done yet" job of an inspection being logged
    gets its own job card. Cards are optional (Continue doesn't wait for them) and say "Garage quote saved · not done
    yet" / "add the garage's quote (optional)".
  - **Saving a quote card never makes a done job.** `withQuoteOnFoundLine` writes `values.quote_amount` (total) +
    `values.quote` (`quoteSnapshotOf`: values, labour hours/rate, brand, part, items) onto the J$ 0 found line;
    `draftsFromLines` / `foundLineFromDraft` carry it so re-saving the inspection keeps it.
  - Add-to-inspection sends `quote` = form total + `quoteDetail` = snapshot.
  - Migration `20261119222412_found_job_quote_detail.sql` adds `fleet_add_found_job` with `p_quote_detail jsonb`
    (an object ≤ 20 KB, else `quote_invalid`). It is stored as `values_json.quote`; no item rows are written and
    `line_total` / `items_amount` stay 0. Check proofs 8/8b passed on the local copy.
  - `GET /maintenance-found-work` returns `quoteDetail`.
  - **Done fills it all back in.** `openCategoryForm` applies the snapshot (boxes, labour, items, part) to the
    found job's card; that save is the only spend.
  - **Also do on the job card** (`alsoDoSlotFor`, from `maintenance_job_relations`, e.g. Throttle Body Cleaning →
    Relearn "Needed after cleaning or the idle will be rough") with Add. On a quote card the added job becomes
    another found job + quote card.
  - Unit tests: fleet vehicles 31 files, all pass.
  **Owner to run on live:** `20261119222412` + logbook line.
- **Code review 19 Nov evening (9 findings, all FIXED, local):**
  1. The fleet-ops `routes.generated.json` (160 routes, with `/found-jobs`) and fleet-core (+ `/parts/notices`) are
     regenerated; `edge-route-manifest --all --check` passes. Timestamp-only changes to other manifests were reverted.
  2. Migration `20261119224647_parts_outbox_request_delete.sql`: the check is now `request_id IS NULL OR state IN
     (sent, merged)`, so deleting a request a sent row points at works (the row stays sent, link null). Proof added
     to `log_service_parts_outbox_checks.sql`, and the migration is in CI paths.
  3. Pending parts Looking / Can't find change only `open` / `in_progress` asks (`.select("id")`), and
     `notifyFleetsRequestOutcome` gets just those request ids.
  4. `parseLineItems` `otherPartNumberAllowed`: `prepareWorkOrderLines` looks up `log_service_parts_gaps` only when
     an Other item sends a part number; switch off → `part_number_not_allowed`.
  5. The drain cancels a row whose item, line or service is gone (no retries into not_sent/error).
  6. "Added" with a non-UUID partId → 400 `part_id_invalid`.
  7. `displayNamesFor` doesn't cache a failed `getUserById` (`{error}`), and the cache is capped at 500
     (`rememberName`).
  8. `currentRoundRows`: a key with an open ask shows only today's open round.
  9. `loadDrainBatch`: 4 `.in()` reads per batch.
  - Re-checked: Deno 1234 passed; fleet vehicles 276; Dominion 33; SQL checks (outbox, add-found-job,
    parts-that-fit) pass on the local copy.
  - fleet-ops + fleet-core bundles are rebuilt. The drain fix ships with `parts-sourcing-drain`, the pending-parts
    fixes with `platform-catalog`.
  **Owner to run on live:** `20261119224647` + logbook line. **DONE + checked live 19 Nov.**
- **Real-stack e2e 19 Nov (test copy):**
  - New `e2e/fleet-inspection-not-done-yet.spec.ts` (fleet project), **N1–N4 4/4**:
    - N1: an inspection Not done yet job shows the parts to buy, gets a quote card, and Review names the place.
    - N2: the tab — the old `?tab=work-orders` link lands there; place, quote, quoted total, parts to buy, From
      inspection, View inspection.
    - N3: add mode, Also do: Relearn, quotes → two J$ 0 lines on the same inspection; total unchanged; no item rows.
    - N4: Done → quote filled in, Also done on this visit → one completed service (J$ 9,000), both lines closed.
  - Regression all green: Slice C 7/7 + inspection findings, 13 passed; positions + unknown parts + service items,
    24 passed. Fleet unit tests 276/276.
  - Two fixes found by e2e:
    - The items total line reads "Quote total:" on quote cards.
    - "Also do" is read from every loaded group, and a search-picked job's own group loads on demand. The test copy's
      only pickable group is Shop fees; live groups without sections were also dropped before.
  **Next: go live** (worktree from origin/main, this feature's files only; owner pushes).
- **LC-12 (19 Nov, owner; SUPERSEDED by LC-14, code deleted) Add more jobs after an inspection is saved.** Fleet has no "edit a saved service" screen, so an
  inspection's later finds had no way onto the list.
  **Fix (BUILT 19 Nov, local):** an **Add a job** button on the Not done yet tab opens `AddPendingJobDialog.tsx`, an in-app
  overlay:
  - pick the car;
  - search for the job (inspection jobs are left out);
  - pick where on the car (chips, or side/wheel buttons);
  - pick a part from Parts that fit, optional;
  - add a note → `POST /maintenance-planned-jobs`, the same server as Plan it, with no server or database change.
  The button is hidden when the list says the parts switch is off (`partsGapsEnabled === false`; an older server that
  doesn't say still shows it, and the save itself checks the switch). The list reloads and the counts refresh after
  adding. These jobs read "Planned <date>" and carry the note.
  - Unit tests: fleet vehicles 266/266.
- **LC-13 (19 Nov, owner) A found job must show which inspection it came from.**
  **Fix (BUILT 19 Nov, local):** on inspection-found cards (the tab and the Due items drawer), the grey "Found …" line is
  now an indigo **From inspection** box ("Found 22 Aug 2026 · 89 days waiting · Inspection / diagnostic fee at
  Whol-Hearted Car Service Ltd") with a **View inspection** button. The button opens that service in
  `ServiceHistoryViewDialog`, read-only, with its own "found" list. No server change. Unit test added, and fleet vehicles
  tests all pass.

**Done-tests (Slice C)**
- C1. Roomy · Oxygen sensor · Front with the Toyota front sensor in Dominion → the panel shows it "Made for your car"; tap →
  the line saves with that part; no part number box anywhere.
- C2. Same car, Rear, nothing in Dominion → "Roam doesn't have this part…" + **Ask Roam to find it** → one Dominion row
  (Roomy · Oxygen sensor · Rear (after converter) · Source "Find parts"); the panel then reads "Roam is looking for it".
- C3. A second company asks for the same part → still one Dominion row.
- C4. Dominion "Added — pick the part" → both companies get the "Part on file" message; the panel now lists it.
- C5. **Plan it** → on "Not done yet" with Rear and the part, J$ 0; **Log it now** opens it with the part chosen; saving with
  price and labour takes it off the list. The planned job never shows in service history or spend.
- C6. Other item "Exhaust clip", no number, saved → one Dominion row by name; no part number was asked.
- C7. Switch off → today's screens exactly.

---

## 4. Stitch (look = keep, words = this plan)
Prompt: `docs/stitch/log-service-parts-that-fit-fleet-prompt.txt`. Screens:
`Downloads/fleet add missing p/stitch_roam_fleet_part_matcher/` (10 screens + DESIGN.md "Fleet Precision"; read each
`code.html`, the PNGs are cut off). Screen → area: 1 panel none chosen, 2 part chosen, 3 Roam doesn't have it + Ask Roam,
4 Roam is looking, 5 Plan it overlay, 6 Not done yet list, 7 Log it now with the part chosen, 8 Roam added notification,
9 panel states, 10 phone 390px.
- **Keep:** panel title + helper; three part cards (logo, name, maker, "For the parts store" number, Copy, badge); Chosen
  state + "Using … Change"; empty card with indigo **Ask Roam to find it**; "Roam is looking · Asked on"; Plan it overlay;
  Not done yet card with Log it now / Not needed; Log it now with the part chosen + the two cost hints; the notification row;
  the 5 states; phone layout.
- **Drop everywhere:** the invented left sidebar and page behind the dialog (KPI cards, tables); renamed dialog titles ("Log
  Fleet Service", "Log Service Entry"); VINs, engine codes, "P0135", "Verified by VIN", "Component Line Item #1"; prices,
  "In stock", SKU, "GUARANTEED FITMENT", "OEM Direct Match", sensor voltages; maker lines "Denso OEM Manufacturer" / "NGK Spark
  Plugs" → "Denso" / "NGK".
- **Per screen:** 1 job icon "$" → today's job icon. 2 "Labor / technician installation cost" → today's "Service charge".
  5 drop the wrong odometer 84,210 km, "J$ 28,450 est.", "Pre-allocation status", the toast inside the overlay. 6 drop
  "Recommended size 21"", "+ Add job", "Done". 7 same cards as screen 1 (not changed numbers + "Switch"); drop "Prefilled in
  items", "1 Part Queued", "Part code:". 8 only the dropdown. 9 drop "ID: PST-01", "ERR_CATALOG_TIMEOUT", "Spec v3.4", "Roam
  Vehicle Intelligence Gateway", the invented Front/Rear Placement buttons. 10 "Selected for this service" only on the chosen
  card; drop the "Schedule Service" header.
- Buttons look like buttons, in-app overlays only; Dominion colours as exact hex (dark mode renames colour names).

---

## 5. Short history
- **18 Nov — Slices A + B** (positions; unknown parts sent to Dominion through an outbox and the `parts-sourcing-drain` edge
  function; Dominion Source chips + details card). Built, e2e `fleet-log-service-unknown-parts` 14/14, code review 10/10
  fixed, pushed alone to main as `22773335`; migrations, drain secret and deploy done live. Switch left off.
- **19 Nov — owner's first real run:** typing a part number is wrong for normal users → Slice C planned, Stitch made.
- **19 Nov — Slice C Data + Server** built by Cursor, checked by Claude. Claude's fixes: "Part on file" only for asks answered
  by that call; a per car + job lock on Plan it; the ask check now includes the wheel fit (brake pads); wheel places go through
  the wheel filter (else every front brake pad was dropped); the edit-a-logged-service path checks the part fits; a missing job
  on `places` no longer crashes; user ids read `rbacUser.userId` (was `id`: "added by", "looking" assignee and Find parts
  `created_by` were blank, and the request-draft routes refused everyone).
- Builder prompts: `docs/log-service-parts-gaps-build/` (A, B and C rounds).
