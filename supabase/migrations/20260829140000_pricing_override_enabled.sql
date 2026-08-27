-- Soft on/off for parish & town pricing overrides (without deleting saved rules).

ALTER TABLE delivery.parish_pricing_profiles
  ADD COLUMN IF NOT EXISTS override_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE delivery.market_pricing_profiles
  ADD COLUMN IF NOT EXISTS override_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN delivery.parish_pricing_profiles.override_enabled IS
  'When false, parish override is skipped at quote time (inherits Default).';
COMMENT ON COLUMN delivery.market_pricing_profiles.override_enabled IS
  'When false, town override is skipped at quote time (inherits Default/Parish).';
