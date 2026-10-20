# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 2 · 2026-10-19 · verification of commit `b30b251b`**
Rev 1 (the full design) is in git history (`git show b30b251b:WEEK_RECONCILIATION_WIZARD_AUDIT.md`). This revision lists **only what is still open**.

## Status

The code is built: P0–P8, 86 files. The gates I ran are green: finance-core vitest 231/231, recon UI tests 3/3, Deno 15/15.

**Production is half-deployed and currently broken in two places.** `fleet-core` (and the other fleet bundles) were deployed at 19:33 Jamaica time, but **none of the 9 recon migrations are applied**. Some of the deployed code depends on them.

The open items fall into three groups:
- **Deploy blockers.** Fix these before applying anything.
- **Gaps that defeat the wizard's purpose.** Gates that don't gate, and coverage that never updates.
- **A short tail** of smaller items.

| | Rev 1 findings | Now |
|---|---|---|
| Closed in code | C1 C2 C3 H1 H2 H3 H4 H5 H6 M1 M2 M3 M4 M5 M6 | 15 |
| Still open (below) | partly C1, C2, C3 | |
| New | | 21 |

## Product rule: one screen, start to finish

> A user reconciling a week **never leaves Week Reconciliation.** Every CSV the week needs is uploaded *inside* the wizard, every review happens inside it, and the week is closed from it. The Data Center stays for one-off and bulk imports (drivers, vehicles, tags, plazas, backups). It mounts the **same uploader components**, so a file uploaded in either place counts toward the week.

Test for every step: *can the user finish this step without the URL changing away from `/week-reconciliation`?* §3a lists where the answer is still no.

---

## 1. Production right now (fix today)

### R2-01 · Close Week fails in prod · Critical
The deployed `week_close_lock.ts:24-30,44-49` calls `try_claim_week_close` and `release_week_close_lock` with `p_service_line`. In prod those RPCs still have their old 4- and 3-argument signatures, so PostgREST can't find a matching function and `tryClaimWeekCloseLock` throws. `beginWeekCloseRun` also inserts a `service_line` column that doesn't exist yet. **Every close fails at the lock step.** None has been attempted since the deploy (last `week_close_runs` row: 2026-09-11).

### R2-02 · Toll CSV import fails in prod · Critical
`BulkImportTollTransactionsModal.tsx:818-858` always calls `POST /recon/imports` first. Its table doesn't exist, so the route returns **500**. The client only falls back on 404/501 and re-throws anything else. No toll has been written since the deploy.

**Fix for both:** apply the migrations, after the §2 fixes. Don't apply them as-is. Until then, redeploy the previous edge bundles if a close or a toll import is needed.

---

## 2. Deploy blockers (fix in the migrations / mappers before applying)

### R2-03 · P2 migration will abort on prod data · Critical
`20261019230000_recon_p2_toll_import.sql:39` creates `UNIQUE (organization_id, provider_ref)`. Prod has **4 duplicate ref groups**, and two of them are *live* tolls with the same Txn ID on different dates:

| ref | rows |
|---|---|
| `00400478` | live −380 on 2026-02-24 · live −380 on 2026-07-16 |
| `00400214` | live −380 on 2026-02-21 · live −380 on 2026-07-31 |
| `00100260` | live −380 · voided 0 (same day) |
| `00700049` | live −850 · voided 0 (same day) |

So the provider **reuses reference numbers**. Rev 1's "ref is unique per org" was wrong. When the index fails, P2 aborts, and P3, P4, P6 and P7 never apply.
**Fix:** `UNIQUE (organization_id, provider_ref, date) WHERE provider_ref IS NOT NULL AND status <> 'voided'`. That matches `refDedupKeysMatch` in `tollLedgerIntegrity.ts:130`, which already requires the same day and amount.

### R2-04 · `recon` schema isn't exposed to the API · Critical
`pgrst.db_schemas` = `public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, accounting, rush_config`. Every `getServiceClientWithSchema("recon")` call in `recon_routes.ts` (week_runs, run_sources, run_steps, run_events, source_attestations, external_source_requests), plus the 4 `.schema("recon")` calls in `week_close_recon.ts`, fails with *Invalid schema*. That means the whole wizard backend returns 500 even after migrating. A migration can't change this setting.
**Fix:** add `recon` in Dashboard → API → Exposed schemas, **and** do R2-05 first. Or route through `public` RPCs or views like the staging tables do.

