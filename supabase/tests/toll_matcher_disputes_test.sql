-- Toll S2a: matcher opens and settles disputes (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('a2a01111-1111-4111-8111-111111111111'::uuid, 's2a-mgr@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'a2a11111-1111-4111-8111-111111111101',
  'a2a01111-1111-4111-8111-111111111111',
  'Toll S2a Matcher Disputes',
  'toll-s2a-matcher',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes)
VALUES ('a2a11111-1111-4111-8111-111111111101', true, true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true, toll_disputes = true;

SELECT toll_system.ensure_accounts('a2a11111-1111-4111-8111-111111111101');

CREATE OR REPLACE FUNCTION pg_temp._s2_org() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'a2a11111-1111-4111-8111-111111111101'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s2_owner() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'a2a01111-1111-4111-8111-111111111111'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s2_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._s2_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s2_as(pg_temp._s2_owner(), pg_temp._s2_org());
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._s2_refused(p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._s2_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's2a expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's2a expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._s2_ch(p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges
  WHERE organization_id = pg_temp._s2_org() AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._s2_pb(p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks
  WHERE organization_id = pg_temp._s2_org() AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._s2_bal(p_suffix text) RETURNS bigint
LANGUAGE sql AS $b$
  SELECT coalesce(
    (SELECT balance_minor FROM ledger.accounts
     WHERE account_key = 'org:a2a11111-1111-4111-8111-111111111101:toll:' || p_suffix),
    0);
$b$;

CREATE OR REPLACE FUNCTION pg_temp._s2_alloc_ok(p_charge uuid) RETURNS void
LANGUAGE plpgsql AS $ok$
DECLARE v_amt bigint; v_sum bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.charges
  WHERE organization_id = pg_temp._s2_org() AND id = p_charge;
  SELECT coalesce(sum(amount_minor), 0) INTO v_sum FROM toll.allocations
  WHERE organization_id = pg_temp._s2_org() AND charge_id = p_charge AND reversed_by IS NULL;
  IF v_sum <> v_amt THEN
    RAISE EXCEPTION 'alloc sum % <> charge %', v_sum, v_amt;
  END IF;
END;
$ok$;

CREATE OR REPLACE FUNCTION pg_temp._s2_assert_nightly() RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM toll_system.nightly_checks(pg_temp._s2_org()) LOOP
    IF NOT r.ok THEN
      RAISE EXCEPTION 'nightly % (check %) %', r.name, r.check_no, r.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._s2_week_hash(p_week date) RETURNS text
LANGUAGE sql AS $h$
  SELECT coalesce(md5(string_agg(
    e.id::text || ':' || e.amount_minor::text || ':' || coalesce(e.metadata ->> 'toll_rule', ''),
    '|' ORDER BY e.id)), '')
  FROM ledger.entries e
  WHERE e.organization_id = pg_temp._s2_org() AND e.reference_type = 'toll'
    AND (e.metadata ->> 'toll_week')::date = p_week;
$h$;

CREATE OR REPLACE FUNCTION pg_temp._s2_import(
  p_suffix text, p_week date, p_charge bigint DEFAULT 39000, p_pb bigint DEFAULT 37000,
  p_trip_id text DEFAULT NULL, p_ch_ref text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $imp$
DECLARE
  v_trip text := coalesce(p_trip_id, 's2a-trip-' || p_suffix);
  v_ch   text := coalesce(p_ch_ref, 's2a-ch-' || p_suffix);
  v_occurred timestamptz := ((p_week + 2) + time '14:00') AT TIME ZONE 'America/Jamaica';
  v_trip_at  timestamptz := ((p_week + 1) + time '15:00') AT TIME ZONE 'America/Jamaica';
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s2_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s2a-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":%s}]'::text,
    v_trip, v_trip_at, v_trip_at + interval '40 minutes', p_pb)::jsonb,
    's2a-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s2_org(), 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":%s,"plaza_id":"s2a-pz",
      "vehicle_id":"v1","driver_id":"s2a-d1"}]'::text,
    v_ch, v_occurred, p_charge)::jsonb,
    's2a-tag-' || p_suffix, 'smoke');
END;
$imp$;

CREATE OR REPLACE FUNCTION pg_temp._s2_seed_settings(p_week date) RETURNS void
LANGUAGE plpgsql AS $seed$
BEGIN
  DELETE FROM toll.platform_settings WHERE organization_id = pg_temp._s2_org();
  DELETE FROM toll.dispute_policy WHERE organization_id = pg_temp._s2_org();
  PERFORM pg_temp._s2_cmd('approve_settings_seed', jsonb_build_object(
    'command_id', 's2a-seed', 'note', 's2a matcher test seed',
    'self_approval_reason', 'twelve chars'));
  PERFORM pg_temp._s2_cmd('change_toll_settings', jsonb_build_object(
    'command_id', 's2a-rate-370', 'note', 'uber platform refund rate',
    'self_approval_reason', 'twelve chars',
    'plaza_rates_add', jsonb_build_array(jsonb_build_object(
      'plaza_id', 's2a-pz', 'platform', 'uber', 'rate_minor', 37000,
      'effective_from', p_week::text))));
END;
$seed$;

CREATE OR REPLACE FUNCTION pg_temp._s2_inputs(p_charge uuid, p_payback uuid, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql AS $i$
  SELECT jsonb_build_object(
    'engine_version', 'toll-matcher-v2',
    'config', jsonb_build_object('note', 's2a-sql-test')
  ) || p_extra || jsonb_build_object(
    'charge', jsonb_build_object('id', p_charge::text),
    'payback', jsonb_build_object('id', p_payback::text)
  );
$i$;

CREATE OR REPLACE FUNCTION pg_temp._s2_cand(
  p_charge uuid, p_payback uuid, p_open boolean DEFAULT false, p_settle boolean DEFAULT false,
  p_kind text DEFAULT 'payback', p_dispute uuid DEFAULT NULL, p_rules text[] DEFAULT ARRAY['on_trip','amount_exact'])
RETURNS jsonb
LANGUAGE sql AS $ca$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'kind', CASE WHEN p_kind <> 'payback' THEN p_kind ELSE NULL END,
    'dispute_id', p_dispute,
    'charge_id', p_charge,
    'payback_id', p_payback,
    'score', 100,
    'auto_apply', false,
    'score_parts', jsonb_build_object(
      'total', 100,
      'dispute_open_eligible', p_open,
      'dispute_settle_eligible', p_settle,
      'auto_apply', false),
    'rules_fired', to_jsonb(p_rules),
    'inputs', pg_temp._s2_inputs(p_charge, p_payback,
      CASE WHEN p_kind = 'dispute_refund' THEN jsonb_build_object('kind', 'dispute_refund', 'dispute_id', p_dispute::text)
           ELSE '{}'::jsonb END)
  ));
