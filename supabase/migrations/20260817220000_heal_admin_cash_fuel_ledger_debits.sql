-- Heal legacy admin manual cash fuel: positive Fuel_Manual_Entry → Expense debit (driver portal parity).
UPDATE fleet.transactions t
SET
  type = 'Expense',
  amount = -ABS(t.amount),
  payload_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(t.payload_json, '{}'::jsonb),
        '{type}',
        '"Expense"'::jsonb
      ),
      '{amount}',
      to_jsonb(-ABS(t.amount))
    ),
    '{metadata,ledgerDebitNormalizedAt}',
    to_jsonb(now()::text)
  ),
  updated_at = now()
WHERE t.type = 'Fuel_Manual_Entry'
  AND t.category = 'Fuel'
  AND t.amount > 0
  AND COALESCE(t.payload_json->'metadata'->>'paymentSource', 'rideshare_cash')
    IN ('rideshare_cash', 'driver_cash', 'petty_cash', 'RideShare Cash', 'Cash', 'Other');
