-- Team member access policies (non-owner staff)

CREATE POLICY "Team members read team roster"
  ON delivery.merchant_team_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchant_team_members tm
      WHERE tm.merchant_id = merchant_team_members.merchant_id
        AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_members.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team members read orders"
  ON delivery.orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = orders.merchant_id AND m.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM delivery.merchant_team_members tm
      WHERE tm.merchant_id = orders.merchant_id
        AND tm.user_id = auth.uid()
        AND 'orders' = ANY(tm.permissions)
    )
  );

CREATE POLICY "Team members update orders"
  ON delivery.orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = orders.merchant_id AND m.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM delivery.merchant_team_members tm
      WHERE tm.merchant_id = orders.merchant_id
        AND tm.user_id = auth.uid()
        AND 'orders' = ANY(tm.permissions)
    )
  );
