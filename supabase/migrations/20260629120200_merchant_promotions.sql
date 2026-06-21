-- Merchant promotions (partner app Screens 42-43)

CREATE TABLE delivery.merchant_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('percent_off', 'amount_off', 'free_delivery', 'bogo')),
  title text NOT NULL,
  discount_percent numeric,
  discount_amount numeric,
  min_order numeric,
  applies_to text NOT NULL DEFAULT 'entire_order'
    CHECK (applies_to IN ('entire_order', 'specific_items', 'specific_category')),
  promo_code text NOT NULL,
  customer_eligibility text NOT NULL DEFAULT 'all'
    CHECK (customer_eligibility IN ('all', 'new', 'returning')),
  date_start date NOT NULL,
  date_end date,
  usage_limit_per_customer integer,
  redemptions integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'scheduled', 'ended', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX merchant_promotions_code_per_merchant
  ON delivery.merchant_promotions (merchant_id, upper(promo_code));

CREATE INDEX merchant_promotions_merchant_status_idx
  ON delivery.merchant_promotions (merchant_id, status);

ALTER TABLE delivery.merchant_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant owners manage promotions"
  ON delivery.merchant_promotions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_promotions.merchant_id
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_promotions.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE delivery.merchant_promotions IS 'Merchant-created promotional offers';
