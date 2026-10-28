-- History alignment: DDL already live via out-of-band apply of 20260826140000.
-- Do not re-run that migration's DDL.
INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by)
VALUES ('20260826140000', ARRAY[]::text[], 'history_align', 'vehicle_audit_closure')
ON CONFLICT (version) DO NOTHING;
