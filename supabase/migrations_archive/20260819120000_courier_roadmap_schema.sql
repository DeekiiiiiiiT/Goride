-- Courier roadmap: address line2, app settings, cancel compensation, peak pay, substitutes, stacked legs

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS delivery_address_line2 text,
  ADD COLUMN IF NOT EXISTS courier_compensation_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_pay_amount numeric DEFAULT 0;

ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS app_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS delivery.courier_peak_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  bonus_amount numeric NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  all_kingston boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_peak_windows_active_window
  ON delivery.courier_peak_windows (active, starts_at, ends_at)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS delivery.order_item_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  item_index integer NOT NULL,
  item_label text NOT NULL,
  substitute_label text NOT NULL,
  substitute_price numeric,
  substitution_status text NOT NULL DEFAULT 'pending'
    CHECK (substitution_status IN ('pending', 'approved', 'rejected')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  price_delta numeric DEFAULT 0,
  photo_url text,
  UNIQUE (order_id, item_index)
);

CREATE INDEX IF NOT EXISTS idx_order_item_substitutions_order
  ON delivery.order_item_substitutions (order_id, substitution_status);

CREATE TABLE IF NOT EXISTS delivery.courier_stack_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  stack_group_id uuid NOT NULL,
  sequence integer NOT NULL DEFAULT 1,
  leg_status text NOT NULL DEFAULT 'active'
    CHECK (leg_status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (courier_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_courier_stack_legs_courier_active
  ON delivery.courier_stack_legs (courier_id, leg_status)
  WHERE leg_status = 'active';

ALTER TABLE delivery.courier_stack_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY courier_stack_legs_service ON delivery.courier_stack_legs
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE delivery.courier_peak_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY courier_peak_windows_service ON delivery.courier_peak_windows
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE delivery.order_item_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_item_substitutions_service ON delivery.order_item_substitutions
  FOR ALL USING (true) WITH CHECK (true);
