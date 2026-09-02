-- Partner click-audit Phase 2: persist capacity + social profile fields
ALTER TABLE delivery.merchant_settings
  ADD COLUMN IF NOT EXISTS max_daily_capacity integer;

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text;

COMMENT ON COLUMN delivery.merchant_settings.max_daily_capacity IS
  'Optional daily order cap set by merchant; enforcement is a follow-up';
COMMENT ON COLUMN delivery.merchants.instagram IS 'Public Instagram handle or URL';
COMMENT ON COLUMN delivery.merchants.facebook IS 'Public Facebook page URL or handle';
