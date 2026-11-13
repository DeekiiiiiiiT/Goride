-- Toll v2 P3-R1: screen reads week_desk / weeks / import_reports (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('f0311111-1111-4111-8111-111111111111'::uuid, 'toll-scr-owner@example.com'),
  ('f0321111-1111-4111-8111-111111111112'::uuid, 'toll-scr-view@example.com'),
  ('f0331111-1111-4111-8111-111111111113'::uuid, 'toll-scr-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES
  ('f3111111-1111-4111-8111-111111111101', 'f0311111-1111-4111-8111-111111111111', 'Toll Screen A', 'toll-scr-a', 'fleet', 'active'),
  ('f3222222-2222-4222-8222-222222222202', 'f0331111-1111-4111-8111-111111111113', 'Toll Screen B', 'toll-scr-b', 'fleet', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES
  ('f3111111-1111-4111-8111-111111111101', true),
  ('f3222222-2222-4222-8222-222222222202', true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

SELECT toll_system.ensure_accounts('f3111111-1111-4111-8111-111111111101');
SELECT toll_system.ensure_accounts('f3222222-2222-4222-8222-222222222202');

CREATE OR REPLACE FUNCTION pg_temp._scr_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._scr_expect_desk(p_code text, p_week date) RETURNS void
LANGUAGE plpgsql AS $e$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.toll_v2_week_desk(p_week);
    RAISE EXCEPTION 'scr expected % but desk succeeded', p_code;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'scr desk expected % got %', p_code, v_msg;
    END IF;
  END;
END;
$e$;

CREATE OR REPLACE FUNCTION pg_temp._scr_expect_weeks(p_code text) RETURNS void
LANGUAGE plpgsql AS $ew$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.toll_v2_weeks();
    RAISE EXCEPTION 'scr expected % but weeks succeeded', p_code;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_msg IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'scr weeks expected % got %', p_code, v_msg;
    END IF;
  END;
END;
$ew$;

CREATE OR REPLACE FUNCTION pg_temp._scr_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._scr_as(
    current_setting('scr.test_user', true)::uuid,
    current_setting('scr.test_org', true)::uuid
  );
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._scr_ch(p_org uuid, p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = p_org AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._scr_pb(p_org uuid, p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = p_org AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._scr_nightly_ok(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE x record;
BEGIN
  RESET ROLE;
  FOR x IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
    IF NOT x.ok THEN
      RAISE EXCEPTION 'scr nightly % % failed: %', x.check_no, x.name, x.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._scr_desk_row(p_desk jsonb, p_org uuid, p_ref text) RETURNS jsonb
LANGUAGE sql AS $dr$
  SELECT x FROM jsonb_array_elements(p_desk -> 'charges') x
  WHERE EXISTS (
    SELECT 1 FROM toll.charges c
    WHERE c.organization_id = p_org AND c.source_ref = p_ref AND c.id = (x ->> 'id')::uuid
  );
$dr$;

CREATE OR REPLACE FUNCTION pg_temp._scr_match_cand(
  p_charge uuid, p_payback uuid, p_score int, p_rules text[], p_inputs jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql AS $mc$
  SELECT jsonb_build_object(
    'charge_id', p_charge, 'payback_id', p_payback, 'score', p_score, 'auto_apply', false,
    'score_parts', jsonb_build_object(
      'total', p_score, 'window', 60, 'amount', 30, 'sole_candidate', 10,
      'window_hit', 'on_trip', 'amount_diff_minor', 0, 'minutes_outside_trip', 0
    ),
    'rules_fired', to_jsonb(p_rules),
    'inputs', coalesce(p_inputs, jsonb_build_object(
      'engine_version', 'toll-matcher-v1', 'charge', jsonb_build_object('id', p_charge::text),
      'payback', jsonb_build_object('id', p_payback::text)))
  );
$mc$;

CREATE OR REPLACE FUNCTION pg_temp._scr_match_store(p_org uuid, p_charge uuid, p_cands jsonb) RETURNS void
LANGUAGE plpgsql AS $ms$
DECLARE v_claim jsonb; v_id uuid; v_store jsonb;
BEGIN
  RESET ROLE;
  PERFORM toll_system.match_enqueue(p_org, 'charge', p_charge);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(p_org, 10);
  v_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'scr match claim empty'; END IF;
  v_store := public.toll_sys_match_store(p_org, v_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', p_cands));
  IF coalesce((v_store ->> 'new')::int, 0) < 1 AND coalesce((v_store ->> 'unchanged')::int, 0) < 1 THEN
    RAISE EXCEPTION 'scr match store skipped: %', v_store;
  END IF;
  RESET ROLE;
END;
$ms$;

DO $$
DECLARE
  v_owner   uuid := 'f0311111-1111-4111-8111-111111111111';
  v_viewer  uuid := 'f0321111-1111-4111-8111-111111111112';
  v_owner_b uuid := 'f0331111-1111-4111-8111-111111111113';
  v_org_a   uuid := 'f3111111-1111-4111-8111-111111111101';
  v_org_b   uuid := 'f3222222-2222-4222-8222-222222222202';
  v_week    date := '2024-11-04';
  v_week2   date := '2024-11-11';
  v_role_view uuid;
  v_fn_desk regprocedure := 'public.toll_v2_week_desk(date)'::regprocedure;
  v_fn_weeks regprocedure := 'public.toll_v2_weeks()'::regprocedure;
  v_fn_imp regprocedure := 'public.toll_v2_import_reports(date)'::regprocedure;
  v_desk    jsonb;
  v_weeks   jsonb;
  v_imps    jsonb;
  v_row     jsonb;
  v_j       jsonb;
  v_wk      jsonb;
  r         jsonb;
  c         toll.charges;
  p         toll.paybacks;
  v_sug     uuid;
  v_undo    jsonb;
  v_cnt     int;
  v_sum     bigint;
  v_blk     jsonb;
  v_exp     bigint;
  v_decision uuid;
  v_claim_id uuid;
  v_tb_cnt  int;
  v_i       int;
  v_tw      date;
  v_dr      toll.duplicate_reviews%ROWTYPE;
  v_id_sure uuid; v_id_likely uuid; v_id_pick uuid; v_id_also_a uuid; v_id_also_b uuid; v_id_dec_match uuid;
  v_pb_sure uuid; v_pb_la uuid; v_pb_lb uuid; v_pb_pa uuid; v_pb_pb uuid; v_pb_also uuid; v_pb_match uuid;
BEGIN
  PERFORM set_config('scr.test_user', v_owner::text, true);
  PERFORM set_config('scr.test_org', v_org_a::text, true);

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
  VALUES ('fleet_viewer', 'Fleet Viewer', 'toll scr test', 30, 'fleet', true)
  ON CONFLICT (name) DO NOTHING;
  SELECT id INTO v_role_view FROM platform.roles WHERE name = 'fleet_viewer';
  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
  VALUES (v_viewer, v_role_view, 'organization', v_org_a, 'active', NULL)
  ON CONFLICT DO NOTHING;

  -- ── fixture imports (week 2024-11-04) ──
  RESET ROLE;
  PERFORM public.toll_sys_import(v_org_a, 'uber', '[
    {"row_type":"trip","platform_trip_id":"scr-sure","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-05T14:00:00-05:00","dropoff_at":"2024-11-05T14:50:00-05:00",
     "payment_method":"card","toll_payback_minor":34000},
    {"row_type":"trip","platform_trip_id":"scr-la","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-05T15:00:00-05:00","dropoff_at":"2024-11-05T15:40:00-05:00",
     "payment_method":"card","toll_payback_minor":25000},
    {"row_type":"trip","platform_trip_id":"scr-lb","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-05T16:00:00-05:00","dropoff_at":"2024-11-05T16:40:00-05:00",
     "payment_method":"card","toll_payback_minor":24000},
    {"row_type":"trip","platform_trip_id":"scr-pa","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-05T17:00:00-05:00","dropoff_at":"2024-11-05T17:35:00-05:00",
     "payment_method":"card","toll_payback_minor":5000},
    {"row_type":"trip","platform_trip_id":"scr-pb","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-05T17:05:00-05:00","dropoff_at":"2024-11-05T17:40:00-05:00",
     "payment_method":"card","toll_payback_minor":5000},
    {"row_type":"trip","platform_trip_id":"scr-also","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-06T10:00:00-05:00","dropoff_at":"2024-11-06T10:40:00-05:00",
     "payment_method":"card","toll_payback_minor":8000},
    {"row_type":"trip","platform_trip_id":"scr-orphan","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-06T11:00:00-05:00","dropoff_at":"2024-11-06T11:40:00-05:00",
     "payment_method":"card","toll_payback_minor":12000},
    {"row_type":"trip","platform_trip_id":"scr-match","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-06T12:00:00-05:00","dropoff_at":"2024-11-06T12:40:00-05:00",
     "payment_method":"card","toll_payback_minor":11000},
    {"row_type":"trip","platform_trip_id":"scr-tb-cand","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-07T10:00:00-05:00","dropoff_at":"2024-11-07T10:40:00-05:00",
     "payment_method":"card","toll_payback_minor":60000}
  ]'::jsonb, 'scr-imp-uber', 'smoke');

  PERFORM public.toll_sys_import(v_org_a, 'tag_statement', '[
    {"source_ref":"scr-sure","occurred_at":"2024-11-05T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-likely","occurred_at":"2024-11-05T15:10:00-05:00","amount_minor":25000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-pick","occurred_at":"2024-11-05T17:15:00-05:00","amount_minor":5000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-notrip","occurred_at":"2024-11-05T18:00:00-05:00","amount_minor":7000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-also-a","occurred_at":"2024-11-06T10:15:00-05:00","amount_minor":8000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-also-b","occurred_at":"2024-11-06T10:25:00-05:00","amount_minor":8000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dup-tag","occurred_at":"2024-11-06T14:00:00-05:00","amount_minor":900,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dec-match","occurred_at":"2024-11-06T12:10:00-05:00","amount_minor":11000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dec-driver","occurred_at":"2024-11-06T13:00:00-05:00","amount_minor":20000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dec-fleet","occurred_at":"2024-11-06T13:30:00-05:00","amount_minor":15000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dup-pair-tag","occurred_at":"2024-11-06T15:00:00-05:00","amount_minor":600,"plaza_id":"pzP","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dupconf-a","occurred_at":"2024-11-06T15:30:00-05:00","amount_minor":1100,"plaza_id":"pzX","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-dupconf-b","occurred_at":"2024-11-06T15:31:00-05:00","amount_minor":1100,"plaza_id":"pzX","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-seal-ref","occurred_at":"2024-11-06T16:00:00-05:00","amount_minor":4000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"scr-count-pend","occurred_at":"2024-11-07T09:00:00-05:00","amount_minor":3000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'scr-imp-tag', 'smoke');

  PERFORM public.toll_sys_import(v_org_a, 'driver_cash', '[
    {"source_ref":"scr-receipt","occurred_at":"2024-11-05T09:00:00-05:00","amount_minor":18000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"https://r"}},
    {"source_ref":"scr-dec-reject","occurred_at":"2024-11-06T13:45:00-05:00","amount_minor":12000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"https://x"}},
    {"source_ref":"scr-dup-cash","occurred_at":"2024-11-06T14:02:00-05:00","amount_minor":900,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"https://d"},"evidence_status":"verified"},
    {"source_ref":"scr-dup-pair-cash","occurred_at":"2024-11-06T15:02:00-05:00","amount_minor":600,"plaza_id":"pzP","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"https://p"}}
  ]'::jsonb, 'scr-imp-cash', 'smoke');

  PERFORM public.toll_sys_import(v_org_a, 'topups', '[
    {"source_ref":"scr-top-1","topped_up_on":"2024-11-06","amount_minor":25000,"provider":"transjam","account_ref":"scr-acct","vehicle_id":"v1"}
  ]'::jsonb, 'scr-imp-top', 'smoke');

  PERFORM public.toll_sys_import(v_org_a, 'tag_statement', '[
    {"source_ref":"scr-other-wk","occurred_at":"2024-11-12T10:00:00-05:00","amount_minor":1000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'scr-imp-other-wk', 'smoke');

  SELECT ch.id INTO v_id_sure FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-sure';
  SELECT ch.id INTO v_id_likely FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-likely';
  SELECT ch.id INTO v_id_pick FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-pick';
  SELECT ch.id INTO v_id_also_a FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-also-a';
  SELECT ch.id INTO v_id_also_b FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-also-b';
  SELECT ch.id INTO v_id_dec_match FROM toll.charges ch WHERE ch.organization_id = v_org_a AND ch.source_ref = 'scr-dec-match';
  SELECT pb.id INTO v_pb_sure FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-sure';
  SELECT pb.id INTO v_pb_la FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-la';
  SELECT pb.id INTO v_pb_lb FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-lb';
  SELECT pb.id INTO v_pb_pa FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-pa';
  SELECT pb.id INTO v_pb_pb FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-pb';
  SELECT pb.id INTO v_pb_also FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-also';
  SELECT pb.id INTO v_pb_match FROM toll.paybacks pb WHERE pb.organization_id = v_org_a AND pb.reference = 'trip:scr-match';

  DELETE FROM toll.match_queue WHERE organization_id = v_org_a;

  INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
  SELECT v_org_a, LEAST(a.id, b.id), GREATEST(a.id, b.id), 'open'
  FROM toll.charges a, toll.charges b
  WHERE a.organization_id = v_org_a AND a.source_ref = 'scr-dup-tag'
    AND b.organization_id = v_org_a AND b.source_ref = 'scr-dup-cash'
    AND NOT EXISTS (
      SELECT 1 FROM toll.duplicate_reviews dr
      WHERE dr.organization_id = v_org_a AND dr.status = 'open'
        AND dr.charge_a = LEAST(a.id, b.id) AND dr.charge_b = GREATEST(a.id, b.id)
    );
  INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
  SELECT v_org_a, LEAST(a.id, b.id), GREATEST(a.id, b.id), 'open'
  FROM toll.charges a, toll.charges b
  WHERE a.organization_id = v_org_a AND a.source_ref = 'scr-dup-pair-tag'
    AND b.organization_id = v_org_a AND b.source_ref = 'scr-dup-pair-cash'
    AND NOT EXISTS (
      SELECT 1 FROM toll.duplicate_reviews dr
      WHERE dr.organization_id = v_org_a AND dr.status = 'open'
        AND dr.charge_a = LEAST(a.id, b.id) AND dr.charge_b = GREATEST(a.id, b.id)
    );
  INSERT INTO toll.duplicate_reviews (organization_id, charge_a, charge_b, status)
  SELECT v_org_a, LEAST(a.id, b.id), GREATEST(a.id, b.id), 'open'
  FROM toll.charges a, toll.charges b
  WHERE a.organization_id = v_org_a AND a.source_ref = 'scr-dupconf-a'
    AND b.organization_id = v_org_a AND b.source_ref = 'scr-dupconf-b'
    AND NOT EXISTS (
      SELECT 1 FROM toll.duplicate_reviews dr
      WHERE dr.organization_id = v_org_a AND dr.status = 'open'
        AND dr.charge_a = LEAST(a.id, b.id) AND dr.charge_b = GREATEST(a.id, b.id)
    );

  INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES
    (v_org_a, v_id_sure, v_pb_sure, '{"total":100}', ARRAY['on_trip','sole_candidate'], 'toll-matcher-v1', '{"scr":"sure"}', md5('{"scr":"sure"}')),
    (v_org_a, v_id_likely, v_pb_la, '{"total":100}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"la"}', md5('{"scr":"la"}')),
    (v_org_a, v_id_likely, v_pb_lb, '{"total":90}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"lb"}', md5('{"scr":"lb"}')),
    (v_org_a, v_id_pick, v_pb_pa, '{"total":95}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"pa"}', md5('{"scr":"pa"}')),
    (v_org_a, v_id_pick, v_pb_pb, '{"total":95}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"pb"}', md5('{"scr":"pb"}')),
    (v_org_a, v_id_also_a, v_pb_also, '{"total":100}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"aa"}', md5('{"scr":"aa"}')),
    (v_org_a, v_id_also_b, v_pb_also, '{"total":100}', ARRAY['on_trip'], 'toll-matcher-v1', '{"scr":"ab"}', md5('{"scr":"ab"}')),
    (v_org_a, v_id_dec_match, v_pb_match, '{"total":100}', ARRAY['on_trip','sole_candidate'], 'toll-matcher-v1', '{"scr":"dm"}', md5('{"scr":"dm"}'));

  PERFORM public.toll_sys_import(v_org_b, 'tag_statement', '[
    {"source_ref":"scr-b-only","occurred_at":"2024-11-05T12:00:00-05:00","amount_minor":5000,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d9"}
  ]'::jsonb, 'scr-b-imp', 'smoke');

  -- ══ 1. Access ══
  IF has_function_privilege('anon', v_fn_desk, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_desk, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_weeks, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_weeks, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_imp, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn_imp, 'EXECUTE') THEN
    RAISE EXCEPTION 's1 anon/service_role must not EXECUTE toll_v2 screen reads';
  END IF;

  PERFORM pg_temp._scr_as(v_viewer, v_org_a);
  PERFORM pg_temp._scr_expect_desk('FORBIDDEN', v_week);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"sub":"' || v_owner::text || '","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._scr_expect_desk('NO_COMPANY', v_week);
  PERFORM pg_temp._scr_expect_weeks('NO_COMPANY');
  RESET ROLE;

  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  PERFORM pg_temp._scr_expect_desk('BAD_REQUEST', v_week + 3);
  RESET ROLE;

  PERFORM pg_temp._scr_as(v_owner_b, v_org_b);
  v_desk := public.toll_v2_week_desk(v_week);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') x
    JOIN toll.charges ch ON ch.id = (x ->> 'id')::uuid
    WHERE ch.organization_id = v_org_a
  ) THEN
    RAISE EXCEPTION 's1 company B must not see A charges';
  END IF;
  RESET ROLE;

  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  IF v_desk ->> 'weekKey' IS DISTINCT FROM v_week::text THEN
    RAISE EXCEPTION 's1 weekKey';
  END IF;
  RESET ROLE;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 2. Sections and confidence ══
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-sure');
  IF v_row ->> 'section' <> 'suggested' OR v_row ->> 'confidence' <> 'sure' THEN
    RAISE EXCEPTION 's2 sure got % %', v_row ->> 'section', v_row ->> 'confidence';
  END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-likely');
  IF v_row ->> 'section' <> 'suggested' OR v_row ->> 'confidence' <> 'likely' THEN
    RAISE EXCEPTION 's2 likely';
  END IF;
  IF (v_row -> 'suggestions' -> 0 ->> 'score')::int < (v_row -> 'suggestions' -> 1 ->> 'score')::int THEN
    RAISE EXCEPTION 's2 likely top score order';
  END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-pick');
  IF v_row ->> 'section' <> 'pick' OR v_row ->> 'confidence' <> 'two_trips' THEN
    RAISE EXCEPTION 's2 pick';
  END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-notrip');
  IF v_row ->> 'section' <> 'no_trip' THEN RAISE EXCEPTION 's2 no_trip'; END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-receipt');
  IF v_row ->> 'section' <> 'receipts' OR v_row -> 'receipt' ->> 'receipt_url' IS NULL THEN
    RAISE EXCEPTION 's2 receipts';
  END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-dup-tag');
  IF v_row ->> 'section' <> 'duplicates' THEN RAISE EXCEPTION 's2 dup pair section'; END IF;
  IF jsonb_array_length(v_desk -> 'reviewPairs') < 1 THEN RAISE EXCEPTION 's2 reviewPairs'; END IF;

  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-also-a');
  IF jsonb_array_length(v_row -> 'suggestions' -> 0 -> 'alsoFits') < 1 THEN RAISE EXCEPTION 's2 alsoFits a'; END IF;
  v_row := pg_temp._scr_desk_row(v_desk, v_org_a, 'scr-also-b');
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row -> 'suggestions' -> 0 -> 'alsoFits') af
    WHERE (af ->> 'chargeId')::uuid = (pg_temp._scr_ch(v_org_a, 'scr-also-a')).id
  ) THEN
    RAISE EXCEPTION 's2 alsoFits b names other charge';
  END IF;

  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 10. Weeks counts (while blockers still open) ══
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_weeks := public.toll_v2_weeks();
  RESET ROLE;
  SELECT w INTO v_wk FROM jsonb_array_elements(v_weeks -> 'weeks') w WHERE w ->> 'weekKey' = v_week::text;
  IF v_wk IS NULL THEN RAISE EXCEPTION 's10 week row missing'; END IF;
  IF (v_wk ->> 'toDecide')::int < 1 THEN RAISE EXCEPTION 's10 toDecide charges'; END IF;
  IF (v_wk ->> 'paybacksOpen')::int < 1 THEN RAISE EXCEPTION 's10 paybacksOpen'; END IF;
  IF (v_wk ->> 'reviewPairs')::int < 1 THEN RAISE EXCEPTION 's10 reviewPairs'; END IF;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 3. Decided rows + undo ══
  c := pg_temp._scr_ch(v_org_a, 'scr-dec-match');
  p := pg_temp._scr_pb(v_org_a, 'trip:scr-match');
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org_a AND charge_id = c.id AND payback_id = p.id AND superseded_by IS NULL LIMIT 1;
  r := pg_temp._scr_cmd('apply_suggestion', jsonb_build_object(
    'command_id', 'scr-dec-apply', 'suggestion_id', v_sug,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dec-match');
  RESET ROLE;
  IF v_row -> 'decision' ->> 'kind' <> 'matched' OR v_row -> 'decision' -> 'trip' IS NULL THEN
    RAISE EXCEPTION 's3 matched';
  END IF;
  v_undo := v_row -> 'decision' -> 'undo';
  IF v_undo IS NULL THEN RAISE EXCEPTION 's3 matched undo'; END IF;
  PERFORM pg_temp._scr_cmd('undo_decision', v_undo || jsonb_build_object('command_id', 'scr-undo-match'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dec-match');
  RESET ROLE;
  IF v_row ->> 'section' <> 'suggested' THEN RAISE EXCEPTION 's3 undo match section'; END IF;
  r := pg_temp._scr_cmd('apply_suggestion', jsonb_build_object(
    'command_id', 'scr-dec-apply2', 'suggestion_id', v_sug,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dec-match')).version,
    'expected_payback_version', (pg_temp._scr_pb(v_org_a, 'trip:scr-match')).version));

  c := pg_temp._scr_ch(v_org_a, 'scr-dec-driver');
  r := pg_temp._scr_cmd('driver_pays', jsonb_build_object(
    'command_id', 'scr-dec-drv', 'charge_id', c.id, 'expected_charge_version', c.version, 'amount_minor', 10000,
    'reason_code', 'personal'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dec-driver');
  RESET ROLE;
  IF v_row -> 'decision' ->> 'kind' <> 'driver_pays' THEN RAISE EXCEPTION 's3 driver_pays'; END IF;
  v_undo := v_row -> 'decision' -> 'undo';
  PERFORM pg_temp._scr_cmd('undo_decision', v_undo || jsonb_build_object('command_id', 'scr-undo-drv'));
  r := pg_temp._scr_cmd('driver_pays', jsonb_build_object(
    'command_id', 'scr-dec-drv2', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dec-driver')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dec-driver')).version, 'amount_minor', 10000,
    'reason_code', 'personal'));

  c := pg_temp._scr_ch(v_org_a, 'scr-dec-fleet');
  r := pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-dec-flt', 'charge_id', c.id, 'expected_charge_version', c.version));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dec-fleet');
  RESET ROLE;
  IF v_row -> 'decision' ->> 'kind' <> 'fleet_pays' THEN RAISE EXCEPTION 's3 fleet_pays'; END IF;
  v_undo := v_row -> 'decision' -> 'undo';
  PERFORM pg_temp._scr_cmd('undo_decision', v_undo || jsonb_build_object('command_id', 'scr-undo-flt'));
  r := pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-dec-flt2', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dec-fleet')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dec-fleet')).version));

  c := pg_temp._scr_ch(v_org_a, 'scr-dec-reject');
  r := pg_temp._scr_cmd('reject_cash_receipt', jsonb_build_object(
    'command_id', 'scr-dec-rej', 'charge_id', c.id, 'expected_charge_version', c.version,
    'reason_code', 'no_receipt'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dec-reject');
  RESET ROLE;
  IF v_row -> 'decision' ->> 'kind' <> 'receipt_rejected'
     OR jsonb_typeof(v_row -> 'decision' -> 'undo') = 'object' THEN
    RAISE EXCEPTION 's3 receipt_rejected';
  END IF;

  c := pg_temp._scr_ch(v_org_a, 'scr-dupconf-b');
  r := pg_temp._scr_cmd('confirm_duplicate', jsonb_build_object(
    'command_id', 'scr-dup-conf', 'charge_id', c.id,
    'other_charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dupconf-a')).id,
    'expected_charge_version', c.version,
    'expected_other_version', (pg_temp._scr_ch(v_org_a, 'scr-dupconf-a')).version));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_row := pg_temp._scr_desk_row(public.toll_v2_week_desk(v_week), v_org_a, 'scr-dupconf-b');
  RESET ROLE;
  IF v_row -> 'decision' ->> 'kind' <> 'duplicate'
     OR jsonb_typeof(v_row -> 'decision' -> 'undo') = 'object' THEN
    RAISE EXCEPTION 's3 duplicate';
  END IF;
  -- P3-R4: a duplicate a person confirmed shows who and when.
  IF v_row -> 'decision' ->> 'at' IS NULL OR v_row -> 'decision' ->> 'by' IS NULL THEN
    RAISE EXCEPTION 's3 confirmed duplicate has no decider: %', v_row -> 'decision';
  END IF;

  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 4. Paybacks / kept ══
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'paybacks') x
    WHERE x ->> 'reference' = 'trip:scr-orphan'
  ) THEN
    RAISE EXCEPTION 's4 orphan payback';
  END IF;
  p := pg_temp._scr_pb(v_org_a, 'trip:scr-orphan');
  r := pg_temp._scr_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'scr-kept', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'no_toll'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'paybacks') x WHERE x ->> 'reference' = 'trip:scr-orphan') THEN
    RAISE EXCEPTION 's4 left paybacks';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'kept') k WHERE k ->> 'paybackId' = p.id::text) THEN
    RAISE EXCEPTION 's4 kept';
  END IF;
  SELECT k -> 'undo' INTO v_undo FROM jsonb_array_elements(v_desk -> 'kept') k WHERE k ->> 'paybackId' = p.id::text;
  IF v_undo IS NULL THEN RAISE EXCEPTION 's4 kept undo'; END IF;
  PERFORM pg_temp._scr_cmd('undo_decision', v_undo || jsonb_build_object('command_id', 'scr-undo-kept'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'paybacks') x WHERE x ->> 'reference' = 'trip:scr-orphan') THEN
    RAISE EXCEPTION 's4 undo restored payback';
  END IF;
  p := pg_temp._scr_pb(v_org_a, 'trip:scr-orphan');
  PERFORM pg_temp._scr_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 'scr-kept2', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'no_toll'));

  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 5. Numbers agree ══
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  v_j := toll_system.week_result(v_org_a, v_week);
  IF v_desk -> 'result' IS DISTINCT FROM v_j THEN
    RAISE EXCEPTION 's5 result mismatch';
  END IF;
  SELECT count(*)::int INTO v_cnt FROM toll_system.seal_blockers(v_org_a, v_week);
  IF jsonb_array_length(v_desk -> 'blockers') <> v_cnt THEN
    RAISE EXCEPTION 's5 blockers count';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'blockers') d
    WHERE NOT EXISTS (
      SELECT 1 FROM toll_system.seal_blockers(v_org_a, v_week) b
      WHERE b.kind = d ->> 'kind' AND b.id::text = d ->> 'id'
    )
  ) THEN
    RAISE EXCEPTION 's5 blockers row';
  END IF;
  SELECT coalesce(sum((x ->> 'amountMinor')::bigint), 0) INTO v_sum
  FROM jsonb_array_elements(v_desk -> 'charges') x
  WHERE (x ->> 'state') NOT IN ('rejected', 'duplicate', 'unverified');
  v_exp := coalesce((v_j -> 'spend' ->> 'totalMinor')::bigint, 0);
  IF v_sum <> v_exp THEN
    RAISE EXCEPTION 's5 spend sum % vs %', v_sum, v_exp;
  END IF;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 9. Import reports (before seal clears noisy state) ══
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_imps := public.toll_v2_import_reports(v_week);
  RESET ROLE;
  IF jsonb_array_length(v_imps) < 3 THEN RAISE EXCEPTION 's9 import count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_imps) i WHERE i ->> 'kind' = 'tag_statement') THEN
    RAISE EXCEPTION 's9 tag';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_imps) i WHERE i ->> 'kind' = 'topups') THEN
    RAISE EXCEPTION 's9 topups';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_imps) i WHERE i ->> 'kind' = 'uber') THEN
    RAISE EXCEPTION 's9 uber';
  END IF;
  -- P3-R4: every used tag / top-up row carries its amount ("12 tolls read · J$4,250.00").
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_imps) i, jsonb_array_elements(i -> 'report') rep
    WHERE i ->> 'kind' IN ('tag_statement', 'topups') AND rep ->> 'status' IN ('new', 'unchanged')
      AND (rep ->> 'amount_minor') IS NULL
  ) THEN
    RAISE EXCEPTION 's9 report row without amount_minor';
  END IF;
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.toll_v2_import_reports(v_week)) i
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(i -> 'report') rep WHERE rep ->> 'ref' = 'scr-other-wk')
  ) THEN
    RAISE EXCEPTION 's9 other week import listed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.toll_v2_import_reports(v_week2)) i
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(i -> 'report') rep WHERE rep ->> 'ref' = 'scr-other-wk')
  ) THEN
    RAISE EXCEPTION 's9 other week import missing on its week';
  END IF;
  RESET ROLE;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ resolve remaining + 6. Seal ══
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-sure', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-sure')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-sure')).version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-likely', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-likely')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-likely')).version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-pick', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-pick')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-pick')).version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-notrip', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-notrip')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-notrip')).version));
  PERFORM pg_temp._scr_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 'scr-seal-rcpt', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-receipt')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-receipt')).version));
  c := pg_temp._scr_ch(v_org_a, 'scr-receipt');
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-rcpt2', 'charge_id', c.id, 'expected_charge_version', c.version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-alsoa', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-also-a')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-also-a')).version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-alsob', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-also-b')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-also-b')).version));
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-dup-tag', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-tag')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-tag')).version));
  PERFORM pg_temp._scr_cmd('release_duplicate', jsonb_build_object(
    'command_id', 'scr-seal-rel', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-cash')).id,
    'other_charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-tag')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-cash')).version,
    'expected_other_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-tag')).version));
  c := pg_temp._scr_ch(v_org_a, 'scr-dup-cash');
  IF toll_system.charge_state(v_org_a, c.id) = 'unverified' THEN
    PERFORM pg_temp._scr_cmd('verify_cash_receipt', jsonb_build_object(
      'command_id', 'scr-seal-dcash-v', 'charge_id', c.id, 'expected_charge_version', c.version));
    c := pg_temp._scr_ch(v_org_a, 'scr-dup-cash');
    PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'scr-seal-dcash', 'charge_id', c.id, 'expected_charge_version', c.version));
  ELSIF toll_system.charge_state(v_org_a, c.id) = 'pending' THEN
    PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'scr-seal-dcash', 'charge_id', c.id, 'expected_charge_version', c.version));
  END IF;
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-dconf-a', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dupconf-a')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dupconf-a')).version));
  IF toll_system.charge_state(v_org_a, (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-cash')).id) = 'unverified' THEN
    PERFORM pg_temp._scr_cmd('release_duplicate', jsonb_build_object(
      'command_id', 'scr-seal-rel-pair', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-cash')).id,
      'other_charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-tag')).id,
      'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-cash')).version,
      'expected_other_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-tag')).version));
    c := pg_temp._scr_ch(v_org_a, 'scr-dup-pair-cash');
    PERFORM pg_temp._scr_cmd('verify_cash_receipt', jsonb_build_object(
      'command_id', 'scr-seal-pcash-v', 'charge_id', c.id, 'expected_charge_version', c.version));
    c := pg_temp._scr_ch(v_org_a, 'scr-dup-pair-cash');
    PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'scr-seal-pcash', 'charge_id', c.id, 'expected_charge_version', c.version));
  END IF;
  IF toll_system.charge_state(v_org_a, (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-tag')).id) = 'pending' THEN
    PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'scr-seal-pair-tag', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-tag')).id,
      'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-dup-pair-tag')).version));
  END IF;
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-count', 'charge_id', (pg_temp._scr_ch(v_org_a, 'scr-count-pend')).id,
    'expected_charge_version', (pg_temp._scr_ch(v_org_a, 'scr-count-pend')).version));
  c := pg_temp._scr_ch(v_org_a, 'scr-seal-ref');
  PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'scr-seal-ref', 'charge_id', c.id, 'expected_charge_version', c.version));

  FOR p IN
    SELECT * FROM toll.paybacks
    WHERE organization_id = v_org_a AND week_key = v_week
      AND toll_system.payback_open_minor(v_org_a, id) > 0
  LOOP
    PERFORM pg_temp._scr_cmd('leave_payback_unlinked', jsonb_build_object(
      'command_id', 'scr-seal-pb-' || left(p.id::text, 8),
      'payback_id', p.id, 'expected_payback_version', p.version,
      'reason_code', 'seal_prep'));
    p := pg_temp._scr_pb(v_org_a, p.reference);
  END LOOP;
  LOOP
    SELECT * INTO c FROM toll.charges ch
    WHERE ch.organization_id = v_org_a
      AND toll_system.charge_counted_week(v_org_a, ch.id, ch.week_key) = v_week
      AND toll_system.charge_state(v_org_a, ch.id) = 'pending'
    LIMIT 1;
    EXIT WHEN NOT FOUND;
    PERFORM pg_temp._scr_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 'scr-seal-pend-' || left(c.id::text, 8),
      'charge_id', c.id, 'expected_charge_version', c.version));
  END LOOP;
  FOR v_dr IN
    SELECT * FROM toll.duplicate_reviews
    WHERE organization_id = v_org_a AND status = 'open'
  LOOP
    PERFORM pg_temp._scr_cmd('release_duplicate', jsonb_build_object(
      'command_id', 'scr-seal-rel-' || left(v_dr.id::text, 8),
      'charge_id', v_dr.charge_a, 'other_charge_id', v_dr.charge_b,
      'expected_charge_version', (SELECT version FROM toll.charges WHERE id = v_dr.charge_a),
      'expected_other_version', (SELECT version FROM toll.charges WHERE id = v_dr.charge_b)));
  END LOOP;

  PERFORM pg_temp._scr_cmd('seal_week', jsonb_build_object(
    'command_id', 'scr-seal', 'week_key', v_week,
    'expected_week_version', toll_system.week_version(v_org_a, v_week)));

  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF NOT (v_desk ->> 'sealed')::boolean THEN RAISE EXCEPTION 's6 sealed'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') x
    WHERE jsonb_typeof(x -> 'decision' -> 'undo') = 'object'
  ) THEN
    RAISE EXCEPTION 's6 undo null when sealed';
  END IF;
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_weeks := public.toll_v2_weeks();
  RESET ROLE;
  SELECT w INTO v_wk FROM jsonb_array_elements(v_weeks -> 'weeks') w WHERE w ->> 'weekKey' = v_week::text;
  IF NOT (v_wk ->> 'sealed')::boolean OR (v_wk ->> 'toDecide')::int <> 0 THEN
    RAISE EXCEPTION 's6 weeks sealed toDecide';
  END IF;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 7. Late items ══
  RESET ROLE;
  PERFORM public.toll_sys_import(v_org_a, 'tag_statement', '[
    {"source_ref":"scr-late-ch","occurred_at":"2024-11-06T17:00:00-05:00","amount_minor":2200,"plaza_id":"pzS","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'scr-late-ch-imp', 'smoke');
  PERFORM public.toll_sys_import(v_org_a, 'uber', '[
    {"row_type":"trip","platform_trip_id":"scr-late-pb","driver_id":"d1","vehicle_id":"v1",
     "request_at":"2024-11-06T17:30:00-05:00","dropoff_at":"2024-11-06T18:00:00-05:00",
     "payment_method":"card","toll_payback_minor":1800}
  ]'::jsonb, 'scr-late-pb-imp', 'smoke');
  c := pg_temp._scr_ch(v_org_a, 'scr-seal-ref');
  INSERT INTO toll.charge_changes (organization_id, charge_id, field, old_value, new_value, pending, decision_id)
  SELECT v_org_a, c.id, 'amount_minor', c.amount_minor::text, (c.amount_minor + 500)::text, true,
    (SELECT id FROM toll.decisions WHERE organization_id = v_org_a AND command_id = 'scr-seal' LIMIT 1);
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'late') x WHERE x ->> 'kind' = 'late_charge') THEN
    RAISE EXCEPTION 's7 late_charge';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'late') x WHERE x ->> 'kind' = 'late_payback') THEN
    RAISE EXCEPTION 's7 late_payback';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'late') x
    WHERE x ->> 'kind' = 'correction' AND x ->> 'direction' IN ('up', 'down')
  ) THEN
    RAISE EXCEPTION 's7 correction';
  END IF;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  -- ══ 8. Take-backs ══
  RESET ROLE;
  PERFORM public.toll_sys_import(v_org_a, 'uber', '[
    {"row_type":"adjustment","reference":"scr-tb-1","driver_id":"d1","paid_on":"2024-11-07","amount_minor":-8000}
  ]'::jsonb, 'scr-tb-imp', 'smoke');
  SELECT count(*)::int INTO v_cnt FROM toll.reported_take_backs
  WHERE organization_id = v_org_a AND reference = 'scr-tb-1' AND amount_minor = 8000;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 's8 reported_take_backs'; END IF;
  SELECT d.response -> 'report' INTO v_j FROM toll.decisions d
  WHERE d.organization_id = v_org_a AND d.command_id = 'scr-tb-imp' LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_j) rep
    WHERE rep ->> 'ref' = 'scr-tb-1' AND rep ->> 'driver_id' = 'd1' AND rep ? 'paid_on'
  ) THEN
    RAISE EXCEPTION 's8 import report driver paid_on';
  END IF;
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_weeks := public.toll_v2_weeks();
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_weeks -> 'takeBacks') t
    WHERE t ->> 'reference' = 'scr-tb-1' AND jsonb_array_length(t -> 'candidates') >= 1
  ) THEN
    RAISE EXCEPTION 's8 takeBacks list';
  END IF;
  SELECT count(*)::int INTO v_tb_cnt FROM toll.reported_take_backs WHERE organization_id = v_org_a AND reference = 'scr-tb-1';
  PERFORM public.toll_sys_import(v_org_a, 'uber', '[
    {"row_type":"adjustment","reference":"scr-tb-1","driver_id":"d1","paid_on":"2024-11-07","amount_minor":-8000}
  ]'::jsonb, 'scr-tb-imp-dup', 'smoke');
  IF (SELECT count(*) FROM toll.reported_take_backs WHERE organization_id = v_org_a AND reference = 'scr-tb-1') <> v_tb_cnt THEN
    RAISE EXCEPTION 's8 duplicate import row';
  END IF;
  v_tw := ledger.jamaica_week_start(now()) + 7;
  RESET ROLE;
  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (v_org_a, 'd1', v_week, 'pay', 100, 'scr-tb-week-paid', 'posted');
  p := pg_temp._scr_pb(v_org_a, 'trip:scr-tb-cand');
  r := pg_temp._scr_cmd('carry_forward', jsonb_build_object(
    'command_id', 'scr-tb-cf', 'from_week', v_week, 'to_week', v_tw, 'kind', 'take_back',
    'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'scr-tb-1', 'paid_on', '2024-11-07', 'bearer', 'fleet'));
  PERFORM pg_temp._scr_as(v_owner, v_org_a);
  v_weeks := public.toll_v2_weeks();
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_weeks -> 'takeBacks') t WHERE t ->> 'reference' = 'scr-tb-1') THEN
    RAISE EXCEPTION 's8 take_back recorded still listed';
  END IF;
  PERFORM pg_temp._scr_nightly_ok(v_org_a);

  RAISE NOTICE 'toll_v2_screen_reads: all sections passed';
END;
$$;

ROLLBACK;
