-- "Team members read team roster" queried merchant_team_members inside its own
-- policy, causing infinite recursion when orders policies touched that table.

DROP POLICY IF EXISTS "Team members read team roster" ON delivery.merchant_team_members;

CREATE POLICY "Merchant team readable by owner or member"
  ON delivery.merchant_team_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_members.merchant_id
        AND m.owner_id = auth.uid()
    )
  );
