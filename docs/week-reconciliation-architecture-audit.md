# Week Reconciliation — Architecture Audit

**Rev 30 · 2026-11-14 · Status: LIVE — Step 5 (owner real week-by-week test).** 3 empty weeks closed; 21 Sep at step 4 Tag account. See START HERE.

## ⏸ START HERE (paused 14 Nov 2026 ~16:30 UTC, owner on a break — new chat picks up here)

**UPDATE 15 Nov 01:53 UTC — Week of 21 Sep 2026 CLOSED** (Kenny: 33% after WRA-51, owed J$188.38 → Collect recorded, settled 0.00). Kenny's open weeks 28 Sep–9 Nov (not 12 Oct) re-queued so they rebuild at the fixed rate. **Next: Week of 28 Sep 2026** — Uber files (Replace file), TransJam "Sept 28 - Oct 4" usage + top-up; Tag account closing **9,214.00** (5,969 + 5,000 − 1,755). The text below is the 14 Nov state.

**Where the owner is:** Week of **21 Sep 2026** (Rideshare), on **step 4 Tag account**. Steps 1–3 complete (all 8 inputs green, tolls decided + sealed). Everything below is pushed and live (main `8dcb7c19`, edge deploy success).

**Exact next steps (one per reply, owner sends screenshots):**
1. Owner refreshes the 21 Sep page (step 4 Tag account). Opening should now say "(first week — enter the statement closing below; it sets the opening)" — no longer "starts at 0" / expected −595.
2. Owner types the **TransJam tag balance at the end of 27 Sep 2026** into *Statement closing balance* → **Save closing**. With no earlier saved closing, that figure anchors the account (opening = closing − 3,000 top-ups + 3,595 usage) and the step ties. If the owner does not know the balance, help find the nearest one they have (TransJam app / statement) — do NOT invent a number.
3. **Continue to Fuel** (step 5): 7 Roam card fills (J$35,000) + driver fills; review / finalize the Fuel week. Then step 6 Trips & earnings → 7 Settlement preview (driver Kenny Gregory Rattray — real money this time, check the numbers) → 8 Close.
4. Then the next open weeks, oldest first: **28 Sep, 5 Oct, 19 Oct, 26 Oct, 2 Nov 2026** (12 Oct is not open). For each: Uber files via the Uber card's Replace file (Uber cash refresh — also feeds tolls); TransJam usage + top-up CSVs. Owner's folders: `C:\Users\deeki\Documents\Business\Roam\Reports\Toll Tag\Usage\2026`, `...\Toll Tag\Top Up\2026`, `...\Reports\RideShare Trips\Uber\2026\<week>`. **Roam card weeks 19 Oct, 26 Oct, 2 Nov have no Roam statement yet** → Roam uploads it first in Fleet Admin → Gas cards → Statement import (`docs/roam-fuel-card-statement-audit.md`).
**14 Nov ~17:30 Jamaica — Tag account 21 Sep DONE:** closing **5,969.00** saved, opening 6,564.00, variance 0 (ties). Worked backwards from TransJam's live balance (tag …6450 Roomy 5179KZ, J$869.00 at 14 Nov 5:14 PM) − top-ups 28 Sep/12 Oct/27 Oct/10 Nov (4 × 5,000) + usage 28 Sep–14 Nov (25,100, incl. new file "Nov 9 - Nov 15 2026.csv"); forward walk lands on 869 and never goes below 0. Weekly closings for the next weeks: 28 Sep 9,214 · 5 Oct 5,154 · 12 Oct 7,619 · 19 Oct 4,629 · 26 Oct 3,619 · 2 Nov 1,279. The Toyota CHR tag (…6430) is NOT fleet — ignore it.
**WRA-48 · BUILT 15 Nov (owner asked to build before 28 Sep):** with an earlier closed week's closing, step 4 shows "Balance at the end of this week J$X" (opening + top-ups − usage) with **Confirm J$X** (saves the closing with `confirmedExpected: true`) and **TransJam shows a different balance** (the old typed box + variance actions). Saved + ties → green "Closing balance J$X saved — it ties" + Change balance. If toll files change after a confirm, an amber card offers to confirm the new figure. First week (no earlier closing) keeps the typed box. GET tag-account returns `statementConfirmedFromExpected`. Test `ReconTagAccountConfirm.test.tsx` (4). Note: run Fleet vitest from `C:\…` (capital C) — a `c:\` cwd loads React twice and react-query render tests fail. Original note:
**WRA-48 (to build after 21 Sep closes, owner agreed):** Tag account works out each week's closing itself (last closing + top-ups − usage), shows it with a **Confirm** button; owner types a number only if TransJam disagrees. One-time anchor = a live TransJam balance with its date/time, worked backwards through the uploaded files.
**WRA-51 · Critical · OPEN (found 14 Nov at 21 Sep step 7) — driver pay tier counts the wrong month.** Settlement preview said Kenny owes J$2,242.15; he was correctly paid J$3,237.22 on 27 Oct (bank transfer, verified, `fleet.transactions` 92bd6c4e). Earnings statement history: 27 Oct driver share 33,800.56 = 33% of 102,425.93; 14 Nov 04:06 UTC rebuild → 31,752.04 = 31%, same gross. Cause: since a0f92373 (27 Oct, unified-ledger read path) `loadLedgerEventsForDriverIds` returns **weekly summaries dated at the week's Monday** (`weekSummaryToCanonicalEvents`), and the tier uses month-to-date fares (`computeWeekCommissionShare`, `periodShareCash.ts:166`). The Aug 31–Sep 6 week (~J$76.9k) is now dated 31 Aug, so it drops out of September → Sep 1–27 ≈ J$291k < 300,001 → "High Performer" 31% instead of 33%. Same miss for every week after a month starts mid-week (28 Sep, 5/12/19/26 Oct, 2 Nov — the weeks still to close). Right answer for 21 Sep at 33%: driver share 33,887.18 → fleet owes 3,048.85 → after the 3,237.22 already paid, **Kenny owes J$188.37** (today's J$275 toll charge less J$86.63 for the 14 Nov extra trips), not 2,242.15. Owner must NOT Collect until fixed. **Fixed in code 14 Nov:** `loadLedgerEventsForDriverIds` now reads `ledger_range_summary` (one row per Jamaica day, range in −05:00) via new `rangeSummaryToCanonicalEvents` (`_shared/unifiedLedger/readApi.ts`); one loader feeds driver periods + the earnings seal engines. Live check: Sep 1–27 by day = J$367,626.98 → 33% (1–6 Sep = 76,609.30 was being counted in August; 1–4 Oct = 61,514.55 was being counted in September). Test `rangeSummaryTier.test.ts` (33% / 33,887.18 by day; the old Monday dating gives 31%). Settlement + finance-core tests green. After deploy: queue the 21 Sep driver week (`recon.touch_driver_week`), owner **Reseals** step 6, step 7 should read ≈ J$188 driver owes.
**WRA-53 · fixed (owner pushes):** after Collect on step 7 the week page stayed on "Updating 2 changes… Numbers as of 1 h ago" until the owner reloaded — `ReconRunPage.tsx` re-asked the server only when the calculator was paused or the desk not built, never while `calculator.pendingUnits > 0` (the projection poll only watches driver weeks, which were already fresh). Fix: the week read re-asks every 5 s while changes are waiting. 21 Sep: Collect J$188.38 recorded 01:21 UTC, period settled 0.00, desk published 01:24.
**WRA-51 live 15 Nov 00:01 UTC (2328391e):** 21 Sep rebuilt → driver share 33,887.18 (33%), Kenny owes **J$188.38**. **WRA-52 · fixed (f9e25700):** after the rebuild noted "statement 31% vs engine 33%" (`finance_recon_drift` earnings rows), Reseal signed the 33% statement but the drift rows stayed open → step 6 kept "not sealed" (`EARNINGS_ENGINE_DRIFT`). Fix: the seal route resolves that driver-week's earnings drift rows when the new statement is signed (closed), then re-saves blockers (`resolveFinanceReconDriftsOfKind`). Live 21 Sep cleared by one more driver-week rebuild (00:04 UTC); only SETTLEMENT_DRIVER_OWES 188.38 left.
**WRA-50 · fixed 14 Nov (uncommitted → owner pushes):** Step 6 **Seal earnings** sealed the statement (live `week_statements` v59 status closed 22:46 UTC) but the step kept "Earnings are not sealed" — the route never re-saved the driver's `recon.week_blockers`, so `EARNINGS_STATEMENT_UNVERIFIED` (computed 16:05) stayed. Toll seal and fuel finalize already refresh them (`seal_side_effects.ts`). Fix: `recon_routes.ts` seal-earnings now re-saves every driver's blockers for the week after the seal (`refreshDriverBlockersAfterSeal`, never fails the seal). After deploy: owner clicks **Reseal** once.
**WRA-49 (display, fix after the real weeks):** Fuel step on a week locked before the floor rule (21 Sep, locked 27 Oct v4) shows "Numbers don't balance". Live snapshot v4: spend 31,000 = gas card 15,000 + cash 16,000; company 27,718.03 + driver 3,281.97 = 31,000 exactly (old freeze kept the −1,815.04 over-explained inside Company keeps); km model (rideshare 28,711.58 + deadhead 1,173.75 + commute 1,098.92 + unattributed km 1,830.79 = 32,815.04) is 5.9% over spend. `FuelWeekMoneyStrip.tsx` splitTie only accepts company + driver + leakage = total for over-explained weeks. Fix: also accept company + driver = total (every dollar placed either way). Week stays locked (no reopen needed).
5. Heads-up from the owner's top-up files: "Aug 31 – Sept 6" holds a top-up dated **29 Apr**; "Oct 19" and "Oct 26" hold the **same** top-up (EAA3FBCCE3, 27 Oct) — check when those weeks come up.

