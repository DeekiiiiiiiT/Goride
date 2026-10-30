# Dominion · Parts database → Find parts — audit (Rev 2, 30 Oct 2026)

> **Rev 2 status: server and catalog data are in. Live screens still need a look after the admin deploy.** Checked 30 Oct 2026.
>
> Done: search and coverage no longer query columns that do not exist. The shared engine merges universal parts, keeps version cards apart, and asks for a real version before saving a part. The 13 starter problems are in the database but **switched off** until you check each one. Plain names, the eight common parts, search words, and the six spec links are filled in. Battery, alternator, starter, and the three bulbs were added.
>
> Not done on purpose: Fit and Roomy part numbers were **not guessed**. The sourcing audit says a made-up number would make the coverage gate lie. Confirm those on the Parts sourcing page.
>
> The word checker is 100% for S42–S42k. A side-by-side picture check on roamdominion.co is still the proof that the screens match.

Page: Dominion → Master data → Vehicles → **Parts database** → tab **Find parts** (`?page=parts-catalog`). Today it is [FindPartsTab.tsx](../apps/admin/src/components/admin/parts-database/FindPartsTab.tsx), and it calls `GET /admin/catalog/find-parts` in [catalog_routes.ts:261](../supabase/functions/_fleet-server/catalog_routes.ts#L261).

This is an audit only. No code was changed. Every number comes from production (`csfllzzastacofsvcdsc`), read on 30 Oct 2026 with read-only SQL.

**Related files**
- **Stitch prompt:** [docs/stitch/dominion-find-parts-prompt.txt](stitch/dominion-find-parts-prompt.txt)
- **Sister doc for Roam Fleet:** [docs/fleet-find-parts-audit.md](fleet-find-parts-audit.md)

**This doc owns the shared search engine (§6).** Fleet builds on top of it, so build §6 first.

---

## R2. Re-check on 30 Oct 2026 — what is still open

Checked: the code (uncommitted working tree), production database, fleet-core logs, the live site `roamdominion.co`, the word checker, and side-by-side pictures in light, dark and 390 px phone. No code was changed.

### What is done and works
- Migration objects are live: the 3 new browse columns, `spec_key.maintenance_component_id`, the 3-argument `universal_section_for_variant`, `part_symptom` + `part_symptom_component` with RLS.
- fleet-core **v184** (30 Oct 18:15 UTC) carries the new routes. `find-parts` and `parts/browse` return 200 in the live logs.
- Shared helpers exist with tests: `variantPlainLabel`, `pickBestPart`, `parseQuickCar`, `fillPlainReason`, plain tier names. **18 of 18 Deno tests pass.** Fit 2018 → "1.5 petrol / 1.3 petrol / 1.5 hybrid" and Roomy 2019 → "2WD / 4WD" are right on live data.
- Admin type check: 19 errors vs baseline 20. None in the new files.
- In the pictures: no sideways scroll at 390 px, no white boxes in dark mode, no page errors.
- Legacy-mode info line, staff note text (G3), and the plain match-type names (F6, G2) are in.

### Live today
| Thing | State |
|---|---|
| roamdominion.co | Still the **old** Find parts screen. The new screens are not deployed |
| Server (fleet-core v184) | Deployed **from uncommitted code** |
| Repo | Everything above is uncommitted |

### Open findings

**Severity:** Critical = broken in production now · High = wrong answer or blocks the goal · Medium = missing piece · Low = tidy-up.

#### R2-01 — Critical · The search box fails on every call
- `GET /admin/catalog/parts/term` reads `part_term_synonym.component_id`. That column does not exist; the real one is `maintenance_component_id`.
- Live logs, 30 Oct: **13 of 13** calls returned 500.
- It also skips `plain_name` and `part_master.name`, and does no ranking (E5).

**Fix:** read `maintenance_component_id`; also search `plain_name` and `part_master.name`; return the component's plain name (not the search word) for synonym hits; rank exact part number → search word → name.

#### R2-02 — Critical · The part counts fail on every call
- `GET /admin/catalog/find-parts/coverage` reads `part_listing.maintenance_component_id`. That column does not exist.
- Live logs, 30 Oct: **8 of 8** calls returned 500. "Known components" on Screen 1 and every "N parts" count on Screen 3 depend on it.

**Fix:** count listings through their part: `part_listing.interchange_group_id` → `part_master.interchange_group_id` → `part_master.maintenance_component_id`.

#### R2-03 — High · Cars with several versions skip the question and quietly use the first one
- When every version returns the same parts, the screen picks `variants[0]` and searches only that version ([FindPartsFlow.tsx:155](../apps/admin/src/components/admin/parts-database/find-parts/FindPartsFlow.tsx#L155)).
- Today almost every car has no parts, so the sets are always "the same". Live log: a 2018 Honda Fit search went straight on with one version. "Add it now" then files the part against GK5 even when the car is the 1.5 hybrid.

**Fix:** when the question is skipped, search with `variantId=any`, show "Fits every {car}", and make "Add it now" open the version cards first, then add for the version picked.

#### R2-04 — High · "Not sure" sends the version "any" to the Add dialog
- After "Not sure", "Add a part" and "Add it now" call `onAdd("any")`, so the Add dialog opens for a car id that does not exist.

**Fix:** same as R2-03 — "Add" after "Not sure" opens the version cards first.

#### R2-05 — High · 112 car-and-year choices show identical cards
- Ran `variantPlainLabel` over all 362 live versions: of 494 make/model/year groups with more than one version, **112** show two or more cards with the same label. Examples: 2020 Toyota Roomy → "M900A / M900A / M910A / M910A / turbo"; 2005–2009 Toyota Belta → "1.3 petrol / 1 petrol / 1.3 petrol".
- Engine size 1.0 prints as "1".

**Fix:** keep adding the next field that differs (drivetrain, transmission, body, trim) until every card in the group is different; fall back to the chassis code only for rows that are still equal. Print one decimal ("1.0 petrol"). Add the Roomy 2020 and Belta 2005 groups to T1.

#### R2-06 — High · "Fits by size" (universal) never shows when other parts exist
- `findParts` merges only listed parts. Universal items are left out of `plainSections`, `bestPick` and `emptyTiers`.
- Result: "Fits by size" always appears in "Nothing on file for", and a car that has only universal parts gets the "Not on file yet" screen.

**Fix:** add each candidate's universal rows to the merge as tier 5 items (with `fitsVariantIds`), so sections, best pick and the folded line all see them.

#### R2-07 — High · A part-number search hit opens "not on file"
- A part-number hit passes the **part id** as `componentId` ([FindPartsFlow.tsx:186](../apps/admin/src/components/admin/parts-database/find-parts/FindPartsFlow.tsx#L186)). The search then finds nothing and says "We don't have 04152-40060".

**Fix:** a part-number hit opens that part's detail drawer.

#### R2-08 — High · Owner-only buttons are open to all staff
- "Add a part" and "Add it now" show and work for every staff role. §7 says owner-only, disabled for staff with "Only the owner can change parts."

**Fix:** disable both for non-owners with that tooltip.

#### R2-09 — High · Four screens and several features are not built
| Missing | Audit / plan ref |
|---|---|
| `PartDetailDrawer.tsx` (S42f). Today a stub in `MissingPart.tsx`: no Confirm / Edit / Exclude, no "Fits these versions", no source link, no specs, no history, no "+ add alias" | §7, plan Screen 6 |
| `AllPartsView.tsx` (S42h). "Skip" only re-runs the search | F3, Screen 8 |
| `ProblemsEditor.tsx` (S42i), plus the symptom list and `POST /admin/catalog/symptoms` routes (only `/symptoms/summary` exists) | E6, Screen 9 |
| "By problem" on Screen 3 | E6 |
| `ChoiceTrail.tsx` (sticky "Honda Fit 2018 › 1.5 hybrid › Brake pads › Front" chips) | §5, Screen 5 |
| Left / Right on Screen 4. `part_listing` has no `side` column, so the server's side filter never applies | F10, E9 |
| URL keeps the search; Back/Forward walk the steps | F13 |
| "Fits all 3" / "Only the 1.5 hybrid" on each row | F9 |
| "Needs checking" badge on the Best match card | E8 |
| Screen 10 states: "car not in catalog" has no "+ Add this car"; error has no "Nothing was changed." | plan Screen 10 |
| `findPartsApi.ts` (calls live in `partsDatabaseApi.ts` instead) | §7 |

**Fix:** build each one as listed in §7 and the plan's §4.

#### R2-10 — High · The screens are not Stitch ports
- Word checker (run from a scratch copy with the rows marked Ported): **S42 27% · S42b 18% · S42c 17% · S42d 25% · S42e 20% · S42g 20% · S42j 0%**. S42f, S42h, S42i, S42k have no file. Target is 100%.
- The repo checker says "OK" only because every S42 row is still "Not started".
- No file starts with `// Stitch: dominion-redesign/<id>`.
- Side-by-side pictures (Stitch left, built right) show, on every screen: no choice-trail row, no coloured left border per match type, no item icons, no "View details", no "Recommended fit" banner, no tile grid for areas, Screen 1 card and Screen 4 cards stripped down. On the phone, results are the desktop layout squeezed, not the S42k layout (no chip row, no bottom button bar), and the step bar cuts "Version" to "V".
- Helper text is blue instead of grey: the Stitch `text-secondary` is grey, but the app's `text-secondary` is blue, and no scoped override was added.

**Fix:** port each screen from its `html/S42*.html` `<main>` as plan §3 Phase 3 says, add the scoped `text-secondary` grey (and its dark value) in `partsDatabase.css`, then mark each README row Ported only when it reaches 100%.

#### R2-11 — Medium · Wrong text on the results header and step bar
- The title drops the version and side ("Brake pads for the 2018 Honda Fit", not "… 1.5 hybrid · Front").
- The code line lists every version's chassis code ("GK5 · GK3 · GP5"), not the picked one.
- Step 2 and Step 4 still say "conditional" after they were answered.

**Fix:** title and code line come from the picked version and side; answered steps show their answer with a tick.

#### R2-12 — Medium · The match-type strip prints a broken sentence
- `fillPlainReason(4)` with no data gives "This part replaces the factory part the factory part." It shows on Screens 1, 2 and 4.

**Fix:** with no data, tier 4 reads "Another brand's part replaces the factory part."

#### R2-13 — Medium · No proof pack exists
- No `e2e/dominion-find-parts-visual.spec.ts`, no fixtures, no `S42*-compare.png`, no axe check (plan §5).
- The pictures for this re-check were made from a scratch script and are **not** in the repo.

**Fix:** add the visual test and fixtures from plan §5, and save the compare images next to the Stitch pictures.

#### R2-14 — Medium · The other Parts database tabs lost their fidelity check
- The README now marks S41b–S41f and S41-states "Superseded" with no React file. S41b (Vehicle parts) was **Ported**; S41c–f were linked to live files. They are not Find parts and must stay checked (T13).
- Cause: Rev 1 §8 wrongly listed S41b–f as Find-parts rows (corrected below).

**Fix:** restore the S41b, S41c, S41d, S41e, S41f and S41-states rows to their previous text. Only S41 and S41-phone are superseded.

#### R2-15 — Medium · The migration file does not match production
- Repo: `20261031120000_find_parts_engine.sql`. Production: `20261030180739 find_parts_engine`.
- Re-running the file fails: `create function universal_section_for_variant(uuid, integer, uuid)` already exists.

**Fix:** rename the repo file to `20261030180739_find_parts_engine.sql`.

#### R2-16 — Medium · Tests are thin and not in CI
- None of the 4 new Deno test files is in `ci.yml`.
- T5 tests a helper, not `findParts`. T3 tests `filterUniversalByComponent`, which nothing calls (the SQL does the filter).
- T7, T8, T9, T10, T12, T13 do not exist.

**Fix:** add the missing tests, test `findParts` itself with a stub client, delete `filterUniversalByComponent`, and list all four files in `ci.yml` in the same commit.

#### R2-17 — Medium · No data work done (§9)
| Task | Live |
|---|---|
| D1 `plain_name` | 0 of 34 rows |
| D1 `is_part = false` on 4 service rows | 0 |
| D1 `common_rank` | 0 → the "Common" row on Screen 3 is empty |
| D2 Battery, Alternator, Starter, 3 bulbs | not added |
| D3 problems | 0 |
| D4 search words | still 4 |
| D5 spec keys linked | 0 of 6 → "Fits by size" is never filtered by part |
| D6 Roomy / Fit gaps | parts 2, listings 1, offers 0 — unchanged |

**Fix:** enter D1–D6 in Dominion as listed in §9.

#### R2-18 — Low · Versions past the sixth are hidden
- The candidate cap of 6 also cuts the "Which one?" cards. 1 live group has more than 6.

**Fix:** show every version on the cards; keep the cap only for the parts search.

#### R2-19 — Low · Recent searches can crash in private windows
- `localStorage.setItem` / `removeItem` in `FindPartsFlow.tsx` are not wrapped in try/catch.

**Fix:** wrap both.

### Finish line (unchanged)
1. Fix R2-01 and R2-02 and redeploy fleet-core — these are broken in production now.
2. R2-03 to R2-09, then R2-10 screen by screen with the R2-13 proof pack.
3. R2-14, R2-15, R2-16 in the commit; data R2-17 alongside.
4. Commit, deploy the admin site, then repeat the light / dark / phone pictures on roamdominion.co.

---

## 0. READ FIRST — the Stitch screens are the spec

**Order of work**
1. Build the Stitch screens from the prompt.
2. Export the HTML and PNG to `docs/stitch/dominion-redesign/html/`, using the file names in the table below.
3. Add the README rows (§8).
4. Only then write React. No UI code may be written before the HTML is in the repo.

**Who wins**

| Topic | Winner |
|---|---|
| Layout, spacing, order, colours, icons, wording, state text | **Stitch HTML** |
| Which data, how it is matched, permissions, links, rules | **This audit** |

**Porting rules**
- Keep the same element structure and classes as the Stitch export.
- Copy labels word for word.
- Swap only the sample values.
- Add nothing and remove nothing.

**Proof**
- `node scripts/stitch-fidelity.mjs --report` shows **100%** for every row below.
- Side-by-side screenshots in light, dark and 390 px phone.

**Stitch screen numbers → README ids** (the prompt uses plain numbers only). S40 and S41 are already used, so the new ids are S42–S42k. **Build plan and screen-by-screen port decisions:** [dominion-find-parts-port-plan.md](dominion-find-parts-port-plan.md).

| Prompt screen | README id | HTML file |
|---|---|---|
| Screen 1 — Find parts: pick the car | S42 | `S42-find-parts-car.html` |
| Screen 2 — Which one is yours? | S42b | `S42b-find-parts-variant.html` |
| Screen 3 — What part? (guided browser) | S42c | `S42c-find-parts-browse.html` |
| Screen 4 — Front or back? (position) | S42d | `S42d-find-parts-position.html` |
| Screen 5 — Results in five match types | S42e | `S42e-find-parts-results.html` |
| Screen 6 — Part detail drawer | S42f | `S42f-find-parts-detail.html` |
| Screen 7 — Not on file yet | S42g | `S42g-find-parts-missing.html` |
| Screen 8 — Everything for this car | S42h | `S42h-find-parts-all.html` |
| Screen 9 — Problems list editor | S42i | `S42i-find-parts-problems.html` |
| Screen 10 — Loading, error, switched-off | S42j | `S42j-find-parts-states.html` |
| Screen 11 — Phone (390 px) | S42k | `S42k-find-parts-phone.html` |

The other Parts database tabs (Vehicle parts, Sister vehicles, Universal parts, Import, Advanced) are **not** part of this work. Leave them unchanged.

---

## 1. Goal and who uses it

The owner's flow:
1. Make, Model and Year are required.
2. The part is **optional**. If no part is given, a guided browser helps the person find one.
3. Results come back in five match types, in this order: Direct OEM → Sister vehicle → Engine compatible → Aftermarket cross-reference → Universal.
4. The search must work for someone who knows nothing about cars.

| Person | What they need |
|---|---|
| Owner / data staff in Dominion | Check what a customer would see for any car, then fill the gaps right there |
| Fleet manager in Roam Fleet (sister doc) | Find the right part for their car and get a price or a quote |

In Dominion, the same search doubles as a **gap finder**. Every empty answer becomes an "Add it now" action.

---

## 2. Live data on 30 Oct 2026

| Fact | Value |
|---|---|
| Car versions (`vehicle_catalog`) | 362, across 10 makes and 153 models |
| Make + model + year combinations | 1,528 |
| — of these, with more than one version (the person must choose) | **348 (23%)** |
| Example: Honda Fit 2018 | 3 versions: GK5 1.5 petrol · GK3 1.3 petrol · GP5 1.5 hybrid |
| Example: Toyota Roomy 2019 | 2 versions: M900A 2WD · M910A 4WD, same 1KR-FE engine (the 1KR-VET turbo is a later year) |
| Versions with engine size + fuel type filled | 357 of 362 |
| Parts (`part_master`) | **2**: oil filter, Toyota 04152-40060 and MANN HU 6006 z, both confirmed |
| Listings (`part_listing`) | 1 |
| Supplier offers (`supplier_part_offer`) | **0** |
| Universal parts (`universal_part`) | 5: oil 0W-20, 3 wiper sizes, CVT fluid FE |
| Car spec values (`catalog_spec_value`) | 10 |
| Versions marked parts-ready (`variant_parts_readiness.ready`) | **0** |
| Search words (`part_term_synonym`) | 4, all for the oxygen sensor |
| Parts filing categories (`part_category`) | 9, flat (0 sub-categories) |
| Systems → components (`maintenance_service_categories`) | 11 systems, 23 components |
| — components that are services, not parts | Tire Pressure Check, Rotate Tires, Lights Check, Radiator Coolant Flush |
| — systems with no components | Battery & electrical (0) |
| Guided add-part jobs (`guided_part_jobs()`) | 15 jobs in 5 sections |

**What this means:** the engine already exists, but almost every search returns nothing today. The new screen must make "nothing yet" useful (Screen 7), and the data work in §9 must run alongside the build.

---

## 3. Findings — current Find parts tab

Severity:
- **High**: wrong or blocking.
- **Medium**: confusing or missing.
- **Low**: tidy-up.

### F1 — High · "Which one?" shows codes nobody understands
- The chips read like "GK5 · 2WD · L15B · 2013–2020" ([FindPartsTab.tsx:18](../apps/admin/src/components/admin/parts-database/FindPartsTab.tsx#L18)).
- For a 2018 Fit, the three chips differ only in codes. A non-mechanic can't choose, and 23% of all searches hit this step.

**Fix:**
- A plain label built by `variantPlainLabel()` (§6, E2). It shows only what differs between the choices: "1.5 petrol", "1.3 petrol", "1.5 hybrid".
- The chassis code moves to a small grey mono line underneath.
- Add a "Not sure" card (E3).

### F2 — High · The question is asked even when the answer doesn't matter
- A 2019 Roomy has 2WD and 4WD versions with the same 1KR-FE engine, so an oil filter fits both.
- Today the person must still choose.

**Fix:** E3. The server searches every candidate version and asks "Which one is yours?" only when the results differ. Otherwise it shows the results with the line "Fits every 2019 Toyota Roomy".

### F3 — High · There is no part step at all
- The tab dumps every part on file for the car.
- Nothing lets the person pick a category or a sub-category, and nothing helps when they don't know the part's name.

**Fix:** a "What part?" step (Screen 3), offering:
- a search box that understands everyday words (E5);
- **Common parts** (E4);
- **By area**, systems then parts, with icons (E4);
- **By problem** (E6);
- "Show everything for this car" (Screen 8).

The part stays optional, as the owner asked.

### F4 — High · Universal parts ignore the chosen part
- `universal_section_for_variant(p_catalog_id, p_vehicle_year)` takes no part.
- A search for brake pads would still list wiper blades and oil.

**Fix:** E7, which links each spec key to a component and filters by it.

### F5 — High · When the match-type switch is off, the tab says "nothing"
- When the `parts_tiered_search` kill switch is on, [catalog_routes.ts:295](../supabase/functions/_fleet-server/catalog_routes.ts#L295) passes `[]` as the sections.
- Every car then looks empty, even if listed parts exist.

**Fix:**
- In legacy mode, the server puts the listed parts in section 1, and the response carries `mode: "legacy"`.
- The UI shows the info line "Match types are switched off. Showing parts listed for this car only."

### F6 — Medium · The five match types use trade words
"Direct OEM Match", "Aftermarket Cross-Reference" and the like mean nothing to most people.

**Fix:** add `plainLabel` and `plainReason` to `PART_MATCH_TIERS` in [partsResolution.ts](../packages/types/src/partsResolution.ts). The technical `label` stays and appears as a small grey tag.

| Tier | Plain title (big) | Tag (small) | Plain one-liner |
|---|---|---|---|
| 1 | Made for your car | OEM | "The factory part for this car." |
| 2 | Same car, different badge | Sister | "Listed for {sisters}, which is the same car sold under another name." |
| 3 | Fits your engine | Engine | "From {source}, which uses the same engine." |
| 4 | Other brands that replace it | Aftermarket | "{brand} {number} replaces the factory part {oem}." |
| 5 | Fits by size | Universal | "Any brand in this size fits: {spec}." |

### F7 — Medium · Five empty boxes on every search
- The tab always draws all five sections, each with "Add for this vehicle".
- With 2 parts on file, almost every search shows five empty boxes.

**Fix:**
- Show only the sections that have results.
- Fold the empty ones into one line: "Nothing on file for: Sister, Engine, Aftermarket." with one "Add a part" button.
- When everything is empty, show Screen 7.

### F8 — Medium · No "best pick"
**Fix:** a "Best match" card above the sections, chosen by `pickBestPart()` (E8). In Dominion it uses fit only, with no prices.

### F9 — Medium · The results don't say which versions they fit
**Fix:** each item carries `fitsVariantIds`. When the person chose "Not sure", each row shows "Fits all 3" or "Only the 1.5 hybrid".

### F10 — Medium · Front/back and left/right are never asked
- `maintenance_service_categories.position_aware` and `part_listing.position` exist, but the UI never uses them.

**Fix:** Screen 4 appears only when the chosen part is position-aware, offering Front / Rear / Both, then Left / Right / Both. The server filters on it (E9). A listing with no position fits both.

### F11 — Low · Quick-type box breaks on two-word makes
- The regex `^(\S+)\s+(.+?)\s+(\d{4})$` turns "Land Rover Defender 2020" into make "Land".

**Fix:**
- Match the start of the text against the known makes list from `vehicle-options`, longest first.
- Then read the year as the last 4-digit number.
- Whatever is left is the model.

### F12 — Low · "Find parts" can be pressed with nothing chosen
**Fix:** disable the button until a make, model and year are chosen, or until the quick-type text parses. Show the helper text "Pick a make, model and year".

### F13 — Low · Search can't be shared or reloaded
**Fix:** the URL keeps `&car=<variantId|make,model,year>&part=<componentId>&pos=<front|rear>`. Back and forward walk through the steps.

### F14 — Low · Three part lists that don't agree
- `part_category` (9, flat) files parts.
- `maintenance_service_categories` (11 systems, 23 components) is what parts, search words and requests point at.
- `guided_part_jobs()` (15 jobs) drives the Add-part helper.

**Fix:**
- **The browse tree is `maintenance_service_categories`.** `part_master.maintenance_component_id`, `part_term_synonym` and `parts_sourcing_requests` already point there, and the Fleet route already filters by it.
- `part_category` stays as the internal filing field.
- `guided_part_jobs()` stays as the Add-part helper.
- Nothing is renamed. Plain names go in a new column (E4).

### Not a finding
- The coverage strip ("Service essentials 0 of 10 · Specs 0 of 13 · Other parts 0") is right and stays. It moves to the results header.
- `assertNoCustomerIdentity(parts)` stays. Dominion shows no customer stock, offers, quotes or requests.

---

## 4. What the screens must not show
- Customer data: fleet names, plates, org stock, org quotes, org requests, drivers.
- Prices. Dominion has no offers today, and supplier offers are org-scoped. Price belongs to Fleet.
- AI badges, fake confidence percentages, "REGION" badges or "LOC:" footers.

---

## 5. The flow (guidance; Stitch wins on looks)

```
① Your car         Make ▾  Model ▾  Year ▾   (or type "Honda Fit 2018")
                    → continue
② Which one?        only if versions give different answers
                    [1.5 petrol]  [1.3 petrol]  [1.5 hybrid]  [Not sure]
③ What part?        [ Search: "brake pads", "o2 sensor"… ]
   (optional)       Common:  Oil filter · Air filter · Brake pads · Wiper blades · Battery · Spark plugs · Cabin filter · Bulbs
                    By area: Engine · Brakes · Suspension · Lights · Filters · Cooling · Electrical · A/C · Transmission · Tyres
                    By problem: "Squeaks when I brake" · "Won't start" · "Engine light is on" …
                    [Show everything for this car]
④ Front or back?    only if the part is position-aware
⑤ Results           Best match card
                    1 Made for your car (2)   2 Same car… (0, folded)   …   5 Fits by size (1)
                    "Nothing on file for: Sister, Engine." [Add a part]
⑥ Detail drawer     why it fits · fits these versions · source link · other numbers · [Confirm] [Edit] [Exclude]
⑦ Missing           "We don't have Brake pads for the 2018 Honda Fit 1.5 hybrid yet." [Add it now]
```

**A sticky "breadcrumb of choices"** sits at the top of steps ②–⑦, for example "Honda Fit 2018 › 1.5 hybrid › Brake pads › Front". Each chip opens its step again.

---

## 6. Shared search engine (Dominion and Fleet both use this)

All server code lives in `supabase/functions/_fleet-server/`, the same place as today's `getCatalogParts`. Shared pure logic lives in `packages/types/src/`, so both apps and the tests import one copy.

### E1 — One finder module
New file `_fleet-server/parts_finder.ts`, exporting:

```ts
findParts(sb, {
  make?, model?, year?,          // or
  variantId?,                    // a known version
  componentId?, position?,       // the optional part + side
  orgId: string | null,          // null in Dominion → no stock/offers overlay
  downtimePerDay: number,
}): Promise<FindPartsResult>
```

**How it works**
1. Resolve the candidate versions. The query is the same as find-parts today.
2. For each candidate (cap 6), call `getCatalogParts(sb, id, { componentId, vehicleYear })` and the universal loader (E7).
3. Merge the results by `part_id`. Each item gets `fitsVariantIds`.
4. If no `variantId` was given and the candidates' part sets differ, set `askVariant: true` and return the candidates with `variantPlainLabel()`.
5. Apply the position filter (E9).
6. Build the sections with `assembleMatchSections()`, plus `bestPick` (E8).
7. When `orgId` is set, overlay org stock and offers with the existing `enrichFleetParts` / `overlayUniversalStock`. When `orgId` is null, call `assertNoCustomerIdentity`.

**Response**

```ts
type FindPartsResult = {
  mode: "tiered" | "legacy";
  car: { make; model; year; label: string };            // "2018 Honda Fit"
  candidates: Array<{ id; plainLabel; codeLine }>;        // "1.5 hybrid" / "GP5 · LEB · 7-speed DCT"
  askVariant: boolean;
  pickedVariantId: string | null;
  component: { id; plainName; positionAware } | null;
  sections: Array<{ tier; plainLabel; tag; plainReason; items: FoundPart[] }>;
  emptyTiers: number[];                                   // folded line
  bestPick: FoundPart | null;
  coverage: { essentials; essentialsTotal; specs; specsTotal; otherParts } | null;
};
type FoundPart = {
  partId; name; brand; number; tier; reason; position: "front"|"rear"|"both"|null;
  side: "left"|"right"|"both"|null; status: "verified"|"needs_checking";
  fitsVariantIds: string[]; evidenceUrl: string | null; alsoKnownAs: string[];
  // Fleet only (absent in Dominion):
  stockQty?: number; bestOffer?: { supplier; priceJmd; landedJmd; leadDays; stale: boolean } | null;
};
```

**Routes**

| Route | App | Guard |
|---|---|---|
| `GET /admin/catalog/find-parts` (replace the body; same path) | Dominion | `assertPlatformStaffResponse`, as today |
| `GET /parts/find` | Fleet | see the Fleet doc |

### E2 — Plain version labels
`packages/types/src/vehicleVariantLabel.ts` exports `variantPlainLabel(row, siblings)`.
- It compares the siblings in this order: engine size + fuel ("1.5 hybrid"), turbo, drivetrain ("4WD"), transmission ("CVT", "7-speed DCT"), body, trim series.
- It prints only the fields that differ.
- If nothing readable differs, or engine size is missing (5 of 362 rows), it falls back to the chassis code.
- The `codeLine` is always "chassis · engine code · transmission", in mono.

**Unit tests** for Fit 2018 (3 rows), Roomy 2019 (2WD and 4WD), and a single-version car (the label is empty and no question is asked).

### E3 — "Ask only when it matters"
- `askVariant` is true only when two candidates return different part sets for the chosen component, or for the whole car when no part is chosen.
- "Not sure" sends `variantId=any`. The server then returns the merged results, and every row shows its `fitsVariantIds` as plain labels.

### E4 — Browse tree
New columns on `public.maintenance_service_categories`:

| Column | Type | Use |
|---|---|---|
| `plain_name` | text null | The name shown to people ("Brake pads" for the component "Brakes") |
| `is_part` | boolean not null default true | false for Tire Pressure Check, Rotate Tires, Lights Check, Radiator Coolant Flush |
| `common_rank` | int null | 1–8 puts the item in "Common parts" |
| `icon_key` | (exists) | Reused for the area tiles |

- Add the missing components under **Battery & electrical**: Battery, Alternator, Starter motor. Under **Lighting & visibility**, add Headlight bulb, Brake/tail bulb and Indicator bulb, each with an `op_code`.
- Route `GET /parts/browse` (admin and fleet) returns `{ systems: [{ id, plainName, icon, components: [{ id, plainName, positionAware }] }], common: [...] }`. It returns only rows with `is_part = true`.
- Nothing existing is renamed, so maintenance logs are untouched.

### E5 — Search box with everyday words
- Route `GET /parts/term?q=` searches, case-insensitively with `pg_trgm` similarity:
  - `plain_name`;
  - `name`;
  - `part_term_synonym.term`;
  - `part_master.name` and `oem_part_number_norm`.
- It returns up to 8 components, plus any exact part-number hit.
- Ranking: exact number, then synonym, then name similarity.
- Typing waits 250 ms.
- **Data:** search words grow in Dominion (§9). There are only 4 today.

### E6 — "By problem"
New master tables (Dominion owns them; no customer data):

```sql
create table public.part_symptom (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,          -- "Squeaks or grinds when I brake"
  hint text,                           -- "Usually worn brake pads."
  sort_order int not null default 100,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table public.part_symptom_component (
  symptom_id uuid references public.part_symptom(id) on delete cascade,
  component_id uuid references public.maintenance_service_categories(id) on delete cascade,
  rank int not null default 1,         -- 1 = most likely
  primary key (symptom_id, component_id)
);
```

**Permissions**
- Enable RLS. `select` is granted to `authenticated` for active rows.
- Writes go only through a staff route, `POST /admin/catalog/symptoms`, with a reason. Each write adds a row to `fleet.master_change_log`.

**Screen 9** is the small editor: a list, add/edit, linked components with a rank, and an active toggle.

**Starter list to enter** (the owner checks each one before switching it on):

| Problem | Likely parts, in order |
|---|---|
| Squeaks or grinds when I brake | Brake pads, Brake rotor |
| Car pulls to one side when braking | Brake pads, Brake rotor |
| Car won't start, or clicks | Battery, Starter motor |
| Battery light is on | Alternator, Drive belt, Battery |
| Engine light is on | Oxygen sensor, Spark plugs, Ignition coil |
| Engine shakes or misfires | Spark plugs, Ignition coil |
| Engine running hot | Thermostat, Water pump, Coolant |
| A/C smells or blows weak | Cabin A/C filter |
| Squealing from the engine | Drive belt |
| Bouncy or knocking over bumps | Shock absorber, Suspension |
| Wipers streak | Wiper blades |
| A light is out | Headlight bulb, Brake/tail bulb, Indicator bulb |
| Time for a service | Oil filter, Engine oil, Air filter, Cabin filter |

Choosing a problem shows its likely parts as cards with the hint. The person taps one, which is the same as picking a part.

### E7 — Universal parts follow the chosen part
- Add `spec_key.maintenance_component_id uuid null references maintenance_service_categories(id)`. Fill it:
  - `engine_oil_grade` and `engine_oil_capacity_with_filter_l` → Engine oil & filter
  - `wiper_driver_mm`, `wiper_passenger_mm` and `wiper_rear_mm` → Wiper blades
  - `transmission_fluid` → Transmission fluid
- `universal_section_for_variant` gains `p_component_id uuid default null`. When it is set, the function returns only the spec keys linked to that component.

### E8 — Best pick (pure function)
`packages/types/src/partsBestPick.ts` exports `pickBestPart(sections, { useStock, usePrice })`:
1. Prefer a **verified** item in the lowest tier.
2. If `useStock` is true (Fleet), an item in stock beats any tier.
3. If `usePrice` is true (Fleet), the lowest `landedJmd` breaks ties within a tier, and a stale price loses to a fresh one.
4. If nothing is verified, take the lowest-tier item and set the badge to "Needs checking". Never hide it (capture, never gate).
5. Universal items are picked only when tiers 1–4 are empty.

**Tests:** each rule, plus the empty case, which returns null.

### E9 — Position filter
- When `position` is given, keep the listings whose `position` equals it or is null.
- Do the same for `side`.
- An item with a null position shows the chip "Front and rear".

### E10 — Legacy mode
When `mode = "legacy"`:
- `findParts` puts every listed part into tier 1, with the reason "Listed for this car.";
- `emptyTiers` is set to [2, 3, 4];
- the UI shows the info line from F5.

---

## 7. Dominion frontend

New folder: `apps/admin/src/components/admin/parts-database/find-parts/`. Each file starts with `// Stitch: dominion-redesign/<id>`.

| File | Screen | Content |
|---|---|---|
| `FindPartsFlow.tsx` | — | Step state, URL sync (F13), react-query calls |
| `CarStep.tsx` | 1 | Make / Model / Year, quick-type box (F11, F12) |
| `VariantStep.tsx` | 2 | Plain cards + "Not sure" |
| `PartStep.tsx` | 3 | Search, Common, By area, By problem, Show everything |
| `PositionStep.tsx` | 4 | Front/Rear/Both, Left/Right/Both |
| `ChoiceTrail.tsx` | 2–8 | Sticky chips for the choices made so far |
| `ResultsView.tsx` | 5 | Best match, sections, folded empty line, coverage strip |
| `PartDetailDrawer.tsx` | 6 | Why it fits, versions, source, other numbers, staff actions |
| `MissingPart.tsx` | 7 | Empty answer + "Add it now". The demand line reads `catalog_signal_part_demand` (`fleet_count`, `open_count` for this version + component; counts only, no org ids). It is hidden when there is no row (0 rows today) |
| `AllPartsView.tsx` | 8 | Everything on file for the car, grouped by area |
| `ProblemsEditor.tsx` | 9 | The `part_symptom` editor (Advanced → Problems) |
| `findPartsApi.ts` | — | Typed calls for `find-parts`, `browse`, `term`, `symptoms` |

**Changes to existing files**
- **FindPartsTab.tsx** becomes a 3-line wrapper around `FindPartsFlow`. Its `onOpenVehicle` and `onAdd` props stay.
- **Staff actions in the detail drawer.** They call the routes that already exist:
  - Confirm: the existing confirm/reject decision.
  - Edit: opens `AddPartDialog`, prefilled.
  - Exclude: `excludeListing`, with a required reason and an evidence URL.
- **"Add it now"** opens `AddPartDialog`, prefilled with the version, component and position.
- **Problems editor.** It is a new item under "Advanced tune". It is not a sixth main tab.

**Who can do what**
- All platform staff can search.
- Confirm, Edit, Exclude and Add are owner-only. Staff see these buttons disabled, with the tooltip "Only the owner can change parts."

---

## 8. Stitch README rows
- Add rows S42 to S42k (§0 table). For each row, list the full file paths, joined by " + ".
- Mark only the old Find-parts rows (S41 and S41-phone) "Superseded by S42 — do not build". S41b–f and S41-states are the other tabs and stay as they were (Rev 2 correction, R2-14).

---

## 9. Data work (runs alongside the build; none of it is code)

| # | Task | Why |
|---|---|---|
| D1 | Fill `plain_name` for all 23 components. Set `is_part = false` on the 4 service rows. Set `common_rank` 1–8 | The browse tree reads these |
| D2 | Add Battery, Alternator, Starter motor, and the 3 bulbs (E4) | Battery & electrical is empty today |
| D3 | Enter the 13 starter problems (E6). Check each before switching it on | "By problem" |
| D4 | Add 5–10 everyday search words per common part ("pads", "brake shoes", "plugs", "AC filter", "pollen filter") | The search box (E5) |
| D5 | Link the 6 spec keys to components (E7) | Universal filtering |
| D6 | Fill the Roomy and Fit coverage gaps already listed in [parts-sourcing-enterprise-audit.md](parts-sourcing-enterprise-audit.md) (Q-2/Q-3) | Results stop being empty for the real fleet |

---

## 10. Tests

| # | Test | Where |
|---|---|---|
| T1 | `variantPlainLabel`: Fit 2018 → "1.5 petrol" / "1.3 petrol" / "1.5 hybrid"; Roomy 2019 → "2WD" / "4WD"; single version → no question | `vehicleVariantLabel.test.ts` |
| T2 | `askVariant` is false when every candidate returns the same parts (Roomy oil filter) and true when they differ | Deno, `parts_finder.test.ts` |
| T3 | Universal items filter by component (brake pads → no wipers) | Deno + SQL check |
| T4 | Position filter: front keeps front and null, and drops rear | Deno |
| T5 | Legacy mode returns the listed parts in tier 1 with `mode: "legacy"` | Deno |
| T6 | `pickBestPart`: verified first, stock beats tier, price breaks ties, stale loses, unverified gets the badge, empty → null | `partsBestPick.test.ts` |
| T7 | The Dominion response has no `organization`, `stockQty`, `bestOffer`, `plate` or `driver` keys | Deno |
| T8 | `/parts/term?q=o2` returns Oxygen sensor; `?q=04152-40060` returns that part first | Deno |
| T9 | `part_symptom` writes are refused for non-owner staff and write `master_change_log` | Deno + SQL |
| T10 | `browse` hides `is_part = false` rows | Deno |
| T11 | Quick-type parses "Land Rover Defender 2020" and "Toyota Roomy 2019" | `findPartsParse.test.ts` |
| T12 | Fidelity is 100% for S42–S42k, plus the compare images in the port plan §5 | CI + PR |
| T13 | The other Parts database tabs still pass fidelity | CI |

---

## 11. Build order
1. Build the Stitch screens 1–11, export them, and add the README rows.
2. Shared types: `plainLabel`/`plainReason`, `variantPlainLabel`, `pickBestPart`, with tests T1, T6 and T11.
3. Migration:
   - `maintenance_service_categories` columns (E4);
   - `spec_key.maintenance_component_id`, plus the new `universal_section_for_variant` signature (E7);
   - `part_symptom` and `part_symptom_component`, with RLS (E6).
4. Server:
   - `parts_finder.ts` (E1, E3, E9, E10);
   - the `browse`, `term` and `symptoms` routes;
   - the new body of `find-parts`.
   Add tests T2–T5, T7–T10. Deploy.
5. Do the data work in §9, tasks D1–D5.
6. Build the `find-parts/` folder by porting the Stitch HTML, and wire it into `FindPartsTab`.
7. Check fidelity is 100%, take screenshots in light, dark and phone, commit, and deploy the admin site.
8. Then the Fleet doc can start. It reuses steps 2–4.
