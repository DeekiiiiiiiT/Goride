# Research engine (cars, specs, parts) — audit

**Rev 7.1 · 21 Nov 2026 · Status: LIVE, in practice mode** (engine on, shadow mode, US$1.35/day).
Live: main `a6320fa7` (Dominion + platform-catalog + catalog-research). Branch `parts-auto-match` has the same research
code. Every research migration up to `20261121193554` is on live with its logbook line.

History: `git show 24a6d17a:docs/research-engine-audit.md` (Rev 6.1: RE-70…RE-72 detail) and
`git show 054d8fb1:docs/research-engine-audit.md` (Rev 5.8: RE-01…RE-69, reviews, Spike 0). This file keeps only what
is open.

## START HERE (new chat)

1. Read this file. Follow `docs/how-we-build-playbook.md`. The owner is not a coder: plain words, **short replies**.
   When asked "what next?", answer in one line.
2. Owner rules (keep them):
   - **Nothing goes live without telling the owner first.** Commit on the branch; batch changes; say what is waiting
     and wait for "yes". Exception: a change the owner's next step needs (say so).
   - **Only change what the owner asks.** A question is a question, not a request to change the screen.
   - On-screen text: one short line per step, in the **catalogue's own words** (e.g. Amayama's "Period").
   - No codes for users to type: pick from dropdowns or tap suggestions. Car pickers = Make → Model → Year.
   - Never fetch a third-party site with a browser name; never try to get around a site's block.
   - Live database writes: ask the owner first; every hand-run migration gets its logbook line
     (`INSERT INTO supabase_migrations.schema_migrations (version, name) …`). The Supabase MCP is often down; use
     `npx supabase db query --remote` (`--read-only` for looks; dry-run risky changes inside a `DO` block that ends in
     `RAISE EXCEPTION` so it rolls back).
   - New migration files: `npx supabase migration new <name>` (real current UTC time).
   - **Never `git stash`.** The branch holds other people's unsaved work (toll, Fleet, trips, rides): commit only
     research files. Ship from a worktree off origin/main (memory "golive-worktree-recipe").
   - `deno test` writes into `node_modules/.deno` and then breaks vitest/vite. Fix: `pnpm install --frozen-lockfile
     --offline` at the repo root. Never delete `node_modules/.deno` by hand.
3. Tests to keep green: Deno (`deno test --no-check --allow-all` on `catalog_research_*.test.ts research_*.test.ts
   listings_for_vehicle.test.ts api_pricing.test.ts catalog_privacy.test.ts pending_parts_catalog_routes.test.ts` in
   `supabase/functions/_fleet-server/` — 170), admin (`npx tsc --noEmit -p tsconfig.json`; `npx vitest run
   src/components/admin/research-engine src/components/admin/vehicle-catalog src/components/admin/parts-database` — 62),
   screens (`pnpm test:e2e:dominion:research-engine` — 19).

## 1. Where we stopped (21 Nov, evening)

The owner took a break while working through the **Toyota Roomy 2016–2020 2WD** (catalogue row
`3cd9cbf3-a804-4817-82db-400cf6abf13a`, Amayama version `M900A-AGBVE`).

**Confirmed so far:** spark plugs 90048-51216, engine air filter 17801-21060 (plus brakes from earlier work).

**Next for the owner** (Pending catalog → Parts, refresh first). Three browser checks are open:
1. **Shock absorber, Front.** Amayama "Front spring & shock absorber" → "how many Period dates?" **Two** → Nov 2018:
   front left 48520-B9285 / 48520-B9115, front right 48510-B9285 / 48510-B9115 (before / from).
2. **Shock absorber, Rear.** "Rear spring & shock absorber" → **Two** → Nov 2018: both sides 48530-B9285 / 48530-B9165.
3. **Cabin A/C Filter** (one Period date → **One**).
4. Then the 6 **Needs review** rows (coolant, tyre size, H4 bulb, thermostat, wheel bearing, drive belt): no source, so
   browser check or reject. Never "Looks right" on an unsourced row.

**Unchecked on live:** the owner's last screenshot still showed "Failed" on the 5 rows closed on 21 Nov; RE-73 should
show them as "Closed" with a note. If a refresh doesn't fix it, check that the job list route
(`catalog_research_routes.ts`, `closedNote`) is the deployed one.

**Decision waiting on the owner: sources (no more scraping shops).** Amayama, Partsouq and SB Parts block robots on
purpose (banners on Pending catalog). The owner asked for a plan before any more automatic reading. Proposed:
1. Stop the robot reading shop sites at all: shops are browser-check only from the start (no try → block → banner).
2. Permission emails (Claude drafts, owner sends): Amayama, Megazip, Partsouq, Masuma; and the Toyota/Daihatsu parts
   distributor in Jamaica (catalogue access or a data file).
