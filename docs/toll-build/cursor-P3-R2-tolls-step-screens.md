# Cursor prompt — Toll Phase 3, P3-R2: the new Tolls step (Screens 2–8 + M4)

Build the new Tolls step of Week Reconciliation for companies on the new toll system. **Read first:**
- `docs/toll-phase3-screens-audit.md`: the rules at the top, "What each button does", and the Keep / Drop / Add lists for **Screens 2, 3, 4, 5, 6, 7, 8 and M4**. The Drop lists are not optional: nothing listed under Drop may appear.
- The Stitch screens in `docs/stitch/toll-week-fleet/`: `step_3_tolls_half_way_roam_fleet`, `step_3_tolls_ready_to_seal_roam_fleet`, `step_3_pick_the_right_trip_dialog_roam_fleet`, `step_3_check_a_cash_receipt_dialog_roam_fleet`, `step_3_reject_a_receipt_dialog_roam_fleet`, `step_3_possible_duplicate_dialog_roam_fleet`, `step_3_undo_a_decision_dialog_roam_fleet`, `confirm_all_sure_matches_dialog`. **Port the look exactly** (`code.html` + `screen.png`); the content comes from the audit.
- The data: `supabase/migrations/20261113162537_toll_v2_screen_reads.sql` (header) — `public.toll_v2_week_desk(p_week)` returns everything the step shows.

Do not change any migration. Do not commit, branch or push.

## Where it goes
- `apps/fleet/src/components/fleet-financials/recon/ReconRunPage.tsx` renders the Tolls step today with `TollReconciliationLazy` (~line 738).
- **The switch decides** (B11): call `supabase.rpc('toll_v2_enabled')` once when the run page loads.
  - **Off:** keep today's code path exactly. Change nothing in `toll-tags/reconciliation/*` or `pages/TollReconciliation`.
  - **On, Rideshare run:** render the new component `ReconTollsV2Step` (new folder `apps/fleet/src/components/fleet-financials/recon/tolls-v2/`).
  - **On, Delivery run:** render a small card: "Tolls are reconciled once for the whole fleet, in the Rideshare week." with a secondary button "Go to the Rideshare week". The button switches the run to Rideshare inside Week Reconciliation; it never leaves the page.
- Keep the existing frame: the step rail with the real 8 step names, the breadcrumb, and the right summary column (`summaryTarget`).
- **Step done:** when the desk says `sealed`, call the existing `handleTollsPeriodFinished` path, so the run's step 3 completes like today. The rail's "Tolls locked" caption uses `desk.sealed` for v2 companies (not `getTollPeriodSeal`).

## Data and commands
- **Read:** `supabase.rpc('toll_v2_week_desk', { p_week: weekKey })` via the app's signed-in Supabase client (the user's own token; never the service key). React Query key `['toll-v2-desk', weekKey]`.
  - Refetch after every command.
  - While `matcherBusy` is true, refetch every 5 seconds and show the "Matching in progress…" state above the sections.
- **Commands:** add `api.tollV2Command(intent, body)` in `apps/fleet/src/services/api.ts` → `POST ${API_ENDPOINTS.toll}/toll/v2/commands/${intent}` with the auth headers, as the other toll calls do.
  - Every click makes one `command_id` (`crypto.randomUUID()`); a retry of the same click reuses it.
  - Send the versions the desk gave you (`version`, `paybackVersion`, `chargeAVersion` / `chargeBVersion`, the `undo` body as-is).
- **Errors:** read `code` from the 4xx body.
  - `VERSION_CHANGED` → refetch, and show the amber "Someone else changed this toll" card (Screen 12 style) with "OK".
  - Anything else → a toast with a plain sentence. Never show the code.
