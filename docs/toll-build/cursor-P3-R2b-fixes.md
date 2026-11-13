# Cursor prompt — Toll Phase 3, P3-R2b: fixes from Claude's check of P3-R2

Claude checked P3-R2.
- **Right:** the switch wiring; every command and its body (versions, the undo body as-is, the duplicate copy/keep order, verify then correct); the four button styles; no browser pop-ups; no Drop words.
- **Not right:** **the look was simplified instead of ported**, and there are two logic bugs.

Open each Stitch `code.html` next to your component and copy its structure: the row layout, chips, icons, the trip box, section headers and empty cards. The content still comes from the desk (`docs/toll-phase3-screens-audit.md` Keep / Drop / Add).

Do not change any migration. Do not commit, branch or push. Don't run `pnpm test:toll` or reset the database.

## Logic bugs

**1. A Delivery week can never finish its Tolls step** (`ReconRunPage.tsx` ~line 158).
- **Cause:** the desk query only runs for Rideshare (`tollsV2On && line === 'rideshare'`), so on a Delivery run `tollsSealed` is never true and step 3 never completes. The Delivery week could then never be closed.
- **Fix:**
  - run the desk query for both lines (it's the same company week);
  - on a Delivery run, when `desk.sealed` is true, complete step 3 the same way `handleTollsPeriodFinished` does (once; guard against repeats);
  - the Delivery card shows "Tolls for this week are sealed" (with a green check) once sealed, and "Tolls are reconciled once for the whole fleet, in the Rideshare week." before that.
- **Test:** a sealed desk on a Delivery run completes step 3 exactly once.

**2. "Still to decide" counts unchecked cash receipts, so the tiles stop adding up** (`tollV2Tiles.ts`).
- **Cause:** an `unverified` receipt isn't in `result.spend` until it's checked (P3 posts on verify), but `stillToDecideMinor` adds its `openMinor`. With one receipt in the week, the red "do not add up" line shows.
- **Fix:** leave out `unverified` (and `rejected` / `duplicate`, as today).
- **Test:** the fixture with one unverified J$400 receipt still adds up.

## Look: port Stitch exactly (Screens 2, 3, 4)

**3. Charge rows** (`TollV2ChargeRow.tsx`). Today a row is two lines of plain text. Port the Stitch row from `step_3_tolls_half_way_roam_fleet/code.html`:
- a tag icon (a banknote icon for cash);
- date and time and plaza on the first line;
- a plate chip ("5179KZ") and the driver name;
- the amount in large tabular figures;
- the "Tag" / "Cash" chip;
- on the right, the bordered **trip box** (car icon, "Uber trip 2:02 PM–2:59 PM · card · paid back J$370.00");
- the confidence chip with its icon;
- "Confirm" (primary) and "Pick another trip" (secondary).

**4. "Pick the right trip" rows.** Stitch shows **the two trip choices as buttons inside the row** ("Choose trip: ✓ 11:50 AM–12:28 PM · cash trip / ✓ 12:23 PM–1:30 PM · card trip"). Clicking one applies that suggestion directly. Today there's one "Pick trip" button. Keep the dialog too: it opens from a small secondary "Compare on a timeline" button in the row.

**5. Decided rows.** Port the Stitch decided row:
- the green "Matched" chip (or "Driver pays" / "Fleet pays" / red "Receipt rejected");
- date, time, plaza and amount;
- the trip pill of the match ("Uber trip 2:42 PM–3:12 PM") from `decision.trip`;
- "Deeki T · 13 Nov, 9:40 AM" on the right;
- the red-outline "Undo".
- **Also:** the section header line "Verified against trip records" is a Drop. Leave it out.

**6. Section headers** (`TollV2Sections.tsx`). Each section card has the Stitch header:
- an icon;
- the title;
- a **count chip** ("4 tolls");
- the section **J$ total** (sum of `openMinor`, or of amounts for Decided);
- the **one-line explanation** under it, using the audit's lines ("The toll happened during an Uber trip, and Uber paid it back.", "Two trips fit this toll. Choose the one it belongs to.", "No Uber trip at this time. Who pays?", "The driver paid cash and sent a photo. It doesn't count until it's checked.").
- Today the header is a title and "n items".

**7. Empty sections stay visible** (audit rule: "Nothing is hidden").
- Today empty sections return `null`. Show each empty section as one line with a green check: "Nothing to confirm", "Nothing to pick", "Nothing to decide", "Nothing to check", "Nothing to review".
- "Possible duplicates" and "Uber paybacks with no toll" are the two side-by-side small cards from Stitch when empty (green check + "Nothing to review"), and full sections with their rows when not.
- Remove "None this week" and the dashed border.

**8. Tiles** (`TollV2TilesRow.tsx`). The sub-lines carry real counts, as in Stitch:
- "12 total transactions" (count of charges);
- "5 verified matches" (decided `matched`);
- "1 toll · Kenny G. Rattray" or "0 assigned" (driver pays);
- "0 absorbed" (fleet pays);
- "7 items remaining" (charges not decided);
- plus each tile's icon from Stitch.
- Today the sub-lines have no numbers ("total transactions").

**9. Seal box** (`TollV2SealBox.tsx`):
- **sum line** in the audit's form: "Spend J$4,250.00 = Paid back J$1,755.00 + Driver pays J$0.00 + Fleet pays J$0.00 + Still to decide J$2,495.00" (drop "Still to decide" when it's zero). Remove `tileSumLine`'s "Uber · driver · fleet · left = toll spend" form;
- **disabled button text:** "7 tolls left to decide" while blocked; "Seal tolls for Week of 24 Aug 2026" when ready;
- **ready message:** the Stitch "Everything adds up perfectly." box with its green check icon.

