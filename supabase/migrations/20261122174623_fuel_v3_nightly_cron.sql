-- F-16 N1: schedule fuel_system.nightly_run() every night (20 min after toll-v2-nightly).
-- F-16 N2: public.fuel_nightly_latest — service-role read of the org's latest nightly failures.

CREATE OR REPLACE FUNCTION public.fuel_nightly_latest(p_org text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id uuid;
  v_run_at timestamptz;
BEGIN
  IF p_org IS NULL OR btrim(p_org) = '' THEN
    RETURN jsonb_build_object('runId', null, 'runAt', null, 'failures', '[]'::jsonb);
  END IF;

  SELECT r.run_id, max(r.created_at)
  INTO v_run_id, v_run_at
  FROM fuel.nightly_results r
  WHERE r.org_id = p_org
  GROUP BY r.run_id
  ORDER BY max(r.created_at) DESC
  LIMIT 1;

  IF v_run_id IS NULL THEN
    RETURN jsonb_build_object('runId', null, 'runAt', null, 'failures', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'runId', v_run_id,
    'runAt', v_run_at,
    'failures', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'check_no', r.check_no,
          'name', r.name,
          'period_id', COALESCE(r.detail ->> 'period_id', ''),
          'week_start', COALESCE(
            nullif(substring(r.detail ->> 'week_start' from 1 for 10), ''),
            (
              SELECT to_char(p.week_start, 'YYYY-MM-DD')
              FROM public.fuel_reconciliation_period p
              WHERE p.id = r.detail ->> 'period_id'
                AND p.org_id::text = p_org
              LIMIT 1
            ),
            ''
          ),
          'detail', r.detail,
          -- v3_* checks only run on v3 weeks; check 0 carries the week's engine in its detail.
          'v3', (r.name LIKE 'v3\_%' OR COALESCE(r.detail ->> 'engine', '') LIKE '%v3%')
        )
        ORDER BY r.check_no, r.name
      )
      FROM fuel.nightly_results r
      WHERE r.org_id = p_org
        AND r.run_id = v_run_id
        AND NOT r.ok
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fuel_nightly_latest(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fuel_nightly_latest(text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron missing; fuel-v3-nightly not scheduled';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fuel-v3-nightly';
  PERFORM cron.schedule(
    'fuel-v3-nightly',
    '45 4 * * *',
  'SELECT fuel_system.nightly_run();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';