$ca$;

CREATE OR REPLACE FUNCTION pg_temp._s2_match_store(p_cands jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ms$
DECLARE
  v_org  uuid := pg_temp._s2_org();
  v_fc   uuid[];
  v_fp   uuid[];
  v_id   uuid;
  v_claim jsonb;
  v_store jsonb;
BEGIN
  v_fc := array(SELECT DISTINCT (x ->> 'charge_id')::uuid FROM jsonb_array_elements(p_cands) x WHERE x ? 'charge_id');
  v_fp := array(SELECT DISTINCT (x ->> 'payback_id')::uuid FROM jsonb_array_elements(p_cands) x WHERE x ? 'payback_id');
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  FOREACH v_id IN ARRAY v_fc LOOP
    PERFORM toll_system.match_enqueue(v_org, 'charge', v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_fp LOOP
    PERFORM toll_system.match_enqueue(v_org, 'payback', v_id);
  END LOOP;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  IF nullif(v_claim ->> 'claim_id', '') IS NULL THEN
    RAISE EXCEPTION 's2a match claim empty';
  END IF;
  v_store := public.toll_sys_match_store(v_org, (v_claim ->> 'claim_id')::uuid, jsonb_build_object(
    'engine_version', 'toll-matcher-v2', 'candidates', p_cands));
  RESET ROLE;
  RETURN v_store || jsonb_build_object('claim', v_claim);
END;
$ms$;

CREATE OR REPLACE FUNCTION pg_temp._s2_claim_only(p_charge uuid, p_payback uuid) RETURNS jsonb
LANGUAGE plpgsql AS $co$
DECLARE v_org uuid := pg_temp._s2_org(); v_claim jsonb;
BEGIN
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  PERFORM toll_system.match_enqueue(v_org, 'charge', p_charge);
  PERFORM toll_system.match_enqueue(v_org, 'payback', p_payback);
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  RESET ROLE;
  RETURN v_claim;
END;
$co$;

CREATE OR REPLACE FUNCTION pg_temp._s2_adj(
  p_ref text, p_minor bigint DEFAULT 2000, p_paid date DEFAULT NULL)
RETURNS toll.paybacks
LANGUAGE plpgsql AS $adj$
DECLARE v_paid date := coalesce(p_paid, (now() AT TIME ZONE 'America/Jamaica')::date);
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s2_org(), 'uber', format(
    '[{"row_type":"adjustment","reference":"%s","driver_id":"s2a-d1","paid_on":"%s","amount_minor":%s}]',
    p_ref, v_paid, p_minor)::jsonb, 's2a-adj-' || p_ref, 'smoke');
  RETURN pg_temp._s2_pb(p_ref);
END;
$adj$;

DO $$
DECLARE
  v_org       uuid := pg_temp._s2_org();
  v_week      date;
  v_claim     jsonb;
  v_store     jsonb;
  v_r         jsonb;
  c           toll.charges;
  p           toll.paybacks;
  p2          toll.paybacks;
  d           toll.disputes;
  v_dispute   uuid;
  v_sug       uuid;
  v_link_dec  uuid;
  v_opened    int;
  v_settled   int;
  v_cnt       int;
  v_hash_pre  text;
  v_hash_post text;
  v_snap      jsonb;
  v_drv_sum   bigint;
BEGIN
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '21 days');
  PERFORM pg_temp._s2_import('seed', v_week);
  PERFORM pg_temp._s2_seed_settings(v_week);
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 1. Switch off: no bundle keys; store eligible does nothing; link opens nothing ──
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org;
  PERFORM pg_temp._s2_import('sw-off', v_week + 7);
  c := pg_temp._s2_ch('s2a-ch-sw-off');
  p := pg_temp._s2_pb('trip:s2a-trip-sw-off');
  v_claim := pg_temp._s2_claim_only(c.id, p.id);
  IF v_claim ? 'rates' OR v_claim ? 'disputes' THEN
    RAISE EXCEPTION '1 bundle must not carry rates/disputes when switch off';
  END IF;
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  IF coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '1 store opened when switch off';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id) THEN
    RAISE EXCEPTION '1 dispute opened when switch off';
  END IF;
  v_r := pg_temp._s2_cmd('link_payback', jsonb_build_object(
    'command_id', 's2a-sw-link', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  IF EXISTS (SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id AND close_reason IS DISTINCT FROM 'undo') THEN
    RAISE EXCEPTION '1 person link opened dispute when switch off';
  END IF;
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 2. Done-test 1: matcher links J$370 and opens J$20 to_send dispute; replay ──
  -- The trip is 2 days ago (p_week + 1), so the 9-day window is open on any weekday (was v_week + 14: the trip
  -- fell 6-12 days back and the dispute opened as expired from Thursday to Sunday).
  PERFORM pg_temp._s2_import('dt1', (now() AT TIME ZONE 'America/Jamaica')::date - 3);
  c := pg_temp._s2_ch('s2a-ch-dt1');
  p := pg_temp._s2_pb('trip:s2a-trip-dt1');
  v_claim := pg_temp._s2_claim_only(c.id, p.id);
  IF NOT (v_claim ? 'rates') OR jsonb_array_length(coalesce(v_claim -> 'rates', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION '2 bundle missing rates';
  END IF;
  IF NOT (v_claim ? 'disputes') THEN
    RAISE EXCEPTION '2 bundle missing disputes key';
  END IF;
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  IF coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 1 THEN
    RAISE EXCEPTION '2 matcher did not open dispute %', v_store;
  END IF;
  c := pg_temp._s2_ch('s2a-ch-dt1');
  IF toll_system.charge_state(v_org, c.id) <> 'decided' THEN
    RAISE EXCEPTION '2 charge not decided';
  END IF;
  IF pg_temp._s2_bal('receivable_platform_dispute') <> -2000 THEN
    RAISE EXCEPTION '2 rpd got %', pg_temp._s2_bal('receivable_platform_dispute');
  END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  IF coalesce((v_store ->> 'unchanged')::int, 0) < 1
     OR coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '2 replay changed %', v_store;
  END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 3. Ambiguous charge: suggestion only, apply_suggestion opens auto-dispute ──
  PERFORM pg_temp._s2_import('dt3a', v_week + 21, 39000, 37000, 's2a-trip-dt3', 's2a-ch-dt3a');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s2a-ch-dt3b","occurred_at":"%s","amount_minor":39000,"plaza_id":"s2a-pz",
      "vehicle_id":"v1","driver_id":"s2a-d1"}]',
    (((v_week + 21) + 2) + time '14:05') AT TIME ZONE 'America/Jamaica')::jsonb, 's2a-tag-dt3b', 'smoke');
  c := pg_temp._s2_ch('s2a-ch-dt3a');
  p := pg_temp._s2_pb('trip:s2a-trip-dt3');
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false),
    pg_temp._s2_cand((pg_temp._s2_ch('s2a-ch-dt3b')).id, p.id, false)));
  IF coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '3 ambiguous opened without apply';
  END IF;
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org AND charge_id = c.id AND payback_id = p.id AND superseded_by IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF v_sug IS NULL THEN RAISE EXCEPTION '3 no suggestion'; END IF;
  c := pg_temp._s2_ch('s2a-ch-dt3a');
  p := pg_temp._s2_pb('trip:s2a-trip-dt3');
  v_r := pg_temp._s2_cmd('apply_suggestion', jsonb_build_object(
    'command_id', 's2a-dt3-apply', 'suggestion_id', v_sug,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  IF NOT EXISTS (SELECT 1 FROM toll.decisions WHERE organization_id = v_org AND command_id LIKE 'auto-dispute:%') THEN
    RAISE EXCEPTION '3 missing auto-dispute';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id
      AND state = 'to_send' AND close_reason IS DISTINCT FROM 'undo') THEN
    RAISE EXCEPTION '3 dispute not opened on apply';
  END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 4. Dispute first: no apply while charge is disputed ──
  PERFORM pg_temp._s2_import('dt4', v_week + 28);
  c := pg_temp._s2_ch('s2a-ch-dt4');
  p := pg_temp._s2_pb('trip:s2a-trip-dt4');
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT id INTO v_dispute FROM toll.disputes
  WHERE organization_id = v_org AND charge_id = c.id AND close_reason IS DISTINCT FROM 'undo';
  c := pg_temp._s2_ch('s2a-ch-dt4');
  p := pg_temp._s2_pb('trip:s2a-trip-dt4');
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  IF coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '4 opened second dispute';
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.suggestions s
    WHERE s.organization_id = v_org AND s.charge_id = c.id AND s.payback_id = p.id
      AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired))) THEN
    SELECT id INTO v_sug FROM toll.suggestions
    WHERE organization_id = v_org AND charge_id = c.id AND payback_id = p.id AND superseded_by IS NULL
    ORDER BY created_at DESC LIMIT 1;
    PERFORM pg_temp._s2_refused('apply_suggestion', jsonb_build_object(
      'command_id', 's2a-dt4-apply', 'suggestion_id', v_sug,
      'expected_charge_version', c.version, 'expected_payback_version', p.version), 'WRONG_STATE');
  END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 5. Sent dispute: adjustment settles (open + sealed); outside window no settle ──
  PERFORM pg_temp._s2_import('dt5', v_week + 35);
  c := pg_temp._s2_ch('s2a-ch-dt5');
  p := pg_temp._s2_pb('trip:s2a-trip-dt5');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  v_r := pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt5-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_adj('s2a-adj-dt5-p1', 2000);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 1 THEN
    RAISE EXCEPTION '5 period1 settle %', v_store;
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION '5 won expected got %', d.state; END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- 5b second period on fresh dispute
  PERFORM pg_temp._s2_import('dt5b', v_week + 42);
  c := pg_temp._s2_ch('s2a-ch-dt5b');
  p := pg_temp._s2_pb('trip:s2a-trip-dt5b');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt5b-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_adj('s2a-adj-dt5-p2', 2000, (now() AT TIME ZONE 'America/Jamaica')::date + 7);
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION '5b won %', d.state; END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- 5c sealed charge week. The charge sits in a week that has already ended (v_week - 7, so it can be
  -- sealed on any day the test runs); the trip and payback are earlier this week, so the dispute is
  -- inside its 9-day window. (Review: v_week + 49 is a future week, which seal_week refuses.)
  PERFORM public.toll_sys_import(pg_temp._s2_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"s2a-trip-dt5c","driver_id":"s2a-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":37000}]'::text,
    (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')
      + (now() - (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')) / 2,
    (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')
      + (now() - (((v_week + 21) + time '00:00') AT TIME ZONE 'America/Jamaica')) * 3 / 4)::jsonb,
    's2a-uber-dt5c', 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s2_org(), 'tag_statement', format(
    '[{"source_ref":"s2a-ch-dt5c","occurred_at":"%s","amount_minor":39000,"plaza_id":"s2a-pz",
      "vehicle_id":"v1","driver_id":"s2a-d1"}]'::text,
    ((v_week - 5) + time '14:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's2a-tag-dt5c', 'smoke');
  c := pg_temp._s2_ch('s2a-ch-dt5c');
  p := pg_temp._s2_pb('trip:s2a-trip-dt5c');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt5c-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  v_hash_pre := pg_temp._s2_week_hash(toll_system.charge_counted_week(v_org, c.id, c.week_key));
  PERFORM pg_temp._s2_cmd('seal_week', jsonb_build_object(
    'command_id', 's2a-dt5c-seal', 'week_key', toll_system.charge_counted_week(v_org, c.id, c.week_key),
    'expected_week_version', toll_system.week_version(v_org, toll_system.charge_counted_week(v_org, c.id, c.week_key))));
  p := pg_temp._s2_adj('s2a-adj-dt5c', 2000);
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  v_hash_post := pg_temp._s2_week_hash(toll_system.charge_counted_week(v_org, c.id, c.week_key));
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION '5c sealed ledger changed'; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION '5c won %', d.state; END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- review 5d: Uber takes back the refund that won the sealed-week dispute (R7, sealed charge week) →
  -- a new sent row owes J$20 again, the sealed week's ledger stays byte-identical, every check passes.
  p := pg_temp._s2_pb('s2a-adj-dt5c');
  v_snap := jsonb_build_object('rpd', toll_system.natural_balance(v_org, 'toll:receivable_platform_dispute'));
  v_hash_pre := pg_temp._s2_week_hash(toll_system.charge_counted_week(v_org, c.id, c.week_key));
  PERFORM pg_temp._s2_cmd('reverse_payback', jsonb_build_object(
    'command_id', 's2a-dt5c-rev', 'payback_id', p.id,
    'expected_payback_version', p.version, 'reference', 'rev-dt5c',
    'paid_on', (now() AT TIME ZONE 'America/Jamaica')::date));
  IF NOT EXISTS (SELECT 1 FROM toll.disputes x WHERE x.organization_id = v_org AND x.reopens_id = d.id
                   AND x.state = 'sent' AND x.owed_minor = 2000) THEN
    RAISE EXCEPTION '5d sealed take-back: no reopened sent row';
  END IF;
  IF toll_system.natural_balance(v_org, 'toll:receivable_platform_dispute') <> (v_snap ->> 'rpd')::bigint + 2000 THEN
    RAISE EXCEPTION '5d sealed take-back: Uber does not owe J$20 again';
  END IF;
  IF pg_temp._s2_week_hash(toll_system.charge_counted_week(v_org, c.id, c.week_key)) IS DISTINCT FROM v_hash_pre THEN
    RAISE EXCEPTION '5d sealed week ledger changed';
  END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- 5 outside refund window
  PERFORM pg_temp._s2_import('dt5out', v_week + 56);
  c := pg_temp._s2_ch('s2a-ch-dt5out');
  p := pg_temp._s2_pb('trip:s2a-trip-dt5out');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt5out-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_adj('s2a-adj-dt5out', 2000, '2099-01-01'::date);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 0 THEN
    RAISE EXCEPTION '5 outside window settled';
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'sent' THEN RAISE EXCEPTION '5 outside state %', d.state; END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 6. Ambiguous refund: two sent disputes, one adjustment ──
  PERFORM pg_temp._s2_import('dt6a', v_week + 63, 39000, 37000, 's2a-trip-6a', 's2a-ch-dt6a');
  PERFORM pg_temp._s2_import('dt6b', v_week + 63, 39000, 37000, 's2a-trip-6b', 's2a-ch-dt6b');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(
    (pg_temp._s2_ch('s2a-ch-dt6a')).id, (pg_temp._s2_pb('trip:s2a-trip-6a')).id, true)));
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(
    (pg_temp._s2_ch('s2a-ch-dt6b')).id, (pg_temp._s2_pb('trip:s2a-trip-6b')).id, true)));
  SELECT x.id INTO v_dispute FROM toll.disputes x
  WHERE x.organization_id = v_org AND x.charge_id = (pg_temp._s2_ch('s2a-ch-dt6a')).id LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt6a-sent', 'dispute_id', v_dispute,
    'expected_dispute_version', (SELECT version FROM toll.disputes WHERE id = v_dispute)));
  SELECT x.id INTO v_dispute FROM toll.disputes x
  WHERE x.organization_id = v_org AND x.charge_id = (pg_temp._s2_ch('s2a-ch-dt6b')).id LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt6b-sent', 'dispute_id', v_dispute,
    'expected_dispute_version', (SELECT version FROM toll.disputes WHERE id = v_dispute)));
  p := pg_temp._s2_adj('s2a-adj-dt6', 2000);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand((pg_temp._s2_ch('s2a-ch-dt6a')).id, p.id, false, false, 'dispute_refund',
      (SELECT id FROM toll.disputes WHERE organization_id = v_org AND charge_id = (pg_temp._s2_ch('s2a-ch-dt6a')).id LIMIT 1),
      ARRAY['refund_window','dispute_refund']),
    pg_temp._s2_cand((pg_temp._s2_ch('s2a-ch-dt6b')).id, p.id, false, false, 'dispute_refund',
      (SELECT id FROM toll.disputes WHERE organization_id = v_org AND charge_id = (pg_temp._s2_ch('s2a-ch-dt6b')).id LIMIT 1),
      ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 0 THEN
    RAISE EXCEPTION '6 ambiguous settled';
  END IF;
  SELECT count(*)::int INTO v_cnt FROM toll.suggestions
  WHERE organization_id = v_org AND payback_id = p.id AND kind = 'dispute_refund' AND superseded_by IS NULL;
  IF v_cnt < 2 THEN RAISE EXCEPTION '6 want two refund suggestions got %', v_cnt; END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 7. Done-test 13: trip_line refund settles; no double cover ──
  PERFORM pg_temp._s2_import('dt7', v_week + 70, 39000, 37000, 's2a-trip-dt7');
  c := pg_temp._s2_ch('s2a-ch-dt7');
  p := pg_temp._s2_pb('trip:s2a-trip-dt7');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt7-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  INSERT INTO toll.paybacks (
    organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
    amount_minor, received_by)
  VALUES (
    v_org, 'uber', 'trip_line', 's2a-trip-dt7', 's2a-late-dt7', 's2a-d1',
    (now() AT TIME ZONE 'America/Jamaica')::date, ledger.jamaica_week_start(now()), 2000, 'fleet')
  RETURNING id INTO p2;
  PERFORM toll_system.post(v_org, 'P4_payback_fleet', 2000, now(), 's2a-dt7-late-pb', 1,
    jsonb_build_object('payback_id', p2.id::text, 'driver_id', 's2a-d1'));
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p2.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 1 THEN
    RAISE EXCEPTION '7 trip refund settle %', v_store;
  END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 8. to_send cannot take refund until sent ──
  PERFORM pg_temp._s2_import('dt8', v_week + 77);
  c := pg_temp._s2_ch('s2a-ch-dt8');
  p := pg_temp._s2_pb('trip:s2a-trip-dt8');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  IF d.state <> 'to_send' THEN RAISE EXCEPTION '8 expected to_send'; END IF;
  p := pg_temp._s2_adj('s2a-adj-dt8', 2000);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 0 THEN
    RAISE EXCEPTION '8 settled while to_send';
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt8-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_pb('s2a-adj-dt8');
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 1 THEN
    RAISE EXCEPTION '8 settle after sent %', v_store;
  END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 9. Expired + adjustment → won, driver reversed in open week ──
  PERFORM pg_temp._s2_import('dt9', v_week + 84);
  c := pg_temp._s2_ch('s2a-ch-dt9');
  p := pg_temp._s2_pb('trip:s2a-trip-dt9');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's2a-dt9-exp', 'dispute_expire', 'user', pg_temp._s2_owner()) RETURNING id INTO v_link_dec;
  PERFORM toll_system.dispute_expire(v_org, d.id, v_link_dec, 's2a-dt9-exp-cmd');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'expired' THEN RAISE EXCEPTION '9 not expired'; END IF;
  v_snap := pg_temp._s2_bal('receivable_driver');
  p := pg_temp._s2_adj('s2a-adj-dt9', 2000);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF coalesce((v_store -> 'actions' ->> 'settled')::int, 0) <> 1 THEN
    RAISE EXCEPTION '9 expired settle %', v_store;
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION '9 won state %', d.state; END IF;
  PERFORM pg_temp._s2_alloc_ok(c.id);
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 10. Undo cascade: to_send undone; sent → DISPUTE_IN_PROGRESS ──
  PERFORM pg_temp._s2_import('dt10', v_week + 91);
  c := pg_temp._s2_ch('s2a-ch-dt10');
  p := pg_temp._s2_pb('trip:s2a-trip-dt10');
  -- review: baseline before the link + dispute, and the link found by its charge (every row in this
  -- one transaction has the same created_at, so "latest" picked another test's link)
  v_snap := jsonb_build_object('rpd', pg_temp._s2_bal('receivable_platform_dispute'));
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT dec.id INTO v_link_dec FROM toll.decisions dec
  WHERE dec.organization_id = v_org AND dec.command_id LIKE 'matcher:link:%'
    AND dec.targets ->> 'charge_id' = c.id::text
  LIMIT 1;
  IF abs(pg_temp._s2_bal('receivable_platform_dispute') - (v_snap ->> 'rpd')::bigint) <> 2000 THEN
    RAISE EXCEPTION '10 dispute did not open with its money: %', v_store -> 'actions';
  END IF;
  c := pg_temp._s2_ch('s2a-ch-dt10');
  p := pg_temp._s2_pb('trip:s2a-trip-dt10');
  PERFORM pg_temp._s2_cmd('undo_decision', jsonb_build_object(
    'command_id', 's2a-dt10-undo', 'decision_id', v_link_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  IF EXISTS (
    SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id
      AND state = 'to_send' AND close_reason IS DISTINCT FROM 'undo') THEN
    RAISE EXCEPTION '10 dispute still active after undo';
  END IF;
  IF pg_temp._s2_bal('receivable_platform_dispute') IS DISTINCT FROM (v_snap ->> 'rpd')::bigint THEN
    RAISE EXCEPTION '10 balances not restored';
  END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- review: after a person undoes the matcher's link, the matcher never re-links that suggestion by
  -- itself (its command id replays). A person links it again, which opens the dispute (auto-dispute:).
  c := pg_temp._s2_ch('s2a-ch-dt10');
  p := pg_temp._s2_pb('trip:s2a-trip-dt10');
  v_store := pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  IF coalesce((v_store -> 'actions' ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '10 matcher re-linked after a person undid it';
  END IF;
  v_r := pg_temp._s2_cmd('link_payback', jsonb_build_object(
    'command_id', 's2a-dt10-relink', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_link_dec := (v_r ->> 'decision_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id
    AND close_reason IS DISTINCT FROM 'undo' ORDER BY created_at DESC LIMIT 1;
  IF d.id IS NULL OR d.state <> 'to_send' THEN RAISE EXCEPTION '10 person relink opened no dispute'; END IF;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt10-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  c := pg_temp._s2_ch('s2a-ch-dt10');
  p := pg_temp._s2_pb('trip:s2a-trip-dt10');
  PERFORM pg_temp._s2_refused('undo_decision', jsonb_build_object(
    'command_id', 's2a-dt10-undo-sent', 'decision_id', v_link_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'DISPUTE_IN_PROGRESS');

  -- ── 11. Take-back reopen: sent → sent; expired → expired; partial link amount ──
  PERFORM pg_temp._s2_import('dt11s', v_week + 98);
  c := pg_temp._s2_ch('s2a-ch-dt11s');
  p := pg_temp._s2_pb('trip:s2a-trip-dt11s');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt11s-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_adj('s2a-adj-dt11s', 2000);
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  c := pg_temp._s2_ch('s2a-ch-dt11s');
  p := pg_temp._s2_pb('s2a-adj-dt11s');
  v_snap := jsonb_build_object('rpd', pg_temp._s2_bal('receivable_platform_dispute'));
  v_r := pg_temp._s2_cmd('reverse_payback', jsonb_build_object(
    'command_id', 's2a-dt11s-rev', 'payback_id', p.id,
    'expected_payback_version', p.version, 'reference', 'rev-dt11s',
    'paid_on', (now() AT TIME ZONE 'America/Jamaica')::date));
  IF NOT EXISTS (
    SELECT 1 FROM toll.disputes x
    WHERE x.organization_id = v_org AND x.reopens_id = d.id AND x.state = 'sent' AND x.owed_minor = 2000) THEN
    RAISE EXCEPTION '11 sent reopen missing';
  END IF;
  IF pg_temp._s2_bal('receivable_platform_dispute') <> (v_snap ->> 'rpd')::bigint - 2000 THEN  -- review: J$20 owed by Uber again (delta, not an absolute)
    RAISE EXCEPTION '11 sent rpd after reopen %', pg_temp._s2_bal('receivable_platform_dispute');
  END IF;
  PERFORM pg_temp._s2_assert_nightly();

  PERFORM pg_temp._s2_import('dt11e', v_week + 105);
  c := pg_temp._s2_ch('s2a-ch-dt11e');
  p := pg_temp._s2_pb('trip:s2a-trip-dt11e');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's2a-dt11e-exp', 'dispute_expire', 'user', pg_temp._s2_owner()) RETURNING id INTO v_link_dec;
  PERFORM toll_system.dispute_expire(v_org, d.id, v_link_dec, 's2a-dt11e-exp-cmd');
  p := pg_temp._s2_adj('s2a-adj-dt11e', 2000);
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  v_drv_sum := toll_system.natural_balance(v_org, 'toll:receivable_driver');
  p := pg_temp._s2_pb('s2a-adj-dt11e');
  PERFORM pg_temp._s2_cmd('reverse_payback', jsonb_build_object(
    'command_id', 's2a-dt11e-rev', 'payback_id', p.id,
    'expected_payback_version', p.version, 'reference', 'rev-dt11e',
    'paid_on', (now() AT TIME ZONE 'America/Jamaica')::date));
  IF NOT EXISTS (
    SELECT 1 FROM toll.disputes x
    WHERE x.organization_id = v_org AND x.reopens_id = d.id AND x.state = 'expired' AND x.owed_minor = 2000) THEN
    RAISE EXCEPTION '11 expired reopen missing';
  END IF;
  IF toll_system.natural_balance(v_org, 'toll:receivable_driver') <> v_drv_sum + 2000 THEN  -- review: natural sign, exact J$20
    RAISE EXCEPTION '11 driver not charged again on expired reopen';
  END IF;

  -- two links on one dispute (two paybacks); reverse one payback → reopen only that link amount
  PERFORM pg_temp._s2_import('dt11two', v_week + 119);
  c := pg_temp._s2_ch('s2a-ch-dt11two');
  p := pg_temp._s2_pb('trip:s2a-trip-dt11two');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt11two-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s2a-adj-two1","driver_id":"s2a-d1","paid_on":"%s","amount_minor":1000},
      {"row_type":"adjustment","reference":"s2a-adj-two2","driver_id":"s2a-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date, (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb,
    's2a-adj-two-imp', 'smoke');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, (pg_temp._s2_pb('s2a-adj-two1')).id, false, true, 'dispute_refund', d.id,
      ARRAY['refund_window','dispute_refund'])));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, (pg_temp._s2_pb('s2a-adj-two2')).id, false, true, 'dispute_refund', d.id,
      ARRAY['refund_window','dispute_refund'])));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION '11two not won %', d.state; END IF;
  v_dispute := d.id;
  p := pg_temp._s2_pb('s2a-adj-two2');
  PERFORM pg_temp._s2_cmd('reverse_payback', jsonb_build_object(
    'command_id', 's2a-dt11two-rev', 'payback_id', p.id,
    'expected_payback_version', p.version, 'reference', 'rev-two2',
    'paid_on', (now() AT TIME ZONE 'America/Jamaica')::date));
  IF NOT EXISTS (
    SELECT 1 FROM toll.disputes x
    WHERE x.organization_id = v_org AND x.reopens_id = v_dispute AND x.owed_minor = 1000) THEN
    RAISE EXCEPTION '11two reopen amount';
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'won' THEN RAISE EXCEPTION '11two old row state changed'; END IF;
  PERFORM pg_temp._s2_assert_nightly();

  -- ── 12. apply_suggestion on dispute_refund → refused ──
  PERFORM pg_temp._s2_import('dt12', v_week + 126);
  c := pg_temp._s2_ch('s2a-ch-dt12');
  p := pg_temp._s2_pb('trip:s2a-trip-dt12');
  PERFORM pg_temp._s2_match_store(jsonb_build_array(pg_temp._s2_cand(c.id, p.id, true)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp._s2_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's2a-dt12-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s2_adj('s2a-adj-dt12', 2000);
  v_store := pg_temp._s2_match_store(jsonb_build_array(
    pg_temp._s2_cand(c.id, p.id, false, false, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org AND kind = 'dispute_refund' AND payback_id = p.id AND superseded_by IS NULL
  ORDER BY created_at DESC LIMIT 1;
  c := pg_temp._s2_ch('s2a-ch-dt12');
  PERFORM pg_temp._s2_refused('apply_suggestion', jsonb_build_object(
    'command_id', 's2a-dt12-apply', 'suggestion_id', v_sug,
    'expected_charge_version', c.version), 'WRONG_STATE');
  PERFORM pg_temp._s2_assert_nightly();

  RAISE NOTICE 'toll_matcher_disputes_test: ok';
END;
$$;

ROLLBACK;