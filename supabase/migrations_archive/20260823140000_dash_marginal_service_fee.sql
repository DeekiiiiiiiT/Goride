-- Marginal (bracketed) service fee + card processing fee on orders
-- Rules JSON extended in market_pricing_profiles.rules (no schema change to jsonb shape)

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS processing_fee numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN delivery.orders.processing_fee IS
  'Card/wallet processing fee charged to customer (Model B). COD orders = 0.';

-- Backfill active market profiles with marginal service fee defaults.
-- pricing_v2_enabled is NOT auto-enabled — ops enable via admin after simulator validation.
UPDATE delivery.market_pricing_profiles
SET rules = rules
  || jsonb_build_object(
    'min_order_subtotal_jmd', COALESCE((rules->>'min_order_subtotal_jmd')::numeric, 800),
    'card_processing_fee_percent', COALESCE((rules->>'card_processing_fee_percent')::numeric, 0.045)
  )
  || jsonb_build_object(
    'service_fee',
    COALESCE(rules->'service_fee', '{}'::jsonb)
      || jsonb_build_object(
        'mode', 'marginal',
        'avg_rate', COALESCE((rules->'service_fee'->>'avg_rate')::numeric, 0.15),
        'override_rate', COALESCE((rules->'service_fee'->>'override_rate')::numeric, 0.09),
        'override_threshold_jmd', COALESCE((rules->'service_fee'->>'override_threshold_jmd')::numeric, 5000),
        'min_jmd', COALESCE((rules->'service_fee'->>'min_jmd')::numeric, 150),
        'max_jmd', COALESCE((rules->'service_fee'->>'max_jmd')::numeric, 2500)
      )
  )
WHERE is_active = true;
