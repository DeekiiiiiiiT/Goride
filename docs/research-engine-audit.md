# Research engine (cars, specs, parts) — audit

**Rev 4.4 · 21 Nov 2026 · Status: LIVE (layers 1–3 + Rev 4.2 NiBK form recipe). Engine on, practice (shadow) mode,
US$1.35/day.** Live database: migrations 1a/1b/2/3 (03:10 UTC) and `20261121100925_research_form_recipe` (10:25 UTC),
all with logbook lines. Live code: main `0e00cd5b` (platform-catalog, catalog-research, Dominion). Branch
`parts-auto-match` `fc2e2b85` holds the same research code. Held back: readiness counts only Confirmed specs (§6 step 5).
**Next = §R step 1: the owner adds the NiBK recipe and runs Test on a car on the Roomy.**

History (not needed to continue): the closed plan with all findings RE-01…RE-29 and the Spike 0 tables is
`git show 6064a3f4:docs/research-engine-audit.md`. The 18-screen Keep / Drop / Add lists are in
`git show 92b3cd21:docs/research-engine-audit.md`.

## R. Reviewer summary (21 Nov)

**What was done, in order**

| When (UTC, 20–21 Nov) | What | Commit / where |
|---|---|---|
| 20 Nov | Plan closed (RE-01…RE-29), Spike 0 on real sites, 18 Stitch screens | `6064a3f4` |
| 20–21 Nov | Layers 1–3 built: database, honest page reader + recipes + same-row proof, worker, 18 Dominion screens | `92b3cd21`, `07badfa1` |
| 21 Nov | Code review (high): 10 fixes (§2a) | `92b3cd21` |
| 21 Nov 03:10 | Go-live: 4 migrations, server, Dominion; readiness rebuild held back (§6 step 5) | main `8c63c773`, `87f420cf` |
| 21 Nov | Found that §6 step 3 couldn't work: NiBK searches by form only; its product pages split the factory number from the car row (§9) | — |
| 21 Nov | Built RE-30 (form recipes) + RE-31 (cross-reference proof); code review (high) found 7, 6 fixed, 1 not needed (§9) | `fc2e2b85` |
| 21 Nov 10:30 | Rev 4.2 live: migration + server + Dominion | main `0e00cd5b` |
| 21 Nov | Access decision: no robot of any kind on sites that forbid it; next round = screenshot browser checks, Chrome helper, honest browser reader (§10) | this file |
| 21 Nov | Reviewer round on Rev 4.3: 9 findings RE-37…RE-45, one fix each; done-tests renumbered 37–46 (§11) | this file |

**What is proven**
- Unit, SQL and screen tests: Deno 136, SQL checks (incl. 3 form-recipe checks), admin tsc 0 + vitest 45, screen
  test 16 — all pass locally. Done-tests 30, 37, 38 pass in tests.
- Real site, real reader: the engine's own reader posted NiBK's form for `04465-B1120` and proved the Roomy M900A
  front pads (NiBK `PN5562`); asking for rear was refused. The reads were saved on the local copy only (§9).
- Live: both server parts start (401 without login = running), settings unchanged (on, practice, US$1.35, 0 failures).

**What is not proven yet:** every real-run done-test in §5, and done-test 35 on live. None has run: no recipe exists on
live yet, and no fill has been started.

**CI on main `0e00cd5b`:** edge deploy, Vercel, Supabase function tests, Parts SQL checks, Parts auto-match e2e,
recon-worker — green. Red, both already red before today and not caused by this work:
(1) "migration version list matches production": `20261117204932` (cash tolls) is live but only on the branch;
(2) `e2e/dominion-find-parts-visual.spec.ts` "parts database keeps the tab in the address bar" (stale since 8 Nov).
Because (2) fails first in the "Dominion places checks" job, the research screen test did not run on CI for this push
(it passes locally).

