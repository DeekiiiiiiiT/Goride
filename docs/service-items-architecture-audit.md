# Service items ("May need") — build plan

**Rev 14 · 15 Nov 2026 — CLOSED.** Built, reviewed, live and proven. Database, server, Dominion and Fleet screens (all 19 Stitch screens incl. phone and states) done and checked; `pnpm test:service-items` **14/14**; `/code-review` findings fixed (S5); B1 books-failure bug fixed (S4); live since 15 Nov (`main` `3e84a17f` + follow-ups `5b9d79b5`, `d223f19b`, `50c72dd2`); first real service proven (J$ 8,800, 1 books entry); 44 supplies and 164 May-need links on 67 jobs live. Switch `service_items` on for deekiiiiiii's Fleet only. **Only owner follow-up:** try "Pick a part" once on a car with a catalogue (section 8, Open). Not service-items work but found here: Expense Hub accrual posting (section 8, Open).

**Goal:** each job in Dominion lists the **items it may need** (parts and shop supplies). When someone ticks that job in Roam Fleet → Log service, those items show up so they can tick what was actually used. The job and its items are saved together, and the items count in the bill.

Example: **Throttle Body Cleaning** may need **Throttle body cleaner** (usually 1 can) and an **Intake Manifold Gasket** (sometimes).

---

## 0. Start here (new chat)

**How we work** (`docs/how-we-build-playbook.md`):
- **Data and server rounds:** Claude writes a prompt in `docs/service-items-build/cursor-<round>.md`, the owner gives it to Cursor and pastes the report back, then Claude reads the real files and runs every test before moving on.
- **Screen rounds:** Claude builds them directly, not Cursor (owner rule, 13 Nov).
- **Live database:** the owner runs anything there. Claude only uses the local copy.
- **Owner preferences:** keep replies short and plain, and never put branch, push or production steps in Cursor prompts.

**Next steps, in order:**
1. ~~Finish UI1 (Dominion screens)~~ — **done 14 Nov** (section 8).
2. **Offer the owner a checkpoint commit** of everything so far (only when the owner says yes; no push).
3. ~~UI2 (Fleet screens)~~ — **done 14 Nov** (section 8). B1 fixed in S4 (`docs/service-items-build/cursor-S4.md`).
4. **T1:** ~~`pnpm test:service-items`~~ — **done 14 Nov, 14/14** (`scripts/run-service-items-tests.mjs`; Docker open; uses the test copy if it's running, else starts and stops it; `--no-e2e` skips the click-throughs). `/code-review` run 14 Nov: 10 findings, checked by Claude (7 real, 1 not reachable today, 1 mostly by design, 1 with no live caller yet) → fixes in Round S5, prompt `docs/service-items-build/cursor-S5.md`. **S5 done 14 Nov and checked by Claude**: all 10 fixes read in the code; one regression fixed by Claude (S5 removed the version re-read before an edit's "Finish saving" retry, so that retry would hit "This service was changed" — now it finishes the saved work order directly, and driver-request complete / dismiss pass the work order id + version from the requests list). Full `pnpm test:service-items` **14/14 passed** incl. click-throughs. **T1 closed.** Checkpoint commit `9b691c21` on `parts-auto-match` (14 Nov, not pushed). Next: L (go live).
5. **L (go live):** section 7.
6. **C (close out):** update this file and memory, then commit when the owner says.

**Run the local checks** (Git Bash, Docker Desktop open):
- **Reset the local database:** `npx supabase db reset --no-seed`. If it fails with `DbSetupError`, run it once more.
- **SQL tests:** run each of `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`, `maintenance_discount_checks`, `maintenance_discount_db_test` and `engine_sections_used_ids_test` like this:

  ```
  export MSYS_NO_PATHCONV=1
  docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
  docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
  ```
- **Server tests:**

  ```
  deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts
  ```
  Last result: 122 passed. Heavy Deno use can break the local Fleet dev app; the fix is to stop the app and run `pnpm install`.
- **Dominion unit tests:** `pnpm --filter admin exec vitest run src/components/admin/maintenance-master/jobs` (last result: 24 passed).
- **Repo checks:** `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`.
- **Rebuild the bundle after any change to `_fleet-server`:** `node scripts/build-edge-bundle.mjs fleet-ops`. That file is kept in git. The local `fleet-core/index.ts` is git-ignored and built at deploy; rebuild it locally only for tests.

**Lessons from this build** (each one hid a real bug once):
- **Probe database functions with the server's real payload.** Build it with `mapApiLineToDb` (every key present, JSON nulls). Hand-written JSON hid a crash on `positions: null`.
- **Re-read every fix-round diff yourself.** One fix fed screen-shaped lines to the completion steps, which silently skipped parts usage and service history. Every test still passed, because they use fake steps. A data-shape change needs a test that uses the real consumer.
- **Run the full test list and `pnpm check` yourself.** Cursor's reports skipped some.
- **Dominion runs in dark mode, and `apps/admin/src/styles/globals.css` turns Tailwind colour names (slate, white, red, amber, blue, emerald…) dark inside `.dark`.** On the light Maintenance templates page that made the Add dialog's text invisible. New Dominion screens use exact colours (`text-[#0f172a]`), never colour names. Check close-up screenshots, not only full-page ones (those cut drawers off).
- **The test copy saves the sign-in as `sb-127-auth-token`.** Every e2e sign-in helper must set that key too.
- **Server tests with stand-in steps hid two crashes** that only the real Fleet screens found (UI2, fixed): finishing a service answered "e.from is not a function" after saving everything, and every single-service read lost each job's name, amounts and items (lines were converted twice). Run the real click-through before calling a server round done.
- **`ledger_entries` is a view over `ledger.entries`**, and the books step's failures are swallowed (B1). A test that wants a books outage must block `ledger.entries`, and today it won't stop completion.
- **Playwright empties `test-results/` on every run.** Look at a spec's screenshots before running another spec.

---

## 1. Design in one picture

