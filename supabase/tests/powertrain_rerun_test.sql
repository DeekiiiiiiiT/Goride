-- Done-test 19: second run of D1 migration changes nothing.

BEGIN;

CREATE TEMP TABLE pt_rerun_meta (
  rev_before bigint NOT NULL,
  confirmed_before bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO pt_rerun_meta (rev_before, confirmed_before)
SELECT
  (SELECT count(*) FROM public.platform_revision),
  (SELECT count(*) FROM public.vehicle_catalog WHERE powertrain_status = 'confirmed');

\i /tmp/20261115214317_powertrain_job_fit.sql

DO $$
DECLARE
  v_cars int := 0;
  v_jobs int := 0;
  v_rev_delta bigint;
  v_confirmed_after bigint;
  v_confirmed_before bigint;
BEGIN
  SELECT coalesce(max(n), 0) INTO v_cars FROM pt_d1_counts WHERE what = 'car rows changed';
  SELECT coalesce(max(n), 0) INTO v_jobs FROM pt_d1_counts WHERE what = 'job rows changed';
  SELECT confirmed_before INTO v_confirmed_before FROM pt_rerun_meta LIMIT 1;

  SELECT count(*) FILTER (WHERE powertrain_status = 'confirmed')
  INTO v_confirmed_after
  FROM public.vehicle_catalog;

  SELECT count(*) - (SELECT rev_before FROM pt_rerun_meta LIMIT 1)
  INTO v_rev_delta
  FROM public.platform_revision;

  IF v_cars <> 0 OR v_jobs <> 0 THEN
    RAISE EXCEPTION 're-run changed rows car=% job=%', v_cars, v_jobs;
  END IF;
  IF v_rev_delta <> 0 THEN
    RAISE EXCEPTION 're-run added % platform_revision rows', v_rev_delta;
  END IF;
  IF v_confirmed_after IS DISTINCT FROM v_confirmed_before THEN
    RAISE EXCEPTION 're-run touched confirmed rows';
  END IF;

  RAISE NOTICE 'powertrain_rerun_test: ok';
END $$;

ROLLBACK;