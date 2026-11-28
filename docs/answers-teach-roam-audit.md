# Your answers teach Roam: plan

Rev 3 · 27 Nov 2026 · CLOSED (round 2 done, build next) · Claude · Dominion (`apps/admin`) + server
(`supabase/functions/_fleet-server`) + database

**Goal in one sentence:** when you answer a question about a part on a catalogue page, Roam remembers the answer, so the
same wording on any later page saves by itself without asking you again.

This is a plan only. Every fact below was checked in the code and by read-only `SELECT`s on the live database on 27 Nov
2026. No code, migration or database write was made for it.

Separate from [saved-page-parts-audit.md](./saved-page-parts-audit.md),
[saved-page-reads-disagree-audit.md](./saved-page-reads-disagree-audit.md) and
[part-type-auto-sort-audit.md](./part-type-auto-sort-audit.md). Those built the upload, the two reads and the sorting of
unknown names. This plan closes the gap they left: **answers are never written back.**

---

## 0. START HERE

- **Where it stands:** Rev 2. Review round 1 is done: every finding was re-checked against the code and live data, and
  §5 now spells out every screen, text and button. The Stitch prompt is written:
  [stitch/answers-teach-roam-dominion-prompt.txt](./stitch/answers-teach-roam-dominion-prompt.txt) (14 screens, real Roomy
  rows). The owner made the screens ([stitch/answers-teach-roam-dominion/](./stitch/answers-teach-roam-dominion/)), and
  round 2 (§9) is done. The plan is CLOSED.
- **Build step 1 (database) written and tested, 27 Nov:** migration `20261127172750_part_maker_words.sql`. It was
  run on live inside a transaction that was then rolled back, and every check passed:
  - 30 seed rows (10 headings × Toyota/Daihatsu/Lexus), keys identical to `normalisePhrase`;
  - a wording lesson, then a replace (one row, count kept); the count resets on a type change;
  - a place lesson for Roomy; a place with no model is refused, and so is a bad key;
  - Undo forgets an owner lesson but never a seed; audit rows are written;
  - anon/authenticated can't read or run anything, and RLS is on.

  Nothing stayed on live. Pasted by the owner on 27 Nov, logbook line in.
