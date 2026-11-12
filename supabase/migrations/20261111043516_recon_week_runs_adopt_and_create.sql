-- Week Reconciliation Round 1: back-fill ended week runs + adopt money close (WRA-13, WRA-39).

CREATE OR REPLACE FUNCTION recon.fleet_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Jamaica')::date;
$$;

CREATE OR REPLACE FUNCTION recon.last_ended_week_monday(p_day date DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day date := COALESCE(p_day, recon.fleet_today());
  v_monday date := recon.week_monday(v_day);
BEGIN
  WHILE v_day <= v_monday + 6 LOOP
    v_monday := v_monday - 7;
  END LOOP;
  RETURN v_monday;
END;
$$;

COMMENT ON FUNCTION recon.last_ended_week_monday(date) IS
  'Latest Monday whose Sun–Sat week has ended in America/Jamaica (isSettlementPeriodEnded).';

CREATE OR REPLACE FUNCTION recon.first_data_week(p_org text)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT recon.week_monday(MIN(p.period_anchor))
  FROM public.driver_financial_periods p
  WHERE p.organization_id::text = btrim(p_org)
    AND p.period_anchor IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION recon.dfp_period_is_frozen(
  p_metadata jsonb,
  p_settlement_status text,
  p_status text,
  p_closed_at timestamptz
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_closed_at IS NOT NULL
    OR lower(COALESCE(p_status, '')) = 'closed'
    OR COALESCE((p_metadata ->> 'periodFrozen')::boolean, false)
    OR COALESCE((p_metadata ->> 'signedWeek')::boolean, false)
    OR COALESCE(btrim(p_metadata -> 'financeCore' ->> 'signedAt'), '') <> ''
    OR COALESCE((p_metadata -> 'financeCore' ->> 'periodFrozen')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION recon.line_periods_all_frozen(
  p_org text,
  p_week date,
  p_line text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.driver_financial_periods p
      WHERE p.organization_id::text = btrim(p_org)
        AND p.period_anchor = p_week
        AND public.dfp_service_line_matches(p.metadata, p_line)
    ) THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.driver_financial_periods p
      WHERE p.organization_id::text = btrim(p_org)
        AND p.period_anchor = p_week
        AND public.dfp_service_line_matches(p.metadata, p_line)
        AND NOT recon.dfp_period_is_frozen(
          p.metadata,
          p.settlement_status::text,
          p.status::text,
          p.closed_at
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION recon.active_recon_lines(p_org text)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines text[];
  v_mod jsonb;
BEGIN
  SELECT o.service_lines, o.enabled_modules
  INTO v_lines, v_mod
  FROM public.organizations o
  WHERE o.id::text = btrim(p_org)
  LIMIT 1;

  IF NOT FOUND OR v_lines IS NULL OR COALESCE(array_length(v_lines, 1), 0) = 0 THEN
    RETURN NEXT 'rideshare';
    RETURN;
  END IF;

  IF 'rideshare' = ANY (v_lines) THEN
    RETURN NEXT 'rideshare';
  END IF;

  IF 'rush_delivery' = ANY (v_lines)
    AND COALESCE(
      (v_mod -> 'rush_delivery')::boolean,
      (v_mod -> 'rush')::boolean,
      false
    ) THEN
    RETURN NEXT 'rush_delivery';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION recon.ensure_ended_week_runs(p_org text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, public
AS $$
DECLARE
  v_first date;
  v_last date;
  v_week date;
  v_line text;
  v_main text;
  v_run_id uuid;
  v_closed_at timestamptz;
  v_step_ids text[] := ARRAY[
    'sources',
    'attribution',
    'tolls',
    'tag_account',
    'fuel',
    'trips_earnings',
    'settlement_preview',
    'close'
  ];
  v_step_id text;
  v_run record;
BEGIN
  v_first := recon.first_data_week(p_org);
  v_last := recon.last_ended_week_monday();

  IF v_first IS NULL OR v_last IS NULL OR v_first > v_last THEN
    RETURN;
  END IF;

  v_main := recon.org_main_line(p_org);

  v_week := v_first;
  WHILE v_week <= v_last LOOP
    FOR v_line IN SELECT recon.active_recon_lines(p_org)
    LOOP
      INSERT INTO recon.week_runs (
        organization_id,
        service_line,
        week_key,
        state,
        version,
        main_line
      ) VALUES (
        btrim(p_org),
        v_line,
        v_week,
        'collecting',
        1,
        v_main
      )
      ON CONFLICT (organization_id, service_line, week_key) DO NOTHING
      RETURNING id INTO v_run_id;

      IF v_run_id IS NOT NULL THEN
        FOREACH v_step_id IN ARRAY v_step_ids
        LOOP
          INSERT INTO recon.run_steps (
            run_id,
            step_id,
            actionable,
            informational
          ) VALUES (
            v_run_id,
            v_step_id,
            0,
            0
          )
          ON CONFLICT (run_id, step_id) DO NOTHING;
        END LOOP;

        INSERT INTO recon.week_publish_holds (run_id, hold_until, updated_at)
        VALUES (v_run_id, NULL, now())
        ON CONFLICT (run_id) DO NOTHING;
      END IF;
    END LOOP;

    v_week := v_week + 7;
  END LOOP;

  FOR v_run IN
    SELECT wr.id, wr.service_line, wr.week_key
    FROM recon.week_runs wr
    WHERE wr.organization_id = btrim(p_org)
      AND wr.state IS DISTINCT FROM 'closed'
  LOOP
    IF NOT recon.line_periods_all_frozen(
      p_org,
      v_run.week_key,
      v_run.service_line
    ) THEN
      CONTINUE;
    END IF;

    SELECT max(p.closed_at)
    INTO v_closed_at
    FROM public.driver_financial_periods p
    WHERE p.organization_id::text = btrim(p_org)
      AND p.period_anchor = v_run.week_key
      AND public.dfp_service_line_matches(p.metadata, v_run.service_line);

    UPDATE recon.week_runs
    SET
      state = 'closed',
      closed_at = v_closed_at
    WHERE id = v_run.id
      AND state IS DISTINCT FROM 'closed';

    INSERT INTO recon.run_events (
      run_id,
      actor,
      kind,
      line,
      week_key,
      status,
      after
    ) VALUES (
      v_run.id,
      'system',
      'adopt_period_close',
      v_run.service_line,
      v_run.week_key,
      'applied',
      jsonb_build_object('closed_at', v_closed_at)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION recon.ensure_ended_week_runs(text) IS
  'Create missing runs for ended weeks per active line; adopt Driver Settlements close (WRA-13, WRA-39).';

REVOKE ALL ON FUNCTION recon.ensure_ended_week_runs(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon.ensure_ended_week_runs(text) TO service_role;

NOTIFY pgrst, 'reload schema';
