# Needs review → same steps as Browser check

Dominion → Vehicles → Pending catalog → Parts tab. Plan written 26 Nov 2026.

## Section 0 – where we are

- 26 Nov: **built locally, not live, not committed** (branch parts-auto-match).
  - NR-01: done. `research_car_link.ts` gives the link: first the car's confirmed catalogue version, then an Amayama search for the car maker's own number. It's used in the parts worker, the spec jobs and the job page. 4 new server tests pass.
  - NR-02: done for the Browser check steps. Spec jobs now get a link and use the existing "paste the line" check. **Not done:** saved-page upload for spec jobs. It's still parts only.
  - NR-03: done. "Looks right — add it" only shows when Roam confirmed the answer or read it on a trusted page. Otherwise it says "Roam couldn't prove this on a trusted site. Check it before adding."
  - NR-04: migration `20261126232240_needs_review_guesses_to_browser_check.sql`. A read-only dry run on live picked exactly the 7 Roomy jobs.
  - NR-05: nothing to build. Counts come from the job state, and the 25-check limit is kept (over it → Waiting its turn).
- Gap: a car with no confirmed catalogue version and no car-maker number still gets no link. Its guess stays in Needs review, but without the one-click add.
- Checks: Dominion typecheck clean, researchModel tests 29/29. `deno check` on the worker shows 14 old type errors in its save helper (not new lines).
- 26 Nov ~23:45 UTC: **server LIVE.** `catalog-research` and `platform-catalog` were deployed straight to Supabase from a clean copy of origin/main (dc2916b0) plus only the NR files. 97 research tests passed there, and both functions start.
- **Deployed but not on main:** `research_car_link.ts` plus the NR edits in `catalog_research_worker.ts`, `research_other_jobs.ts` and `catalog_research_routes.ts`. A later deploy from main without them would undo this.
- 27 Nov ~11:25 UTC: PR #22 (saved pages) merged and the edge deploy rebuilt `platform-catalog` + `catalog-research` from main without the NR files. Both were redeployed straight away from main 20593200d plus the 4 NR files and `research_car_link.test.ts` (255/255 tests). Still deployed-but-not-on-main: the same 4 files. Main CI is red on "migration version list matches production" until `20261126232240_needs_review_guesses_to_browser_check.sql` is on main.
- **27 Nov ~11:45 UTC: ON MAIN via PR #23 (main e38dd9c72):** migration 20261126232240, `research_car_link.ts` (+ test, now in CI find-parts), the NR edits in `catalog_research_worker.ts` / `research_other_jobs.ts` / `catalog_research_routes.ts`, and the Dominion screens (NR-03 "Looks right — add it" only when proven, NR-06 maker's part name in step 3). Main CI green again. Nothing from this audit is deployed-but-not-on-main any more.
- 26 Nov: the owner pasted the SQL. Checked on live: 7 jobs moved, logbook row is in, Browser check 8, Needs review 0.
- 26 Nov: the owner found step 3 said "Search wheel bearing", but the Roomy catalogue lists it as rear axle hub & bearing.
- **NR-06 – step 3 uses the car maker's own name (server LIVE, screen local).**
  - The job page now sends `makerPartName`. It's the name the owner confirmed before for this part type on a car of the same make, else Roam's guess under the car maker's brand (e.g. Toyota 42410-B1080 "Hub & bearing assy, rear axle").
  - Step 3 then says: search "hub", open "rear axle hub & bearing", look for "HUB & BEARING ASSY, REAR AXLE". Parts with hand-written wording (thermostat, shocks, filters…) keep it.
  - `platform-catalog` redeployed from a clean origin/main copy plus all NR files. The deployed-not-on-main list now also includes the `makerPartName` edit in `catalog_research_routes.ts`.
  - Tests: Dominion 32/32, server 80 passed.
- **NR-07 – saved page read diagram codes as part numbers (server LIVE 26 Nov).**
  - The Roomy "4102 Rear axle shaft & hub" page gave "0 saved · 5 need you". The reader took the diagram's 5-digit reference codes (42410, 42440, 42403) as part numbers. They have no dates, so they held the real 42410-B1080 left and right rows on the same axle.
  - Fix: `isDiagramCode` drops a bare 5-digit number on Toyota, Daihatsu and Lexus pages before the rows are checked. A test was added. `platform-catalog` was redeployed, and the deployed-not-on-main list now also includes the `research_saved_page_routes.ts` edit.
