# Saved pages: when the two AI reads disagree

Status: review only. Nothing in this audit changed any code or any database row. Every database look was a
`SELECT` on project `csfllzzastacofsvcdsc`.

**Build status (27 Nov 2026):** the server half is built in `supabase/functions/_fleet-server` — §3.1–§3.9 and
§4 — with the P4 filler words first. Tests: saved-page group **152 passed, 0 failed**; find-parts deno suite
(**242 passed, 0 failed**), which carries this route's tests. No database write, no migration, no deploy. §5.3
(the screen) is still to do.

**Claude check + screens + LIVE (27 Nov 2026):** one gap fixed in `proveRows`: two known types that the group row
didn't settle were only held back on an *unknown* row, so a known row saved under read A's name when its own title
carried that word ("brake pads, set"). Now any ambiguous row waits (test Rev-3b). Screens built: **Not saved**
group + pill, the folded line "Roam skipped N rows it couldn't prove from the page", "Check this part" removed,
"Nothing new to save" counts Not saved. Tests: find-parts deno suite (now 21 files, `saved_page_proof.test.ts`
added to CI) **273/273**, admin research-engine vitest **65/65**, admin tsc clean, saved-page e2e **10/10**.
Server deployed (platform-catalog + catalog-research) from a clean main copy at 27 Nov; **not on main** (list in
[part-type-auto-sort-audit.md](./part-type-auto-sort-audit.md) §0). Screens are local only. Next: the owner
re-uploads the Roomy rear brake page and checks §5.4.

**First real re-upload (27 Nov):** 20 Already on file (04495-B1310 as Brake shoes, all 6 strut sets), 0 guessed. One
row still showed "Needs you · Roam already has 04474-B1060 for these years": 04906-B1100 came in as an unknown name
(`CUP KIT, REAR WHEEL CYLINDER`), and the **auto-sort / Add path** (`saved_page_part_type_core.ts`) still had the old
rules. Fixed and deployed the same day: a different number whose years cover the row → `not_saved` ("Roam already
has a different number here (…)"); a row the page can't prove → `left_for_later` (`waitReason`, counted in
`result.skipped`); `rowUpdates` and the Add route write the new groups and recount `skipped`. Three old tests moved
to the new groups; find-parts deno **273/273**. That upload's stored row keeps the old line until the page is read
again.

---

## 0. START HERE

Roam reads a saved catalogue page twice and today it only saves a row when the two reads match on **five**
things. When they don't, the row goes to **Needs you** with *"The two reads don't agree"* and a **Check this
part** button, and the owner is asked a mechanic's question. On the Toyota Roomy rear brake page that produced
two of them (27 Nov 2026): one where the two reads called the *same drum-brake shoe kit* "Brake pads" and "Brake
shoes", and one where they disagreed on a field the result never stores at all.

Three findings carry the whole audit:

1. **The two reads are thrown away.** `research_saved_page.result` keeps one chosen set of values and a
   yes/no flag. Nothing anywhere keeps read A and read B. So when the owner is asked "which is right?", the
   evidence that would answer it no longer exists. That is the first thing to fix, and it is free.
2. **Every field Roam saves is already on the page.** The number is written on the row, the dates are read off
   the row, the front/rear/left/right words are on the row or its group row, and the part's name is the
   catalogue's own group row (`SHOE KIT, REAR BRAKE`) — even though today's code takes the name from a read
   instead. The reads only point at *which lines* are part rows. Comparing them on the saved fields adds no
   safety; it only adds questions.
3. **The owner is being asked things only a mechanic could answer.** 16 uploads are on file for this car and
   they hold 59 rows in **Needs you**: 32 are an old save fault (Roam's problem, not the owner's), 6 are "Roam
   needs one more page" (the owner *can* act on those), and **21 ask the owner to judge a part** — 3 of them
   read-vs-read disagreements, the rest "the page doesn't say front or rear", "no dates shown", "Roam already
   has X for these years". Not one of the 21 is answerable by someone who isn't a mechanic.

