-- Pre-deploy (P-1): count legacy overpaid rows before backfill migration.
SELECT COUNT(*) AS overpaid_status_rows
FROM ledger.driver_financial_periods
WHERE settlement_status = 'overpaid';

SELECT COUNT(*) AS overpaid_badge_rows
FROM ledger.driver_financial_periods
WHERE (metadata->'financeCore'->>'overpaidAmount')::numeric > 0.005;