**Closed today:** 13 Apr, 20 Apr, 27 Apr 2026 (empty weeks, self-approved).

**Fixed + live this session (14 Nov, in order):**
- `a1da2d94` calculator deploy was one version behind (push `:$BUILD_ID` before deploy).
- `36a8efde` Close week always said "Tolls reviewed before new data arrived" (`week_close_recon.ts` now spreads `{week: status}` coverage with `expandWeekCoverage`, same as the wizard).
- `c064cb1c` Fuel step tab counts = the week's fills (were all-time 377).
- `096d1acd` Tolls tile "Paid back by platforms" (Uber + InDrive both pay back).
- `0df22ef0` Continue spun for ever after the empty "Assign service lines" auto-skip.
- `07677e5d` toll reader: plaza names with a direction ("Portmore West" → "Portmore"); a fully refused toll file is no longer marked received.
- `50fe5ced` **edge deploy skipped toll-core / fuel-core / finance-core / types-only pushes** — now redeploys the fleet functions.
- `73cc2f4f` + migration `20261114141537_recon_ignore_calculator_version_moves` (owner ran it + logbook line): a calculator publish no longer makes the next click "WEEK_CHANGED".
- `edfbf97b` toll reader: TransJam top-up dates "21 Sep 2026 / 08:23 AM" on two lines, blank rows skipped, the refusal check counts every refused row. All 11 top-up + 15 usage files in the owner's folders read.
- `3c07a767`…`16ac8812` **Roam fuel card statement** (WRA-45 → `docs/roam-fuel-card-statement-audit.md` RF-01…RF-08): Fleet Admin → Gas cards → Statement import marks every Roam-card fleet's week received; Dominion keeps programs only; week page Roam card is read-only; 11 past statements (3 Aug–12 Oct) registered (`63e1e50c` added week_keys; owner ran the backfill SQL).
- `ed3077d8` the page takes the server's real week version after each change (`X-Recon-Week-Version`) — fixed WEEK_CHANGED part-way through confirming tolls.
- `8dcb7c19` Tag account: the first week's statement closing sets the opening (go-live adopted May–14 Sep as closed with no saved closing, so the opening was 0).

