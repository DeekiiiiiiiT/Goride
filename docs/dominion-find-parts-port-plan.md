# Dominion · Find parts — build and port plan (Rev 1, 30 Oct 2026)

> **Superseded for looks (30 Oct 2026).** The owner wants the literal, exact Stitch design. Every "Remove", "Hide" and "Replace the text" decision in §4 (G1, G5, G6, G7, G8 and the per-screen rows) is replaced: **build it with a real source instead.** The rule and the open list live in [dominion-find-parts-audit.md](dominion-find-parts-audit.md) §0 and §R2. Work from the audit; use this file only to look up which Stitch file is which screen.

Goal: build the new Find parts tab in Dominion → Parts database. The audit decides the data and rules: [dominion-find-parts-audit.md](dominion-find-parts-audit.md). The Stitch export decides the looks: `C:\Users\deeki\Downloads\stitch_dominion_parts_matcher_admin\stitch_dominion_parts_matcher_admin`.

This plan was written from the real export files and the repo on 30 Oct 2026. No code was changed.

---

## 0. The finish line (read this first)

**A screen is done only when its live page sits next to its Stitch picture and looks the same, in light mode, in dark mode and on a 390 px phone.**

- The word checker (`node scripts/stitch-fidelity.mjs --report`) only looks at headings, labels and buttons. A score of 100% is required, but it is **not** proof that the page is ported.
- Do not design a new layout. Do not build a simpler version and call it a match.
- The only allowed differences from the picture are the ones listed for that screen in §4 (made-up text removed, sample values replaced by live ones).

---

## 1. Is the original Cursor prompt good enough?

It has the right rules: HTML wins on looks, the audit wins on data, no redesigns, and the score is not proof. But it is not enough on its own. Cursor would hit these 8 problems:

| # | Problem in the export or prompt | What this plan does |
|---|---|---|
| 1 | **8 of the 11 `screen.png` files are empty** (28-byte placeholders, not images). Only Screens 2, 4 and 5 have real pictures, so "matches the PNG" cannot be checked for the other 8 | §3 step 0.2 makes the reference picture by opening each `code.html` in a browser |
| 2 | **No screen has a dark version** (0 `dark:` classes in all 11 files). "Same in dark mode" has nothing to compare against | §5 sets the dark-mode rule: the existing Parts database dark colours, checked by contrast |
| 3 | **Only one phone screen exists** (the results screen) | §5 sets the phone rule for the other 10 |
| 4 | **The HTML is full of made-up text**: fake system chips ("INDEXED: 1,489,202 FITMENTS", "MATCHING BRAIN CONFIDENCE 99.8%"), fake error logs, invented counts and customer details ("Kingston Fleet Bay"). "Keep its wording" would make Cursor copy all of it. "Stop and ask me" would make it stop about 60 times | §4 decides every one in advance, screen by screen |
| 5 | **The match-type names don't agree with the audit.** Across the screens they read "Tier 1: Direct OEM", "Tier 4: Cross-brand alt", "Tier 5: Dimension match" and "Same car, diff badge" | The audit's names are used everywhere (§4, rule G2) |
| 6 | **The screen ids clash.** The audit says S40–S40k, but S40 is already the Vehicles home and S41 is the old Find parts | New ids are **S42–S42k** (§2). The audit's §0 and §8 are updated to match |
| 7 | **The UI comes before the engine.** The prompt starts with the screens, but most numbers on them need the new server routes (audit §6). Without those routes Cursor will hard-code the sample numbers | §3 builds the engine first |
| 8 | **The map sentence doesn't apply.** There is no map on these screens. The only pictures are 3 stock product photos in the detail drawer, and Dominion has no part photos | Rule G6 in §4 |

The corrected prompt for Cursor is in §7.

---

## 2. Screen list