- **Build step 2 (server) written and tested, 27 Nov, local only (not deployed, not committed):**
  - **Migration `20261127173506_part_maker_word_side.sql`:** side lessons, plus the switch
    `catalog_research_settings.answers_teach_roam` (off). It was tested on live and rolled back.
  - **New files:** `saved_page_lessons.ts` (load, match, remember, count), `saved_page_row_answer_routes.ts` (answer
    route, Learned list, Undo, registered in `platform-catalog`), `saved_page_question.ts` (the drawer's question).
  - **Changed files:**
    - `saved_page_proof.ts`: `partFinder` is gone; maker words and lessons are used; the four reasons become questions
      when the switch is on.
    - `research_saved_page_routes.ts`: questions open their jobs; suggestions carry the heading and source; the learned
      count.
    - `saved_page_part_type_core.ts`: uses maker words.
    - `catalog_research_routes.ts`: the drawer gets `question`, `makerPartName` and `makerSearch` from the table.
  - **Tests:** 8 new done-tests in `research_saved_page_routes.test.ts` (tests 1–9). All 192 test files CI lists:
    1,164 passed, 0 failed. Type check clean for every changed file.
  - Migration 2 pasted by the owner on 27 Nov, logbook line in. The switch is live and **off**.
- **Build step 3 (screens) built and tested, 27 Nov, local only (not deployed, not committed):**
  - **New:** `QuestionCard.tsx` (the card, the answered line, the place words), `LearnedFromYou.tsx` (list, Undo
    dialog, empty / loading / error, staff read-only).
  - **Changed:**
    - `SavedPageOverlay.tsx`: question cards in Needs you, the learned line, the "Learned from you" pill, the
      `words_unread` stop card.
    - `ResearchJobDrawer.tsx`: question mode, "Or check it on the website step by step", the answered card + Done.
    - `ResearchPartsTab.tsx`: the "Needs you" status.
    - `PartTypesSettings.tsx`: the Learned from you card.
    - `researchModel.ts`: `partFinder` no longer holds the hand-written rows; it takes `makerPartName` + `makerSearch`
      from the server and keeps only the section hints.
    - `researchEngineService.ts`: the types and calls.
  - **Server, for the screens:**
    - The jobs list returns `needsYou`.
    - "No" clears the question's source, so the check goes back to a plain browser check.
    - The answered row carries the server's "Roam will remember …" line (`question.note`).
  - **Tests:**
    - Admin: tsc clean; vitest 338/338, including 9 new in `AnswersTeachRoam.test.tsx`.
    - Dominion e2e (research engine + saved pages): 29/29. Two job-detail mocks now send `makerPartName` /
      `makerSearch`, as the server does.
    - Server: CI deno 1,164/1,164.
  - **Next:** one clean-copy deploy of the server (`platform-catalog` + `catalog-research`), on top of the live version
    (main + PR #24's files). The owner then tries it on local Dominion with the switch on.
- **Deploy prepared, 27 Nov:**
  - **Clean copy:** `C:/Roam/Goride-deploy-at` = branch `research-stale-checks-re73-75` (exactly what's live:
    platform-catalog v267 / catalog-research v86, the same code fingerprints as the PR #24 deploy). Added to it: the 10
    server files above, both migrations, and the test changes.
  - **Tests in the copy:** CI deno 1,207/1,207. The menuEngine drift test only fails on a Windows checkout because of
    line endings, and passes once both copies use plain endings. Type check: no errors in the changed files.
  - **⚠ Once deployed, these files are deployed-but-NOT-on-main and NOT in PR #24:**
    - `saved_page_lessons.ts`, `saved_page_row_answer_routes.ts`, `saved_page_question.ts`
    - `saved_page_proof.ts`, `research_saved_page_routes.ts`, `saved_page_part_type_core.ts`
    - `catalog_research_routes.ts`, `platform-catalog/index.ts`

    Merging PR #24 on its own would redeploy from main + PR #24 and **undo** this work. Add these files to PR #24, or
    ship them in their own PR, before any merge.

- **On GitHub, 27 Nov:** everything is committed to PR #24 (branch `research-stale-checks-re73-75`, commit 8ba30867a), which now carries RE-73..75 + Answers teach Roam. **Not merged on purpose:** the maintenance rebuild (`fleet-ops` v480–v485, `maintenance-manual-worker`, 6 `mm_*` migrations) is live but only in `C:/Roam/Goride-mm3` (branch `mm-step3`, not pushed). Merging PR #24 first would redeploy `fleet-ops` from main and undo it, and CI's migration check stays red until those migrations are on main. Order: the maintenance work to main first, then merge PR #24.

### Build notes (Rev 3.1, 27 Nov): two changes made while building step 1

1. **A new table, `part_maker_word`, instead of reshaping `part_term_synonym`.** `part_term_synonym`'s key is `term`
   alone, so one heading can't be stored for two makers. Fleet's find-parts search (`readPartTerm`) and the catalogue
   editor (`catalog_routes` upsert on `term`) also depend on it. It stays exactly as it is.
   `part_name_answer_set` is left alone too. Owner lessons go through the new `part_maker_word_set`. AT-01's "one
   store" is now `part_maker_word`.
2. **The seed gives each heading only to the part it was written for.** Today `partFinder` lends its words to
   look-alikes. Drive belt tensioner takes "BELT, V-RIBBED". Spark Plug Wires takes "PLUG, SPARK". Parking brake shoe
   strut set and Spring for rear brake shoe hold down take "SHOE SET, BRAKE". Air cleaner housing and inlet take the air
   filter row. That's how wrong matches slip in. The seed is per make (Toyota, Daihatsu, Lexus, the makes `partFinder`
   served), not "every maker", so Honda pages behave as today.
3. **Step 2 additions.**
   - **Side lessons:** the table also remembers left / right / both (migration 2). A "Both sides" answer is asked once
     per model, like front/rear.
   - **The switch:** it lives on `catalog_research_settings` (the research settings row), not in platform settings.
   - **An answer covers the whole heading:** every waiting row on the page with that heading (both sides, every date
     range) is saved together, through the same stored-row save as "Add part type" (`saveRowsAsPartType`).
   - **A question with two missing things asks them one after the other on the same card:** the part first, then the
     place.
   - **No lesson from step 3 of a website check:** what the owner finds on the site isn't text Roam can read. The
     drawer's question card (§5.2) is where answers teach.
- **The gap in one line:** Roam never learns from your answers. Each answer fixes one car once; the rule that held the row
  never changes, so the same hold comes back on the next page.
- **What started it (27 Nov):** the Toyota Roomy M900A front strut mount. The page was uploaded twice (26 Nov 22:02 and
  22:17 UTC). Both times Roam held `48609-B1060` because Toyota calls the part "SUPPORT SUB-ASSY, FRONT SUSPENSION" and
  Roam only knows the words "strut mount". A browser check then asked the owner to search the site from scratch and
  "Do you see STRUT MOUNT?". That wording isn't on Toyota's page. Finishing that check saves the number for this one car
  and teaches Roam nothing.
- **Already fixed today, same family of gap (not in this plan):** RE-73 (no pads on a drum axle), RE-74 (a held row on a
  part already on file opens no check), RE-75 (a check whose answer is already Confirmed closes by itself). See
  [research-engine-audit.md](./research-engine-audit.md) §0.

### Round 1 changes (Rev 1 → Rev 2)

1. **The current code is worse than Rev 1 said (§1.4).** Since the reads update on 27 Nov, a wording, place or "two part
   types" row is quietly **left for later**: it isn't shown, asked or opened, only counted. Rev 2 turns those rows into
   questions (AT-03).
2. **A question needs a home after the upload closes (AT-11).** Each question rides on a browser check job, so it shows in
   Pending catalog, counts in "N of 25", and keeps RE-73/75's rules.
3. **"Which part is this?" is a third kind of question (AT-05).** It covers rows where the two reads name two part types.
   A type the car can't have (RE-73) is never offered.
4. **Place lessons are per car model, not per maker (AT-07).** Strut mounts are front on a Roomy but rear on some cars, so
   a place learned on one model must not move another model's parts.
5. **A suggestion remembers the page row it came from (AT-12).** That's how the drawer can show what Roam read.

---

## 1. What we found

### 1.1 The numbers (live, all 18 saved-page uploads so far)

| What happened to a row | Rows | Meaning |
|---|---|---|
| Saved by Roam | 60 | Worked. |
| Already on file | 96 | Worked. |
| Not a part we track | 230 | Nuts, bolts, covers. Correct. |
| **Held, needs you** | **28** (14 different headings) | **The rows this plan is about.** |
| Held by a database error (26 Nov 17:03 / 17:10) | 32 | Bug fixed that evening; 28 of those parts were saved since. Not this plan. |

Held reasons: "The page doesn't say front or rear on that row" (10), "No number for this side" (4), "No dates shown on the
page" (3), "The two reads don't agree" (3), "Waits with the other side" (2), "Roam already has … for these years" (2),
"This part type has no catalogue area yet" (2), "The page doesn't say left or right" (1), "The page doesn't name this part
type on that row" (1).

### 1.2 Roam keeps the maker's words in four places, and they don't talk to each other

| # | Where | What it holds | Who reads it |
|---|---|---|---|
| 1 | `partFinder()` in `saved_page_proof.ts` (server) | 10 hand-written Toyota/Daihatsu/Lexus rows ("PAD KIT, DISC BRAKE" …). No strut mount row. | The upload's word check (`typeWords` → `rowNamesType`) |
| 2 | `partFinder()` in `apps/admin/.../researchModel.ts` | A copy of #1 ("keep the two in sync"), with two extra inputs | The browser check's search word and step 3 |
| 3 | Table `part_term_synonym` | 80 rows: 58 seed, 22 made by Roam's auto-sort (each a new type's own name), **0 from the owner** | Only the auto-sort of **unknown** names |
| 4 | `catalog_part_proposal.part_name` on added jobs | The name a past suggestion was saved under | Step 3 wording (`findMakerPartName`) |

The upload's word check never reads #3 or #4. The browser check never reads #1 or #3. Nothing writes the owner's answer into
any of them.

### 1.3 How a held row travelled (uploads up to 27 Nov 08:40 UTC)

1. Upload → the row matches a known part type but fails a check (wording, front/rear, side).
2. `isPageHeldReason()` marks wording and place reasons as "a fact about the page a second press can never change". So the
   row is a dead end on purpose.
3. The auto-sort, the only learning step, looks only at rows in the "not a part we track" group. A held row is never
   offered to learn from.
4. `writeSuggestions()` puts the row's number on a browser check as a tap-chip. It's saved under Roam's name ("Strut
   mount"), not the page's ("SUPPORT SUB-ASSY, FRONT SUSPENSION"), and with no link to the page row.
5. The browser check starts over: open the site, search, open the section, "Do you see STRUT MOUNT?", type the number.
6. `savePartAnswers()` saves the number to the car. It writes no lesson.
7. Next Toyota page with the same heading → back to step 1.

### 1.4 How it works now (live since the reads update, 27 Nov)

`proveRows()` now marks these rows `leftForLater` (group `left_for_later`, with a `waitReason`): wording
(`NO_TYPE_WORDS_REASON`), front/rear (`PLACE_AXLE_REASON`), side (`PLACE_SIDE_REASON`), and "the reads name two part types
and the page names neither". The result screen shows only one grey line, "Roam skipped N rows it couldn't prove from the
page". Nothing is saved, asked or opened. Only 2 uploads have run on this code so far, and they skipped 0 rows. The next
Roomy-style page will quietly lose the strut mount instead of asking.

---

## 2. Findings (one fix each)

**AT-01 · Four name lists, none shared.** Fix: one store, `part_term_synonym`, is the only list of what a maker calls a
part. It gains `make` (empty = every maker), `model` (empty = every model) and `axle` (front / rear / empty). The 10
`partFinder` rows move into it as seed rows by migration. One server answer, `makerWordsFor(make, typeId)`, replaces both
code copies of `partFinder`. The hand-written rows are deleted from the code.

**AT-02 · The upload's word check ignores learned names.** Fix: before the proof runs, the upload loads the lessons for the
car's make (one query: `make` = car make or empty). `rowNamesType()` and `nameFromPageWords()` pass when the row's heading
key matches a lesson for that part type. The heading key is `normalisePhrase(pagePhraseFromGroupLine(groupLine))`, the same
key the auto-sort uses. The rest of the proof stays: the number, the dates and the side must still be on the page (P1–P3).
A lesson only answers "which part is this?" and, for its model, "which axle?".

**AT-03 · Wording, place and two-type rows are dead ends.** Fix: these four reasons become **questions**:
`NO_TYPE_WORDS_REASON`, `PLACE_AXLE_REASON`, `PLACE_SIDE_REASON` and "the reads name two part types". The row must have its
number and dates proved on the page. It goes to the `held` group ("Needs you") with a `question` field, not to
`left_for_later`. `isPageHeldReason()` no longer lists the wording and place reasons. Every other left-for-later reason (no
number, not a part number, group code, no dates, two sets of dates, two numbers) stays a quiet skip: those are page facts
no answer can change.

**AT-04 · Answers save numbers only.** Fix: one server step, `rememberAnswer()`, runs after every owner Yes or pick on a
question, and after a browser check on a saved-page job whose step 3 was answered Yes. It writes the lesson through
`part_name_answer_set` (verdict `track`, `set_by` owner): heading key, the car's make, the part type, and for a place answer
the car's model and the axle. "No, it's something else" writes no lesson and no dismissal. The existing `skip` verdict
can't be used here: it writes `part_type_suggestion_dismissal`, which hides the heading as "not a part we track" on every
page, for every car.

**AT-05 · A question must show what Roam read and ask one thing.** Fix: three kinds of question, each on one card.
- **Wording:** "Is this the Strut mount?" Buttons: **Yes, it's the Strut mount** · **No, it's something else**.
- **Two part types:** "Which part is this?" One button per candidate type ("Brake shoes", "Brake pads"), plus **Something
  else**. A type `catalog_part_fits_axle` says the car can't have there (RE-73) is not shown.
- **Place:** "Where is it on the car?" Buttons: **Front** · **Rear**. A side question shows **Left** · **Right** · **Both
  sides**.

Every card shows, in this order: the page heading, the row text, the number, the dates, and the place Roam already knows.
Yes or a pick saves the number at once through the one save path (`savePartAnswers`, SP-01) and remembers the lesson. The
owner doesn't search the site or type the number.

**AT-06 · The browser check asks in Roam's words, not the maker's.** Fix: `writeSuggestions()` saves the page heading as
the suggestion's `part_name`. Step 3 and the search word come from `makerWordsFor` for the car's make. So a Toyota strut
mount check says "Do you see SUPPORT SUB-ASSY, FRONT SUSPENSION?".

**AT-07 · Place answers are never remembered.** Fix: a place lesson is stored with the car's make **and model** and the
axle. On a later page for the same make and model, it fills the place for that heading when the row says nothing. Words on
the page itself (FRONT / REAR / LH / RH) always win. If the page disagrees with a lesson, the row becomes a question again
and nothing saves.

**AT-08 · You can't see Roam getting better.** Fix: the upload result counts rows saved because of an earlier answer and
shows "Saved N rows using your earlier answers". Part types gets a **Learned from you** list with **Undo** on each lesson
(§5.3).

**AT-09 · A wrong lesson would spread.** Fix: four rules.
1. A wording lesson is per maker; a place lesson is per maker and model; only seed rows are for every maker.
2. A lesson never saves a row on its own: the number and dates must still be proved on that page.
3. **Undo** deletes the lesson. Parts already saved with it stay saved, since the owner confirmed each one; the list says
   how many parts it saved.
4. A lesson can't point a heading at a part type another lesson for the same maker already uses for that heading. The
   second answer replaces the first, and the list shows the newer one.

**AT-10 · Today's held rows and open checks would stay stuck.** Fix: every upload's result rows are stored with the heading,
row text, number and dates (D1). After build, a one-time run re-checks each stored held or left-for-later row of the four
question kinds. A row a lesson now covers saves by itself. Any other row becomes a question on its job (AT-11).

**AT-11 · A question disappears when the upload screen closes.** Fix: every question rides on a browser check job, opened
or joined with `research_saved_page_job`. That keeps RE-73 (impossible parts) and RE-74/75 (already on file) in force. So:
- the question shows in **Pending catalog** as **Needs you**, and counts in "Browser checks waiting N of 25";
- it closes by itself when the part gets confirmed another way;
- the 30-day rule applies as for any browser check.

A place question for a part with axles opens the part's job with no axle; the answer saves on the axle picked.

**AT-12 · A browser check can't find the page row it came from.** Fix: `writeSuggestions()` stores the source on the
suggestion: `sources = [{kind: "saved_page", savedPageId, lineNo}]`. The drawer reads that row from
`research_saved_page.result` to show the question card. Old jobs with no source are matched by the row's stored `jobId`
(AT-10).

---

## 3. Database

- `part_term_synonym`: add `make text`, `model text`, and `axle text` (check: `front`, `rear` or null). Replace the unique
  index on `phrase_key` with one on `(phrase_key, coalesce(lower(make), ''), coalesce(lower(model), ''))`.
- Seed: the 10 `partFinder` rows go in as `added_by = 'seed'`, `make` null, with their phrase keys. The pads and shoes
  rows keep exactly today's words, so the drum rules (RE-72/73) and "SHOE KIT is never brake pads" stay as they are.
- `part_name_answer_set`: new optional `p_make`, `p_model`, `p_axle`; old callers keep working. Its body is rewritten for
  the new key. Today it deletes and re-inserts by `phrase_key` alone, which would wipe another maker's lesson. Both now use
  the full key. The `skip` branch is unchanged.
- New read `part_lessons_for_make(make)`, service_role only, for the upload and the browser check.
- `catalog_part_proposal`: no schema change. `part_name` holds the page heading and `sources` holds the page row for
  saved-page suggestions.
- New migration at today's UTC time. The logbook line goes only in the pasted SQL.

## 4. Server

| Piece | File | Change |
|---|---|---|
| Lessons | new `saved_page_lessons.ts` | `makerWordsFor(make, typeId)`, `lessonFor(heading, make, model)`, `rememberAnswer()` |
| Load lessons | `research_saved_page_routes.ts` | One read of `part_lessons_for_make`, next to the dismissal read |
| Word check | `saved_page_proof.ts` | `rowNamesType` / `nameFromPageWords` pass on a lesson; `partFinder` removed |
| Place | `saved_page_proof.ts` | A place lesson for this make + model fills a missing axle; page words win |
| Row → question | `saved_page_proof.ts`, `research_saved_page_routes.ts`, `saved_page_part_type_core.ts`, `saved_page_result.ts` | The four reasons (AT-03) give `held` + `question` {kind: wording / types / axle / side, typeIds}; the row's job is opened (AT-11) |
| Suggestions | `research_saved_page_routes.ts` `writeSuggestions` | `part_name` = page heading; `sources` = page row (AT-12) |
| Answer route | new `saved_page_row_answer_routes.ts` | `POST …/saved-pages/:id/rows/:lineNo/answer` {kind, yes / typeId / axle / side}. Yes or a pick opens the chosen type and axle's job (RE-73/75 apply), saves through `savePartAnswers`, calls `rememberAnswer`, and closes the question's own job if a different one saved. No leaves the job as a normal browser check. |
| Browser check | `catalog_research_routes.ts`, `research_part_save.ts` | Job detail returns `question` (the source row) and the maker's words. A step 3 Yes on a saved-page job calls `rememberAnswer`. |
| Learned list | `saved_page_lessons.ts` routes | `GET …/lessons`, `DELETE …/lessons/:id` (owner only) |
| One-time run | route + script | AT-10 |
| Admin | `researchModel.ts` | `partFinder` reads the maker's words from the job detail; the hand-written rows are deleted |

## 5. Screens (every screen, text and button)

### 5.1 Saved page result (`SavedPageOverlay.tsx`)
- The top summary line stays ("N parts saved · N need you"). A new grey line below it, only when the number is above 0:
  **"Saved N rows using your earlier answers."**
- The **Needs you** group lists one **question card** per question (AT-05). Each card shows:
  - the part type in bold, then the car's place if known ("Strut mount · Front");
  - the page heading, as written ("48609A - SUPPORT SUB-ASSY, FRONT SUSPENSION");
  - the row text, as written, in a soft box;
  - the number in a mono chip, and the dates ("11.2016 – 09.2020");
  - the question line in bold ("Is this the Strut mount?");
  - the buttons for that kind (AT-05). The first one is primary and the rest are secondary.
- After an answer, the card turns into a green line: "Saved 48609-B1060 · Front, both sides · Roam will remember
  'SUPPORT SUB-ASSY, FRONT SUSPENSION' for Toyota." After **No**: a grey line, "Not saved. It's in Pending catalog as a
  browser check."
- While saving, the card's buttons show a spinner and can't be pressed twice. On error: a red line under the buttons, "That
  didn't save. Try again.", and the buttons come back.
- Rows held for other reasons keep today's reason line with no buttons. The grey "Roam skipped N rows it couldn't prove
  from the page" line stays, for page-fact skips only.

- **Owner 27 Nov (first real run):** the result's rows sit in **tabs**: Needs you · Saved · Already on file (with Not
  saved) · Skipped. Only kinds with rows get a tab, and Needs you is first and opens first, so a question never needs a
  long scroll. The Skipped tab lists each skipped row with the server's reason (`waitReason`) as plain information. The
  part-type summary stays below the tabs. Not in the Stitch screens; the tab bar uses the "Sorted by Roam" tab style.