**Still open (fix after the real weeks close):**
- **WRA-46** — owner is asked for a reason on self-approve (`ReconApprovalDialog.tsx` + server Close/Reopen 8-character rule). Fix: the company owner skips the reason box; still logged Self-approved; staff unchanged.
- **WRA-47** — "Activity vs trips" card (step 6) shows Uber hours only; the Roam app records went_online / job events (`driver_activity_logic.ts`) but the card does not use them. Fix: add Roam hours to the card.
- Display: Settlement preview `$` not `J$` + raw date "2026-04-13"; Fuel Money Check `$`; Close week History raw "lane change:POST /fleet-fuel/…" lines; Tolls on an empty week "0 of 0 · 0% completed" (should read done).
- Tag account step has no render test for the first-week rule (covered by server tests + live use).

**Open items (not blocking the owner):**
- Settle from balance (step 7) lists only weeks with status fleet_owes; Kenny's later weeks where the fleet owes (19 Oct 37,191.13, 2 Nov 1,300) are still "pending" (not reconciled), so the list says "No open week the fleet owes" and the button stays grey. Correct to refuse (those numbers aren't final — WRA-51 changes October), but the wording should say "Later weeks the fleet owes aren't settled yet — close them first, or Collect".
- CI red since 14 Nov: "Dominion Stitch fidelity" fails `S20 75% labels — packages/platform-ops-ui/src/fleet-customer/GasCardsPage.tsx` (the Gas cards Statement import wording change, 16ac8812). Fix the labels to match the S20 screen.
- Done-tests 5, 6, 9t, 13 still need rework for the new toll system (old `importTolls` in `e2e/helpers/weekReconDoneTest.ts` → `/toll/v2/import`; test 6 flagged fill shows Clear too early).
- `fuel/periods/ensure` answered 500 twice in one test-6 run (likely a create race).
- Nightly finance check fails at 04:00 UTC (`finance-recon` selects `debit_account_key, credit_account_key` that `public.financial_events` never had) — its own audit.
- Accepted from WRA-43: a change made outside Week Reconciliation still waits for the nightly run.

