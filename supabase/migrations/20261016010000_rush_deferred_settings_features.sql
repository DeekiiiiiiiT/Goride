-- Rush deferred settings features: delivery PIN, courier DOB, wait pay fields, menu price review.

-- ── Orders: delivery PIN + ensure fulfillment_type usable for customer pickup ──
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS delivery_pin text,
  ADD COLUMN IF NOT EXISTS delivery_pin_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_pay_jmd integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN delivery.orders.delivery_pin IS
  '4-digit customer handoff PIN when courier.delivery.pin_required_over_jmd applies';
COMMENT ON COLUMN delivery.orders.delivery_pin_verified_at IS
  'Set when courier successfully verifies delivery_pin at drop-off';
COMMENT ON COLUMN delivery.orders.wait_pay_jmd IS
  'Sum of billable restaurant wait pay (J$) credited to courier earnings';

-- ── Courier profiles: date of birth for min-age signup ──
ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMENT ON COLUMN delivery.courier_profiles.date_of_birth IS
  'Courier DOB collected at onboarding; enforced against courier.signup.min_age';

-- ── Wait events: grace / billable / pay ──
ALTER TABLE delivery.courier_wait_events
  ADD COLUMN IF NOT EXISTS grace_minutes integer,
  ADD COLUMN IF NOT EXISTS billable_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wait_pay_jmd integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN delivery.courier_wait_events.grace_minutes IS
  'Grace from courier.delivery.wait_grace_minutes at log time';
COMMENT ON COLUMN delivery.courier_wait_events.billable_minutes IS
  'max(0, wait_minutes - grace_minutes)';
COMMENT ON COLUMN delivery.courier_wait_events.wait_pay_jmd IS
  'billable_minutes * J$20/min (v1 constant)';

-- ── Menu price change review queue ──
CREATE TABLE IF NOT EXISTS delivery.menu_price_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  pct_increase numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_price_change_requests_pending
  ON delivery.menu_price_change_requests (status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_menu_price_change_requests_merchant
  ON delivery.menu_price_change_requests (merchant_id, created_at DESC);

ALTER TABLE delivery.menu_price_change_requests ENABLE ROW LEVEL SECURITY;

GRANT ALL ON delivery.menu_price_change_requests TO service_role;
GRANT SELECT ON delivery.menu_price_change_requests TO authenticated;

COMMENT ON TABLE delivery.menu_price_change_requests IS
  'Partner menu price increases above partner.menu.price_change_review_pct awaiting ops approval';
