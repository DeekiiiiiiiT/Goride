-- Undo tolls_v2_switch_ON.sql: put your fleet back on the old toll system. Recorded in toll.audit_log.
BEGIN;
INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row)
SELECT '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', 'switch_state', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', 'tolls_v2_off',
       (SELECT to_jsonb(s) FROM toll.switch_state s WHERE s.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'),
       jsonb_build_object('tolls_v2', false, 'by', 'owner via SQL editor');
UPDATE toll.switch_state SET tolls_v2 = false, changed_at = now()
WHERE organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
COMMIT;

SELECT o.name, public.toll_sys_tolls_v2_on(o.id) AS switched_on
FROM public.organizations o
WHERE o.id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