- **Owner 27 Nov, three fixes from the first real run:**
  1. **One card per heading.** The RH and LH rows with the same heading key, kind and part types share one card. The
     title keeps only the place they share, the heading drops its side word, every row's text is listed, and one answer
     saves them all. When an answer leads to a next question, the other rows hand their question to that one card.
  2. **The count lands on every lesson the answer used.** Each owner lesson for that heading on that make (and model)
     gets the saved parts, including a wording lesson from an earlier step of the same card.
  3. **Lesson headings drop the side word** (`lessonPhrase`): "BEARING, STRUT MOUNTING", not "…, RH".

  Both live lessons were corrected by SQL on 27 Nov. The server half needs the next deploy (`saved_page_lessons.ts`,
  `saved_page_row_answer_routes.ts`): deployed 27 Nov (platform-catalog v269, catalog-research v88). Still not on main.

- **Owner 27 Nov, wrong place settings:** "Radiator hose" was set up as front/rear (`axle`). It was corrected to `none` on live (audit log `part_type_place_fix`). Place cards now also offer **It has no front or rear** (→ `none`), and side cards offer **It has no left or right** (→ `axle`). That answer corrects the part type for every car, writes no place lesson, then saves the rows. Server: `saved_page_row_answer_routes.ts` (`correctedScheme`), in `C:/Roam/Goride-deploy-at`.

