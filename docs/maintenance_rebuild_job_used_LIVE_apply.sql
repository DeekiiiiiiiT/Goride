-- "Used" on the Dominion Jobs screen means "has been used in service logs" (it locks the job's home group and
-- form type). Since maintenance rebuild step 1 (20261127114508) every As-needed job has a schedule rule in
-- maintenance_task_templates, and that link made all of them count as used. A schedule rule is not a service log,
-- so maintenance_task_templates.component_id is ignored here, like sections and job links already are.
-- Check engine_sections_used_ids_test (D7) passes again.

CREATE OR REPLACE FUNCTION public.maintenance_job_used_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      ns.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey) AND a.attnum = con.conkey[1]
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'maintenance_service_categories'
      AND NOT (
        c.relname = 'maintenance_service_categories' AND a.attname = 'parent_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_section_members' AND a.attname = 'category_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_relations'
        AND a.attname IN ('from_category_id', 'to_category_id')
      )
      AND NOT (
        c.relname = 'maintenance_task_templates' AND a.attname = 'component_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_item'
        AND a.attname IN ('job_id', 'part_type_id')
      )
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %I::uuid FROM %I.%I WHERE %I IS NOT NULL',
      r.column_name,
      r.schema_name,
      r.table_name,
      r.column_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_job_used_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_job_used_ids() TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128030429', 'mm_job_used_ignores_schedule_rules') ON CONFLICT (version) DO NOTHING;
