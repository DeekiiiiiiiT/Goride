-- S6 follow-up: comment wording only. Paste ALL into the Supabase SQL editor and Run. Safe to run again.
BEGIN;
COMMENT ON COLUMN public.maintenance_work_order_line_item.part_source IS
  'How a part item''s part was chosen: car = from this car''s own parts list (part_id set, server-checked); size = from "fits by size"; typed = typed in. NULL = saved before this column existed (15 Nov 2026), or a part item with no part chosen.';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261115172616', 'service_items_part_source_comment') ON CONFLICT (version) DO NOTHING;
COMMIT;

SELECT col_description('public.maintenance_work_order_line_item'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.maintenance_work_order_line_item'::regclass AND attname = 'part_source')) LIKE '%15 Nov 2026%' AS comment_fixed, EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261115172616') AS logged;
