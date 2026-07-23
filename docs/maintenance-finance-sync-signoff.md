# Maintenance ↔ Finance Sync — automated sign-off (2026-07-23)

## Automated
- [x] `canonicalMaintenanceLedger` unit tests (9) — eligibility, idempotency, currency
- [x] Vehicle analytics + expense hub UI contracts still pass
- [x] `POST/DELETE/PATCH` maintenance-logs wired to `appendCanonicalMaintenanceIfEligible` / `deleteCanonicalLedgerBySource`
- [x] `POST/GET` maintenance-requests present
- [x] Overdue digest cron route present
- [x] Currency column migration applied on GoRide (`maintenance_records.currency`)
- [x] Dead fleet `maintenance-templates` manager + service removed

## Manual (after edge function deploy)
1. Log completed service with cost > 0 → books + history
2. Log cost 0 → history only
3. Delete log → ledger removed
4. Driver request → Requested on hub (no $0 expense)
5. Complete request with cost → ledger once
6. Cron: `POST .../maintenance/overdue-digest` with cron secret (twice same day → no duplicate alerts)
7. Save vehicle with new catalog match and empty schedule → bootstrap rows appear

## Deploy note
Ship the fleet edge function (`make-server-37f42386`) so routes and ledger writers go live.
