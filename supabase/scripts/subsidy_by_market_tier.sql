-- Read-only: platform delivery subsidy cost by market and merchant tier.
-- Use before widening Dominant rollout. Run in Supabase SQL editor. No writes.
-- market_id lives on delivery.merchants (not orders).

SELECT
  m.market_id,
  COALESCE(
    o.pricing_snapshot ->> 'tier_slug',
    mt.slug,
    'unknown'
  ) AS tier_slug,
  COUNT(*)::int AS order_count,
  ROUND(SUM(COALESCE(o.platform_delivery_subsidy_jmd, 0))::numeric, 2) AS subsidy_sum_jmd,
  ROUND(AVG(COALESCE(o.platform_delivery_subsidy_jmd, 0))::numeric, 2) AS subsidy_avg_jmd,
  ROUND(MAX(COALESCE(o.platform_delivery_subsidy_jmd, 0))::numeric, 2) AS subsidy_max_jmd,
  ROUND(AVG(COALESCE(o.distance_km, 0))::numeric, 2) AS avg_distance_km
FROM delivery.orders o
LEFT JOIN delivery.merchants m ON m.id = o.merchant_id
LEFT JOIN delivery.merchant_tiers mt ON mt.id = m.pricing_tier_id
WHERE o.pricing_model = 'v2'
  AND o.status IN ('delivered', 'completed')
  AND COALESCE(o.platform_delivery_subsidy_jmd, 0) > 0
GROUP BY
  m.market_id,
  COALESCE(o.pricing_snapshot ->> 'tier_slug', mt.slug, 'unknown')
ORDER BY subsidy_sum_jmd DESC;
