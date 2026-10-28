-- merchant_hours had RLS enabled with no policies, blocking partner saves.

CREATE POLICY "Merchant hours viewable by all" ON delivery.merchant_hours
  FOR SELECT USING (true);

CREATE POLICY "Merchant hours editable by owner" ON delivery.merchant_hours
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_hours.merchant_id AND owner_id = auth.uid()
    )
  );
