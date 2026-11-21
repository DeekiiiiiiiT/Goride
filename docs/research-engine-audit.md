# Research engine (cars, specs, parts) — audit

**Rev 4.2 · 21 Nov 2026 · Status: LIVE, plus one fix being built (§9 RE-30/RE-31).** Migrations 1a/1b/2/3 applied to
live 03:10 UTC 21 Nov (logbook lines in); main 8c63c773 deployed platform-catalog + catalog-research + Dominion; engine
on, practice (shadow) mode, US$1.35/day. Held back: readiness counts only Confirmed specs (§6 step 5).
§6 step 3 could not work as written: the engine can only open a plain web address, NiBK only searches through a form,
and NiBK's product pages never hold the factory number and the car in the same row. **Next = build §9, then §6 step 3.**

History (not needed to continue): the closed plan with all findings RE-01…RE-29 and the Spike 0 tables is
`git show 6064a3f4:docs/research-engine-audit.md`. The 18-screen Keep / Drop / Add lists are in
`git show 92b3cd21:docs/research-engine-audit.md`.

## START HERE (for a new chat)

1. Read this file top to bottom. Follow `docs/how-we-build-playbook.md` and §0. Plain words to the owner, short replies.
   **Never `git stash`.** Branch `parts-auto-match` also holds other unsaved work (toll, Fleet maintenance, trips, rides) —
   commit only research files.
2. **Where we are (21 Nov):** layers 1–3 are committed (92b3cd21, 07badfa1, d639e4b4) and live. Building §9 (NiBK form
   recipe + cross-reference proof). Push order (owner rule): build → code review → local Playwright → push, then go live
   from a worktree off origin/main (see memory "golive-worktree-recipe").
3. After §9 is live, the owner does §6 step 3 with the exact values in §9 "Owner's recipe".
4. A push does **not** change the owner's localhost screens — localhost reads the LIVE server. Only a go-live does.
5. The Overview page keeps its current look on purpose (every other Stitch card was invented). If the owner wants the
   Stitch Overview look, that is new work: first decide which real number fills each card.

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
5. **Held back (21 Nov go-live): readiness counts only Confirmed specs (layer 1b §3).** Rebuilding
   `variant_parts_readiness` takes longer than live's 2-minute limit — the nightly `catalog-demand-readiness` job has
   failed on it every night since at least 16 Nov, so readiness on live is stale. Fix the slow rebuild first (separate
   work), then run in a new migration: read `pg_get_viewdef('public.variant_parts_readiness')`, replace
   `(COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text)` with `(sv.trust = 'confirmed'::text)` (exactly once),
   drop + recreate the view WITH DATA, recreate the unique index on `variant_id`, revoke from anon/authenticated
   (the old block is in `git show 92b3cd21:supabase/migrations/20261120234117_research_engine_layer1b.sql`). Safe until
   then: CSV specs have no evidence link, so today's rule already leaves them out.
