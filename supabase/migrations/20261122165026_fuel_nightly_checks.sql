-- D5 (F-16): fuel_system.nightly_checks + public.fuel_v2_metrics (toll v2 pattern).

CREATE TABLE IF NOT EXISTS fuel.nightly_results (
  id bigserial PRIMARY KEY,
  org_id text NOT NULL,
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_no int NOT NULL,
  name text NOT NULL,
  ok boolean NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fuel_nightly_results_org_run_idx
  ON fuel.nightly_results (org_id, run_id, created_at DESC);

CREATE OR REPLACE FUNCTION fuel_system.snapshot_engine_version(p_provenance jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(trim(p_provenance ->> 'engineVersion'), ''),
    NULLIF(trim(p_provenance ->> 'engine_version'), ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION fuel_system.week_is_v3(p_engine text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_engine, '') LIKE '%v3%';
$$;

CREATE OR REPLACE FUNCTION fuel_system.nightly_checks(p_org text)
RETURNS TABLE (check_no int, name text, ok boolean, detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_engine text;
  v_spend numeric;
  v_company numeric;
  v_driver numeric;
  v_gap numeric;
  v_line_drv bigint;
  v_line_co bigint;
  v_snap_drv numeric;
  v_snap_co numeric;
  v_snap_spend numeric;
  v_period_id text;
  v_inputs text;
  v_lock_at timestamptz;
  v_stmt_hash text;
  v_driver_cnt int;
  v_stmt_cnt int;
  v_snap_money jsonb;
BEGIN
  FOR r IN
    SELECT
      p.id AS period_id,
      p.week_start,
      p.org_id::text AS org_id,
      p.status,
      p.total_spend,
      p.company_share,
      p.driver_share,
      p.computed_from_hash,
      p.locked_at,
      (
        SELECT s.provenance
        FROM public.fuel_week_snapshot s
        WHERE s.org_id = p.org_id::text
          AND s.period_id = p.id
        ORDER BY s.version DESC
        LIMIT 1
      ) AS provenance,
      (
        SELECT s.inputs_hash
        FROM public.fuel_week_snapshot s
        WHERE s.org_id = p.org_id::text
          AND s.period_id = p.id
        ORDER BY s.version DESC
        LIMIT 1
      ) AS inputs_hash,
      (
        SELECT s.money
        FROM public.fuel_week_snapshot s
        WHERE s.org_id = p.org_id::text
          AND s.period_id = p.id
        ORDER BY s.version DESC
        LIMIT 1
      ) AS money
    FROM public.fuel_reconciliation_period p
    WHERE p.org_id::text = p_org
      AND p.status = 'locked'
  LOOP
    v_engine := fuel_system.snapshot_engine_version(COALESCE(r.provenance, '{}'::jsonb));

    -- Check 0 (all engines, F-16): nothing was worked out again after the week locked — no
    -- snapshot with a different inputs_hash was written after locked_at. (period.computed_from_hash
    -- is a label such as 'finalized:3', not the snapshot hash, so it is not compared.)
    IF r.locked_at IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.fuel_week_snapshot s_after
      WHERE s_after.org_id = r.org_id
        AND s_after.period_id = r.period_id
        AND s_after.created_at > r.locked_at
        AND s_after.inputs_hash IS DISTINCT FROM (
          SELECT s_lock.inputs_hash
          FROM public.fuel_week_snapshot s_lock
          WHERE s_lock.org_id = r.org_id
            AND s_lock.period_id = r.period_id
            AND s_lock.created_at <= r.locked_at
          ORDER BY s_lock.version DESC
          LIMIT 1
        )
    ) THEN
      check_no := 0;
      name := 'locked_week_recomputed_after_lock';
      ok := false;
      detail := jsonb_build_object(
        'period_id', r.period_id,
        'week_start', r.week_start,
        'locked_at', r.locked_at
      );
      RETURN NEXT;
    END IF;

    IF NOT fuel_system.week_is_v3(v_engine) THEN
      CONTINUE;
    END IF;

    v_period_id := r.period_id;
    v_spend := COALESCE(r.total_spend, 0);
    v_company := COALESCE(r.company_share, 0);
    v_driver := COALESCE(r.driver_share, 0);
    v_gap := round(v_company + v_driver - v_spend, 2);

    check_no := 1;
    name := 'v3_shares_vs_spend';
    ok := abs(v_gap) < 0.005;
    detail := jsonb_build_object(
      'period_id', v_period_id,
      'week_start', r.week_start,
      'spend', v_spend,
      'company', v_company,
      'driver', v_driver,
      'gap', v_gap
    );
    RETURN NEXT;

    SELECT count(DISTINCT fe.driver_id) INTO v_driver_cnt
    FROM fleet.fuel_entries fe
    WHERE fe.organization_id = p_org
      AND fe.date >= r.week_start
      AND fe.date <= r.week_start + 6
      AND COALESCE(fe.amount, 0) > 0
      AND fe.driver_id IS NOT NULL;

    SELECT count(*) INTO v_stmt_cnt
    FROM ledger.week_statements ws
    WHERE ws.organization_id::text = p_org
      AND ws.week_key = r.week_start
      AND ws.kind = 'fuel'
      AND ws.status = 'closed'
      AND ws.driver_id <> '*';

    check_no := 2;
    name := 'v3_driver_fuel_statements';
    ok := v_driver_cnt = 0 OR v_stmt_cnt >= v_driver_cnt;
    detail := jsonb_build_object(
      'period_id', v_period_id,
      'drivers_with_fuel', v_driver_cnt,
      'statements', v_stmt_cnt
    );
    RETURN NEXT;

    SELECT
      COALESCE(sum(wl.driver_amount_minor), 0),
      COALESCE(sum(wl.company_amount_minor), 0)
    INTO v_line_drv, v_line_co
    FROM fuel.week_lines wl
    WHERE wl.org_id = p_org
      AND wl.period_id = v_period_id
      AND wl.reversed_by IS NULL;

    -- Check 3 (F-03/F-16): the current lines add up to the locked week's driver and company
    -- shares, each to the cent. (The snapshot's money holds per-driver reports, not totals, so the
    -- period's locked share columns are the comparison.) A v3 week with money and no lines fails.
    v_snap_drv := v_driver;
    v_snap_co := v_company;
    check_no := 3;
    name := 'v3_lines_vs_week_shares';
    ok := abs(v_line_drv / 100.0 - v_snap_drv) < 0.005
      AND abs(v_line_co / 100.0 - v_snap_co) < 0.005;
    detail := jsonb_build_object(
      'period_id', v_period_id,
      'lines_driver_minor', v_line_drv,
      'lines_company_minor', v_line_co,
      'week_driver_share', v_snap_drv,
      'week_company_share', v_snap_co
    );
    RETURN NEXT;

    check_no := 4;
    name := 'v3_no_duplicate_card_fill';
    ok := NOT EXISTS (
      SELECT 1
      FROM fleet.fuel_entries fe
      WHERE fe.organization_id = p_org
        AND fe.date >= r.week_start
        AND fe.date <= r.week_start + 6
        AND fe.type = 'Card_Transaction'
        AND fe.transaction_id IS NOT NULL
      GROUP BY fe.vehicle_id, fe.date, fe.amount, fe.transaction_id
      HAVING count(*) > 1
    );
    detail := jsonb_build_object('period_id', v_period_id, 'week_start', r.week_start);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION fuel_system.company_metrics(p_org text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'companyId', p_org,
    'lastNightly', (
      SELECT jsonb_build_object(
        'at', max(n.created_at),
        'failed', count(*) FILTER (WHERE NOT n.ok)
      )
      FROM fuel.nightly_results n
      WHERE n.org_id = p_org
        AND n.run_id = (
          SELECT n2.run_id
          FROM fuel.nightly_results n2
          WHERE n2.org_id = p_org
          ORDER BY n2.created_at DESC
          LIMIT 1
        )
    ),
    'openFuelPeriods', (
      SELECT count(*)
      FROM public.fuel_reconciliation_period p
      WHERE p.org_id::text = p_org
        AND p.status NOT IN ('locked', 'reopened')
    ),
    'lockedWeeks', (
      SELECT count(*)
      FROM public.fuel_reconciliation_period p
      WHERE p.org_id::text = p_org AND p.status = 'locked'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.fuel_v2_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org text;
BEGIN
  -- app_metadata only (users can edit user_metadata themselves); same as toll_read.current_company().
  v_org := COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'organizationId', ''),
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')
  );
  IF v_org IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NO_ORG', ERRCODE = 'P0001';
  END IF;
  RETURN fuel_system.company_metrics(v_org);
END;
$$;

CREATE OR REPLACE FUNCTION fuel_system.nightly_run(p_org text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run uuid := gen_random_uuid();
  v_org text;
  c record;
BEGIN
  FOR v_org IN
    SELECT DISTINCT p.org_id::text
    FROM public.fuel_reconciliation_period p
    WHERE p_org IS NULL OR p.org_id::text = p_org
  LOOP
    FOR c IN SELECT * FROM fuel_system.nightly_checks(v_org)
    LOOP
      INSERT INTO fuel.nightly_results (org_id, run_id, check_no, name, ok, detail)
      VALUES (v_org, v_run, c.check_no, c.name, c.ok, c.detail);
    END LOOP;
  END LOOP;
  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION fuel_system.nightly_checks(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fuel_system.company_metrics(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fuel_system.nightly_run(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fuel_system.nightly_checks(text) TO service_role;
GRANT EXECUTE ON FUNCTION fuel_system.company_metrics(text) TO service_role;
GRANT EXECUTE ON FUNCTION fuel_system.nightly_run(text) TO service_role;
REVOKE ALL ON FUNCTION public.fuel_v2_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fuel_v2_metrics() TO authenticated;