What changes (the chosen fixes, one per case, in §3): the number already confirmed on file settles the row and
its name; the page's own group row names the part; the page's own words set the place; the reads' dates are
ignored because the page's dates are what gets saved; and anything the page cannot settle quietly waits and is
tried again on the next upload of the same page — **without a question, a button, a browser check or a
proposal**. After that, the only owner-facing line left on a saved page is the one thing the owner can actually
act on: *"Roam needs one more page — this one stops at 05.2019."*

**Rev 2 (27 Nov 2026, Claude review): no guessing anywhere.** The owner's rule: if Roam can't prove it from the page or
from what's already confirmed on file, it's skipped, never guessed. Three changes follow from that, and they're
written into §3.6, §3.8 and §3.3:

1. **The parking brake rule must be proved on the page too (§3.6).** `impliedAxle` today fills in "rear" from the
   part's name alone, which is car knowledge, not something the page prints. It now fills in "rear" only when
   the page's own section heading or group row says REAR (for example "REAR DRUM BRAKE"). Otherwise the row is
   skipped. The strut rows on the Roomy page don't say REAR themselves, so whether they keep saving depends on
   that page's heading (§3.6).
2. **"Roam already has a different number" is not "Already on file" (§3.8).** 04906-B1100 is a different part (a
   cup kit), and it isn't on file. It's shown as **Not saved** with that plain reason and no button.
3. **Skipped rows are counted, not hidden (§3.3, §4).** One folded line with no button: *"Roam skipped 2 rows it
   couldn't prove from the page."* The owner knows something was left out, and a fault can't hide behind it.

Build order: the P4 filler-word fix (§2, `KIT` / `SET` / `ASSY` / `BRAKE` never name a type) goes in **first**,
because the name rules in §3.1–§3.2 rest on it.

The two rows from the report, settled by these rules:

| Row | Today | After the fix |
|---|---|---|
| 04495-B1310, 11.2016–05.2019 | **Needs you** · "Brake pads · rear" · *The two reads don't agree* · Check this part → opens a browser check for rear brake pads, a part this car doesn't have | **Already on file** · "Brake shoes · rear" · no button |
| 04906-B1100, 11.2016–09.2020 | **Needs you** · "Rear wheel cylinder kit · rear" · *The two reads don't agree* · Check this part | **Not saved** · "Roam already has a different number here (04474-B1060)" · no button |

Where to look in the code (for whoever builds the fixes): `supabase/functions/_fleet-server/saved_page_proof.ts`
(P4, P5), `research_saved_page_routes.ts` (the two reads, Already on file, the conflict checks, the save),
`saved_page_on_file.ts` (the on-file lookup), `saved_page_phrases.ts` (the page's own name),
`apps/admin/src/components/admin/research-engine/SavedPageOverlay.tsx` (the Needs you section).

---

## 1. What the live database says about the two rows

### 1.1 The upload

| | |
|---|---|
| Upload | `research_saved_page` id `7dabc68e-f8cf-4d8e-976b-8751c3b0c458`, 27 Nov 2026 08:40 UTC |
| Page | `https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/147989/chassis/4706` |
| Car | `vehicle_catalog` `3cd9cbf3-a804-4817-82db-400cf6abf13a` (Toyota Roomy, M900A) |
| Counts | saved 6 · already 13 · held 2 · not a Roam type 7 (28 rows) |
| Earlier upload of the **same page** | id `026d413b-338b-4d38-abe5-76bb520ad2ef`, 27 Nov 2026 00:50 UTC · saved 9 · already 5 · held 7 (28 rows) |

The two held rows are the two from the report. Everything else on the page settled.

### 1.2 What is stored for them

| | Row 1 | Row 2 |
|---|---|---|
| line | 71 | 92 |
| stored part type | **Brake pads** | Rear wheel cylinder kit |
| stored place | rear | rear |
| number | 04495-B1310 | 04906-B1100 |
| dates | 11.2016 – 05.2019 | 11.2016 – 09.2020 |
| group row | `04495 - SHOE KIT, REAR BRAKE` | `04906 - CUP KIT, REAR WHEEL CYLINDER` |
| row as written | `Genuine Toyota 04495-B1310 - Brake pads, set 04495-B1310 (SUBS) \| M900 \| 11.2016 - 05.2019 \| 01` | `Genuine Toyota 04906-B1100 - Cup kit, rear wheel cylinder 04906-B1100 \| M900 \| 11.2016 - 09.2020 \| 01` |
| numberOk / datesOk / placeOk | true / true / true | true / true / true |
| readsAgree | **false** | **false** |
| reason | The two reads don't agree | The two reads don't agree |
| jobId | `b28ac120-b816-4c75-bdd2-14f540093db4` (opened 08:41, state `browser_check`, still open) | `1d39139f-89cf-48f8-b61b-80ebca4e2aba` (opened 00:50 from the earlier upload, state `auto_added`) |

So read A's number, dates and place were proved on the page in both rows. Only the yes/no flag failed, and
`chosen = a ?? b` means the values the owner reads are **read A's**.

### 1.3 Row 1 (04495-B1310): the field that differed is the **name**

Proof, from the earlier upload of the same page rather than from memory: at 00:50 the same line 71 stored
**Brake shoes**, and at 08:40 it stored **Brake pads**. Both uploads had `readsAgree = false` on that line. So
on this row the two reads never agreed; what changed between uploads is *which of the two names read A gave*.
The two candidate names are therefore "Brake shoes" and "Brake pads", which is exactly what the owner reported.

Why the page looks two ways at once — and this is the real cause:

* the **group row** is the catalogue's own name for the part: `04495 - SHOE KIT, REAR BRAKE` (this number is a
  shoe kit);
