-- Platform fee override: commission_rate NULL = use global dash platformFeeRate
-- Existing 0.15 default was unused in fee calc; null it so merchants stay on 5% global.

ALTER TABLE delivery.merchants
  ALTER COLUMN commission_rate DROP DEFAULT;

ALTER TABLE delivery.merchants
  ALTER COLUMN commission_rate SET DEFAULT NULL;

UPDATE delivery.merchants
SET commission_rate = NULL
WHERE commission_rate = 0.15;

COMMENT ON COLUMN delivery.merchants.commission_rate IS
  'Optional Dash platform fee override as 0–1 fraction (e.g. 0.05 = 5%). NULL = use global platformFeeRate from platform:settings:dash.';
