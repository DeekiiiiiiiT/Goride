-- Console day totals and persona directory stay in SQL.
-- The old path pulled a capped row list, then sent every matching id back in the URL.

CREATE OR REPLACE FUNCTION delivery.admin_console_day_stats(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  WITH day_orders AS (
    SELECT
      o.total,
      o.merchant_id,
      o.ready_at,
      o.delivered_at,
      EXTRACT(HOUR FROM (o.placed_at AT TIME ZONE 'America/Jamaica'))::int AS hour
    FROM delivery.orders o
    WHERE o.placed_at >= p_start
      AND o.placed_at < p_end
      AND o.status IS DISTINCT FROM 'cancelled'
  )
  SELECT jsonb_build_object(
    'orders', (SELECT count(*) FROM day_orders),
    'gmv', (SELECT COALESCE(sum(total), 0) FROM day_orders),
    'avg_eta_min', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - ready_at)) / 60.0))::int
      FROM day_orders
      WHERE ready_at IS NOT NULL
        AND delivered_at IS NOT NULL
        AND delivered_at > ready_at
    ),
    'by_hour', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', hour, 'orders', orders) ORDER BY hour), '[]'::jsonb)
      FROM (
        SELECT hour, count(*) AS orders
        FROM day_orders
        GROUP BY hour
      ) hours
    ),
    'by_market', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', name,
        'orders', orders,
        'gmv', gmv
      ) ORDER BY orders DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(m.name, 'Unassigned market') AS name,
          count(*) AS orders,
          COALESCE(sum(d.total), 0) AS gmv
        FROM day_orders d
        LEFT JOIN delivery.merchants mer ON mer.id = d.merchant_id
        LEFT JOIN delivery.service_markets m ON m.id = mer.market_id
        GROUP BY COALESCE(m.name, 'Unassigned market')
        ORDER BY count(*) DESC
        LIMIT 12
      ) markets
    )
  );
$$;

CREATE OR REPLACE FUNCTION delivery.admin_merchant_order_counts(p_ids uuid[], p_since timestamptz)
RETURNS TABLE (merchant_id uuid, orders_7d bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT o.merchant_id, count(*)::bigint
  FROM delivery.orders o
  WHERE o.merchant_id = ANY(p_ids)
    AND o.placed_at >= p_since
    AND o.status IS DISTINCT FROM 'cancelled'
  GROUP BY o.merchant_id;
$$;

CREATE OR REPLACE FUNCTION platform.admin_identity_page(
  p_persona text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'updated_at',
  p_asc boolean DEFAULT false,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  WITH filtered AS (
    SELECT i.*
    FROM platform.identities i
    WHERE (p_user_id IS NULL OR i.user_id = p_user_id)
      AND (
        p_persona IS NULL OR btrim(p_persona) = '' OR EXISTS (
          SELECT 1 FROM platform.identity_personas p
          WHERE p.user_id = i.user_id AND p.persona = p_persona
        )
      )
      AND (
        p_q IS NULL OR btrim(p_q) = ''
        OR i.display_name ILIKE '%' || p_q || '%'
        OR i.primary_email ILIKE '%' || p_q || '%'
        OR (p_phone IS NOT NULL AND btrim(p_phone) <> '' AND i.primary_phone ILIKE '%' || p_phone || '%')
      )
  ),
  page AS (
    SELECT f.*, row_number() OVER () AS ord
    FROM (
      SELECT f.*
      FROM filtered f
      ORDER BY
        CASE WHEN p_sort = 'display_name' AND COALESCE(p_asc, false) THEN f.display_name END ASC,
        CASE WHEN p_sort = 'display_name' AND NOT COALESCE(p_asc, false) THEN f.display_name END DESC,
        CASE WHEN p_sort IS DISTINCT FROM 'display_name' AND COALESCE(p_asc, false) THEN f.updated_at END ASC,
        CASE WHEN p_sort IS DISTINCT FROM 'display_name' AND NOT COALESCE(p_asc, false) THEN f.updated_at END DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) f
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'identities', COALESCE((
      SELECT jsonb_agg((to_jsonb(page) - 'ord') ORDER BY page.ord)
      FROM page
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION delivery.admin_console_day_stats(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION delivery.admin_merchant_order_counts(uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.admin_identity_page(text, text, text, uuid, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delivery.admin_console_day_stats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.admin_merchant_order_counts(uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION platform.admin_identity_page(text, text, text, uuid, text, boolean, int, int) TO service_role;