* the **row's own title** is the site's own translation of that same group: `Brake pads, set` — amayama calls
  the shoe kit "brake pads, set".

Read A followed the row title; read B followed the group row. Both are "on the page", so neither read invented
anything. And the model is right about the car: on file, 04495-B1310 is already confirmed as **Brake shoes ·
rear, 2016–2019**, alongside 04495-B2400 and 04495-B2430 (same group). Brake pads on this car are confirmed
**front only** (04465-B1190 and friends). The Roomy has drums at the back.

What the disagreement cost on this upload:

* `Brake pads · rear` had no matching on-file listing, so the number/type pair never met the "Already on file"
  check (that check first requires the *same part type*);
* the axle was held, and the save path opened a browser check for **rear brake pads** — job
  `b28ac120-b816-4c75-bdd2-14f540093db4`, still open — for a part the car cannot have;
* the car's parts tile counts that open check as "needs you" (`ResearchPartsTab`, `counts.browser_check`).

The earlier 21 Nov job `082525b6-c0a8-4509-bea8-39c6bee090d7` ("Brake pads", rear) is the same phantom, and it
ended `failed`, which is the only way a rear-pads check can end on this car.

One more thing this upload shows: **at 00:50 the same row was already handled correctly** — it was listed as
"Already on file" (as Brake shoes) even though the reads disagreed, because the outcome loop
(`research_saved_page_routes.ts:713–728`) checks "same number on file" *before* it looks at the held reason.
The machinery for the safe answer already exists; it is keyed on the type read A happened to pick.

### 1.4 Row 2 (04906-B1100): the field cannot be recovered

At 00:50 the same line 92 had `readsAgree = true` with the same type, place and dates, and was held only as
"Roam already has 04474-B1060 for these years". At 08:40 it had `readsAgree = false` with **identical stored
values in every field the result keeps**. So whatever differed was a field the result does not keep:

* read B's part type (the group is `CUP KIT, REAR WHEEL CYLINDER`; there is no "Cup kit" type, so a read that
  answered `other` fails the comparison);
* read B's axle (`rear` vs `none` — the row's own line has no front/rear word, only the group row does);
* read B's side;
* read B's dates;
* read B's number;
* or read B simply not listing line 92 at all (the comparison is joined by `lineNo`, so a missing row is a
  disagreement).

Because the page proves the number, the dates and the place, whatever differed was almost certainly not a value
the page settles — but no bullet can be confirmed, because read A and read B are not stored.

### 1.5 Where the reads are (not) stored — checked, not assumed

| Place | What it keeps | The two reads? |
|---|---|---|
| `research_saved_page.result` | one `rows[]` of proved rows plus `counts`; each row has `numberOk / readsAgree / datesOk / placeOk` | **No** — one chosen set and a boolean |
| `research_page_read` | the *saved* evidence read (`block_text`, hashes, who checked) | No |
| `catalog_research_event` | `browser_check created`, `promote auto_added` only | No |
| any AI-call table | none exists in this database (checked `information_schema`) | No |

