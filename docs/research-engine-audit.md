# Research engine (cars, specs, parts) — audit

**Rev 6.1 · 21 Nov 2026 · Status: LIVE, in practice mode.** RE-70 (number changed during the build) added. Engine on, practice (shadow) mode, US$1.35/day.
Live code: main `c7df3041` (platform-catalog, catalog-research, fleet-core, Dominion). Branch `parts-auto-match` has the
same research code. **One database change is written but NOT on live:** `20261121171424_research_fill_per_axle.sql` (§3).

Full history (every finding RE-01…RE-69, reviews, Spike 0, done-tests, how each fix was built):
`git show 054d8fb1:docs/research-engine-audit.md` (Rev 5.8). This file keeps only what is open.

## START HERE (new chat)

1. Read this file. Follow `docs/how-we-build-playbook.md`. The owner is not a coder: plain words, short replies.
2. Owner rules learned the hard way (keep them):
   - On-screen instructions: **one short line per step, no explanations**. Look at the screen-test picture before shipping.
   - **Only change what the owner asks.** Keep everything they asked for before (e.g. the Model/Engine/Prod period/Grade/
     Transm list in the browser check).
   - **No codes for users to type** (frame/engine codes, factory numbers): pick from dropdowns or tap suggestions.
   - Car pickers = Make → Model → Year (→ Version in plain words).
   - Never fetch a third-party site with a browser name; sites that block ClaudeBot (sbparts.jp, rockauto) are not opened
     by Claude at all.
   - **Writes to the live database** (data or migrations) can be blocked by the auto-mode safety check: ask the owner
     ("reply yes, apply …") or hand them the SQL for the Supabase SQL editor. Every hand-run migration needs its logbook
     line (`INSERT INTO supabase_migrations.schema_migrations (version, name) …`).
   - **Never `git stash`.** The branch holds other unsaved work (toll, Fleet maintenance, trips, rides): commit only
     research files. Ship to main from a worktree off origin/main (memory "golive-worktree-recipe").
   - Push order: build → code review → local Playwright → push. Kill leftover test servers on port 3018 if Playwright
     says the port is busy.
3. Tests to keep green: Deno (`deno test --no-check --allow-all supabase/functions/_fleet-server/catalog_research_*.test.ts
   supabase/functions/_fleet-server/research_*.test.ts …listings_for_vehicle.test.ts api_pricing.test.ts
   catalog_privacy.test.ts pending_parts_catalog_routes.test.ts` — 166), admin (`npx tsc --noEmit -p tsconfig.json`;
   `npx vitest run src/components/admin/research-engine src/components/admin/vehicle-catalog
   src/components/admin/parts-database` — 61), screens (`pnpm test:e2e:dominion:research-engine` — 18), SQL
   (`supabase/tests/research_engine_checks.sql`, `catalog_research_claim_checks.sql` on the local copy).

## 1. Where we stopped (21 Nov, evening)

The owner was working through the **Toyota Roomy 2016–2020 2WD** (catalogue row `3cd9cbf3-a804-4817-82db-400cf6abf13a`,
Amayama version `M900A-AGBVE`, remembered in `research_car_site_version`). Done on live for this car:
- NiBK recipe added and tested (front pads PN5562 for `04465-B1120`).
- Fill this car ran (8 lookups, 0 proven automatically, US$0.008).
- Browser checks confirmed by the owner: **spark plugs Toyota 90048-51216**, **engine air filter Toyota 17801-21060**.

**RE-70 (21 Nov, fixed):** Toyota changed the Roomy shocks at 11.2018 (frame M900A-0255547): front LH 48520-B9285 →
B9115, front RH 48510-B9285 → B9115, rear (both) 48530-B9285 → B9165. The check could hold only one number per place and
its date question passed any overlap, so the early numbers would have been saved for every Roomy. Now the number step has
**One number / Changed during the build**: pick the change month + year, then a "built before" and a "built from" number
per place (or one pair for parts without places). Saved as `part_listing.year_to` / `year_from` (whole years; a change
mid-year lists both numbers for that year; January → old number ends the year before). Fleet's parts lookup already
filters by the car's year (`catalog_api.ts` `yearInRange`). The exact month stays in the evidence text.