### 5.2 Browser check drawer (`ResearchJobDrawer.tsx`)
- **Owner 27 Nov, step 3 for every site:** with a number Roam suggests, step 3 reads "Search {number} (or up to 2 more). Open what it finds and look for that number. / Nothing found? Search {word} and look for a row called {ROW}. / Found it? Press Yes. Not there? Press No, then Not on this page." The number goes first because a word can land on a different part (Roomy "thermostat" also finds 88620F THERMOSTAT ASSY in the heater piping, while 90916-03150 finds the one 16331A THERMOSTAT row). With no number, step 3 is as before. Above it, **Open the page you saved before** (job detail `savedPage`) shows when an upload for this car saved this part. A browser check only knows its start link, so uploaded pages are the pages Roam can reopen. Server half (`saved_page_question.ts` `findSavedPageForPart`, `catalog_research_routes.ts`): deployed 27 Nov (platform-catalog v270, catalog-research v89). Not on main.
- For a job with a question (AT-11/12), the drawer opens on the **same question card** as §5.1, above the steps. Under it:
  "Or check it on the website step by step", which opens the usual steps.
- Answering in the drawer does exactly what §5.1 does. The drawer then shows the green line and a **Done** button that
  closes it.
- For a job with no question, the drawer is unchanged except step 3: "Do you see SUPPORT SUB-ASSY, FRONT SUSPENSION?" when
  a lesson or the maker's words exist, otherwise the type name as today.

