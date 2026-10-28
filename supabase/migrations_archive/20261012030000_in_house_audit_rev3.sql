-- Rev 3 In-House closeout. Applied from this file, after the live pizza migration.

ALTER TABLE delivery.procurement_tasks DROP CONSTRAINT IF EXISTS procurement_tasks_state_check;
ALTER TABLE delivery.procurement_tasks
  ADD CONSTRAINT procurement_tasks_state_check CHECK (state IN (
    'queued', 'claimed', 'placing', 'placed_external', 'ready_for_pickup',
    'picked_up', 'closed', 'exception', 'exception_before_purchase',
    'exception_purchase_unknown', 'exception_after_purchase', 'awaiting_customer', 'abandoned'
  ));

ALTER TABLE delivery.procurement_tasks
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz;

ALTER TABLE delivery.in_house_stores
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'beta';

ALTER TABLE delivery.in_house_stores DROP CONSTRAINT IF EXISTS in_house_stores_audience_check;
ALTER TABLE delivery.in_house_stores
  ADD CONSTRAINT in_house_stores_audience_check CHECK (audience IN ('beta', 'public'));

UPDATE delivery.in_house_stores SET audience = 'beta' WHERE audience IS NULL OR audience = '';

CREATE TABLE IF NOT EXISTS delivery.in_house_beta_customers (
  customer_id uuid PRIMARY KEY REFERENCES delivery.customers(id) ON DELETE CASCADE,
  email text,
  added_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.in_house_beta_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON delivery.in_house_beta_customers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery.in_house_beta_customers TO service_role;

CREATE TABLE IF NOT EXISTS delivery.in_house_alert_phones (
  phone text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.in_house_alert_phones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON delivery.in_house_alert_phones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery.in_house_alert_phones TO service_role;
