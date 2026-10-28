-- Merchant holiday / exception hours (server-enforced on order place).

CREATE TABLE IF NOT EXISTS delivery.merchant_special_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  special_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  open_time time,
  close_time time,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, special_date)
);

CREATE INDEX IF NOT EXISTS merchant_special_hours_merchant_date_idx
  ON delivery.merchant_special_hours (merchant_id, special_date);

ALTER TABLE delivery.merchant_special_hours ENABLE ROW LEVEL SECURITY;

-- Merchants can read their own special hours via authenticated membership patterns used elsewhere;
-- service role used by edge functions for writes/gates.
DROP POLICY IF EXISTS merchant_special_hours_select_service ON delivery.merchant_special_hours;
CREATE POLICY merchant_special_hours_select_authenticated
  ON delivery.merchant_special_hours
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE delivery.merchant_special_hours IS
  'Holiday/exception hours; place-order gate must honor these over regular merchant_hours.';
