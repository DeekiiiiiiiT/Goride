-- Toll rebuild, Phase 0, R0: read-only look at live data before building.
-- Changes NOTHING. One query, one result row: paste into the Supabase SQL editor, run, copy the whole result back.

SELECT jsonb_pretty(jsonb_build_object(

  -- 1. Objects already in the toll schemas (approximate row counts).
  'toll_objects', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('object', n.nspname || '.' || c.relname,
                                                 'kind', c.relkind, 'approx_rows', c.reltuples::bigint)
                              ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('toll', 'toll_read', 'toll_write', 'toll_system')
      AND c.relkind IN ('r', 'v', 'm', 'p')),

  'toll_functions', (
    SELECT coalesce(jsonb_agg(n.nspname || '.' || p.proname ORDER BY n.nspname, p.proname), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('toll', 'toll_read', 'toll_write', 'toll_system')),

  -- 2. Ledger accounts that would clash with the new toll / bank account names.
  'clashing_accounts', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', account_key, 'class', account_class,
                                                 'balance_minor', balance_minor) ORDER BY account_key), '[]'::jsonb)
    FROM ledger.accounts
    WHERE account_key LIKE 'org:%:toll%' OR account_key LIKE 'org:%:bank%'),

  -- 3. week_statements: driver_id nullable? which kinds are allowed?
  'week_statements_driver_id_nullable', (
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'ledger' AND table_name = 'week_statements' AND column_name = 'driver_id'),

  'week_statements_checks', (
    SELECT coalesce(jsonb_agg(conname || ': ' || pg_get_constraintdef(oid)), '[]'::jsonb)
    FROM pg_constraint
    WHERE conrelid = 'ledger.week_statements'::regclass AND contype = 'c'),

  -- 4. How nightly jobs run today.
  'cron_jobs', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule,
                                                 'active', active, 'command', left(command, 120))
                              ORDER BY jobname), '[]'::jsonb)
    FROM cron.job),

  -- 5. Companies with toll weeks, and their latest sealed week.
  'toll_weeks_by_company', (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT organization_id, count(*) AS weeks,
             max(week_key) FILTER (WHERE state = 'sealed') AS latest_sealed_week,
             max(week_key) AS latest_week
      FROM public.toll_reconciliation_period
      GROUP BY organization_id) x)

)) AS r0_live_look;