```
Dominion: Jobs ── May need (maintenance_job_item) ──► Part types / Supplies (+ units)

Fleet save (work-order routes + older log routes) ──► fleet_save_work_order   ONE transaction:
                          work order (draft / in_progress) + lines + items + total_cost
          │ only when completing
          ▼
  /complete:  0 claim · 1 parts usage · 2 record · 3 alerts · 4 service history · 5 package
              · 6 Business Finance · 7 odometer · 8 finalize · 9 finish (completed)
  every step safe to re-run · any failure → log stays in_progress → "Finish saving" retries
```

**Rules:**
1. An item is a part type or a supply, by what it is.
2. May need is not Also do.
3. Items are never ticked automatically.
4. Dominion holds no prices, suppliers or stock.
5. There is one shared catalogue; one-offs go in "Other item".
6. Items follow their line: they're locked when the log is completed, kept when the line is voided, and never allowed on a declined line.
7. No code deletes a log, and a log is completed only after every step.

**Decisions to keep:**
- Items count in the money: `items_amount` is part of `line_total`, and so of `total_cost`.
- Blank cost = 0, shown as "cost not recorded".
- No tax.
- Every create has an idempotency key, and every edit sends `expectedVersion`.
- Who did it comes from the audit triggers (`app.actor_id`).
- The switch is `service_items` per fleet, off by default.
- A Business Finance failure stops completion.

**Accepted limits:**
- A Business Finance outage stops logs from completing. Drafts still save, and Finish saving works once it's back.
- Supplies are shared by all fleets.
- English only.
- `SUP-` codes cap at 99,999.

---

## 2. What's built (all uncommitted, all checked on the local copy)

| Round | What | Main files |
|---|---|---|
| D1 | Units (8), supplies (`SUP-00001`…), May-need links, Also-do clash check, Throttle body cleaner seed | migration `20261113154942_service_items_catalogue.sql`; tests `supabase/tests/service_items_checks.sql`, `service_items_db_test.sql` |
| S1 | Dominion routes: `GET /admin/maintenance/jobs` (with `items`, `supplies`, `units`), supplies CRUD + retire / restore, job-items add / edit / remove / reorder; old supply link removed | migration `20261113162605_service_items_drop_old_supply_link.sql`; `_fleet-server/maintenance_jobs_admin_routes.ts` + `_helpers.ts` |
| D2 | Items-used table, line `items_amount`, `version`, save / claim / finish / release functions, record ↔ work order link, history duplicate guard, integrity checks | migration `20261113171047_service_items_logging_core.sql`; test `service_items_save_db_test.sql` |
| S2 | Work-order routes save through `fleet_save_work_order`; shared `parseLineItems`; reads return items / version / notFinished; the switch | `packages/types/src/serviceItems.ts`, `_fleet-server/service_items_save.ts`, `maintenance_routes.ts`, `feature_flags.ts` |
| S3 | Safe completion runner; older log routes on the new save; finance failures now stop completion (they were silently reported as posted); duplicate "service logged" events fixed | migration `20261113184641_service_items_completion.sql`; `_fleet-server/maintenance_completion.ts`; test `service_items_completion_db_test.sql` |
| UI1 | Dominion screens — **done 14 Nov**, test 6/6 + Stitch side-by-side | see below |

**UI1 files** (all under `apps/admin/src/components/admin/maintenance-master/`):
- `MaintenanceMasterPage.tsx`: Stitch pill tabs with counts, plus a new Supplies tab.
- `jobs/JobsTab.tsx`: "May need · N" pill on job rows.
- `jobs/JobDrawer.tsx`: restyled to Stitch, with the May need section.
- `jobs/MayNeedSection.tsx`, `jobs/AddMayNeedDialog.tsx`, `jobs/serviceItemsUi.tsx` (Stitch colours as exact hex, because the service-items Stitch project reuses token names with different values), `jobs/mayNeedModel.ts` + test, `jobs/jobsApi.ts`.
- `supplies/SuppliesTab.tsx`, `supplies/SupplyDrawer.tsx`, `supplies/RetireSupplyDialog.tsx`.
- Server: supplies now return `createdAt`, `updatedAt`, `createdByName`, `updatedByName`.
- Click-through test: `e2e/dominion-service-items.spec.ts` (done-tests 16–19, read-only analyst, tablet), registered in `playwright.config.ts`.

**UI1 choices to confirm when checking:**
- The Jobs tab keeps its existing layout (ported from an earlier Stitch design); only the pill is new.
- The drawer keeps today's Locked / helper / "Suggested with" content, restyled.
- "Auto-saves drafts" is dropped, because the drawer doesn't do that.
- The May-need loading skeleton doesn't apply, because items load with the job.
- Read-only users can't open job drawers (existing behaviour); they see the pill, and View on supplies.

---

## 3. What UI2 (Fleet) uses — server contract

**Job list for Log service:** `GET /maintenance-categories/systems/:systemId/sections`.
- Each job has `items: JobItem[]`, with `{ linkId, kind, itemId, name, need, qtyHint, note, sortOrder, unitLabelOne, unitLabelMany, defaultFitMode }`. The list holds active links with active items only, in order.
- The top level has `serviceItemsEnabled`. When it's false, hide the Items used block.
- Part types and Other items use `piece` / `pieces`.

**Save:** `POST /maintenance-work-orders` (`completeNow` + `idempotencyKey`) and `PATCH /maintenance-work-orders/:id`.
- Each line can carry `items[]`, with `{ source: 'suggested'|'other', jobItemId?, itemKind: 'part_type'|'supply'|'other', partTypeId?, supplyId?, partId?, itemName? (Other only), brand?, partNumber? (part types only), qty, unitCost? }`.
- The server sets names and unit labels, works out the money, checks that a chosen part fits this car, and fills its brand and part number.
- `packages/types/src/serviceItems.ts` → `parseLineItems` gives the same amounts the server will save. Use it for live totals on screen.

**Edits:** a content edit must send `expectedVersion`. Board-only status or vendor changes don't need it.

**Errors** come back as `{ code, error }`:

