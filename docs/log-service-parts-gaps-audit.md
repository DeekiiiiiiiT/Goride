# Log service — unknown parts reach Dominion, jobs know their position — build plan

**Rev 4.2 · 18 Nov 2026. Slice A and Slice B are complete, and the code review's 10 findings are fixed and re-tested. Next is
go live (step 4). Everything is local only: nothing has been run live, committed or pushed.**

**Goal:** when a fleet logs a service with a part Roam doesn't have yet, or a part that sits in one of several places on the car
(front or rear oxygen sensor), they can record it exactly, and the unknown part lands in Dominion for Roam to look up and add.

---

## 0. Start here (new chat)

**How we work:** `docs/how-we-build-playbook.md`.
- Claude writes the builder prompts. Cursor builds. Claude checks Cursor's code and runs the tests.
- Claude ports the Stitch screens.
- The owner runs anything on the live database.
- The owner is not a coder: keep replies short and plain.
- Builder prompts never contain branch, push or production steps.
- Stop any test server you start (`pnpm testcopy:stop`).

**What's left, in order:**
1. **Slice B Screens check — DONE (18 Nov).** Click-through specs `fleet-service-items` 6/6,
   `fleet-inspection-findings` 6/6, `fleet-maintenance-log-service` 3/3, `fleet-log-service-positions` 4/4 (one one-off
   failure: the log-service window closed by itself; passed on re-run), Dominion `dominion-maintenance-master` D1–D6 6/6.
   Stitch check done on real test data. Fixes made:
   - Review item line shows number · brand only with the switch on (switch off = `name · qty` as today; this broke
     `fleet-service-items` test 21);
   - history "Items used:" text is back to today's words; the number shows in the send block under it (it was shown twice);
   - Dominion Pending parts on a phone shows cards (Stitch D4) instead of a cut-off table;
   - drawer details card uses divider lines (the grey stripes made labels unreadable in dark mode);
   - "Service log" chip uses exact colours (was dark blue on blue in dark mode).
2. **Slice B Tests — DONE (18 Nov).** `e2e/fleet-log-service-unknown-parts.spec.ts`, 14/14, in the `fleet` project.
   - Done-test 8 proves the real pg_cron relay: the test adds `functions_base_url` (`http://kong:8000/functions/v1`) and
     the drain secret to the local `private.fleet_ops_secrets`, waits for the tick, then removes them.
   - The other tests call the served `parts-sourcing-drain` over HTTP. `pnpm testcopy` now serves it with the local-only
     `PARTS_SOURCING_DRAIN_SECRET=testcopy-local-drain-secret` (`scripts/testcopy.mjs`).
   - Company B is the md-disc seed cloned under other ids; both cars link to a made-up Toyota Roomy catalogue row.
   - `LS_SHOTS_DIR=<folder outside the repo>` also saves screen pictures for a Stitch check.
3. **`/code-review` — DONE (18 Nov), 10 findings, all fixed.**
   1. Find parts keys never use the typed words again; the v2 rewrite gives each open job its first request's side, position
      and part number (migration `…195343`), so repeat requests join it (done-test 18 now checks a reworded repeat).
   2. A saved line moved to another job: positions are checked against the new job; if none are sent, ones the new job
      can't have are dropped (migration `…181439`; SQL check case 6e).
   3. The unknown-parts queue runs after the service is finished and never fails the save; a replay retries it.
   4. With inspection findings off, an edit may resend the finding marks its lines already have; only new ones are refused.
   5. A save that sends `positions: null` clears them; a missing key still keeps them.
   6. A drain that runs out of time hands unreached rows back at once.
   7. An item with no name is titled by its part number, else the job name — never blank.
   8. Closed-finding names are looked up together and kept 5 minutes.
   9. One job lookup per read (high voltage + position kind); the extra scheme pass is gone.
   10. One shared line mapper (`mapDbLineToApi` in `service_items_save.ts`) for reads, saves and completion.

   Proof: local database rebuilt from the migrations; SQL checks positions / outbox / inspection findings pass; Deno 61/61;
   Fleet unit 168, Dominion 9; e2e unknown-parts 14/14, service-items 6/6, inspection-findings 6/6, log-service 3/3,
   positions 4/4, Dominion D1–D6 6/6. fleet-ops and fleet-core bundles rebuilt.
