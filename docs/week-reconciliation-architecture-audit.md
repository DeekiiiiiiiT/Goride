# Week Reconciliation — Architecture Audit

**Rev 34 · 2026-11-15 (evening) · Status: LIVE — owner's real week-by-week test (Step A).** 21 Sep, 28 Sep and 5 Oct 2026 closed (12 Oct closed earlier). This file lists **only what is left**. Everything finished (Rounds 0–4c, go-live, WRA-01…57, the Week result page, the one-part-at-a-time Fuel step, the seconds-not-minutes speed-up) is in the code and in this file's git history (Rev 32 = full detail up to 15 Nov midday).

---

## ⏸ START HERE (paused 15 Nov 2026 ~23:00 UTC — new chat picks up here)

**Checked 15 Nov ~23:45 UTC:** items 1–2 below are DONE — all pushed (origin/main = `0c138843`), edge deploy log lists "Deployed Functions" for fleet-fuel / fleet-toll / fleet-core, Deploy recon-worker green. CI red only on the known S20 fidelity line (Step B "CI" row). Still to see: the ~15–40 s update on the next real change. No new Roam fuel card statement since 14 Nov.

**First, before anything else:**
1. **Is everything pushed?** On 15 Nov evening these were committed but NOT pushed: `e18f9ed4`, `f09de8b7`, `9ddd06a2`, `49c40e7f`, `c3fa5939` (check with `git fetch origin` + `git log origin/main..HEAD --oneline`). If any are listed, ask the owner to push (`cd C:\Roam\Goride` then `git push origin parts-auto-match:main`). The push also carries the other chat's maintenance / powertrain commits — say so.
2. **After that push, check the speed-up is live** (commit `c3fa5939`): the edge deploy log lists "Deployed Functions" for fleet-core / fleet-fuel / fleet-toll (see `edge-deploy-diff-whole-push` note) and the "Deploy recon-worker" run is green. The database half is ALREADY live (owner ran `docs/recon_short_publish_hold_LIVE_apply.sql` on 15 Nov: hold 10 s, logbook line `20261115224516` present). Then on the next real change, confirm the week page updates in ~15–40 s with no F5 (week_runs.desk_computed_at moves; edge logs show the `/tick` wake from fleet-core / fleet-fuel). If it still takes minutes, read the edge logs for "[recon] calculator wake failed".

**Where the owner is:** next week to close = **Week of 19 Oct 2026** (Rideshare), step 1 Upload inputs. Driver: Kenny Gregory Rattray (only driver), car Toyota Roomy 5179KZ, TransJam tag …6450 (the Toyota CHR tag …6430 is NOT fleet — ignore it).

