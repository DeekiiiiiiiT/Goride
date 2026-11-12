-- Toll rebuild Phase 0: check the live apply landed. Leaves NOTHING behind:
-- the one test write (an ordinary, non-toll ledger entry) is rolled back at the end.
BEGIN;

SELECT jsonb_pretty(jsonb_build_object(
  'new_toll_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'toll' AND c.relkind = 'r'
                        AND c.relname NOT IN ('brain_policies', 'settlement_allocations')),          -- expect 21
  'posting_rules', (SELECT count(*) FROM toll.posting_rules),                                        -- expect 30
  'schemas', (SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace
              WHERE nspname IN ('toll_read', 'toll_write', 'toll_system')),                         -- expect 3
  'logbook_rows', (SELECT count(*) FROM supabase_migrations.schema_migrations
                   WHERE version IN ('20261112183806','20261112184544','20261112185355','20261112191942')), -- expect 4
  'nightly_job', (SELECT jsonb_build_object('schedule', schedule, 'active', active)
                  FROM cron.job WHERE jobname = 'toll-v2-nightly'),                                 -- expect 25 4 * * *, true
  'ledger_guard_trigger', (SELECT tgenabled FROM pg_trigger
                           WHERE tgrelid = 'ledger.entries'::regclass AND tgname = 'toll_ledger_entries_guard'), -- expect O
  'bank_confirm_triggers', (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.kv_store_37f42386'::regclass
                            AND tgname IN ('toll_kv_bank_confirm_upsert', 'toll_kv_bank_confirm_delete')),     -- expect 2
  'switches_on', (SELECT count(*) FROM toll.switch_state WHERE tolls_v2),                           -- expect 0
  'toll_rows', (SELECT count(*) FROM toll.charges) + (SELECT count(*) FROM toll.paybacks),          -- expect 0
  -- An ordinary ledger write still works with the toll guard in place (rolled back below)
  'ordinary_ledger_write', (
    SELECT ledger.post_entry(
      'toll-v2-live-verify-' || gen_random_uuid(), 'verify',
      'org:' || o.id || ':verify_a', 'org:' || o.id || ':verify_b', 1, 'JMD', NULL, o.id, 'roam_fleet') ->> 'inserted'
    FROM public.organizations o ORDER BY o.created_at LIMIT 1)                                       -- expect true
)) AS toll_v2_live_verify;

ROLLBACK;