- Re-upload: 42410-B1080 saved for both rear sides (Confirmed).
- **NR-08 – answered names showed as "add a part type" (server LIVE 26 Nov).**
  - The second upload listed 4 bolts under "Parts Roam doesn't know yet — Add a part type…", but Roam had already marked them "A fixing" from the first upload.
  - Cause: `buildSuggestions` dropped a dismissed phrase completely, so the result had no suggestions and the screen fell back to the old list.
  - Fix: a dismissed phrase is now listed as `skipped` with its saved note (`dismissedNotes`; "A fixing" / "Not a part we track"). The result then shows "Roam sorted 4 rows · 2 fixings" with Review. It is never an open card.
  - Also: `isDiagramCode` now also drops the lettered diagram codes (42409C, 42311U).
  - Tests: 111 passed. `platform-catalog` and `catalog-research` were redeployed. The deployed-not-on-main list now also includes `saved_page_suggest.ts`.
- Older uploads keep the result they were saved with. Only new uploads show the new line.
- **NR-09 – spec checks sent to the parts catalogue (27 Nov, built locally, not live, not committed).**
  - The owner checked Roomy "Headlight, high beam" on Amayama. The headlamp page lists unit and part numbers only; the 81110B bulb is drawn but not listed, and no page says "H4". Bulb size, tyre size, oil, battery, coolant and brake fluid are not in a parts catalogue, yet NR-01 sent every unproven spec there.
  - Fix: `research_spec_source.ts`. `specSource(key)` = `any_page` for bulb / tyre / oil / battery / brake fluid / coolant keys (wipers and unknown keys keep the catalogue). Those jobs get a web search for the car + spec instead of the catalogue link (`research_other_jobs.ts`, and the job page for checks already open, `catalog_research_routes.ts`, which also sends `specSource` and no catalogue version).
  - Steps for those checks: open the search → "Is the page for your car?" Yes/No (no model code) → "Do you see the <spec>? It is written like H4" → paste the page's link + the value → dates. Confirm (`research_engine_routes.ts`) accepts any https page for these (not the search page itself) as the owner's own check (`owner_browser`), keeps the link as evidence, never marks it the car maker's page and never remembers it as a catalogue version. `answersGate` has a new `anyPage` input.
  - Catalogue specs (wipers) also now say what to search and what the value looks like (`specFinder` in researchModel).
  - Tests: server 4 new + 64 browser-check tests pass; Dominion research tests 79/79; typecheck clean. Run with `--node-modules-dir=none` so `node_modules/.deno` was not touched.
  - **Server LIVE 27 Nov:** `platform-catalog` v275 + `catalog-research` v92, deployed from `C:/Roam/Goride-deploy-at` (the copy that matches live) plus only these 6 files: `research_spec_source.ts` (+ test), `catalog_research_routes.ts`, `research_engine_routes.ts`, `research_other_jobs.ts`, `research_browser_check.ts`. 283/283 research tests passed there; both functions answer (health 200). **Deployed but not on main:** those 6 files (they are also in this folder, uncommitted). Any merge to main must carry them or they are undone.
  - The Dominion screen part (drawer, researchModel, service type) is local only; local Dominion uses the live server, so it works on localhost now.
