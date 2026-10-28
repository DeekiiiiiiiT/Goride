-- P-1: Backfill legacy settlement_status = 'overpaid' to directional status.
-- Prior deploy wrote 'overpaid'; new list endpoints filter it out and weeks vanish from desks.

UPDATE ledger.driver_financial_periods
SET settlement_status = CASE
  WHEN ABS(settlement_amount) < 0.01 THEN 'settled'
  WHEN settlement_amount > 0 THEN 'company_owes'
  ELSE 'driver_owes'
END,
updated_at = NOW()
WHERE settlement_status = 'overpaid';