`result.rows[].readsAgree` is the only trace the disagreement ever leaves. That is why the same question can be
asked twice and never answered.

### 1.6 The comparison itself, exactly

`proveRows` (`saved_page_proof.ts:388–394` for an unknown type, `:471–477` for a known one) fails P5 unless
**both** reads list the line **and** all five of these are equal after normalising:

1. `number`
2. `partType` (the name, letters and digits only)
3. `axle` (`front` | `rear` | null)
4. `side` (`left` | `right` | `both` | null)
5. `dates` (`fromYear-fromMonth | toYear-toMonth`)

Not compared: `fitNote` and `groupLineNo` — a different note or group row is no disagreement. `side` *is*
compared even for a type with no sides, which is a bug of its own: P5 fails a row on a field the type never
uses. And because the join is by line number, **whether the row is listed at all** is the sixth, implicit way
to disagree.

---

## 2. Every way the two reads can disagree

| # | The field | What the page itself gives Roam | Can Roam settle it alone? | How |
|---|---|---|---|---|
| 1 | **Number** | The number is written on the row. P1 already proves read A's number is a whole number on that row and looks like a part number. Read B's number is never checked against the page. | **Yes, always** | Keep the number **the page writes**. A number that is not on the row is simply wrong — no question. If two numbers are on one row (a `(SUBS)` pair), the one already confirmed on file wins; with neither on file it quietly waits. |
| 2 | **Name (part type)** | The group row is the catalogue's own name (`SHOE KIT, REAR BRAKE`). The row's own title is the site's translation (`Brake pads, set`). | **Yes, nearly always** | First: the number is already confirmed on file → that listing's type (and place) wins. Otherwise the **group row** names the part: the candidate whose own naming word is in the group row's head wins (`SHOE` → Brake shoes; no `PAD` in it → not Brake pads). The row title may confirm but never names. If the group row names neither, it quietly waits. |
| 3 | **Dates** | `periodsOnLine` reads the dates off the row (P2). The saved dates are always the page's, never the reads'. | **Yes — they never matter** | Ignore the reads' dates entirely. A page with no dates stays held as "No dates shown" (SP-42), two ranges stays held (SP-48), dates outside the build stays dropped (SP-23). None of that needs a second opinion. |
| 4 | **Axle** | Front/rear words on the row or its group row (P3), or `impliedAxle` (a parking brake is rear), or nothing. Today's code takes read A's axle and only checks the word exists — so on `CYLINDER ASSY, REAR WHEEL BRAKE(FOR RH, FRONT OR UPPER)` the word `FRONT` is present and the read is what actually picks. | **Yes when the page writes one place word** | The page's word wins when exactly one of front/rear appears. When both appear (mounting notes like "FRONT OR UPPER") or neither does, a place-aware type quietly waits — a wrong axle is a wrong part, and no read can be trusted over a page that says both. |
| 5 | **Side** | LH/RH/left/right words on the row or group row (P3), or nothing. | **Yes when the page writes one side word** | Same rule as the axle. And for a type with no sides, the side is **not compared at all** — today a read that says "left" on a non-sided type fails P5 for nothing. |
| 6 | **Presence** — one read lists the row, the other doesn't (or lists it at a different line) | The row either is a part row on the page or it isn't: P1/P2/P3/P4/P6 prove it line by line. | **Yes, always** | The page is the evidence: if the page proves the row, save it; if it doesn't, P1–P4 already hold it with the page's own reason. A read missing a line changes nothing. |

Two smaller things this audit found on the way:

* **P4 can pass a type on a shared word.** `typeWords("Brake pads", "Toyota")` = `BRAKE, PADS, DISC, PAD, KIT`,
  because it merges the type name with `partFinder`'s catalogue words (`PAD KIT, DISC BRAKE`). The group row
  `SHOE KIT, REAR BRAKE` contains `KIT`, so **P4 passes for Brake pads** on a shoe kit. P4 answers "do the
  type's words appear anywhere", never "which type do the page's words name" — which is why it cannot catch the
  row that started this audit. Catalogue filler (`KIT`, `SET`, `ASSY`, `SUB-ASSY`) and the shared word `BRAKE`
  must never count as naming a type.
