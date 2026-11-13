# Toll Phase 3 — screens port audit

**Rev 2 · 13 Nov 2026** (Rev 2: M1–M4 screens made and audited). The owner's Stitch screens: `docs/stitch/toll-week-fleet/` (13 screens + `DESIGN.md`), made from `docs/stitch/toll-week-fleet-prompt.txt`. Design: `docs/toll-architecture.md`. Pick-up page: `docs/toll-architecture-pick-up-here.md`.

## Rules for this port
- **Stitch decides the look:** layout, section order, cards, chips, spacing, colours, fonts and dark mode, ported exactly. **This audit decides the content:** every number, chip, row and button comes from real data or a real command listed here. Each screen has a **Keep / Drop / Add** list. Anything Stitch invented is dropped, and every drop is listed below; nothing is hidden.
- **One screen for the week.** Tolls are uploaded, checked, decided and sealed inside Week Reconciliation. Nothing sends the person to Data Center or another page.
- **Buttons look like buttons.**
  - Primary = solid near-black.
  - Secondary = white with a visible border.
  - Danger (Undo, Reject receipt, Cancel, Reopen tolls) = red border and red text; the final confirm in a danger dialog is solid red.
  - No underlined or grey text-only buttons.
- **No browser pop-ups.** Every confirm uses the app's dialog (`useConfirm` / `alert-dialog`).
- **The existing Week Reconciliation frame stays:** the step rail with its **real 8 step names** (1 Upload inputs, 2 Service lines, 3 Tolls, 4 Tag account, 5 Fuel, 6 Trips & earnings, 7 Settlement, 8 Close week), the breadcrumb and the week header. Stitch renamed steps on some screens ("Fuel index", "Disbursement sheet", "Final ledger seal", "Earnings & Fares"…): **Drop** those names everywhere.
- **Step 1 Upload inputs keeps its existing design.** The toll cards on Stitch Screen 1 add their result lines and problem rows into the existing Step 1 cards; the rest of Step 1 stays as it is.
- **Step 4 Tag account keeps its existing design** (no new screen).
- **The switch decides which Tolls step a company sees** (B11). A company on `tolls_v2` sees these screens. A company not on it keeps today's Tolls step exactly. Today's Tolls step and its 41 `toll-tags/reconciliation/` components are **deleted in Phase 5**, once every company is on v2. It can't be deleted earlier, because companies still on the current system use it. This is the one exception to "delete the old design outright".
- **Words on screen:** plain words only. No ids, hashes, codes, scores or percentages (no "98% confidence", no "OCR 99%", no "#WK34", no "SHA-256").

## Screen map

| Screen | Stitch folder | Area |
|---|---|---|
| 1 | `step_1_upload_inputs_roam_fleet` | Step 1 toll cards: what was read, problem rows |
| 2 | `step_3_tolls_half_way_roam_fleet` | Step 3 Tolls (the main screen) |
| 3 | `step_3_tolls_ready_to_seal_roam_fleet` | Step 3 Tolls, everything decided |
| 4 | `step_3_pick_the_right_trip_dialog_roam_fleet` | Pick the right trip |
| 5 | `step_3_check_a_cash_receipt_dialog_roam_fleet` | Check a cash receipt |
| 6 | `step_3_reject_a_receipt_dialog_roam_fleet` | Reject a receipt |
| 7 | `step_3_possible_duplicate_dialog_roam_fleet` | Possible duplicate |
| 8 | `step_3_undo_a_decision_dialog_roam_fleet` | Undo a decision |
| 9 | `step_3_sealed_week_with_late_items_roam_fleet` | Sealed week with late items |
| 10 | `step_3_record_a_take_back_dialog_roam_fleet` | Record a take-back |
| 11 | `toll_health_money_tolls_roam_fleet` | Toll health (Money › Tolls) |
| 12 | `states_of_the_tolls_step_roam_fleet` | States (rendered in place, not a page) |
| 13 | `step_3_tolls_phone_390px_roam_fleet` | Phone layout of Step 3 |

## What each button does (one command each)