### 5.3 Part types → Learned from you (`PartTypesSettings.tsx`, beside `SortedByRoam.tsx`)
- Title **Learned from you**, sub-line "What Roam remembers from your answers. It uses these on every new page."
- One row per lesson:
  - heading as written;
  - **→** part type;
  - a maker chip ("Toyota"), plus a model chip for a place lesson ("Roomy · Front");
  - "Saved 3 parts";
  - the date and who answered;
  - an **Undo** button (secondary, red text).
- Undo asks in an in-page dialog: "Forget this? Roam will ask again next time it sees 'SUPPORT SUB-ASSY, FRONT
  SUSPENSION' on a Toyota page. Parts already saved stay saved." Buttons: **Forget it** (danger) · **Keep it**.
- Empty state: "Nothing learned yet. Answer a question on an upload and it shows here."
- Loading: three grey placeholder rows. Error: "Couldn't load what Roam learned." with **Try again**.
- Seed rows aren't listed: they aren't owner answers.

### 5.4 Pending catalog list
- No new screen. A question job shows status **Needs you** (amber) instead of **Browser check**, and its arrow opens §5.2.
- It counts in "Browser checks waiting N of 25" and in the **Browser check** filter chip.

All new parts: real buttons (never links), touch targets at least 44px, 8px spacing grid, light and dark mode, no browser
pop-ups.

