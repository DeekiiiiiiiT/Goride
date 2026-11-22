-- F-16 N1/N2: cron job + public.fuel_nightly_latest (rolled back).

BEGIN;

DO $$
DECLARE
  v_org text := 'f6111111-1111-4111-8111-111111111101';
  v_run_old uuid := 'a1111111-1111-4111-8111-111111111101';
  v_run_new uuid := 'b2222222-2222-4222-8222-222222222222';
  v_j jsonb;
  v_failures jsonb;
  v_fn regprocedure := 'public.fuel_nightly_latest(text)'::regprocedure;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job j
      WHERE j.jobname = 'fuel-v3-nightly'
        AND j.command LIKE '%fuel_system.nightly_run()%'
    ) THEN
      RAISE EXCEPTION 'fuel-v3-nightly cron must call fuel_system.nightly_run()';
    END IF;
  END IF;

  INSERT INTO fuel.nightly_results (org_id, run_id, check_no, name, ok, detail, created_at) VALUES
    (v_org, v_run_old, 1, 'v3_shares_vs_spend', true, '{}'::jsonb, now() - interval '2 days'),
    (v_org, v_run_old, 3, 'v3_lines_vs_week_shares', false,
      jsonb_build_object('period_id', 'p-old', 'week_start', '2026-11-09'),
      now() - interval '2 days'),
    (v_org, v_run_new, 1, 'v3_shares_vs_spend', true, '{}'::jsonb, now() - interval '1 hour'),
    (v_org, v_run_new, 3, 'v3_lines_vs_week_shares', false,
      jsonb_build_object('period_id', 'p-new', 'week_start', '2026-11-16'),
      now() - interval '1 hour'),
    -- Check 0 on a v2.2 week (history): reported, but marked not-v3 so it never blocks a lock.
    (v_org, v_run_new, 0, 'locked_week_recomputed_after_lock', false,
      jsonb_build_object('period_id', 'p-v22', 'week_start', '2026-11-09', 'engine', 'fuel-chain-v2.2'),
      now() - interval '1 hour');

  v_j := public.fuel_nightly_latest(v_org);
  IF (v_j ->> 'runId')::uuid IS DISTINCT FROM v_run_new THEN
    RAISE EXCEPTION 'fuel_nightly_latest must use latest run, got %', v_j ->> 'runId';
  END IF;

  v_failures := v_j -> 'failures';
  IF jsonb_array_length(v_failures) <> 2 THEN
    RAISE EXCEPTION 'expected two failures in latest run, got %', v_failures;
  END IF;
  -- Ordered by check_no: the v2.2 check 0 first (v3 = false), then the v3 lines check (v3 = true).
  IF (v_failures -> 0 ->> 'v3')::boolean IS DISTINCT FROM false
     OR v_failures -> 0 ->> 'week_start' <> '2026-11-09' THEN
    RAISE EXCEPTION 'a v2.2 week''s check 0 must be reported with v3 = false';
  END IF;
  IF (v_failures -> 1 ->> 'v3')::boolean IS DISTINCT FROM true
     OR v_failures -> 1 ->> 'week_start' <> '2026-11-16' THEN
    RAISE EXCEPTION 'the latest v3 failure must be reported with v3 = true';
  END IF;

  IF has_function_privilege('authenticated', v_fn, 'EXECUTE')
    OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated must not EXECUTE fuel_nightly_latest';
  END IF;
END;
$$;

ROLLBACK;