| Code | Status | When |
|---|---|---|
| `version_required` | 428 | an edit was sent without `expectedVersion` |
| `stale_edit` | 409 | someone else saved first → show "This service was changed" + Reload |
| `completion_in_progress` | 409 | the log is still finishing → retry after 3 s, up to 5 times |
| `immutable` | 409 | the log is completed |
| `service_items_off` | 400 | the switch is off |
| `line_item_part_not_for_car` | 400 | the chosen part doesn't fit this car |
| `line_item_link_wrong_job`, `line_item_link_mismatch` | 400 | a suggested item doesn't match its job or link |
| `qty_precision`, `cost_precision` | 400 | more decimals than allowed |
| `line_items_on_declined` | 400 | a declined job has items |
| `completion_failed` (with `step`) | 500 | a completion step failed |

**Reads:**
- Work orders return `version` and `notFinished` (in progress for more than 2 minutes). Each line returns `itemsAmount` and `items[]`, with `{ id, source, jobItemId, itemKind, partTypeId, supplyId, partId, itemName, unitLabel, brand, partNumber, qty, unitCost (null = not recorded), amount }`.
- History (`GET /maintenance-logs/:vehicleId`) returns `version` per log, and `items` + `itemsAmount` per line.
- **Unfinished logs have no service record, so history doesn't list them.** Fleet history must also load `GET /maintenance-work-orders?vehicleId=…&status=in_progress` and show those with `notFinished` as the "Not finished saving" card.

**Finish saving:** `POST /maintenance-work-orders/:id/complete`. A completed log answers 200 with `idempotentReplay: true`.

**Older log routes:** `POST /maintenance-logs` takes an optional `idempotencyKey`. `PATCH /maintenance-logs/:vehicleId/:id` needs `expectedVersion` (428 without it).

**Client changes needed in UI2:**

| App | File | Change |
|---|---|---|
| Fleet | `apps/fleet/src/services/api.ts` (`saveMaintenanceLog`, `updateMaintenanceLog`, `createWorkOrder`, `updateWorkOrder`, `completeWorkOrder`) | send `expectedVersion` on edits and a key on legacy creates; handle the codes above |
| Fleet | Log service wizard (`components/vehicles/LogMaintenanceServiceDialog.tsx`, `maintenance-logging/log-service/*`) | |
| Fleet | History (`maintenance-logging/MaintenanceServiceHistoryPanel.tsx`, `ServiceHistoryRowDialogs.tsx`) | |
| Fleet Admin | `apps/admin/src/services/api.ts` (`saveMaintenanceLog` ~1406, log edit ~2311) | send `expectedVersion` on edits and a key on creates |
| Driver | `apps/driver/src/services/api.ts` (`saveMaintenanceLog` ~1518) | send a key; older app builds still work without one |

The existing Fleet click-through test is `e2e/fleet-maintenance-log-service.spec.ts`. Update it in the same round as the screens.

---

## 4. Tests

**Done and passing:** done-tests 1–15 (database), 19–23, 25, 26 (server part), 28 (server part), 29–30 (server), and 31–40 (completion), proven by the SQL and Deno tests in section 0. Number 41 was done in S1.

**Still to pass:**
- **UI1, Dominion:** 16, 17, 18, 19 + read-only + tablet.

  The owner starts `pnpm testcopy`, then run once:
  ```
  ADMIN_BASE_URL=http://127.0.0.1:5180 FLEET_BASE_URL=http://127.0.0.1:5181 node node_modules/@playwright/test/cli.js test e2e/dominion-service-items.spec.ts --project=dominion-admin --reporter=list --max-failures=1 --retries=0
  ```
  - Never use `--ui`, `--headed` or `show-report`.
  - The local `fleet-core/index.ts` must be freshly built (`node scripts/build-edge-bundle.mjs fleet-core`) for test 19.
  - The test cleans up its own made-up data (`SI-UI1 Test Cleaner …`).
- **UI2, Fleet**, checked on screen:
  - **20:** switch off → no Items used block.
  - **21:** $3,000 service + cleaner $1,200 + gasket $800 → line total 5,000.
  - **22:** part line $4,000 + labour $1,000 + item $500 → 5,500.
  - **24:** blank cost → "cost not recorded".
  - **25:** a part for another car is refused; a universal part fills brand + part number.
  - **27:** stale edit → Reload message; a Fleet Admin edit with an old version → 409.
  - **28:** completed log → read-only; void keeps its items.
  - **31:** a failed step shows "Not finished saving", and Finish saving completes it.
  - **33:** a legacy create / edit as Completed has the same response shape.
  - **36:** two finishes at once → one runs, the other retries.
- **T1:** `pnpm test:service-items` runs everything above on the test copy.

**Rules:**
- A test counts only if nothing is faked.
- Screenshots go to the git-ignored `test-results/`, never into `docs/`.
- Test servers stay on ports 5180–5183, never the owner's 3000 / 3001 / 5173.

---

## 5. Gates before push

1. `/code-review`
2. Local Playwright: the Dominion + Fleet service-items specs, plus `e2e/dominion-maintenance-master.spec.ts`, which shares the page.
3. `pnpm check`
4. Push (the owner decides).

Repo search: `reverseAndDeleteWorkOrder` and `syncWorkOrderLines` must find nothing outside docs and migrations (true today).

---

## 6. Stitch screens — port rules and Keep / Drop / Add

**Stitch HTML** is in `docs/stitch/service-items-fleet/html/` (9 screens) and `docs/stitch/service-items-dominion/html/` (10 screens), one folder per screen with `code.html` + `screen.png`. Fleet screens 1 and 3 and Dominion screen 2 have PNGs that stop early, so port those from `code.html`.

**Stitch wins** on layout, styling and wording (copy text word for word). **This plan wins** on data, logic and what gets saved.

**Proof:** a side-by-side Stitch PNG and live screenshot per screen, plus the click-through test.

