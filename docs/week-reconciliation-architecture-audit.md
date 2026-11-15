# Week Reconciliation — Architecture Audit

**Rev 33 · 2026-11-15 · Status: LIVE — owner's real week-by-week test (Step A).** 21 Sep + 28 Sep 2026 closed; Week result page live. This file lists **only what is left**. Everything finished (Rounds 0–4c, go-live, WRA-01…55, the Week result page) is in the code and in this file's git history (Rev 32 = full detail).

---

## ⏸ START HERE

**Where the owner is:** next week to close = **Week of 5 Oct 2026** (Rideshare), step 1 Upload inputs. Driver: Kenny Gregory Rattray (only driver), car Toyota Roomy 5179KZ, TransJam tag …6450 (the Toyota CHR tag …6430 is NOT fleet — ignore it).

**Weeks still to close, in order:** 5 Oct → 19 Oct → 26 Oct → 2 Nov → 9 Nov (12 Oct already closed).
- **19 Oct, 26 Oct and 2 Nov need the Roam fuel card statement uploaded first** (Fleet Admin → Gas cards → Statement import, `docs/roam-fuel-card-statement-audit.md`).
- Expected Tag account closings (step 4 Confirm): 5 Oct **5,154** · 19 Oct **4,629** · 26 Oct **3,619** · 2 Nov **1,279** · TransJam live **869 at 14 Nov 5:14 PM** (week of 9 Nov).
- Owner files: `C:\Users\deeki\Documents\Business\Roam\Reports\Toll Tag\Usage\2026`, `...\Toll Tag\Top Up\2026`, `...\Reports\RideShare Trips\Uber\2026\<week>`. The "Oct 19" and "Oct 26" top-up files hold the **same** top-up (EAA3FBCCE3, 27 Oct); the 10 Nov top-up sits in the "Nov 2 - Nov 8" file.

**Per week, the steps that need Claude:**
- Step 5 Fuel: Finalize now runs its job straight away (WRA-56). Only if a job still sits "queued" / "running" for minutes, run `select private.invoke_fuel_period_job_sweep();`.
- Step 7: check each driver's number in live data before Pay / Collect (tier from the driver's earnings policy — Kenny = High Performer, 35% once the month passes J$375,001; D4 counts a month-straddling week into the month it starts in; tips go to the fleet when the J$100,000 weekly quota is missed).
- Stop-to-stop gaps of a few km left after WRA-55 are Uber GPS en-route km reading a few % over the odometer (band 3%) — accept them.

**Working rules:** owner is not a coder — short plain replies, one step at a time, screenshots. Owner pushes (`cd C:\Roam\Goride` then `git push origin parts-auto-match:main`). Another chat (Service items / maintenance) also commits on this branch — never stage its files, and say when a push carries its commits. Never `git stash`. Keep each file's line endings as in git. After `deno test` / `deno check` run `pnpm install --frozen-lockfile`. Run Fleet vitest from `C:\Roam\…` (capital C). Claude may read live data (Supabase connector) and queue a driver-week rebuild with `recon.touch_driver_week(org, driver, '<monday>'::date, false)` — real Mondays only. A fuel-core engine change needs a `FUEL_ENGINE_VERSION` bump or open weeks keep the old snapshot. Check the money in live data before the owner clicks Collect / Settle / Close.

---

## Step A — Owner's real weeks (now)

Close the weeks above in order inside Week Reconciliation. At the same time the **14-night side-by-side check** runs: pass = 14 nights in a row with 0 unexplained differences on every open week from 12 Oct 2026 on (weeks up to 5 Oct are left out). Write the result (dates + "0 differences") in the status line — that allows Step D.

## Step B — Open fixes (after the real weeks)

Fixed 15 Nov before the real weeks (owner's pick, they hit every week): WRA-56 fuel finalize runs its job in the request (`runFuelJobInBackground`), WRA-57 Tolls box shows step 4's roll, WRA-46 company owner self-approves Close / Reopen with no reason (`isCompanyOwner` = user id is the org id), every JMD amount prints "J$" (`formatJMD`; the browser printed en-JM JMD as "$"), Settlement week dates and the locked fuel date in plain words.

| # | What | Fix |
|---|---|---|
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

- **Fuel enterprise audit** (owner asked 14 Nov): bring fuel to the level of the rebuilt toll system — (1) the whole fuel system, (2) the **Fuel Policy** section (coverage rules, personal allowance, who pays what), (3) **future Telematics** (week page card "Coming soon"), designed so real litres / odometer / trips can replace the km × efficiency estimate without a rebuild. Starting findings: locked weeks are re-judged by today's money rules (WRA-49); the locked snapshot still says Draft / health Red / 5 pending; the company/driver split rests on km × estimated efficiency (21 Sep was 5.9% over) and nothing tracks that gap week to week; fuel money is one JSON bundle per week, not traceable ledger lines like tolls v2; the finalize job doesn't start by itself (WRA-56).

## Later — when Roam Rush starts (Delivery, designed, not built)

Owner decision (Rev 14): Delivery is built light. These wait until Rush has real deliveries:
- **Week result for Delivery weeks** — delivery has no week statements yet, so a closed delivery week keeps the old Close page;
- Delivery's Tolls step shown by trips, not sources;
- **Mark no tag-paid delivery tolls this week** + auto-mark + Undo, and the step-3 state table;
- a tag statement upload also queues the Delivery week;
- Delivery cash-toll rules; data restatements on Delivery; COD panel changes in step 7;
- done-tests 4b–4j, 4l, 14.

The full design is in Rev 26 of this file (git history), WRA-11 and WRA-30.
