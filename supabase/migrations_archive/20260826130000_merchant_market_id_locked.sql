-- Ops can lock merchant town assignment so publish recompute won't overwrite.
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS market_id_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN delivery.merchants.market_id_locked IS
  'When true, coverage publish/restore will not auto-change market_id from the store pin.';
