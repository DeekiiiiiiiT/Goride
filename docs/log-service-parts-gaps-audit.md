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
4. **Go live (owner, with Claude's step list) — NEXT:**
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
