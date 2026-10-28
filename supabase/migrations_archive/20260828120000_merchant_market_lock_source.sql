-- Split merchant town lock into manual (ops) vs pin (follows store pin).
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS market_id_lock_source text
  CHECK (market_id_lock_source IS NULL OR market_id_lock_source IN ('manual', 'pin'));

UPDATE delivery.merchants
  SET market_id_lock_source = 'manual'
  WHERE market_id_locked = true
    AND market_id_lock_source IS NULL;

COMMENT ON COLUMN delivery.merchants.market_id_lock_source IS
  'manual = ops locked town; pin = auto from store pin (follows pin, resists publish recompute); null = fully auto';