**Fuel enterprise audit — owner asked 14 Nov, its OWN new audit file, start after the real weeks close:** bring fuel to the same level as the rebuilt toll system. Must cover: (1) the whole fuel system, (2) the **Fuel Policy / policies section** (coverage rules, personal allowance, who pays what), (3) **future Telematics** (week page card says "Coming soon") — design so real litres / odometer / trips from telematics can replace the km × efficiency estimate without a rebuild. Starting findings from 21 Sep: locked weeks are re-judged by today's money rules (WRA-49); the locked snapshot still says Draft / health Red / 5 pending; the company/driver split rests on km × estimated efficiency (21 Sep was 5.9% over) and nothing tracks that gap week to week; fuel money is one JSON bundle per week, not traceable ledger lines like tolls v2.

**After the real weeks:** back to `docs/toll-old-system-removal-audit.md` (round S3 → D1 → T1).

**Working rules learned:** owner is not a coder — short plain replies, one step at a time; owner pushes (`cd C:\Roam\Goride` then `git push origin parts-auto-match:main`); give live SQL for the SQL Editor (migrations end with the `schema_migrations` logbook line); never stage other chats' files (maintenance, parts, service items, `fleet-core` / `fleet-ops` routes.generated.json) or built `*/index.ts` bundles; after `deno test` run `pnpm install --frozen-lockfile`; Claude may read live data with the Supabase connector and gcloud read commands; **run the owner's real files through the reader before they upload** (`deno run --config deno.json` on the adapter with the file path) — today's toll-reader bugs were all found that way; keep CRLF files CRLF (`fuel_controller.tsx`) or the whole file shows as changed; Python is not installed — use Node for scripted edits.

---

## Rev 29 · 2026-11-14 · re-checked after the new toll system + old toll removal