## 6. Gates and go-live

- Switch `answersTeachRoamEnabled` in platform settings, off while building. Go-live turns it on for everyone.
- The one-time run (AT-10) runs once, after the switch is on.

## 7. Done-tests (written first)

1. **Strut mount, Toyota:** a Roomy M900A page row "SUPPORT SUB-ASSY, FRONT SUSPENSION · 48609-B1060" becomes a wording
   question. Yes → `48609-B1060` saved front, both sides; one owner lesson (Toyota) exists.
2. **The lesson works on another car:** the same heading on a Roomy M910A page saves with no question. The result says
   "Saved 1 row using your earlier answers."
3. **Other makers are untouched:** the same heading on a Honda page is still a question.
4. **The page still has to prove the number:** a lesson-matched row with no dates stays a quiet skip, "No dates shown on
   the page".
5. **Page beats lesson:** a place lesson says rear; the row says FRONT → question, nothing saved.
6. **Place lesson stays on its model:** "STRUT SET, PARKING BRAKE SHOE, RH · 47061-B2040" answered Rear on a Roomy → the
   next Roomy page saves it rear right; a Toyota Corolla page with the same heading still asks.
7. **Two part types:** "04495-B1310 Brake pads, set" under "SHOE KIT, REAR BRAKE" on the rear-drum Roomy offers **Brake
   shoes** and **Something else**, never Brake pads.