* **The save gate re-asks for read B's number.** `numbersFor` (`research_saved_page_routes.ts:859–870`) sends
  read 2's number as `valueAgain`, and `answersGate` refuses with `retype_mismatch` unless the two match
  (`research_browser_check.ts:500`). So even after P5 stops holding, a page-proven number would be refused at
  the gate whenever read B misread it — and the row would land in **Needs you** as "Roam couldn't save these
  numbers together". The Add path already does the right thing here: `saved_page_part_type_core.ts:465` sends
  `valueAgain: value`.

---

## 3. The one fix for each case

One fix per case. Each one is the safest of the options, and none of them can save a wrong number, a wrong place
or a wrong date.

### 3.1 The number is already confirmed on file → ok, no question

**The fix.** Look the number up on this car's confirmed listings **before** the part type is taken from a read —
same number, any type. Found → the row is **Already on file**, and the name and place shown are the on-file
listing's, not the read's. Not found → carry on with 3.2.

**Why it cannot save something wrong.** Nothing is written. The listing already on file is not touched. The name
printed is the name Roam already confirmed for that exact number.

**Owner sees:** `Brake shoes · rear · 04495-B1310 · 11.2016 – 05.2019 — Already on file`. No button. This one
fix settles row 1 of the report, whatever either read called it, and it makes the 08:40 upload behave exactly
like the 00:50 one did.

### 3.2 Only the name differs, the number is new → the group row names it

**The fix.** The group row names the part, because it is the catalogue's own name for it. Between the two names
the reads gave, keep the one whose **own head word** is in the group row's first comma segment
(`parseGroupPhrase().headWords`), singular or plural: `SHOE KIT, REAR BRAKE` → head `SHOE` → **Brake shoes**;
`PAD` appears nowhere in it → not Brake pads. Only when the row has no accepted group row does the row's own
title count. Words that name no type in particular (`KIT`, `SET`, `ASSY`, `BRAKE`, `REAR`, `FRONT`, `WHEEL`)
never count. P4 is narrowed the same way.

**Why it cannot save something wrong.** The number, dates and place are already proved on the page (P1–P3); the
only thing the name changes is which shelf the part sits on, and the shelf now comes from the maker's own words
in its own row.

**Owner sees:** `Saved · Brake shoes · rear · 04495-B1310`. Or, when the number is on file, `Already on file`.

### 3.3 Only the name differs and the page names neither → quietly waits, never asked

**The fix.** Nothing is saved, nothing is asked, no browser check, no proposal, no "Needs you" row, no button.
The line is kept in `result` with a group of its own (`left_for_later`, no `jobId`) and is tried again on the
next upload of the same page (R9 "Read again").

**Why it cannot save something wrong.** Nothing is written. A page that names a part two ways and gives no
naming word of its own has not been read — and a third read of that same text would see the same two names, so a
vote cannot settle it either.

**Owner sees (Rev 2):** not the part itself, but one folded line under the result with no button: *"Roam skipped N
rows it couldn't prove from the page."* It's a count, not a question: it isn't in Saved, it isn't in Needs you, and
it doesn't count toward "need you" in the title. Every quiet wait in §3.4, §3.6 and §3.7 adds to the same count.

### 3.4 The number differs → the page's row wins