**Next for the owner, in Pending catalog → Parts (refresh first):**
1. **Shock absorber** browser check: Open Amayama → "Front spring & shock absorber" and "Rear spring & shock absorber" →
   **Changed during the build** → Nov 2018 → tap/type the before and from number for each place (table above) → Confirm.
2. **Cabin A/C Filter** browser check, same way.
3. The **Needs review** rows (coolant, tyre size, H4 bulb, thermostat, wheel bearing, drive belt) have no source; they
   need a browser check or a reject — don't press "Looks right" on an unsourced row.

## 2. How the browser check works now (live)

Pending catalog → Parts → a "Browser check" row → **Open browser check**. Five questions, nothing to copy:
1. **Open Amayama** (the remembered version's page; the button names the site it opens).
2. **Check it's this one:** Model / Engine / Prod period / Grade / Transm (catalogue's own words, with copy icons on
   Model and Engine) → Yes / No. When Roam doesn't know the version yet: "Click the row with: …" + type the Model shown
   (remembered after Confirm).
3. **Search _x_. Do you see _ROW NAME_?** (copy icons) → Yes / No.
4. **One number, or a change by build date?** (parts only; "One number" is the default). Changed → month + year.
5. **Its number:** tap one of Roam's numbers (copy icons) or type it (typed twice). Parts that come in positions
   (shocks, bearings, brakes, calipers) ask **a number for each place**; after a change, a before and a from number.
6. **Do its dates include the car's build?** (after a change: "Do their dates together cover …?") → Yes / No. Any No →
   "Then press Not on this page."
Confirm saves the number(s) as Confirmed, route `owner_browser`, proof = the page link + the answers.

## 3. Open work, in order

1. **Apply `20261121171424_research_fill_per_axle.sql` on live** (blocked by the safety check; ask the owner or give
   them the file + logbook line). It makes Fill this car queue a front and a rear job for parts with positions, skip an
   axle already confirmed, and join an older open job with no position. Until it's applied, CI's migration-parity check
   may flag it.
2. **Small fixes (one round):**
   - `GET /admin/catalog-research/health` — on/practice/paused, spend today vs cap, jobs waiting, open checks, newest
     worker step (RE-45).
   - Research screen test in its own job in `.github/workflows/dominion-places-e2e.yml` (a stale find-parts test fails
     first and skips it) (RE-40).
   - Master-data breaks: `GET /admin/catalog/signals` returns fleet/vehicle counts to Dominion; the "Added. N companies
     were told…" panel (RE-41).
   - Settings shows jobs per day, finish date vs `fill_target_date`, and refuses a cap above the Google limit
     (~US$21.60/day if the limit counts searches) (RE-37, RE-50).
   - Cross-reference proof prefers the row with the car's own engine (RE-55).
   - An owner's browser check is stored `trust_set_by = 'engine'` (needs a save-function change so evidence is kept for
     `owner`) (RE-58).
   - Pasted catalogue text keeps prices (only the old paste path) (RE-59).