**Next steps (in order)**
1. **Owner:** Trusted sources → jnbk-brakes.com → Add a recipe with the values in §9 "Owner's recipe"; **Test on a car**
   with Roomy M900A + `04465-B1120` → expect the M900A row with `Front Brake: PN5562` (done-test 39).
2. **Owner:** **Fill this car** on the Roomy M900A, still in practice mode → proves done-tests 5 and 4 (on Looks right).
   Claude reads the results on live and records them here.
   - **Claude, right after:** write the measured cost per job, searches per job, jobs per day at the cap and the
     200-car finish date into §1 (RE-37).
   - **Claude, one small-fix round:** `GET /health` (RE-45), research screen test in its own CI job (RE-40), the two
     master-data breaks (RE-41), jobs per day + finish date on Settings (RE-37).
3. **Owner:** send the permission emails to Masuma, Amayama, Megazip and Partsouq (Claude drafts them). The biggest
   unlock: Spike 0 showed 0 of 17 Roomy parts automatic today, at most 2 of 17 with NiBK + SB.
4. **Build RE-34 + RE-35** (§10): screenshot drop and one-click Chrome helper for browser checks. Playbook order: audit
   round 1 → Stitch prompt for the new parts of the browser check screen → screens → round 2 → build.
5. **Build RE-36** (§10): honest browser reader for allowed sites that only work in a browser (SB Parts) → done-tests
   1 and 31.
6. **Fix the nightly readiness rebuild** (separate audit; it has failed every night since at least 16 Nov), then run
   §6 step 5.
7. **Switch on for everyone** (leave practice mode) once steps 1–2 show correct results (owner rule: on for all companies).
   With 0–2 of 17 parts automatic, this mostly grows the owner's browser-check queue, not coverage; the 25-open cap is
   the brake (RE-42). Best done after RE-34/RE-35 are live, so each check takes seconds.
8. Cleanup migration (§6 step 6) and the §7 follow-ups.

## START HERE (for a new chat)

1. Read §R, then this file top to bottom. Follow `docs/how-we-build-playbook.md` and §0. Plain words to the owner,
   short replies. **Never `git stash`.** Branch `parts-auto-match` also holds other unsaved work (toll, Fleet
   maintenance, trips, rides) — commit only research files.
2. Push order (owner rule): build → code review → local Playwright → push; go live from a worktree off origin/main
   (memory "golive-worktree-recipe"). Apply a migration to live **before** pushing code that reads its columns; dry-run
   it as BEGIN … ROLLBACK first; add its logbook line.
3. A push to the branch does **not** change the owner's localhost screens — localhost reads the LIVE server.
4. The Overview page keeps its current look on purpose (every other Stitch card was invented). If the owner wants the
   Stitch Overview look, the first build step is naming the real number behind each card.

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
  disguised. Blocked catalogues become **browser checks** (the owner opens the page and pastes the line). This holds
  for every kind of robot — server reader, hidden browser, screenshot robot, or a program moving the owner's own mouse
  (§10).
- Information only (no prices / stock / ordering). Customer screens never mention lookups.
- Owner preferences: plain words, one fix per finding, no approval gates, buttons look like buttons (danger = red
  border), no browser pop-ups, exact hex colours in Dominion (dark-mode remap). Stitch = the look, the audit = the
  content (invented facts dropped).
- Decided: research model stays Google Gemini; cost ~US$0.075 per job (Spike 0, measured — see RE-37 for
  the pace this gives); daily cap US$1.35; build runs "fill the cars that
  matter first" (owner-started fills + browser checks, at most 25 open). Allowed sites: jnbk-brakes.com (readable, form recipe),
  bremboparts.com, rockauto.com (reference), sbparts.jp (allowed but **unreadable until RE-36** — its search only works
  in a browser). Blocked: masuma.parts (`/find-parts/`), amayama.com, megazip.net,
  partsouq.com, 7zap.com.

## 1. Numbers (20 Nov, live)