| Screen | Stitch folder | README id | HTML in repo | Reference picture |
|---|---|---|---|---|
| 1 Pick the car | `find_parts_pick_the_car` | S42 | `html/S42-find-parts-car.html` | rendered (PNG empty) |
| 2 Which one is yours? | `find_parts_which_one_is_yours` | S42b | `html/S42b-find-parts-variant.html` | real PNG 1280×1226 |
| 3 What part? | `find_parts_what_part` | S42c | `html/S42c-find-parts-browse.html` | rendered (PNG empty) |
| 4 Front or back? | `find_parts_front_or_back` | S42d | `html/S42d-find-parts-position.html` | real PNG 1280×1103 |
| 5 Results | `find_parts_results_in_five_match_types` | S42e | `html/S42e-find-parts-results.html` | real PNG 1280×1392 |
| 6 Part detail drawer | `find_parts_part_detail_drawer` | S42f | `html/S42f-find-parts-detail.html` | rendered (PNG empty) |
| 7 Not on file yet | `find_parts_not_on_file_yet` | S42g | `html/S42g-find-parts-missing.html` | rendered (PNG empty) |
| 8 Everything for this car | `find_parts_everything_for_this_car` | S42h | `html/S42h-find-parts-all.html` | rendered (PNG empty) |
| 9 Problems list + drawer | `find_parts_problems_list_and_drawer` | S42i | `html/S42i-find-parts-problems.html` | rendered (PNG empty) |
| 10 Loading, error, switched off | `find_parts_loading_error_switched_off` | S42j | `html/S42j-find-parts-states.html` | rendered (PNG empty) |
| 11 Phone (390 px) | `find_parts_mobile_390px` | S42k | `html/S42k-find-parts-phone.html` | rendered at 390 px (PNG empty) |

Paths are relative to `docs/stitch/dominion-redesign/`. React files are the ones in audit §7 (`apps/admin/src/components/admin/parts-database/find-parts/`).

---

## 3. Build order

Each phase ends with a check. Do not start the next phase until the check passes.

### Phase 0 — Put the design into the repo (no app code)
1. **Copy the HTML.** Copy each `code.html` to the path in §2. Copy `dominion_technical_parts_engine/DESIGN.md` to `docs/stitch/dominion-redesign/S42-DESIGN.md`.
2. **Make the reference pictures.**
   - Write a small script, `scripts/stitch-render.mjs`. It opens each HTML file in Playwright Chromium at 1280 px wide (390 px for S42k), waits for the fonts, and saves a full-page screenshot to `docs/stitch/dominion-redesign/screenshots/S42*-stitch.png`.
   - For Screens 2, 4 and 5, check that the rendered picture matches the real PNG. If it does, the rendered pictures are trusted for the other 8 screens.
3. **Add the README rows.** Add S42–S42k to `docs/stitch/dominion-redesign/README.md`, with the status "Not started".
   - Change the status of the old Find-parts rows only (S41, S41-phone) to "Superseded by S42 — do not build". The fidelity script then stops checking them. S41b–f and S41-states are the other tabs and keep their rows (audit R2-14).
4. **Add sample labels.** Add every "Remove" line from §4 to `sample-labels.json` under its S42 id, so the word checker does not ask for made-up text.

**Check:** `node scripts/stitch-fidelity.mjs --report` lists S42–S42k as unchecked, and all 11 reference pictures open.

### Phase 1 — Shared engine (audit §11, steps 2–4)
- Shared types: `plainLabel`/`plainReason`, `variantPlainLabel`, `pickBestPart`.
- Migration: the E4, E7 and E6 tables and columns.
- `parts_finder.ts` with the `browse`, `term` and `symptoms` routes, plus the new body of `find-parts`.
- Two read-only count routes for the screens:
  - `GET /admin/catalog/find-parts/coverage?variantId=` returns, per area, how many parts are on file for this version. It fills the area counts on Screens 3 and 8 and "Known components" on Screen 1.
  - `GET /admin/catalog/symptoms/summary` returns the number of problems and how many are live. It fills the tiles on Screen 9.

**Check:** audit tests T1–T11 pass. Deploy the function and call each route once on the live server with a real Fit 2018 request.

### Phase 2 — Data (owner work, runs alongside Phase 1 and Phase 3)
Audit §9, tasks D1–D5. Without this data, the live pages show mostly "Not on file yet". That is correct behaviour, not a bug.