- **Why now:** the live `feature_flag:recon_v2` row does not exist (owner checked 14 Nov), so Week Reconciliation and Toll Health are hidden on live. The owner's fleet is on the new toll system and the old toll pages are deleted (`docs/toll-old-system-removal-audit.md`), so on live there is **no screen to upload / decide / seal tolls** until this go-live is done. This audit now goes before toll removal round S3.
- **Code:** committed and on `main` (2b7d4b31 and later; toll Phase 3 reworked step 3 onto the new toll system).
- **Go-live Step 4.1 (11 migrations):** ✅ all 11 are in live `schema_migrations` (owner checked 14 Nov).
- **WRA-42 and WRA-44:** ❌ no longer apply. Both were about the old toll system (old dispute refunds, `toll_period_readiness_build.ts`), which is deleted; step 3 now seals in the new toll system.
- **WRA-43:** still open, and it now covers the new toll system: a toll decision or seal made through the new toll commands (`toll_v2_command_controller.ts`) never calls `recon_enqueue_week_desk`, so the week's numbers wait for the next nightly run. Same fix as below (the shared week check queues the week's calculator unit after a successful change), applied to the new toll commands too.
- **WRA-41:** still open (the Fuel step still has "This week is no longer on the list", `FuelReconciliationDashboard.tsx`).
- **WRA-43 fixed in code (14 Nov, uncommitted):** the shared week check (`recon_week_version_guard.ts`) asks for the week to be worked out again after every saved change made from Week Reconciliation (new toll commands included, they carry the week header); every service line of the week is asked, the one being worked in at once (it already has the 2-minute hold), the others after 120 s so a burst of edits ends in one publish; it runs after the answer (`EdgeRuntime.waitUntil`). One shared helper `recon_desk_queue.ts` makes every such request (upload refresh, worker re-queue, missing-desk sweep). The calculator drops a request that a build which **started** after it already covers (the build stamps `computeStartedAt` in the desk before reading; 5 s margin for clock gaps), so many requests = one publish. Correction: the upload refresh's 3-value call was **not** broken (the baseline has a 3-value database function too). Accepted: a change made outside Week Reconciliation (no week header) still waits for the nightly run.
- **WRA-41 fixed in code (14 Nov, uncommitted):** the week Week Reconciliation opens the Fuel step for (always its Monday) is added to the Fuel screen's own week list (real Monday–Sunday bounds and label, newest-first order) and to the server read range, so its lock and reviews come from the server like every other week; it is kept even with no fuel, but only once every fill has loaded (not after a failed or cut-short load). `FuelManagement.tsx`, `fuelPeriodStatus.ts` (`keepWeekStarts`).
- Tests: Deno `_fleet-server` + Fleet vitest green; two `/code-review` passes (20 findings, fixed or accepted above). WRA-41 + WRA-43 live 14 Nov (f1ffc67b, all deploys + CI green). Week calculator resumed by the owner 14 Nov.
- **Go-live Step 4.5 (Uber week fix) ✅ 14 Nov:** run on live with the new self-checking `supabase/scripts/recon_uber_batch_restamp_LIVE.sql` (backup in one KV row `recon_uber_restamp_backup:wra-09`, no table change; cancels itself unless 0 are left off-week). Result: before 37, after 0. Undo: `recon_uber_batch_restamp_LIVE_undo.sql`. Both rehearsed on a local database first (fix, refuse a second run, undo, cancel on an odd upload). The old `recon_uber_batch_restamp*.sql` (hand-added columns, psql-only) is not used.
- **Go-live Step 4.6 ✅ 14 Nov 03:28 UTC:** owner ran the switch SQL: `feature_flag:recon_v2` = `enabledForOrgs: [8cfa606a-…]` (owner's fleet only); `feature_flag:recon_wizard` was already on for all. Undo: `delete from kv_store_37f42386 where key = 'feature_flag:recon_v2';`. Decision: switched on before the last browser done-tests (5, 6, 9t, 13), because the old toll pages are gone and live had no toll screen; those tests are test-setup rework (old toll import, a fake flagged fill), carried as cleanup. **Step 5 (owner's real week-by-week test) starts now**, first job: the 3 old toll weeks (21 Sep, 28 Sep, 5 Oct) in step 3.
- **Fuel no-GPS save fix (14 Nov, d64f9247, live):** the "held" transaction for a fill with no GPS now carries the fill's company; before, that save answered 500 (`fuel_controller.tsx`).
- **Done-tests re-pointed at the new toll system (14 Nov):** the test seed puts the test companies on the new toll system; tolls are sealed with `seal_week` (`sealTollsWeek` / `tollWeekCommandAs` in `e2e/helpers/weekReconDoneTest.ts`); tests 6, 8d, 9b and `seed-week-recon-closable.mjs` updated. Test 6 now passes the WRA-41 point (the Fuel step shows the week) and then fails on a **new finding**: resolving the flagged fill answers 500 (`fuel-entries`: "transaction … is missing a company"; `fuel/periods/ensure` 500). Tests 5, 9t, 13 still import tolls the old way (`importTolls`) and need the new toll upload.
- **Next:** re-run the done-tests that cover them (5, 6, 9t, 13, re-pointed at the new toll step) → owner checks the week calculator is on and the Uber week fix (Step 4.5) → turn `recon_v2` on for the owner's company (Step 4.6) → owner redoes the 3 old toll weeks inside step 3.

---

