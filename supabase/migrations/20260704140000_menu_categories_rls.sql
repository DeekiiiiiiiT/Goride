-- menu_categories had RLS enabled with no policies, blocking partner menu setup.

CREATE POLICY "Menu categories viewable by all" ON delivery.menu_categories
  FOR SELECT USING (true);

CREATE POLICY "Menu categories editable by merchant owner" ON delivery.menu_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = menu_categories.merchant_id AND owner_id = auth.uid()
    )
  );