**The fix.** Keep the number written on the row (P1 already proves read A's is there). If read B's number is not
on the row, read B is wrong — no hold. If **both** numbers are on the row, the one already confirmed on file
wins; with neither on file, the row quietly waits (3.3). Pass **the page's number** as `valueAgain` so the save
gate stops re-asking for read B's (`research_browser_check.ts:500`).

**Why it cannot save something wrong.** The saved number is always a number the row itself prints; a number that
is not on the row can never be saved. This is also what makes row 2 of the report safe: whatever read B said,
read A's number is on the row and is the page's.

**Owner sees:** the row saved with the page's number, or (two numbers on the row) nothing at all.

### 3.5 The dates differ → ignored

**The fix.** Delete the reads' dates from the comparison. The dates that get saved are read off the row by
`periodsOnLine` (P2) and never came from a read.

**Why it cannot save something wrong.** Nothing changes in what is written. The page's own date checks
(none / more than one range / outside the build) are untouched.

**Owner sees:** the row saved with the page's dates — or, if the page shows no dates or two ranges, nothing.

### 3.6 The place differs → the page's word wins, or it quietly waits

**The fix.** A place-aware type takes its place from the page: the row or group row says **one** of front/rear
(and left/right) → that word is the place, whatever either read said. Says both (mounting notes like
`FRONT OR UPPER`) or neither → quietly waits (3.3). A type with no place is not compared on place at all.

**Rev 2: `impliedAxle` needs the page's word too.** Today (`saved_page_proof.ts`, deployed 27 Nov) it fills in
"rear" from the words PARKING BRAKE alone. That's car knowledge, not a page fact. It now fills in "rear" only when
the page itself says REAR (and never FRONT) in the row's section heading, its group row or the row. Checked on
live (upload `7dabc68e…`): the strut rows themselves never say REAR (`47061 - STRUT SET, PARKING BRAKE SHOE, RH`),
and the result doesn't store the page's section heading. So the builder reads the heading from the page header
`proveRows` already gets. If that heading says REAR, the strut sets still save as rear left/right. If it doesn't,
they're skipped (§3.3), and the 6 saved on 27 Nov stay as they are. A parking-brake row on a page that never says
rear is skipped.

**Why it cannot save something wrong.** A saved place is now always a place the page prints. When the page says
both, no read is allowed to break the tie.

**Owner sees:** the row saved with the page's place, or nothing at all.

### 3.7 One read lists a row the other doesn't → the page says

**The fix.** Drop the presence comparison. If the page proves the line (number on it, one date range, the type's
words, the car's version), save it — one read missing a line is not evidence against the page. If the page
cannot prove it, P1–P4 hold it for the page's own reason, and per 3.3 that is a quiet wait.

**Why it cannot save something wrong.** Every surviving row still passes P1–P4 and P6 on the page text. A row
that only a read saw fails "the number isn't written on that row".

**Owner sees:** nothing about the disagreement.

### 3.8 A *different* number is already confirmed for that place and years → shown as not saved

**The fix (Rev 2).** Do not save and do not overwrite. The row is **not** on file, so it isn't shown as "Already on
file". It goes in a **Not saved** group with the plain reason `Roam already has a different number here
(04474-B1060)`: a fact with no button, and it doesn't count toward "need you".

**Why it cannot save something wrong.** Nothing is written and the existing listing is untouched. It is not sent
to the browser check either, because "which of these two numbers is the part" is a mechanic's question.

**Owner sees:** `Not saved · Rear wheel cylinder kit · rear · 04906-B1100 · 11.2016 – 09.2020 — Roam already has
a different number here (04474-B1060)`. No button. This settles row 2 of the report. §6's "two catalogue groups,
one Roam type" is why it can't be saved yet.

### 3.9 Keep both reads

**The fix.** Store read A and read B with the upload (per row: the five compared fields, as each read gave
them). The result screen never shows them; they exist so a disagreement can be looked at afterwards, and so a
future rule can be measured against real cases instead of guesses.

**Why it cannot save something wrong.** It writes no part data. It costs one JSON field on a row that already
exists.

**Owner sees:** no change.

---

## 4. Should anything still go in "Needs you"?

**No — not for any part.** Not for a disagreement, not for a missing front/rear word, not for no dates, not for
"Roam already has X", not for a type whose words don't appear on the row. All of those are Roam's own reading
work, settled by a page fact or by what is already on file; none is a question a non-mechanic can answer. The
live tally on 16 uploads: 21 rows ask the owner to judge a part, and **0 of the 21 are answerable**.

One owner-facing line stays, because it is the only thing the owner can act on, and it is not about parts at all:

> **Roam needs one more page.** This page stops at 05.2019 and the car runs to 09.2020. Open the section for the
> missing years and save that too.

That is a coverage gap (`placeGap` / "No number for this side"), and the action is "save another page", not
"judge a part". It carries one button — **Add from a saved page** — never **Check this part**.

Consequently:

* **Check this part** disappears from saved pages. It is the button that put a brake-pads check in front of the
  owner for a car with drum brakes.
* A save that fails for a system reason ("Roam couldn't save these numbers together", the old
  `research_page_read_owner_has_checker` fault that 32 rows on 2 uploads still carry) becomes **try again**,
  worded as a Roam problem, not a row in Needs you.
* **Not a Roam part type** stays as it is: a folded count with no buttons, already handled by the auto-sort.
* Rows that quietly wait are not a part list on screen: one folded count, *"Roam skipped N rows it couldn't prove
  from the page"*, with no button (Rev 2). They stay in the result for the next upload to retry.
* A row where Roam already has a different number goes under **Not saved** with its plain reason, never under
  Already on file (Rev 2, §3.8).

---

## 5. The tests to add (the two real rows as the cases)

Test fixtures keep the repo's rule (made-up numbers, no real chassis/frame, car model or staff name), so each
case below is the *shape* of a real row. The real page is then replayed by hand (5.3).

### 5.1 `supabase/functions/_fleet-server/research_saved_page_routes.test.ts`

The existing hook (`shockRun(db, page, { mutate })`, `mutate(rows, call)`) already makes read 2 differ — the
same pattern as §9 test 8, which is the test this audit changes.

| # | Test name | What it proves |
|---|---|---|
| 1 | `reads name the same shoe kit two ways; the number is on file → Already on file under the on-file name` | Row 1's shape. Page: group `… - SHOE KIT, REAR BRAKE`, row title `… brake pads, set`. Reads: "Brake shoes" / "Brake pads". The car's confirmed listing holds that number as Brake shoes · rear. Result: group `already`, partType `Brake shoes`, `counts.held === 0`, `catalog_research_job` empty, no proposal. |
| 2 | `reads name the same shoe kit two ways; the number is new → the group row's word names it` | Same page, number not on file. Result: saved under Brake shoes (group row head `SHOE`), never Brake pads. |
| 3 | `the group row names neither candidate → nothing saved and the owner is asked nothing` | Group `… - KIT, REAR` with a title that says pads, reads split. Result: `result.group === "left_for_later"`, `jobId === null`, `counts.saved === 0`, `counts.held === 0`, `part_listing` empty, `catalog_part_proposal` empty. |
| 4 | `read 2 prints a different number; the page prints read 1's → the page's number is saved` | Row 2's shape with a number that is on the row. Result: saved, that number only. |
| 5 | `both numbers are on the row and neither is on file → it quietly waits` | Same, `(SUBS)` twin. Nothing saved, nothing held, no job. |
| 6 | `read 2's dates differ → the page's dates are saved, no hold` | One range on the row; read 2 says another. Result: saved with the row's range, `readsAgree` no longer holds a row. |
| 7 | `read 2 says "none" on a place the page writes REAR → the page's REAR is saved` | Row 2's axle shape (only the group row says rear). Result: saved `rear`. |
| 8 | `the group says FRONT OR UPPER and REAR → a place-aware row quietly waits` | The real `CYLINDER ASSY … (FOR RH, FRONT OR UPPER)` shape. Nothing saved, nothing asked. |
| 9 | `read 2 says "left" on a type with no sides → the row still saves` | P5 side comparison removed for a `none`/`axle` scheme. |
| 10 | `read 2 never lists a row the page proves → it is saved` | Presence: `mutate` deletes line N from call 2. Saved. |
| 11 | `read 2 lists a row the page doesn't prove → it is held by the page, not by the reads` | The number isn't on that line: quiet wait, reason no longer owner-facing. |
| 12 | `a different number on file for the same place and years → Not saved, no button, "Roam already has a different number here"` | Row 2's real outcome (04474-B1060 / 04906-B1100 shape). Row group `not_saved` (not `already`), `counts.already === 0`, `counts.held === 0`, listing untouched (Rev 2). |
| 12b | `quiet waits are counted: result.skipped equals the number of rows left for later` | Rev 2 §3.3: the count the screen's folded line reads. |
| 13 | `§9 test 8 becomes: reads that disagree on a page-proven number no longer hold that axle` | Replaces today's assertion that the axle is held. |

### 5.2 `supabase/functions/_fleet-server/saved_page_proof.test.ts`

| # | Test name | What it proves |
|---|---|---|
| 14 | `P4: KIT, SET and BRAKE never name a type` | `rowNamesType(Brake pads, …, "04495 - SHOE KIT, REAR BRAKE", …)` is **false**; `rowNamesType(Brake shoes, …)` is true. The hole that let row 1 through. |
| 15 | `the group row's head word picks the name` | `parseGroupPhrase("SHOE KIT, REAR BRAKE").headWords` picks shoes, not pads; `CYLINDER KIT, REAR WHEEL` picks the cylinder-kit type. |
| 15b | `impliedAxle fills in rear only when the page says REAR` | Rev 2 §3.6: a parking-brake row under a rear brake heading → rear; the same row on a page that never says REAR → no axle, quiet wait; a page that says FRONT → no axle. Replaces today's name-only tests in this file. |

### 5.2b `supabase/functions/_fleet-server/research_saved_page_routes.test.ts` (one more)

| # | Test name | What it proves |
|---|---|---|
| 16 | `both reads are kept on the upload` | A disagreement stores read A and read B as each gave them; a page with quiet-wait rows stores them and writes nothing else. |

### 5.3 `apps/admin` and `e2e`

| # | Test | What it proves |
|---|---|---|
| 17 | `SavedPageOverlay.partTypes.test.tsx`: `quiet-wait rows show only as "Roam skipped N rows it couldn't prove from the page", with no button, and don't count as "need you"` | The screen half of §4 (Rev 2). |
| 17b | `SavedPageOverlay.partTypes.test.tsx`: `a "different number on file" row shows under Not saved with its reason, never under Already on file` | Rev 2 §3.8. |
| 18 | `SavedPageOverlay.partTypes.test.tsx`: `the only Needs you row is "Roam needs one more page" and its button is Add from a saved page` | The one owner-facing line left. |
| 19 | `e2e/dominion-saved-page-parts.spec.ts` screen 7: replace the "The two reads don't agree" fixture row with the coverage-gap row; add a case where a shoe-kit-shaped row ends **Saved** and a cup-kit-shaped row ends **Not saved** ("Roam already has a different number here"), with no "Check this part" anywhere | The owner's real path: the two rows from this audit, made-up numbers, no question. |
| 20 | `e2e` screen 6: the title never reads "… need you" for an upload whose only problems were disagreements | Title and pills. |

### 5.4 Live replay (by hand, after the fixes)

Upload the same saved file again for car `3cd9cbf3-a804-4817-82db-400cf6abf13a`, then check two things:

* 04495-B1310 → **Already on file**, "Brake shoes · rear", no button, and no browser check opened for rear
  brake pads;
* 04906-B1100 → **Not saved**, "Roam already has a different number here (04474-B1060)", no button;
* the 6 parking brake strut sets → **Already on file** (saved 27 Nov) if the page heading says REAR; if it doesn't,
  they're counted under "Roam skipped N rows", and the 6 already saved are untouched.

The two open jobs from before this audit (`b28ac120…` for rear brake pads, plus the older `082525b6…` already
`failed`) should end, not stay in the car's "needs you" count. That is a data cleanup for when the fixes go in,
and is not part of this review.

---

## 6. What this does not fix

* **Two catalogue groups, one Roam type.** `CYLINDER KIT, REAR WHEEL` (04474) and `CUP KIT, REAR WHEEL CYLINDER`
  (04906) both land under the type "Rear wheel cylinder kit", so the second one can only ever be "Roam already
  has…". A cup kit is a repair kit for the same cylinder; the type needs its own name or its own words before it
  can hold both. Not a reads problem.
* **The old save fault.** 32 rows on 2 uploads still say `new row for relation "research_page_read" violates
  check constraint "research_page_read_owner_has_checker"` — the AS-29 fault from 26 Nov, already fixed for new
  saves. Under §4 those become "try again", not a question.
* **The other 56 waiting rows.** 32 are the save fault above and 24 are page facts or coverage gaps; §4 removes
  the part-fact ones from the owner's screen but does not change how those rows are proved.
* **The second read itself.** It stays, and it stays useful — it is the only thing that notices a line one read
  skipped. §3 just stops it from overruling the page, and §3.9 stops throwing it away.
