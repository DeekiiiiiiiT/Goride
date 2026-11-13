# Cursor prompt — Toll Phase 3, P3-R3: Step 1 toll cards, sealed week + late items, take-backs, Toll health, states, phone

Build the rest of the Phase 3 screens. **Read first:**
- `docs/toll-phase3-screens-audit.md`: the rules, "What each button does", and the Keep / Drop / Add for **Screens 1, 9, 10, 11, 12, 13** and **M1, M2, M3**. Nothing listed under Drop may appear.
- The Stitch screens in `docs/stitch/toll-week-fleet/`. **Port the look exactly from each `code.html`**: row layout, chips, icons, cards. Don't simplify. P3-R2 had to be redone because rows were reduced to plain text.
- The reads (header of `supabase/migrations/20261113162537_toll_v2_screen_reads.sql`): `toll_v2_week_desk`, `toll_v2_weeks`, `toll_v2_import_reports`. Use the app's signed-in Supabase client.
- Reuse what P3-R2 built in `apps/fleet/src/components/fleet-financials/recon/tolls-v2/`: `api.tollV2Command`, `useTollV2Commands` (`VERSION_CHANGED` handling), the button components, the formatters and the decision toast.

Do not change any migration. Do not commit, branch or push. Don't run `pnpm test:toll` or reset the database.

## A. Step 1 Upload inputs, for a company on the new toll system (Screen 1, M1, M2, M3)
File: `apps/fleet/src/components/fleet-financials/recon/ReconSourcesStep.tsx`. **When `toll_v2_enabled` is false, change nothing.**

When it's true:
1. **Tag usage and Tag top-ups** (`toll_usage`, `toll_topup`):
   - Upload opens a file picker and sends the file to the new import, `api.importTollFileV2` (`POST /toll/v2/import`, kind `tag_statement` / `topups`, a new `command_id` per upload).
   - It **must not** open `BulkImportTollTransactionsModal` or write to the old toll ledger. If both systems got the file, every toll would count twice (B11).
   - After a successful import, mark the run source received **the same way the current toll upload does**. Find that call; don't invent a new one.
2. **Uber weekly reports** (`uber_bundle`):
   - keep `CloseWeekUberReimportDialog` exactly as it is (trips and earnings come from it);
   - **after** it succeeds, send the same `payments_transaction` and `trip_activity` files to `POST /toll/v2/import` (kind `uber`);
   - if the toll import fails, show a plain error on the card with a "Try the toll import again" button. The earnings import stays done.
