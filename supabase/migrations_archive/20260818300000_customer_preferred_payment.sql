-- Persist the customer's default checkout rail across devices.
ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS preferred_payment_method text NOT NULL DEFAULT 'wipay';

ALTER TABLE delivery.customers
  DROP CONSTRAINT IF EXISTS customers_preferred_payment_method_check;

ALTER TABLE delivery.customers
  ADD CONSTRAINT customers_preferred_payment_method_check
  CHECK (preferred_payment_method IN ('wipay', 'paypal', 'cash'));

COMMENT ON COLUMN delivery.customers.preferred_payment_method IS
  'Default checkout method: wipay, paypal, or cash.';
