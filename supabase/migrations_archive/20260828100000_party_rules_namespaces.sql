-- Backfill active pricing profile rules from flat JSON to three-party nested namespaces.
-- Idempotent: skips rows that already have a customer namespace.

UPDATE delivery.global_pricing_profiles
SET rules = jsonb_build_object(
  'platform', jsonb_build_object(
    'pricing_v2_enabled', COALESCE((rules->>'pricing_v2_enabled')::boolean, false),
    'tax_rate_percent', COALESCE((rules->>'tax_rate_percent')::numeric, 16.5)
  ),
  'customer', jsonb_build_object(
    'service_fee', COALESCE(rules->'service_fee', '{}'::jsonb),
    'delivery', COALESCE(rules->'delivery', '{}'::jsonb),
    'min_order_subtotal_jmd', COALESCE((rules->>'min_order_subtotal_jmd')::numeric, 800),
    'card_processing_fee_percent', COALESCE((rules->>'card_processing_fee_percent')::numeric, 0.045),
    'launch_promos', COALESCE(rules->'launch_promos', '{"free_delivery_first_n_orders": 0}'::jsonb)
  ),
  'rider', jsonb_build_object(
    'courier_delivery_share', COALESCE((rules->>'courier_delivery_share')::numeric, 0.8),
    'cod', COALESCE(rules->'cod', '{"pause_threshold_jmd": 10000}'::jsonb),
    'road_distance_multiplier', COALESCE((rules->>'road_distance_multiplier')::numeric, 1.4),
    'tip_processing_from_rider', COALESCE((rules->>'tip_processing_from_rider')::boolean, true)
  ),
  'partner', COALESCE(rules->'partner', '{}'::jsonb)
)
WHERE is_active = true
  AND rules ? 'service_fee'
  AND NOT (rules ? 'customer');

UPDATE delivery.parish_pricing_profiles
SET rules = jsonb_build_object(
  'platform', jsonb_strip_nulls(jsonb_build_object(
    'pricing_v2_enabled', rules->'pricing_v2_enabled',
    'tax_rate_percent', rules->'tax_rate_percent'
  )),
  'customer', jsonb_strip_nulls(jsonb_build_object(
    'service_fee', rules->'service_fee',
    'delivery', rules->'delivery',
    'min_order_subtotal_jmd', rules->'min_order_subtotal_jmd',
    'card_processing_fee_percent', rules->'card_processing_fee_percent',
    'launch_promos', rules->'launch_promos'
  )),
  'rider', jsonb_strip_nulls(jsonb_build_object(
    'courier_delivery_share', rules->'courier_delivery_share',
    'cod', rules->'cod',
    'road_distance_multiplier', rules->'road_distance_multiplier',
    'tip_processing_from_rider', rules->'tip_processing_from_rider'
  )),
  'partner', COALESCE(rules->'partner', '{}'::jsonb)
)
WHERE is_active = true
  AND rules ? 'service_fee'
  AND NOT (rules ? 'customer');

UPDATE delivery.market_pricing_profiles
SET rules = jsonb_build_object(
  'platform', jsonb_strip_nulls(jsonb_build_object(
    'pricing_v2_enabled', rules->'pricing_v2_enabled',
    'tax_rate_percent', rules->'tax_rate_percent'
  )),
  'customer', jsonb_strip_nulls(jsonb_build_object(
    'service_fee', rules->'service_fee',
    'delivery', rules->'delivery',
    'min_order_subtotal_jmd', rules->'min_order_subtotal_jmd',
    'card_processing_fee_percent', rules->'card_processing_fee_percent',
    'launch_promos', rules->'launch_promos'
  )),
  'rider', jsonb_strip_nulls(jsonb_build_object(
    'courier_delivery_share', rules->'courier_delivery_share',
    'cod', rules->'cod',
    'road_distance_multiplier', rules->'road_distance_multiplier',
    'tip_processing_from_rider', rules->'tip_processing_from_rider'
  )),
  'partner', COALESCE(rules->'partner', '{}'::jsonb)
)
WHERE is_active = true
  AND rules ? 'service_fee'
  AND NOT (rules ? 'customer');

-- Partial overrides that only set pricing_v2_enabled (e.g. Spanish Town)
UPDATE delivery.market_pricing_profiles
SET rules = jsonb_build_object(
  'platform', jsonb_build_object(
    'pricing_v2_enabled', COALESCE((rules->>'pricing_v2_enabled')::boolean, false)
  )
)
WHERE is_active = true
  AND rules ? 'pricing_v2_enabled'
  AND NOT (rules ? 'customer')
  AND NOT (rules ? 'service_fee');