- **NR-10 – the owner's manual answers bulb and tyre checks (27 Nov, LIVE: owner pasted; checked live).**
  - Found: the approved Roomy 2021 manual (a9a56b3f, page 529) says "Headlamp — Halogen: H4 60/55W" and front 165/65R14 for the 2020-on 2WD Roomys (3ed7c48e, 007d4cad). The manual approval writes bulbs to `vehicle_bulb` and tyres to `vehicle_tyre`, but checks only read `catalog_spec_value` (`specs_for_variant`), so headlight and tyre checks stayed open. Oil, coolant, brake fluid and battery already worked (they are written as specs).
  - Fix: migration `20261128010228_mm_manual_bulb_tyre_specs.sql`. `mm_manual_bulb_tyre_to_specs(car)` copies a manual's headlamp bulb into `headlight_low_bulb` + `headlight_high_bulb` (one bulb gives both unless the row names low or high beam; LED and "Unknown" give nothing) and the single standard front tyre into `tire_size`, Confirmed / `maker_document`, never over another route's Confirmed value. Triggers on both tables keep it going for later manuals; it runs once now and calls `catalog_research_close_covered_jobs()`.
  - Dry run on live (forced rollback, nothing kept): 4 specs + 2 tyre specs written; the 4 Needs-review jobs for those two cars close as auto_added. Migration checker OK.
  - **Pasted 28 Nov ~01:15 UTC.** Checked live: 6 maker_document specs (H4/H4/165/65R14 on 3ed7c48e + 007d4cad), their 4 checks auto_added, both triggers present, logbook row 20261128010228. Paste file: [`nr10_manual_bulb_tyre_specs_LIVE_apply.sql`](nr10_manual_bulb_tyre_specs_LIVE_apply.sql) (ends with its logbook line). No server deploy needed.
  - Not covered: the 2016–2020 Roomy (3cd9cbf3) and the 4WD Roomys have no manual linked, so their checks stay. Uploading the pre-2020 Roomy owner's manual would answer them the same way.

**SQL to paste on production (ends with the logbook line):** the migration file's contents, then
`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261126232240', 'needs_review_guesses_to_browser_check') ON CONFLICT (version) DO NOTHING;`

## What the owner asked

The Browser check steps are easy and fit the system well. Needs review is the older way of doing it. Give Needs review the same steps.

## What we found (live database, 26 Nov)

All 7 Needs review items for the Toyota Roomy are **guesses**. Not one was proven on a trusted site.

| Item | Kind | Why no Browser check |
|---|---|---|
| Headlight, high beam (H4 or LED) | spec | AI search used 0 sources, so it found no catalogue page |
| Headlight, low beam (H4) | spec | same |
| Coolant (Toyota Super Long Life) | spec | same |
| Tyre size (165/65R14) | spec | same |
| Thermostat (Toyota 90916-03150 + 4 others) | part | none of its sources was a car maker's catalogue |
| Wheel bearing, rear (Jtekt 3G080 + 4 others) | part | ran 20 Nov, before Amayama was marked as blocking Roam |
| Drive belt (Masuma 6PK-1195) | part | ran 19 Nov, before Browser check existed |

**Root cause:** Roam only gets a Browser check link **by luck**. The link exists only when the AI search happens to quote a car maker's catalogue page (Amayama, Partsouq, SB). Roam never builds the link itself. There are no "browser check link" lookup rules in the database (the only lookup rule is for the JNBK brakes site).

Also: Needs review shows **Looks right — add it** on an unproven guess. One click adds a number that nothing backs up.

## The fixes

**NR-01 – Roam always builds the catalogue link itself.**
Roam builds the car maker's catalogue link from the car itself (make, model, frame code, e.g. Toyota Roomy M900A), not from the AI's sources. It goes to the version list for that frame, the same page the Browser check already uses. Any part or spec job that ends unproven then goes to **Browser check** and never to Needs review.

**NR-02 – Specs get Browser check too.**
Bulbs, coolant and similar specs have car-maker part numbers in the same catalogue, so they use the same steps. The saved-page upload (Ctrl+S, upload, Roam reads it) also works for spec jobs, not only part jobs. For specs a parts catalogue doesn't list (tyre size), the step asks for any page that shows it (an owner's manual or door sticker page), and it's the same upload.

**NR-03 – Needs review keeps only proven answers.**
Needs review only holds answers Roam read on a trusted site, plus "two makers disagree" and requests a fleet added by hand. "Looks right — add it" only shows on proven answers.

**NR-04 – Move the 7 existing guesses.**
A one-time catch-up moves every unproven Needs review job (all 7 today) into Browser check with its new link. The AI's guesses stay visible inside the check as "Roam's guess" so the owner knows what to look for.

**NR-05 – Screen wording and counts.**
Browser check cards and counts include the moved items. The "1 of 25 open" limit still applies, and anything over the limit waits its turn as it does now.

## How we'll check it

- Server tests: an unproven part job and an unproven spec job both end in Browser check with a link built from the car, even when the AI quoted no catalogue page.
- Server tests: a proven answer still goes to Needs review.
- Screen test: "Looks right — add it" never shows on an unproven answer.
- Owner: opens the Roomy thermostat Browser check, saves the Amayama page, and sees the number added as the car maker's own.