6. Cleanup migration later: drop `catalog_trusted_source`, `catalog_trusted_source_fetch`, `part_fitment` (table, index,
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

## 9. Rev 4.2 — NiBK form recipe and cross-reference proof (21 Nov)

Found while preparing §6 step 3 (checked on the real site with `RoamResearchBot/1.0`; robots.txt and terms allowed it in
Spike 0):

- NiBK's part search (`https://www.jnbk-brakes.com/catalogue/cars`, form `frmProductSearch`) is a **form post**:
  `txtPartNo=<number>&txtClass=1&btnProductSearch=Search`. A match answers `303` to the product page, for example
  `04465-B1120` → `/catalogue/cars/brake/723409/PN5562`. No match answers `200` with the empty catalogue page. The same
  search as a plain link shows the empty page. No session or CSRF value is needed; the product page opens as a plain link.
- The product page has a cross-reference list (`div.str`: maker + number, e.g. `TOYOTA 04465-B1120`) and an
  application table: one `<tr>` per car with `data-title` cells (`BODY` = frame code `M900A`, engine `1KR-FE`, and one
  cell per position — `Front Brake`, `Rear Brake`, `Front rotor`… — each a link to that part's own page). On the PN5562
  page the M900A rows have `Front Brake` → link to the PN5562 page itself.
- SB Parts (sbparts.jp) builds its search in the browser (Angular, `ng-submit`), so neither a link nor a form post works.

**RE-30 · High · Recipes can't use a search form.** The reader only sends GET; NiBK can only be searched by POST.
Fix: new recipe kind `form_then_page` ("Fill the site's search form, then read the page it opens") with a new column
`research_lookup_recipe.form_body_template` (e.g. `txtPartNo={number}&txtClass=1&btnProductSearch=Search`, values
URL-encoded). The reader sends it as `application/x-www-form-urlencoded` POST with the same honest name, same site and
address checks, same caps; a 301/302/303 answer is followed as a GET (no body), 307/308 are refused. The page it lands
on is checked; when `result_link_rule` is set, the first matching link on it is opened first (as `search_then_page`).
The saved read keeps the form address as `url` and the landing page as `final_url`, so the proof page opens as a link.

**RE-31 · High · Same-row proof never passes on a product page.** The factory number is in the cross-reference list,
the car is in a table row, and the row holds the site's own number in a cell named by position, so no single row has
number + car + position. Fix: "cross-reference proof" in `research_recipes.ts`, used for recipe pages and for pages
Google found, tried only when the same-row proof fails. It passes only when all three hold: (1) the factory number is
on the page as a whole token inside a cross-reference block (not just anywhere in the text); (2) a table row names the
car (whole-token frame code, model or engine, as today); (3) in that row, the cell whose `data-title`/`data-label`
names the position (when the job has one) links to this same page (same host and path as the final address). The
saved evidence text is `Cross-reference: <that block> · Fits: <row with cell labels>`. Same source-rule routing as
today (NiBK = part maker, its own catalogue).

**RE-32 · Low · SB Parts can't be read by a recipe.** Not fixed in this round: it needs a real browser. SB pages
Google finds are still read as today. Done-test 1 (SB + NiBK agree) waits for this.

**Files:** new migration (`npx supabase migration new research_form_recipe`: column + kind check), `research_page_reader.ts`
(form input), `research_recipes.ts` (kind, cross-reference proof), `catalog_research_worker.ts` (select the column,
use the shared proof on Google pages, a form read counts as 1 read), `research_engine_routes.ts` (kind, field, test),
`TrustedSitesScreen.tsx` + `researchEngineService.ts` (kind option, "Form fields" box, recipe card steps), their tests.

**Done-tests (made-up pages in unit tests, real NiBK page for the owner's run):**
33. A form recipe posts the filled fields, follows the 303 and reads the product page; a 307 answer is refused.
34. On a page shaped like NiBK's: number in the cross-reference list + M900A row + `Front Brake` cell linking to this page
    → found; job wants **rear** → not found; number missing from the list → not found; only an M910A row while the car
    is M900A → not found; the `Front Brake` cell links to another page → not found.
35. The recipe form saves and edits a form recipe; the card shows its steps; **Test on a car** on the live NiBK recipe
    with the Roomy M900A and `04465-B1120` shows the M900A row with `Front Brake PN5562`, saves nothing but the
    `recipe_test` read.

**Owner's recipe (after go-live), Trusted sources → jnbk-brakes.com → Add a recipe:** Name `Search by part number`;
How it looks things up `Fill the site's search form, then read the page it opens`; Lookup address
`https://www.jnbk-brakes.com/catalogue/cars`; Form fields `txtPartNo={number}&txtClass=1&btnProductSearch=Search`.
Then **Test on a car**: car `Toyota Roomy M900A`, part number `04465-B1120`.

**Built + tested (21 Nov):** migration `20261121100925_research_form_recipe.sql`; reader form post; `form_then_page` +
`findCrossReferenceRow` / `findEvidenceOnPage`; worker + routes + Trusted sources form (kind, Form fields, part number
box in Test on a car). Code review (high) fixes, all done: links only count as "this page" with the same query string
(`#` and `javascript:` never); the factory number must stand on its own as an element's text (a search echo,
"Similar:" line, heading, link or form control never counts; select/textarea/button are stripped); punctuation ignored;
the site's own number in the position cell proves itself; a form answered in place (no redirect) is never evidence;
the link rule is kept only for kinds that use it and clearing the box clears it; form fields over 1,000 characters are
refused. Not changed: cookies are not carried across the form redirect (NiBK's product page opens without one).
Checks: Deno 136 pass (`research_form_recipe.test.ts` new), SQL checks + 3 new form-recipe checks pass on the local
copy, admin tsc 0 + vitest 45, screen test 16 pass (new: save a form recipe). Real run through the engine's own reader
against jnbk-brakes.com (reads saved on the local copy only): `04465-B1120` + Roomy M900A front → found, row
`BODY: M900A · Front Brake: PN5562`; rear → not found.