### R2-05 · Staging tables are open to every tenant · Critical (security)
`public.recon_import_staging` and `public.recon_import_staging_rows` (P2 `:124-128`) are created **without `security_invoker`**. The underlying `recon.import_staging*` tables have **no RLS**. Prod default privileges on `public` give `anon` and `authenticated` full read/write (`arwdDxtm`) on new objects. Once applied, anyone holding the anon key can read and write every org's staged toll and fuel rows: driver IDs, amounts and plates. This is the same class of bug the settlement audit fixed three times. `recon.source_attestations` and `recon.external_source_requests` (P1, P6) also lack RLS policies.
**Fix:** `WITH (security_invoker = true)`, `REVOKE ALL ... FROM anon, authenticated`, `ENABLE ROW LEVEL SECURITY` + org policies on every `recon.*` table, and `GRANT USAGE ON SCHEMA recon` only to the roles that need it. Add the staging views to `scripts/assert-ledger-view-invoker.mjs`.

### R2-06 · Coverage never sees new uploads · Critical
`compute_source_coverage` (P1 `:32-51`) reads `import_batches.source_id/coverage_start/coverage_end`. Only the one-off P0 backfill fills those. Every new batch is written via `kv.set('batch:…')` → `fleet_domains.ts:147-160` mapper, which **maps none of the new columns** (`source_id`, `coverage_*`, `data_*`, `week_keys`, `semantic_key`, `file_sha256`, `rows_*`, `supersedes`). `/register` and the toll `/commit` only update the KV payload.
**Result:** after deploy, every new Uber, toll usage, top-up and gas-card upload still shows **Missing**. The semantic-dedupe unique index never fires, which re-opens WR-H2.
**Fix:** add the columns to the `import_batches` mapRow. Same root cause as R2-07 and R2-08.

### R2-07 · New tolls never get `service_line_source` in the table · High
`ensureTollLedgerServiceLine` stamps the record, but the toll mapper (`fleet_domains.ts:200-223`) maps `service_line` and not `service_line_source/_set_at/_set_by`. The fuel mapper does map them. `countUnattributedForWeek` (`week_close_recon.ts:147-154`) and the Attribution step filter on that column, so **new unattributed tolls are invisible**, and `LINE_UNATTRIBUTED` undercounts.

### R2-08 · New trips default to `rideshare`, including future Rush trips · High (blocks Delivery)
The trips mapper (`fleet_domains.ts:132-146`) doesn't map `service_line` at all. After P0 (`NOT NULL DEFAULT 'rideshare'`), every new trip is stamped rideshare by the column default, **including `platform='Roam Rush'`**. Fix this before `RUSH_TRIP_PROJECTION` is turned on. Map it and derive it from `platform` at write time, as the backfill does.

### R2-09 · `cash_fuel` coverage throws at runtime · Medium
`recon._day_has_daily_rows` (P1 `:91-100`) reads `fleet.fuel_entries.import_batch_id`, **which doesn't exist**. plpgsql only fails when that branch runs, so the migration applies, then every `cash_fuel` coverage call errors. `fetchCoverageMap` turns the error into "all missing". Use `payload_json->>'batchId'` or the real column.

### R2-10 · Migration versions use hour 24–27 · Low
`20261019240000` … `20261019270000` aren't valid timestamps. They sort correctly, but rename them to `20261020000000…` before applying, to avoid tooling surprises.

---

## 3a. Where the user still has to leave the page

What works inline today (`ReconSourcesStep.tsx:178-188`): **toll usage, toll top-ups and the gas card statement** open an uploader in a dialog without leaving the page. Everything below breaks the one-screen rule.

### R2-24 · Uber and InDrive uploads send the user to the Data Center · High
`openUpload()` falls through to `onNavigateImports()` → `onNavigate('imports')` for `uber_bundle` and `indrive_trips` (`ReconSourcesStep.tsx:189`, `ReconRunPage.tsx:175`). Trips are the first and most important upload, so this is the main round trip you wanted removed.
**Fix:**
- **Uber:** mount the existing week-scoped flow inline. `previewUberCashRefresh` + `commitUberCashRefresh` (`utils/commitUberImportFromFiles.ts:154,252`) already take a `weekKey` and enforce the full bundle, and `CloseWeekUberReimportDialog.tsx` already wraps them in a dialog. Open that dialog from the Uber card (with "drop all 9 files" + the required-file checklist from Rev 1 §5.4), then call `registerUberBundleWithRecon` and refresh the run.
- **InDrive:** extract the InDrive commit out of `ImportsPage.tsx` into `utils/commitIndriveImport.ts` (same pattern as the Uber util), and add an `IndriveUploadDialog`. `TripReImportFlow` with `platformFilter="InDrive"` is the fallback if the extraction is too big.
- Delete `onNavigateImports` from the Sources step once both are inline, so no source can route out.

