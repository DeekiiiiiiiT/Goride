# Toll Phase 3 — screens audit

**Rev 3 · 13 Nov 2026.** Rev 3 cut the finished work and kept the status, the open items and the next steps. The full per-screen Keep / Drop / Add lists of Rev 1–2 are in git history (`ca100929`). The Drop words are enforced by `tolls-v2/tollsV2DropWords.test.ts`.

- **Designs:** `docs/stitch/toll-week-fleet/` (17 screens) — prompts `docs/stitch/toll-week-fleet-prompt.txt` + `toll-week-fleet-extra-prompt.txt`.
- **Code:** `apps/fleet/src/components/fleet-financials/recon/tolls-v2/`, `TollHealthPage.tsx`, the Step 1 toll cards in `ReconSourcesStep.tsx`.
- **Reads:** `supabase/migrations/20261113162537_toll_v2_screen_reads.sql`.
- **Tracker:** `docs/toll-architecture-pick-up-here.md`.

## Start here (new chat)
1. **Read this file, then `docs/toll-architecture-pick-up-here.md`** (its last section, "P3-R4 — real-screen check", has the exact test-copy setup).
2. **Uncommitted toll work (13 Nov), to commit first; toll files only:**
   - everything under `apps/fleet/src/components/fleet-financials/recon/tolls-v2/` (incl. the new tests `TollV2ChargeRow.test.tsx`, `TollV2SummaryPortal.test.tsx`, `dialogs/TollV2PickTripDialog.test.tsx`, `dialogs/tollTimingNote.test.ts`, `tollV2Format.test.ts`);
   - `apps/fleet/src/components/fleet-financials/recon/ReconRunPage.tsx`, `TollHealthPage.tsx`, `TollHealthPage.test.tsx`;
   - `supabase/functions/fleet-toll/index.ts` (rebuilt bundle);
   - `docs/toll-phase3-screens-audit.md`, `docs/toll-architecture-pick-up-here.md`, `docs/toll-build/cursor-P3-R4a-visual-fixes.md`.
   - **Leave out** the other work in the same folder (service items, parts / catalog, maintenance, `packages/types/src/index.ts` + `serviceItems.ts`, `fleet-core/routes.generated.json`, `fleet-ops/index.ts`, `.github/workflows/ci.yml`, the `service_items_*` migrations and tests). It belongs to another chat.
   - Branch `parts-auto-match`; push only when the owner says.
3. **The local database is shared with the owner's other chats.** Their tests reset it. Before a test-copy session, check that nothing else runs `supabase db reset` / `pnpm test:toll`. If the test fleet MM F01 is gone, redo the setup in the pick-up page.
4. **How the owner works** (from memory):
   - plain words in chat;
   - Stitch decides the look; the audit decides the content;
   - after Cursor's round, Claude checks the real screens and fixes look issues itself;
   - never leave dev / test servers running;
   - never commit screenshots (keep them in the scratchpad);
   - live SQL is a file the owner runs;
   - deploy only when the owner says.

## Where we are

| Part | State |
|---|---|
| Database reads (`toll_v2_week_desk`, `toll_v2_weeks`, `toll_v2_import_reports`, take-backs kept, plate aliases) | Built, tested (`toll_v2_screen_reads.sql`), committed `ca100929`. **Not live yet.** |
| Screens 1–13 + M1–M4 (Step 1 toll cards, Tolls step, 6 dialogs, sealed week + late items, take-backs, Toll health, states, phone) | Built (Cursor P3-R2/R3 + fixes), committed `0a7b92fa` |
| Real-screen check vs Stitch (test copy, real week of 24 Aug 2026) | **Done.** Cursor's R4a + Claude's own fixes: pick dialog wording and timeline, three-line rows, count words, driver name, phone seal bar, one path for completing step 3. 68 vitest pass. **Not committed yet.** |
| Click-through on real data | **Partly done.** Confirm all sure (5), the likely confirms (4), the two picks (resolved themselves), driver pays, seal. Every number right: J$3,975 Uber + J$275 driver = J$4,250. |

## Still to do, in order
1. **Commit** the R4a work + Claude's fixes + the rebuilt `fleet-toll/index.ts` (toll files only).
2. **Finish the click-through**, on the test copy with seeded cases the 24 Aug week doesn't have. Each button must run its command, and the numbers (tiles, progress, seal box, right column) must agree with `week_result`:
   - Step 1: a tag statement + top-up + Uber upload through the screen (the test fleet needs a toll tag and an Uber driver id for those cards to show); "See what was read" (M3); "Fix driver" (M1); "Which car?" (M2); "Upload the file again".
   - A cash receipt: Check → Receipt is fine (amount change) / Reject with a reason.
   - A duplicate pair: keep the tag one / keep both.
   - Undo from a decided row and from the toast; "Keep with no toll" and "Match to a toll" (M5) on a payback with no toll.
   - After the seal: a late toll / a late payback / a corrected amount → "Move to week of …" (the week paid, and not paid → reopen message); a take-back (three week cases); Reopen (owner / manager, `REOPEN_INSTEAD`).
   - A Delivery run completes step 3 once the week is sealed.
   - **Local limit:** the test-copy driver id isn't a uuid, so the driver pay-period rebuild fails locally and the close check shows `TOLL_SPEND_MISMATCH`. Use a uuid driver for this pass.