3. **Cards** (port Screen 1's toll cards into the existing Step 1 card list; the rest of Step 1 stays as it is):
   - the result line comes from `toll_v2_import_reports(week)`: "12 tolls read · J$4,250.00 · 0 problems", "1 top-up read · J$5,000.00", "74 trips read · 11 toll paybacks · J$3,975.00";
   - an amber chip "n rows couldn't be used" and the problem rows when the report has problems;
   - buttons "See what was read" (M3) and "Replace file";
   - the "This week's files" summary card in the right column;
   - the line "Uploading the same file twice changes nothing."
4. **Problem rows:**
   - "Fix driver" opens **M1** (`docs/stitch/toll-week-fleet/fix_driver_dialog`). It lists the company's drivers; saving sets that driver's Uber driver id through the existing driver save (`api.saveDriver` / the driver route that writes `uber_driver_id`).
   - "Which car?" opens **M2** (`which_car_is_this_dialog`; it has no PNG, so port from `code.html`). Saving adds the file's plate (normalized: upper case, no spaces or dashes) to that car's `plate_aliases`. Add this to the vehicle save path on the server (`fleet.vehicles.plate_aliases text[]` exists), and make `buildUberCtx` (`supabase/functions/_fleet-server/toll_v2_import_lookups.ts`) map every alias to the car too. Add a Deno test for the alias lookup.
   - **Files aren't kept on the server.** So after a fix, the card says "Fixed — upload the file again to read these rows", and the button is "Upload the file again" (the import is repeat-safe: only the fixed rows are new). This replaces Stitch's "Read the file again". Claude will update the audit.
5. **M3 "What was read"** (`what_was_read_dialog`):
   - one import's `report` rows;
   - filter chips All / New / Already in / Problems with counts;
   - status words: `new` → "New"; `unchanged` and `trip_only` on a repeat → "Already in"; anything else → "Problem: <reason in plain words>";
   - "Show more" pages through the rows 50 at a time.

## B. A sealed week with late items, and Uber take-backs (Screens 9, 10)
In `ReconTollsV2Step` when `desk.sealed`:
1. **Screen 9:**
   - the "Sealed <date>" badge (the seal decision's date);
   - locked tiles;
   - Decided as a read-only table (no buttons);
   - "Period locked and sealed / Owner only" with **"Reopen tolls"** (red outline, owner only; check the permission the way the rest of Fleet does). It opens a danger dialog with a reason box → `reopen_week { week_key, expected_week_version: desk.weekVersion, reason }`. If the answer is `REOPEN_INSTEAD` (drivers already paid), show "Paid weeks can't be reopened — late items move to the open week."
2. **"Arrived after this week was sealed"** card, from `desk.late`:
   - `late_charge` → "A toll the provider sent late · <time> · <plaza> · J$…" with "Move to week of <openWeek>" → `carry_forward { from_week: desk.weekKey, kind: 'charge', charge_id, expected_charge_version }`;
   - `late_payback` → "A payback that came in late · …" with the same button → `carry_forward { kind: 'payback', payback_id, expected_payback_version }`;
   - `correction` → "Toll amount corrected by the provider · J$old → J$new" with "Move the difference to week of <openWeek>" → `carry_forward { kind: correction_down | correction_up (from direction), charge_id, expected_charge_version, amount_minor: newAmountMinor, reason_code: 'provider_correction' }`;
   - **when `desk.paid` is false**, the carry-forward is refused (`REOPEN_INSTEAD`). Show "Reopen tolls to add it to this week" instead of the move buttons.
3. **Uber take-backs:** from `toll_v2_weeks().takeBacks`. Show a card "Uber took back a toll payment" **at the top of the Tolls step of the open week** (and as the Toll health tile, part C). Each row: driver, amount, Uber reference, date, and "Record the take-back" → **Screen 10**:
   - the title "Uber took back J$370.00";
   - **a radio list of the take-back's `candidates`** (the payback it reverses: trip time, week, amount), since one is needed before anything else;
   - then the two bearer cards **"The driver pays it back" / "The fleet absorbs it"**. There's no "Uber still owes us" (audit Drop);
   - the reference and date, prefilled from the take-back;
   - Cancel, and "Record the take-back".
   - **The command depends on the chosen payback's week:**
     - week sealed and paid (`weekSealed && weekPaid`) → `carry_forward { from_week: candidate.weekKey, kind: 'take_back', payback_id, expected_payback_version, reference, paid_on, bearer }`;
     - week not sealed → `reverse_payback { payback_id, expected_payback_version, reference, paid_on }`. Check the exact body in `toll_write.intent_reverse_payback` (latest migration). In this case the bearer choice isn't sent: the reversal goes back into that open week, where the toll is decided again;
     - week sealed, not paid → disable the button and show "Reopen that week's tolls first".

## C. Toll health page (Screen 11)
- A new page under **Money › Tolls**, shown only when `toll_v2_enabled`. Find how Money's other pages are registered in Fleet's nav and router, and do the same.
- **Tiles** come from `supabase.rpc('toll_v2_metrics')`: tolls waiting for a decision, cash receipts to check, Uber paybacks with no toll, arrived after sealing, possible duplicates, and Uber take-backs not recovered (count from `toll_v2_weeks().takeBacks`). Each tile has its count, J$, the oldest one's age, and "Open week". The amber chip "Over 14 days" shows when the oldest is older than 14 days. Read the field names from `toll_system.company_metrics` in the migrations.
- **"Nightly money check"** comes from `toll_v2_weeks().nightly`: green "All checks passed last night at 4:25 AM", or red "1 check failed — <check name in plain words>" with "Open the week".
- **Weeks list** comes from `toll_v2_weeks().weeks`: week name, dates, toll count, J$ spend, chip "Sealed" / "n left to decide", "Still to decide J$…", and "Open". Open goes to that week in Week Reconciliation, step 3.
- **Drop:** everything in the audit's Screen 11 Drop list ("FY26-Q3", "Export audit ledger", "Toll rules & settings", "Run manual check", …).

## D. States (Screen 12), in place inside the Tolls step
- "Matching in progress…": the existing banner; it shows while `matcherBusy`.
- "Someone else changed this toll": the existing card.
- "This week is sealed": the Screen 9 badge plus "Reopen tolls to change it."
- "Nothing to do": `charges` empty and nothing late → the green card "No tolls this week."
- "Couldn't load tolls": the red card "Check your connection." with "Try again" (refetch). This replaces today's plain sentence.
- No "Tolls aren't on the new system yet" card: an off company simply gets today's step.

## E. Phone 390px (Screen 13)
- The Tolls step at 390px wide:
  - tiles 2 × 2;
  - each toll row a card with full-width buttons;
  - sections one under another;
  - a sticky bottom bar "n left to decide" + "Seal tolls".
- Use the app's own phone navigation; Stitch's bottom tab bar is a Drop.
- No horizontal page scroll.

## Tests
- **Step 1:**
  - v2 on: a tag upload calls `importTollFileV2` and never opens the old modal;
  - an Uber upload runs the old dialog and then the v2 import;
  - v2 off: unchanged.
- **M1** saves the driver's Uber id; **M2** saves the alias; the Deno test covers the alias lookup in `buildUberCtx`.
- **Late items:** each kind sends the right `carry_forward`; when not paid, it shows the reopen message.
- **Take-back:** the three week cases pick the right command or the disabled state.
- **Reopen:** sends `reopen_week`, and handles `REOPEN_INSTEAD`.
- **Toll health:** renders from fixtures of `toll_v2_metrics` and `toll_v2_weeks`.
- **States:** each one renders.
- **Phone:** a test at 390px width with no horizontal overflow, if the test setup can measure it; otherwise skip it and say so.
- **The Drop-word guard:** extend it with Screens 1, 9, 10, 11, 12, 13 and M1–M3 (for example "Batch engine", "Ingestion", "Roster", "Manifest", "Integrity", "Export Hash", "Corridor", "FY26", "Run manual check", "Cryptographic", "Uber still owes us").

## Run
- the `tolls-v2` + Step 1 vitest;
- the new Deno test;
- the Fleet typecheck: report the count before and after (must not go up), with 0 errors in `tolls-v2/`;
- `node scripts/edge-route-manifest.mjs --all --check` if you touched a server route (regenerate and include it if stale).

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