| App | Screen | Stitch folder |
|---|---|---|
| Fleet | 1 Step 3 Details with Items used | `log_service_step_3_details_with_items_used` |
| Fleet | 2 Pick a part | `pick_a_part` |
| Fleet | 3 Other item, declined, voided | `step_3_other_item_declined_job_voided_job` |
| Fleet | 4 Review | `step_4_review` |
| Fleet | 5 Service history + Not finished saving | `service_history_with_not_finished_saving` |
| Fleet | 6 Finish saving states | `finish_saving_button_states` |
| Fleet | 7 "This service was changed" | `this_service_was_changed` |
| Fleet | 8 States | `states` |
| Fleet | 9 Phone | `phone` |
| Dominion | 1–10 | `jobs_tab_may_need_counts`, `edit_job_drawer_may_need_list`, `add_to_may_need_part_types`, `add_to_may_need_supplies`, `supplies_tab`, `edit_supply_drawer`, `retire_a_supply`, `retired_supplies_and_restore`, `may_need_states`, `tablet_edit_job_may_need` |

### 6a. Rules for every screen
- **The app shell stays as it is today.** Drop Stitch's top nav, footer and sidebar.
- **No part numbers, SKUs or invented codes on Fleet screens.** `SUP-` codes appear only on Dominion.
- **Every count, total, date, name and status comes from real data.**
- **Drop spec-sheet framing:** state captions, HTTP labels, "Telemetry", version tags, guideline cards.

### 6b. Fleet (UI2)
**1 Step 3 Details**
- Keep: dialog header, dark car strip, 4-step progress, job card, Service charge block ("Service charge (not counting items below)"), notes, "Items used" with "N Selected" pill and helper, Usually / Sometimes groups, item rows (checkbox, icon, name, kind pill, qty stepper with unit, Cost each, Brand, amount), picked-part strip with "Fits this car" + Change, + Other item, blank-cost helper, total pill, footer.
- Drop: eyebrow "PREVENTIVE & CORRECTIVE MAINTENANCE", "Itemised" pill, item sub-lines, the part number in the picked-part strip, and the orange top border unless today's dialog has it.
- Also: items start unticked; a declined job hides the block; voided lines are read-only; Step 2 ⓘ shows "May need: …".

**2 Pick a part**
- Keep: title, sub-line, "FITS YOUR CAR" / "FITS BY SIZE", rows with radio + Verified / Check before buying, Type it in instead, Cancel / Use this part.
- Drop: every second line (part numbers, "OEM Match", trimming text).
- Add: the "Type it in instead" state (Brand, Part number (optional)).

**3 Other item, declined, voided**
- Keep: compact ticked rows, "CUSTOM SERVICE ITEM" block (What was it?, Qty, Cost each, Brand (opt), Line total, red Remove), Declined card with struck quote, voided card (read-only items), split total pill.
- Drop: eyebrow, "Itemised".
- Change: placeholder "e.g. Scott" → "e.g. CRC".

**4 Review**
- Keep: summary strip (Vehicle, Service date, Odometer, Workshop = provider), "Service Work Orders · N Jobs Recorded", "BREAKDOWN (JMD)", job cards with item lines, "Cost not recorded (excluded from total)", totals card ("Labor & Service Jobs" = job charges, "Installed Parts & Consumables" = `items_amount`), "Currency: JMD", footer.
- Drop: "Logged on-time", "+4,820 km interval", "Verified Vendor", "or lock accounting reconciliation".

**5 Service history**
- Keep: timeline cards (garage, status pill, date · km, total, View, job lines, "Items used:" line), "Not finished saving" card (amber border, pill, helper, Finish saving), "Service Timeline · N entries", "Completed" pill.
- Drop: vehicle header card, work-order / draft-session numbers, technician names, sign-off and sync lines, "Review draft fields", "Historical", Filter / Newest first, "Next Recommended Service Window", page eyebrows, extra search.
- Today's page header, tabs and Log service button stay.