### R2-25 · Trips & Earnings step links out · Medium
`ReconTripsEarningsStep.tsx:105,114` sends the user to Driver Settlements and Close Week to fix earnings blockers. Show the blockers inline instead (`CASH_SOURCE_MISMATCH` list with the existing **Accept statement cash** action, `weekCloseApi.acknowledgeCashSource`, and "Re-upload Uber week", which opens R2-24's dialog). Keep a secondary "Open in Driver Settlements" link for power users only.

### R2-26 · Settlement and Close steps are placeholders · High
`ReconRunPage.tsx:208-218` renders "*opens in a later phase*" for `settlement_preview` and `close`, so the user has to go to the Close Week page to finish. Embed both:
- **Settlement:** the per-driver amounts table the Close Week confirm already shows (read-only).
- **Close:** the Close Week confirm + evidence pack (Rev 1 §5.7), calling `weekCloseApi.sync` → `close` with `serviceLine`. Reopen lives here too.

### R2-27 · The wizard is off, so users still see the old hub · Medium
`useReconWizardEnabled()` only reads `VITE_RECON_WIZARD` (default off). The live page is the old Fuel/Tolls hub with a new `All / Rideshare / Delivery` filter on top: no Sources step, no uploads. That's expected until R2-01…R2-12 are fixed, but it means **none of the one-screen work is visible yet**. When turning it on:
- Make the wizard the default landing.
- Drop the Fuel/Tolls tabs. They become steps inside a week.
- Move the Rideshare/Delivery switch above the week list (one switch, not a filter per lane).

### R2-28 · Roam-issued gas card shows an upload button · Low
`openUpload` treats `fuel_card_roam` like `fuel_card_self` and opens the uploader. Roam uploads those statements, so the fleet user should see **Waiting on Roam · Remind Roam**, not an upload button. Only a Roam staff member (`recon.external_sources`) should see upload on that card.

## 3. Gaps in the wizard itself

### R2-11 · Step gates don't gate · High
`POST /recon/runs/:line/:week/steps/:stepId/complete` (`recon_routes.ts:1178-1243`):
- doesn't check that the step is unlocked (earlier steps done, feeding sources received);
- writes `actionable: 0` without reading the lane. The Toll and Fuel lane counters are **never written to `run_steps`** (created as 0 at `:371-377`, never updated). Only the Sources step is computed (`:431`).

**Effect:** anyone can mark Tolls or Fuel complete while the lane has open items, or while sources are missing. "Server owns every gate" isn't true yet.
**Fix:** on complete and on every run read, compute `actionable` server-side from the lane state (toll `computeGatedStepStates` inputs; `fuel_reconciliation_period.counts`/`status`), then refuse if `evaluateRun` says the step is locked or `actionable > 0`.

### R2-12 · Every recon write uses a read permission · High
All 9 recon routes, including **waive**, **attribution** (which rewrites `service_line` on toll and fuel money rows) and **step complete**, require only `transactions.view`. The `recon.view / prepare / approve` roles from Rev 1 §4.11 were never added. Only `recon.external_sources` exists. A view-only user can waive a source or move money between lines.

### R2-13 · Close reads a stale coverage snapshot · Medium
`loadWeekCloseReconContext` (`week_close_recon.ts:245-249`) uses the persisted `run_sources.coverage` before live coverage. Nothing refreshes `run_sources` on import commit or rollback; that only happens when someone opens the wizard. A rollback after the wizard was last opened can let close see "received". **Fix:** always compute live coverage on preview and close.

### R2-14 · `STEP_STALE` can't fire at close · Medium
The close path builds source snapshots with `inputHash: null` (`week_close_recon.ts:259`), while the wizard stores real hashes in `inputs_hash_at_complete`. **Effect:** close can't detect that data changed after a step was reviewed. Use the same `inputHash` computation as `materializeRunSources`.

### R2-15 · Uber coverage uses trip dates, not the statement period · Medium
`registerUberBundleWithRecon` (`commitUberImportFromFiles.ts:229-240`) sets `coverage = min/max trip date`. A zero-trip day at the edge of a statement (e.g. Mon Oct 12; the Oct 13–18 bundle) stays **Missing** even though the statement covered it, so users have to attest it every week. Take coverage from `payments_organization`'s statement period.

### R2-16 · Embedded lanes aren't line-scoped · Medium
`ReconRunPage.tsx:185` mounts Tolls (and Fuel) with `hideLanding` but no `serviceLine`. In a both-lines org, the Rideshare run shows delivery tolls and fuel, and vice versa. Rideshare-only orgs are unaffected.

### R2-17 · Toll commit isn't one transaction · Medium
`/recon/imports/:id/commit` (`recon_import_routes.ts:606-646`) loops `saveTollLedgerEntry` row by row. Each call re-reads the **entire** toll ledger (`toll_controller.tsx:2954`), so it's slow on large files, and a mid-loop failure leaves a partial import with the staging row still `parsed`. Retrying is mostly safe because of ref dedupe, but rows without a ref rely on fingerprint. The browser row-loop fallback (`BulkImportTollTransactionsModal.tsx:1152+`) also still exists. **Fix:** a single RPC insert, then delete the client fallback.

### R2-18 · Two tag balances · Medium
The bulk import's read-modify-write is gone, and `fleet.compute_vehicle_tag_balance()` exists. But `LogTollUsageModal.tsx:95` and `LogTollTopupModal.tsx:81` still read and write `vehicle.tollBalance` client-side, so the stored and derived balances will drift. Switch both modals and all balance displays to the derived value.

---

## 4. Small items

| # | Item |
|---|---|
| R2-19 | **Runtime crash:** `BulkImportTollTransactionsModal.tsx:1048` uses an undefined `text`, so the AI-parse path always shows "AI Analysis Failed". Pass the file text. |
| R2-20 | 10 new `tsc` errors (fleet total 500 → 513): `WeekReconciliationPage.tsx:276`, `ImportsPage.tsx:1234`, `BulkImportTollTransactionsModal.tsx:1048`, `commitUberImportFromFiles.ts:398`, `fuelStatementImportFlow.ts:11,194-197,206`. Gate the next commit on `tsc` delta = 0. |
| R2-21 | `evaluate_run_mirror.ts` has a Keep-in-sync header but **no drift test**. Add one next to `recon_sources_mirror.drift.test.ts` and list it in `ci.yml`. |
| R2-22 | Server flag `RECON_WIZARD` is declared and never read. The wizard is gated only by the client `VITE_RECON_WIZARD`, while the toll import uses the new API with no flag at all. Gate the staged import on the same flag. |
| R2-23 | Delivery: `courier_earnings` is allowed and the readiness card works, but nothing writes courier statements and there's no courier close. This is expected while the §7 prerequisites are unmet. Keep Delivery behind the card. |

---

## 5. Deploy order

1. Fix R2-03, R2-05, R2-09 and R2-10 in the migration files.
2. Fix the mappers (R2-06, R2-07, R2-08) and R2-19.
3. Apply the migrations to a **branch DB** first, then prod. Check: `recon` tables exist, `try_claim_week_close` has 5 args, `fleet.trips` has 0 NULL lines, and `toll_ledger.service_line_source` is filled.
4. Expose `recon` (R2-04), then redeploy `fleet-core`, `fleet-toll`, `fleet-fuel`, `fleet-pay` and `fleet-claims` from the same commit.
5. Smoke test in prod: one toll CSV import, the Close Week preview on an open week, one Uber bundle. **Expect the week's Sources to show Covered.**
6. Fix R2-11 and R2-12, and the one-screen gaps R2-24 and R2-26, **before** setting `VITE_RECON_WIZARD=1` for anyone. Then do R2-27.
7. Keep `SOURCE_ENFORCE` unset (warn) for two closed weeks, then flip it (`docs/recon-source-enforce-flip.md`).

## 6. Owner questions still open

- **Q1** Is a waived source closeable without a second approver? (Needed for R2-12.)
- **Q2** How should shared costs on a both-lines vehicle be allocated: trip mix, km mix, or manual?
- **Q3** Should rideshare and courier balances ever net against each other at payout?
- **Q5** Does the toll provider's statement include a closing balance? (Decides how automatic the Tag Account step can be.)
