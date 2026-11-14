# Week Reconciliation — Architecture Audit

**Rev 28 · 2026-11-12 · Status: BUILDING — Round 5 (browser done-tests) part-way.** 17 of 21 browser done-tests pass (9b new). The 4 left (5, 6, 9t, 13) found 7 real problems: 4 fixed, 3 open (WRA-41, 42, 43 below). Nothing committed, nothing live.

## ⏸ START HERE (paused 14 Nov 2026 ~04:10 UTC, out of credit)

**Where we are:** Week Reconciliation is **LIVE** for the owner's fleet (`recon_v2` on, 14 Nov 03:28 UTC). Go-live Step 4 is fully done: 11 migrations, code deployed (main `6f0dd254` incl. WRA-41/43 + fuel no-GPS fix), week calculator resumed, Uber week fix run (37 → 0), switch on, and the missing calculator wake job added (migration `20261114040154_recon_worker_wake_cron.sql`, owner ran it + logbook line; the calculator then ran its first nightly since 26 Oct). Week list now: **"Numbers are up to date", 9 open, 39 reconciled** — December etc. were adopted as closed automatically.

**Now in Step 5 (owner's real week-by-week test), weeks close oldest first:**
1. **13 Apr, 20 Apr, 27 Apr 2026** — no activity: open the week, mark every needed file "no activity", walk the steps, close. **Next action = owner opens Week of 13 Apr 2026 and sends a screenshot; guide ONE step per reply.**
2. **21 Sep, 28 Sep, 5 Oct 2026** — real weeks; also the 3 old-toll weeks from `docs/toll-old-system-removal-audit.md` D0 (Kenny Gregory Rattray): upload Uber / InDrive / toll files, decide, **seal tolls in step 3**, then close.
3. **19 Oct, 26 Oct, 2 Nov 2026** — real weeks.
4. During Step 5 the 14-night side-by-side check runs (section "Step 5" below).

**Open items (not blocking the owner):**
- **Done-tests 5, 6, 9t, 13** still need rework for the new toll system: 5/9t/13 import tolls the old way (`importTolls` in `e2e/helpers/weekReconDoneTest.ts` → must use the new toll upload `/toll/v2/import`); test 6 passes the WRA-41 point but its seeded "flagged fill" shows Clear before it is resolved (find what re-saves/re-checks the fill). A run on 14 Nov was also disturbed by another chat writing files under `supabase/functions` mid-run.
- **`fuel/periods/ensure` answered 500 twice** in one test-6 run (two at the same instant — likely a create race); not yet looked at.
- **Nightly finance check fails every night at 04:00 UTC** (`fleet-finance-recon-nightly` → `finance-recon`): it selects `debit_account_key, credit_account_key` from `public.financial_events`, which has never had those columns (`supabase/functions/finance-recon/index.ts` ~123). `week_close.ts` ~2194 (M-2 fuel account-key check) asks for the same columns but ignores the error, so that check never runs. Separate fix, its own audit — not this one.
- Accepted from WRA-43: a change made outside Week Reconciliation (no week header) still waits for the nightly run.

**After Step 5's first weeks:** back to `docs/toll-old-system-removal-audit.md` (round S3 → D1 → T1).

**Working rules learned this session:** owner is not a coder — short plain replies, one step at a time; owner pushes to `main` (Claude's push to `main` is blocked): `cd C:\Roam\Goride` then `git push origin parts-auto-match:main`; give live SQL for the SQL Editor ending with the `schema_migrations` logbook line for migrations; other chats have uncommitted files (maintenance, parts, service items) — never stage them, never commit built `*/index.ts` bundles; after any `deno test`, run `pnpm install --frozen-lockfile` before vitest/builds; the Supabase connector may be down — ask the owner to run read-only SQL instead.

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