8. **No:** "No, it's something else" saves nothing, writes no lesson or dismissal, and leaves a normal browser check.
9. **Undo:** Undo on test 1's lesson deletes it; test 2's page asks again; the parts already saved stay.
10. **Seed rows:** the 10 intended part types keep exactly their words on Toyota, Daihatsu and Lexus pages; the six
    look-alike types (build note 2) no longer borrow them; Honda pages are unchanged; the saved-page proof tests and the
    RE-72/73 drum tests pass reading from the table.
11. **Drawer wording:** a Toyota strut mount check's step 3 says "SUPPORT SUB-ASSY, FRONT SUSPENSION" once the lesson
    exists.
12. **A question survives closing:** close the upload screen without answering → the question is in Pending catalog as
    Needs you, and the drawer opens on its card.
13. **Already on file:** a question whose part gets confirmed another way closes by itself within 10 minutes (RE-75).
14. **One-time run:** the 28 held rows in live uploads become saves or questions; no question is left without a job.

## 8. Build order

1. Database (§3) and seed → test 10.
2. Server: lessons, word check, place, row → question, suggestions, answer route, drawer detail → tests 1–8, 11, 13.
3. Screens (after Stitch): §5.1–5.4 → tests 1, 8, 9, 12 in the browser.
4. One-time run → test 14. Switch on for everyone.

## 9. Round 2: screens vs plan (Keep / Drop / Add)

Screens: [stitch/answers-teach-roam-dominion/](./stitch/answers-teach-roam-dominion/) (14 screens + `DESIGN.md`, made
27 Nov from [the prompt](./stitch/answers-teach-roam-dominion-prompt.txt)). **The layouts are right, so no screen is
redrawn.** Stitch made up content on most screens, and everything it invented is dropped below. Every Keep is already in
§5. **Applies to every screen:** the dimmed or blurred page behind an overlay or drawer is the live page as it is today.
Stitch's invented background text (catalogue refs, "REV", "JDM SPEC", prices like ¥14,200, other cars' rows, "Sync OEM
Catalog", "Define Rule") is never built.