| Button | Command (`POST /toll/v2/commands/:intent`) |
|---|---|
| Confirm (suggested match) | `apply_suggestion` |
| Confirm all sure matches | `apply_suggestion` once per sure match (each with its own `command_id`) |
| Trip choice / Use this trip | `apply_suggestion` for that pair, or `link_payback` when no stored suggestion |
| Driver pays / Fleet pays | `driver_pays` / `fleet_absorbs` |
| Match to a toll / Keep with no toll | `link_payback` / `leave_payback_unlinked` (reason required) |
| Receipt is fine | `verify_cash_receipt`; if the amount box was changed, then `correct_charge_amount` |
| Reject receipt | `reject_cash_receipt` (reason required) |
| Same toll — keep the tag one / Different tolls — keep both | `confirm_duplicate` / `release_duplicate` |
| Undo | `undo_decision` |
| Seal tolls / Reopen tolls | `seal_week` / `reopen_week` (owner only) |
| Move to week of … (late toll, corrected amount) | `carry_forward` kind `charge` / `correction_down` / `correction_up` |
| Record the take-back | `carry_forward` kind `take_back` with `bearer` |
| Read the file again / Replace file | `POST /toll/v2/import` (new `command_id`) |

Every command sends the record versions it was shown. A `VERSION_CHANGED` answer shows the "Someone else changed this toll" state and refreshes. Nothing else changes.

## Per screen: Keep / Drop / Add

### Screen 1 — Step 1 toll cards
- **Keep:** the toll card style; "Received" chips; the result lines ("12 tolls read · J$4,250.00 · 0 problems", "1 top-up read · J$5,000.00", "74 trips read · 11 toll paybacks · J$3,975.00"); the problem rows with their buttons; "Read the file again"; "See what was read" and "Replace file"; the "This week's files" card ("3 of 3 toll files received", "2 rows need a fix"); the line "Uploading the same file twice changes nothing."
- **Drop:**
  - "Weekly Ledger Clearance" (keep the existing Step 1 title "Upload inputs");
  - "Audit run #REC-2026-W34", "Kingston Metro Cluster", "Target: 30 Aug 2026 23:59 EST", "Manifest Log", "Audit History", "Stage 01 Week 34 Data Assembly";
  - the "Batch engine" card, the "Ingestion flow 87 / 89" card, the "Feed partition" card with percentages, "100% telemetry coverage", "Affects 2 driver balance books";
  - the "Roster context / Active Fleet: 42 Units / M. Sterling" photo card;
  - "Corrected data in hub?", "Manual OCR submissions", "Lane: Portmore Toll Plaza", "Deduplication hashing protects prior reconciliations";
  - "Blocked by 2 unmatched rows". Problem rows don't block: the import is partial and the good rows are in.
  - Renamed steps.
- **Add:**
  - the result lines come from the stored import report (read **R3**);
  - **"Fix driver"** opens a dialog to say which Roam driver this Uber driver is (it saves the Uber driver id on that driver) → **screen to make (M1)**;
  - **"Add car"** becomes **"Which car is this?"**, a dialog to pick the fleet car this plate belongs to → **screen to make (M2)**;
  - "See what was read" opens the row-by-row report (new / unchanged / problem) → **screen to make (M3)**;
  - "Cash toll receipts" shows the count of driver-app receipts for the week and a secondary "Go to Tolls" button.

### Screen 2 — Step 3 Tolls (main)
- **Keep:**
  - the layout (rail left, step middle, summary right);
  - the five tiles with their sub-lines ("12 total transactions", "5 verified matches", "0 assigned", "0 absorbed", "7 items remaining");
  - the progress bar with "5 of 12 tolls decided · 7 left" and "42% completed";
  - the seven sections in order with their rows, chips and buttons;
  - the toast "Matched … Undo";
  - the seal box (sum line, "Before you can seal" list with "Show tolls" / "Show receipts", the disabled seal button);
  - the right column "Driver toll charges" and "Tag account" with "Go to Tag account";
  - the two empty cards "Possible duplicates" and "Uber paybacks with no toll" side by side.
