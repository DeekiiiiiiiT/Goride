-- Shop fees group — paste the whole file into Supabase → SQL editor and Run.
-- Safe to run twice. Last query shows the result: expect one row
--   sys_shop_fees | Shop fees | system | false | true | active

BEGIN;

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, kind, parent_id, is_part, quick_job_eligible,
  status, op_code, icon_key, sort_order, field_schema, updated_at
)
VALUES (
  'sys_shop_fees', 'Shop fees', 'Shop fees', 'system', NULL, false, true,
  'active', 'SHOP', 'wrench', 1110, '{"fields":[]}'::jsonb, now()
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261113010913', 'shop_fees_group')
ON CONFLICT (version) DO NOTHING;

COMMIT;

SELECT code, name, kind, is_part, quick_job_eligible, status
FROM public.maintenance_service_categories
WHERE code = 'sys_shop_fees';
