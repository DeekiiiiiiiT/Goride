-- Customer account status for admin suspend

ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_customers_account_status
  ON delivery.customers(account_status);