### Phase 3 — Port the screens, one at a time, in order 1 → 11
Each screen is one commit. For each screen:
1. **Port only what is inside `<main>`.** The app already has its own sidebar and top bar. Do not copy the Stitch sidebar, top bar, "CORE CLUSTER 04", "v4.18.2" or "Node: OK".
2. **Keep the HTML as it is.** Keep its element structure, classes, spacing and wording. Turn `class` into `className`, and turn the inline `<script>` blocks into React state.
3. **Put it inside the existing styling wrapper.** Every screen sits in `.parts-database-stitch`, which [partsDatabase.css](../apps/admin/src/components/admin/parts-database/partsDatabase.css) already defines. If the HTML uses a class from its own `tailwind.config` block that the app does not have yet (font sizes such as `text-mono-md`, colours), add that class to the same scoped theme. Never add it to global CSS.
4. **Fill in live data.** Swap the sample values for live ones, and apply that screen's rows in §4.
5. **Make the proof pack** (§5) and save it next to the reference picture.
6. **Mark it Ported.** Set the README row to "Ported" and run the word checker. It must show 100%.

### Phase 4 — Finish
- `vitest` passes, the admin `tsc` has no new errors compared with `main`, and the Playwright visual test passes (§5).
- Deploy the admin site, then open the live URL and repeat the light, dark and phone pictures for Screens 1, 5 and 7 against real data.

---

## 4. Decisions for each clash (no need to ask)

### Rules for every screen
- **G1 · Made-up system text is removed.** Remove every chip or line that names a schema, node, shard, cluster, index size, version number, protocol, query id, hash, trace id, latency or log line.
  - Examples: "SCHEMA: FIT-MATCH-v4", "NODE: CATALOG_RW", "INDEXED: 1,489,202 FITMENTS", "Logic Engine v4.2", "ISO-3779 MATCH ACTIVE", "DB SYNC: VERIFIED", "ENGINE VER: CARIBBEAN SPEC L4", "DISAMBIGUATION_FLOW_v2", "CATALOG CONTEXT: JM-IMPORT-CARIBBEAN", "AXLE_DISAMBIGUATION_REQUIRED", "ISO/SAE COMPATIBILITY PROTOCOL", "STATUS: GAP_DETECTED", "Cluster Node: SYNCED", "MATCHING BRAIN CONFIDENCE 99.8%".
  - The space they took stays empty. Nothing moves.
  - (Audit §4: no fake confidence numbers.)
- **G2 · Match-type names come from the audit (F6).** The big title is the plain name and the small tag is the short word:

  | Title | Tag |
  |---|---|
  | Made for your car | OEM |
  | Same car, different badge | Sister |
  | Fits your engine | Engine |
  | Other brands that replace it | Aftermarket |
  | Fits by size | Universal |

  - Replace "Tier 1: Direct OEM", "Tier 4: Cross-brand alt", "Tier 5: Dimension match", "Same car, diff badge", "TIER 1 MATCH", "TIER 3 FIT", "CROSS-REF", "Direct OEM", "Badge Variant", "Engine Match", "Cross-Brand" and "Dimension Match" with these.
  - The 5-type reference strips on Screens 1, 2 and 4 keep their layout. They show the 5 titles plus `plainReason` from `PART_MATCH_TIERS`.
- **G3 · The staff note box stays, with true text.** The current text says customer data "is stripped", which wrongly implies Dominion holds it.
  - Owner sees: "Any missing part can be added here with Add it now."
  - Staff see: "You can search everything here. Only the owner can change parts."
- **G4 · No customer data (audit §4).** Remove fleet names, bays, wait times and anything that notifies fleets. Counts with no names are allowed.
- **G5 · Every number is live or it goes.** If the audit gives a number a source, fill it in. If not, remove the number and keep its label only when the label still makes sense alone. Never hard-code a sample number.
- **G6 · No pictures of parts.** Dominion stores no part photos. Where the HTML shows a photo, show the component's icon (`icon_key` from `maintenance_service_categories`) centred in the same box, at the same size.
- **G7 · Buttons with no feature behind them are removed.** This covers "Audit fit matrix", "View queue priority", "Revert to baseline", "Reset Live Previews" and "Inspect error log". The buttons the audit lists (§7: Confirm, Edit, Exclude, Add it now, + add alias, Add a part) stay, and are owner-only.
- **G8 · Plain words win over trade words.** When Stitch wording is technical jargon, the plain words in the audit's §5 flow replace it ("Commit & Ingest Part" becomes "Save part"). This is the only kind of wording change allowed.