| Screen | Keep | Drop | Add |
|---|---|---|---|
| 1 Question waiting | Amber "!" circle, title, count pills, question card (amber bar, heading mono, row in tint box, chip + dates, question, primary Yes + secondary No), Saved rows with Confirmed | Mono font on the count pills | Count pills in Inter, as on Screens 3–4 |
| 2 After answering | Green circle, answered card (green bar, tick, "Saved … · Front, both sides", "Roam will remember …"), Strut mount at the top of Saved | The learned line "Saved 1 row using your earlier answers · Roam remembered 1 mapping for Toyota". On this upload the row was saved by your answer, not an earlier one, and "mapping" is jargon | Nothing |
| 3 Next page saves by itself | Learned line (green tint, school icon), "Learned from you" pill, 6 Saved rows, Done | Nothing | The Strut mount row keeps its green "Confirmed" pill too; "Learned from you" sits beside it |
| 4 Which part / front or rear | Both cards, "Brake shoes" + "Something else" (no Brake pads), spinner on "Rear" with both buttons disabled | The beige gradient inside the question cards | White question cards; secondary buttons with the visible #c5c6d0 border (they're nearly invisible here) |
| 5 Side question, error | Left / Right / Both sides, red "That didn't save. Try again." line, buttons usable again | "View cached ›" on the collapsed Saved row (invented, looks like a link) | Collapsed Saved row = heading + count + chevron only |
| 6 Phone | Bottom sheet, wrapping row text, stacked full-width buttons, Done | "VERIFICATION NEEDED (1)", "Step 1 of 1", "RAW AMAYAMA EXTRACTION:", "Roam taxonomy will link OEM 48609-B1060 as direct replacement.", the group summaries ("Front shock absorbers, springs, links", "Matching OEM supersessions"), the red Needs you pill and blue Saved pill | Group heading "Needs you 1"; amber left bar (not blue); pills in the Screen 1 colours |
| 7 Pending catalog | Header, tabs, four stat cards, chips, table, amber "Needs you" pill with help icon on the Strut mount row, no banners | "All clear", "Active batch", "Idle worker", "+18% vs avg" in the stat cards | Status pills on one line (no wrapping) |
| 8 Drawer opens on question | Header with "Needs you", source line, question card, "Or check it on the website step by step", footer line | "OEM DIAGRAM HEADER" label, "GROUP 48-02" chip | Drawer full height (the screenshot is cut off; the HTML has every button) |
| 9 Drawer answered | Header with green "Added", source line, answered card, primary Done | The whole "CATALOG RESOLUTION STATE · SYNCED TO CENTRAL GRAPH" panel (Canonical Part Number, Assembly Context, Axle Allocation FRONT_AXLE_DUAL, Catalog Entity), "Suspension Schematic Indexing" diagram and its text, the footer counter line | Footer = only the Done button (§5.2) |
| 10 Step 3 in maker's words | Step 3 panel ("Search support", "Open the section…", "Do you see SUPPORT SUB-ASSY, FRONT SUSPENSION ?", Yes / No), footer line, Back / Next / Not on this page | "Dominion Engine · Step ID #892", the "Target Catalog Reference" panel, "Session Started", "Operator ID" | Nothing |
| 11 Learned from you | Card title + sub-line, three lesson rows (heading mono → icon + type, maker chip, "Roomy · Rear" chip, "Saved N parts · You answered on …", red Undo) | "OWNER PERMISSIONS ACTIVE", "Global taxonomy", "View active catalogue", the invented Sorted by Roam sub-line and "Adjust heuristics", "3 active model rules", the footer "Undoing removes the global match mapping across ongoing imports. TAXONOMY REF: ROAM-SYS-V4" (also untrue: Undo keeps saved parts) | The part-type list and Sorted by Roam card as they are live today, collapsed |
| 12 Forget dialog | Dialog title, body text with the heading in mono, Keep it / Forget it (danger), close X | Everything invented behind it: "PARSER HEURISTICS ENGINE v4.12", "Filter OEM Source", "Define Rule", "Automated entity taxonomy…", "Standard ISO/SAE…", "3 Active Overrides", the SEAL / HARNESS rows, Denso / Yazaki, percentages, "Forget" links | Behind it, the Screen 11 page as specified |
| 13 Nothing yet | Centred school icon, "Nothing learned yet.", "Answer a question on an upload and it shows here." | "SESSION MEMORY", "0 active model rules", "Review recent part uploads", "How model memory works", the engine footer line, the three cards below (Deterministic Overrides / Auditability / Owner Quarantine), and the invented text on the two top cards | The two top cards as live today |
| 14 Couldn't load | Red error icon, "Couldn't load what Roam learned.", Try again | "REF-PT-802", the error explanation paragraph, the error code line, "View incident log", "Fallback standard rules…", "LAST ATTEMPT", the sync footer, "Knowledge base help", "Diagnostic report", the three cards below | Nothing |

No new gaps came out of the screens: every Add above is a look fix or a "build it as already specified".
**The plan is closed.**

## 10. Not in this plan

- How the two AI reads work, and the AI prompt. See the reads-disagree audit.
- New part types for unknown names. That's the auto-sort, which already works.
- Page facts no answer can change: no number, not a part number, no dates, two sets of dates, two numbers on a row. These
  stay quiet skips.
