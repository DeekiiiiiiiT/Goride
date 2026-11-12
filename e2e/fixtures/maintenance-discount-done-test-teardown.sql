-- Remove maintenance discount done-test org d6010000-0000-4000-8000-000000000088.
-- CR-09: deletes EVERY row for the test org — any table in public/fleet with an
-- organization_id column (work orders, lines, records, ledger, events, settings …).
BEGIN;
SET LOCAL session_replication_role = replica;

-- Lines have no organization_id; remove them by the test org's work orders first.
DELETE FROM public.maintenance_work_order_lines
WHERE work_order_id IN (
  SELECT id FROM public.maintenance_work_orders
  WHERE organization_id = 'd6010000-0000-4000-8000-000000000088'
);

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.column_name = 'organization_id'
      AND c.table_schema IN ('public', 'fleet')
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'DELETE FROM %I.%I WHERE organization_id::text = %L',
      t.table_schema, t.table_name, 'd6010000-0000-4000-8000-000000000088'
    );
  END LOOP;
END $$;

DELETE FROM auth.identities WHERE user_id = 'd6010001-0000-4000-8000-000000000001'::uuid;
DELETE FROM auth.users WHERE id = 'd6010001-0000-4000-8000-000000000001'::uuid;
DELETE FROM public.organizations WHERE id = 'd6010000-0000-4000-8000-000000000088'::uuid;

COMMIT;
