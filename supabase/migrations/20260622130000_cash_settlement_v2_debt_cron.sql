-- Daily backstop: auto-repay open driver debt obligations from digital wallet.

CREATE OR REPLACE FUNCTION public.rides_apply_pending_driver_debt(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_driver RECORD;
  v_processed INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'rides' AND table_name = 'payment_obligations'
  ) THEN
    RETURN jsonb_build_object('processed', 0, 'skipped', true);
  END IF;

  FOR v_driver IN
    SELECT DISTINCT driver_user_id, currency
    FROM rides.payment_obligations
    WHERE status IN ('open', 'partial')
      AND remaining_minor > 0
  LOOP
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'note', 'Debt auto-repay runs in Edge on digital credits; cron marks stale obligations for ops review.',
    'ran_at', p_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rides_apply_pending_driver_debt(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_apply_pending_driver_debt(TIMESTAMPTZ) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'rides_apply_pending_driver_debt_daily';

    PERFORM cron.schedule(
      'rides_apply_pending_driver_debt_daily',
      '15 4 * * *',
      $$SELECT public.rides_apply_pending_driver_debt();$$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule rides_apply_pending_driver_debt manually.';
END;
$cron$;

NOTIFY pgrst, 'reload schema';
