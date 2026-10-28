# Unified Ledger Disk IO — Audit

**Rev 3 · 2026-10-28 · Project `csfllzzastacofsvcdsc` (Nano) · Closeout in progress**

## Status

R1–R10 closed in prod: schemas restored (R2), signed reversals + page `meta` + `range_summary` (R3/R4/R6), edge read path + parity (R5/R7/R8/R10), six Fleet bundles + roamfleet.co redeployed (R1). Disk spill still **~90 MB/day**. `make-server-37f42386` is not in the live function list.

**Still gated by the clock:**
- **R12** — resume `emergency_off` only after one full calendar day under 200 MB temp post-R1 deploy.
- **R13** — Nano vs size-up after 7 days of `private.io_snapshots` from the R1 deploy.

## Must fix — prod is broken or money is wrong

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| R1 | Fleet bundles not rebuilt. `fleet-core`, `fleet-ops`, `fleet-pay`, `fleet-fuel`, `fleet-toll`, `fleet-claims`, `make-server-37f42386` `index.ts` still contain `listAllUnifiedCanonicalEvents` and call `ledger_entries_for_driver`, which `20261027190700` dropped. | `POST /rest/v1/rpc/ledger_entries_for_driver` → **404** at 2026-10-28 00:12 UTC (×4) and 500 at 17:38. Driver ledger screens fail. | After R2–R6, rebuild every Fleet bundle, deploy all seven, and deploy the Fleet frontend in the same window. Check: no new `ledger_entries_for_driver` requests in edge logs, and no `ledger_entries … OFFSET` statement in `pg_stat_statements`. |
| R2 | The schema cut (`20261027190800` + `config.toml`) removed `freight`, `logistics`, `rush_money`, `risk`, `rush_config`, `places`, `explorer` from the API. Edge code still calls all seven through `.schema(...)`. | `before-user-created/index.ts:83` writes `explorer.signup_intent`, so a Plug sign-up returns 500 and **the user is not created**. Also hit: `delivery/rushMoney/routes.ts` (38 calls), `_shared/rushSettings/getSetting.ts`, `_fleet-server/plug_public_price.ts` + `fleet-fuel` (`places`), `freight/*`, `logistics/*`, `explorer/index.ts`. | New migration that puts the seven schemas back in `pgrst.db_schemas` (same 15-schema list as before), and `config.toml` restored to match. Test a Plug sign-up and one Rush money call within 60 s. The reload cost is handled by R9. |
| R3 | Reversals are counted as positive. `ledger.week_totals.sum_minor` stores raw `amount_minor`; the old path made a reversal negative (`signedLedgerAmount`). | 73 reversal rows, **all stored positive**: 66 `fare_earning` (J$6,566.39, wk 24 Aug), 5 `fixed_expense` (J$181,729.08), 1 `prior_period_adjustment` (J$1,500), 1 `promotion` (J$95.76). Each is now off by twice its amount. `recon_check` cannot see it because it sums the same raw column. | In `ledger._week_totals_apply`, the backfill and `ledger.recon_check`, use `case when metadata->>'reversal' = 'true' then -abs(amount_minor) else amount_minor end` for `sum_minor` and the same sign on `gross_minor`. Rebuild `week_totals` + `batch_totals` in the same migration. |
| R4 | `mapPageRowToCanonical` (`_shared/unifiedLedger/readApi.ts:266`) passes only 7 metadata keys. Lost: `reversal`, `grossAmount`, `periodStart`/`periodEnd`, `paymentMethod`, `category`, `bankRole`, `recipient`, `source`, `organizationUuid`. | 184 rows carry `periodStart` (the statement overlap filter in `statement_summary_build.ts` stops seeing them). 28 `payout_bank` rows carry `bankRole`. Reversal sign and fare gross are lost in driver periods, toll seal and toll P&L. | `ledger.page` and `ledger.driver_page` return `meta jsonb` built with `jsonb_build_object` over exactly those keys (not full metadata). `mapPageRowToCanonical` passes `meta` through. |
| R5 | `listCanonicalViaPage` stops at 1,000 rows and returns the partial list without any error. | One driver has **3,448** settlement-type rows in the 52-week window `driver_financial_periods.ts:640` asks for. Tolls over 26 weeks = **1,668** (`toll_period_controller.tsx:332`, the P&L). `ledger_driver_events.ts` asks for up to 5,000 and gets 1,000. The statement's `>= 5000` guard can never fire. | When the cap is reached and `hasMore` is still true, `listCanonicalViaPage` throws `"Range too large — narrow the dates"` (the UI already shows `ledgerRangeError`). Driver periods and toll P&L only need sums, so they switch to `weekSummary`. |
| R6 | `ledger.week_summary` snaps `from`/`to` to whole Jamaica weeks, and the expense hub dates every total on `week_start`. | A month view (e.g. 1–31 Oct) includes 29–30 Sep and 1–2 Nov, and puts the 29 Sep week's spend in September. | `ledger.week_summary` raises when `from` is not a Monday or `to` is not a Sunday. Add `ledger.range_summary(p_org, p_from, p_to, p_entry_types, p_products)` that groups `ledger.entries` by `entry_type × day` (signed as in R3) on the `(organization_id, effective_at)` index; the expense hub calls it. |
| R7 | Bank deposits "expected" (`ledger_wallet_routes.ts:83`) changed meaning: week is now the deposit date's week, not `expectedBankWeekKey` (a Monday deposit pays the previous week). Dedupe of re-imported org deposits is gone, and an org deposit is recognised only by a null `driver_id`. | Every expected week shifts by one, and duplicates are counted twice. | Read `payout_bank` rows with `ledger.page` (+ R4 `meta`) for the 12-week window — a few dozen rows — then run the existing `dedupeOrgBankCanonicalEvents` and `expectedBankWeekKey` on them unchanged. |
| R8 | The parity test (`readApi.parity.test.ts`) compares the new fold with hand-made fixtures, not old path vs new path, so it missed R3–R7. CI runs it with `--no-check`. | No reversal, period or bank-role row is in the fixtures. | Fixtures copied from real rows (at least one reversal, one `periodStart` row, one org `payout_bank` duplicate, one 1,001-row range). Assert that the old canonical mapper + JS sum equals the new path to the cent, for statement, driver periods, expense hub and bank expected. Drop `--no-check`. |