This file now lists **only what is left**. Everything already built (Rounds 0–4c, the `recon_v2` switch, Revs 1–26) is in git history of this file (Rev 26, 2026-11-11) and in the code.

---

## 1. Where we are (one line)

All the code is written and on disk (not committed): data, server, screens, approvals, alerts, the `recon_v2` switch. 17 of 21 browser done-tests pass on the private copy. What's left: 3 open problems in how the toll and fuel screens fit the week (Step 2), the last 4 tests, then commit and go-live.

---

## 2. Left to do, in order

### Step 1 — Finish the browser done-tests (Claude)

How they run: `pnpm test:week-recon` (Docker Desktop open, ~5 min, stops everything after). `pnpm test:week-recon 05` runs one. `node scripts/run-week-recon-done-tests.mjs --hold` keeps the copy running; create `node_modules/.cache/week-recon-stop` to stop it. Phase 2 tests (need the calculator): 03, 05, 06, 08a, 08b, 08d, 08e, 09t, 09b, 13.

| # | Test | State (12 Nov) | Waiting on |
|---|---|---|---|
| 9b | Two tabs on Tag account | ✅ **Passes** (Tag Co, week of 9 Mar) | — |
| 5 | Tolls inside the step | Fails at **Seal tolls**: Deadhead + Personal now decide correctly; the 2 dispute refunds from the sample Uber files can never be cleared | WRA-42 |
| 9t | Two tabs on Tolls | Fixed the cause found (auto-match on open made the other tab stale); **re-run** | re-run |
| 13 | 12 clicks in a row | All 12 Charge Driver clicks now save with no conflict; **no calculator publish followed** within 4 min | WRA-43 |
| 6 | Fuel inside the step | Fuel step shows "This week is no longer on the list" for Upload Co's week of 23 Mar | WRA-41 |

Then run the whole suite from scratch: `pnpm test:week-recon` → all 21 green.