- **Drop:**
  - "Reconciliation Workspace", "Audit Session ID: REC-2026-W34-TOLL", "Dual-entry Immutable Ledger", "Auto-saved";
  - the left "Toll policy" card (its text about deadhead and recouping isn't how v2 decides);
  - the right "Highway 2000 corridor" rates card;
  - "Accept all 4": only **sure** matches get a bulk button, and these are "likely";
  - "Verified against trip records";
  - "Toll balance equation / Verification Lock Requirement / Step 3 of 8 Status", replaced by the plain heading "Seal tolls";
  - "Sealing tolls writes permanent audit journal lines for Week 34…", replaced by "After sealing, this week's tolls can't change.";
  - "Week 34" anywhere.
- **Add:**
  - **"Undo" is a red-outline button** (Stitch drew red text only);
  - **"Pick another trip" is a secondary button** (Stitch drew grey text);
  - "Confirm all sure matches (n)" appears at the top of "Suggested matches" only when sure matches exist;
  - each "Decided" row's chip shows the real decision ("Matched", "Driver pays", "Fleet pays", "Kept with no toll", "Receipt rejected");
  - the "Show" buttons scroll to the section.
- **Confidence words** (no numbers on screen):
  - "Sure match" = the matcher's `sole_candidate` and an on-trip window;
  - "Two trips fit" = two or more current suggestions for the charge with the same top score, or one trip fitting two tolls;
  - otherwise "Likely match".

### Screen 3 — ready to seal
- **Keep:**
  - the tiles at zero-left;
  - the full progress bar;
  - the collapsed section list ("Toll triage workflows", "6 of 6 cleared" with each section's line); call it "Sections" (Drop the word "workflows");
  - the "Decided (13 items)" list with its three peeking rows and "View all 13 decided records";
  - "Everything adds up perfectly." with its sub-line;
  - the seal button "Seal tolls for Week of 24 Aug 2026";
  - "Driver toll charges" with "1 personal toll will be … deducted on Step 7", reworded to "Charged to the driver in Step 7 Settlement";
  - the Tag account card.
- **Drop:**
  - **the layout change:** this screen moved the step rail under the tiles. Port Screen 2's layout (rail on the left, full height) for both screens, so the step doesn't jump between states;
  - "Pre-seal validation complete", "Audit trail (13 events)", "Export CSV";
  - the "Toll policy rules" card and the "Toll plaza index" card (made-up rates, including "May Pen East J$220");
  - "Off-duty", "Personal trip / off-duty", "TJ-88421" (show the real tag account name instead), "(Week 34)", "12 passages";
  - "Sealing tolls writes permanent audit journal lines for Week 34 … next open reconciliation cycle" → "After sealing, this week's tolls can't change. Anything that arrives late moves into the open week."
- **Add:** Undo buttons with red outline; the rejected receipt shows its real reason label ("Photo unreadable").

### Screen 4 — Pick the right trip
- **Keep:**
  - the timeline (axis, toll marker, trip bars, pickup lead bands, legend);
  - the three radio cards with "Uber paid back J$370.00";
  - the computed lines ("Toll happened at 12:22 PM, 6 mins before dropoff", "Toll occurred 1 min before trip started while driver was arriving at pickup point");
  - the amber note "This trip also fits the 12:58 PM Portmore East toll";
  - Cancel and "Use this trip";
  - "1 of 2 tolls to resolve" (computed).
- **Drop:**
  - "Matches invoice line 04";
  - "Manual Adjust";
  - "institutional fleet reposition expense": use "Then choose Driver pays or Fleet pays";
  - the second half of the amber note ("Selecting this will leave 12:58 PM untied"): the other toll gets a new suggestion on its own.
- **Add:** "None of these" closes the dialog and moves the toll to "Tolls with no trip". The candidate trips come from read **R1**.

### Screen 5 — Check a cash receipt
- **Keep:**
  - the two halves;
  - the photo with zoom in, zoom out and rotate;
  - the fields;
  - the "Sent by … from the driver app" box and the "Once checked…" line;
  - "Reject receipt" and "Receipt is fine".
- **Drop:**
  - "OCR 99% CONF";
  - "Shift slip verification · Highway 2000 Westbound";
  - "HASH: 9c2a·004512".
- **Add:**
  - **Only the amount box is editable** (it saves via `correct_charge_amount` after `verify_cash_receipt`). Date, time, plaza, lane and receipt number are shown read-only: there is no command to change them, and a wrong one is a reason to reject.
  - The photo comes from the charge's `evidence.receipt_url` (a signed URL from the evidence store).

### Screen 6 — Reject a receipt
- **Keep:** the four reasons, the note box, "Go back" and "Reject receipt".
- **Drop:**
  - "Blurry / Dark";
  - **"The driver will see this reason in the app"**: the driver app doesn't show v2 receipt reasons today, so the line would be untrue.
- **Add:** the reason is sent as `reason_code` (`photo_unreadable`, `not_a_toll_receipt`, `already_claimed`, `other`), with the note.

### Screen 7 — Possible duplicate
- **Keep:**
  - the two cards (time, location, amount, the receipt thumbnail);
  - the "Same car, same plaza, 2 minutes apart" line (computed);
  - the explanation box;
  - the three buttons.
- **Drop:**
  - "Conflict #TL-2808", "Toll audit assistant";
  - "Electronic tag / Auto-Debit", "Telematics Transponder Feed", "Device ID TJ-88421";
  - "Cash submission / Driver Claim", "Mobile Portal Reimbursement", "Audit Proof · Manual Slip";
  - "Official rate" and "Cash gate fee" (use "Amount").
- **Add:**
  - **"Cancel" is a red-outline button** (Stitch drew plain red text);
  - **"Different tolls — keep both" gets a visible border**;
  - "Voucher ID" → "Receipt number" (real);
  - "Assigned K. G. Rattray" stays as "Driver".

### Screen 8 — Undo a decision
- **Keep:** the toll card with the car and driver, the decision chip, "Decided by …", the info line, "Keep it" and "Undo".
- **Drop:** "Toll resolution reversal", "Highway 2000 East-West Corridor", "Automated tag" (use "Tag").
- **Add:** "Keep it" gets a visible border.

### Screen 9 — Sealed week with late items
- **Keep:**
  - the sealed badge;
  - the locked tiles;
  - the "Arrived after this week was sealed" card with its three rows and buttons;
  - "Decided (13 items) · Read-only" as a table;
  - "Period locked and sealed / Owner only" with "Reopen tolls";
  - the Driver toll charges card with "Locked" and "Posted to driver statement";
  - the Tag account card.
- **Drop:**
  - "Ledger Batch #WK34-2026-SEALED", "Audit Trail", "Export Hash", "Immutable state";
  - the "Audit security check" card (integrity hash, signer);
  - the "Audit trail manifest" card (SHA-256, "Verify chain");
  - "Week 34 of 52", the renamed steps;
  - "Highway 2000 statement adjustment received 14 Nov", "Rider fare dispute clawback on trip #UB-94812", "Off-peak plaza rebate of J$25.00";
  - the made-up table rows ("Tag #99…", "Vineyards Plaza J$520.00", "#UB-7102"): the table shows the week's real decided rows;
  - "Plaza account statement reconciled";
  - "Reopening breaks audit seal and requires re-approval" → "Reopening lets you change this week's tolls again."
- **Add:**
  - "Reopen tolls" has a red outline and red text and opens a danger dialog with a reason box;
  - when the week's drivers are already paid, reopen is refused (`REOPEN_INSTEAD`), and the button says "Paid weeks can't be reopened — late items move to the open week";
  - the open week's name ("week of 9 Nov") comes from the current open week.

### Screen 10 — Record a take-back
- **Keep:** the title with the amount, the sub-line, the radio cards, "Uber reference", "Taken back date", "Cancel" and "Record the take-back".
- **Drop:**
  - **"Uber still owes us — we'll ask Uber"**: the take-back command only allows the driver or the fleet to bear it (`bearer` = `driver` | `fleet`). Two options remain;
  - "Creates a disputed recovery claim…", "Written off as fleet operational dispute expense";
  - "keeps the sealed audit hash #WK34-2026 intact" → "The sealed week stays as it was.";
  - the breadcrumb "Roam Fleet › Operations › Control Overview" (use the real week breadcrumb).
- **Add:** the driver option's line "Charged to Kenny Gregory Rattray in the week of 9 Nov" uses the real driver and open week.

### Screen 11 — Toll health (Money › Tolls)
- **Keep:**
  - the six tiles (icon, count, J$, age, "Open week");
  - the "Over 14 days" chip;
  - "All clear" / "Reconciled" chips on zero tiles;
  - the "Nightly money check · Passed" card;
  - the weeks list (week, dates, toll count, J$, state chip, "Open").
- **Drop:**
  - "FY26-Q3", "Corridor sync: operational";
  - "Export audit ledger", "Toll rules & settings", "Run manual check" (the check runs nightly on the server);
  - "142 tag transactions verified against GPS corridors and Uber telemetry";
  - "Disbursement status: Reconciled to driver payout";
  - the duplicate breadcrumb row "Roam Fleet › Operations › Control Overview".
- **Add:**
  - the breadcrumb "Money › Tolls";
  - "Open balance J$… unassigned" → "Still to decide J$…" from `week_result`;
  - tiles come from `public.toll_v2_metrics()`;
  - the nightly card and the weeks list come from read **R2**;
  - a failed night shows the red version: "1 check failed — <check in plain words>" with "Open the week".

### Screen 12 — States
- This is a board of states, not a page. Each state renders **inside the Tolls step**, in place of the sections.
- **Keep:** the six states' icon, title, line and button ("OK", "Try again"), and their colours.
- **Drop:**
  - "Reference catalog · Roam Fleet UI system v2.4", the tabs, "Inspect Schema";
  - "Legacy Mode", "SYSTEM_GATEWAY_V1", "Launch Legacy";
  - "Live Pipeline", "Parsing 84 transactions 67% complete" (there's no progress count; show a spinner);
  - "Concurrent Action", "Sync #10:48";
  - "Immutable Batch #WK34", "Finalized by Audit Desk";
  - "Zero Discrepancies", "AUTO-VERIFIED J$0.00";
  - "Gateway Timeout", "ERR_CONN_DROPPED";
  - the whole "Reconciliation pipeline context" card.
- **Add:**
  - "Tolls aren't on the new system yet": **not shown**. A company not on v2 simply gets today's Tolls step;
  - "Request Unlock" → "Reopen tolls" (owner only; others see no button);
  - "Matching in progress…" shows while the company's matcher queue isn't empty (read **R1**), and refreshes on its own.

### Screen 13 — Phone
- **Keep:**
  - the week header;
  - the step chips;
  - the 2 × 2 tiles;
  - the progress bar;
  - the toll cards with "Confirm match" and "Pick another trip";
  - "Tolls with no trip" with "Driver pays" and "Fleet pays";
  - the sticky "7 left to decide / Seal tolls" bar.
- **Drop:**
  - "98% Confidence" (the chip reads "Likely match");
  - "Fare adjustment credited";
  - "No trip recorded within a 45-minute window of plaza clearance" → "No Uber trip at this time. Who pays?";
  - "customarily recovered from the operator payout" → "Personal driving is usually paid by the driver.";
  - "Auto-Sync Active / Highway 2000 & Uber API connected / Healthy";
  - **the bottom tab bar (Reconcile, Vehicles, Treasury, Audit)**: Fleet has no such tabs; keep the app's own phone navigation;
  - "Synced".
- **Add:** the other sections (Pick the right trip, Cash receipts, …) stack in the same card style.

## Extra screens M1–M4 (made by the owner 13 Nov)
Prompt: `docs/stitch/toll-week-fleet-extra-prompt.txt`. Screens: `docs/stitch/toll-week-fleet/{fix_driver_dialog, which_car_is_this_dialog, what_was_read_dialog, confirm_all_sure_matches_dialog}`. "Which car is this?" came without a `screen.png`; port it from its `code.html`, which has the full dialog.

**All four (Drop):** the page Stitch drew behind them is made up, and none of it is ported. That covers:
- "Kingston Rideshare Fleet #4", "Operational", "Ops Workplace · Fractional Desk";
- "Week 35 (24–30 Aug 2026)", the top links "Vehicles / Drivers / Statements / Ledgers";
- the 4-step bar "1. Upload inputs / 2. Tolls & Trips / 3. Driver settlements / 4. Review & finalize";
- everything blurred behind the dialog ("Portmore Toll Pass #44091", "J$412,890.00", "Highway 2000 North-South Link"…).

Each dialog opens over the real Week Reconciliation page with its real frame and 8 steps. The serif look in the screenshots is a font fallback; the code says Inter, so use Inter.

| Screen | Keep | Drop | Add |
|---|---|---|---|
| **M1 Fix driver** | the "From the Uber file" card (name, "Uber driver · Seen on 6 trips this week"), "Search your drivers", radio rows with initials + name + plate chip, "Roam will remember this…", Cancel (red outline), "This is the driver" | — | **Saves the Uber driver id on the chosen driver** (`uberDriverId`, the field `driver_identity.ts` and the Uber reader already use), then re-reads the file; the problem row turns "Fixed". The list = the company's drivers only. |
| **M2 Which car is this?** | the "From the Uber file" card (plate, "Seen on 3 trips this week"), the car radio rows (icon, make and model, plate chip), "Roam will remember this plate for this car.", Cancel, "Use this car" | — | The Uber reader matches a car by its plate. A plate written differently in the file ("9042 PX") is fixed by normalizing it, so this dialog is for a **different** plate. **It saves the file's plate as an extra plate for that car.** That needs a small vehicle field, `plateAliases`, read by `buildUberCtx` (P3-R1 adds it). Then re-read. |
| **M3 What was read** | the title with file names and read time, the filter chips (All / New / Already in / Problems with counts), the summary line, the table (Row · What · When · Amount · Status), the "Fix driver" and "Which car?" buttons on problem rows, "Showing 6 of 76 rows", "Show more", "Close" | "Cryptographic ledger check passed" | Rows come from the stored import report (read **R3**). Status words: `new` → "New", `unchanged` / `trip_only` repeat → "Already in", a reader problem → "Problem: …" in plain words. |
| **M4 Confirm all sure matches** | the title with the count, the explanation line, the match rows (toll → trip, "Sure match" chip), the total "Total paid back by Uber J$1,755.00", "You can undo any of them afterwards.", Cancel, "Confirm 5" | "Auto-applies settlement", the chip "5 tolls reimbursed" | Each row is one `apply_suggestion` (its own `command_id`). If one is refused (someone changed it), the rest still go through, and the toast says "4 matched · 1 changed — list refreshed". |

## Work rounds
| Round | What | Who |
|---|---|---|
| P3-R1 | **Reads (database).** **R1** `public.toll_v2_week_desk(week)`: one call returns every section's rows for the screens — charges with state; the current suggestions with trip windows, payment method, paid-back amount and the confidence word; competing trips; decided rows with the decision, who and when; receipts with the evidence; review pairs; unlinked paybacks; after-seal items with the open week; seal blockers; the matcher queue count; and the numbers from `week_result`, so all of them agree. **R2** `public.toll_v2_weeks()` + the last nightly result. **R3** the stored import reports for a week. Company from the token only, `toll.view`. **Also:** `plateAliases` on vehicles, read by `buildUberCtx` (for M2). SQL tests + the nightly checks. | Claude |
| P3-R2 | Port Screens 2, 3, 4, 5, 6, 7, 8 into Week Reconciliation Step 3 (behind the switch), every button wired to its command (table above), the version-changed refresh, the toasts. | Cursor |
| P3-R3 | Port Screens 9, 10, 11, 12, 13 and the Step 1 toll cards (Screen 1), plus M1–M4. | Cursor |
| P3-R4 | **Done-test:** a Playwright click-sweep on a local copy seeded with the real week of 24 Aug 2026, on a v2 company. Every button on Screens 1–13 is clicked, and the test checks that its command ran and that the tiles, progress bar, sections, seal box and right column change together. It ends with a seal and a reopen. Then `/code-review`, live SQL for R1–R3, and deploy. Also a side-by-side of each Stitch screen against the live screen: every Keep / Add present, no Drop visible. | Claude + Cursor |

## Done when
1. The click-sweep passes, and every button on all 13 screens (+ M1–M4) runs its command.
2. Nothing listed under Drop appears on any screen.
3. A company not on v2 sees today's Tolls step unchanged.
4. The numbers on the Tolls step equal `week_result` for the week at every moment of the sweep.

## Later: screens not yet designed
| Screen | What's on it | Opened by | Built now as |
|---|---|---|---|
| M5 Match to a toll | "Which toll did Uber pay back?": the payback (trip, amount), radio cards of the week's undecided tolls, Cancel / "Use this toll" | "Uber paybacks with no toll" → "Match to a toll" | the app's standard dialog in the Undo dialog's style (P3-R2b). The owner can design it in Stitch any time; it's then ported like the others. |

## Changes found while building (13 Nov)
- **"Read the file again" → "Upload the file again"** (Screen 1, M1, M2). The server doesn't keep uploaded files, so it can't re-read one on its own. After "Fix driver" or "Which car?", the card says "Fixed — upload the file again to read these rows". Uploading the same file again is safe: rows already in stay "Already in", and only the fixed rows are new.
- **Take-back (Screen 10) needs a "which payback" choice first.** Uber's take-back row carries the driver, date and amount, not the trip, so the dialog lists the driver's paybacks it could reverse (`takeBacks[].candidates`). The command depends on that payback's week:
  - sealed and paid → `carry_forward` `take_back` (with the bearer);
  - still open → `reverse_payback`;
  - sealed but unpaid → reopen that week first.
- **Uber files go to both systems for a v2 company.** The existing Uber import (trips, earnings) runs as today, and then the same two files go to the new toll import. Tag statements and top-ups go to the new import **only**, because if both systems got them, every toll would count twice.
