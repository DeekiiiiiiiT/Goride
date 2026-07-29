-- Customer ops desk: internal support notes on Dash customers.
ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS admin_internal_notes text;

COMMENT ON COLUMN delivery.customers.admin_internal_notes IS
  'Internal Dash support notes (admin-only). Not visible to the customer.';
