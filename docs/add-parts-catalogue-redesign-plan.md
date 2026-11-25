# Dominion → Add parts → "Parts from a catalogue page" — redesign plan

**Rev 1 · 24 Nov 2026** · App: Dominion (`apps/admin`) · Owner: platform staff who add parts
**Trigger:** the 19 Nov run adding Toyota Roomy oxygen sensors. The owner is not a mechanic, and future staff will have no AI to ask, so the screen itself must teach the job.

---

## 1. Goal

**Anyone can record parts from a catalogue page — the page, the cars it covers, and one row per part number — with no help, and the name, place and trust are right the first time.**

Who it is for: the platform owner and any future staff member with parts-catalogue write. They are office people, not mechanics. They are looking at somebody else's catalogue site (Partsouq, Amayama, Megazip, a part maker's own site) and copying numbers off it.

What it removes: the guesswork and the silent mistakes. Today a wrong answer on these four screens becomes a part that fits the wrong cars, carries the wrong place, or is named so vaguely that nobody can tell the front sensor from the rear one later.

---

## 2. Today

The flow is four steps plus a saved page, in `apps/admin/src/components/admin/parts-database/add-parts/catalog/`.

| Piece | Where | What it does |
|---|---|---|
| Entry card | [AddPartsHome.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/AddPartsHome.tsx) | "Parts from a catalogue page" → starts the flow |
| Step 1 — the page | [CatalogStep1Page.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep1Page.tsx) | Paste a link; shows site, trust, whose catalogue, genuine/aftermarket |
| Step 2 — the cars | [CatalogStep2Cars.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep2Cars.tsx) | Frame codes from the link pre-tick matching versions; search; sister cars |
| Step 3 — the parts | [CatalogStep3Parts.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep3Parts.tsx) | One row per part number: type, number, place, years |
| Step 4a — trust | [CatalogStep4Trust.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep4Trust.tsx) | Verified / Needs checking per car, with reasons |
| Step 4b — check and save | [CatalogStep4Save.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep4Save.tsx) | Card per part, cars under it, save |
| Saved | [CatalogSaved.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogSaved.tsx) | What next; undo |

Server and data behind it:

- `GET /admin/catalog/parts/add/link-hints` → [catalog_routes.ts](../../supabase/functions/_fleet-server/catalog_routes.ts) → `self_serve_link_hints` ([20261119155611](../../supabase/migrations/20261119155611_add_parts_link_maker_regional_paths.sql)). Returns host, `trustedSite`, `catalogMaker`, `frameCodes`, `sourceTrust` — **trust is worked out from the URL and the maker found in it**.
- `POST /admin/catalog/parts/add/catalog-page` → `save_self_serve_catalog_page` ([20261108003859](../../supabase/migrations/20261108003859_add_parts_catalog_page_batch.sql)) → one `save_self_serve_part_in_batch` per row.
- Names come from `self_serve_default_part_name`; places from `part_norm_position`; per-car trust on `part_listing`; the trusted list is `trusted_source`.

**Checked against production on 24 Nov:**

- The Oxygen sensor part type is `ENG-O2`, scheme `before_after_catalyst`.
- The 19 Nov run **did** save correctly at the database: batch `AP-9299FD0E`, 2 parts ("Front oxygen sensor" `89467-B1040`, "Rear oxygen sensor" `89465-B1120`), 8 fits, places `before_cat` / `after_cat`, all `confirmed`. The plain `Front/Rear` naming and the "catalyst parts can be saved on specific cars" rule landed on 19 Nov in [20261119164659](../../supabase/migrations/20261119164659_add_parts_catalyst_place_on_specific_cars.sql).
- `trusted_source` has 15 rows: partsouq.com, megazip.net and amayama.com trusted for Toyota / Daihatsu / Lexus; part makers Brembo, NiBK, Masuma, SB Nagamochi, Blue Print; **7zap.com and rockauto.com are reference only and never confirm**.

So what is wrong now is almost entirely the **screens**: the flow asks the right questions in the wrong order, hides the answers, and shows one thing while saving another.

### What the run showed, and what is true in the code today

