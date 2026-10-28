-- Rush Phase 1: tier auto-ads + Phase 2 prep (dominant_assigned_at)

ALTER TABLE delivery.merchant_tiers
  ADD COLUMN IF NOT EXISTS auto_ads boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN delivery.merchant_tiers.auto_ads IS
  'When true, merchants on this tier are auto-promoted in discovery (Dominant default).';

UPDATE delivery.merchant_tiers
SET auto_ads = true
WHERE slug = 'dominant';

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS dominant_assigned_at timestamptz NULL;

COMMENT ON COLUMN delivery.merchants.dominant_assigned_at IS
  'When merchant was assigned Dominant tier (Phase 2 exclusivity / cooldown).';