4. **Go live (owner, with Claude's step list).**
   - Run the 3 migrations on the live database, in order, each followed by its logbook line
     (`INSERT INTO supabase_migrations.schema_migrations (version, name) …`):
     `20261118181439_log_service_positions`, `20261118185817_found_work_positions`,
     `20261118195343_log_service_parts_outbox`.
   - Set the edge secret `PARTS_SOURCING_DRAIN_SECRET`, and the same value in `private.fleet_ops_secrets` as
     `parts_sourcing_drain_secret`.
   - Commit and push. That deploys fleet-ops, fleet-core and parts-sourcing-drain.
   - Switch `log_service_parts_gaps` on **for every company**.
   - Do one real run (Roomy front oxygen sensor) with the owner's screenshots, and check it against the done-tests.
5. **LS-20 (owner, any time):** add the Roomy front and rear oxygen sensors in Dominion → Add a part (Before / After cat) for
   M900A 1KR-FE, M900A 1KR-VET and M910A 1KR-FE, from the Toyota source. The shop-listing numbers 89467-B1040 and
   89465-B1120 on their own are only "Needs checking".

**Outside this plan (small, separate, when wanted):**
- Dominion e2e D7 onwards opens a "Part types" tab that is now "Jobs".
- `catalog_research_claim_checks.sql` expects `daily_limit`, but gets `busy` because its own earlier claim leaves a job
  `researching`.
- `catalog-research` is missing from `deploy-supabase-edge.yml` `ALL_FNS`.
- `e2e/dominion-pending-parts-visual.spec.ts` (not in any project; fakes the server) still uses `fleetCount`.

---

## 1. What is built (all local, uncommitted)

**Slice A — positions (complete).**
- One position list: `packages/types/src/partPositions.ts`, with a SQL twin `maintenance_position_codes_allowed`.
- The save refuses a wrong position on a new or changed line only (`position_invalid`, 400).
- An untouched saved line sends no `positions` key, so the server keeps what it has.
- Fleet:
  - "Where on the car" chips (`log-service/positionChips.ts`, `WhereOnCarChips.tsx`);
  - Save line waits until a chip is picked ("Not sure" counts);
  - found rows show chips too, and "Log it now" opens with the position picked;
  - Review shows "Where on the car: …", and history shows "Oxygen sensor · Front (before converter)".
- Wheel jobs keep their optional wheel buttons. This includes every job on a wheel scheme (Shock absorber, Wheel
  Balancing, Tire Valve Stem), because Wheel Balancing is priced per wheel.
- Tests: `e2e/fleet-log-service-positions.spec.ts` 4/4. LS-19 Dominion D5 test fixed (D6 and D12 too).

**Slice B Data — `20261118195343_log_service_parts_outbox.sql` (complete).**
- Other items can hold a part number.
- `parts_sourcing_requests.origin`, plus `catalog_research_job.requested_name` / `requested_part_number`.
- Key v2: `catalog_research_research_group_key_v2`. Open keys were rewritten to v2.
- `parts_sourcing_outbox` and its functions:
  - `_queue(work_order)`;
  - `_claim(limit)` (SKIP LOCKED);
  - `_send(id, row)` — per-company lock, re-checks deleted / unfinished, dedupe, daily limit 30;
  - `_retry(id, car_not_linked | error)`.
- `catalog_research_join_or_create_job`, shared by the outbox and Find parts.
- pg_cron `parts-sourcing-outbox-drain`. It stays quiet until its secret exists.
- Checks: `supabase/tests/log_service_parts_outbox_checks.sql`.

**Slice B Server (complete).**
- The completion step `queueUnknownParts` runs last, and only when the switch is on.
- Edge function `supabase/functions/parts-sourcing-drain` (logic in `_fleet-server/parts_sourcing_drain.ts`). It has its
  own secret, `verify_jwt = false` in `config.toml`, and an entry on the deploy list.
- Car link uses `recordVisibleToOrg` (the same rule as `filterByOrg`).
- Key v2 in TypeScript (`pending_parts_group.ts`). Pending parts groups by the stored key, returns the name, number,
  position and origins, and never a fleet count.
- The work-order read returns `sourcingState` / `sourcingReason` per item.

**Slice B Screens (built, check not finished).**
- Fleet:
  - Other item "Part number (optional)" box with its helper;
  - "Roam will look this part up and add it to the parts list." in Items used, Pick a part (typed in) and Review;
  - the Review item line reads name · number · brand · qty;
  - history shows the item with its number and the LS-16 send line.

  Files: `log-service/unknownParts.tsx` (+ test), `ItemsUsedSection.tsx`, `PickPartDialog.tsx`,
  `LogServiceReviewStep.tsx`, `ServiceHistoryRowDialogs.tsx`, `serviceHistoryItems.ts`, `types/maintenance.ts`
  (Other item number sent).
- Dominion Pending parts:
  - "Asked by" column → "Source" chips;
  - the Part cell shows the asked-for name, with a second line "<number> · <where on the car>" or "—";
  - the drawer's fleet chip is replaced by a details card (Part number + copy, Where on the car, Source, First asked,
    Reference).

  Files: `PendingPartsCatalogTab.tsx`, `PendingPartRequestDrawer.tsx`, `pendingPartsCatalogService.ts`
  (`formatPartRequestExtras`, `sourceLabels`), `pendingPartRequestExtras.test.ts`.

