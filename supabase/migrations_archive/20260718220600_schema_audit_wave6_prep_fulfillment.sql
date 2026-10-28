-- Schema audit Wave 6: prep stations RLS confirm + fulfillment/tax CHECKs
-- Prep stations RLS + policies already applied in 20260718160000_rls_wave0.

ALTER TABLE delivery.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_type_check;
ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_fulfillment_type_check
  CHECK (
    fulfillment_type IS NULL
    OR fulfillment_type IN ('delivery', 'pickup', 'dine_in', 'counter')
  );

ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_pos_tax_rate_percent_check;
ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_pos_tax_rate_percent_check
  CHECK (
    pos_tax_rate_percent IS NULL
    OR (pos_tax_rate_percent >= 0 AND pos_tax_rate_percent <= 100)
  );

-- Ensure team members (not only owner) can manage prep stations like sibling venue tables
DROP POLICY IF EXISTS "Merchant team manage prep stations" ON delivery.merchant_prep_stations;
CREATE POLICY "Merchant team manage prep stations"
  ON delivery.merchant_prep_stations
  FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  );

-- Owner-only ALL policy is redundant once team manage exists; keep owner manage for clarity
-- or drop to avoid double ALL. Prefer single team-scoped policy:
DROP POLICY IF EXISTS "Merchant owner manages prep stations" ON delivery.merchant_prep_stations;