- **Button → command** (the audit's table; repeated here):
  - Confirm → `apply_suggestion { suggestion_id, expected_charge_version, expected_payback_version }`.
  - Confirm all sure matches (M4) → one `apply_suggestion` per sure match, one after another. If one is refused, carry on with the rest. The toast says "4 matched · 1 changed — list refreshed".
  - Trip choice / Use this trip → `apply_suggestion` for that suggestion.
  - "None of these" → close the dialog. The toll stays where it is until the person picks Driver pays or Fleet pays.
  - Driver pays / Fleet pays → `driver_pays` / `fleet_absorbs { charge_id, expected_charge_version, reason_code: 'personal' }` (Fleet pays: `reason_code: 'fleet_business'`).
  - Match to a toll → `link_payback { charge_id, payback_id, both versions }`.
  - Keep with no toll → `leave_payback_unlinked { payback_id, expected_payback_version, reason_code: 'no_toll_found' }`.
  - Receipt is fine → `verify_cash_receipt { charge_id, expected_charge_version }`. If the amount box was changed, follow with `correct_charge_amount { charge_id, expected_charge_version: <new version>, amount_minor, reason_code: 'receipt_reading' }`.
  - Reject receipt → `reject_cash_receipt { charge_id, expected_charge_version, reason_code }`. The reason codes are `photo_unreadable`, `not_a_toll_receipt`, `already_claimed` and `other`; send the note as `note`.
  - Same toll — keep the tag one / Different tolls — keep both → `confirm_duplicate` / `release_duplicate { charge_id: <the copy, the cash receipt>, expected_charge_version, other_charge_id: <the one kept, the tag toll>, expected_other_version }`. The pair's two ids and versions are in `desk.reviewPairs`. See `toll_write.do_duplicate` (latest in `20261113031959_toll_v2_carry_forward.sql`).
  - Undo → `undo_decision` with the row's `decision.undo` object as-is. Show Undo only when `decision.undo` is not null.
  - Seal tolls → `seal_week { week_key, expected_week_version: desk.weekVersion }`.
  - Before calling a command, check its exact body in the migrations (`toll_write.intent_*`). If the audit and the code disagree, the code wins: report the difference.

## What each part shows (from the desk)
- **Tiles:**
  - Toll spend = `result.spend.totalMinor`;
  - Paid back by Uber = the sum of `matched` allocations' amounts (equal to `result.bearers.platformMinor`);
  - Driver pays = `result.bearers.driverMinor`;
  - Fleet pays = `result.bearers.fleetMinor`;
  - Still to decide = the sum of `openMinor` over charges not in `decided`.
  - **They must add up to Toll spend.** If they don't, show a red line and report it as a bug.
- **Progress:** "n of m tolls decided" counts the charges (rejected and duplicate rows count as decided).
- **Sections:** group `charges` by `section`, in this order:
  1. `suggested` → Suggested matches;
  2. `pick` → Pick the right trip;
  3. `no_trip` → Tolls with no trip;
  4. `receipts` → Cash receipts to check;
  5. `duplicates` → Possible duplicates;
  6. `desk.paybacks` → Uber paybacks with no toll;
  7. `decided` (+ `desk.kept`) → Decided.
  - `awaiting_cash` rows go under "Tolls with no trip" with the line "Waiting for the rider's cash", and no buttons.
- **Confidence words:**
  - `sure` → "Sure match" (green);
  - `likely` → "Likely match" (blue);
  - `two_trips` → "Two trips fit" (amber).
  - Never show a score.
- **Trip pill:** `trip.requestAt`–`trip.dropoffAt` in Jamaica time ("2:02 PM–2:59 PM"), then the payment method, then "paid back J$…" from `paidBackMinor`.
- **Pick dialog (Screen 4):**
  - the timeline is drawn from the toll time and the candidate trips;
  - the lines "Toll happened at …, n mins before dropoff" / "…n min before trip started" are computed;
  - the amber note uses `alsoFits`.
- **Receipt dialog (Screen 5):**
  - the photo comes from `receipt.receipt_url`; use the helper the Fleet app already uses to show driver receipt photos (signed URL);
  - date, time, plaza, lane and receipt number are read-only; only the amount box is editable.
- **Decided rows:**
  - `decision.kind` → "Matched" / "Driver pays" / "Fleet pays" / "Receipt rejected" / "Duplicate";
  - `decision.by` and `decision.at` → "Deeki T · 13 Nov, 9:40 AM";
  - a rejected row shows its reason in words.
- **Seal box:**
  - the sum line uses the tile numbers;
  - "Before you can seal" lists `blockers` grouped in words ("7 tolls to decide · 1 receipt to check · 1 Uber payback to decide");
  - each group's "Show" button scrolls to its section;
  - Seal is enabled only when `blockers` is empty.
- **Right column:**
  - "Driver toll charges" lists `result.drivers[]` (`owesFleetMinor`);
  - "Tag account" comes from `result.tagAccount`, and "Go to Tag account" moves to step 4.

## Rules
- **Buttons:**
  - Primary = solid near-black.
  - Secondary = white with a visible border.
  - Undo / Cancel / Reject = red outline with red text; the final danger confirm is solid red.
  - No grey or underlined text buttons. (Stitch drew some as plain text; the audit's Add lists fix them.)
- **Dialogs:** every confirm uses the app's in-app dialog (`useConfirm` / `alert-dialog`). Never `window.confirm`, `alert` or `prompt`.
- **Time:** Jamaica time everywhere (`America/Jamaica`).
- **Money:** from minor units, "J$" with 2 decimals.
- **No made-up content.** Anything listed under Drop must not appear: no ids, hashes, scores, "Week 34", "Audit trail", "Export", "Toll policy" cards or plaza rate lists.

## Tests
1. **Component tests** (vitest + Testing Library) for `ReconTollsV2Step`, using a desk fixture built from the real week of 24 Aug 2026. Shape it like the migration's output; Claude's smoke-run numbers are in `docs/toll-architecture-pick-up-here.md`: 5 sure, 4 likely, 2 pick, 1 no trip.
   - Sections and counts render.
   - Tiles add up.
   - Every button sends the right command with the right body (mock `api.tollV2Command`).
   - `VERSION_CHANGED` shows the card and refetches.
   - Seal is disabled while there are blockers.
   - A sealed desk shows no buttons and no Undo.
   - Confirm-all goes on after one refusal.
2. **The switch:** off → today's `TollReconciliationLazy` renders (unchanged); on + Delivery → the card.
3. **A grep guard test** that fails if any Drop word from the audit (Screens 2–8, M4) appears in `tolls-v2/` (for example "Audit Session", "SHA-256", "Week 34", "Confidence", "OCR", "Verification Lock", "Toll policy"). Keep the list in the test file.

## Run
- the Fleet app's vitest for the touched files;
- `pnpm --filter fleet typecheck` (or the repo's Fleet `tsc` command). Report the error count before and after; it must not go up.

If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). Don't run `pnpm test:toll` or reset the database in this round.