3. **Dominion data fix (RE-64):** `vehicle_catalog.full_model_code` / `trim_suffix_code` for the Roomy are wrong
   (`GBME` is Toyota's X grade; the Custom G is `AGBVE`). Correct from Toyota's version list; don't use these columns for
   catalogue lookups until confirmed.
4. **More sources (the real unlock — "0 of 17 measures our list, not the engine"):**
   - `scripts/honest_fetch.mjs` first: the only way to fetch a site by hand (honest `RoamResearchBot/1.0`, robots.txt
     first, refuses ClaudeBot-blocked / blocked sites) (RE-52).
   - **Spike 1:** robots/terms + "is there a by-car lookup / form / PDF" for Denso, NGK, Aisin, KYB, Akebono, Advics,
     Mitsuboshi, Bando, NWB, Sakura, Yuasa, Brembo; a recipe per allowed site; run the Roomy → a real "N of 17" (RE-46).
   - **Catalogue first by car (RE-49):** today every part job asks Gemini + Google first (~US$0.075/job). Recipes that
     look a car up run first and skip Gemini when they prove the part; one recipe per part type (`component_id`,
     `row_words`), at most 3 per job within the 4-read budget. Recipes also need part types so NiBK isn't tried for
     spark plugs (RE-56).
   - Spec lookups never use recipes (RE-53) — spec recipes later.
   - PDF catalogue reader for part makers that publish PDFs (RE-47); SB Parts needs a browser reader (Cloudflare
     Browser Rendering; check its JSON address first) (RE-36/RE-51).
   - **Owner:** ask the Toyota/Daihatsu parts distributor in Jamaica for catalogue access / data export; send the
     permission emails to Masuma, Amayama, Megazip, Partsouq (Claude drafts both).
5. **Readiness rebuild held back:** "ready" should count only Confirmed specs, but rebuilding `variant_parts_readiness`
   takes longer than live's 2-minute limit, and the nightly `catalog-demand-readiness` job has failed every night since
   at least 16 Nov. Fix the slow rebuild first, then swap `(COALESCE(btrim(sv.evidence_url), '') <> '')` for
   `(sv.trust = 'confirmed')` in a new migration (old block: `git show 92b3cd21:supabase/migrations/20261120234117_research_engine_layer1b.sql`).
6. **Switch on for everyone** (leave practice mode) once the Roomy results look right — with 0–2 of 17 automatic this
   mostly grows the browser-check queue (cap: 25 open).
7. Cleanup migration: drop `catalog_trusted_source`, `catalog_trusted_source_fetch`, `part_fitment`,
   `catalog_research_settings.daily_job_limit`; CI search so nothing uses `part_fitment` again.

## 4. Pace and cost (for planning)

Measured on the Roomy fill: ~2.9 Google searches per job, US$0.0082 for 8 jobs (inside the free 5,000 searches a month).
Spike 0 estimate: US$0.075/job → the US$1.35 cap buys ~18 paid jobs/day + ~32 free → the 200 cars that matter
(~3,400 lookups) in ~2.3 months today; about a month once parts use by-car recipes (specs stay search-bound).

## 5. Key places in the code

- Server: `supabase/functions/_fleet-server/` — `catalog_research_worker.ts` (jobs), `research_page_reader.ts` (honest
  reader, form posts), `research_recipes.ts` (recipes, same-row + cross-reference proof), `research_browser_check.ts`
  (paste gate, `answersGate`, version/period helpers), `research_engine_routes.ts` (owner routes incl. browser-check
  confirm), `catalog_research_routes.ts` (job details: known version, sister engines, engine words).
- Dominion: `apps/admin/src/components/admin/research-engine/` — `ResearchJobDrawer.tsx` (browser check questions),
  `TrustedSitesScreen.tsx` (recipes, Test on a car with Make → Model → Year pickers), `researchModel.ts`, `carPick.ts`.
- Tables: `trusted_site`, `trusted_source`, `research_lookup_recipe`, `research_page_read` (append-only evidence),
  `research_car_site_version` (remembered catalogue version + its row), `catalog_research_job`,
  `catalog_part_proposal`, `catalog_spec_proposal`, `catalog_research_settings`.
- Screen test: `e2e/dominion-research-engine.spec.ts`. Set `RE_SHOTS=<scratchpad folder>` for pictures; delete them after.

## 6. Not in this audit

Service schedules research; prices / suppliers / stock; licensed TecDoc feeds (a licensed feed would count as the
suppliers' own data, but check JDM coverage and storage rights first); the parts auto-match engine;
`log-service-parts-gaps-audit.md` items.
