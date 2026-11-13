# Cursor prompt — Toll Phase 3, P3-R4a: fixes from Claude's look at the real screens

Claude ran the Fleet test copy locally:
- a test fleet with the new toll system on;
- the real week of 24 Aug 2026 loaded (12 tolls, 11 Uber paybacks);
- the screens compared side by side with the Stitch designs in `docs/stitch/toll-week-fleet/`.

**Right:** the tiles, the progress bar, the suggested-match rows (plaza, plate chip, driver, amount, Tag chip, trip box, Sure / Likely chip, Confirm, Pick another trip), "Confirm all sure matches (5)", the empty sections with green checks, the seal box with its blockers, the Toll health tiles and weeks list under Money › Tolls, and the phone tiles and buttons. Nothing reached live data.

Fix these 11. Do not change any migration. Do not commit, branch or push. Don't run `pnpm test:toll` or reset the database.

**1. "Pick the right trip" rows are broken** (`TollV2ChargeRow.tsx`, the `pick` branch).
- **What's wrong:** the date and time wrap one word per line in a thin column ("28 / Aug, / 12:22 / pm"), "Portmore West" overlaps the "Choose trip:" label, and the plate chip is hidden under it.
- **Fix:** port the row from `step_3_tolls_half_way_roam_fleet/code.html`:
  - left: the tag icon, "28 Aug, 12:22 PM · Portmore West", the plate chip, the driver, the amount, and the amber "Two trips fit" chip;
  - right: "Choose trip:" above the two trip buttons, then "Compare on a timeline".
  - Nothing wraps at 1440px, and nothing overlaps at 1024px.
- **Test:** a render at 1024px wide where the date text is on one line (check the element's height, or that it has no wrapping class).

**2. Section order** (`TollV2Sections.tsx`).
- **What's wrong:** the two small cards "Possible duplicates" and "Uber paybacks with no toll" sit at the top, above "Suggested matches".
- **Fix:** Stitch has them **after** "Cash receipts to check" and before "Decided". The order is: Suggested matches, Pick the right trip, Tolls with no trip, Cash receipts to check, [the two small cards side by side], Decided.

**3. Times are written "3:02 pm".** Use **"3:02 PM"** everywhere in `tolls-v2/` (rows, trip pills, dialogs, toasts, decided rows): "25 Aug, 3:02 PM", "Uber trip 2:42 PM–3:12 PM".

**4. Money looks like code.** Amounts use a monospace font (`font-mono`). The design uses Inter with tabular figures. Replace `font-mono` with `tabular-nums` on every amount in `tolls-v2/` and `TollHealthPage.tsx`.

**5. The step question.** For a company on the new system, the step's question is **"Who pays each toll this week?"** (Stitch Screen 2). Today it still shows the old "Does every toll match a trip, a refund or a dispute?" (from `ReconRunPage.tsx`'s step questions). Use the new question only when `tollsV2On`.

**6. "Driver toll charges" shows a driver code.** The right column shows "testcopy-driver-fleet-row" (the driver id) instead of "Kenny Gregory Rattray".
- **Fix:** use the name: take `driverName` from the desk's charges for that `driverId`. If there's none, use the Fleet drivers list the page already has. Never show an id.

**7. The Tag account card is cut down.** Stitch's right-column card has four lines: "Opening J$0.00", "+ Top-ups J$5,000.00", "− Usage J$4,250.00", "= Closing J$750.00", from `result.tagAccount` (`openingMinor`, `topUpsMinor`, `usageMinor`, `closingMinor`). Today it shows only "Week usage" and "Closing balance".

**8. The Pick the right trip dialog** (`TollV2PickTripDialog.tsx`, `TollV2PickTripTimeline.tsx`). Compare with `step_3_pick_the_right_trip_dialog_roam_fleet`:
- **title:** "Which trip was this toll on?" with a **close X**;
- **timeline:** **one row per trip** (the bars are stacked today), each bar labelled with its time and payment ("11:50–12:28 PM · cash"); a pickup lead band before each bar; the toll as a vertical line with a black label "Toll 12:22 PM";
- **radio cards:** each one shows the green chip **"Uber paid back J$370.00"**. Remove the repeated blue "Two trips fit" text inside each card;
- **computed lines:** one form for both cards. On the trip: "Toll happened at 12:22 PM, 6 mins before dropoff." Before the trip: "Toll happened 1 min before the trip started, while driving to the pickup." Today the cash card says "Toll occurred 32 mins after trip started.";
- **"None of these — decide who pays instead":** a **third radio card** (Stitch). It's not a red button; it isn't a danger action;
- **footer:** **Cancel = red outline**, and "Use this trip" = primary. When "None of these" is chosen, the primary button reads "Close", and the toll stays in its section.

**9. Phone: the sticky seal bar is missing.** At 390px, the bottom bar "n left to decide" + "Seal tolls" (Screen 13) doesn't show. It's probably behind the app's bottom nav. Place it just above the app's bottom nav, inside the page. It must be visible while scrolling the Tolls step.

**10. Toll health: the "Uber paybacks with no toll" tile counts paybacks that are only waiting for a confirm.**
- **What's wrong:** with the 24 Aug week loaded, the tile says **11** (J$3,975), while the Tolls step says "Uber paybacks with no toll: Nothing to review". That's because `toll_v2_metrics` counts every unallocated payback, including the 11 that already have a suggested toll. The two screens disagree.
- **Fix:** rename the tile **"Uber paybacks not matched yet"** (the number is right for that name). Its sub-line reads "Confirm their matches in the week". Keep "Open week".

**11. Toll health: the Nightly money check card disappears when no check has run.** Show it anyway, with a slate icon and "No nightly check has run yet". (A fresh copy has none; on live, one runs every night.)

## Tests
- **1:** the pick row at 1024px.
- **2:** the section order.
- **3:** a time format unit test ("3:02 PM", "12:22 PM", "12:05 AM").
- **5:** the question changes only for v2.
- **6:** a name, never an id.
- **7:** four lines.
- **8:** the dialog's radio "None of these", red-outline Cancel, the timeline rows.
- **10:** the tile label.
- **11:** the empty nightly state.
- Keep the Drop-word guard passing.

## Run
- the `tolls-v2`, Toll health and Step 1 vitest;
- the Fleet typecheck, with 0 errors in the touched files.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
