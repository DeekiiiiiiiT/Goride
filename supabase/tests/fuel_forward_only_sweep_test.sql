-- Done-test 10 local: locked v2.2 week appears in sweep with 0 lines.

BEGIN;

DO $$
DECLARE
  v_org text := 'f7111111-1111-4111-8111-111111111101';
  v_org_uuid uuid := 'f7111111-1111-4111-8111-111111111101';
  v_week date := '2026-11-09';
  v_lines bigint;
BEGIN
  INSERT INTO public.fuel_reconciliation_period (
    id, org_id, week_start, week_end, status, locked_at,
    total_spend, company_share, driver_share, service_line
  ) VALUES (
    'period-t10', v_org_uuid, v_week, v_week + 6, 'locked', now() - interval '7 days',
    31512.06, 25000, 6512.06, 'rideshare'
  );
  INSERT INTO public.fuel_week_snapshot (
    org_id, period_id, week_start, version, inputs_hash, money, provenance, created_at
  ) VALUES (
    v_org, 'period-t10', v_week, 1, 'hash-t10',
    jsonb_build_object('reports', '[]'::jsonb, 'totalSpend', 31512.06),
    jsonb_build_object('engineVersion', 'fuel-chain-v2.2'),
    now() - interval '7 days'
  );

  SELECT s.week_lines_count INTO v_lines
  FROM (
    SELECT
      (
        SELECT count(*)::bigint
        FROM fuel.week_lines wl
        WHERE wl.period_id = p.id
      ) AS week_lines_count
    FROM public.fuel_reconciliation_period p
    WHERE p.id = 'period-t10'
  ) s;

  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'forward-only sweep fixture must have 0 week lines, got %', v_lines;
  END IF;
END;
$$;

ROLLBACK;