# Fuel — Enterprise Audit (plan)

Trimmed 23 Nov 2026: finished work is one line each; the full earlier text is in git history
(commit `ea104e67` and before, `C:/Roam/Goride-fuel/docs/fuel-enterprise-audit.md`).

## 0. HANDOFF — read this first (updated 23 Nov 2026, ~13:30 UTC)

**Goal (one sentence):** every week, each fuel dollar the fleet spends ends with the right person paying it,
by a rule the owner set and can trace line by line, from the fills the driver scanned.

**Who:** one fleet company today (Kenny Gregory Rattray, Toyota Roomy 5179KZ, petrol). Build for every company.

**Where things are**
- Code: worktree `C:/Roam/Goride-fuel` (branch `fuel-f27-f31-f32a`). Its HEAD = `origin/main` = `ea104e67`.
  Everything below is **pushed and live**. Nothing is waiting in the worktree except untracked docs.
- This plan's master copy: `C:/Roam/Goride/docs/fuel-enterprise-audit.md` (uncommitted, branch `parts-auto-match`).
  Copy it into the worktree's `docs/` after editing.
- Engine: `packages/fuel-core` (v2.2 charges today; v3 `fuelEngineV3.ts` runs beside it as a preview).
  Server: `supabase/functions/_fleet-server/fuel_*`. Week row: `public.fuel_reconciliation_period`;
  money: `public.fuel_week_snapshot`; lines: `fuel.week_lines` (only via `public.fuel_*_week_lines` RPCs).

**What is live (all on main)**
- Engine v3 + fuel lines + statements-before-lock + nightly checks + rules table (`fuel.policy_scenarios`),
  migrations through `20261123125453`. Switch `fuel_engine_v3` is **OFF**: weeks are charged the old way
  (v2.2) and show the new way as "Preview — not charged".
- All 17 Stitch screens (Part J of the old plan): Week Reconciliation step 5 Fuel in five parts
  (Fuel checks · Disputes · Fuel policy · Distance and who pays · Finalize), the Driver Settlements
  "Fleet vs Driver" Fuel card (lines), Fleet Policy Rules (six kinds, versions, Add a version).
  New routes: `GET /fuel/periods/:id/checks`, `POST /fuel/flags/disposition/reopen`,
  `GET /fuel/driver-week-lines`, `GET /fuel/brain-policy`.
- 23 Nov fixes: view `public.fleet_fuel_entries` gained `source` (every fuel save had failed 00:39–12:57 UTC;
  only the owner's statement upload was hit); card statement lines (`importSource = jaa_raw`, staff, not a
  driver) skip the "does this fill look right" check (`ea104e67`, deployed by Cursor) — the 18 Nov 5179KZ
  **diesel** line had been refused as "price off the typical price".

- 23 Nov (during the 16–22 Nov test, `39af6d0f`): toll `week_result_live` counts carried dispute results in a
  driver's owes (Kenny J$0 → J$120; migration `20261123174320`); Disputes blue box removed. Local Fleet app now runs
  from `C:/Roam/Goride-fuel` with its own `pnpm install` (Deno had broken the shared node_modules).
  Later 23 Nov (LIVE but NOT on GitHub — owner asked not to push yet): migration `20261123182545` (carried
  dispute/take-back/correction parts + `carriedOwesMinor` on week result and driver toll statements; only
  16 Nov restated), fleet-core edge deployed by hand, recon-worker Cloud Run rebuilt by owner (rev 00147);
  TOLL_IDENTITY_UNBALANCED cleared. Uncommitted in Goride-fuel: that migration + tests, finance-core
  closeInvariants carried subtract, fleet-core bundle, Tolls screen eye-per-driver + Driver pays tile.
  ANY push to main before these are committed would roll the server back — commit them in the next push.
  Open: Uber J$80 late tip (22 Oct trip, `payments_order` "trip fare adjust order") looks unsaved — check at step 6.
  `toll_dispute_commands_test` p02-w and `toll_screen_reads_disputes_test` "6 rider command" fail on today's date
  (pre-existing, date-driven).

**Where the owner is right now**
- 16–22 Nov gas-card statement uploaded; both lines saved (18 Nov diesel, 19 Nov J$5,000), Kenny's scans priced.
- Next: the owner uploads the other files for **16–22 Nov** and runs the week through Week Reconciliation
  as the first real end-to-end test of the new screens. **Stop before "Finalize fuel"** and decide step 1 below.
- Ask the owner / Kenny / Roam why a petrol Roomy has a **diesel** card line on 18 Nov (Jampet).

**Left, in order**
1. **Owner decides** whether 16–22 Nov locks the new way: if yes, switch `fuel_engine_v3` on (for every
   company — owner rule) **before** Finalize fuel; locking posts real driver charges. Check the week's
   "Distance and who pays" preview first (old vs new driver charge).
