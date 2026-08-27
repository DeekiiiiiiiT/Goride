-- Remove PayPal from preferred payment rails. Historical payment_intents stay untouched.
UPDATE delivery.customers
SET preferred_payment_method = 'wipay'
WHERE preferred_payment_method = 'paypal';

ALTER TABLE delivery.customers
  DROP CONSTRAINT IF EXISTS customers_preferred_payment_method_check;

ALTER TABLE delivery.customers
  ADD CONSTRAINT customers_preferred_payment_method_check
  CHECK (preferred_payment_method IN ('wipay', 'cash'));

COMMENT ON COLUMN delivery.customers.preferred_payment_method IS
  'Default checkout method: wipay or cash. PayPal permanently removed.';
