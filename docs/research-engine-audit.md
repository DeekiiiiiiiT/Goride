# Research engine (cars, specs, parts) — audit

**Rev 4.0 · 21 Nov 2026 · Status: ALL THREE LAYERS BUILT + code-reviewed (10 findings fixed) on the local copy.
NOT committed, NOT pushed, NOT live.** Next = finish the pre-push checks, commit + push the research engine files
only (§2), then prove on real data (§5), then go live (§6).

History (not needed to continue): the closed plan with all findings RE-01…RE-29 and the Spike 0 tables is
`git show 6064a3f4:docs/research-engine-audit.md`. The 18-screen Keep / Drop / Add lists are in the Rev 3.2 version of
this file (in git once §2 is committed; until then the screens themselves are the record).

## START HERE (for a new chat)

1. Read this file top to bottom. Follow `docs/how-we-build-playbook.md` and §0. Plain words to the owner, short replies.
2. Run `git status` and confirm the files in §2b are there (modified / untracked). **Never `git stash`.**
3. **Where we stopped (21 Nov):** the owner asked to commit and push. Push order (owner rule): build → code review →
   local Playwright → push. Done: build, code review (high) + all 10 fixes (§2a), unit/server/SQL/screen tests green.
   **Left before push:** re-run the two service-log Playwright tests on the test copy (they passed before the review
   fixes; the "Couldn't find" changes touch their path):
   - `pnpm testcopy` (if it times out on `/rest/v1/`: run
     `alter role anon set statement_timeout='15s'; alter role authenticator set statement_timeout='15s';` on the local
     DB and `docker restart supabase_rest_Goride`, then start again).
   - PowerShell, from `C:\Roam\Goride`, with `$env:FLEET_BASE_URL="http://127.0.0.1:5181"` and
     `$env:ADMIN_BASE_URL="http://127.0.0.1:5180"`:
     `node node_modules/@playwright/test/cli.js test e2e/fleet-log-service-unknown-parts.spec.ts --project=fleet --reporter=list --max-failures=1 --retries=0`
     (14 tests) and the same for `e2e/fleet-log-service-parts-that-fit.spec.ts` (7 tests).
   - `pnpm testcopy:stop` afterwards.
