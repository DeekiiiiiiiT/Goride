-- In-House restaurants are run by Roam. They have no partner login.
-- Partner restaurants still require exactly one owner.

ALTER TABLE delivery.merchants
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_owner_matches_procurement;

ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_owner_matches_procurement
  CHECK (
    (procurement_mode = 'partner' AND owner_id IS NOT NULL)
    OR (procurement_mode = 'in_house' AND owner_id IS NULL)
  );

COMMENT ON CONSTRAINT merchants_owner_matches_procurement ON delivery.merchants IS
  'Partner restaurants belong to one owner. In-House restaurants belong to Roam and have no owner.';
