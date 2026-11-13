# Toll Phase 3 — screens audit

**Rev 4 · 13 Nov 2026.** Rev 4 adds the click-through on the test copy (section "Click-through, Rev 4") and its fixes. Rev 3 cut the finished work and kept the status, the open items and the next steps. The full per-screen Keep / Drop / Add lists of Rev 1–2 are in git history (`ca100929`). The Drop words are enforced by `tolls-v2/tollsV2DropWords.test.ts`.

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
1. ~~Commit R4a~~ — done `ac3c2eb0`.
2. ~~Click-through~~ — done 13 Nov (Rev 4 section below). **The Rev 4 fixes are not committed yet.**
3. **Left from the click-through** (do on the next test-copy pass):
   - **Take-back on screen** (the three week cases). Its card shows only on the open toll week, and Week Reconciliation opens a week only after it ends; locally the open week was 9 Nov (not openable until 16 Nov). Money rules are covered by `toll_v2_carry_forward.sql` + the step tests.
   - **Step 1 problem rows**: "Fix driver" (M1), "Which car?" (M2), "Upload the file again". Needs a file with an unknown driver and an unknown plate.
   - **Delivery run** completing step 3 after the seal.
   - **Phone (390px)** look of the new sealed layout and late card.
4. **`/code-review`** of Phase 3 (`512492ff..HEAD`, toll files).
5. **Live SQL** for `20261113162537_toll_v2_screen_reads` (Claude writes the all-or-nothing file, proven on a copy first), then **deploy** (push to `main`; edge `fleet-core` + `fleet-toll` + Fleet site).
6. **First company on v2.** The owner decides when, and which fleet; it's a separate step (Phase 3 exit in `docs/toll-architecture.md` Part D).

## Click-through, Rev 4 (13 Nov, test copy, real week of 24 Aug)
**Setup used** (local only; `pnpm test:toll` resets it): MM F01 with a uuid driver (`d1f01000-…`, Uber id set, on 5179KZ), toll tag `212100286450`, the 4 plazas, `recon_v2` **and `recon_wizard`** flags, `tolls_v2` on, one past Uber import (so the Uber card shows), the test driver's login linked to the uuid driver. Setup SQL: `docs/toll-build/p3r4-testcopy-setup.sql` (header says how to run it). The Uber **trip** import can't run for this test car (it sends the plate as the car id), so Uber toll rows went in through `POST /toll/v2/import` directly and the Uber card was waived.

**Worked as designed:** tag + top-up uploads through Step 1 (repeat upload changes nothing); Uber toll rows 74 trips / 11 paybacks / J$3,975.00; matcher ran inline; receipt fine with amount change (J$370 → J$350, spend +J$350); reject with reason; automatic duplicate (cash within 10 min of the tag → never charged); review pair → "Same toll"; Keep with no toll; Match to a toll (M5); Undo from a row, from the toast and from the undo dialog; confirm-all; seal; late payback + late cash toll moved to the open week (week paid); Reopen refused on a paid week and allowed on an unpaid one. **Every number agreed:** J$3,975.00 Uber + J$275.00 driver + J$350.00 fleet = J$4,600.00 spend.

**Fixed (uncommitted):**
| # | Found | Fix |
|---|---|---|
| R4-01 | Step 1 cards in two narrow columns; buttons ran out of the card; "Uploading the same file twice…" sat outside the cards and broke the grid | v2 cards in one column (Stitch), toll results inside each card, the note once at the bottom, "This week's files" box no longer stretches |
| R4-02 | Card said "12 tolls read · **J$0.00**" | import report rows now carry `amount_minor` (reads migration, not live yet); the screen sums used rows only and leaves the amount out for older reports |
| R4-03 | After a v2 file upload, Step 1 kept saying **Missing** until the nightly check | recording an upload now queues a week refresh (`queueDeskRefresh`, guard test `recon_register_refresh.test.ts`) |
| R4-04 | Uber Upload opened its panel at the very bottom of the page (looked like nothing happened) | for v2, the panel opens inside the Uber card |
| R4-05 | Receipt dialog showed `receipt:plz-…:<driver uuid>:R-1001` | the reader keeps `receipt_number`; the dialog shows only the number ("—" if none); invalid amounts can't be sent |
| R4-06 | Kept payback had no Undo and "Keep with no toll" had no toast; payback rows had no date | kept rows show who · when + red Undo; toast with Undo; rows start with the day ("29 Aug · Uber trip …") |
| R4-07 | A duplicate a person confirmed showed "—" for who/when | read adds the decider; automatic ones say "Found automatically" |
| R4-08 | One empty "Possible duplicates" card was half width | full width unless both empty cards show |
| R4-09 | Step 3 completion refused (409) right after sealing | the page reads the week fresh before completing and retries once on a version change |
| R4-10 | "Matching in progress…" on a sealed week | hidden once sealed |
| R4-11 | Sealed week didn't follow Stitch (empty work sections, Decided twice, late items at the bottom) | ported: tiles → late items → decided; empty sections and the second Decided list removed |
| R4-12 | Late items showed `trip:<uuid>`, no date, and called a driver cash receipt "a toll the provider sent" | Stitch card (count, explanation, chip, solid button) with plain lines |
| R4-13 | Reopen on a paid week showed "That toll command could not be completed." (server says `DRIVERS_ALREADY_PAID`, screen only knew `REOPEN_INSTEAD`) | both codes give the paid-week message; plain words for every server refusal |
| R4-14 | Toll health "Open the week" led to a week that can't open yet | says "Opens after Sun 15 Nov" until the week ends |

**Tests:** fleet recon + Toll health + services 130/130; toll-core 186; Deno guard 2; `pnpm test:toll` all ok (incl. two new checks in `toll_v2_screen_reads.sql`); no type errors in touched files.

**For Phase 4 (not Phase 3):** Reopen tolls leaves Week Reconciliation step 3 "Complete" — the recon server doesn't read the v2 seal yet. Money stays safe (paying drivers is refused until tolls are sealed, Phase 1).

**Separate from tolls (not changed):** the Uber card shows only after a fleet's first Uber import (`hasUberDrivers` counts trips / batches, not drivers' Uber ids), so a brand-new fleet can't upload its first Uber file in Step 1. The old Uber trip import sends the plate as the car id, which the car check refuses when a car's id isn't its plate (local test car only; live cars not checked — the live database tool wasn't connected).

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