## Then

| ID | Item | Fix |
|---|---|---|
| R9 | Each deploy that runs several migrations reloads the API schema cache several times (~25 MB temp each). | One `notify pgrst, 'reload schema'` at the end of each deploy batch, not one per migration file. |
| R10 | `/ledger/count` (`ledger_query_summary_routes.ts:140`) runs exact counts over `kv_store` with `like 'trip:%'` + `value->>organizationId` — a full KV scan each call. | Use `count: "estimated"` for both KV counts. |
| R11 | Nothing is committed: about 60 changed files, 9 new files, 11 migrations live in prod but not in git, plus an edit to the already-applied `20261020224911`. | Commit after R1–R8 pass. Then prove a fresh branch replays every migration (still unproven). |
| R12 | Emergency state still on: week calculator `emergency_off = true`. | Resume from admin after R1 is deployed and one full day stays under 200 MB temp. |
| R13 | Compute size decision. `private.io_snapshots` has 2 rows (since 27 Oct 23:54). | After 7 days from the R1 deploy: average under 200 MB/day and the Disk IO chart out of the red → stay on Nano. Otherwise one size up. |

## Checks (read-only)

```sql
-- disk spill today (target < 200 MB)
select pg_size_pretty(private.io_daily_temp_bytes());
-- read models vs ledger (target 0 rows; meaningful only after R3)
select * from ledger.recon_check('<org uuid>');
-- old pattern gone after R1 (target 0 rows)
select calls, left(query,120) from extensions.pg_stat_statements
where query ilike '%ledger_entries%' and query ilike '%offset%';
```

## Rules

1. API roles take unitless values only (`8MB` → `8mb` breaks every request).
2. Every role/setting change goes in a migration; test on a branch; check API logs within 60 s.
3. Heavy migrations one at a time, in a quiet hour; load a real screen after each.
4. The database adds up; the app asks for answers. No edge function sums raw ledger rows.
5. Every ledger read passes org + date range to SQL. No `select *`, no OFFSET, no exact count unless it is on screen.
6. A capped read that hits its cap is an error, never a partial answer.
7. Never drop a function or schema until the deployed bundles stop calling it (check edge logs, not source).
8. Ledger read changes ship with an old-vs-new parity test on real rows, to the cent.
9. Rides/Rush minute crons stay off on Nano while those apps are idle.