**10. Toast after a decision.** Stitch shows "Matched 28 Aug 6:05 PM toll (J$275.00) · Undo", with Undo as a red-outline button inside the toast.
- Add it for Confirm, trip choices, Driver pays and Fleet pays.
- The toast's Undo runs `undo_decision` with the new row's `decision.undo` after the refetch. If that's null, don't show Undo.

**11. Pick the right trip dialog** (`TollV2PickTripDialog.tsx`). Port the Stitch dialog:
- the **timeline**: an axis from 30 minutes before the earliest trip to 15 minutes after the latest, with tick labels; a black toll marker with its time; one bar per trip; a light "pickup" lead band of 45 minutes before each trip's request time; the legend "Cash trip / Card trip / Pickup lead";
- under each radio card, the computed line: "Toll happened at 12:22 PM, 6 mins before dropoff." / "Toll happened 1 min before the trip started, while driving to the pickup."
- Today the dialog has no timeline and no computed lines.

## Not designed — make it match the app

**12. "Match to a toll" picker** (`LinkPaybackPicker` in `ReconTollsV2Step.tsx`). There's no Stitch screen for it.
- **Today:** a bare overlay showing raw ISO dates (`c.occurredAt`) and a **grey text-only "Cancel"** (breaks the button rule).
- **Fix:**
  - build it with the same in-app dialog component and styles as the Undo dialog;
  - title "Which toll did Uber pay back?";
  - each toll as a radio card ("27 Aug, 12:50 PM · Spanish Town East · J$275.00");
  - Cancel = red outline, "Use this toll" = primary;
  - dates through `chargeWhen`.
- Add it to the audit's list of screens the owner may want to design later. Claude will add it to the audit.

## Tests to add or update
- each fix above has a component test where it can (bugs 1, 2, 4, 7, 8, 9, 10, 12);
- the Drop-word guard still passes;
- the fixture grows one unverified receipt and one empty section.

## Run
- the `tolls-v2` vitest;
- the Fleet typecheck: report the count before and after (must not go up);
- 0 errors in `tolls-v2/`.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
