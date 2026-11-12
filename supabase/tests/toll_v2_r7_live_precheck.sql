-- Toll rebuild, Phase 0, R7: read-only safety check BEFORE running the 4 toll migrations on the live database.
-- Changes NOTHING. One query, one result row. Every value should be 0 / false / empty.

SELECT jsonb_pretty(jsonb_build_object(
  -- the new toll_week rule (driver_id = '*') would fail if any statement already uses '*'
  'week_statements_with_star_driver', (SELECT count(*) FROM ledger.week_statements WHERE driver_id = '*'),
  -- none of the new objects may exist yet
  'new_toll_tables_already_there', (
    SELECT coalesce(jsonb_agg(c.relname), '[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'toll' AND c.relname IN ('charges','charge_changes','platform_trips','paybacks','allocations',
      'carried_facts','payback_unlinked_decisions','duplicate_reviews','decisions','suggestions','tag_accounts',
      'tag_topups','platform_settings','plaza_rules','staff_company_access','switch_state','audit_log',
      'posting_rules','alerts','nightly_results','payout_postings','v_live_charges','v_active_paybacks')),
  'new_schemas_already_there', (
    SELECT coalesce(jsonb_agg(nspname), '[]'::jsonb) FROM pg_namespace WHERE nspname IN ('toll_read','toll_write','toll_system')),
  'public_toll_v2_functions_already_there', (
    SELECT coalesce(jsonb_agg(p.proname), '[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'toll_v2_%'),
  'cron_job_name_taken', (SELECT count(*) FROM cron.job WHERE jobname = 'toll-v2-nightly'),
  'ledger_entries_trigger_name_taken', (
    SELECT count(*) FROM pg_trigger WHERE tgrelid = 'ledger.entries'::regclass AND tgname = 'toll_ledger_entries_guard'),
  'kv_trigger_names_taken', (
    SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.kv_store_37f42386'::regclass
      AND tgname IN ('toll_kv_bank_confirm_upsert', 'toll_kv_bank_confirm_delete')),
  -- already recorded in the migration logbook?
  'toll_migrations_already_logged', (
    SELECT coalesce(jsonb_agg(version), '[]'::jsonb) FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261112183806','20261112184544','20261112185355','20261112191942'))
)) AS r7_live_precheck;