2,679 car versions (763 with no frame code); 0 cars "ready"; specs on 3 cars before the CSV backfill (2,471 tyre sizes
become Needs checking in layer 1b). Research jobs ever: 3.

**Pace (RE-37):** at US$0.075 a job (Spike 0) the US$1.35 cap buys 18 paid jobs a day, plus the free 5,000 Google
searches a month (~960 jobs if nothing else in Roam uses them) → ~1,500 jobs a month → the 200 cars that matter
(~3,400 lookups) in ~2.3 months, ~6 months without the free searches. **To replace with live measurements after §R
step 2:** cost per job, searches per job, jobs per day, finish date.

## 2. What is built (all live)

| Layer | Main files | What it does |
|---|---|---|
| 1a database | `supabase/migrations/20261120233053_research_engine_layer1a.sql` | New tables `trusted_site`, `research_lookup_recipe`, `research_page_read` (append-only evidence), `dominion_system_notice`, `dominion_audit_log`, `brand_alias`, `catalog_spec_proposal`, `research_number_conflict`, `spec_column_key_map`; job / proposal / listing / spec columns; engine verdicts; vehicle job key without org id; open-job index covers browser checks; unstick + notices crons; RLS deny-all. |
| 1b database | `…20261120234117_research_engine_layer1b.sql` | CSV specs → `catalog_spec_value` as Needs checking; only Confirmed specs count for "fits by size" and readiness; `promote_part_proposal` saves via the Add-parts path. |
| 2 database | `…20261120235237_research_engine_layer2.sql` | Claim (fleet/fill take turns, spend cap, single flight per job), fill planner (`catalog_research_fill_car/_model/queue_item/_queue_identity/_queue_model`), 30-day browser-check expiry, `promote_spec_proposal`, `approve_vehicle_proposal`. |
| 2 server | `_fleet-server/research_*.ts`, `catalog_research_*.ts`, `listings_for_vehicle.ts`, `api_pricing.ts`, `api_usage_logger.ts`, `platform-catalog/index.ts` | Honest page reader, recipes + same-row proof, source-rule routing, provider faults, worker rev `catalog-research-7`, privacy guard on every research + pending route, browser-check gate. |
| 3 database | `…20261121004356_research_engine_layer3_reads.sql` | `catalog_research_screen_summary()` and `catalog_research_coverage(car)` for the screens. |
| 3 screens | `apps/admin/src/components/admin/research-engine/` + `services/researchEngineService.ts` | All 18 Stitch screens: Parts list / drawer / browser check / two makers disagree / all caught up / states / phone sheet, Vehicles list / proposal drawer / Research this model, Settings and health, Trusted sources + Add a site + recipes with Test on a car, car page Coverage tab + identity first, Car specs table with trust, notice banners (Overview + Pending catalog). Old pending-parts / vehicles / settings / trusted-sources screens deleted. |
| Rev 4.2 | `…20261121100925_research_form_recipe.sql`, `research_page_reader.ts`, `research_recipes.ts`, `catalog_research_worker.ts`, `research_engine_routes.ts`, `TrustedSitesScreen.tsx`, `research_form_recipe.test.ts` | Form recipes (`form_then_page` + `form_body_template`), cross-reference proof, Form fields box and part number in Test on a car (§9). |

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

### 2b. Commits

All research files are committed: `92b3cd21`, `07badfa1`, `d639e4b4`, `fc2e2b85` on `parts-auto-match`; on main
`8c63c773`, `87f420cf`, `0e00cd5b`. The branch's other unsaved work is not research and stays out of research commits.

## 3. Checks to keep green

- SQL (local copy up: `npx supabase start`; after editing a migration run `npx supabase db reset`):
  `docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/research_engine_checks.sql`
  and the same for `supabase/tests/catalog_research_claim_checks.sql`. `node scripts/validate-migration-sql.mjs`.
