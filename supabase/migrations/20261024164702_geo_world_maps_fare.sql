CREATE OR REPLACE FUNCTION geo.resolve_fare_location(p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  parish record;
  town record;
  county_slug text;
  fare_parish text;
  locality text;
BEGIN
  SELECT b.pcode, b.name, b.slug, ST_Area(v.geom::geography) AS area
  INTO parish
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 1
    AND b.status = 'active'
    AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY ST_Area(v.geom::geography) ASC
  LIMIT 1;

  IF parish.pcode IS NULL THEN
    RETURN jsonb_build_object('location_key', 'jamaica', 'fallback_keys', jsonb_build_array('jamaica'));
  END IF;

  SELECT alias_value INTO county_slug
  FROM geo.place_aliases
  WHERE pcode = parish.pcode AND alias_kind = 'county'
  LIMIT 1;

  SELECT alias_value INTO fare_parish
  FROM geo.place_aliases
  WHERE pcode = parish.pcode AND alias_kind = 'fare_parish'
  LIMIT 1;
  fare_parish := COALESCE(fare_parish, parish.slug);

  SELECT b.slug INTO locality
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 2
    AND b.parent_pcode = parish.pcode
    AND b.status = 'active'
    AND ST_Covers(v.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY ST_Area(v.geom::geography) ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'county', county_slug,
    'parish', fare_parish,
    'locality', locality,
    'location_key',
      'jamaica/' || COALESCE(county_slug, 'surrey') || '/' || fare_parish ||
      CASE WHEN locality IS NULL THEN '' ELSE '/' || locality END
  );
END;
$$;

REVOKE ALL ON FUNCTION geo.resolve_fare_location(double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.resolve_fare_location(double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION geo.fare_tree()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT COALESCE(jsonb_agg(county_row ORDER BY county_row->>'slug'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'slug', c.alias_value,
      'label', initcap(c.alias_value),
      'parishes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'slug', fp.alias_value,
          'label', b.name,
          'pcode', b.pcode,
          'localities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'label', t.name) ORDER BY t.name)
            FROM geo.boundaries t
            WHERE t.parent_pcode = b.pcode AND t.admin_level = 2 AND t.status = 'active'
          ), '[]'::jsonb)
        ) ORDER BY b.name)
        FROM geo.boundaries b
        JOIN geo.place_aliases fp ON fp.pcode = b.pcode AND fp.alias_kind = 'fare_parish'
        JOIN geo.place_aliases c2 ON c2.pcode = b.pcode AND c2.alias_kind = 'county' AND c2.alias_value = c.alias_value
        WHERE b.admin_level = 1
      ), '[]'::jsonb)
    ) AS county_row
    FROM (
      SELECT DISTINCT alias_value FROM geo.place_aliases WHERE alias_kind = 'county'
    ) c
  ) counties;
$$;

REVOKE ALL ON FUNCTION geo.fare_tree() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.fare_tree() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'geo-adopted-reconcile',
      '15 6 * * *',
      $job$SELECT private.invoke_rush_delivery('/internal/geo/reconcile');$job$
    );
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;