3. **`/code-review`** of Phase 3 (`512492ff..HEAD`, toll files).
4. **Live SQL** for `20261113162537_toll_v2_screen_reads` (Claude writes the all-or-nothing file, proven on a copy first), then **deploy** (push to `main`; edge + Fleet site).
5. **First company on v2.** The owner decides when, and which fleet; it's a separate step (Phase 3 exit in `docs/toll-architecture.md` Part D).

## Rules that still apply when changing these screens
- **Look and content:** Stitch decides the look; content comes only from the reads. No ids, hashes, scores, percentages, "Week 34", audit or export cards (the guard test lists the words).
- **Buttons:** primary = solid near-black; secondary = white with a border; Undo / Cancel / Reject / Reopen = red outline, and the final danger confirm is solid red. No text-only buttons, no browser pop-ups (the app's dialogs only).
- **Times:** "28 Aug, 12:22 PM" (Jamaica time). **Money:** "J$4,250.00" in Inter with tabular figures.
- **One screen:** the whole week happens inside Week Reconciliation.
- **The switch:** a company not on `tolls_v2` keeps today's Tolls step unchanged. The old toll screens are deleted only in Phase 5, once every company is on v2.
- **Week steps:** the real 8 step names, never Stitch's invented ones.

## What each button does (one command each)
| Button | Command |
|---|---|
| Confirm / a trip choice / Use this trip | `apply_suggestion` |
| Confirm all sure matches | `apply_suggestion` per row (goes on after a refusal; the toast says matched / changed / failed) |
| Driver pays / Fleet pays | `driver_pays` / `fleet_absorbs` |
| Match to a toll / Keep with no toll | `link_payback` / `leave_payback_unlinked` |
| Receipt is fine (+ changed amount) | `verify_cash_receipt` (+ `correct_charge_amount`) |
| Reject receipt | `reject_cash_receipt` (reason code + note) |
| Same toll / Different tolls | `confirm_duplicate` / `release_duplicate` (`charge_id` = the copy, `other_charge_id` = the one kept) |
| Undo | `undo_decision` with the row's `decision.undo` as-is |
| Seal tolls / Reopen tolls | `seal_week` / `reopen_week` |
| Move to week of … | `carry_forward` (`charge` / `payback` / `correction_down` / `correction_up`) |
| Record the take-back | sealed + paid week → `carry_forward` `take_back` (bearer driver / fleet); open week → `reverse_payback`; sealed, unpaid → reopen first |
| Upload / Upload the file again | `POST /toll/v2/import` (a new `command_id` per upload) |

A refused command (`VERSION_CHANGED`) never shows a success message: the list refreshes and the "Someone else changed this toll" card shows.

## Decisions made while building (keep them)
- **Uber take-back:** only "The driver pays it back" / "The fleet absorbs it". There's no "Uber still owes us"; the command has no such choice.
- **Rejected receipts and confirmed duplicates have no Undo** (final by design).
- **Receipt dialog:** only the amount is editable; anything else wrong is a reason to reject.
- **"The driver will see this reason in the app"** is dropped. The driver app doesn't show v2 reasons.
- **Files aren't kept on the server:** after Fix driver / Which car?, the person uploads the file again (repeat-safe).
- **Uber files go to both systems** for a v2 company (the existing trips/earnings import, then the toll import). Tag statements and top-ups go to v2 **only**.
- **Toll health tile "Uber paybacks not matched yet":** it counts every unmatched payback, including ones that already have a suggested toll. The Tolls step's "Uber paybacks with no toll" counts only those with no suggestion.
- **Step 3 completes in one place:** once the company week is sealed, the run page completes step 3 (Rideshare and Delivery), once per page load. A refused try is retried on the next visit.
- **The Delivery week** shows a card that switches to the Rideshare week (tolls are per company, sealed once).
- **The pick dialog's wording** compares the toll with the trip's start first: before the start → "…while driving to the pickup"; during → "…n mins before dropoff"; after → "…n mins after dropoff".

## Later
- **M5 "Match to a toll"** is built in the app's standard dialog style. The owner can design it in Stitch any time, and it's then ported like the others.
