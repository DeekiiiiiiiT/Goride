# Cursor prompt — Toll Phase 1, P1-R5: metrics + missed-Roam-ride tests

Claude built `supabase/migrations/20261112232007_toll_v2_metrics_and_roam_gap.sql`. **Do not change any migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

What it gives you:
- `toll_system.company_metrics(company)` → JSON with `tollsV2`, `pendingCharges`, `unverifiedReceipts`, `awaitingCash`, `unallocatedPaybacks`, `afterSeal` (each with a count, an amount where it makes sense, and `oldestAt`), plus `reviewPairsOpen`, `receivablePlatformMinor`, `openAlerts {page, watch}` and `lastNightly {at, failed}`.
- `public.toll_v2_metrics()` for signed-in readers with `toll.view` (owner, manager, accountant), own company only (same rules as `public.toll_v2_week_result`).
- `toll_system.roam_gap_alerts(company)`, run inside `aging_alerts` by the nightly run. For a v2 company, a ride in `rides.ride_requests` (this company, `completed` or `awaiting_cash_settlement`, ended after the switch row's `changed_at` and more than 1 hour ago) with a `rides.ride_toll_crossings` row that has **no** `toll.charges` row (`source 'roam_ride'`, `source_ref 'roam_crossing:<crossing id>'`) raises a `watch` alert `roam_gap:<ride id>`.

## Write `supabase/tests/toll_v2_metrics.sql`
Same style as the other toll tests (`BEGIN … ROLLBACK`, made-up users and companies). For `rides.ride_requests`, the required columns are `rider_user_id`, the pickup and dropoff lat / lng, and `fare_estimate_minor`; a `completed` ride also needs `payment_method`, `fare_final_minor` and `completed_at`.

1. **Metrics numbers:** one company with 2 pending charges (different ages), 1 unverified receipt, 1 awaiting-cash charge, 1 payback with an unallocated part, 1 after-seal charge, 1 open review pair, 1 page alert and 2 watch alerts, and a nightly run. Each number and `oldestAt` is right.
2. **Who may read:** owner / manager / accountant can read; viewer, driver and no-company tokens are refused (`FORBIDDEN` / `NO_COMPANY`); a company-B token never sees A's numbers. Grants: `anon` and `service_role` can't EXECUTE `public.toll_v2_metrics`.
3. **Missed Roam ride:**
   - a v2 company's completed ride (3 hours ago) with a crossing and no charge → after `toll_system.nightly_run()` there's an open `roam_gap:<ride id>` alert;
   - after recording the charge (call `toll_system.native_ride_charge` for that ride), the next run resolves it;
   - **no** alert for: a ride ended less than 1 hour ago; a ride ended before the switch's `changed_at`; a company with v2 off; a crossing that does have its charge.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## Run (once; Docker Desktop open)
`pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