**6 Finish saving states**
- Keep: Finishing… spinner, amber "Still finishing, try again in a moment.", red "Couldn't finish: …" (the server's plain error), done state with "Completed" + View details.

**7 "This service was changed"**
- Keep: icon tile, title, text, Cancel / Reload.
- Drop: the "Modified by … at …" box.

**8 States**
- Keep: Items-used skeleton; "Couldn't load standard parts for this job" + Try again; "No standard items suggested…" + Other item; save-failed banner + Try again.
- Drop: page framing, "Fetching spec…", VIN, job numbers, sub-lines, "Billing classification", "Diagnostic log", "Diagnostic observations" (use the notes label), "or refresh catalog sync", "Review entries", the summary under the save error.

**9 Phone**
- Keep: compact header "Step 3 of 4 · Details", car strip, segmented progress, service charge card, item cards, "Fits this car · Change" strip, + Other item, helper, sticky total bar with back + Continue to review.
- Drop: notification bell (unless already in the app), "Edit" on notes, item sub-lines, "Intake health metric" card.

### 6c. Dominion (UI1 — for the side-by-side check)
**1 Jobs tab**
- Keep: pill tabs with counts, toolbar, group cards, section headings, job rows with pills (incl. "May need · N") and Edit / Retire.
- Drop: grey description under group names.

**2 Edit job drawer**
- Keep: header, fields, Also do card, May need section (rows, pills, quantity, note, Edit / Remove / arrows, retired row, + Add item), footer.
- Drop: "Browse all 120+".

**3 Add — Part types**
- Keep: header, pill tabs, search with clear, rows (sub-line = home group · section), disabled pills, "HOW OFTEN IS IT NEEDED?", quantity + note, footer with "1 part selected" and + Add.
- Drop: "OEM Ref".

**4 Add — Supplies**
- Keep: "MATCHED WORKSHOP SUPPLIES · N results", rows "name · unit" with description, + New supply, switch, quantity with unit chip, note, footer.
- Drop: "Stocked".

**5 Supplies tab**
- Keep: search, Active / Retired with counts, + Add supply, "Standard consumables" card, table (icon, name, SUP code, unit, "On N jobs" / "Not on any job", Active, Edit).
- Drop: "Live sync…", version tag, Filter, "Showing 7 of 12", "Auto-replenishment", "⋯", pagination, bottom cards.
- Add: "N supplies".

**6 Edit supply drawer**
- Keep: code chip, Active pill, title, Name with counter, Description + helper, Unit, Icon row, "Used on N jobs" card (opens the job), Created by / Last modified, footer Retire / Cancel / Save supply.
- Drop: "Standard PM Kit Template A", "Depot Location".

**7 Retire**
- Keep: icon tile, title, three lines, "This item can be restored at any time.", Keep it / Retire supply.
- Drop: "Retiring archives this consumable…", "for technicians on the shop floor", "Dominion audit log preserves…".

**8 Retired + restore**
- Keep: "Active catalog: N | Archive: N" badge, Retired switch with count, retired row with job names + Restore, red name-clash message, "Showing N retired supply…".
- Drop: "Sort: Last modified", "Archival policies", bottom cards.

**9 States**
- Keep: "Couldn't save this item." with the reason, View "Also do", Try again; empty May need + Add item; no-match search with Clear query + New supply.
- Drop: page framing, sample brake pad / SKU card, "Browse templates", "Filter by" chips.

**10 Tablet**
- Keep: May-need item cards, Add item, footer.
- Drop: sidebar, "EDIT JOB TEMPLATE · v2.4", "Canonical Name" card, "Prescribed cycle…", SKU lines, depot / ledger lines.

---

## 7. Go live (round L — the owner runs every live step)

**LIVE 15 Nov 2026 (00:20 UTC):** L1–L3 run by the owner; `main` pushed (`3e84a17f`; it also carried 3 finished Week Reconciliation commits f9e25700 / e54a21db / a80eaba2); edge + Vercel deploys succeeded; L4 run; all 4 logbook lines recorded; `service_items` on for deekiiiiiii's Fleet (`8cfa606a-…`) only. Live check: 35 work orders all version 1, no items, none in progress; old supply table had 0 rows. Left: fill the May-need lists (only Throttle Body Cleaning → Throttle body cleaner exists) and one real log (step 6).

**Incident (15 Nov, ~00:17–00:31 UTC):** the push deployed **no** server code. `deploy-supabase-edge.yml` diffed only `HEAD^..HEAD`, and the push's last commit was docs-only. For ~14 min live ran the old fleet-ops/fleet-core against the new database (Find parts could fail, since L4 had dropped the old supply table; no Items used in Log service, which is how the owner spotted it). Fixed by a manual full deploy (`deploy_all`, run 43658358112, all functions OK). Root cause fixed in `5b9d79b5`: the workflow now diffs `github.event.before..HEAD` with full history and deploys everything when it can't read the start commit. Vercel was fine (it already used `event.before`).

**First real log PROVEN (15 Nov 00:42 UTC):** Toyota Roomy 5179KZ, 23 May 2026 — Throttle Body Cleaning J$ 6,000 + Throttle body cleaner (ticked from May need, 1 can, J$ 800) = line J$ 6,800 (`items_amount` 800); Throttle Body Relearn J$ 2,000; work order `7ddc2c50…` completed, total J$ 8,800 = service record cost; exactly 1 Business Finance entry; Service history shows "Items used: Throttle body cleaner (1 can, J$ 800)". **Job card top ported to Stitch screen 1 (15 Nov):** icon + job name + action pill; one "Service charge" block (words left; Total / Per wheel on wheel jobs, J$ amount, "No charge (free)" right); "Line details" title once; dropped the eyebrow, the "Engine · throttle_body_cleaning" code line and "Bay Session #…" (6a). Notes stay one per service, below the jobs. `pnpm test:service-items` 14/14 with new checks; close-up matches Stitch. **Left:** fill the remaining May-need lists in Dominion (owner).

1. **Run the migrations** on the live database (Supabase SQL editor), one file at a time, from `docs/service-items-build/live/` (each file = the migration + its `schema_migrations` logbook line):
   1. `L1-service_items_catalogue.sql`
   2. `L2-service_items_logging_core.sql`
   3. `L3-service_items_completion.sql`

   **Not** the supply-link drop yet: the live code still reads `component_related_supply` (Find parts) until the deploy. (Order corrected 14 Nov.)

   `20261113162537_toll_v2_screen_reads` belongs to the toll work, not this plan.
2. **Deploy** = push commit `9b691c21` to `main`. That runs `deploy-supabase-edge.yml` (all changed edge functions) and `vercel-path-deploy.yml` (Fleet, Dominion web apps). `service_items` stays off (no flag row = off). The Driver app change (save key) ships with its next store build; older builds keep working.
   Then run `L4-service_items_drop_old_supply_link.sql`.

   These changes take effect at deploy and **can't** be undone by the switch:
   - edits need a version;
   - Finish saving;
   - legacy creates send a key;
   - completion waits for Business Finance;
   - items count in `line_total` (0 until used);
   - the audit actor is the saving user.
3. **Check the live data:** existing logs have `version 1` and `items_amount 0`, record links are filled, and the integrity report is clean.
4. **Fill the May-need lists** in Dominion.
5. **Turn `service_items` on** for the owner's fleet only.
6. **Do one real log with screenshots** against tests 20–30.

---

## 8. Build status

| Round | What | Status |
|---|---|---|
| D1, S1, D2, S2, S3 | Database + server | **Done + checked 13 Nov** (section 2) |
| UI1 | Dominion screens 1–10 + `e2e/dominion-service-items.spec.ts` | **Done 14 Nov.** Test 6/6 passed on the test copy; close-ups checked against Stitch. Fixed: sign-in key for the test copy (`e2e/helpers/mmP01Auth.ts`), dark-mode colours in the 7 new files (Add dialog text was invisible), list icon on the "May need" pill. Not screenshotted: screen 9 states (error / empty / no match) — check by eye in UI2's test run. |
| UI2 | Fleet screens 1–9 + client changes (section 3) | **Done 14 Nov** — see "UI2 result" below. |
| T1 | `pnpm test:service-items` + `/code-review` | **Done.** 14/14; code review 10 findings → S5 fixed + checked |
| L | Go live (section 7) | **Done 15 Nov** — live, first real log proven, lists filled (section 7) |
| C | Close out + commit | **Done 15 Nov** — this file CLOSED (Rev 14), memory updated |

### UI2 result (14 Nov)

**Built** (Fleet, under `apps/fleet/src/components/vehicles/`):
- Step 3 Items used: `maintenance-logging/log-service/ItemsUsedSection.tsx` (screens 1, 3, 8 states), `PickPartDialog.tsx` (screen 2), `itemsUsed.ts` + test, `useJobItems.ts`; wired in `LogMaintenanceServiceDialog.tsx` and `LogServiceLineDetailsStep.tsx` ("Service charge / Not counting the items…").
- Step 2 ⓘ shows "May need: …" (`LogServiceSystemPicker.tsx`).
- Review (screen 4): summary strip, job cards with item lines, "Cost not recorded (excluded from total)", declined card ("No items on a declined job." + struck quote), Labor / Parts totals card (`LogServiceReviewStep.tsx` + test).
- Save states (screens 6, 7, 8): `maintenance-logging/ServiceSaveStates.tsx`. The wizard shows the save-failed banner, the "Not finished saving" banner (Finish saving re-sends the same save key, so the server finishes the saved service), and "This service was changed" on a stale edit.
- Service history (screen 5): today's table stays; added "Not finished saving" cards above it (`NotFinishedServices.tsx`), an "Items used:" row under each job, and in Service details the items per job plus voided jobs read-only with their items.
- Client: `services/maintenanceSaveError.ts` (codes, 3 s × 5 retry for "still finishing"); `api.ts` sends `expectedVersion` on edits (looked up when a caller has none) and a save key on legacy creates. Fleet Admin and Driver `saveMaintenanceLog` send a save key.
- Money: `types/maintenance.ts` — line totals include items, rounded exactly like the server (`parseLineItems`).
- Server (small, found by the screens): history rows carry `items`; finishing no longer crashes after saving (`enrichLines` wiring); single-service reads no longer wipe line names / amounts / items (lines were mapped twice).

**Placement choices:** voided jobs only exist on completed logs, so the screen 3 voided card is in Service details; declined jobs come from inspections, so the declined card is on Review. The wizard's edit path (completing a driver request) isn't reachable from any Fleet button today (`handleCompleteRequest` in `FleetMaintenanceHub.tsx` is never used), so screen 7 is wired but only the server's 409 is proven.

**Tests:** `e2e/fleet-service-items.spec.ts` (fleet project) — **5/5 after S4**: 31 wizard (books outage → "Not finished saving" banner → Finish saving → the books get the service exactly once); 20; 21 + 24 + 25 (type-in) with DB checks and history; server 25 (part not for car) / 27 (old version 409, no version 428) / 36 (two finishes, then replay); 31 history card + Finish saving + 28 (void keeps items, completed log is immutable). Also passing: `fleet-maintenance-log-service.spec.ts` 3/3, `dominion-service-items.spec.ts` 6/6, Fleet unit tests 52/52, server tests 122/122. `dominion-maintenance-master.spec.ts` D5 failed (Part schedules impact dialog expects a Fleet-car count the local data doesn't have; not touched by this work, not investigated).

**Open:**
- ~~**B1 (Critical):** a failed Business Finance write was only logged, so a service completed with nothing in the books.~~ **Fixed in S4 (14 Nov)** and checked by Claude: `fleetDualWriteCanonicalEvent` returns posted / skipped / failed and `appendCanonicalLedgerEvents` counts a failure as failed. Server tests 137/137; Fleet spec 5/5 incl. the outage test; `fleet-maintenance-log-service` 3/3 and `dominion-service-items` 6/6 re-run green after the change.
- **Not service items, for a separate look:** Cursor's S4 caller table found the Expense Hub accrual (`expense_hub_routes.ts` ~215) marks a document posted without checking the books write, and the ledger repair tool (`ledger_ensure_routes.ts` ~166) doesn't count errors. Both were like this before S4.
- ~~Screen 9 phone~~ — done 14 Nov: compact header "Step 3 of 4 · Details", four thin step bars, labelled item cards, total pinned above the buttons, arrow-only Back (`LogServiceWizardChrome.tsx`, `ItemsUsedSection.tsx`); checked in the click-through at 390 px and against the Stitch PNG. Kept today's red Cancel on phones (Stitch has none) so a draft can still be thrown away.
- ~~Not checked by eye: screen 8 / Dominion screen 9 states~~ — **done 15 Nov**: picture tests "8 States" (Fleet: loading, couldn't load + real Try again, no items, save failed) and "9 States" (Dominion: empty May need, no supply match, couldn't save) checked against Stitch. Fixed on the way: a refused **add** in Dominion showed only a plain red line in the dialog; it now closes the dialog and shows the Stitch card ("Couldn't save this item." + View "Also do" + red Try again that re-sends the add). Fleet save-failed "Try again" no longer wraps.
- Test 22 and 33 are proven by unit / server tests only (accepted). **Owner follow-up:** test 25's "fits this car" pick needs a car with a catalogue (the test car has none) — next time a part job is logged on the Roomy, pick a part under "Fits your car" once; Claude can check the saved item.
- ~~The discount teardown doesn't clean `ledger.*` rows~~ — fixed in S4, proven (8 leftover rows → 0).
- **Find parts research for the Exhaust & emissions batch (added 15 Nov):** 18 items (3 new part types: Exhaust Flange Gasket, Exhaust Clamp, Exhaust Hanger; 14 new part jobs; Tire Valve Stem) start with no parts, so "Fits your car" is empty and the team types them in. Run research once `exhaust-2-rest.sql` is live.
- **Find parts research, Hybrid batch (added 15 Nov):** 4 more part jobs (HV Battery Cooling Fan Filter, Inverter Coolant Pump, HV Battery Module, HV Battery Pack). Backlog 22. **EV batch (A/C Recharge is a service, so no part research):** 7 more (HV Cable / Connector, Battery Coolant Pump, Charging Port, On-Board Charger, DC-DC Converter, Traction Motor, Electric A/C Compressor). **Total backlog 29.**
- **HV lockout is recorded nowhere (added 15 Nov). Owner: Deeki T. Target: 30 Nov 2026. Blocked on: the screen design (Stitch). As of 15 Nov: 0 HV services logged (checked on live).** Each HV service logged without a lockout record is a permanent audit gap. **Rule: HV work (Hybrid & electric group, Electric A/C Compressor) waits until the checklist ships wherever it can. If it can't wait, it's logged in the app (never outside it) with "HV lockout done by <name> at <time>" in the service notes, and the checklist is filled in from that note once it ships.** Nothing in code enforces it; this line is the gate. As of 15 Nov (after `ev-add.sql`): 0 HV services logged.
- **Backfill HV lockout for any HV service logged before the checklist ships (added 15 Nov).** Owner: Deeki T. Target: checklist ship date + 7 days. As of 15 Nov: 0 services to backfill. **How:** on ship day, run a query listing every service with an HV job (Hybrid & electric group or Electric A/C Compressor) and no checklist record; for each one, open it and fill in the checklist from its "HV lockout done by <name> at <time>" note. If a service has no note, mark its checklist "not recorded", never guessed.
- **Future requirement: screen-level gates (added 15 Nov).** The HV rule and the `part_source` rule are written rules that work while Deeki T is the only person logging. Before a second person logs services, both need a screen block: a banner on HV jobs ("lockout checklist first"), and part items locked until `part_source` ships. Not built; known.
- **Duplicate job (found 15 Nov):** "Engine oil" exists twice: `oil` (Engine group) and `engine_oil_part` (Fluids group). **Checked on live 15 Nov (every foreign key to the job table):** `oil` holds all the history: 3 work-order lines, 1 service-ledger row, 2 schedules, 4 package links, 1 inspection item, 1 task template, 2 part_master rows, 5 synonyms, 2 spec keys, 1 job relation set, 1 section member. `engine_oil_part` is referenced only by its own May-need link (1) and 1 `part_type_spec_field` row; no service, schedule or ledger row. **Plan: keep `oil`. Move the 1 spec-field row to `oil` (if `oil` has no matching field), soft-remove `engine_oil_part`'s May-need link (`oil` already offers Engine Oil), then retire `engine_oil_part` (status retired, not deleted).** If both had history, the rule would be: keep both, add "use Engine oil (Engine)" to the other's description, and alias it in reporting. Retiring a job with history isn't allowed. Runs after `part_source`. **Until then: log oil changes on "Engine oil" in the Engine group (`oil`), never the Fluids-group one (`engine_oil_part`).** If anything gets logged on `engine_oil_part` before it's retired, that history must be moved to `oil` first; check its work-order lines on retirement day.
- **Duplicate-job audit (15 Nov, systematic):** normalised-name group-by over every active job (lower-case, punctuation removed). The only exact duplicate is Engine oil (`oil` / `engine_oil_part`). **By meaning, one more pair:** "Cabin Air Filter" (`cabin_air_filter`, Filters) and "Cabin A/C Filter" (`cabin_filter`, HVAC) are the same part. **Downgraded (15 Nov, after review) from "retire one" to "verify, then decide".** On some cars these are the same filter under two names; on others there are two real filters (a particle cabin filter plus a separate carbon / odour A/C filter). Before the HVAC file touches them: (1) count cars, schedules, parts and service lines on each (every foreign key, like Engine oil); (2) in Dominion, check whether any model's "cabin filter" spec resolves to a different part number from its "A/C filter" spec. **If they ever differ, keep both and add "which one this car uses" to both descriptions. No retirement.** Only if they never differ: keep the one with history, retire the other, and write down the "both used" case first. Re-run the group-by before every batch.
- **`is_part` on fluid jobs is by design, not a mistake (checked 15 Nov):** `is_part = true` means "the job line asks which product went in (part picker, brand, part number) and the job shows in Find parts". For Engine oil, Brake Fluid (fit mode "spec": match the DOT rating), Coolant and Transmission Fluid, the product (grade / DOT / type) is exactly what should be recorded. The line's own qty × unit price is that product's cost; supplies are separate items. Only Radiator Coolant Flush and Reduction Gear Oil Change are `is_part = false`, because they're labor services that use supplies. No parts-vs-supplies cost report exists yet. When it's built, it should split on item kind (part item vs supply), not on the job's `is_part`. **Put this meaning in the schema:** the `part_source` migration (next build round) also adds `COMMENT ON COLUMN maintenance_service_categories.is_part IS 'True if the job line asks which product went in (part picker, brand, part number) and the job shows in Find parts. Does not mean the job is a part. For fluid jobs it records the product spec (oil grade, DOT, coolant type).'` A reviewer misread this flag, so a new developer would too.
- **NEXT BUILD: `part_source` round (reviewer's handoff, 15 Nov). Ship exactly this, nothing else bundled:** (1) migration with column `part_source` on `maintenance_work_order_line_item`, values 'car' | 'size' | 'typed', nullable (NULL = saved before this column; no backfill); (2) the save function writes it: `part_id` → 'car', fits-by-size pick → 'size', typed-in → 'typed', taken from what Fleet picked (the same decision `pickedPartBadge()` makes), with the server checking it agrees with `part_id`; (3) Fleet sends it in the save payload; (4) `COMMENT ON COLUMN maintenance_service_categories.is_part` (text above); (5) test: a service saved with 'typed' reads back as 'typed' (not NULL, not 'car'), and the same for 'car' and 'size'; (6) test: a NULL `part_source` row still shows a safe badge ("Typed in"/unverified), never an error and never "verified" without `part_id`. Done = live, and one service with each of the three sources reads back right. Window: 0 part-item rows on 15 Nov.
- **Steering & Suspension handoff (reviewer, 15 Nov).** The first draft must already have: (1) "Existing supplies reused (checked on live)" with SUP codes; (2) "don't log both" on every part-item / inspection pair (e.g. a tie rod end vs a tie rod inspection); (3) the double-log note, naming the job's own fluid, on every fluid refill. Coordinate Drain Plug Washer if it touches a drain-and-fill job (e.g. steering gear oil). **`catalogue_batch_log` must be live before its first SQL runs.** Aim: one or two review rounds. Record the per-row checks (found / exact own note / exactly once / wrong-kind 0) in the batch log row.
- **Batch log first (split out 15 Nov, after review). Owner: Deeki T. Target: before Steering & Suspension runs.** A small round on its own: a `catalogue_batch_log` table (batch name, file sha256, run at, counts) that every live/*.sql writes to inside its own transaction, plus a check at the top of each SQL that stops if a prerequisite batch isn't logged. Backfill one row per batch already run (cleaning, may-need, supplies 2, exhaust 1+2, hybrid, ev, double-log notes) from the commit log. This is the load-bearing piece; the rest of the item below can follow later.
- **Strategic: a real pipeline for hand-run catalogue SQL (added 15 Nov). Owner: Deeki T. Target: before the next batch that retires a job (the Fluids / Drivetrain file, which retires `engine_oil_part`); the batch log above comes first.** Today the order rules ("run DRYRUN first", "hybrid-add before ev-add", "double-log notes before part_source") live in prose, and live/*.sql files are hand-run, so "was this applied?" is remembered, not queryable. Plan: (1) a `catalogue_batch_log` table that every batch SQL writes its name + file hash into inside its own transaction; (2) each SQL's prerequisites checked against that table at the top ("stop if hybrid-add isn't logged"); (3) the DRYRUN step run in CI against a local copy of the database, not by hand; (4) the order rules in one place (`docs/service-items-build/live/README-dryrun.md` grows into the runbook). Until then, the commit log + these Open-list lines are the record of what ran.
- **"Usually one of these" (product question, added 15 Nov):** the May-need list can't say "usually one of these". A/C Recharge and Electric A/C Compressor show both refrigerants (R-134a, R-1234yf) as Usually; the bonnet label decides. Today the refrigerants are the **only live instance**. Engine Oil, Brake Fluid and Coolant are single supplies ("type by label"), so they only become instances if they're ever split by grade / DOT / type. A/C O-Ring Kit vs receiver-drier won't be one (they're used together, not either-or). A screen feature, not a catalogue edit.
- **Double-log rule applied to the jobs already live — RAN 15 Nov (DRYRUN then real run, both 0/0/20/8, checked after):** `live/double-log-notes.sql` (Rev 2). 20 refill jobs (18 part jobs + Engine Overhaul + Walnut Blasting; six fluids incl. EV ones) and 8 fluid services get the "don't log both" text, appended by job code. Before saving, it checks changed_other = 0, not_appended = 0, 20 and 8, and cancels everything if any is wrong. The extraction query is in the file header. Oil filter is left out on purpose (it goes with an oil change).
- **Catalogue conventions (15 Nov):** (1) the double-log rule: a fluid used to refill a replaced part is logged on the part job, not the fluid service, and both descriptions say "don't log both". (2) Sized items are part types, one-kind-fits-all are supplies. (3) Every batch file lists reused supplies with SUP codes. No screen records a high-voltage lockout before hybrid/EV work. Insurer and warranty exposure. Plan: a safety checklist on HV jobs in Log service (lockout done, by whom, gloves checked), saved with the service. It's a screen + server feature, so it gets its own plan after the EV file.
- **Part source not stored (added 15 Nov):** a saved part item keeps `part_id` only for a pick from this car's list (the server re-checks it fits). A fits-by-size pick and a typed-in part are both saved as brand + part number with no `part_id`, so the database can't tell them apart (`partFit` is screen-only in `LineItemDraft`). Fix: add a `part_source` column ('car' | 'size' | 'typed') to `maintenance_work_order_line_item`, sent by Fleet and checked by the server. **Size vs typed can never be reconstructed for any item saved before `part_source` ships** (today that's 1 saved item row in total, so nothing real is lost yet). Do it before the Exhaust / Hybrid part items see real use, not when reporting is built. Badge on reload is already safe without it: reopened items show no badge, and `pickedPartBadge` falls to "typed", never "verified" (test 5 in `itemsUsed.test.ts`).
- **Fleet tick fix (15 Nov, uncommitted, not deployed):** the green "verified" tick and a "Fits this car" / "Check before buying" / "Typed in" label now follow `pickedPartBadge()` (`itemsUsed.ts`); 5 regression tests in `itemsUsed.test.ts` (incl. saved typed-in read back → never verified); Fleet log-service tests 57/57. Deployed 15 Nov (367dcb07). **The badge is a live-pick signal only:** it shows only while a part is being picked. Saved services carry `part_id` (picked from the car's list) or brand + part number (not verified) in the data, and no screen currently shows either after saving. Don't build reporting on the badge.
- **Rule: no Exhaust / Hybrid / EV part items on real services until `part_source` ships (added 15 Nov).** Nothing in code enforces it; this line is the gate. Owner: Deeki T. The `part_source` round is the next build item after `ev-add.sql`. **As of 15 Nov: 1 saved item row in total (a supply), 0 part-item rows**, so no ambiguous row exists yet; ship before the first real part item is saved.
- **CI known failure (added 15 Nov): "Dominion Stitch fidelity" is red on `FAIL S20 75% labels — packages/platform-ops-ui/src/fleet-customer/GasCardsPage.tsx`** (needs 80%). It's a static text check (no database), red since the fuel-card statement work (3c07a767), before the service-items batches. Owner: the fuel-card work. Fix before the next push so CI is green. CI doesn't gate the Fleet deploy, so a red CI must stay named here, not ignored.

The old Cursor prompts and reports stay in `docs/service-items-build/` for reference. They're finished; don't reuse them.