### Screen 1 — Pick the car
| In the HTML | Decision |
|---|---|
| Make, Model and Year lists, the 01/03 counters, the "Which car is it?" title | Keep. Live lists from the catalog |
| "(Facelift)", "Platform: GK / GP Gen 3", "OEM ID: HON-JP", "Series: 2013–2020 Cycle" | Fill from the catalog's platform name and year range. Hide the line when it is empty |
| "Accepts combined strings, Japanese auction grades, or VIN codes" | Replace with "Type make, model and year, e.g. 2018 Honda Fit" (F11 only supports this) |
| "Resolved: [GK3 / GK4 / GK5 / GP5]" | Live version codes for the chosen year |
| "Known components · 1,248 Verified Parts" | Live count from the coverage route |
| "Recent searches & Active bays" | "Recent searches", stored per browser. "Active bays" is removed (G4) |
| 5-type strip | G2 |

### Screen 2 — Which one is yours?
| In the HTML | Decision |
|---|---|
| Version cards, "Not sure" card, "Where do I find this?" panel, Back and Continue | Keep |
| "Chassis Matrix A/B/C" | Remove (G1) |
| Card title "1.5 hybrid" and code line "GP5 · LEB · 7-speed DCT" | Title from `variantPlainLabel`. Code line from the catalog's chassis code, engine code and transmission |
| Card description sentences, "Most common Jamaican import" | Remove (no data) |
| TAJ hint "first 3 alphanumeric characters…" | "The letters before the dash are the model code, for example GP5." |
| 5-type strip | G2 |

### Screen 3 — What part?
| In the HTML | Decision |
|---|---|
| Search box, Common, By area, By problem, Skip | Keep (audit E4–E6) |
| Search results "also called o2 sensor, lambda probe" | Live from the `term` route |
| "Exact part number lookup ›" | Keep. It searches part numbers through the same `term` route |
| Area names and "142 parts" counts | Live system names (11 areas from `maintenance_service_categories`) and live counts. The list grows or shrinks to match the live data |
| "10 System Domains · Total 377 parts mapped" | "{n} areas · {n} parts on file", live |
| "MATCH RANK: #1", "Tier 1 · Direct OE" on problem answers | Rank is the live `part_symptom_component` rank. The tier line is removed |
| "Acoustic wear sensors emit…" and "Scoring or lip formation…" | Remove. Only the live hint is shown |

### Screen 4 — Front or back?
| In the HTML | Decision |
|---|---|
| Front, Back and Both cards, Back, Show parts | Keep. Shown only for position-aware parts (E9) |
| "12 Fitments", "All 5 tiers matched" | Live: "{n} parts" and "{n} of 5 match types" for that position |
| "Axle Geometry Map", "Mechanical Disambiguation Reason" panel | Keep the box. Replace the text with "Front and back {part} are different parts." Remove the Akebono and Nissin detail |

### Screen 5 — Results
| In the HTML | Decision |
|---|---|
| Step bar, choice trail, best match card, sections, the "Nothing on file for:" line, Add a part | Keep |
| "Service essentials 2 of 10 · Specs 4 of 13 · Other parts 1" | Live readiness numbers |
| "CHASSIS: DAA-GP5 · ENGINE: LEB-H1" | Live codes |
| Section description sentences | `plainReason` from the tier (G2) |
| "Fits all 3 versions" / "Only the 1.5 hybrid" | Live from `fitsVariantIds` |
| "Match logic architecture" info box, "MATCH ENGINE ACTIVE: 3 TIERS POPULATED" | Remove (G1) |
| "Side (N/A)" step | Keep as a skipped step when the part is not position-aware |