4. Then **commit only the files in §2b** (the branch `parts-auto-match` also holds other unsaved work — Add parts, Fleet
   maintenance, other migrations — which must NOT go in). For shared files (`package.json`, the two workflow files,
   `VehiclesStitchFlow.tsx`, `AdminDashboard.tsx`, `PartsDatabasePage.tsx`) check `git diff <file>` first: if a file
   also holds other work, commit only the research hunks (`git add -p` is interactive and not available — write the
   research-only version to a temp file and ask the owner if a split isn't clean). Push to `parts-auto-match`.
5. Tell the owner plainly: a push does **not** make the screens appear at localhost — the owner's localhost app reads
   the LIVE server, which has none of this until go-live (§6). To look at the screens before go-live, use the test copy
   (`http://127.0.0.1:5180`) or the screen test with pictures (§3).
6. The Overview page keeps its current look on purpose: §4b of Rev 3.2 kept only the two notice banners from that Stitch
   screen, because every other card on it was invented (84.2%, 1,428 jobs, Verification Desk…). The owner was unhappy
   with this on 21 Nov — if they want the Stitch Overview look, that is new work: first decide which real number fills
   each card, then build.

## 0. Goal and the owner's rules

**Goal:** Dominion fills itself. For any car version the engine finds the car's identity, its specs and its parts from
trusted catalogues, proves each one with a saved copy of the page row it came from, and adds it. The owner only reviews
what it could not prove.

- **Dominion is master data.** Its screens never show fleets, companies, plates, drivers, request text, dates asked or
  demand counts (RE-23). Demand may order work on the server only.
- **Source rule.** Confirmed only by (a) the car maker's catalogue (or a frame-number site trusted for that maker),
  (b) a part maker's own catalogue for its own part, (c) two different part makers naming the same factory number.
  Shops, aggregators and TecDoc copies = Needs checking. Forums and AI text are never a source.
- **No bypass.** The engine reads a site only if robots.txt and terms allow it, as `RoamResearchBot/1.0`, never
  disguised. Blocked catalogues become **browser checks** (the owner opens the page and pastes the line).
- Information only (no prices / stock / ordering). Customer screens never mention lookups.
- Owner preferences: plain words, one fix per finding, no approval gates, buttons look like buttons (danger = red
  border), no browser pop-ups, exact hex colours in Dominion (dark-mode remap). Stitch = the look, the audit = the
  content (invented facts dropped).
- Decided: research model stays Google Gemini; cost ~US$0.075 per job; daily cap US$1.35; build runs "fill the cars that
  matter first" (owner-started fills + browser checks, at most 25 open). Readable sites: sbparts.jp, jnbk-brakes.com,
  bremboparts.com, rockauto.com (reference). Blocked: masuma.parts (`/find-parts/`), amayama.com, megazip.net,
  partsouq.com, 7zap.com.

## 1. Numbers (20 Nov, live)

2,679 car versions (763 with no frame code); 0 cars "ready"; specs on 3 cars before the CSV backfill (2,471 tyre sizes
become Needs checking in layer 1b). Research jobs ever: 3.

## 2. What is built (local only)

| Layer | Main files | What it does |
|---|---|---|
| 1a database | `supabase/migrations/20261120233053_research_engine_layer1a.sql` | New tables `trusted_site`, `research_lookup_recipe`, `research_page_read` (append-only evidence), `dominion_system_notice`, `dominion_audit_log`, `brand_alias`, `catalog_spec_proposal`, `research_number_conflict`, `spec_column_key_map`; job / proposal / listing / spec columns; engine verdicts; vehicle job key without org id; open-job index covers browser checks; unstick + notices crons; RLS deny-all. |
| 1b database | `…20261120234117_research_engine_layer1b.sql` | CSV specs → `catalog_spec_value` as Needs checking; only Confirmed specs count for "fits by size" and readiness; `promote_part_proposal` saves via the Add-parts path. |
| 2 database | `…20261120235237_research_engine_layer2.sql` | Claim (fleet/fill take turns, spend cap, single flight per job), fill planner (`catalog_research_fill_car/_model/queue_item/_queue_identity/_queue_model`), 30-day browser-check expiry, `promote_spec_proposal`, `approve_vehicle_proposal`. |
| 2 server | `_fleet-server/research_*.ts`, `catalog_research_*.ts`, `listings_for_vehicle.ts`, `api_pricing.ts`, `api_usage_logger.ts`, `platform-catalog/index.ts` | Honest page reader, recipes + same-row proof, source-rule routing, provider faults, worker rev `catalog-research-7`, privacy guard on every research + pending route, browser-check gate. |
| 3 database | `…20261121004356_research_engine_layer3_reads.sql` | `catalog_research_screen_summary()` and `catalog_research_coverage(car)` for the screens. |
| 3 screens | `apps/admin/src/components/admin/research-engine/` + `services/researchEngineService.ts` | All 18 Stitch screens: Parts list / drawer / browser check / two makers disagree / all caught up / states / phone sheet, Vehicles list / proposal drawer / Research this model, Settings and health, Trusted sources + Add a site + recipes with Test on a car, car page Coverage tab + identity first, Car specs table with trust, notice banners (Overview + Pending catalog). Old pending-parts / vehicles / settings / trusted-sources screens deleted. |

### 2a. Code review fixes (21 Nov, all done and tested)

1. Same job could run twice at once → claim archives a second message while the job runs (`duplicate_running`).
2. Second job for a car + part during a browser check → open-job index and every lookup include both browser-check
   states (`catalog_research_join_or_create_job` redefined in layer 1a).
3. Loose car matching (NCP10 matched NCP100, "Fit" matched "FITS") → `containsToken` whole-token match in
   `research_recipes.ts`, used by the browser-check gate too.
4. Browser-check Confirm took any https page → must be a trusted car-maker site for this make, or a part maker's site.
5. Redelivered spec job could put an unproven value on old evidence / reopen a decided proposal → fixed in
   `research_other_jobs.ts`.
6. "Use this one" rejected the other number before the add worked → add first, then set the others aside.
7. Any Google 400 mentioning grounding paused the engine till midnight → needs limit wording too.
8. Jobs stuck in `checking` forever → unstick resets `researching` and `checking` after 30 min and re-queues them.
9. "Couldn't find" paths didn't tell the fleets → `closeJobNotFound` (owner routes) + `sweepUnansweredNotFound` (each
   worker tick, covers the 30-day expiry) in `catalog_research_not_found.ts`.