- Deno (136 pass, incl. `research_form_recipe.test.ts`): `deno test --no-check --allow-all supabase/functions/_fleet-server/catalog_research_*.test.ts
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

Status on 21 Nov: **none of these has run on live yet** (no recipe on live, no fill started). §R lists which step proves
which test. Only real-site / real-car tests are listed. The rest of the closed plan's list (0, 6, 7, 10–16, 19–30,
33–36; text in `git show 6064a3f4:docs/research-engine-audit.md` §7) were proven on the local copy by the Deno, SQL and
screen tests and the local end-to-end run (Rev 3.0–3.2). Rev 4.2+ tests are numbered from 37 on (37–39 §9, 40–45 §10).

| # | Test | Status · proved by |
|---|---|---|
| 1 | SB and NiBK both list the same factory number for the Roomy M900A pads → Confirmed by route (c), both reads in `evidence_read_ids`, `trust_set_by = 'engine'` | Open · waits for RE-36 (SB can't be read yet). Note: the Roomy M900A rear is drums + shoes (NiBK `FN0046`), so use the **front** pads (`04465-B1120`). |
| 2 | Amayama blocked: a Toyota OEM number job makes a browser check with the exact link and no server fetch; after the owner confirms it is Confirmed by route (a), goes to review, shows "Confirmed · owner-checked <date>" | Open · §R step 2 (a Fill makes these) |
| 3 | "Wheel bearing · rear" on the Roomy: the fit lists the version(s), LR/RR and the frame range from the page block | Open · §R step 2 |
| 4 | **Looks right** → Fleet Find parts for 5179KZ shows it, the four former `part_fitment` readers return it, the request closes by itself, Undo removes it | Open · §R step 2 |
| 5 | **Fill this car** on the Roomy → a job for every missing core part and spec; after the queue drains none is left Missing without a job | Open · §R step 2 |
| 8 | A car with no frame code → **Research identity** fills chassis + frame range + engine, then its part jobs run | Open |
| 9 | **Research this model** "Toyota Roomy" → every version tagged new / update / same, **Approve all new** adds them, nothing duplicated | Open |
| 17 | Settings shows the measured cost per job (grounding included), the daily cap and the expected finish date | Open · readable after §R step 2 |
| 18 | Once, on a test key, Google's 1,500-a-day grounding limit is passed: record the reply; the engine pauses until 00:05 UTC with no job failed | Open |
| 31 | **Test on a car** on the SB recipe shows the found row for the Roomy, logs one `recipe_test` read, saves nothing; two failed tests leave the site `allowed` | Open · waits for RE-36 |
| 32 | On a real conflict: **Use this one** adds that number, rejects the other, closes the request once; **Neither is right** adds nothing and sets the job to Couldn't find (and the fleets are told) | Open · needs a real conflict |
| 37 | A form recipe posts the filled fields, follows the 303 and reads the product page; a 307 answer is refused | **Passed** (unit tests; real NiBK through the reader on the local copy) |
| 38 | NiBK-shaped page: cross-reference + M900A row + Front Brake cell linking here → found; rear / number missing / only M910A / cell links elsewhere → not found | **Passed** (unit tests + real NiBK page) |
| 39 | Save a form recipe; card shows its steps; **Test on a car** on live NiBK with Roomy M900A + `04465-B1120` shows `Front Brake: PN5562`, saves only the `recipe_test` read | Half · saving passes in the screen test; live test = §R step 1 |

## 6. Go live

1. ~~Apply migrations 1a → 1b → 2 → layer-3 reads with logbook lines; deploy `platform-catalog` + `catalog-research`;
   ship the admin app.~~ **Done 21 Nov 03:10 UTC** (1b's readiness rebuild held back, step 5). Rev 4.2 migration done
   10:25 UTC.
2. ~~`catalog_research_settings.enabled = true`, practice mode on, `daily_spend_usd = 1.35`.~~ **Done**, checked 10:35 UTC.
3. Trusted sources → add the first recipe (NiBK's catalogue form, values in §9) → **Test on a car** on the Roomy M900A →
   **Fill this car** on the Roomy. **Next (owner) — §R steps 1–2.**
4. Switch on for everyone (owner rule) — §R step 7.
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
- `GET /admin/catalog/signals` returns fleet demand counts to Dominion (breaks the master-data rule) — now RE-41, in the §R step 2 small-fix round.
- The live "Added — pick the part" panel says "Added. N companies were told…" (a company count in Dominion) — now RE-41.
- RE-29's 24-month re-check of owner-checked rows is not built (no row can be that old before 2028).
- Stitch Overview design (if the owner wants it): first name the real number behind each card (START HERE step 4).

## 8. Not in this audit

Service schedules research; prices / suppliers / stock; licensed TecDoc feeds; the parts auto-match engine (S3);
`log-service-parts-gaps-audit.md` items.

## 9. Rev 4.2 — NiBK form recipe and cross-reference proof (21 Nov) — LIVE (main `0e00cd5b`)

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
Google found, tried only when the same-row proof fails. It passes only when all three hold: (1) the factory number stands on
its own as an element's whole text, the way a cross-reference list shows it (punctuation ignored; a search echo, a
"Similar:" line, a heading, a link or a form control never counts) — or it is the site's own number in the position
cell; (2) a table row names the
car (whole-token frame code, model or engine, as today); (3) in that row, the cell whose `data-title`/`data-label`
names the position (when the job has one) links to this same page (same host, path and query string; `#` and `javascript:` links never count). The
saved evidence text is `Cross-reference: <that block> · Fits: <row with cell labels>`. Same source-rule routing as
today (NiBK = part maker, its own catalogue).