**Fixed on 12 Nov (all uncommitted):**
1. **WRA-33 built:** each step on the week page has its own error catch (`recon/ReconStepBoundary.tsx`); a broken step shows "<Service> unavailable — **Retry**", the rest keeps working. 3 screen tests.
2. **Tag account Save failed silently** when the week had moved: no message, nothing saved. It now shows "This week changed — Reload week" (`reportTagAccountSaveError`, 3 screen tests; `postRunEvent` keeps the server's message). Proven by done-test 9b.
3. **Charge Driver on a toll skipped the week check.** It creates its charge on **fleet-claims**, which had no week-version check, and the screen did not send the week there. Both fixed (`fleet-claims/src/main.ts`, `reconWeekContext.ts`); fleet-claims added to the bundle check and the test runner. **fleet-claims must be rebuilt and deployed at go-live.**
4. **Opening Tolls made other tabs stale.** Auto-match runs by itself on every open and counted as a change. It no longer carries the week header (system work, not a decision; its matches still reach the week through the toll trigger and the calculator).
- Test set-up: the local server sometimes answers 502 while a worker restarts — the set-up scripts now retry with the same Idempotency-Key; the test copy now has "Sync charges to driver financials" on (production setting); new "Tag Co" (one toll tag) so 9b doesn't change other companies' required files.

Useful facts for these tests:
- Uber trip times are UTC; toll times are Jamaica clock (UTC−5). Pickup 14:55 UTC on 18 Mar = 09:55 Jamaica, so a 09:35 toll is Deadhead.
- Toll buttons: Deadhead → **Confirm Deadhead** / Charge Driver; Personal → **Fleet Pays** / **Charge Driver**; Unlinked refunds → **Review** (Apply to underpaid, Cash wash, Phantom / estimate, Pending import, Expense logged → **Resolve with selected**). Seal button id `recon-seal-tolls`; section ids `recon-toll-section-{reimbursed|underpaid|deadhead|personal-use|needs-review|dispute-refunds|unlinked-refunds}`. An empty section reads "Nothing to decide here", so tests check for a number before "to decide".
- Charge Driver on a toll with no trip = a fleet-toll reject, then a fleet-claims claim.
- Test companies: "Week Recon Done Test Co" (owner / manager / accountant / viewer, 20 weeks, recon_v2 on); "Switch-off Co" (recon_v2 off); "Upload Co" (car 5179KZ, driver Kenny, week of 16 Mar 2026); "Tag Co" (one toll tag, week of 9 Mar 2026, user `wr-done-tagco@local.test`). Password for all: `WrDoneLocal2026!`

### Step 2 — Fix the open problems found by the done-tests (Claude)

**WRA-42 · Critical · A dispute refund with no matching toll can never be cleared, so Tolls can never be sealed.**
- The Dispute refunds section has one action, **Match** (link to an underpaid toll). A refund counts as "to decide" until matched (`incrementDisputeRefundCount`, `packages/toll-core/src/tollPeriodCounts.ts`). The plan (§7.3 in Rev 26) gave it **Match** and **Leave unlinked**; Leave unlinked was never built.
- Seen in done-test 5: the real sample Uber files carry 2 dispute refunds with no toll in the system → Seal tolls stays off for good.
- **Fix:** revised with the reviewer (round 2): see `docs/week-reconciliation-toll-review.md`, WRA-42 "Proposed fix". In short: **Leave unlinked** (reason of 8+ characters, `toll.manage`, permanent history, Undo); shared rules (matched / actionable / left unlinked) replace the 5 direct status checks; the driver week keeps the amount on a "Left unlinked" line; a new possible match brings it back for review, never auto-matched; sealed Tolls weeks refuse Leave unlinked, Undo, Match and Unmatch. Built after WRA-43. Waiting for the reviewer to mark Agreed.

**WRA-43 · High · A toll decision may not lead to a recalculation, so the week's numbers go stale.**
- Done-test 13: 12 Charge Driver decisions all saved, but no `calculator_publish` row came within 4 minutes (expected one, about 2 minutes after the last click when the hold ends). The toll trigger (`fleet.toll_ledger` → `recon.touch_driver_week`) should queue the driver week; claims live in the KV store and have no trigger.
- **Fix:** the shared week check (`recon_week_version_guard.ts`), after a successful change, also schedules the week's calculator unit (the same `recon_enqueue_week_desk` the calculator uses), so every toll / fuel / pay / claim decision made from the week is recalculated whatever table it lands in. Re-run done-test 13 to prove it.

**WRA-41 · High · The Fuel step can say "This week is no longer on the list".**
- Done-test 6, Upload Co week of 23 Mar with one fuel fill: step 5 shows only that message — no checks, no Finalize, so the week can't move on. The Fuel screen builds its own week list (`FuelManagement.tsx`: weeks from the earliest fuel activity, server periods for the last 52 weeks) instead of taking the week Week Reconciliation opened.
- **Fix:** when the Fuel step is opened from Week Reconciliation (`initialWeekStart` + `deskSections`), it builds the period for that week directly when it is not in its own list, instead of showing "no longer on the list". Done-test 6 proves it.

**WRA-44 · High · Toll week checks mix every company's data (found by done-test 9b; not in this audit's money scope — fix in its own toll audit).**
- `buildWeekReadiness` (`toll_period_readiness_build.ts`) loads tolls and trips (`findTollsInDateRange` / `findTripsInDateRange`, KV store, no company filter), every dispute refund and every claim, for **all companies**; only its ledger totals are filtered by company. Seen: Tag Co, with no tolls, was refused "2 dispute refunds, J$500 residual" — Upload Co's numbers.
- Not checked in live yet (the live read was refused on 12 Nov). It bites any week where two companies both have tolls, refunds or claims: neither can seal Tolls, and each sees the other's numbers.
- **Fix:** revised with the reviewer (round 2): see `docs/week-reconciliation-toll-review.md`, WRA-44. Guard inside the week check first, then the shared loaders require a company; old dispute refunds get their company from their upload (`batchId`), the rest are marked unassigned and listed for an admin; two-company test + CI check. Its own audit, after the reviewer marks Agreed.

### Step 3 — Before push (Claude, owner decides when to commit)

Build → `/code-review` → `pnpm test:week-recon` → push. Commit only when the owner says.

### Step 4 — Go live (Round 6)