3. "Spike 1": part makers whose rules allow robots (Denso, NGK, KYB, Aisin, Akebono, Advics, Mitsuboshi, Bando, NWB,
   Sakura, Yuasa, Brembo). Check robots/terms first; a recipe per allowed site; PDF reader where they publish PDFs.
4. Price out a licensed feed (TecDoc or similar). Check Japanese-car coverage and storage rights first.

Recommended: 1 + 2 now, then 3. Nothing built yet. Wait for the owner's pick.

## 1b. For the reviewer: what changed on 21 Nov and how it was checked

**Why:** on the Roomy shock check the owner found that Toyota changed the shock numbers in Nov 2018 (Amayama: "To frame
M900A-0255546 / From 0255547"). The check could hold only one number per place, and its date question passed any
overlap, so the early numbers would have been saved for every Roomy, including 2019–2020 cars. Fixing that turned up
three more fill problems.

| # | What | Where (main) | Live data touched |
|---|---|---|---|
| RE-70 | Browser check takes a change month; each place gets a "before" and a "from" number, saved as `part_listing.year_to` / `year_from` | `2af1bc7c`; wording `f4602c11` | none |
| RE-69 live | `20261121171424_research_fill_per_axle.sql` applied (written earlier, wasn't on live): fill makes a front and a rear job for parts with places | migration on main since `8590bd86` | Roomy's four-corner shock job `d6f9a45e…` closed, its 5 suggestions rejected ("replaced by front and rear checks") |
| RE-71 | Fill skipped parts only when `variant_parts_readiness` said verified, which is stale, so it re-queued confirmed spark plugs + air filter. Now a confirmed listing also skips. `20261121193256_research_fill_skip_confirmed.sql` | `ef58d875` | 2 re-queued jobs closed ("already confirmed") |
| RE-72 | Fill queued rear pads + rear rotor on the Roomy, which has rear drums. Now no pads/rotor on an axle with confirmed drum/shoes. `20261121193554_research_fill_skip_drum_axle.sql` | `7d93ec77` | 2 jobs closed (the worker had already run them), 9 suggestions rejected; checked: 0 promoted, 0 rear pad/rotor listings |
| RE-73 | Jobs closed on the owner's say-so (stored `failed`, note ends "(owner)") show "Closed" + note instead of "Failed" and "didn't find a catalogue" | `a6320fa7` | none |

**How it was checked:**
- Tests: Deno 170 (new: change-date gate, Roomy shock before/from, part without places, closed note), admin tsc +
  vitest 62, screen tests 19 (new RE-70 test, test picture looked at). All green before the code pushes. RE-71 and
  RE-72 are SQL only, with no automated test; they were checked by the live dry runs below. Adding them to
  `supabase/tests/research_engine_checks.sql` is still open.
- Each fill migration was **dry-run on live** in a transaction that rolled itself back (fill the Roomy → list new jobs →
  `RAISE EXCEPTION`): 0 new jobs both times. Then applied with its logbook line and verified (`pg_get_functiondef`
  contains the change; logbook row present).
- Fleet side: `catalog_api.ts` `yearInRange` already filters listings by the car's year, so a 2019 Roomy gets only the
  "from" number; a 2018 car gets both (whole years only).
- Deploys: edge + Vercel deploys green for each push.

**Known limits / risks to look at:**
- Years are whole years: a mid-year change shows both numbers for that year. The exact month and frame number are kept
  only in the evidence text.
- One change date per check: fine with front and rear as separate checks; a left/right split at different dates isn't
  handled.
- `ownerClosedNote` relies on the "(owner)" suffix convention in `last_error`. That's simple, but a real failure written
  with that suffix would show as Closed.
- The save step's existing-listing lookup ignores years: re-confirming the same number for the same place with
  different years keeps the first row.
- RE-72 assumes confirmed BRK-DRUM / BRK-SHOES listings carry the axle in `position`; a drum stored without a position
  won't block pads.
- The data closures were hand-run SQL on live (owner OK each time); they're recorded in `catalog_research_log_event`
  (`replaced_by_axle_jobs`, `already_confirmed`, `drum_axle`).
- CI is red on main for two reasons that are not research and were red before these changes (§3 item 9).

## 2. Browser check (live)

Pending catalog → Parts → "Browser check" row → **Open browser check**:
1. **Open Amayama** (the remembered version's page).
2. **Check it's this one:** Model / Engine / Prod period / Grade / Transm → Yes / No (or type the Model when unknown).
3. **Search _x_. Do you see _ROW NAME_?** → Yes / No.
4. **Under the part, how many different Period dates? One / Two.** Two → "The second Period starts:" month + year.
5. **Its number(s):** tap a suggestion or type it twice. Parts with places (shocks, brakes…) ask per place (front
   checks: front left/right only; rear checks: rear only). After Two: a "built before" and a "built from" number.
6. **Do its dates include / together cover the car's build?** → Yes / No. Any No → Not on this page.

Confirm saves Confirmed listings (route `owner_browser`, proof = page link + answers). After Two, each number gets
`part_listing.year_to` / `year_from` (whole years; the change year lists both). Fleet's parts lookup filters by the car's
year (`catalog_api.ts` `yearInRange`).

Fill this car now: one job per axle for parts with places; skips a part already confirmed on the car; no pads/rotor on
an axle with confirmed drums/shoes. Jobs closed on the owner's say-so are stored `failed` with a note ending "(owner)"
and show as **Closed**.

## 3. Open work, in order

1. **Sources decision** (§1). Nothing else in the "more sources" area until the owner picks.
2. **Known gap (not asked for yet):** step 3 asks "Do you see ABSORBER ASSY, SHOCK?" but Amayama calls the row
   "ABSORBER SET, SHOCK, FRONT RH". Row names come from `partFinder` (`researchModel.ts`).
3. **Known gap:** one change date covers every place in a check. Fine now that front and rear are separate checks;
   left and right changing at different dates isn't handled.
4. **Small fixes (one round):** health route `GET /admin/catalog-research/health` (RE-45); research screen test in its
   own CI job (RE-40); `GET /admin/catalog/signals` + "Added. N companies were told…" panel (RE-41); Settings jobs/day,
   finish date, cap above the Google limit refused (RE-37, RE-50); cross-reference proof prefers the car's own engine
   (RE-55); owner browser checks stored `trust_set_by = 'engine'`, should be `owner` (RE-58); pasted text keeps prices
   (old paste path, RE-59).
5. **Dominion data fix (RE-64):** Roomy `vehicle_catalog.full_model_code` / `trim_suffix_code` are wrong (`GBME` is the
   X grade; Custom G is `AGBVE`). Don't use them for lookups until fixed.
6. **Readiness rebuild:** the nightly `catalog-demand-readiness` job has failed every night since at least 16 Nov
   (rebuild of `variant_parts_readiness` exceeds live's 2-minute limit). Fix the slow rebuild, then count only Confirmed
   specs (swap `(COALESCE(btrim(sv.evidence_url), '') <> '')` for `(sv.trust = 'confirmed')`; old block in
   `git show 92b3cd21:supabase/migrations/20261120234117_research_engine_layer1b.sql`).
7. **Switch on for everyone** (leave practice mode) once the Roomy looks right.
8. Cleanup migration: drop `catalog_trusted_source`, `catalog_trusted_source_fetch`, `part_fitment`,
   `catalog_research_settings.daily_job_limit`.
9. CI red, not research: migration parity lists live-only `20261117204932` (someone's hand-run change with no repo
   file); a stale find-parts screen test fails in "Dominion places checks".

## 4. Pace and cost

Roomy fill: ~2.9 Google searches per job, US$0.0082 for 8 jobs. Spike 0 estimate US$0.075/job → the US$1.35 cap buys
~18 paid + ~32 free jobs/day.

## 5. Key places in the code

- Server (`supabase/functions/_fleet-server/`): `catalog_research_worker.ts` (jobs), `research_page_reader.ts`
  (honest reader), `research_recipes.ts`, `research_browser_check.ts` (`answersGate`, change dates `changeYears` /
  `changeAtFits`), `research_engine_routes.ts` (browser-check confirm → listings with years),
  `catalog_research_routes.ts` (job list/details, `ownerClosedNote`).
- Dominion (`apps/admin/src/components/admin/research-engine/`): `ResearchJobDrawer.tsx` (browser check),
  `ResearchPartsTab.tsx`, `researchModel.ts` (`statePill`, `closedNoteOf`, `checkPositions`, `partFinder`),
  `TrustedSitesScreen.tsx`.
- Fill: `catalog_research_fill_car` (latest body in `supabase/migrations/20261121193554_research_fill_skip_drum_axle.sql`).
- Tables: `catalog_research_job`, `catalog_part_proposal`, `catalog_spec_proposal`, `research_page_read`,
  `research_car_site_version`, `research_lookup_recipe`, `trusted_site`, `trusted_source`, `part_listing`.
- Screen test: `e2e/dominion-research-engine.spec.ts` (`RE_SHOTS=<scratchpad>` for pictures; delete them after).

## 6. Not in this audit

Service schedules research; prices / suppliers / stock; the parts auto-match engine; `log-service-parts-gaps-audit.md`.