### Screen 6 — Part detail drawer
| In the HTML | Decision |
|---|---|
| Header, "Why it fits" with source link, spec rows, "Fits these versions", "Same part, other numbers", "Also called", history, Exclude, Edit | Keep (audit §7) |
| The CATALOG / HONDA / FIT / L15B background header and the 3 photo cards behind the drawer | This is the page under the drawer. Show the real Screen 5 behind it. The photos follow G6 |
| Spec rows | Live from `catalog_spec_value`. Rows with no value are hidden |
| "Hash: SHA256…", "ISO-3779 MATCH ENGINE v4.2", "Verified via Japan EPC" | Remove (G1). History rows show live who and when |
| "Already verified" / Confirm | Shows Confirm when the part is not verified, and "Already verified" when it is |
| "+ add alias" | Owner-only. Writes a `part_term_synonym` row |

### Screen 7 — Not on file yet
| In the HTML | Decision |
|---|---|
| Headline "We don't have {part} for the {car} yet.", Add it now, Search a different part | Keep |
| "Asked for by 3 fleets · 4 open requests" | Live from `catalog_signal_part_demand`. Hidden when there is no row |
| "PRIORITY: HIGH", "Kingston Fleet Bay", "Average wait time 1.2 hrs" | Remove (G4) |
| "Quick Add Preview" panel | Keep the box. It shows the prefilled car, version, component and position that Add it now will use. "CLASS_ID", "POS:", "ALGO:" and "Auto-mapped" are removed (G1) |
| "Sister Platform Search: Checked Honda Grace…" | Live: "Also checked: {sister names}" from the engine's sister list. Hidden when empty |
| "Ingestion SLA 320ms", "Clean Telemetry" cards | Remove (G1) |
| "New Fitment Record" drawer | The look comes from the HTML, but it saves through the existing `AddPartDialog` fields and route. "Brake System Type" shows only if it is a spec key for that part. "Notify 3 waiting fleets" is removed (G4). The button "Commit & Ingest Part" becomes "Save part" (G8) |

### Screen 8 — Everything for this car
| In the HTML | Decision |
|---|---|
| Groups by area, table columns, Add per area, the empty group "Nothing yet for Brakes" | Keep. Groups use the live areas |
| Group description lines | Hidden unless the area has a description in the data |
| "Physical pass · GP5 rig", "Fitment guaranteed", "OEM catalog match" | Live verification source. Hidden when there is none |
| "Gaps are automatically logged in the missing parts queue." and "View queue priority" | Remove. It is not true, and there is no such queue |

### Screen 9 — Problems list + drawer
| In the HTML | Decision |
|---|---|
| Table, Add problem, category filter, edit drawer, ranked parts with drag handles, live switch, "Reason for this change" | Keep (audit E6) |
| "Resolution rate 91.4%" and "Search volume (30d) 42,890" tiles | Keep the two tiles, with live "Problems {n}" and "Live {n}" from the summary route. There is no search or time data |
| "PRB-BRK-001" ids, "Class: Friction lining · (OEM Cat. #04465)" | Remove (G1) |
| "Auto-Rank Engine Active", "Diagnostic Matching Rule" box, "Cluster Query Time" | Remove (G1) |
| "Logged permanently in platform Master Activity Log against staff DT." | Keep. The write goes to `master_change_log` (T9) |
| Dates shown as 2024 | Live dates |

### Screen 10 — Loading, error, switched off, car not in catalog
The export is a board that shows four states side by side. **It is not a page.** Each panel becomes the real state, drawn in place inside the Find parts tab.

| In the HTML | Decision |
|---|---|
| Skeleton loader | Keep. The shimmer has the same shape as the step being loaded |
| Error: "Could not load parts. Nothing was changed." with Retry | Keep. "HTTP 504", trace, latency and log lines are removed (G1) |
| Car not in the catalog: headline, "+ Add this car", "Browse all Honda models" | Keep. The production timeline, "Probable Model Equivalents" and "Request #WL-9481" are removed (no data) |
| Switched off: info line | Audit text: "Match types are switched off. Showing parts listed for this car only." The "Turn match types on" switch is removed. The flag is not changed from this page |

### Screen 11 — Phone
| In the HTML | Decision |
|---|---|
| Stacked results, step chips, sections, the bottom-sheet detail | Keep |
| "Index: v4.88-live", "View Part Details Sheet Preview", "Staff action shortcut", "Rev A · JDM / Rev B · Hybrid Global" | Remove (G1) |

---

## 5. Proof pack (the definition of done)

### How the comparison works
The live database has 2 parts, so the live page cannot look like the picture. The picture is checked with **the same sample data**, and the live page is checked separately.

