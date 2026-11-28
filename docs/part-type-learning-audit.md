# Learning new part types from saved pages — plan

**Rev 3 · 26 Nov 2026 · CLOSED — ready to build** (round 1 by Claude, round 2 on the Stitch screens §4c). For the owner to read.

Rev 2: review round 1 by Claude. R4 ("no dates → the car's whole build") is **wrong and removed** — every part row
on both real pages carries a period. PT-09 and PT-13 are corrected, and every live clean-up now carries its exact
rows and a before/after check. See §10.

**Goal (one sentence):** when the owner uploads a saved catalogue page in Dominion, Roam spots every part on the
page that has no Roam part type yet and lets the owner add that part type with one button, so the parts database
keeps growing from each upload, and the new parts are saved and get pictures straight away.

**Who it's for:** the owner (Dominion, Parts database). What it removes: today 8 of 9 rows on the owner's own
air-cleaner page end up in a dead group called "Not a Roam part type" — not saved, no picture, and nobody in Roam
Fleet can find them.

**Built on:** [saved-page-parts-audit.md](./saved-page-parts-audit.md) (the upload, live 26 Nov) and
[part-pictures-audit.md](./part-pictures-audit.md) (pictures from the page's drawing, live 26 Nov, switched **on**).
This plan changes one rule in the pictures plan: PT-16 keeps the page's drawings once per upload, so a new part type
can be pictured later. It changes nothing in the saved-page plan's rules.

---

## 0. START HERE

- **Build status (26 Nov, all local, nothing committed or live):**
  - D1 data — migration `20261126124518_part_type_learning.sql` + checks; Claude changed the MAF seed's op code to
    `ENG-MAFSENSOR` (ENG-MAF belongs to "MAF / MAP Sensor Cleaning") and added `op_codes_unique`. Replay green. Paste
    file `docs/part_type_learning_LIVE_apply.sql` ready, **not applied**.
  - S1/S1b server (DSH) — R1–R11 + review fixes (rename keeps rows, page-held → "added", double press safe).
    CI find-parts deno 202/202.
  - Screens (Claude) — S1 cards `research-engine/SavedPageSuggestions.tsx` (wired in `SavedPageOverlay.tsx`, owner
    flag from `CarCoverageTab` / `ResearchJobDrawer`); S2 required part group + `part-types/HiddenPartTypePhrases.tsx`.
    Admin vitest 307/307, `dominion-saved-page-parts.spec.ts` 10/10 (new click-through), tsc clean.
  - Next: ship — paste the SQL, deploy `platform-catalog`, push Dominion; then the owner's real run on the air-cleaner page.
- **Stitch prompt (26 Nov):** [stitch/part-type-learning-dominion-prompt.txt](./stitch/part-type-learning-dominion-prompt.txt) — 10 Dominion screens (S1 result suggestions in every state, staff view, fixings only, phone; S2 group picker, hidden list + empty/error). Note for round 2: §4 S1's example says "1 fixing"; the air-cleaner page has 2 (clip 17875C, clamp 17881A).
- **Checked live 26 Nov 2026**, on code, on the production tables (`maintenance_service_categories`, `part_master`,
  `part_listing`, `research_saved_page`, `part_picture`, `part_term_synonym`) and on the owner's two saved files in
  `Downloads`.
- **Two real uploads are the test bed** (both already in `research_saved_page`, both for the same car:
  Toyota Roomy M900A, 1KR-FE, built 11.2016 – 08.2020):
  - the air-cleaner page, 9 rows: 1 already on file (the air filter `17801-21060`), 8 Roam doesn't know;
  - the front-shock page, 32 rows: 8 saved, 1 held, 23 Roam doesn't know.
- **Both pages give every part row a period.** Counting the period cells in the two saved `.html` files: air-cleaner
  **9 of 9**, shock page **32 of 32**. The rows only look dateless in today's result because those rows are never
  read (§1.4).
- **Read in this order:** §1 (what exists), §2 (data), §3 (server), §4 (screens), §5 (problems, one fix each),
  §6 (done-tests), §7 (coverage — the common parts Roam has no type for, and which to seed).
- **Nothing here asks the owner to decide anything.** Every problem has one chosen fix.

---

## 1. What exists today

### 1.1 The parts database, counted live (26 Nov)

| Thing | Live number |
|---|---|
| Rows in `maintenance_service_categories` | 147 |
| Rows that say "this is a part and active" | 99 |
| … of those, the **13 part groups themselves** (Engine, Brakes, Filters…) | 13 |
| **Real part types** (kind `component`, is_part, active) | **86** |
| Part types with at least one part in `part_master` | 17 |
| Part types with at least one confirmed fitting in `part_listing` | 15 |
| **Part types with no parts at all** | **69** |

So the "99 active part types" in the brief is really **86**. The other 13 are the part groups, which are also
flagged as parts. Changing that flag is **not** in this plan — it breaks the parts browser (PT-13, §8).

Live parts: 64 rows in `part_master` (63 numbers) and **181 confirmed fittings**. The biggest type is "Brakes"
(meaning brake pads) with 57 confirmed fittings over 7 numbers; then brake hose 28, ABS wheel sensor 18, brake
caliper 14. Brakes is also the only group that is properly covered — the other twelve are thin or empty.

### 1.2 What a part type needs

A part type is one row in `public.maintenance_service_categories`. The table itself requires:

| Column | Needed? | What it is |
|---|---|---|
| `name` | yes | what the owner sees and what the AI is asked to match: "Shock absorber" |
| `parent_id` | yes in practice | the **part group** it sits under — one of the 13 |
| `code` | yes, **unique** | a short key made from the op code (`air_filter`) |
| `kind` | yes | `component` for a part type (`system` is a group) |
| `is_part` | yes | `true`. In Roam Fleet `false` means "a service job, labour only" — see PT-09 |
| `part_type_status` | yes | `active` or `draft` (draft = out of the AI's list and the owner's list, kept) |
| `position_scheme` | yes | one of 10: `none`, `axle`, `four_corners`, `axle_left_right`, `axle_numbered`, `axle_inner_outer`, `driver_passenger_rear`, `low_high_beam`, `before_after_catalyst`, `front_rear_side` |
| `default_action` | **yes, required by a check** | `replace`, `inspect`, `flush`, `top_up`… a part type cannot be saved without one |
| `plain_name`, `icon_key`, `sort_order`, `default_fit_mode`, `field_schema`, `status` | no | defaults exist |

Optional and unused for most types: `trade_term`, `editor_hint`, `labour_minutes`, `common_rank`, `description`,
`fleet_tip`, `overdue_effect`, `brake_role`, `reference_note`, `fits_powertrains`, `fits_fuels`,
`is_high_voltage`, `records_findings`, and the size/spec fields in `part_type_spec_field`.

**In plain words:** a part type needs a name, a part group, and a unique short code. The rest Roam can fill in.
All 86 live types have one: 81 say `replace`, and the 5 fluid types say `top_up` or `flush`.

### 1.3 How a part type is added today — and what's wrong with it

**Screen:** Dominion → Parts database → Add parts → **Part types** (Stitch AP13).
[`PartTypesSettings.tsx`](../apps/admin/src/components/admin/parts-database/add-parts/part-types/PartTypesSettings.tsx).
Owner only. It has **Create part type** (name, op code, "How it usually fits", size/spec fields), an edit panel,
and a **Requests queue** of part types staff have asked for.

**Server:** `POST` / `PATCH /admin/catalog/part-types`, owner only (`catalog_routes.ts`), which calls the SQL
function `upsert_self_serve_part_type(p_input)`.

**What that function sets:** `code` from the op code, `plain_name` = the name, `is_part = true`,
`kind = 'component'`, `default_action = 'replace'`, `sort_order = 900`, `part_type_status` from the form.

**Three things are wrong today:**

1. **The form never asks for the part group.** It sends a fixed id, `b1000000-0000-4000-8000-000000000001`, which is
   **Engine**. So every part type made there (or from a request) lands under Engine, whatever it is. A cabin filter
   or a brake hose created today would sit under Engine and be drawn with Engine materials. (PT-07)
2. **Nothing checks the name against the types Roam already has.** "Engine oil" exists twice. (PT-04, PT-09)
3. **The big brake type can never be matched from a page.** Its name is "Brakes" (its plain name is "Brake pads"), and
   the saved-page check looks for the type's own words on the page. A catalogue row says "PAD KIT, DISC BRAKE" — no
   "BRAKES" anywhere. So the most used part type in the database (57 confirmed fittings, more than any other) is held
   with "The page doesn't name this part type on that row". (PT-11)

### 1.4 What the upload does with a part Roam doesn't know

Read in order: `research_saved_page_routes.ts` (the route), `saved_page_proof.ts` (the checks),
`saved_page_text.ts` (page → lines), `research_part_save.ts` (one save path), `part_pictures_queue.ts` (pictures).

- The page is turned into numbered plain-text lines, prices removed. Each table row or list item is one line.
- Two AI reads list every part row: line, group row, part type (one of Roam's names **or `other`**), place,
  number, dates, note.
- Code proves each row on the page: the number is written there, the dates are written there, the place words are
  there, the type's words are there, the two reads agree, the note doesn't name another car.
- **A row whose type is `other` is dropped at the first check** (`proveRows` does `if (!type) { out.push(row); continue; }`).
  It keeps only a line number, the number the AI said, and the word "other".
- Then it is stored in `research_saved_page.result.rows` as `{ partType: "other", place: null, number, dates: null,
  group: "not_roam_type" }` and shown in a collapsed "Not a Roam part type · 8 rows · other" group with no buttons.
- The page's own name for the part (the group row, e.g. `17881 - HOSE, AIR CLEANER, NO.1`) is used for a moment and
  then thrown away. The file itself is never stored. So after the upload, that name cannot be recovered. (PT-01, PT-02)

**The dates are on the page — they are thrown away too.** The air-cleaner page, read straight from the saved file
(the callout is the number printed beside the part in the maker's drawing — the same label the picture step uses):

| Number | Callout | Period on the page | What it is |
|---|---|---|---|
| `12229-B1010` | 12229 | 11.2016 – 09.2020 | ventilation pipe |
| `17705-B1100` | 17705 | 11.2016 – 09.2020 | air cleaner cap |
| `17751-B1031` | 17751 | 11.2016 – 12.2019 | air cleaner inlet |
| `17751-B1070` | 17751 | 11.2016 – 12.2019 | air cleaner inlet, marked `(SUBS)` |
| `17751-B1070` | 17751 | 01.2020 – 09.2020 | air cleaner inlet |
| `17801-21060` | 17801 | 11.2016 – 09.2020 | the air filter (already on file) |
| `90044-66035` | 17875C | 11.2016 – 09.2020 | hose clip |
| `17881-B1130` | 17881 | 11.2016 – 09.2020 | air cleaner hose |
| `90044-66050` | 17881A | 11.2016 – 09.2020 | hose clamp (the "A" clamp for the 17881 hose) |

Two things this settles. `17751-B1070` is the catalogue's superseding number for `17751-B1031` (the `(SUBS)` mark) and
carries both periods — which is why one suggestion covers two numbers and three rows. And the two fixings are
`17875C` (a clip) and `17881A` (a clamp).

The shock page is the same: 32 part rows, 32 periods (28 × 11.2016 – 09.2020, 2 × 11.2016 – 11.2018,
2 × 11.2018 – 09.2020 — the shock split). Yet the stored result shows `dates: null` on all 8 air-cleaner unknown
rows, because those rows were never read. That is the loss this plan fixes.

### 1.5 Part pictures today (live, switched on)

- A picture is made for every proven row of a Roam type that ends **saved** or **already on file**.
- The page's drawing is read out of the single-file page, the part's callout is found (from the group row, e.g.
  `17881`), the drawing is kept privately for 30 days, and one Gemini call draws the part. US$0.04 a picture,
  50 a day, shared Gemini cap. One picture is live and ready (the air filter).
- **A part type in a group whose template is off gets no picture.** Fluids and Tires & wheels are off (by choice).
- **A picture can only be made while the upload still has the page's drawing.** The file is not stored, so once the
  upload ends the only drawings left are the ones already stored per picture. A part that was never pictured has no
  drawing to use later. (PT-16)

### 1.6 What Roam Fleet does

Find parts needs a part type picked (or typed) first; then it shows the fittings for that car. The search box matches
on the part type's `name` / `plain_name`, the `part_term_synonym` list, and part numbers
(`readPartTerm` in `parts_catalog_read.ts`). It then filters to what has a fitting for that car.

Two things matter for this plan:

- **`is_part = false` means "a service job, labour only" in Fleet** (`isServiceJob` in
  `log-service/logServiceJobCost.ts`; `LogMaintenanceServiceDialog.tsx` switches to a cost-only form). It is how
  wheel alignment and a throttle-body clean are logged. So `is_part` is **never** changed by this plan.
- A part type that exists, with a fitting saved, is found — **if the person types the type's words**. The synonym
  list already sends "air cleaner" to **Air filter**, so a person typing "air cleaner" for the inlet or the hose finds
  the filter instead. (PT-17)

---

## 2. Data

### D1. Keep everything about an unknown row, in the upload's own result

No new table for rows. `research_saved_page.result.rows[]` (jsonb) gains these fields for **every** row:

| Field | What it holds |
|---|---|
| `partType` | the type's name when Roam has it; **otherwise the page's own name**, e.g. `Hose, air cleaner, no.1` — never the word `other` |
| `groupLine` | the page's group row, as written: `17881 - HOSE, AIR CLEANER, NO.1` |
| `lineText` | the row's own line, as written (prices already removed) |
| `lineNo` / `groupLineNo` | where they are on the page |
| `from` / `to` / `datesText` | the dates read off the row, and the same in plain words ("11.2016 – 12.2019") |
| `numberOk` / `readsAgree` / `datesOk` / `placeOk` | what the checks found on that row |
| `place` | front/rear and left/right, kept even when Roam has no type |
| `suggestion` | the key of the suggestion this row belongs to (unknown rows only) |

**Limits:** at most 400 rows, and each kept line cut at 300 characters. That is far more than either sample page
(9 and 32 rows). Nothing else from the page is stored: no price, no file, no whole page.

**Why the lines and not just the name:** adding a part type later must prove the row again without the file. The
number, the dates and the type's words all live on those two lines.

### D2. Suggestions, computed once at upload, stored in the same result

`result.suggestions[]`, one entry per catalogue group row among the unknown rows:

```
{ key,                       // stable: the group row's own words, normalised
  name,                      // the suggested plain name: "Air cleaner inlet"
  groupId, groupName,        // suggested part group
  kind,                      // "new" | "existing" | "fixings"
  existingTypeId,            // for "existing"
  positionScheme,            // "none" | "axle" | "axle_left_right"
  pagePhrase,                // the catalogue's own words, shown small under the name
  numbers: [...],            // distinct numbers, in page order
  rowCount, numberCount,
  status,                    // "open" | "added" | "dismissed"
  typeId, typeName,          // filled when added
  reason }                   // why it failed, plain words
```

`suggestions` is written during the upload and edited in place by the Add / Dismiss route (§3). It is never
recomputed by the screen.

### D3. New table `public.part_type_suggestion_dismissal` — "not a part we track"

| Column | Notes |
|---|---|
| `id` uuid pk | |
| `phrase_key` text **unique** | the group row's words, normalised: upper case, letters and digits only |
| `phrase` text | the words as the page wrote them, for the owner to recognise |
| `group_id` uuid null | the group it was offered under, for context only |
| `dismissed_by` uuid, `dismissed_at` | who and when |
| `note` text null | why, in the owner's words, optional |

Deny-all RLS, service role only (same as `research_saved_page`). A dismissed phrase is never suggested again, on any
page, for any car. Undo = delete the row (§4 S2).

### D4. New table `public.research_saved_page_diagram` — the page's drawings, kept 30 days

| Column | Notes |
|---|---|
| `id` uuid pk | |
| `saved_page_id` uuid fk → `research_saved_page` on delete cascade | |
| `r2_key` text | private bucket, `part-diagrams/pages/<savedPageId>/<uuid>.<ext>` |
| `content_type`, `width`, `height` | from the file's own bytes |
| `map_box` jsonb null | the drawing's rectangle for the part map, when the page has one |
| `delete_after` timestamptz, `deleted_at` | 30 days, same cleanup as the picture drawings |

At most **3** drawings per upload, only when the file is a single-file page. Deny-all RLS, service role only. This is
what lets a part type added an hour later still get a picture (PT-16). Total added storage per upload: tens of KB.

### D5. Live clean-ups — three statements, each with its own check

Each one names the exact row, the counts before and after, and what must stay exactly the same. Every statement keys
on `code`, never on `id`, so it is replay-safe; the ones that touch a row no migration creates are no-ops in a replay.

**D5.1 Rename the brake-pads part type: `name` "Brakes" → "Brake pads".**

| | |
|---|---|
| Exact row | `maintenance_service_categories` where `code = 'brakes'` — the component (not the Brakes group, which keeps its name) |
| Columns changed | `name` only. `code`, `op_code` (`BRK-PADS`), `plain_name` ("Brake pads"), group, scheme (`axle`), `default_action`, status all untouched |
| Before → after | name `Brakes` → `Brake pads`. active part types 86 → 86 |
| Must not change, and is checked | its 8 `part_master` rows → still 8; its 57 confirmed fittings → still 57; its 1 research job → still 1; its 5 `part_term_synonym` rows already say "Brake pads" → still 5; no `part_picture` row (0) → still 0. Fleet shows `plain_name`, which is already "Brake pads", so **nothing in Fleet changes**. Dominion and the AI now see "Brake pads", so the words "PAD KIT, DISC BRAKE" match |

**D5.2 Rename the Fluids engine-oil product: `name` and `plain_name` "Engine oil" → "Engine oil (top-up)".**

| | |
|---|---|
| Exact row | `maintenance_service_categories` where `code = 'engine_oil_part'` (op code `FLD-ENG-OIL`, group Fluids). **Not** the Engine group's `code = 'oil'` row (op code `ENG-OIL`) |
| Columns changed | `name` and `plain_name` only. `code`, `op_code`, `is_part` (**stays true**), `default_action` (`top_up`), `default_fit_mode` (`spec`), its 1 spec field (`engine_oil_grade`) and its group all untouched |
| Why this one and not the other | The oil-change row (`ENG-OIL`) keeps its name, its `is_part = true`, its fit mode, its 2 parts and its 2 fittings. So **Fleet logs an oil change exactly as it does today**, and no part is orphaned. The Fluids row is the "buy or top up the oil itself" product — its own description already says so, and its action is `top_up` — so "(top-up)" is what it is |
| Before → after | names duplicated: 2 → 1 (`Engine oil` now means one row only). active part types 86 → 86. Engine `ENG-OIL`: unchanged. Fluids `FLD-ENG-OIL`: 0 parts → 0, 1 spec field → 1 |
| Must not change, and is checked | `ENG-OIL`'s 2 `part_master` rows → 2 and its 2 fittings → 2; the Fleet synonym `engine oil` (which already points at `ENG-OIL`) → unchanged; the maintenance rules keyed on `engine_oil_part` (powertrain fit, default action `top_up`, its service-card sentence) → all keyed on `code`, unchanged. A save from a saved page now resolves "Engine oil" to exactly one type |

**D5.3 Hide the duplicate cabin-filter type: `67d34386-…` `part_type_status` → `draft`.**

| | |
|---|---|
| Exact row | `maintenance_service_categories` where `code = 'cabin_air_filter'` (op code `FILT-CAF`, group Filters). Kept, not deleted |
| Columns changed | `part_type_status` only |
| Why this one and not the other | The HVAC row `code = 'cabin_filter'` (name "Cabin A/C Filter", plain name "Cabin filter") is the one the Fleet synonym list points at, the one with `common_rank` 7, and the one the maintenance rules replace every 10,000 km. It stays active. The Filters copy has no data at all |
| Before → after | active part types 86 → 85. Cabin-filter names shown to the AI: 2 → 1. Filters copy: parts 0 → 0, fittings 0 → 0, research jobs 0 → 0, spec fields 0 → 0 |
| Must not change, and is checked | its 0 parts, 0 fittings, 0 jobs and 0 spec fields stay 0, so **no logged service, part, fitting or picture can change meaning** (a picture is keyed on a part's interchange group, and this type has none). The HVAC `cabin_filter` row and its 2 synonym rows are untouched |

**One consequence to state plainly:** the Fleet parts browser (`shapeBrowse`) filters on `is_part`, not on the draft
flag, so it still lists the drafted cabin-filter row next to the HVAC one. Drafting fixes the AI list, the owner's
part-type list and new saves; it does not tidy that one browser. Teaching the browser to skip draft types is a
separate change (§8).

**Also checked:** this row exists only in production — no migration creates `cabin_air_filter`. It is the same
situation the pictures plan recorded for two part groups (PP-32). The statement is therefore written to update by
`code` and to do nothing when the row is absent, so a fresh replay stays green.

### D6. Seed the common parts Roam has no type for

17 new part types, listed with groups in §7. Each is created by the same function the Add button uses, so they carry
a group, an op code, `default_action`, a position scheme and an active status. **This is the cheapest way to make the
next upload find a type instead of suggesting one.**

### D7. Seed a synonym for every new type

For every type created (by the button or by the seed), one row in `part_term_synonym`:
`term` = the page's own phrase lower-cased (seeded types use their plain name), `canonical` = the type's name,
`maintenance_component_id` = the type. That is what makes Fleet find the type by the words printed on the page (PT-17).

### D8. Automatic checks (`supabase/tests/`, in the CI replay loop)

1. `part_type_suggestion_dismissal.phrase_key` is unique.
2. A dismissal cannot exist without a phrase, and no suggestion is offered for a dismissed phrase.
3. `research_saved_page_diagram` rows are deleted with their saved page (cascade) and carry a `delete_after`.
4. No new part type exists without `parent_id`, `default_action`, `is_part`, `kind = 'component'`.
5. No two active part types share the same `name`.
6. D5.1's row is named "Brake pads" and still owns 8 parts and 57 confirmed fittings.
7. D5.2 leaves `code = 'oil'` exactly as it was and leaves exactly one active type called "Engine oil".
8. D5.3 leaves at most one active cabin-filter type, and the HVAC `cabin_filter` row is still active.
9. Server code never `select("*")` on the two new tables.

### D9. What is still never stored

The uploaded file, its page text beyond the kept row lines, any price, and any page that stopped before its rows were
proven.

---

## 3. Server

All in `supabase/functions/_fleet-server/`. New file: `saved_page_suggest.ts` (grouping and naming). Changed:
`saved_page_proof.ts`, `research_saved_page_routes.ts`, `part_pictures_queue.ts`, `parts_catalog_read.ts`.

### R1. Read the page's own name, number, dates and place for every unknown row

This is the heart of the plan, and it is one change. In `proveRows`, a row the AI calls `other` (or names something
Roam doesn't have) keeps its **type as unknown**, but goes through **the same checks a known row goes through**:

- the accepted group row (above the row, same table, no dates of its own),
- P1 the number written on its own line (and not on the group row),
- P2 the dates written on its own line — one range, or the row is held with the same reason a known row gets,
- place: the front/rear and left/right words, taken only when the page itself says them (the same word check; a row
  whose page says no place gets `place = null`, not a hold — a later non-positional type is fine with that),
- P5 both reads agree,
- P6 the note doesn't name another car.

Only **P4** (the part type's own words) has nothing to check against yet, so it is the one thing that waits. The
route then stores, for that row: the **page's own part name** (the group row, e.g. `17881 - HOSE, AIR CLEANER, NO.1`),
the **number**, the **dates**, the **place**, and the lines that prove them (D1).

Cost: no extra AI call, no second read — the same two reads, read properly.

### R2. Group the unknown rows into suggestions (`saved_page_suggest.ts`)

For each unknown, proved row:

1. **Existing types first, then fixings, then a new type.** In this order:
   - If one of Roam's active part types already covers the row (its words are on the row's group line **and** it
     shares the row's head noun, see 3 below) → `kind: "existing"`.
   - Else if the name is **only** hardware words — `BOLT`, `NUT`, `SCREW`, `STUD`, `WASHER`, `PIN`, `RIVET`, `CLIP`,
     `CLAMP`, `BAND`, `RETAINER`, `GROMMET` → `kind: "fixings"`. Never suggested, never saved, listed with a count.
   - Else → `kind: "new"`.
2. **One suggestion per group row.** The key is the group row's words with the leading callout code removed
   (`17881 - HOSE, AIR CLEANER, NO.1` → `HOSE, AIR CLEANER, NO.1`). Rows that share a group row become one
   suggestion. On the air-cleaner page the three `INLET, AIR CLEANER, NO.1` rows (two numbers, one of them on two
   rows with two different periods) become **one** suggestion.
3. **Duplicate check against the whole database.** Compare the suggested name's **head noun** (its last word — the
   thing itself: `inlet`, `hose`, `spring`, `clamp`) with the head noun of every active part type, and require **every
   meaningful word of the shorter name, beyond the head noun, to appear in the longer one**. Same head noun + those
   words all present → `kind: "existing"`, and the card offers to save under that type instead of making a second one.
   This is what stops "Air intake hose" becoming a twin of an existing hose type (PT-04). Head nouns differ
   (`air cleaner hose` vs `brake hose`) → a new type. Words that only place a name in the catalogue (`for`, `of`,
   `with`, `ASSY`, a trailing `NO.n`) are not part words, so "Damper for mode servo" is **not** "Damper for airmix
   servo" (revised 26 Nov, fix round S1c in [part-type-auto-sort-audit.md](./part-type-auto-sort-audit.md) AS-31; the
   old "at least one shared word" rule matched on `for` alone).
4. **Plain name.** Split the group row on `,`, drop catalogue filler (`S/A`, `ASSY`, `SUB-ASSY`, `SET`), order it
   head-last, sentence case: `INLET, AIR CLEANER, NO.1` → **Air cleaner inlet**; `HOSE, AIR CLEANER, NO.1` →
   **Air cleaner hose**; `PIPE, VENTILATION` → **Ventilation pipe**. The trailing `NO.n` is dropped — unless the page
   also has another `NO.` of the same thing, and then it is kept: "Air cleaner hose no. 1" / "no. 2", because they are
   different parts.
5. **Suggested group.** First match wins, checked in this order, so a real group beats a generic word:

   | # | Words in the name | Group |
   |---|---|---|
   | 1 | filter, element | Filters |
   | 2 | pad, rotor, disc, caliper, drum, shoe, brake | Brakes |
   | 3 | muffler, catalyst, catalytic, oxygen, o2, exhaust, dpf, egr, nox, resonator | Exhaust & emissions |
   | 4 | spring, shock, absorber, strut, arm, ball joint, tie rod, link, bar, bush, bushing, bump stop, hub, bearing, knuckle, steering | Suspension & steering |
   | 5 | clamp, hose, pipe, duct, tube, belt, pulley, tensioner | Belts & hoses |
   | 6 | lamp, light, bulb, lens, mirror, wiper, blade, washer | Lighting & visibility |
   | 7 | compressor, condenser, evaporator, blower, heater, air con, a/c, refrigerant | HVAC |
   | 8 | battery, alternator, starter, sensor, switch, relay, fuse, wire, harness, horn, motor | Battery & electrical |
   | 9 | clutch, gear, gearbox, transmission, cv, driveshaft, axle, differential, converter | Transmission |
   | 10 | inverter, charging, hv, traction | Hybrid & electric |
   | 11 | oil, coolant, fluid, grease | Fluids |
   | 12 | tyre, tire, wheel, rim, valve stem | Tires & wheels |
   | 13 | anything else | Engine |

   `VENTILATION PIPE` → Belts & hoses. `AIR CLEANER INLET` → Engine (no list word). `EXHAUST PIPE` → Exhaust & emissions
   (row 3 before row 5). Every suggestion gets a group; the owner can change it on the card before pressing Add.
6. **Position scheme.** No front/rear words on the rows → `none`. Front/rear → `axle`. Front/rear **and**
   left/right → `axle_left_right`. Never asked on screen.
7. **At most 20 suggestions** per upload. Any beyond that are counted in one line ("7 more rows Roam doesn't know").

### R3. The result the screen reads

`result.rows[]` as D1, `result.suggestions[]` as D2, and `result.counts` still the four groups. `otherTypes` stays
for old results, and is now the list of suggestion names rather than `["other"]`.

The screen never works anything out: the name, the group, the rows covered and the state all come from the server.

### R4. A row with no dates is still held (SP-42, unchanged)

Rev 1 of this plan proposed saving a dateless row for the car's whole build. **That was wrong and is dropped.** Both
real pages give every part row a period (§1.4), so the case does not arise on the owner's pages, and SP-42 stays
exactly as it is: a row whose line shows no dates is held with "No dates shown on the page", and the owner settles it
in the browser check. The reasons behind SP-42 still hold — a dateless row can't be proven, and two dateless numbers
for one place would both be saved for every year.

The rest of that rule is untouched too: more than one different date range on a row → held ("This row shows more than
one set of dates"); dates wholly outside the build → dropped as not this car.

### R5. `POST /admin/catalog-research/saved-pages/:id/part-type` (owner only)

Body: `{ key, action: "add" | "dismiss", name?, groupId? }`.

**Checks, in order, each with its own plain answer:**

| Check | Answer |
|---|---|
| caller is the owner (`isOwnerUser`) | 403 "Only the owner can add a part type" |
| the upload exists and is `done` | 404 "That upload isn't ready" |
| the suggestion exists and is `open` | answers the page unchanged (pressing twice changes nothing) |
| `name` (if sent) is 3–60 characters | 400 "Give the part type a name" |
| `groupId` (if sent) is one of the 13 groups | 400 "Choose a part group" |
| the suggestion isn't `kind: "fixings"` | 400 "Fixings aren't parts Roam tracks" |

**What Add does:**

1. **Group and name.** From the screen, else the suggestion's own.
2. **Duplicate.** Re-check by name and by head noun against the live types. If a type already covers it, use **that**
   type and create nothing.
3. **Create the type** by calling the same function the Part types screen uses (`upsert_self_serve_part_type`) with
   `areaId` = the chosen group, the name, an op code made from the name (`AIR_CLEANER_INLET`, then `_2`, `_3` if
   taken), `defaultFitMode: "specific"`, the suggestion's position scheme, `status: "active"`. Nothing new is invented:
   the function already fills `plain_name`, `code`, `is_part`, `kind` and `default_action`.
4. **Write the synonym** (D7) with the page's phrase.
5. **Prove the rows again**, in code, for the one check that waited: **P4** with the new type's words. If the new
   type is position-aware and the row has no place, the row is held with the same reason a known row gets ("The page
   doesn't say front or rear on that row"). The rows already passed P1, P2, P5 and P6 at upload.
6. **Already on file / conflict**, the same two checks the upload does, run again for the new type: the same number
   already confirmed for this car and place → "Already on file"; a different confirmed number overlapping the same
   years → held with "Roam already has {number} for these years". Nothing is overwritten (PT-18).
7. **Save** each axle group through `research_saved_page_job` → `answersGate` → `savePartAnswers`, with **the dates
   kept from the page** (R1). One evidence read per save, the same `saved_page_id`, the kept lines as `block_text`.
8. **Queue pictures** from the drawings kept in D4 (R7).
9. **Update the result**: those rows move from `not_roam_type` to `saved` (or stay `held` with a reason), their
   `partType` becomes the new type's name, `counts` is recounted, and the suggestion becomes
   `status: "added"` with `typeId` and `typeName`.
10. **Answer** the whole page, as `GET saved-pages/:id` does, so the screen redraws from one reply.

**Failure part-way** (the type exists but the save failed): the suggestion stays `open` but carries
`typeId` and `reason`, so pressing Add again **continues from that type** — it does not create a second one.

### R6. What Dismiss does

Insert the phrase into `part_type_suggestion_dismissal` (D3), mark the suggestion `dismissed`, and answer the page.
Its rows stay in the "Roam doesn't know" group but the suggestion is gone. Owner only, same route.

### R7. Pictures for parts added later (`part_pictures_queue.ts`)

`queuePartPictures` changes from "read the drawings out of the file" to "take the drawings as an argument":

- At upload, the drawings are read once, stored in D4 (up to 3), and passed in.
- At Add, the drawings are loaded from D4 for that `saved_page_id` and passed in.
- Everything else stays: the interchange group, the group's template (off → nothing), a picture that already exists
  (skip), one label from the group row, up to 3 drawings, a private key, 30 days.
- No drawings stored (an `.html` upload, or R2 not set) → the row is `noDiagram` and the result says so. Parts still
  save.

### R8. The AI must be shown every part type

Today the database read stops at 200 rows and the prompt keeps the first **120 names** — silently. With 86 live and
17 seeded that is 103, and the next uploads push it over. **Fix:** send every active type (no slice), raise the read
to 500, and write one server log line when the list is at its limit.

### R9. Fleet finds the new types

`readPartTerm` adds the synonyms (it already matches `part_term_synonym.term` with `ilike`). Nothing else changes:
the type's own name matches, the page's phrase matches through the new synonym row, and the fittings appear because
they were saved.

### R10. Tests to add (server, deno, fake AI)

One test each for R1–R9 on made-up pages: the suggestion grouping, the plain name, the group guess, the duplicate
match, fixings, the dismiss, add-then-save, add-twice, add-when-a-save-fails, the dates kept from the page (including
one number on two periods), a truly dateless row still held, the 20-suggestion cap, the AI list not truncating, and
pictures queued from the stored drawings.

---

## 4. Screens (Dominion only)

Two screens change. Roam Fleet changes nothing.

House rules as always: primary button = dark fill; secondary = white with a visible border; destructive = white with
red text and a red border; every action a real button at least 44 px; in-app only, never a browser pop-up; touch
targets on the 8 px grid; names wrap, never cut off.

### S1. Saved-page result — the "Not a Roam part type" group becomes a working list

Where: [`SavedPageOverlay.tsx`](../apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx), the result
step (screens 6, 7, 10 in the Stitch set). The group keeps its place at the bottom, and stops being collapsed-and-dead.

**The group's summary line** (collapsed):

> **Parts Roam doesn't know yet · 8 rows**
> Air cleaner inlet, Air cleaner hose, Ventilation pipe, Air cleaner cap · 2 fixings

The four top pills stay exactly as they are.

**Each suggestion is a card** (open by default; the whole group can still be folded):

| Part | Must show |
|---|---|
| Name | The suggested plain name, as an editable text box (max 60 characters) |
| Page's own words | `INLET, AIR CLEANER, NO.1` in small grey text under the name |
| Group | A picker of the 13 part groups, pre-set to the suggestion. Groups whose picture template is off (Fluids, Tires & wheels) say **"no picture"** after the name |
| Rows it covers | "3 rows · 17751-B1031, 17751-B1070" — the numbers as the page writes them, in mono |
| Periods it covers | The dates kept from the page, e.g. "11.2016 – 12.2019 and 01.2020 – 09.2020" |
| Primary button | **Add part type** |
| Secondary button | **Not a part we track** |

**Every state of a card:**

| State | What it looks like |
|---|---|
| Ready | As above. Both buttons live. |
| Adding | The button reads **Adding…** with a spinner; name and group pickers are locked; the other cards stay usable. |
| Added | A green pill **Added**, the line **"3 parts saved · pictures being made"** (or "no picture for this group"), the name as plain text, no buttons. The row's pills at the top recount. |
| Added, parts held | An amber pill **Added, needs you**, the server's reason on the row, and **Check this part** on each held row, exactly as the "Needs you" group does today. |
| Failed | The server's plain reason in the card, and the button reads **Try again**. Nothing is lost: name and group stay as typed. |
| Dismissed | The card disappears; the rows stay listed under the group with no button. |
| Existing match | The card says **"Roam already has this: Hose clamp"** and the primary button reads **Save under Hose clamp**. No type is created. |
| Fixings | Not a card. One line under the cards: **"2 fixings (hose clip, hose clamp) — Roam doesn't track these"**, with no buttons. |

**Owner-only:** **Add part type** and **Not a part we track** are owner-only, the same rule as the Part types screen.
A support or analyst login sees the cards, both buttons disabled, with **"Only the owner can add a part type"**.

**Also on this screen, unchanged:** the count pills, the pictures line, **See pictures**, **Done**, the four result
groups above, the phone bottom sheet.

**Empty and error:** a page where every row is known → no group at all (as today). A page where every unknown row is
a fixing → the group shows the fixings line only, no cards. The Add request failing → the card's own failed state; the
rest of the result stays.

### S2. Part types screen — the group picker and the hidden list

Where: [`PartTypesSettings.tsx`](../apps/admin/src/components/admin/parts-database/add-parts/part-types/PartTypesSettings.tsx)
(Add parts → Part types, owner only).

| Change | Must show |
|---|---|
| **Create part type** gains a **Part group** picker (the 13 groups, required, no default) | The form cannot be published without one; the server refuses too. Fixes "everything lands in Engine". |
| New section **Hidden from saved pages** under the requests queue | One row per dismissal: the page's words, the group, who and when, and **Suggest again** (owner). Empty: "Nothing hidden." Loading: two grey placeholder rows. Error: one plain line and **Try again**. |

### S3. What does not change

The Coverage tab and its "Saved pages read" card; the upload overlay; the reading screen; the stop cards; the
browser check drawer; the job panel; the Part pictures page; every Roam Fleet screen.

### 4c. Review round 2 — Stitch screens vs plan (Keep / Drop / Add)

Checked 26 Nov by Claude. All 10 screens in [stitch/part-type-learning/dominion/](./stitch/part-type-learning/dominion/).

**Rule for every screen:** the Dominion frame stays exactly as live (sidebar items, top bar, user). Drop Stitch's "v2.8.4 · Prod Cluster" sidebar box, every system-sounding label or chip (below), and every invented page behind the overlay. The result overlay keeps its live look (S1 of the saved-page plan): title, pills, pictures line, groups with sentence-case headings and a count, footer See pictures + Done.

| Screen | Keep | Drop | Add |
|---|---|---|---|
| 1 Suggestions ready | Card layout: Name box, page's words in small grey mono under it, Part group dropdown with its group icon, tint rows panel (count · numbers, dates under), Not a part we track (secondary) left, Add part type (primary) right; the "Parts Roam doesn't know yet · 8" heading + its line. | — | The fixings line and footer (cut off). |
| 2 Card states | Added card (name as text + group chip, "3 parts saved · pictures being made", no buttons); Adding card (inputs locked, button "Adding…" with spinner); Couldn't add card (red line + Try again, name and group kept); edited card. | Title "Nothing new to save" with Saved 3 (→ "3 parts saved", green tick, per the live title rule); "Active Ref" pill (→ "Already on file"); upper-case "ALREADY ON FILE (1)" (→ sentence-case heading like Screen 1); "PART TYPE NAME" / "(EDITED)" labels and "•Modifying" (→ plain "Name" label, no edited marker); the invented catalogue table behind. | — |
| 3 Already has the type + needs you | "Roam already has this: Coil spring" info strip; the page's words. | Invented already-on-file rows "Front Shock Absorber 48510-B1300" and "Stabilizer Bushing 48815-B1010" (not on the owner's page); "SOURCE LABEL:" (→ the page's words in small grey mono, as Screen 1); the cut-off bottom. | The rest from the prompt: rows panel, "Save under Coil spring" + Not a part we track, and the "Added, needs you" card with its held row and Check this part. Note: "Coil spring" exists only after the §7 seed. |
| 4 Staff view | Name and group locked, both buttons disabled, one line "Only the owner can add a part type". | Invented user "Alex Wong" (→ the live top bar's staff user); "Matched with Dominion Master", "Awaiting catalog inclusion", the per-number dates line under the page's words (→ the rows panel as Screen 1); grey "Already on file" pill styling differences (→ live pills); the invented page behind ("SYNC-STATE: COMPLETE", "Exploded Assembly"). | — |
| 5 Fixings only | Saved group + the fixings line with the bolt icon, no cards. | "Verified Schema"; upper-case group labels (→ sentence case); the invented page behind. | — |
| 6 Phone | Bottom sheet, cards stacked full width, Add part type on top, Not a part we track under, fixings line, Done + See pictures full width. | The redrawn phone header ("Catalogue Explorer", "VERIFIED"), the bottom tab bar (Catalogue / Lookup / Audit / Settings), "ACTIVE SCHEMATIC" / "SCHEMATIC CANVAS" behind (→ today's phone frame, the car page behind). | — |
| 7 Create part type | Name, required Part group picker with group icons and "no picture" on Fluids and Tires & wheels, plain name, position dropdown, the one-line note, Cancel (danger) + Create part type. | "REGISTRY SPEC V2 · Schema ID #PRT-8820", "AUTHORIZER LEVEL", "Configuring", "Master vehicle definition repository", "Canonical catalog name", "13 Classification Categories", "Colloquial / Mechanic alias", "Spatial orientation axis", "Group 09" / "SYS-09", "Inheritance policy … ISO-14229", the three cards at the bottom (Hierarchy lock, Visual taxonomy, Audit stream). | — |
| 8 Hidden list | The card, its line, rows with the page's words in mono, "Hidden by Deeki T · 26 Nov 2026", Suggest again (with a visible border). | "VEHICLE CATALOG GOVERNANCE · STRICT ENFORCEMENT"; "7 categories", "INDEXED" and the invented subtitle on the part-type list; the made-up "OEM-90201 / 90480 / 48832" chips; "Suppression list"; the info box + "View catalog audit log"; the whole right column (Part type schematic image, Auto-Extraction Rules, Security & permissions). | "Suggest again" keeps the house secondary border. |
| 9 Hidden empty | Eye icon, "Nothing hidden.", the one-line explanation. | "MASTER SYNC ACTIVE", "Catalog v4.2", "Active schemas & fleet reference classes", "0 items ignored", "Automatic filter rule…" chip, the Catalog Permissions card + "View Audit Trail". | — |
| 10 Hidden couldn't load | Red box: "Couldn't load the hidden list." + Try again. | The made-up error detail ("ERR_GATEWAY_TIMEOUT_504"), "MASTER CAT-09", "Synched", "Updated 4m ago", "Scoped to Roam Console", the access-control line, "Catalog audit log", "Export schema", the subsystem ping line. | — |

Plan fix found here: §4 S1's summary example says "1 fixing (hose clip)"; the air-cleaner page has **2** (clip 17875C, clamp 17881A). The screens use 2, and so does this plan from now on.

**Round 2 closed 26 Nov.** The plan is ready to build.

### 4b. The rules, in plain words

1. A part type always sits under a part group. It cannot be made without one.
2. Only the owner can add a part type, or say "not a part we track".
3. A part is saved with the dates written on the page. If a row really shows no dates, it is held — exactly as today.
4. A part type is made once. If Roam already has one that covers the part, that one is used and nothing is made.
5. Bolts, nuts, screws, washers, pins, rivets, clips and clamps are never made into part types — unless Roam already
   has a type for that exact thing (an exhaust clamp, a hose clamp).
6. The same upload pressed twice makes one part type, never two.
7. A phrase said "not a part we track" is never suggested again — on any page, for any car — until the owner brings
   it back from the Part types screen.
8. Nothing happens in the background. Pressing **Add part type** is the only thing that makes a type or saves a part.
9. No price, no whole page and no uploaded file is ever kept.
10. A part added this way gets a picture only if its group's pictures are on. If they are off, the card says so.
11. The owner can change the name and the group before pressing Add. Nothing else on the card can be edited.
12. A row that is held keeps the server's own reason, and **Check this part** still opens the normal browser check.

---

## 5. Problems found (numbered, one fix each)

| # | Problem | The fix |
|---|---|---|
| PT-01 | **The page's own name for a part is thrown away.** Unknown rows are stored as `partType: "other"`, so `17881 - HOSE, AIR CLEANER, NO.1` is gone after the upload and the file is not kept. | R1 + D1: read the page's own name for every unknown row and keep it on the row. Show it under the suggested name. |
| PT-02 | **An unknown row's number, dates and place are never read**, even though they are on the page. Counting the saved files: every part row carries a period — air-cleaner 9 of 9, shock page 32 of 32 — yet the stored result says `dates: null` on all 8 unknown air-cleaner rows. The row is dropped at the first check, so nothing is proven and nothing can be saved later. | R1: prove unknown rows with **the same checks as known rows** (number, dates, place words, two reads agree, fits this car), and only leave the type's-words check until the type exists. Cost: no extra AI call. |
| PT-03 | **Rev 1 of this plan got the dates wrong.** It said these rows have no dates and proposed saving them for the car's whole build. They do have dates: the air-cleaner inlet carries 11.2016 – 12.2019 on `17751-B1031` and `17751-B1070`, and 01.2020 – 09.2020 on `17751-B1070` again. That proposal would have thrown those periods away and changed a rule (SP-42) for no reason. | R4: **drop the "whole build" idea.** The page's own dates are kept and saved (R1), and a truly dateless row is still held exactly as SP-42 says. |
| PT-04 | **A suggested type can duplicate one Roam already has under another name** (e.g. an "Air intake hose" next to an existing hose type, or "Hose clamp" next to "Exhaust Clamp"). | R2.3: match by head noun plus every meaningful word of the shorter name against every active type; the card then offers **Save under** that type and creates nothing. Tightened 26 Nov (S1c, AS-31): one shared word is not enough ("for" matched "Damper for mode servo" to "Damper for airmix servo"). |
| PT-05 | **Bolts, nuts, clips and clamps are hardware, not parts**, but they arrive as unknown rows and would each become a part type. | R2.1: a fixings list (bolt, nut, screw, stud, washer, pin, rivet, clip, clamp, band, retainer, grommet). Never suggested, shown as one count line with no buttons. An existing type always wins first, so "Exhaust Clamp" and "Hose clamp" still work. |
| PT-06 | **The 23 rows on the shock page are not 23 hardware rows.** 18 of them carry `48xxx` front-suspension numbers — the page is the "Front spring & shock absorber" section — and they are real parts Roam has no type for: coil spring, spring seat/insulator, bump stop, strut mount, strut bearing, dust cover, sway-bar bush and bracket. (The saved-page audit already recorded "springs, mounts, covers, bushes and bump stops".) The other 5 rows are `90041-…` fixings. | Treat the 18 as suggestions, and seed the five most common (§7: coil spring, strut mount, stabilizer bar bush, ball joint, tie rod end). The shock page then shows only the few that remain. |
| PT-07 | **Every part type created today lands in Engine.** The form sends a hard-coded group id (`b1000000-…-0001` = Engine) and never asks. A brake hose made there sits under Engine and is drawn with Engine materials. | S2 + R5: a required part group picker on both the Part types form and the Add card; the server refuses a create without one of the 13 groups. |
| PT-08 | **A type in a group whose picture template is off never gets a picture** (Fluids, Tires & wheels are off). The owner would press Add and see nothing. | The group picker marks those two **"no picture"**, and the added state says "no picture for this group" instead of promising one. The templates stay off (PP-10). |
| PT-09 | **"Engine oil" exists twice** — the oil-change row under Engine (`ENG-OIL`) and the oil product under Fluids (`FLD-ENG-OIL`). Rev 1 proposed `is_part = false` on the Engine one. **That was wrong:** in Roam Fleet `is_part = false` means "a service job, labour only" (`isServiceJob`), so an oil change would switch to the labour-only form, and the Engine row's 2 parts would no longer be saveable as parts. | D5.2: **rename the Fluids product** to **"Engine oil (top-up)"**. The oil-change row `ENG-OIL` is not touched at all — same name, same `is_part = true`, same 2 parts, same 2 fittings, same logging. The Fluids row is the "buy or top up the oil itself" product, which is what its own description and its `top_up` action already say. One "Engine oil" remains, so a page's oil row resolves to one type. |
| PT-10 | **Two types for the cabin filter**: "Cabin Air Filter" under Filters (`FILT-CAF`) and "Cabin A/C Filter" under HVAC (`cabin_filter`). | D5.3: draft the **Filters** copy (it has no parts, fittings, jobs or spec fields), so the AI and the owner see one cabin filter. The HVAC row is the one the Fleet synonyms and the 10,000 km maintenance rule point at, and it stays active. |
| PT-11 | **The most used part type can never match a page.** "Brakes" (plain name "Brake pads", 57 confirmed fittings — more than any other type) has no "pad" word, so a "PAD KIT, DISC BRAKE" row is held. | D5.1: rename it to **Brake pads**. The code `brakes` and every fitting stay as they are. |
| PT-12 | **The AI is shown only the first 120 part type names** out of 200 read, silently — and 86 + 17 seeds is close. | R8: send every active type, read up to 500, and log when the limit is hit. |
| PT-13 | **Moved to §8.** Rev 1 proposed `is_part = false` on the 13 group rows so the count would read 86 instead of 99. Checked against every reader of `is_part`: it **breaks the parts browser** — `shapeBrowse` builds the whole group list from rows whose `is_part` is not false, so all 13 groups would disappear for Dominion and Fleet. It is not done. | No change. The real part-type count is still 86; the record of why is in §8. |
| PT-14 | **69 of 86 part types have no parts at all**, and the common parts a fleet looks up are missing: no coil spring, no radiator hose, no ball joint, no tie rod end, no clutch, no headlight unit. | §7: seed 17 of them now; the rest arrive from uploads. |
| PT-15 | **"Not a part we track" would be permanent** — a mistake could never be undone. | D3 + S2: the hidden list on the Part types screen, with **Suggest again**. |
| PT-16 | **A part added after the upload can't get a picture**: the file is never stored, so no drawing is left. | D4 + R7: keep up to 3 drawings privately for 30 days per upload, and queue the picture from them. |
| PT-17 | **Fleet would not find the new types by the words on the page.** The synonym list already sends "air cleaner" to the air filter, so a person looking for the inlet finds the filter. | D7 + R9: write the page's own phrase as a synonym for every new type. The existing "air cleaner → Air filter" entry stays, because that is what most people mean by it. |
| PT-18 | **Adding a type could save a number that is already on file under another type**, making a twin fitting. | R5 step 6: run the same already-on-file and "Roam already has {number} for these years" checks again, for the new type. |

---

## 6. Done-tests (written before building)

Every example uses the owner's own two pages. No made-up part numbers.

1. **The whole feature, on the air-cleaner page.** Upload it → the "Parts Roam doesn't know yet" group shows **4** new
   part types: Air cleaner inlet (3 rows, numbers `17751-B1031` and `17751-B1070`, periods 11.2016 – 12.2019 and
   01.2020 – 09.2020), Air cleaner hose (`17881-B1130`), Ventilation pipe (`12229-B1010`), Air cleaner cap
   (`17705-B1100`). The air filter is still "Already on file". The two `90044-…` rows create no type: the hose clip
   counts as a fixing, and the hose clamp shows as **"Roam already has this: Hose clamp"**.
2. **Add part type.** Press it on Air cleaner inlet → the type exists under the suggested group, and the 3 rows are
   **saved** with the page's own periods: `17751-B1031` 11.2016 – 12.2019, `17751-B1070` 11.2016 – 12.2019 and
   `17751-B1070` 01.2020 – 09.2020 (the superseding number keeps both periods). The card turns to "Added · 3 parts
   saved", the pill "Not a Roam part type" drops from 8 to 5, and "Saved" goes to 3.
3. **Pictures straight away, no second upload.** Within 5 minutes those parts have pictures, made from the drawing
   kept from the same upload. The Part pictures page lists them under their group.
4. **All of them, then no cards left.** Add the other three, then press **Save under Hose clamp** → 6 numbers saved, no
   cards left, and the rows that were unknown are now in **Saved**.
5. **The picture line is honest.** A suggestion in Fluids or Tires & wheels (a made-up page, since both have their
   pictures off) → parts saved, the card says "no picture for this group", and no Gemini call is made.
6. **The dates come from the page, not from the car.** Every part saved in test 2 carries the period written beside it
   on the page. The two periods on `17751-B1070` are kept as two fittings, and neither is widened to the car's build.
7. **A row that really shows no dates is still held**, with "No dates shown on the page" (SP-42, unchanged). Build a
   made-up row with no period → held, and **Check this part** offers it in the browser check.
8. **Change the name first.** Edit "Air cleaner inlet" to "Air cleaner intake" → the type is created with that name,
   and Fleet finds it by that name.
9. **Change the group first.** Move a suggestion to another group → the type is created in that group, and
   `part_picture.catalog_group_id` is that group.
10. **The page's own words are kept.** The card shows `INLET, AIR CLEANER, NO.1` small under the name, and after the
    save the row shows the type's name, not `other`.
11. **The duplicate case.** A suggestion whose name matches a type Roam has shows **"Roam already has this: …"** and
    **Save under …**; no second type is created (count of active types unchanged).
12. **Fixings stay out.** A page of bolts, nuts and clips → no suggestions, one line "N fixings", no buttons, nothing
    written to the parts database.
13. **"Not a part we track" sticks.** Press it → the card disappears, that phrase is never suggested again on any
    page, and Part types → Hidden from saved pages lists it. **Suggest again** brings it back.
14. **Pressing Add twice makes one type.** Second press answers the same page, and the type count is unchanged.
15. **A failed save can be finished.** Make the save fail → the card shows the reason and **Try again**; pressing it
    saves the parts under the type that already exists, and no second type is made.
16. **A different number already on file** for that car, type and place → held with "Roam already has {number} for
    these years"; nothing is overwritten.
17. **The shock page.** Upload it → suggestions for coil spring, spring seat/insulator, bump stop, strut mount, strut
    bearing, dust cover, sway-bar bush and bracket; the `90041-…` rows are counted as fixings, not suggested. The four
    shock rows still save with their split periods (11.2016 – 11.2018 and 11.2018 – 09.2020).
18. **Seeded types are found, not suggested.** After the seed, an upload naming a radiator hose, a ball joint or a
    coil spring saves them under the seeded types with no suggestion at all.
19. **Brake pads save from a page.** A page with a "PAD KIT, DISC BRAKE" row → saved under **Brake pads** (test for
    PT-11).
20. **Every part type has a group.** Part types → Create part type cannot be published without a group, and no active
    type in the database has a null group.
21. **Fleet finds the new type.** In Roam Fleet, typing the part's name and typing the page's own phrase both find the
    newly added type for that car, with its fittings.
22. **Only the owner can add.** A support login sees the cards with both buttons disabled and "Only the owner can add
    a part type"; a direct request is refused.
23. **Nothing from the file is kept that shouldn't be.** The result holds no price, no whole page, and at most 300
    characters per kept line; the drawings are private, listed with a delete date, and gone after 30 days.
24. **The three clean-ups changed nothing but their own column.** After D5.1, D5.2 and D5.3: the brake type still owns
    8 parts and 57 fittings; `ENG-OIL` still owns its 2 parts and 2 fittings and is still a part type; the HVAC
    `cabin_filter` row is still active and still drives its 10,000 km rule; active part types are 85; and one save
    from a page resolves "Engine oil" to exactly one type.
25. **The old things still pass.** Every existing saved-page deno test, the Playwright steps in
    [dominion-saved-page-parts.spec.ts](../e2e/dominion-saved-page-parts.spec.ts), the overlay picture tests and the
    part-picture tests keep passing; the new buttons get their own click-through in the same spec.

---

## 7. Parts database coverage — what a fleet looks up that Roam has no type for

86 active part types, 69 with no parts. Below, per part group, are the everyday parts a fleet would search for that
have **no type yet**. "Seed" = build the type now in this plan; "upload" = let the saved pages add it.

| Part group | Common parts with no type yet | Seed now? |
|---|---|---|
| **Engine** (20 types) | Air cleaner housing · Air cleaner inlet · Air intake/ventilation pipe · Engine mount · Mass air flow sensor · Fuel pump · Turbocharger · Camshaft/crankshaft seal · Timing belt tensioner · Ignition lead set (only "Spark Plug Wires" exists) | **Yes:** air cleaner housing, air cleaner inlet, ventilation pipe, engine mount, mass air flow sensor. The rest: upload |
| **Belts & hoses** (1 type — only the drive belt) | Radiator hose (upper/lower) · Heater hose · Air cleaner hose · Hose clamp · Drive belt tensioner · Idler pulley · Power steering hose · Intercooler hose · Vacuum hose | **Yes:** air cleaner hose, radiator hose, heater hose, hose clamp, drive belt tensioner. The rest: upload |
| **Suspension & steering** (7 types — no spring, no arm, no joint) | Coil spring · Strut mount · Strut bearing · Bump stop · Spring seat/insulator · Control arm · Ball joint · Tie rod end · Inner tie rod · Stabilizer bar bush · Stabilizer bar bracket · Wheel hub · Steering rack · Dust cover | **Yes:** coil spring, strut mount, stabilizer bar bush, ball joint, tie rod end. The rest: upload (the shock page shows six of them) |
| **Brakes** (11 types) | Brake pad fitting kit/shims · Brake booster · Brake line/pipe · Load-sensing valve · Caliper repair kit · Park brake shoe (only "Brake shoes") | **Yes:** none — brakes are the best-covered group. Upload |
| **Filters** (4 types) | Transmission filter · Air/oil separator | Upload |
| **Transmission** (1 type — fluid only) | Clutch kit · Clutch slave cylinder · CV boot · CV joint · Driveshaft · Gearbox mount · Shift cable · Transmission filter · Differential/gear oil | **Yes:** clutch kit. The rest: upload |
| **Battery & electrical** (3 types) | Crankshaft/camshaft position sensor · Fuse · Relay · Wiring harness · Horn · Window regulator · Wiper motor · Blower motor resistor · Ignition switch (the mass air flow sensor goes under Engine, where "Oxygen sensor" already sits) | Upload |
| **Lighting & visibility** (5 types — bulbs and wipers only) | Headlight assembly · Tail light assembly · Indicator assembly · Fog light assembly · Side mirror · Wiper arm · Washer pump · Washer nozzle | **Yes:** headlight assembly. The rest: upload |
| **HVAC** (2 types) | A/C compressor (the belt-driven one) · Condenser · Evaporator · Receiver drier · Expansion valve · Blower motor · Heater core · Heater control valve | **Yes:** blower motor. The rest: upload |
| **Exhaust & emissions** (17 types) | EGR valve · Secondary air pump · Exhaust bracket | Upload — the best-covered group |
| **Hybrid & electric** (10 types) | Nothing common missing | — |
| **Fluids** (3 types) | Power steering fluid · Grease · A/C refrigerant · Gear oil (Brake fluid lives under Brakes) | Upload — pictures are off for this group anyway |
| **Tires & wheels** (2 types) | Wheel (rim) · TPMS sensor · Hub cap · Wheel weight | Upload — pictures are off for this group |

**The 17 the plan seeds** (all in groups whose picture template is on):

| Part type | Group | Position scheme |
|---|---|---|
| Air cleaner housing | Engine | none |
| Air cleaner inlet | Engine | none |
| Ventilation pipe | Engine | none |
| Engine mount | Engine | axle_left_right |
| Mass air flow sensor | Engine | none |
| Air cleaner hose | Belts & hoses | none |
| Radiator hose | Belts & hoses | axle |
| Heater hose | Belts & hoses | none |
| Hose clamp | Belts & hoses | none |
| Drive belt tensioner | Belts & hoses | none |
| Coil spring | Suspension & steering | axle_left_right |
| Strut mount | Suspension & steering | axle_left_right |
| Stabilizer bar bush | Suspension & steering | axle |
| Ball joint | Suspension & steering | axle_left_right |
| Tie rod end | Suspension & steering | axle_left_right |
| Clutch kit | Transmission | none |
| Headlight assembly | Lighting & visibility | none |

Why these: every one is on the owner's two real pages **or** is one of the ten most-searched parts for a fleet, and
every one sits in a group whose picture template is on, so a picture follows. "Wheel nut" is deliberately **not**
seeded — a nut is a fixing (PT-05).

---

## 8. Out of scope

- **Setting `is_part = false` on the 13 part groups.** Rev 1 proposed it so the count would read 86 instead of 99.
  It changes behaviour, so it is out. What the readers do with a group row today:

  | Reader | What a group row does today | What would change if `is_part` were false |
  |---|---|---|
  | `parts_catalog_read.ts` `shapeBrowse` — Dominion's Add parts picker and Fleet's Find parts | keeps it: the whole part-group list is built from rows whose `is_part` is not false | **all 13 groups vanish** and every part type loses its group heading. Fatal |
  | `maintenance_jobs_admin_routes.ts`, the "add an item to a job" lookup (reads `id, status, is_part` with no kind filter, then answers "Part type was not found" when `is_part` is false) | a group row would be accepted as a part-type item | that request would start answering "Part type was not found" |
  | op-code uniqueness in the part-type functions (scoped to `is_part`) | the group op codes (`ENG`, `BRK`, …) are inside the scope | a later part type could take `ENG` as its op code |
  | `read_brakes_overview.ts` | not reached (filters the children of Brakes) | nothing |
  | `parts_sourcing_drain.ts` | not reached (only a job's own part type is read) | nothing |
  | `service_items_save.ts` | already refused (requires `kind = 'component'`) | nothing |
  | `maintenance_routes.ts` (service jobs, `isPartById`; and the write path `kind === 'component' && …`) | already not-a-part (guarded by `kind`) | nothing |
  | `maintenance_jobs_admin_helpers.ts` (`isPart: row.is_part === true`) | only ever shapes a component, because a job is always a component | nothing |

  Three of those are real behaviour changes, one of them fatal, so the flag stays as it is.
- **Teaching the Fleet parts browser to skip draft types.** D5.3 drafts the unused cabin-filter type; the browser
  still lists it (it filters on `is_part`, not on the draft flag). A one-line change there is its own small plan,
  because it changes what every Fleet user sees.
- Deleting, merging or renaming part types generally. This plan renames two (D5.1, D5.2) and drafts one (D5.3).
- Deciding a part type's size/spec fields. A new type starts with none; the Part types screen keeps that job.
- Letting non-owners add a part type. The existing requests queue stays exactly as it is.
- Reading PDFs, photos or pages Roam fetched itself.
- Turning the Fluids or Tires & wheels picture templates on.
- Repairing the fact that the Exhaust & emissions and Hybrid & electric groups reached production by paste and are in
  no migration (noted in the pictures plan, PP-32). The drafted cabin-filter row is the same situation; D5.3 is
  written so a replay is unaffected, but making the replay match production is still its own plan.

---

## 9. Build order

1. **Data:** D1–D9 (migration, two tables, the three clean-up statements, the 17 seeds, the SQL checks).
2. **Server:** R1–R9 with tests R10 — R1 first, so the existing saved-page route tests can be checked before anything
   else moves.
3. **Screens:** S1 and S2, plus the click-through test in `e2e/dominion-saved-page-parts.spec.ts`.
4. **Prove on a private copy** with both real pages, then the owner's real run: upload the air-cleaner page, press
   Add part type, look at the picture.

---

## 10. Review log

- **Rev 1 (26 Nov):** first draft.
- **Rev 2 (26 Nov):** review round 1 by Claude against the code, the live database and the two saved `.html` files.
  1. **R4 removed.** Counting the period cells in the two saved files shows every part row has one — air-cleaner 9 of
     9, shock page 32 of 32 — so a row is never dateless on these pages; it only looked that way because unknown rows
     are never read. R4 is now "a dateless row is still held (SP-42, unchanged)". PT-03 is rewritten, and PT-01/PT-02
     now share one fix: R1 reads the page's own name, number, dates and place for unknown rows and runs the same
     checks as known rows. §1.4 gained the real period table, and done-tests 1, 2, 4, 6, 7 and 17 were rewritten to
     the page's own periods.
  2. **PT-09 fix replaced.** `is_part = false` on the Engine engine-oil row would switch Fleet to its labour-only
     service form and orphan that row's 2 parts. The fix is now a rename of the **Fluids** product to "Engine oil
     (top-up)"; the oil-change row `ENG-OIL` is untouched, so Fleet logs oil changes exactly as today.
  3. **PT-13 removed to §8.** Checked every reader of `is_part`: `shapeBrowse` builds the whole part-group list from
     rows whose `is_part` is not false, so the 13 groups would vanish from the parts browser. The op-code uniqueness
     scope and one maintenance-job lookup would also change. Not done.
  4. **D5 rewritten** into three statements, each with its exact row, the columns it touches, counts before and after,
     and a check that no logged service, part, fitting or picture changes meaning. All three key on `code` so a
     replay is safe, and D5.3 is a no-op where the row doesn't exist (the Filters cabin-filter row is in production
     only).
