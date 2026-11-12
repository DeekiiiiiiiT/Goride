-- Before deploying the 12 Nov work: are the 11 Nov Week Recon + maintenance discount migrations on the live database?
-- Read-only, changes nothing. One result row.
SELECT jsonb_pretty(jsonb_build_object(
  'in_logbook', (SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb) FROM supabase_migrations.schema_migrations
                 WHERE version IN ('20261111043430','20261111043439','20261111043452','20261111043516','20261111044221',
                                   '20261111044222','20261111051252','20261111055734','20261111061557','20261111163200',
                                   '20261111163445','20261111182344','20261111185734')),
  'missing_from_logbook', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM unnest(ARRAY[
                 '20261111043430','20261111043439','20261111043452','20261111043516','20261111044221',
                 '20261111044222','20261111051252','20261111055734','20261111061557','20261111163200',
                 '20261111163445','20261111182344','20261111185734']) v
                 WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = v)),
  -- objects those migrations create (a hand-run migration may be live without a logbook line)
  'recon_run_events', to_regclass('recon.run_events') IS NOT NULL,
  'recon_alerts', to_regclass('recon.alerts') IS NOT NULL,
  'recon_claim_week_change', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                     WHERE n.nspname = 'recon' AND p.proname = 'claim_week_change'),
  'recon_publish_week_desk', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                     WHERE n.nspname = 'recon' AND p.proname = 'publish_week_desk')
)) AS predeploy_check;