1. Apply the **11 migrations in order**, each with its logbook line: `20261111043430`, `043439`, `043452`, `043516`, `044221`, `044222`, `051252`, `055734`, `061557`, `163200` (queues), `182344` (alerts while paused). (`163445` and `185734` in the same folder are maintenance-discount work, not this audit.)
2. **Rebuild every edge bundle from the final code** (`node scripts/build-edge-bundle.mjs fleet-core|fleet-toll|fleet-fuel|fleet-pay|fleet-claims`) — other work changed claim files during this build, and a rebuild packs whatever is on disk.
3. Deploy fleet-core, fleet-toll, fleet-fuel, fleet-pay, fleet-claims, fleet-recon-cron, the calculator (Cloud Run) and the Fleet website.
4. **Turn the week calculator back on** (admin → Week calculator; off since 27 Oct 2026).
5. Uber week fix (WRA-09): rehearse on the private copy, then run live. Script: `supabase/scripts/recon_uber_batch_restamp.sql` (undo: `_undo.sql`).
   - Before: 37 of 43 completed Uber uploads are not Mon–Sun.
   - After: 0, and every week 24 Aug → 5 Oct shows Uber **Received**.
   - Undo is tested on the private copy too.
6. Turn `recon_v2` on for the owner's company.

### Step 5 — Owner's real production test

Upload Uber, InDrive and toll files **week by week from 21 Sep**, closing each week in order inside Week Reconciliation. Open Rideshare weeks: 21 Sep, 28 Sep, 5 Oct, 19 Oct, 26 Oct, 2 Nov (plus empty weeks 13, 20, 27 Apr 2026 — mark "no activity" and close). Weeks close in order.

At the same time the **14-night side-by-side check** runs:
- Pass = 14 nights in a row with 0 unexplained differences on every open week from 12 Oct 2026 on.
- An unexplained difference restarts the 14 nights (it also goes to the bell).
- Weeks up to 5 Oct are left out (the Uber fix changes them on purpose).
- Write the 14-night result (dates + "0 differences") in this file's status line. That record allows Step 7.

### Step 6 — Owner setup (any time before alerts matter)

- Staff mobile numbers: User Management → **Mobile number for alerts**.
- Digicel / Flow SMS details (`DIGICEL_*` / `FLOW_*`) set on the **Cloud Run calculator**, not only the sign-in hook. Until then alerts show in the app only.

### Step 7 — After the 14 nights (Round 4d + close out)

Remove the old ways in:
- Delete `pages/CloseWeekPage.tsx`; `/close-week` goes to step 8 (WRA-02).
- Driver Settlements: remove the **Close Week** and **Restatements** tabs and the `restatement-queue` menu item; old links open the closed week (WRA-03).
- Remove classic Fuel/Tolls mode from the section (WRA-04).
- Data Center: the 9 week-recon source cards become one **Upload in Week Reconciliation** button that opens step 1 of the chosen week (WRA-05).
- `fuel-reconciliation` / `toll-tags` links open the week's step 5 / step 3.
- Turn off the nightly side-by-side check and delete `week-close/preview` and `week-close/sync`.
- Close the 4 old Delivery weeks (7 Sep, 14 Sep, 12 Oct, 19 Oct) as `legacy_cleanup`. Before: 4 open, after: 0 open + 4 history rows.
- Mark this audit **CLOSED**.

If a close fails before Step 7, turning `recon_v2` off brings the old section back. After Step 7 the fix goes forward, not back.

---

## 3. Known small issues (written down, not blocking)

1. **A half-failed upload can't be retried.** If an upload stops part-way, a second try is refused "already imported". Causes found are fixed, but a stuck upload should be finishable or undoable without a restatement.
2. `POST /financials` has no sign-in check and saves one shared key for every company; dispute refunds are saved without a company. Neither blocks an upload.
3. The Uber reader stamps "today" as the statement period when the file has no dates (Week Reconciliation no longer relies on it).
4. A company with no toll tags may briefly see a "Tag account" step between "toll week reviewed" and Tolls complete. Not reproduced on demand.

---

## 4. Later — when Roam Rush starts (Delivery extras, designed, not built)

Owner decision (Rev 14): Delivery is built light. These wait until Rush has real deliveries:
- Delivery's Tolls step shown by trips, not sources;
- **Mark no tag-paid delivery tolls this week** + auto-mark + Undo, and the step-3 state table;
- a tag statement upload also queues the Delivery week;
- Delivery cash-toll rules;
- data restatements on Delivery (Rideshare ones are built);
- COD panel changes in step 7;
- done-tests 4b–4j, 4l, 14.

The full design for these is in Rev 26 of this file (git history), WRA-11 and WRA-30.