10. `/admin/part-fitment?part_id=` labelled rows with the group's first part → rows name the part asked for.
Also: removing a site no longer opens a never-closing "site blocked" banner, and removed sites leave the list; the vehicle
re-key keeps the open job; read guards let all Dominion staff read (writes still need `catalog.write`).
Not fixed (small, noted): Fleet Find parts' spec coverage count includes the CSV "Needs checking" rows.

### 2b. Files to commit (research engine only)

- Migrations: the four `supabase/migrations/2026112023*_research_engine_*.sql` + `20261121004356_research_engine_layer3_reads.sql`;
  `supabase/tests/research_engine_checks.sql`, `supabase/tests/catalog_research_claim_checks.sql`.
- Server: `supabase/functions/_fleet-server/` `research_*.ts` (+ tests), `catalog_research_*.ts` (+ tests),
  `listings_for_vehicle.ts` (+ test), `api_pricing.ts` (+ test), `api_usage_logger.ts`, `pending_parts_catalog_routes.ts`
  (+ test), `pending_parts_group.ts` (+ test), `supabase/functions/platform-catalog/index.ts`.
- Admin: `apps/admin/src/components/admin/research-engine/` (whole folder), `services/researchEngineService.ts`,
  `services/pendingPartsCatalogService.ts`, `vehicle-catalog/PendingVehicleCatalogManager.tsx`,
  `vehicle-catalog/pending-parts/PendingCatalogShell.tsx`, `pending-parts/AddedPickPartPanel.tsx` (+ test),
  `pending-parts/pendingPartRequestExtras.test.ts`, `vehicle-catalog/VehiclesStitchFlow.tsx`,
  `vehicles-stitch/VehiclesCarSpecsTab.tsx`, `parts-database/PartsDatabasePage.tsx`, `AdminDashboard.tsx`, and the
  deletions (old pending-parts screens, `parts-database/trusted-sources/TrustedSourcesTab.tsx`).
- Tests / config: `e2e/dominion-research-engine.spec.ts`, deletion of `e2e/dominion-pending-parts-visual.spec.ts`,
  `e2e/fleet-log-service-unknown-parts.spec.ts`, `e2e/fleet-log-service-parts-that-fit.spec.ts`,
  `playwright.dominion.config.ts`, `package.json` (script `test:e2e:dominion:research-engine`),
  `.github/workflows/dominion-places-e2e.yml`, `.github/workflows/verify-migrations-replay.yml`.
- This file.

## 3. Checks to keep green

- SQL (local copy up: `npx supabase start`; after editing a migration run `npx supabase db reset`):
  `docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/research_engine_checks.sql`
  and the same for `supabase/tests/catalog_research_claim_checks.sql`. `node scripts/validate-migration-sql.mjs`.
- Deno (116 pass): `deno test --no-check --allow-all supabase/functions/_fleet-server/catalog_research_*.test.ts
  supabase/functions/_fleet-server/research_*.test.ts supabase/functions/_fleet-server/listings_for_vehicle.test.ts
  supabase/functions/_fleet-server/api_pricing.test.ts supabase/functions/_fleet-server/catalog_privacy.test.ts
  supabase/functions/_fleet-server/pending_parts_catalog_routes.test.ts`. Afterwards the owner's Fleet app may need
  `pnpm install`.
- Admin (PowerShell from `C:\Roam\Goride\apps\admin`): `npx tsc --noEmit -p tsconfig.json` (0 errors) and
  `npx vitest run src/components/admin/research-engine src/components/admin/vehicle-catalog src/components/admin/parts-database` (45).
- Screens (16, made-up data, every §4b button pressed, no Drop word allowed): `pnpm test:e2e:dominion:research-engine`.
  Set `RE_SHOTS=<scratchpad folder>` to get a picture of each screen for a side-by-side with
  `docs/stitch/research-engine/*/screen.png`; delete the pictures afterwards.
- Windows shell: long `node -e` / heredocs with quotes and backslashes break — write helper scripts to the scratchpad.

## 4. Routes (platform-catalog, `/make-server-37f42386/admin/catalog-research`)