| Complaint (19 Nov) | Today |
|---|---|
| Picking the car maker did not re-check trust | **Still true.** The maker click only sets a draft value ([CatalogStep1Page.tsx:207](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep1Page.tsx#L207)); trust was worked out once from the URL. |
| "Add this site to trusted sources" leaves the page and loses what was typed | **Still true.** It sets `window.location.search` ([CatalogStep1Page.tsx:257](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep1Page.tsx#L257)), a full page load; the draft is React state only. |
| Every version of the frame code pre-ticked, including years and turbo cars the page does not cover; nothing says which years the page covers | **Still true.** The pre-tick adds every version whose chassis code matches ([CatalogStep2Cars.tsx:96-115](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep2Cars.tsx#L96)); no year input exists. |
| Part-type list looked empty (cut off by a scroll box) | **Still true, cause found.** The list is rendered inside the `overflow-x-auto` table wrapper ([CatalogStep3Parts.tsx:112](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep3Parts.tsx#L112), [CatalogPartTypeSelect.tsx:49](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogPartTypeSelect.tsx#L49)). Horizontal scroll makes the vertical axis clip too, so the list is cut to nothing. |
| "Before cat / After cat" jargon | **Partly fixed.** The save message now says "front (before the converter) / rear (after the converter)" and the chips read "Front (Air fuel ratio sensor)" / "Rear (Oxygen sensor No.2)" — Toyota's words, not plain ones. Still no plain "before converter" label on the buttons. |
| Nothing explains each part number needs its own row, type and place | **Still true.** The hint is one line; the place column can be left empty until the save refuses. |
| No guidance for finding the part numbers on the catalogue site | **Still true.** Only a "What does where on the car mean?" popover exists ([CatalogHelpBits.tsx](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogHelpBits.tsx)). |
| Two rows saved with the same name "oxygen sensor" | **Fixed in the database** (Front/Rear since 19 Nov), **not in the flow**: it still shows every name twice over three screens and sends no name, so the screen and the save can disagree. |
| Check page: two identical "Save all N parts" buttons | **Still true.** One in the header and one in the footer, both call the same save ([CatalogStep4Save.tsx:48,77](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep4Save.tsx#L48)). |
| Raw codes like "Before_cat" under part names | **Still true on one path.** The review card falls back to the raw code when the label lookup misses ([CatalogStep4Save.tsx:101-108](../../apps/admin/src/components/admin/parts-database/add-parts/catalog/CatalogStep4Save.tsx#L101)). |

---

## 3. Users and permissions

- **Who can open it:** any signed-in platform staff member with parts-catalogue write. The server checks it on both the link read and the save (`assertCatalogWrite`); a refuse must show "You don't have permission to add parts" and keep every row.
- **Who can change trusted sources:** the platform owner only. Everyone else sees "Ask the owner to trust this site". Adding a site is logged on the server (existing rule RE-21).
- **Whose data:** the parts catalogue and the trusted list are **platform-wide**, not per organisation. A part saved here is visible in every company's Find parts, in Fleet, Driver and Dominion. The screen must say so once, on the save page: "These parts go into the shared catalogue — every company sees them."
- **Nothing org-specific is read or written by this flow.**

---

## 4. Screens

Seven screens in Dominion. Nothing in another app changes. Styling keeps the existing `parts-database-stitch` tokens and `dominionKit` pieces; no new visual language.

### 4.1 Add parts home — **kept exactly as it is**

The three cards and Recently added stay. One copy change only: the catalogue card's description becomes "Several parts from one diagram, for the same cars. One save." → **"Add the parts a catalogue page shows, for the cars it lists. One save."**

### 4.2 Step 1 — "The page"

Purpose: get the link, and know what it is, without leaving the page.

| Element | Behaviour |
|---|---|
| Link box + **Paste** | As today. Reading starts on paste; a spinner line "Reading your link…" |
| Error line | "That doesn't look like a web link. Copy it from your browser's address bar." / "Could not read that link. Check it and try again." |
| **What we worked out** card | Rows: **Site** (name + trust pill), **Whose catalogue** (the maker), **Genuine or other brand**. Each has **Change** |
| **Maker picker** | **New: shown straight away when the link does not name a maker** — the six common makers plus "Other" with a text field. Picking one **re-checks trust in place** (`link-hints` again with that maker) and updates the Site row without a reload |
| Trust pill | **Verified** (site trusted for that maker) or **Needs checking** — with one line of why: "Partsouq is trusted for Toyota" / "This site is not on the trusted list" / "Reference sites never confirm a part" |
| **Genuine / another brand** | Two cards, as today ("The car maker (genuine)" / "Another brand"). Choosing "Another brand" asks for the brand (type-ahead over known brands, free text allowed) — **required** |
| **Trust this site** | **New: replaces the navigation.** Owner: opens an in-place dialog (below). Non-owner: a line "Ask the owner to trust <site> for <maker>" with no button that loses work |
| **How to find the part number** | **New: a link under the link box** that opens the guide panel (same panel as step 3) |
| **Next: the cars** | Disabled until a link is read. The button explains why when disabled: "Paste the page first" |

States: empty (only the link box and guide link); reading; unreadable link; link with no maker (picker shown); trusted; needs checking; non-owner; server refused the link read.

**Dialog — Trust this site** (owner only): shows the domain, the maker, the kind (car-maker catalogue / part maker / reference), and a plain line "Verified means we trust this site to confirm a part for <maker>." Buttons **Trust this site** (adds the trusted source, then re-reads the link and closes) and **Cancel**. On success the Site row turns Verified and **nothing typed is lost**.

### 4.3 Step 2 — "The cars"

Purpose: the cars this page's part numbers fit — no more, no fewer.

| Element | Behaviour |
|---|---|
| Frame codes found | Chips of the codes in the link ("M900A, M910A"), each removable with an ×; a line "These came from the link" |
| **Years this page covers** | **New, required for pre-ticking:** From and To (To has a "still made" tick that stores no end year). Hint: "The years printed next to the part on the page — e.g. 2016–2020." |
| Search box | Model or frame code, as today |
| Results | Grouped by model. Header: maker logo, model, **N versions**, catalogue years, a **Tick all** checkbox, and a **Show only the versions in these years** toggle (on by default) |
| Each version row | Model · catalogue years · engine/difference words · frame code · **turbo / engine label**. Unticked unless it matches the pre-tick rule |
| **Pre-tick rule** | **New:** a version is ticked only when its frame code matches the page codes **and** its catalogue years overlap the page years. Turbo versions outside the page years stay visible and unticked. Blank page years → **nothing** is ticked |
| Selected panel | Count; per car the years it will save with (**default: the page years**, not the catalogue's), removable; **Clear all** |
| **Add N sister cars** | As today (same platform, other badges), added with the page years |
| **Next: the parts** | Disabled until at least one car. Message: "Tick the cars this page is for." |

States: no frame code and no search (asks for a model); no results ("No version matches. Search by model instead."); years exclude every match ("None of the M900A versions were built 2016–2020 — check the years on the page."); many results (show the first 20 per model, "Show all N").

### 4.4 Step 3 — "The parts"

Purpose: one row per part number, each with its type and its place, and the name it will save as.

**The table goes.** One full-width card per part, at every width (the current table + a second mobile copy are merged into one card layout). No horizontal scrolling anywhere on this screen — that is what hid the type list.

| Element | Behaviour |
|---|---|
| Card header | "Part 1", **Remove** |
| **Part type** | Searchable picker: a text box plus the **full list in the page flow** (never floating, never clipped), showing "N types", with a **Popular** shortlist first (the types used most in the last 90 days) and icons. Search "oxygen" finds Oxygen sensor |
| **Part number** | Monospace, exact copy hint, "e.g. 89467-B1040". Under it: "Already on file — we'll add these cars to it" when the lookup finds it |
| **Place** | Buttons in plain words: **Front (before converter)** / **Rear (after converter)** for catalyst parts; Front / Rear for axle parts; corners for wheel parts; nothing when the type has no place. Second line under the buttons: "The catalogue calls these 'Air fuel ratio sensor' (front) and 'Oxygen sensor No.2' (rear)." Only for catalyst parts |
| **Years** | "Same as the cars", with **Change** that goes back to step 2 |
| **Saves as** | Live name preview, always including the place: "Front oxygen sensor". This is the exact name the save will use |
| **Add another part number** | Below the cards |
| **Paste several numbers** | Opens a textarea; each line becomes a card with **no type and no place yet** — the validation below forces them |
| **Can't find the type? Ask to add it** | As today |
| **Where to find the part number** | **New panel**, open by default the first time anyone uses the flow (remembered per user): 1. Open the page's diagram or parts list. 2. Find the part on the picture. 3. Copy the number exactly (letters and digits, e.g. `89467-B1040`). 4. Front and rear are different parts — add both, one row each. Plus a line: "Paste the numbers here. We will ask which is which on each row." |
| **Next: review** | Disabled until every card has a type, a number of at least 4 characters, and a place when the type has one. The message names the row: "Part 2 needs a type." / "Part 1 needs a place." |
| Duplicate numbers | **Blocked**: "Part 2 has the same number as part 1 (89467-B1040). Change one, or remove it." |

States: one empty card ready to fill; several cards; first time (guide open); a paste of five numbers (five cards, all needing type and place); type list loading (skeleton, "Loading types…"), type list failed ("Couldn't load the part types" + Try again), ask-for-type submitted.

### 4.5 Step 4a — "Trust for each car"

Kept as it is, with plain words only:

- Verified / Needs checking with the five reasons, per car and in bulk ("Mark many" → tick cars → set → apply).
- The green "All N cars are Verified" panel stays.
- "Changing years never changes trust." stays.
- The right-hand "Parts to be added" panel stays, with names that include the place.
- **No raw codes anywhere.** Every place reads through one shared label helper.
- **Next: check and save** disabled until every Needs-checking car has a reason.

States: all verified; some need checking (reason required); no cars (cannot happen — step 2 gates).

### 4.6 Step 4b — "Check and save"

| Element | Behaviour |
|---|---|
| Header | "Check and save" and the sentence "N parts × M cars = X fits" stays |
| **Open the page** | Same as today |
| **Save** | **One save action only, in the sticky footer:** "Save N parts to M cars". While saving it reads "Saving…" and is disabled |
| The shared-catalogue line | **New:** "These parts go into the shared catalogue — every company sees them." |
| Each part card | Type icon, name **with the place** ("Front oxygen sensor"), the number, "Genuine Toyota" / the brand, the place in plain words in one line ("Front — before the converter"), the cars with years and trust pills, "Already on file", "Also sold as" |
| Error box | "Nothing was saved. Your rows are still here." + **Try again** (kept) |
| Footer left | **Back to parts** only. The separate **Cancel** (which also went back) is removed |

States: ready; saving; saved error with rows intact; zero rows (cannot happen — step 3 gates).

### 4.7 Saved

Kept as today: the count heading, the list of saved names (with places), the three "What next?" cards, and **Undo save**. One addition: the saved names come from the save's own answer, so the page shows exactly what was written.

States: saved; undo running; undo failed (message stays).

---

## 5. Rules

1. **One row = one part number.** A part number has exactly one type and one place.
2. A place is required for every type that has one (catalyst, axle, wheel, driver/passenger, beams, front/rear/side). The server already refuses a catalyst part without a place; the screen must refuse it earlier, in plain words.
3. **The saved name is "<place> <type>"** — "Front oxygen sensor", "Rear oxygen sensor", "Front brake pad". Never the type alone when a place exists.
4. **Verified** only when the site is trusted for that maker (car-maker catalogue) or for that part maker. A **reference** site never confirms. Everything else is **Needs checking**, and Needs checking needs a reason.
5. **Years:** when the page's years are given, every selected car saves with those years — not the catalogue's production years. A version whose years do not overlap the page's years is never pre-ticked.
6. A page's part cannot be saved twice: the same number twice in one page is blocked; a number already on file adds cars to the existing part (as today).
7. **Brand:** genuine = the car maker. Another brand = the brand must be typed or picked; the app must never fill in "Toyota" by itself.
8. The trusted list is platform-wide, owner-only, and logged.
9. The whole page saves as one batch; **Undo removes the whole batch** (unchanged).
10. **No internal codes on screen, ever** — not `before_cat`, `after_cat`, `front`, `rear`, `axle_numbered`, and not `r2:` style ids. All labels come from one place-label helper.
11. Nothing typed is ever lost by a choice inside the flow (maker, trust, years, type).

---

## 6. Data

No new tables, no column changes, **no data migration**. Reuse what exists: `part_import_batch`, `part_master`, `part_listing`, `maintenance_service_categories`, `trusted_source`, `source_trust`, `part_norm_position`, `self_serve_default_part_name`.

| Change | Why |
|---|---|
| `self_serve_link_hints(p_url text, p_maker text default null)` | So picking the maker re-checks trust with that maker. With `p_maker` null the behaviour is exactly today's |
| `save_self_serve_catalog_page` returns `savedNames` (one per part, in input order) | The saved page and the review show what was written, not a guess |
| `save_self_serve_catalog_page` refuses two parts with the same number in one call | The screen blocks it; the server must too |

Existing rows are untouched: names, places and fits written on 19 Nov stay as they are.

---

## 7. Server

| Route | Change | Checks |
|---|---|---|
| `GET /admin/catalog/parts/add/link-hints?url=&maker=` | new optional `maker` | `requireAuth` + platform staff; URL must be `http(s)`; returns host, trust for that maker, maker, frame codes |
| `POST /admin/catalog-research/trusted-sites` (existing `researchApi.addSite`, [researchEngineService.ts:450](../../apps/admin/src/services/researchEngineService.ts#L450)) | reused by the in-place dialog | owner only, server-logged, maker and kind validated |
| `POST /admin/catalog/parts/add/catalog-page` | returns `savedNames`; refuses duplicate numbers | `assertCatalogWrite`; at least one car and one part; every part has type, number and place; the existing per-car trust rules |

Nothing reads or writes another organisation's data.

---

## 8. Edge cases

- **Link with no frame code** (a part number page, not a diagram): step 2 asks for the model; the flow still works.
- **Link names no maker:** the maker picker appears before trust can say Verified; picking re-checks.
- **Trusted site, but not for that maker** (e.g. Partsouq for Suzuki): Needs checking, reason "Site trusted for other makers".
- **Non-owner** wants the site trusted: sees the ask-the-owner line; the flow carries on as Needs checking.
- **Years blank:** nothing pre-ticked; the person ticks what the page lists; trust defaults to Needs checking.
- **Turbo / other engine outside the page years:** visible, unticked, labelled.
- **Front and rear numbers:** two cards, two names, two places; nothing is merged.
- **Same number twice:** blocked with the row numbers.
- **Part already on file:** adds cars to it; the review says so; undo removes only that save's fits.
- **Save fails** (network, permission, validation): one transaction, nothing saved, every row kept, the server's own message shown.
- **Two people saving at once:** each save is its own batch; undo removes only its own batch.
- **Long lists:** models with many versions show the first 20 and a "Show all N".
- **Phone width:** one column; the save bar is reachable without scrolling; the type list opens as a full-width sheet.
- **Screen readers:** each place button and car tick has its full label ("Front, before the converter").
- **Undo after 5 saves:** older saves are no longer undoable — say it on the row (existing rule).

---

## 9. Done tests

The work is done only when all of these pass.

1. Picking a maker after pasting a Toyota Partsouq link turns the trust row to **Verified** in place, with no page reload.
2. A link with no maker in it shows the maker picker immediately.
3. Trusting a site from step 1 keeps the pasted link, the maker and the typed answers, and the trust row becomes Verified.
4. A non-owner sees "Ask the owner to trust this site" and no navigation away from the flow.
5. With page years 2016–2020, only M900A versions built inside those years are ticked; a 2021–2022 version stays visible and unticked.
6. With no page years entered, nothing is pre-ticked.
7. Selected cars save with the page's years, not the catalogue's production years.
8. The part-type list opens fully visible on the parts screen (no clipped box) and lists every type, with a count.
9. Searching "oxygen" in the type list finds Oxygen sensor.
10. Catalyst place buttons read "Front (before converter)" and "Rear (after converter)", with the catalogue's words on a second line.
11. The "Saves as" name reads "Front oxygen sensor" / "Rear oxygen sensor" on step 3, the trust panel, the check page and the saved page.
12. Next is refused until every card has a type, a 4+ character number and a place; the message names the card.
13. A duplicate number is refused with both row numbers in the message.
14. The "Where to find the part number" guide is reachable from step 1 and step 3 and needs no other app.
15. The check page has exactly one save button; one click saves once (disabled and "Saving…" while it runs).
16. No screen in the flow shows a raw place code — screen text is checked for `before_cat`, `after_cat`, `_cat`, `axle_numbered` and none appears.
17. An "Another brand" part with no brand cannot be saved; picking NiBK saves brand NiBK; a genuine Toyota part saves Toyota without the brand field being asked.
18. A refused save keeps every card and shows the server's message; Try again saves once it is fixed.
19. The trust step will not continue while a Needs-checking car has no reason.
20. After saving, the saved page lists the names the server returned, and Undo removes both parts and all their fits.

Run them with `npx vitest run src/components/admin/parts-database/add-parts` from `apps/admin`, plus the existing Deno route test for the link-hints and catalog-page routes (`supabase/functions/_fleet-server/add_part_self_serve_routes.test.ts`).

---

## 10. Out of scope

- The other Add-parts flows (one part, add cars to a part, fluids, bulk upload). They share `defaultPartNamePreview` and the place chips; they must keep working unchanged.
- Fleet, Driver and Dominion's Log-service screens. The shared `@roam/types/partPositions` gains plain `shortLabel` values, but no screen outside this flow changes wording in this plan. (Fleet currently shows Toyota's names; adopting the plain ones there is its own change.)
- Copying the 427 existing Supabase files (R2 plan), reading years or numbers from the catalogue page automatically, browser side-checks, and trusted-site lookup recipes.
- Editing a saved part's name or place after the fact (Undo and re-add remains the way).
- Bulk import.

---

## 11. Findings

Each finding is something wrong found while reading the code or the live data, with the one fix chosen.

| # | Finding | Fix |
|---|---|---|
| **F-01** | Trust is worked out only from the URL. Picking the maker afterwards never re-checks it, so a trusted Toyota page saved as "Needs checking" under the wrong maker. | Add an optional `maker` to `link-hints` and re-check trust when the maker is picked. |
| **F-02** | "Add this site to trusted sources" is a full page navigation; the draft lives in React state, so the link and answers are lost. | Replace it with the in-place Trust dialog, and re-read the link after it succeeds. |
| **F-03** | Step 2 pre-ticks every version whose chassis code matches, including builds the page's years do not cover (turbo cars). | Ask for the page's years once; tick only matches inside those years; keep the rest visible and unticked. |
| **F-04** | Selected cars save with the catalogue's production years, not the years the page lists. | Default every selected car to the page years; the catalogue years are shown for context only. |
| **F-05** | The part-type list is opened inside the horizontally scrolling table wrapper, so the vertical overflow is clipped and the list looks empty. | One card per part, no horizontal scroll, and the type list opens in the page flow at full width. |
| **F-06** | The review card falls back to the raw position code ("Before_cat") when the label lookup misses. | One shared place-label helper used by every screen, with no code fallback; a test fails if any code appears. |
| **F-07** | The save names parts Front/Rear in the database (fixed 19 Nov), but the flow sends no name, so three screens preview a name the save does not take from them. | Send the visible name and show the server's returned `savedNames` on the saved page. |
| **F-08** | The check page has two identical save buttons, one in the header and one in the footer. | One save action, in the sticky footer only. |
| **F-09** | An "Another brand" part with no brand typed is saved with brand "Toyota" (the code falls back to it in three places). | Require a brand for another-brand parts; never default a brand. |
| **F-10** | Two rows with the same part number are only highlighted with a warning; Next and Save still go ahead. | Refuse Next and refuse the save, naming both rows. |
| **F-11** | Nothing on screen explains where to find a part number on a catalogue site, or that front and rear are separate rows. | Add the "Where to find the part number" guide (step 1 link, step 3 panel open on first use). |
| **F-12** | Place wording is inconsistent: chips say Toyota's names, the save message says "before the converter", and the buttons still imply "before/after cat" to a non-mechanic. | Plain label first — "Front (before converter)" / "Rear (after converter)" — with the catalogue's name on a second line. Production already uses the plain phrase in its refusal message; this matches it. |

---

## 12. Round 2 — Stitch screens: Keep / Fix / Drop

**Checked 24 Nov 2026.** Source: `C:\Users\deeki\Downloads\ui tester agent\stitch_dominion_parts_catalogue_intake_flow` — 11 screen folders (`screen.png` + `code.html`) and one `dominion_roam_console/DESIGN.md`. Compared with this plan (sections 4, 5, 11) and [the Stitch prompt](stitch/add-parts-catalogue-dominion-prompt.txt).

**Verdict:** the flow, the sample data (Roomy M900A / Tank / Partsouq / 89467-B1040 / 89465-B1120), the counts and the colours are right, and the parts step really is cards. What must change is the invented "catalogue intake" language wrapped around them, the page header and tabs, and the step strip. Nothing structural has to be redrawn.

Legend: **Keep** = built is fine or better, use as drawn. **Fix** = must change; the fix is stated. **Drop** = Stitch invented it; remove it.

### Screen 1 — `step_1_the_page_trusted_link` (plan Screen 1)

- **Keep** the console frame (sidebar groups, top bar, search, "Deeki T · Owner"), the white step card, the link row + Paste, "How to find the part number", the three answer rows with "Worked out from your link" + Change, and the footer (red-outline Cancel, primary "Next: the cars").
- **Fix** add the page header above the step strip: "Parts database" + the muted line "Every part, and every car it fits." + the four tabs Find parts / Full database / Add parts (selected) / Trusted sources. It is missing on this screen.
- **Fix** step strip to the four plain cells "1 The page · 2 Cars · 3 Parts · 4 Review" (number circle + label only; no "STEP 01" caption line).
- **Fix** the section title "WHAT WE WORKED OUT" to sentence case "What we worked out".
- **Fix** the trust line to "Partsouq is trusted for Toyota." (the build adds "parts diagrams").
- **Drop** the "3 ATTRIBUTES VERIFIED" pill.
- **Drop** "Toyota official parts microfiche" (second line under "Whose catalogue").
- **Drop** "OEM specification parts for Toyota / Daihatsu" (second line under "Genuine Toyota parts").

### Screen 2 — `step_1_the_page_untrusted_link_maker_picker` (plan Screen 2)

- **Keep** the Toyodiy sample, the amber "Needs checking" pill, the six maker tiles + "Other" tile with a small text field, Toyota's selected ring, "Whose catalogue: Toyota's own catalogue" with the green "Worked out" note, the two "Who made these parts?" cards, the amber trusted-list note, and the footer.
- **Fix** page header + tabs (missing here too).
- **Fix** step strip as Screen 1.
- **Fix** remove the duplicate "Trust this site" button from the Site answer row; keep only the one in the amber note (one action once).
- **Fix** the second choice card's sub-line to "A part maker's own parts" (drop "(aftermarket / OEM supplier)").
- **Fix** the brand field: label "Brand" in sentence case (not "SUPPLIER BRAND:"), and show it only when "Another brand" is chosen — on this screen "The car maker (genuine)" is selected, so it should not be visible.
- **Fix** the last maker tile to "Other maker" with placeholder "Type the maker".
- **Drop** the "QUICK SELECT:" caption (the chips can sit under the field without a label).

### Screen 3 — `step_1_trust_this_site_dialog` (plan Screen 3)

- **Keep** the dialog itself: "Trust this site?" + "Nothing you typed is lost.", the Site / Maker / "Trust it as" rows, three stacked options (clearer than chips), the explanation note, "Only the platform owner can change trusted sites.", and Cancel + primary "Trust this site". Keep the 40% dim.
- **Fix** the dim: today only the centre band is dimmed and the page title/button to its left stays bright. Dim the whole page behind the dialog.
- **Fix** the background page: it must be the real Step 1 card from Screen 2 (same page header, real tabs), not the invented "Step 1: Source & Reference Catalog" layout.
- **Fix** remove the dialog's top-right ×: Cancel already closes it (two of the same action).
- **Drop** "Level 1 Primary" / "LEVEL 1 PRIMARY".
- **Drop** from the background: "Specify original manufacturer parts link or blueprint archive", "OEM Reference URL", "Detected Vehicle Maker", "flagged as an unverified external directory. Trust authorization required.", and the wrong tabs "Catalog browser / Cross-references".

### Screen 4 — `step_2_the_cars_matching_versions_ticked` (plan Screen 4)

- **Keep** the two-column layout, the years card with From 2016 / To 2020 + "Still made", the code chips + "These came from the link", the search with Clear, "Found 5 versions for M900A and M910A", the group headers with tick-all and the years filter, the rows (engine words + mono code + amber "After 2020 — not on this page"), the counts (Roomy 3 + Tank 2 = 5, exactly 3 ticked), the "Selected · 3 cars" panel with editable years, the sister-cars card, and the footer.
- **Fix** page header + tabs: this screen has "CATALOG INGESTION WORKFLOW" and the wrong tabs "All Parts (38,204) / Add parts / Compatibility Matrix / Orphaned Codes" — replace with the standard header and the four real tabs.
- **Fix** step strip: no chevrons, no "Step 02 · Current"; the four cells as in Screen 1.
- **Fix** the filter label "Show only matching years" → "Show only the versions in these years" (keep it OFF so the out-of-page rows stay visible).
- **Fix** sister-cars body to "These are built on the same car. Add the matching versions?" (the build says "chassis architecture").
- **Fix** remove the unexplained green dot after each ticked row's code chip (or give it a legend — the plan has none, so remove).
- **Drop** "CATALOG INGESTION WORKFLOW".
- **Drop** "MANIFEST" above the Selected list.
- **Drop** the "CHASSIS COVERED / M900A, M910A" block in the selected panel.
- **Drop** the whole "INGESTION ACCURACY / 100% MATCH / 3 fitment variants aligned with catalog specifications." card.
- **Drop** "Detected chassis:" as a caption (keep the two chips and "These came from the link").
- **Drop** "3 cars staged for step 3" next to the footer.

### Screen 5 — `step_2_the_cars_no_years_entered` (plan Screen 5)

This screen is the best-built one: its page header and tabs are correct. Use it as the header reference for every other screen.

- **Keep** the header with the four real tabs, the empty years fields with "e.g. 2016" / "e.g. 2020" placeholders, the blue line "Enter the years the page lists and we will tick the matching versions.", all five rows listed and unticked, the greyed filter, the empty Selected panel, the disabled Clear all, and the footer with the disabled Next and "Tick at least one car.".
- **Fix** step strip labels to "1 The page · 2 Cars · 3 Parts · 4 Review" (the build mixes "STEP 1", "ACTIVE", "STEP 3", "STEP 4").
- **Fix** "FOUND 5 VERSIONS FOR M900A AND M910A" to sentence case.
- **Fix** the group header to one row: model, "3 versions", "Tick all Roomy", the years filter — today the count wraps under the model and the filter wraps onto three lines.
- **Fix** add the amber "After 2020 — not on this page" pill to the two out-of-page rows, as on Screen 4 (the rule does not depend on whether anything is ticked).
- **Fix** add the sister-cars body line ("These are built on the same car. Add the matching versions?").
- **Drop** "Selected versions will appear here for validation." (keep only "Tick the cars this page is for.").

### Screen 6 — `step_3_the_parts_one_card_per_part_number` (plan Screen 6)

- **Keep** the one-card-per-part layout with no table and no sideways scroll, the source strip, the question and hint, the open type list with search + "52 types" + the five-type shortlist + "Can't find it? Ask to add a part type", the part number with "Copy it exactly as printed." and the "Already on file as 'Front oxygen sensor' (4 cars)…" line, the place buttons (Front selected solid / Rear outlined), the catalogue-names line, the Years row with Change, the "Saves as" line, the add/paste buttons, the four-step guide, and the footer.
- **Fix** draw this screen at desktop width (1440, content column 960): it came out ~800px wide, so the two-field rows are cramped and the type list is squeezed.
- **Fix** page header + tabs (missing).
- **Fix** step strip as Screen 1.
- **Fix** "#01 / #02" to "Part 1 / Part 2".
- **Fix** "Close" on the guide panel to a secondary bordered button (it is a text link today; links are for outside websites only).
- **Drop** "INGESTION v2.4" beside the page title.
- **Drop** the "Catalog Category" eyebrow and the lowercase "sensors" line inside the type field.
- **Drop** "OEM ID" beside "Part number".
- **Drop** "(Japan Spec)" after "Toyota's own catalogue".

### Screen 7 — `step_3_part_type_loading_place_needed` (plan Screen 7)

- **Keep** the skeleton "Loading types…" field, the filled part numbers, unselected place buttons, Part 2 with "Choose type…", the amber per-card line "Part 2 needs a place. The page lists two — one front, one rear.", the red summary "Almost there — part 2 needs a place.", the disabled Next, the guide panel and the footer.
- **Fix** draw at desktop width (this one came out ~1030px wide and narrow).
- **Fix** page header + tabs (missing).
- **Fix** step strip as Screen 1.
- **Drop** the "Draft" pill on Part 1.
- **Drop** the "Needs Placement" pill on Part 2 (the amber line already says it).

### Screen 8 — `step_4_trust_for_each_car` (plan Screen 8)

- **Keep** the two columns, the question and hint, "Mark many", the green "All 3 cars are Verified — Toyota's own catalogue lists them." panel with "Mark some as Needs checking", the muted "Changing years never changes trust.", the right-hand "Parts to be added" panel (2 parts, names, "Fits 3 cars", "Saves as …"), and the footer.
- **Fix** page header: this screen has it, but tabs carry icons and an extra "Batch logs" button; keep the plain four tabs and drop the extra button (below).
- **Fix** step strip: "4 ACTIVE REVIEW / Review & Trust" duplicates the word Review; use "4 Review".
- **Fix** the all-Verified state should show the green panel only. If a list is wanted it must be the plan's trust table (car, years, trust, reason) — not the invented vehicle cards.
- **Fix** footer: remove "Save as draft"; keep secondary "Back to parts" + primary "Next: check and save" (the only two actions).
- **Drop** "v4.8-rel" beside the title.
- **Drop** "Batch logs".
- **Drop** "Cross-referenced with microfiche parts catalog index #084-219."
- **Drop** "TARGET VEHICLES (3 ENTRIES)" and the whole invented vehicle-card list: "Batch ID: #TOY-JPN-994", "Chassis: M900A", "1KR-FE engine", "1KR-FE AWD powertrain", "1KR-FE platform-twin", "more_vert", "Partsouq OEM catalogue: Fig. 84-01 (Sensor, Oxygen)", "Pos: Bank 1", "Pos: Bank 1 & Exhaust pipe".
- **Drop** "Trust integrity checks passed: 3 of 3 automated heuristics." and "View verification rulebook".
- **Drop** the "PROVENANCE METADATA" block (catalogue source, target chassis, application years).
- **Drop** "MATCHING SCORE / 100% Deterministic / 3/3".
- **Drop** the "Air-Fuel Ratio" and "Heated downstream" tags in the parts panel.

### Screen 9 — `step_4_check_and_save_one_save_button` (plan Screen 9)

- **Keep** the "Check and save" title, "2 parts × 3 cars = 6 fits", the shared-catalogue line, the "Open the page ↗" secondary, both part cards (name, mono number, "Genuine Toyota", plain place line, three car rows with years + code + Verified), the sticky bar with secondary "Back to parts" and the single primary "Save 2 parts to 3 cars", and the fact that there is exactly one save.
- **Fix** page header + tabs (missing on this screen).
- **Fix** step strip as Screen 1 ("4 Review", no "ACTIVE REVIEW").
- **Drop** "VERIFICATION STAGE 04".
- **Drop** the "100% MATCH" pill.
- **Drop** the "Global Central Registry Sync" panel ("Cross-fleet verification passed without compatibility conflicts", "Ledger status: Validated").
- **Drop** "SKU ID: 89467-B1040-00" and "SKU ID: 89465-B1120-00".
- **Drop** "Engine Spec: 1KR-FE / 1KR-VET".
- **Drop** "Chassis: DBA-M900A / DBA-M910A" (the mono code chip already carries it).
- **Drop** "OEM Direct Fit · Heated 4-wire configuration" with "Connector ID: CN-TY-4P-A".
- **Drop** "Downstream Lambda Monitor".
- **Drop** "Exhaust line integration · Lead length 320mm" with "Connector ID: CN-TY-4P-B".
- **Drop** the "Publishing Policy Confirmation" box and "change set CS-2024-O2-TY".
- **Drop** "READY FOR COMMIT · 6 ASSOCIATIONS" from the sticky bar.

### Screen 10 — `step_4_save_failed_server_error` (plan Screen 10)

- **Keep** the title, count line, shared-catalogue line, the red "Nothing was saved. Your rows are still here." panel with "Try again", both cards kept, and the single save with secondary "Back to parts".
- **Fix** page header + tabs (missing).
- **Fix** step strip: the build invents "1. Select Parts / 2. Select Vehicles / 3. Match Criteria / 4 Review & Commit" — use the real four cells.
- **Fix** the part cards to match Screen 9: add the years to each car row ("Toyota Roomy · 2016–2020 · M900A"), move "Fits 3 cars" to the small label above the rows, and use the shield-tick Verified pill from Screen 9 (this screen uses a dot).

### Screen 11 — `step_4_saved_confirmation_next_steps` (plan Screen 11)

- **Keep** the success card, "2 parts saved to 3 cars", the muted "You can undo the whole save from Recently added.", the two saved rows with names, mono numbers and the blue car pill, the three "What next?" buttons (primary "Add more from this page" first), and the bottom bar with "Back to Add parts" + red-outline "Undo save".
- **Fix** the tabs to the real four: Find parts / Full database / Add parts / Trusted sources ("Recently added" is not a tab; it lives inside Add parts).
- **Fix** the success tick circle and the two row ticks to the Verified green (#e6f4ea circle, #006e31 tick) — they are pale lavender today.
- **Fix** "SAVED" and "WHAT NEXT?" to sentence case ("Saved", "What next?").

### Across all screens — one fix list

1. **Page header everywhere.** Every step screen shows "Parts database", "Every part, and every car it fits.", and the four real tabs: Find parts, Full database, Add parts (selected), Trusted sources. Missing on Screens 1, 2, 6, 7, 9, 10; wrong tabs on 3, 4, 11. Screen 5 already does it right; Screen 8 has the header but needs the plain four tabs and no "Batch logs".
2. **One step strip.** Four cells: "1 The page · 2 Cars · 3 Parts · 4 Review". Done = green tick circle, current = tinted cell + solid blue number. Remove every "STEP 01", "Done/Current/Next", "· CURRENT", "ACTIVE REVIEW", chevron, and the duplicated "Review Review & Trust". Today no two screens draw it the same way.
3. **No capitalised eyebrows.** "WHAT WE WORKED OUT", "FOUND 5 VERSIONS…", "SAVED", "WHAT NEXT?", "SUPPLIER BRAND:", "CATALOG CATEGORY", "OEM ID", "PROVENANCE METADATA" → sentence case or remove (Dominion rule G7).
4. **Desktop width.** Screens 6 and 7 were drawn at ~800–1030px. Redraw at 1440 with the 960px content column; the two-field rows and the type list need the room.
5. **Design-system words.** `dominion_roam_console/DESIGN.md`: keep every token (palette, Inter + JetBrains Mono, 8/12/16px radii, 16px cards, 960px well — they match the app), but rewrite the style language: "High-Density Technical Utility", "chassis identifiers as first-class citizens", "SKU/chassis cells" and "Data Tables" are what pulled the jargon in. Describe it as Dominion's calm modern workspace with numbers in mono.
6. **Fonts.** The mono numbers render as a serif-ish fallback in the PNGs; keep JetBrains Mono in the build (no change to the design).

### Known-drop list — confirmed present and to be removed

All of these appear and must go: "Global Central Registry Sync", "Ledger status", "SKU ID", "Engine Spec", "Chassis: DBA-…", "Connector ID", "Heated 4-wire", the "Publishing Policy Confirmation" box, "READY FOR COMMIT · N ASSOCIATIONS", "100% MATCH", "Ingestion v2.4", the "Ingestion accuracy" card, "MANIFEST", "DETECTED CHASSIS", "3 ATTRIBUTES VERIFIED", "microfiche", "OEM specification", "VERIFICATION STAGE 04", "CATALOG INGESTION WORKFLOW". Also invented and to go: "v4.8-rel", "Batch logs", "Target Vehicles (3 entries)", "Batch ID", "Fig. 84-01", "Pos: Bank 1", "Provenance Metadata", "Matching Score", "Save as draft", "Draft", "Needs Placement", "Catalog Category", "OEM ID", "(Japan Spec)", "Air-Fuel Ratio", "Heated downstream", and the stray "3 cars staged for step 3" / "Selected versions will appear here for validation." lines.

### What the builder keeps from this round

- The card/table-free parts step, the type list drawn inside the page, the place buttons with the catalogue's names underneath, "Saves as", and the part-number guide — all as drawn.
- Screen 4's counts and Screen 5's header/tabs/unfocused state as the reference for the rest.
- Screen 8's two-column trust layout and parts panel, and Screen 9's single-save bar with "Check and save", count line and shared-catalogue line.
- Screen 11's saved card and next steps.

