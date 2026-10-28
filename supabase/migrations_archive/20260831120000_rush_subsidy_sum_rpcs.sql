-- Finding R: subsidy spend must aggregate in Postgres (not row-transport under max_rows=1000).
-- Also denormalize free_delivery_applied for indexed filters.

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS free_delivery_applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN delivery.orders.free_delivery_applied IS
  'True when customer delivery fee was waived (Pass or promo). Denormalized from pricing_snapshot for subsidy RPCs.';

UPDATE delivery.orders o
SET free_delivery_applied = true
WHERE free_delivery_applied = false
  AND (
    COALESCE((o.pricing_snapshot->>'free_delivery_applied')::boolean, false)
    OR COALESCE((o.pricing_snapshot->>'freeDeliveryApplied')::boolean, false)
  );

CREATE INDEX IF NOT EXISTS orders_promo_fd_subsidy_month_idx
  ON delivery.orders (placed_at)
  WHERE free_delivery_applied = true
    AND rush_pass_membership_id IS NULL
    AND status IS DISTINCT FROM 'cancelled'
    AND status IS DISTINCT FROM 'rejected';

CREATE INDEX IF NOT EXISTS orders_pass_subsidy_membership_idx
  ON delivery.orders (rush_pass_membership_id, placed_at)
  WHERE rush_pass_membership_id IS NOT NULL
    AND status IS DISTINCT FROM 'cancelled'
    AND status IS DISTINCT FROM 'rejected';

CREATE OR REPLACE FUNCTION delivery.sum_promo_fd_subsidy_used(p_month_start timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(SUM(COALESCE(platform_delivery_subsidy_jmd, 0)), 0)::numeric
  FROM delivery.orders
  WHERE rush_pass_membership_id IS NULL
    AND free_delivery_applied = true
    AND placed_at >= p_month_start
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'rejected');
$$;

CREATE OR REPLACE FUNCTION delivery.sum_rush_pass_subsidy_used(
  p_membership_id uuid,
  p_period_start timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT COALESCE(SUM(COALESCE(platform_delivery_subsidy_jmd, 0)), 0)::numeric
  FROM delivery.orders
  WHERE rush_pass_membership_id = p_membership_id
    AND placed_at >= p_period_start
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'rejected');
$$;

COMMENT ON FUNCTION delivery.sum_promo_fd_subsidy_used(timestamptz) IS
  'Platform-wide promo free-delivery subsidy spent since Jamaica month start (Finding R).';
COMMENT ON FUNCTION delivery.sum_rush_pass_subsidy_used(uuid, timestamptz) IS
  'Rush Pass membership-period delivery subsidy spent (Finding R / L).';

GRANT EXECUTE ON FUNCTION delivery.sum_promo_fd_subsidy_used(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.sum_rush_pass_subsidy_used(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.sum_promo_fd_subsidy_used(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION delivery.sum_rush_pass_subsidy_used(uuid, timestamptz) TO authenticated;