Reads need Dominion staff; writes need `catalog.write`; ★ = platform owner only.
`GET /summary`, `/notices`, `/coverage/:carId`, `/settings` (+ `PATCH`), `/strip`, `/incidents`, `/jobs?types=`,
`/jobs/:id`, `/browser-checks/summary`, `/conflicts`, `/trusted-sites`, `/trusted-sites/:domain/recipes`,
`/trusted-sites/:domain/reads`, `/export.csv`. Writes: `POST /jobs/:id/{retry,research-next,undo,not-found,looks-right,edit-and-add}`,
`/proposals/:id/promote`, `/vehicle-proposals/:id/{approve,reject}`, `/spec-proposals/:id/{approve,reject}`,
`/identity`, `/model`, `/fill/{car,model,item}`, `/browser-checks/:jobId/{preview,confirm,not-on-page}`,
`/conflicts/:id/resolve`, `/reprocess-queued`; ★ `/trusted-sites` (add, `PATCH`, `/remove`), recipes (add, `PATCH`, `/test`).

## 5. Done-tests still to prove (real sites, a real run, or real cars)

1. SB and NiBK both list the same factory number for the Roomy M900A rear pads → Confirmed by route (c), both reads in
   `evidence_read_ids`, `trust_set_by = 'engine'`.
2. Amayama blocked: a Toyota OEM number job makes a browser check with the exact link and no server fetch; after the
   owner confirms it is Confirmed by route (a), goes to review, shows "Confirmed · owner-checked <date>".
3. "Wheel bearing · rear" on the Roomy: the fit lists the version(s), LR/RR and the frame range from the page block.
4. **Looks right** → Fleet Find parts for 5179KZ shows it, the four former `part_fitment` readers return it, the request
   closes by itself, Undo removes it.
5. **Fill this car** on the Roomy → a job for every missing core part and spec; after the queue drains none is left
   Missing without a job.
8. A car with no frame code → **Research identity** fills chassis + frame range + engine, then its part jobs run.
9. **Research this model** "Toyota Roomy" → every version tagged new / update / same, **Approve all new** adds them,
   nothing duplicated.
17. Settings shows the measured cost per job (grounding included), the daily cap and the expected finish date.
18. Once, on a test key, Google's 1,500-a-day grounding limit is passed: record the reply; the engine pauses until
    00:05 UTC with no job failed.
31. **Test on a car** on the SB recipe shows the found row for the Roomy, logs one `recipe_test` read, saves nothing;
    two failed tests leave the site `allowed`.
32. On a real conflict: **Use this one** adds that number, rejects the other, closes the request once; **Neither is
    right** adds nothing and sets the job to Couldn't find (and the fleets are told).

## 6. Go live (after §5)

1. One go: apply the migrations in order 1a → 1b → 2 → layer-3 reads (1b rebuilds the readiness view once — slow);
   each hand-run file needs its logbook line in `supabase_migrations.schema_migrations`. Deploy `platform-catalog` and
   `catalog-research` (check the edge deploy list). Ship the admin app.
2. `catalog_research_settings.enabled = true`, shadow (practice) mode on, `daily_spend_usd = 1.35`.
3. Trusted sources → add the first recipe (NiBK's catalogue form) → **Test on a car** on the Roomy M900A → **Fill this
   car** on the Roomy.
4. Switch on for everyone (owner rule).
5. Cleanup migration later: drop `catalog_trusted_source`, `catalog_trusted_source_fetch`, `part_fitment` (table, index,
   writer) and `catalog_research_settings.daily_job_limit`; add a CI search so nothing references `part_fitment` again.

## 7. Follow-ups (outside this audit)

- Email Masuma / Amayama / Megazip / Partsouq for permission (owner) — the biggest unlock.
- No nightly creator for the "200 cars that matter" sweep yet; fills are owner-started.
- `GET /admin/catalog/signals` returns fleet demand counts to Dominion (breaks the master-data rule).
- The live "Added — pick the part" panel says "Added. N companies were told…" (a company count in Dominion).
- RE-29's 24-month re-check of owner-checked rows is not built (no row can be that old before 2028).
- If the owner wants the Stitch Overview design: decide the real number for each card first (START HERE step 6).

## 8. Not in this audit

Service schedules research; prices / suppliers / stock; licensed TecDoc feeds; the parts auto-match engine (S3);
`log-service-parts-gaps-audit.md` items.