**Weeks still to close, in order:** 19 Oct → 26 Oct → 2 Nov → 9 Nov (9 Nov ended 15 Nov; its week run may not exist until the calculator's next 10-minute ensure pass).
- **19 Oct, 26 Oct and 2 Nov need the Roam fuel card statement uploaded first** (Fleet Admin → Gas cards → Statement import, `docs/roam-fuel-card-statement-audit.md`). Last asked 15 Nov: owner had not said whether Roam sent it — ask first.
- Expected Tag account closings (step 4 Confirm): 19 Oct **4,629** · 26 Oct **3,619** · 2 Nov **1,279** · TransJam live **869 at 14 Nov 5:14 PM** (week of 9 Nov).
- Owner files: `C:\Users\deeki\Documents\Business\Roam\Reports\Toll Tag\Usage\2026`, `...\Toll Tag\Top Up\2026`, `...\Reports\RideShare Trips\Uber\2026\<week>`. The "Oct 19" and "Oct 26" top-up files hold the **same** top-up (EAA3FBCCE3, 27 Oct) — upload it in one week only; the 10 Nov top-up sits in the "Nov 2 - Nov 8" file.

**Per week, the steps that need Claude (lessons from 21 Sep → 5 Oct):**
- Step 1: "Missing" right after an upload is the calculator catching up (now ~15–40 s). Tag top-ups with no top-up that week → "No activity on empty days (all 7)"; cash tolls → same unless Kenny paid cash.
- Step 3 Tolls: "Likely" matches whose toll time sits inside the Uber trip are right — confirm. **Uber paybacks with no toll:** a small Uber adjustment → Keep with no toll; a payback on a cash trip with no tag crossing → check the tag had balance and was read that day; if yes, the driver most likely took the free road → Keep with no toll (5 Oct: J$70 + J$780 kept).
- Step 5 Fuel (now one part at a time, Stitch): read each flagged fill against the odometer photos before Resolve. "High fuel consumption" vs a "usual" inflated by small top-ups is normal (5 Oct: 9.75 km/L vs real usual 12.1 → accepted). Stop-to-stop gaps of a few km (Uber en-route km are a weekly average spread evenly; a trip straddling a fill) → accept with reason "Trip km overstated (platform)". Tick "I checked the warnings" before Finalize. Finalize runs its job at once (WRA-56); only if stuck run `select private.invoke_fuel_period_job_sweep();`.
- Step 7: check each driver's number in live data before Pay / Collect. Kenny = **High Performer** policy (tiers 25/27/29/31/33/35%; 35% from J$375,001 month-to-date; D4 counts a month-straddling week into the month it starts in; tier resets each month — 5 Oct was 27%, Silver). Tips go to the fleet when the J$100,000 weekly quota is missed. Manually logged InDrive trips count even when the InDrive export is "No activity".
- Step 8: a closed Rideshare week shows the **Week result** (Revenue − Expenses = Profit; Fleet vs Driver profit).

**Closed weeks so far (all paid / settled):** 21 Sep (33%, Kenny owed J$188.38 → collected) · 28 Sep (35%, fleet paid J$1,575.13) · 5 Oct (27%, fleet paid **J$9,397.22**: share 22,616.76 − fuel 3,930.38 − cash 22,639.16 + cash fuel 13,350; tolls 12 × all paid back; fuel J$28,350; tag closing J$5,154 confirmed).

**Working rules:** owner is not a coder — short plain replies, one step at a time, screenshots. Owner pushes. Another chat (Service items / maintenance / powertrain) also commits on this branch and leaves files modified — never stage its files (e.g. `FuelLogModal.tsx`, `maintenance_*`, `routes.generated.json` it regenerated), and say when a push carries its commits. Never `git stash`. **Before Write on a path, check it does not already exist** (15 Nov: an existing `recon_worker_wake.ts` was overwritten and had to be restored). Keep each file's line endings as in git. After `deno test` / `deno check` run `pnpm install --frozen-lockfile` (the 55 old deno type errors are not ours — run tests with `--no-check`). Run Fleet vitest from `C:\Roam\…` (capital C). Claude may read live data (Supabase connector) and queue a driver-week rebuild with `recon.touch_driver_week(org, driver, '<monday>'::date, false)` — real Mondays only. A fuel-core engine change needs a `FUEL_ENGINE_VERSION` bump or open weeks keep the old snapshot. New migrations: `npx supabase migration new <name>` (real UTC time), then a `docs/<name>_LIVE_apply.sql` with the logbook line for the owner. Check the money in live data before the owner clicks Collect / Settle / Close.

---

## Step A — Owner's real weeks (now)

Close the weeks above in order inside Week Reconciliation. At the same time the **14-night side-by-side check** runs: pass = 14 nights in a row with 0 unexplained differences on every open week from 12 Oct 2026 on (weeks up to 5 Oct are left out). Write the result (dates + "0 differences") in the status line — that allows Step D.

## Step B — Open fixes (after the real weeks)

Fixed 15 Nov before the real weeks (owner's pick, they hit every week): WRA-56 fuel finalize runs its job in the request (`runFuelJobInBackground`), WRA-57 Tolls box shows step 4's roll, WRA-46 company owner self-approves Close / Reopen with no reason (`isCompanyOwner` = user id is the org id), every JMD amount prints "J$" (`formatJMD`; the browser printed en-JM JMD as "$"), Settlement week dates and the locked fuel date in plain words.

| # | What | Fix |
|---|---|---|
| WRA-58 | **Fuel prices km above the real cost when the car beats its usual economy.** 5 Oct: categories priced at J$16.79/km (rideshare) and J$18.97/km (pickups) vs the real J$28,350 ÷ 1,708 km = J$16.60/km → driver share J$3,930.38 instead of ≈ J$3,726 (**Kenny over-charged ≈ J$204**); company + driver = J$29,200.89 > spend (shown as "Over-explained −J$4,044.44"). Snapshot fields: rideShareCost 25,159.74, deadheadCost 4,041.15, unattributedKmCost 3,161.87 with ~0 unexplained km. | Fuel enterprise audit: price categories from the week's real spend per km (scale to spend), check unattributedKmCost; then **credit Kenny the over-charge** for 5 Oct (and check 21 Sep / 28 Sep). |
| Page | Settlement step "Continue" waits for the calculator after Pay (now ~15–40 s). | Only if it still bothers the owner after the speed-up. |
| WRA-47 | Step 6 "Activity vs trips" shows Uber hours only; Roam app went_online / job events (`driver_activity_logic.ts`) unused. | Add Roam hours to the card. |
| WRA-49 | Fuel step on a week locked before the floor rule shows "Numbers don't balance" (`FuelWeekMoneyStrip.tsx` splitTie only accepts company + driver + leakage = total). | Also accept company + driver = total. |
| Display | Close History raw "lane change:POST /fleet-fuel/…" lines (open weeks); Tolls on an empty week "0 of 0 · 0% completed". | Plain words; empty week reads done. |
| Wording | Settle from balance (step 7) says "No open week the fleet owes" when later weeks the fleet owes aren't settled yet. | "Later weeks the fleet owes aren't settled yet — close them first, or Collect". |
| CI | "Dominion Stitch fidelity" fails `S20 75% labels — packages/platform-ops-ui/src/fleet-customer/GasCardsPage.tsx` (Statement import wording, 16ac8812). | Fix the labels to match the S20 screen. |
| Tests | Done-tests 5, 6, 9t, 13 still use the old toll import (`importTolls` in `e2e/helpers/weekReconDoneTest.ts`); test 6 flagged fill shows Clear too early; `fuel/periods/ensure` answered 500 twice in one run (likely a create race). | Re-point at `/toll/v2/import`, then `pnpm test:week-recon` → all green. |
| Nightly | `finance-recon` (04:00 UTC) selects `debit_account_key, credit_account_key` that `public.financial_events` never had. | Its own small fix. |
| Data | Old `rush_delivery` blockers for Kenny's 28 Sep week (computed 12:37) still in `recon.week_blockers`. | Check they don't show on a delivery line; clear if stale. |
| Accepted | A change made outside Week Reconciliation waits for the nightly run (WRA-43 scope). | — |

## Step C — Owner setup (any time before alerts matter)

- Staff mobile numbers: User Management → **Mobile number for alerts**.
- Digicel / Flow SMS details (`DIGICEL_*` / `FLOW_*`) set on the **Cloud Run calculator**, not only the sign-in hook. Until then alerts show in the app only.

## Step D — After the 14 nights (remove the old ways in, then close out)

- Delete `pages/CloseWeekPage.tsx`; `/close-week` goes to step 8 (WRA-02).
- Driver Settlements: remove the **Close Week** and **Restatements** tabs and the `restatement-queue` menu item; old links open the closed week (WRA-03).
- Remove classic Fuel/Tolls mode from the section (WRA-04).
- Data Center: the 9 week-recon source cards become one **Upload in Week Reconciliation** button that opens step 1 of the chosen week (WRA-05).
- `fuel-reconciliation` / `toll-tags` links open the week's step 5 / step 3.
- Turn off the nightly side-by-side check and delete `week-close/preview` and `week-close/sync`.
- Close the 4 old Delivery weeks (7 Sep, 14 Sep, 12 Oct, 19 Oct) as `legacy_cleanup`. Before: 4 open, after: 0 open + 4 history rows.
- Mark this audit **CLOSED**. Then back to `docs/toll-old-system-removal-audit.md` (round S3 → D1 → T1).

If a close fails before Step D, turning `recon_v2` off brings the old section back.

---

## Known small issues (written down, not blocking)

1. **A half-failed upload can't be retried** — a second try is refused "already imported". A stuck upload should be finishable or undoable without a restatement.
2. `POST /financials` has no sign-in check and saves one shared key for every company; dispute refunds are saved without a company.
3. The Uber reader stamps "today" as the statement period when the file has no dates (Week Reconciliation no longer relies on it).
4. A company with no toll tags may briefly see a "Tag account" step between "toll week reviewed" and Tolls complete. Not reproduced on demand.

---

## Next audits (their own files, after the real weeks)

- **Fuel enterprise audit** (owner asked 14 Nov): bring fuel to the level of the rebuilt toll system — (1) the whole fuel system, (2) the **Fuel Policy** section (coverage rules, personal allowance, who pays what), (3) **future Telematics** (week page card "Coming soon"), designed so real litres / odometer / trips can replace the km × efficiency estimate without a rebuild. Starting findings: locked weeks are re-judged by today's money rules (WRA-49); the locked snapshot still says Draft / health Red / 5 pending; the company/driver split rests on km × estimated efficiency (21 Sep was 5.9% over) and nothing tracks that gap week to week; fuel money is one JSON bundle per week, not traceable ledger lines like tolls v2; the finalize job doesn't start by itself (WRA-56, fixed 15 Nov); categories are priced above the real cost per km when the car beats its usual economy, so the driver is over-charged and company + driver > spend (WRA-58 — credit Kenny ≈ J$204 for 5 Oct).

## Later — when Roam Rush starts (Delivery, designed, not built)

Owner decision (Rev 14): Delivery is built light. These wait until Rush has real deliveries:
- **Week result for Delivery weeks** — delivery has no week statements yet, so a closed delivery week keeps the old Close page;
- Delivery's Tolls step shown by trips, not sources;
- **Mark no tag-paid delivery tolls this week** + auto-mark + Undo, and the step-3 state table;
- a tag statement upload also queues the Delivery week;
- Delivery cash-toll rules; data restatements on Delivery; COD panel changes in step 7;
- done-tests 4b–4j, 4l, 14.

The full design is in Rev 26 of this file (git history), WRA-11 and WRA-30.