2. **After the first real lock:** check live — fuel lines written (`fuel_week_lines_list`), the driver's
   statement equals the lines (the Fuel card says "Matches the fuel statement"), nightly check green next
   morning, no server errors. Then re-run the forward-only sweep (second query in
   `supabase/tests/fuel_forward_only_sweep.sql`; every value must match its comment) — done-test 10.
3. **F-28:** make sure `recon_v2` is on for every company, then delete the old close path (Driver
   Settlements → Close Week and the Fuel page's own reconciliation, `App.tsx` ~171–181, 569–575) so
   `/close-week` and `/fuel-reconciliation` open Week Reconciliation (done-test 19).
4. **F-25 rest:** step 5 + the lock blocker are built; still to do: remove the Review Queue "Awaiting
   statement" tab (`FuelReimbursementTable.tsx`); Fuel Cards and Transaction Logs keep a read-only chip that
   opens the week (done-test 16).
5. **Done-tests still partial/missing** (Part F below).
6. **e2e:** `e2e/fuel-recon-wizard.spec.ts` (rewritten for step 5 + Fleet Policy) has never run: it needs a
   test login (`E2E_FLEET_EMAIL`/`E2E_FLEET_PASSWORD`, not the owner's — it has the extra sign-in step)
   and `E2E_FUEL_WEEK`, against `FLEET_BASE_URL`. Owner found it a waste of time; do it only if asked.
7. **Small UI gaps:** "Open car" in the Car economy panel is hidden (no link from Week Reconciliation to the
   car's km/L tab yet).
8. **Later:** F-29 re-check in Feb 2027 (delete tables still at 0 rows); Q2 Amber Connect tracker (Part G).
9. **When no open v2.2 week is left:** delete the v2.2 preference chain and rebuild (F-24 note) and the
   old-rule tests listed in F-20.

**CI:** red at "Ban bare @roam imports in fleet edge graph" (`scripts/check-fleet-edge-roam-imports.mjs`,
`apps/fleet/src/services/api.ts` etc.) — pre-existing at `cd9dadf6`, not fuel; deploys still work. The
earlier "Dominion Stitch fidelity" failure was fixed `c12079d7`. While CI stops early, later steps are
skipped: after a fuel push run by hand `pnpm --filter @roam/fuel-core typecheck`,
`pnpm --filter @roam/fleet typecheck:money`, the "Deno test fuel recon Rev 3 controls" list in
`.github/workflows/ci.yml`, and `pnpm --filter @roam/fleet build`.

**Outside this audit (owner told 22 Nov):** views `public.delivery_courier_roam_tags` and
`public.delivery_coverage_cells` are readable logged-out with no row security (Rush/Delivery; own check).

**Rules and traps**
- Tell the owner before any push or live write. Migrations: `npx supabase migration new <name>` (real UTC
  date); apply with `npx supabase db push --remote` (needs `--yes` + owner OK). After a push, read the edge
  deploy log for `Deployed Functions on project ***: fleet-fuel`.
- Adding a column to a `fleet.*` table: also add it to its explicit-column `public.*` view in the same
  migration, and check live with a PostgREST select of the column.
- Never `git stash`; never `pnpm install` in the worktree (node_modules are junctions). Recon Deno tests need
  LF in the worktree; `fuel_controller.tsx` is stored CRLF — keep it. `DriverSettlementsPage.tsx` holds
  non-UTF-8 bytes: edit it as latin1 and check `git diff --stat` after every scripted edit.
- Revert timestamp-only `routes.generated.json` changes after `node scripts/edge-route-manifest.mjs --all`.
- Screen checks without the test copy: a temporary harness html + tsx in `apps/fleet` that swaps `api`
  methods for sample data, Playwright via a temp config on port 5199; delete it all afterwards.
- Plain words to the owner; one fix per finding; forward only (weeks ≤ 9 Nov never change).

---

## Decisions made while building the screens (keep)

- Fuel checks: "Add a missed fill" with Gas card has no amount box (the statement prices it — never counted
  twice); Cash asks amount **and litres**. "Upload card statement" goes to step 1. Old check panels stay inside the part.
- Finalize: in Week Reconciliation the tick box "I checked the warnings for this week." is always shown and
  required; the "Accept unusual fills" form shows in Finalize. A refused lock reads the week's saved
  `fuel_seal_error` and names the drivers.
- Distance and who pays: "Mark reviewed" only when a review is needed; "Mark readings reviewed" opens Fuel checks.
- Driver Settlements: the Fuel card replaces the single "Fuel deduction" row; old-way weeks show one
  "Fuel deduction (locked before fuel lines existed)" row; the Reversed/Current tag sits under each row.
- Fleet Policy: "Add a version" sets the split on the version itself (template "Edit splits" untouched);
  a date that would change a locked week is refused in the dialog (same `closedScheduleChangeError` the
  server enforces). No "No changes / Discard / Save" footer (every change saves in its dialog). "How Roam
  sorts the km" leaves out the industry fallback % and cross-check points.
- Pills use full names: Fuel checks · Disputes · Fuel policy · Distance and who pays · Finalize.

---

## Part B / I — Findings

**Done** (built, tested, live): F-01, F-03, F-04, F-05, F-06, F-07 (narrowed), F-08, F-09, F-10, F-11,
F-12, F-13, F-14, F-15, F-16, F-18, F-21, F-22, F-23, F-24, F-26, F-27, F-30, F-31, F-32.
**Settled, no code:** F-02 (closed weeks not re-worked — owner, forward only), F-17 (the rolling credit
stays out of the identity; the first three weeks after the switch carry v2.2 credits that bill J$0),
F-19 (fuel lines in bigint minor units; settlement lines in J$, converted once at posting).

**Open:**

| # | Problem | Fix |
|---|---|---|
| **F-20** | Tests pin the old v2.2 rule (`personalAllowance.recon.test.ts:182-188`, `fuelFinalizeGating.test.ts:187-193`, `fuelReconComponents.test.ts:25`, `evaluateFuelWeekClosable.test.ts:34-41`, `fuel_week_closable_gate_r12.test.ts:17-33`). | Change them in the same round that removes v2.2; a red one there is the old rule being removed on purpose. |
| **F-25** | "Waiting for the card statement" also lives on the Review Queue tab "Awaiting statement" (`FuelReimbursementTable.tsx`), Fuel Card transactions sheet and Transaction Logs. | Step 5 + lock blocker are built. Remove the Review Queue tab; the other two keep a read-only chip that opens the week. |
| **F-28** | Two ways to close a week while a company's `recon_v2` is off. | `recon_v2` on for every company; delete the old close path. |
| **F-29** | `fleet.fuel_disputes`, `fleet.fuel_adjustments`, `public.fuel_exception_assignments` have 0 rows. | Keep; re-check Feb 2027 and delete what is still unused. |

## Part F — Done-tests not yet passed

Passed: 1, 2, 3, 8, 9, 12, 13, 14, 15, 17, 18, 20, 21a, 21b (server + dialog).

| # | Done-test | Have |
|---|---|---|
| 4 | Lock with a recommended-only gap charge → refused, naming the car; after review it locks and the statement exists. | partial |
| 5 | A statement can't be written → nothing locks; the screen names the driver (screen 11 built). | partial — no rollback test |
| 6 | Card statement line 10 Nov J$5,000 at 197,043 km attaches to the scan; the week counts J$5,000 once; one evidence row. | partial — not end-to-end |
| 7 | 18 Nov card fill with no statement → "Waiting for the card statement", can't lock; statement arrives → priced, lock allowed. | screens built; check on the 16–22 Nov week |
| 10 | After go-live every week up to 9 Nov shows the same numbers; no new line for them. | re-run the sweep SQL after the first real lock |
| 11 | Reopen → lines reversed; re-lock writes new lines; closed weeks unchanged. | partial — no line-level test |
| 16 | F-25: waiting fills only in step 5 (+ read-only chips); the Review Queue tab is gone. | missing |
| 19 | F-28: old close path gone; `/close-week` and `/fuel-reconciliation` open Week Reconciliation. | missing |
| 21b live | Reopen a locked v3 week live → reversal rows, nothing deleted, fills back to Pending, new lines on re-lock. | after the first real v3 lock |

## Part G — Owner questions

| # | Question | Working default |
|---|---|---|
| Q2 | The car has an **Amber Connect** GPS tracker. Can it give odometer / trips through an API? | Not used now; `source` (F-14) keeps the door open: add a `telematics` reader, the engine takes the best source per car per week. |
| Q5 | Gap-charge dual control allows one person to recommend and approve on a solo fleet. | Keep one person allowed; the approve action records who and when. |

## Linked audits (not repeated here)

Fuel price engine (`docs/fuel-price-engine*`), fuel stop location (`docs/fuel-stop-location-resolution-audit.md`),
split fills (`docs/fuel-split-statement-derived-audit.md`, `docs/fuel-split-station-and-awaiting-queue-audit.md`),
Roam fuel card statement (`docs/roam-fuel-card-statement-audit.md`), service-line split (`FUEL_SERVICE_LINE_SPLIT_AUDIT.md`),
research engine (owns the Dominion pending-parts screens).
