-- V-02: car catalog status + dependent counts (incl. unlinked fleet tables).

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.vehicle_catalog (id),
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_status_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_status_check
  CHECK (status IN ('draft', 'active', 'needs_checking', 'retired'));

UPDATE public.vehicle_catalog SET status = 'active' WHERE status IS NULL;

CREATE OR REPLACE FUNCTION public.catalog_car_dependents(p_id uuid)
RETURNS TABLE (table_name text, row_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_cnt bigint;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS rel_name,
      a.attname AS col_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'vehicle_catalog'
      AND a.attnum = con.conkey[1]
  LOOP
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I.%I WHERE %I = $1',
      r.schema_name,
      r.rel_name,
      r.col_name
    )
    INTO v_cnt
    USING p_id;

    table_name := r.schema_name || '.' || r.rel_name;
    row_count := v_cnt;
    RETURN NEXT;
  END LOOP;

  IF to_regclass('fleet.vehicles') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::bigint FROM fleet.vehicles WHERE vehicle_catalog_id = $1::text'
    INTO v_cnt USING p_id;
    table_name := 'fleet.vehicles';
    row_count := v_cnt;
    RETURN NEXT;
  END IF;

  IF to_regclass('public.fleet_vehicles') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::bigint FROM public.fleet_vehicles WHERE vehicle_catalog_id = $1'
    INTO v_cnt USING p_id;
    table_name := 'public.fleet_vehicles';
    row_count := v_cnt;
    RETURN NEXT;
  END IF;

  IF to_regclass('explorer.user_vehicle') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::bigint FROM explorer.user_vehicle WHERE catalog_variant_id = $1'
    INTO v_cnt USING p_id;
    table_name := 'explorer.user_vehicle';
    row_count := v_cnt;
    RETURN NEXT;
  END IF;

  IF to_regclass('places.plug_price_report') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::bigint FROM places.plug_price_report WHERE catalog_variant_id = $1'
    INTO v_cnt USING p_id;
    table_name := 'places.plug_price_report';
    row_count := v_cnt;
    RETURN NEXT;
  END IF;

  IF to_regclass('places.usage_count') IS NOT NULL THEN
    EXECUTE
      'SELECT count(*)::bigint FROM places.usage_count WHERE catalog_variant_id = $1'
    INTO v_cnt USING p_id;
    table_name := 'places.usage_count';
    row_count := v_cnt;
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_car_dependents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_car_dependents(uuid) TO service_role;
