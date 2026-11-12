# Cursor prompt — Toll Phase 1, P1-R2: Roam native tests

Claude built `supabase/migrations/20261112222929_toll_v2_roam_native.sql`. **Do not change any migration.** If a test shows it is wrong, report it and stop.

Read it first. What it gives you:
- **`toll_system.native_ride_charge(company, ride jsonb)`** (and the service-only wrapper `public.toll_sys_native_ride_charge`).
  - Ride fields: `ride_id`, `payment_method` (`card` / `cash`), `driver_id`, `vehicle_id`, `ended_at`, `estimated_tolls_minor`, and `crossings: [{id, plaza_id, amount_minor, crossed_at, paid_by: 'tag'|'cash'}]`.
  - One charge per crossing (`source 'roam_ride'`, `source_ref 'roam_crossing:<id>'`, verified, P2 tag / P3 cash).
  - **Card:** payback `roam:<ride_id>` for the rider's toll paid (estimated + max(0, actual − estimated)). `received_by` is `fleet` if `organizations.fleet_org_payout_enabled`, else `driver` (P4 / P5). It is linked to the charges (P6), and any leftover is left unlinked with reason `roam_estimate_over_actual`.
  - **Cash:** charges only, with `awaiting_cash = true`.
- **`toll_system.native_cash_settled(company, ride jsonb)`** (wrapper `public.toll_sys_native_cash_settled`).
  - Fields: `ride_id`, `outcome` (`exact` / `overpay` / `underpay` / `unpaid`), `cash_received_minor`, `estimated_tolls_minor`, `driver_id`, `settled_at`.
  - Payback = toll paid for exact / overpay, `least(toll paid, cash received)` for underpay, 0 for unpaid. The response `branch` is one of:
    - `open`: payback + links; the rest of the charge goes to the fleet with reason `rider_arrears`.
    - `reopened`: the week was sealed with a provisional fleet decision, then reopened. That decision is reversed first, then it continues as `open`.
    - `sealed`: a `cash_recovered` `toll.carried_facts` row in the **current** week + P20; the sealed week's own rows are untouched.
- Both are no-ops (`{"skipped":"tolls_v2_off"}`) unless `toll.switch_state.tolls_v2` is on for the company. Both are repeat-safe per ride (`replay: true`).
- **New seal rule:** `seal_week` refuses a week that hasn't ended (`WEEK_NOT_ENDED`, 409). The existing toll tests now use 2024 dates for this reason; keep new tests in the past too.

## 1. Write `supabase/tests/toll_v2_roam_native.sql`
Same style as the other toll tests (`BEGIN … ROLLBACK`, made-up users and companies, all weeks in **2024**). Every case asserts the exact rows and amounts **and** ends with `toll_system.nightly_checks(company)` all `ok`.

1. **Switched off:** both functions return `skipped`, and no rows are written.
2. **Card, estimate = actual**, fleet payout **off** → payback `received_by 'driver'` (P5), fully linked, no unlinked row.
3. **Card, fleet payout on** (set `organizations.fleet_org_payout_enabled = true`) → `received_by 'fleet'` (P4).
4. **Card, estimate > actual** (1,500 vs 1,200) → payback 1,500, link 1,200, unlinked 300 with reason `roam_estimate_over_actual`.
5. **Card, estimate but no crossing** → payback = estimate, all of it unlinked, no charges.
6. **Card, actual > estimate** (two crossings, one tag and one cash) → payback = actual; P2 and P3 each once.
7. **Cash, open week, exact** → after `native_ride_charge` the charge is `awaiting_cash`. After settled: payback = toll paid (P5), linked, `awaiting_cash` false.
8. **Cash, underpay** (toll paid 1,000, cash received 600) → payback 600, linked 600, fleet 400 with reason `rider_arrears`.
9. **Cash, unpaid** → no payback; the whole charge goes to the fleet (`rider_arrears`).
10. **Cash, sealed week:** charge in a 2024 week; seal it as the owner (`public.toll_v2_command('seal_week', …)`; the provisional fleet allocation appears); then settle exact. Expect `branch 'sealed'`, a `cash_recovered` carried fact with `to_week` = the current week, P20 for the recovered amount, and the sealed week's `source_hash` and check 4 unchanged.
11. **Cash, reopened week:** seal, `reopen_week`, then settle. Expect `branch 'reopened'`, the provisional allocation's `reversed_by` set, a reversing P8, then a payback and links as in case 7.
12. **Replay:** calling either function twice for the same ride gives `replay: true`, with no new rows and no new ledger rows.
13. **Bad input:** a missing `ride_id`, `payment_method 'bitcoin'`, a crossing with `paid_by 'card'` or amount 0, and `outcome 'maybe'` all raise.
14. **`WEEK_NOT_ENDED`:** sealing the current week (`ledger.jamaica_week_start(now())`) as the owner raises `WEEK_NOT_ENDED`.
15. **Grants:**
    - `public.toll_sys_native_ride_charge` and `public.toll_sys_native_cash_settled`: EXECUTE for `service_role` only (not `anon` or `authenticated`);
    - `toll_system.native_*`: not `authenticated`.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## 2. Contract test update: `supabase/tests/toll_v2_contract.sql`
Add one check: every `public.toll_sys_%` function is EXECUTE-able by `service_role` and **not** by `anon` or `authenticated` (the service-only entry points, the mirror of the `public.toll_v2_%` rule). Don't change the existing checks.

## Run (once; Docker Desktop open)
`pnpm test:toll` (it resets the database first). If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