---

## 2. Rules the remaining work must keep (gates)
1. A service saves exactly as today, even when Dominion can't be reached. The finish step talks to nothing outside the
   database.
2. An item reaches Dominion at most once, and only after its service is finished.
3. Dominion shows only the car model, the part, its position and its source. No fleet names, plates, counts or prices.
4. Wheel jobs keep LF/RF/LR/RR, their buttons and their schedule effect exactly as today.
5. A non-wheel position never moves a schedule or a repeat alert.
6. Inspection findings gates stay: a found job is J$0 with no items.
7. Existing saved lines re-save unchanged.

**Switch `log_service_parts_gaps`:** off = no outbox rows, no non-wheel chips, no Part number box, no "Roam will look…"
lines. Key v2 is always on. It goes on for every company, never one fleet first.

---

## 3. Done-tests still to prove on the real stack (Slice B)
8. An Other item "Front oxygen sensor", 89467-TEST1, on the Oxygen sensor line (Front), finished → within 2 minutes one
   Dominion row: Roomy, the name, 89467-TEST1, "Front (before converter)", "Service log". History says "Sent to Roam…".
9. Type in 11111-TEST1 → finish → one row titled with the part type, showing 11111-TEST1.
10. Finish the same service again (replay) → no second outbox row and no second Dominion row.
11. A second test company, same part number, same car model → still one Dominion row.
12. Unlinked car:
    - it saves, and history says "Not sent yet… It will send once it is.";
    - link the car, set `next_try_at` = now, drain → sent;
    - another unlinked car whose outbox `created_at` is 31 days ago → `not_sent`, "Not sent: this car isn't linked to a Roam
      car".
13. Seed 30 requests today, finish, drain → "Will send tomorrow", with `next_try_at` = next Jamaica day 00:05. Backdate the
    30, set `next_try_at` = now, drain → sent.
14. Delete a finished service before the drain → `cancelled`, no Dominion row.
15. An outbox row for a service that isn't finished → drain → stays pending. Finish it through the real API → sent once.
16. Research paused, then disabled, then at its limit → the part still lands within 2 minutes each time.
17. Two Other items with different names and no number, on the same line → two rows.
18. The same part number from Find parts (company A) and from a service log (company B), same car → one row with both
    Source chips. Negative: the Find parts request without a number → two rows.
19. Two companies' rows for the same car and part in one drain run → one row, no error, `fleet_count` = 2.
20. Switch off → everything as today (key v2 aside), and no outbox rows.
21. Pending parts shows no fleet count anywhere.

(Slice A done-tests 1–7 are proven: the e2e positions spec plus the SQL checks and `positionsForWire` unit tests.)

---

## 4. Stitch — Slice B parts to check by eye
The Fleet screens are in `Downloads/fleet maintenn/stitch_fleet_maintenance_service_logger/` and the Dominion screens in
`Downloads/dominion partssss/stitch_pending_parts_catalog_interface/`. Read each screen's `code.html`, because the PNGs are
cut off.

**Fleet:**
- F2 — Other item with "Part number (optional)" and the helper "From the box or the receipt, if there is one." Drop the
  sparkle icon; the wording is "…add it to the parts list."
- F3 — Pick a part, typed in: Brand + Part number (optional) + the "Roam will look…" line.
- F7 — Review item line with its number, and the "Roam will look…" line.
- F8 / F9 — history item with its number and the send line (icon + words only).

**Dominion:**
- D1 — columns Car version · Part · Source · First/Last asked · Status · Result · Actions. The second line is
  "89467-B1040 · Front (before converter)" or "—".
- D2 — the drawer details card. The rest of the drawer stays as it is today.
- D3 / D4 — the states and the narrow layout.

**Drop on every screen:** invented sidebars, people's names, counts, "Export list" / "Add part manually", schema text,
telemetry text, and the invented page behind each dialog. No new buttons; buttons look like buttons; in-app overlays only.

---

## 5. Short history
- **18 Nov:** plan written and reviewed (4 rounds). The owner ran the live checks; the Stitch screens were made.
- **Slice A:** Data (Cursor) and Server (Cursor) were checked by Claude. Screens and tests were done by Claude.
- **Slice B:** Data (Cursor) and Server (Cursor) were checked by Claude. Claude's fixes along the way:
  - a per-company lock in send;
  - `recordVisibleToOrg`, so Find parts kept its old car rule;
  - the drain lets send book `car_not_linked` after its cancel checks;
  - the drain was added to the deploy list.

  Screens were built by Claude.
- Builder prompts: `docs/log-service-parts-gaps-build/cursor-A-data.md`, `cursor-A-server.md`, `cursor-B-data.md`,
  `cursor-B-server.md`.
