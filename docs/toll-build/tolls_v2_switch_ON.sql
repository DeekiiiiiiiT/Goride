-- Move YOUR fleet onto the new toll system (tolls_v2). One row, plus its history row in toll.audit_log.
-- From now on every toll screen, upload and Week Reconciliation step 3 for this fleet uses the new system.
-- Check the name in the result is YOUR fleet. To undo: run tolls_v2_switch_OFF.sql.
BEGIN;
INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row)
SELECT '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', 'switch_state', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', 'tolls_v2_on',
       (SELECT to_jsonb(s) FROM toll.switch_state s WHERE s.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'),
       jsonb_build_object('tolls_v2', true, 'by', 'owner via SQL editor');
INSERT INTO toll.switch_state (organization_id, tolls_v2, changed_at)
VALUES ('8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', true, now())
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true, changed_at = now();
COMMIT;

SELECT o.name AS on_new_toll_system, public.toll_sys_tolls_v2_on(o.id) AS switched_on
FROM public.organizations o
WHERE o.id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
