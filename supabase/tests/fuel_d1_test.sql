-- D1: fuel.week_lines schema + RLS (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT 'f1111111-1111-4111-8111-111111111101'::uuid, 'fuel-d1-a@example.com'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'f1111111-1111-4111-8111-111111111101');

INSERT INTO auth.users (id, email)
SELECT 'f2222222-2222-4222-8222-222222222202'::uuid, 'fuel-d1-b@example.com'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'f2222222-2222-4222-8222-222222222202');

CREATE OR REPLACE FUNCTION pg_temp._fuel_d1_as(p_user uuid, p_org text) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user::text, 'role', 'authenticated',
      'app_metadata', json_build_object('organization_id', p_org)
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
END;
$a$;

DO $$
DECLARE
  v_org_a text := 'org-fuel-d1-a';
  v_org_b text := 'org-fuel-d1-b';
  v_cnt int;
BEGIN
  INSERT INTO fuel.week_lines (
    org_id, period_id, week_start, vehicle_id, driver_id, purpose,
    km, cost_per_km_minor, driver_pct, driver_amount_minor, company_amount_minor, engine_version
  )
  VALUES (
    v_org_a, 'period-a', '2026-11-16', 'veh-a', 'drv-a', 'uber_trips',
    100, 15000, 20, 300000, 1200000, 'fuel-chain-v3'
  );

  PERFORM pg_temp._fuel_d1_as('f1111111-1111-4111-8111-111111111101'::uuid, v_org_a);
  SELECT count(*) INTO v_cnt FROM fuel.week_lines;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'org A should see 1 line, got %', v_cnt;
  END IF;
  RESET ROLE;

  PERFORM pg_temp._fuel_d1_as('f2222222-2222-4222-8222-222222222202'::uuid, v_org_b);
  SELECT count(*) INTO v_cnt FROM fuel.week_lines;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'org B should see 0 lines, got %', v_cnt;
  END IF;
  RESET ROLE;
END;
$$;

ROLLBACK;