**RE-32 · Low · SB Parts can't be read by a recipe.** Not fixed in this round: it needs a real browser. SB pages
Google finds are still read as today. Done-tests 1 and 31 wait for this. Fix = RE-36 (§10).

**Files:** new migration (`npx supabase migration new research_form_recipe`: column + kind check), `research_page_reader.ts`
(form input), `research_recipes.ts` (kind, cross-reference proof), `catalog_research_worker.ts` (select the column,
use the shared proof on Google pages, a form read counts as 1 read), `research_engine_routes.ts` (kind, field, test),
`TrustedSitesScreen.tsx` + `researchEngineService.ts` (kind option, "Form fields" box, recipe card steps), their tests.

**Done-tests (made-up pages in unit tests, real NiBK page for the owner's run):**
37. A form recipe posts the filled fields, follows the 303 and reads the product page; a 307 answer is refused.
38. On a page shaped like NiBK's: number in the cross-reference list + M900A row + `Front Brake` cell linking to this page
    → found; job wants **rear** → not found; number missing from the list → not found; only an M910A row while the car
    is M900A → not found; the `Front Brake` cell links to another page → not found.
39. The recipe form saves and edits a form recipe; the card shows its steps; **Test on a car** on the live NiBK recipe
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

## 10. Rev 4.3 — access: what the engine may read, and the next round (21 Nov)

**RE-33 · High · Most parts are behind sites that forbid robots.** Spike 0 (20 Nov, real Roomy): 0 of 17 core parts
could be proven automatically; at most 2 of 17 once NiBK and SB both work. The rest are on Amayama, Megazip, Partsouq
(terms ban automated access) and Masuma's by-car pages (robots.txt blocks `/find-parts/`).
The owner asked on 21 Nov whether a robot could do the lookups the owner and Claude do by hand: a hidden browser, a robot
that takes screenshots for the AI to read, or a program that moves the owner's own mouse and clicks. **The rule stays:
no robot of any kind on a site that forbids it.** Reasons: (1) those terms ban automated access whatever the method — a
screenshot or a real mouse doesn't change that; (2) to work it would have to pass as a person, which is the bypass §0
rules out; (3) it would run on the owner's own computer, address and accounts, so a ban would also end the owner's
manual checks; (4) ~3,000 lookups for the 200 cars that matter is bulk copying of their catalogue. The line: **the owner
visits the page and the computer helps capture and read it** = allowed; **the computer does the visiting** = not.
Fix, in order of reach: (a) permission emails to the four sites (owner; Claude drafts) — one "yes" opens a whole site to
the engine; (b) make each browser check take seconds (RE-34, RE-35); (c) an honest browser reader for allowed sites
(RE-36); (d) if (a) gets no answer, a licensed parts data feed (paid; outside this audit, §8).

**RE-34 · Medium · Browser checks need copy-paste.** Today the owner opens the page and pastes the matching line.
Fix: the browser check accepts a **screenshot** as well as pasted text. Before anything is sent, the drop zone has a
crop step: the owner marks the part of the page with the line; only that cropped area is sent (never browser bars,
other tabs or the whole screen). The AI reads the cropped image and returns the line
it read (number, car, position); the screen shows that line next to the picture; the same deterministic gate as today
then checks number + car (+ position) in that line; nothing is added until the owner presses Confirm. Saved evidence (review RE-39): the cropped image itself in private
storage (Cloudflare R2, private, same path rules as other Dominion files) for as long as the row exists, plus its hash,
the line the AI read, the line the owner confirmed and the page link, so the row can be re-checked later. The row is
labelled "Confirmed · owner-checked <date>" (route (a), the owner's own check), with the image one click away. This
loosens RE-21 ("page text never goes to Gemini") only for cropped screenshots the owner submits, never for pages the
engine reads. Size limit and image types follow the existing upload rules.
Done-tests: 40. a screenshot with the number and M900A on one line → line shown, Confirm adds it as owner-checked;
41. a screenshot where the AI reads a different number → the gate refuses it and nothing is added; 42. no screenshot
is ever sent without the owner's click.

**RE-35 · Medium · Moving text from the page into Dominion is manual.** Fix: a one-click Chrome helper. On the catalogue page the owner
selects the matching line and clicks; the helper sends **only the selected text** and the page address to the open
browser check in Dominion. With nothing selected it asks the owner to select the line and sends nothing (a whole
catalogue page can carry prices and stock, which Dominion never stores). Permissions: Chrome's `activeTab` only (works
on the tab the owner clicked, nothing else; no all-sites access). It never opens or clicks pages itself and only
sends to the owner's own Dominion session. The text goes through the same deterministic gate as pasted text and is
**never sent to Gemini** (review RE-43). Done-tests: 43. click on an Amayama page → the browser check fills with that page's
text + address, the gate runs; 44. with no browser check open, the helper says so and sends nothing.

**RE-36 · Medium · Allowed sites that only work in a browser can't be read (RE-32).** Where it runs (review RE-38):
**Cloudflare Browser Rendering** (its REST page-content call returns the page after the browser has built it), called
from the existing reader in the edge function. Reasons: the owner is already moving storage to Cloudflare (R2), so no
new server to keep running; the edge function stays the single reader, so the trusted-site check, robots check, caps
and evidence saving are unchanged; a render counts as one read with a 30-second limit inside the 2-minute tick.
Checks before building, with the answers written here: Cloudflare's price per render, that it identifies itself as a
robot and does not get around bot protection, and that SB's robots.txt allows it. If any answer is no, RE-36 stops and
SB stays readable only through pages Google finds. Fix: a browser reader for
`automated_read = allowed` sites only, under the same rules as today's reader: robots.txt re-checked for
`RoamResearchBot`, honest name, same caps, one page per lookup, same saved evidence. Check before building: SB's
robots.txt names ClaudeBot (Spike 0) — confirm it allows `RoamResearchBot`. Done-tests: 1, 31, and 45. a site marked
`blocked` is never opened by the browser reader.

**Order:** RE-34 and RE-35 follow the playbook (round 1 → Stitch prompt for the new parts of the browser check screen
→ screens → round 2 → build); RE-36 has no new screen (a new recipe kind on Trusted sources, same form).

## 11. Rev 4.4 — reviewer round on Rev 4.3 (21 Nov)

The reviewer checked the document against the repo (migrations, routes, screens, spend cap at layer 2 line 128, privacy
guard wired on all four route groups in `platform-catalog/index.ts`) and found nothing out of line with the code.
Findings, one fix each:

**RE-37 · High · The pace isn't stated.** At US$0.075 a job the cap buys **18 paid jobs a day**; one Fill this car is
~17 part jobs plus its spec jobs. Where the number comes from: Spike 0 (20 grounded calls, 20 Nov) measured
**5.2 Google searches per call** × US$0.014 = US$0.073, plus US$0.00075 of tokens. That is a measurement, not a guess:
the screen test's `costPerJob7dUsd: 0.075` is a display fixture copied from it, and the earlier US$0.029 was the
pre-spike estimate at ~2 searches. Google's first 5,000 searches a month are free and `groundingCostUSD` logs them at
US$0, so they don't count against the cap; if nothing else in Roam uses them, that is ~960 extra jobs a month. Pace for
the ~3,400 lookups of the 200 cars that matter: **~1,500 jobs a month ≈ 2.3 months** with the free searches, **~6
months** without them. Fix: after §R step 2, write into §1 the measured cost per job, searches per job, jobs per day at
the cap and the 200-car finish date; Settings shows jobs per day and the finish date next to cost and cap (done-test 17
now includes both). If the finish date is past the 90-day target (RE-24), the cap is raised to the figure that meets it.

**RE-38 · High · RE-36 had no place to run.** Edge functions have no browser. Fix: Cloudflare Browser Rendering,
written into RE-36 (§10) with the checks to answer before building.

**RE-39 · High · A hash of a deleted screenshot proves nothing.** Fix: keep the cropped image in private storage for as
long as the row exists, crop before sending, label the row as the owner's check. Written into RE-34 (§10).

**RE-40 · Medium · CI skipped the research screen test.** In "Dominion places checks" a stale find-parts visual test
(owned by the find-parts work, red since 8 Nov) fails first, so the later steps never run. Fix: the research screen
test gets its own job in `.github/workflows/dominion-places-e2e.yml`, so nothing else can skip it.

**RE-41 · Medium · Two live breaks of the master-data rule (§7).** (1) `GET /admin/catalog/signals`
(`catalog_routes.ts:225`) returns `fleet_count`, `vehicle_count` and `open_count` to Dominion. Fix: the response drops
those fields; the server keeps using them to order work. (2) The "Added — pick the part" panel says "Added. N companies
were told…". Fix: it says "Added. The fleets that asked were told." Both go in the small-fix round under §R step 2.

**RE-42 · Medium · Switching on for everyone grows the queue, not coverage.** Fix: written into §R step 7 (the 25-open
browser-check cap is the brake; best after RE-34/35).

**RE-43 · Medium · RE-35 sent too much and asked for too much.** Fix: `activeTab` only, selected text only, never to
Gemini. Written into RE-35 (§10).

**RE-44 · Low · §0 called SB readable.** Fixed in §0: allowed, unreadable until RE-36.

**RE-45 · Low · "401 = running" is not a health check.** Fix: `GET /admin/catalog-research/health` (Dominion staff)
reads the database and returns: on / practice / paused, spend today vs cap, jobs waiting per queue, open browser
checks, and the time of the newest worker step. Done-test 46: with the engine on it answers within 2 s and the newest
step is under 10 minutes old while jobs are waiting; with the database unreachable it answers 503, not 401.

**Also (found while answering):** the Rev 4.2/4.3 done-tests were numbered 33–41, which the closed plan already used
for other tests (33–36). They are now 37–45, and §5 says which closed-plan tests were proven locally.