1. **Visual test.** Add `e2e/dominion-find-parts-visual.spec.ts` to the same Playwright project as `e2e/dominion-places.spec.ts`.
   - It intercepts the find-parts, browse, term, symptoms and coverage calls with `page.route`. It answers them with fixture JSON (`e2e/fixtures/find-parts/*.json`) that holds the sample values from the picture: the 2018 Honda Fit, Toyota 04152-40060, MANN-FILTER HU 6006 z and the rest.
   - It screenshots each screen at 1280 px in light mode, at 1280 px in dark mode, and at 390 px.
2. **Side-by-side picture.** For every screen, the test writes one image, `screenshots/S42*-compare.png`: Stitch on the left, live in the middle, and a pixel-difference overlay on the right.
3. **Allowed differences.** The only red areas allowed in the overlay are the "Remove" and "Replace" items in §4 for that screen. Anything else red is a bug.
4. **Live check.** After the deploy, take the same three pictures of Screens 1, 5 and 7 against the real server.

### Dark mode rule (there is no dark picture)
- Same layout as light mode. Colours come from the `.dark .parts-database-stitch` tokens in `partsDatabase.css`.
- Any Stitch class without a dark rule gets one there.
- **Pass:** no white or light-grey boxes left, and an axe check in the visual test reports no colour-contrast failures.

### Phone rule (only Screen 11 is drawn)
- Screen 11 must match its picture.
- Screens 1–10 at 390 px must:
  - keep the same order as on desktop;
  - stack to one column;
  - make the choice trail scroll sideways inside itself;
  - turn drawers into full-height sheets;
  - show no page-level sideways scrolling (the test checks `scrollWidth <= 390`);
  - keep every button reachable.

### Per-screen checklist
- [ ] The word checker shows 100%
- [ ] The light compare image has red only in the allowed areas
- [ ] The dark compare image passes the dark rule
- [ ] The phone image passes the phone rule (Screen 11: matches its picture)
- [ ] No sample number is hard-coded (search the component for the sample values from the picture)
- [ ] Staff login: owner-only buttons are disabled and show the tooltip

---

## 6. Risks to watch

| Risk | Guard |
|---|---|
| Cursor copies the Stitch sidebar into the page | Phase 3, step 1: `<main>` only |
| Sample numbers left hard-coded | The fixture-only values are listed in the visual test. A unit test fails if any of them appear in a `find-parts/*.tsx` file |
| Stitch's own `tailwind.config` names are missing in the app, so the page silently loses sizes and colours | Phase 3, step 3. The visual diff shows it as large red areas |
| The fidelity script still checks the old S41 rows | Phase 0, step 3 marks them Superseded |
| The live data is too thin to see the page working | Phase 2 data work, plus the fixture-based visual test |

---

## 7. Prompt to give Cursor

```
Read these two files fully before writing any code:
1. docs/dominion-find-parts-port-plan.md   (how to build it, and when it is done)
2. docs/dominion-find-parts-audit.md       (the data and the rules)

The Stitch export is in:
C:\Users\deeki\Downloads\stitch_dominion_parts_matcher_admin\stitch_dominion_parts_matcher_admin

The finish line: a screen is done only when the live page sits next to its Stitch
picture and looks the same, in light mode, dark mode and on a 390 px phone. The proof
is the compare image in plan §5. The word checker score must be 100%, but it is not proof.

Rules:
- The HTML decides the looks: layout, spacing, colours, type, icons and wording.
  Port only what is inside <main>, into the existing .parts-database-stitch wrapper.
- The audit decides the data, the rules and the permissions.
- Fill in live names and numbers only. Never hard-code a number from the picture.
- Plan §4 already decides every known clash between the HTML and the audit. Apply it.
  Stop and ask me only for a clash that §4 does not cover.
- Do not design a new layout. Do not build a simpler version and call it a match.
- Work in the order of plan §3: Phase 0, then Phase 1, then the screens one at a time
  from 1 to 11. Each screen is one commit with its proof pack.
- Do not start a screen until the routes it needs exist and pass their tests.

Start with Phase 0. Show me the 11 rendered reference pictures before Phase 1.
```
