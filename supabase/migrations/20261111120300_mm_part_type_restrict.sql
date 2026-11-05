-- M-02: part type delete must not cascade customer schedules.

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_status_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_status_check
  CHECK (status IN ('active', 'retired'));

UPDATE public.maintenance_service_categories SET status = 'active' WHERE status IS NULL;

ALTER TABLE public.vehicle_component_schedule
  DROP CONSTRAINT IF EXISTS vehicle_component_schedule_category_id_fkey;

ALTER TABLE public.vehicle_component_schedule
  ADD CONSTRAINT vehicle_component_schedule_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.maintenance_service_categories (id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.maintenance_part_type_dependents(p_id uuid)
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
      AND ref.relname = 'maintenance_service_categories'
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
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_part_type_dependents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_part_type_dependents(uuid) TO service_role;
