-- Toll v2 P2-R3: matcher queue, claim, store (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('f0111111-1111-4111-8111-111111111111'::uuid, 'toll-match-owner@example.com'),
  ('f0211111-1111-4111-8111-111111111112'::uuid, 'toll-match-owner-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

DO $$
DECLARE
  v_owner     uuid := 'f0111111-1111-4111-8111-111111111111';
  v_owner_b   uuid := 'f0211111-1111-4111-8111-111111111112';
  v_org_a     uuid := 'f1111111-1111-4111-8111-111111111101';
  v_org_b     uuid := 'f2222222-2222-4222-8222-222222222202';
  v_driver    text := 'driver-match-1';
  v_vehicle   text := 'vehicle-match-1';
  v_plaza     text := 'plaza-match-main';
  v_effective timestamptz := '2024-06-10 12:00:00+00';
  v_week0     date;
  v_week      date;
  v_week_seal date;
  v_ev        timestamptz;
  v_resp      jsonb;
  v_claim     jsonb;
  v_store     jsonb;
  v_claim_id  uuid;
  v_claim_id2 uuid;
  v_cnt       int;
  v_cnt2      int;
  v_charge    uuid;
  v_charge_tag uuid;
  v_charge2   uuid;
  v_charge_seal uuid;
  v_payback   uuid;
  v_trip_rec  uuid;
  v_sug       uuid;
  v_sug_old   uuid;
  v_fn_claim  regprocedure := 'public.toll_sys_match_claim(uuid,int)'::regprocedure;
  v_fn_store  regprocedure := 'public.toll_sys_match_store(uuid,uuid,jsonb)'::regprocedure;
  v_fn_pen    regprocedure := 'public.toll_sys_match_pending()'::regprocedure;
  v_inputs    jsonb;
  v_inputs2   jsonb;
  v_result    jsonb;
  v_focal_c   uuid;
  v_focal_p   uuid;
  v_pb_orig   uuid;
  v_open      int;
  v_caught    boolean;
  v_msg       text;
  v_decision  uuid;
  v_driver_scope text := 'driver-scope-1';
  v_vehicle_scope text := 'vehicle-scope-1';
  v_ev_scope  timestamptz;
  v_week_scope date;
  v_week_scope_seal date;
  v_charge_scope_a uuid;
  v_charge_scope_b uuid;
  v_charge_scope_amt uuid;
  v_charge_scope_seal uuid;
  v_pb_scope    uuid;
  v_pb_scope_t1 uuid;
  v_pb_scope_t2 uuid;
  v_pb_scope_amt uuid;
  v_pb_b_co     uuid;
  v_charge_b_co uuid;
  v_alloc_scope uuid;
  v_alloc_rev   uuid;
  v_rem         bigint;
  v_reversed    boolean;
BEGIN
  v_week0 := ledger.jamaica_week_start(v_effective);
  v_week := v_week0 + 7 * 30;
  v_week_seal := v_week0 + 7 * 40;
  v_ev := v_week::timestamptz + time '14:00';

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Match Org A', 'toll-match-a', 'fleet', 'active'),
    (v_org_b, v_owner_b, 'Toll Match Org B', 'toll-match-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.switch_state (organization_id, tolls_v2)
  VALUES (v_org_a, true), (v_org_b, true)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

  PERFORM toll_system.ensure_accounts(v_org_a);
  PERFORM toll_system.ensure_accounts(v_org_b);

  INSERT INTO toll.platform_settings (organization_id, platform, auto_apply, payback_mode)
  VALUES (v_org_a, 'uber', false, 'per_trip')
  ON CONFLICT (organization_id, platform) DO NOTHING;

  CREATE OR REPLACE FUNCTION pg_temp._match_as_owner(p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $o$
  DECLARE v_sub text := coalesce(nullif(current_setting('match.test_user', true), ''), 'f0111111-1111-4111-8111-111111111111');
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub', v_sub,
        'role', 'authenticated',
        'app_metadata', json_build_object('organizationId', p_org::text)
      )::text,
      true
    );
    SET LOCAL ROLE authenticated;
  END;
  $o$;

  CREATE OR REPLACE FUNCTION pg_temp._match_cmd(p_intent text, p_body jsonb) RETURNS jsonb
  LANGUAGE plpgsql AS $c$
  BEGIN
    PERFORM pg_temp._match_as_owner(current_setting('match.test_org')::uuid);
    RETURN public.toll_v2_command(p_intent, p_body);
  END;
  $c$;

  CREATE OR REPLACE FUNCTION pg_temp._match_nightly_ok(p_org uuid) RETURNS void
  LANGUAGE plpgsql AS $n$
  DECLARE r record;
  BEGIN
    RESET ROLE;
    FOR r IN SELECT * FROM toll_system.nightly_checks(p_org) LOOP
      IF NOT r.ok THEN
        RAISE EXCEPTION 'nightly check % % failed: %', r.check_no, r.name, r.detail;
      END IF;
    END LOOP;
  END;
  $n$;

  CREATE OR REPLACE FUNCTION pg_temp._match_inputs(p_charge uuid, p_payback uuid) RETURNS jsonb
  LANGUAGE sql AS $i$
    SELECT jsonb_build_object(
      'engine_version', 'toll-matcher-v1',
      'config', jsonb_build_object('note', 'test'),
      'charge', jsonb_build_object('id', p_charge::text),
      'payback', jsonb_build_object('id', p_payback::text),
      'trip', null,
      'competitors', jsonb_build_object('charge_candidates', 1, 'payback_candidates', 1),
      'auto_apply_setting', false
    );
  $i$;

  CREATE OR REPLACE FUNCTION pg_temp._match_result(
    p_charge uuid, p_payback uuid, p_score int, p_rules text[], p_inputs jsonb
  ) RETURNS jsonb
  LANGUAGE sql AS $r$
    SELECT jsonb_build_object(
      'engine_version', 'toll-matcher-v1',
      'candidates', jsonb_build_array(jsonb_build_object(
        'charge_id', p_charge,
        'payback_id', p_payback,
        'score', p_score,
        'auto_apply', false,
        'score_parts', jsonb_build_object(
          'total', p_score, 'window', 60, 'amount', 30, 'sole_candidate', 10,
          'window_hit', 'on_trip', 'amount_diff_minor', 0, 'minutes_outside_trip', 0
        ),
        'rules_fired', to_jsonb(p_rules),
        'inputs', p_inputs
      ))
    );
  $r$;

  CREATE OR REPLACE FUNCTION pg_temp._match_ids_in_jsonb(p_arr jsonb, p_id uuid) RETURNS boolean
  LANGUAGE sql AS $j$
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(coalesce(p_arr, '[]'::jsonb)) x WHERE x::uuid = p_id
    );
  $j$;

  PERFORM set_config('match.test_org', v_org_a::text, true);

  -- ── 1. Queue: uber toll trip + tag charge ──
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-q-uber',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-uber-1',
      'driver_id', v_driver,
      'vehicle_id', v_vehicle,
      'request_at', v_ev - interval '20 minutes',
      'dropoff_at', v_ev,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  SELECT count(*)::int INTO v_cnt FROM toll.match_queue WHERE organization_id = v_org_a;
  IF v_cnt < 2 THEN
    RAISE EXCEPTION 'q1 uber import queued too few rows: %', v_cnt;
  END IF;

  v_resp := pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-q-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-tag-1',
      'occurred_at', v_ev - interval '10 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle,
      'driver_id', v_driver
    ))
  ));
  SELECT count(*)::int INTO v_cnt2 FROM toll.match_queue WHERE organization_id = v_org_a;
  IF v_cnt2 <= v_cnt THEN
    RAISE EXCEPTION 'q1 tag import did not grow queue';
  END IF;

  -- Re-import identical uber batch → queue row count unchanged
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-q-uber-replay',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-uber-1',
      'driver_id', v_driver,
      'vehicle_id', v_vehicle,
      'request_at', v_ev - interval '20 minutes',
      'dropoff_at', v_ev,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  IF (SELECT count(*)::int FROM toll.match_queue WHERE organization_id = v_org_a) <> v_cnt2 THEN
    RAISE EXCEPTION 'q1 replay changed queue count';
  END IF;

  -- Roam native → no queue
  RESET ROLE;
  PERFORM public.toll_sys_native_ride_charge(v_org_a, jsonb_build_object(
    'ride_id', 'match-ride-rn-1',
    'payment_method', 'card',
    'driver_id', v_driver,
    'vehicle_id', v_vehicle,
    'ended_at', v_ev,
    'estimated_tolls_minor', 400,
    'crossings', jsonb_build_array(jsonb_build_object(
      'id', 'match-x-1', 'plaza_id', v_plaza,
      'crossed_at', v_ev, 'amount_minor', 400, 'paid_by', 'tag'
    ))
  ));
  IF EXISTS (
    SELECT 1 FROM toll.match_queue q
    JOIN toll.charges c ON c.id = q.record_id AND q.record_kind = 'charge'
    WHERE q.organization_id = v_org_a AND c.source = 'roam_ride'
  ) THEN
    RAISE EXCEPTION 'q1 roam charge queued';
  END IF;

  -- Reversal queues original payback (self-undoing probe; no hand cleanup of money rows)
  RESET ROLE;
  SELECT id INTO v_pb_orig FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-uber-1' LIMIT 1;
  IF v_pb_orig IS NULL THEN
    RAISE EXCEPTION 'q1 missing uber payback for reversal test';
  END IF;
  BEGIN
    DELETE FROM toll.match_queue WHERE organization_id = v_org_a AND record_id = v_pb_orig;
    INSERT INTO toll.paybacks (
      organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
    ) VALUES (
      v_org_a, 'uber', 'trip_line', 'match-pb-rev-r', v_week, v_week, 500, 'fleet', v_pb_orig
    );
    IF NOT EXISTS (SELECT 1 FROM toll.match_queue WHERE organization_id = v_org_a AND record_id = v_pb_orig AND record_kind = 'payback') THEN
      RAISE EXCEPTION 'q1 reversal did not queue original payback';
    END IF;
    RAISE EXCEPTION 'match_rev_probe_ok';
  EXCEPTION
    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'match_rev_probe_ok' THEN
        RAISE;
      END IF;
  END;

  -- Seal / reopen on an isolated week (no pending paybacks blocking seal)
  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-q-tag-seal',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-seal-only',
      'occurred_at', v_week_seal::timestamptz + time '10:00',
      'amount_minor', 300,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle,
      'driver_id', v_driver
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge_seal FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-seal-only' LIMIT 1;
  DELETE FROM toll.match_queue WHERE organization_id = v_org_a AND record_id = v_charge_seal;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status)
  VALUES ('toll_week', v_org_a, '*', v_week_seal, 1, 'closed');
  IF NOT EXISTS (
    SELECT 1 FROM toll.match_queue q
    WHERE q.organization_id = v_org_a AND q.record_kind = 'charge' AND q.record_id = v_charge_seal
  ) THEN
    RAISE EXCEPTION 'q1 seal did not queue charge';
  END IF;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status)
  VALUES ('toll_week', v_org_a, '*', v_week_seal, 2, 'draft');
  IF NOT EXISTS (
    SELECT 1 FROM toll.match_queue q
    WHERE q.organization_id = v_org_a AND q.record_kind = 'charge' AND q.record_id = v_charge_seal
      AND q.claim_id IS NULL
  ) THEN
    RAISE EXCEPTION 'q1 reopen did not re-queue charge';
  END IF;

  -- ── 2. Claim basics ──
  RESET ROLE;
  SELECT id INTO v_charge_tag FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-tag-1' LIMIT 1;
  v_charge := v_charge_tag;
  SELECT id INTO v_payback FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-uber-1' LIMIT 1;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 100);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'c1 empty claim after queue drain attempt';
  END IF;
  IF jsonb_typeof(v_claim -> 'focal') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'c1 missing focal';
  END IF;
  IF jsonb_typeof(v_claim -> 'charges') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'c1 missing charges array';
  END IF;

  -- Second claim while first open → nothing
  v_claim_id2 := nullif((public.toll_sys_match_claim(v_org_a, 100) ->> 'claim_id'), '')::uuid;
  IF v_claim_id2 IS NOT NULL THEN
    RAISE EXCEPTION 'c1 concurrent claim should be empty';
  END IF;

  -- Store to release first claim (empty candidates withdraw open)
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));

  -- Re-queue and test stale claim reclaim
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  UPDATE toll.match_queue SET claim_id = gen_random_uuid(), claimed_at = now() - interval '11 minutes'
  WHERE organization_id = v_org_a AND record_id = v_charge;
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 10) ->> 'claim_id'), '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'c1 stale claim not reclaimed';
  END IF;

  IF v_charge IS NULL OR v_payback IS NULL THEN
    RAISE EXCEPTION 'c1 missing charge or payback ids';
  END IF;

  v_inputs := pg_temp._match_inputs(v_charge, v_payback);
  v_result := pg_temp._match_result(v_charge, v_payback, 100,
    ARRAY['on_trip','amount_exact','sole_candidate','auto_apply_off'], v_inputs);
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, v_result);
  IF coalesce((v_store ->> 'new')::int, 0) < 1 THEN
    RAISE EXCEPTION 'c1 store new expected, got %', v_store;
  END IF;

  -- Org isolation: org B charge never in org A bundle
  PERFORM set_config('match.test_org', v_org_b::text, true);
  PERFORM set_config('match.test_user', v_owner_b::text, true);
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-q-tag-b',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-b-only',
      'occurred_at', v_ev,
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle,
      'driver_id', v_driver
    ))
  ));
  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  SELECT id INTO v_charge2 FROM toll.charges
  WHERE organization_id = v_org_b AND source_ref = 'match-b-only' LIMIT 1;
  PERFORM toll_system.match_enqueue(v_org_b, 'charge', v_charge2);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 50);
  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_claim -> 'charges') x
    WHERE (x ->> 'id')::uuid = v_charge2
  ) THEN
    RAISE EXCEPTION 'c1 org B leaked into org A claim';
  END IF;
  SET LOCAL ROLE service_role;

  -- ── 2b. Claim contents and scope ──
  v_ev_scope := v_ev + interval '3 days';
  v_week_scope := ledger.jamaica_week_start(v_ev_scope);
  v_week_scope_seal := v_week0 + 7 * 51;

  RESET ROLE;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'match-2b-fixture', 'fixture', 'user')
  RETURNING id INTO v_decision;

  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-uber',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-uber',
      'driver_id', v_driver_scope,
      'vehicle_id', v_vehicle_scope,
      'request_at', v_ev_scope - interval '20 minutes',
      'dropoff_at', v_ev_scope,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-tag-a',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-tag-a',
      'occurred_at', v_ev_scope - interval '10 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle_scope,
      'driver_id', v_driver_scope
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge_scope_a FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-scope-tag-a' LIMIT 1;
  SELECT id INTO v_pb_scope FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-scope-uber' LIMIT 1;

  -- 2b.1 second crossing on same trip
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION '2b1 missing claim';
  END IF;
  v_inputs := pg_temp._match_inputs(v_charge_scope_a, v_pb_scope);
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id,
    pg_temp._match_result(v_charge_scope_a, v_pb_scope, 100,
      ARRAY['on_trip','amount_exact','sole_candidate'], v_inputs));

  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-tag-b',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-tag-b',
      'occurred_at', v_ev_scope - interval '5 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle_scope,
      'driver_id', v_driver_scope
    ))
  ));
  SELECT id INTO v_charge_scope_b FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-scope-tag-b' LIMIT 1;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION '2b1 second claim empty';
  END IF;
  IF NOT pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'payback_ids', v_pb_scope) THEN
    RAISE EXCEPTION '2b1 focal payback_ids missing trip payback';
  END IF;
  -- A pair is re-scored when EITHER side is in scope: B (queued) and the payback (B's candidate) are in
  -- scope, so the pair (A, payback) is re-scored through the payback. A itself must be in the bundle's
  -- charges so the engine can score that pair with complete competitor counts.
  IF NOT pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'charge_ids', v_charge_scope_b) THEN
    RAISE EXCEPTION '2b1 focal charge_ids need B, got %', v_claim -> 'focal' -> 'charge_ids';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_claim -> 'charges') c
                 WHERE (c ->> 'id')::uuid = v_charge_scope_a) THEN
    RAISE EXCEPTION '2b1 bundle charges must include A (partner of the scoped payback)';
  END IF;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1',
    'candidates', jsonb_build_array(
      pg_temp._match_result(v_charge_scope_a, v_pb_scope, 100, ARRAY['on_trip'],
        pg_temp._match_inputs(v_charge_scope_a, v_pb_scope)) -> 'candidates' -> 0,
      pg_temp._match_result(v_charge_scope_b, v_pb_scope, 95, ARRAY['on_trip'],
        pg_temp._match_inputs(v_charge_scope_b, v_pb_scope)) -> 'candidates' -> 0
    )
  ));
  -- Both pairs are in scope: neither is skipped (the (A, payback) re-score is accepted).
  IF (v_store ->> 'status') <> 'stored' OR (v_store ->> 'skipped')::int <> 0
     OR (v_store ->> 'new')::int + (v_store ->> 'unchanged')::int + (v_store ->> 'replaced')::int <> 2 THEN
    RAISE EXCEPTION '2b1 store must accept both pairs, got %', v_store;
  END IF;

  -- 2b.2 trip moved away: open partners stay in focal
  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-uber-moved',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-uber',
      'driver_id', v_driver_scope,
      'vehicle_id', v_vehicle_scope,
      'request_at', v_ev_scope - interval '20 minutes',
      'dropoff_at', v_ev_scope + interval '2 hours',
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION '2b2 missing claim after trip move';
  END IF;
  IF NOT pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'charge_ids', v_charge_scope_a)
     OR NOT pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'charge_ids', v_charge_scope_b) THEN
    RAISE EXCEPTION '2b2 focal charge_ids need A and B after trip move, got %', v_claim -> 'focal' -> 'charge_ids';
  END IF;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));

  -- 2b.3 extra hops: shared charge on two back-to-back trips
  v_ev_scope := v_ev + interval '5 days';
  v_week_scope := ledger.jamaica_week_start(v_ev_scope);
  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-t1',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-t1',
      'driver_id', v_driver_scope,
      'vehicle_id', v_vehicle_scope,
      'request_at', v_ev_scope - interval '50 minutes',
      'dropoff_at', v_ev_scope - interval '30 minutes',
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-t2',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-t2',
      'driver_id', v_driver_scope,
      'vehicle_id', v_vehicle_scope,
      'request_at', v_ev_scope - interval '25 minutes',
      'dropoff_at', v_ev_scope,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-shared-charge',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-shared',
      'occurred_at', v_ev_scope - interval '20 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle_scope,
      'driver_id', v_driver_scope
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_pb_scope_t1 FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-scope-t1' LIMIT 1;
  SELECT id INTO v_pb_scope_t2 FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-scope-t2' LIMIT 1;
  DELETE FROM toll.match_queue WHERE organization_id = v_org_a;
  PERFORM toll_system.match_enqueue(v_org_a, 'payback', v_pb_scope_t2);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION '2b3 missing claim';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_claim -> 'paybacks') x
    WHERE (x ->> 'id')::uuid = v_pb_scope_t1
  ) THEN
    RAISE EXCEPTION '2b3 bundle paybacks missing T1 payback';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_claim -> 'trips') x
    WHERE x ->> 'platform_trip_id' = 'match-scope-t1'
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_claim -> 'trips') x
    WHERE x ->> 'platform_trip_id' = 'match-scope-t2'
  ) THEN
    RAISE EXCEPTION '2b3 bundle trips need T1 and T2';
  END IF;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));

  -- 2b.4 amounts, flags, settings
  v_ev_scope := v_ev + interval '7 days';
  v_week_scope := ledger.jamaica_week_start(v_ev_scope);
  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-amt-uber',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-amt',
      'driver_id', v_driver_scope,
      'vehicle_id', v_vehicle_scope,
      'request_at', v_ev_scope - interval '20 minutes',
      'dropoff_at', v_ev_scope,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-amt-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-amt-ch',
      'occurred_at', v_ev_scope - interval '10 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle_scope,
      'driver_id', v_driver_scope
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge_scope_amt FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-scope-amt-ch' LIMIT 1;
  SELECT id INTO v_pb_scope_amt FROM toll.paybacks
  WHERE organization_id = v_org_a AND reference = 'trip:match-scope-amt' LIMIT 1;

  RESET ROLE;
  -- Hand-made allocations, a sealed-week row and a raw reversal are probes only: this block undoes
  -- itself, so the nightly checks at the end see only what the real paths wrote.
  BEGIN
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_charge_scope_amt, 'driver', 200, '2b-amt-act', v_decision)
  RETURNING id INTO v_alloc_scope;
  PERFORM toll_system.post(v_org_a, 'P7_allocate_driver', 200, v_ev_scope, 'match-2b-p7-a', 1,
    jsonb_build_object('charge_id', v_charge_scope_amt::text));
  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_charge_scope_amt, 'driver', 100, '2b-amt-rev', v_decision)
  RETURNING id INTO v_alloc_rev;
  PERFORM toll_system.post(v_org_a, 'P7_allocate_driver', 100, v_ev_scope, 'match-2b-p7-b', 2,
    jsonb_build_object('charge_id', v_charge_scope_amt::text));
  UPDATE toll.allocations SET reversed_by = gen_random_uuid()
  WHERE organization_id = v_org_a AND id = v_alloc_rev;

  INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, payback_id, reason, decision_id)
  VALUES (v_org_a, v_charge_scope_amt, 'platform', 150, v_pb_scope_amt, '2b-pb-alloc', v_decision);
  PERFORM toll_system.post(v_org_a, 'P6_allocate_platform', 150, v_ev_scope, 'match-2b-p6', 3,
    jsonb_build_object('charge_id', v_charge_scope_amt::text, 'payback_id', v_pb_scope_amt::text));
  INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
  VALUES (v_org_a, v_pb_scope_amt, 50, '2b-unlinked', v_decision);

  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-seal-ch',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-seal-ch',
      'occurred_at', v_week_scope_seal::timestamptz + time '11:00',
      'amount_minor', 400,
      'plaza_id', v_plaza,
      'vehicle_id', v_vehicle_scope,
      'driver_id', v_driver_scope
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge_scope_seal FROM toll.charges
  WHERE organization_id = v_org_a AND source_ref = 'match-scope-seal-ch' LIMIT 1;
  DELETE FROM toll.match_queue WHERE organization_id = v_org_a AND record_id = v_charge_scope_seal;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status)
  VALUES ('toll_week', v_org_a, '*', v_week_scope_seal, 1, 'closed');

  DELETE FROM toll.match_queue WHERE organization_id = v_org_a AND record_id IN (v_charge_scope_amt, v_pb_scope_amt);
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge_scope_amt);
  PERFORM toll_system.match_enqueue(v_org_a, 'payback', v_pb_scope_amt);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION '2b4 missing claim';
  END IF;

  SELECT (x ->> 'remaining_minor')::bigint INTO v_rem
  FROM jsonb_array_elements(v_claim -> 'charges') x
  WHERE (x ->> 'id')::uuid = v_charge_scope_amt;
  IF v_rem IS DISTINCT FROM 150 THEN  -- 500 − driver 200 − platform 150 (the reversed 100 does not count)
    RAISE EXCEPTION '2b4 charge remaining_minor want 150 got %', v_rem;
  END IF;
  SELECT (x ->> 'remaining_minor')::bigint INTO v_rem
  FROM jsonb_array_elements(v_claim -> 'paybacks') x
  WHERE (x ->> 'id')::uuid = v_pb_scope_amt;
  IF v_rem IS DISTINCT FROM 300 THEN  -- 500 − platform allocation 150 − left unlinked 50
    RAISE EXCEPTION '2b4 payback remaining_minor want 300 got %', v_rem;
  END IF;
  IF coalesce((
    SELECT (x ->> 'week_sealed')::boolean FROM jsonb_array_elements(v_claim -> 'charges') x
    WHERE (x ->> 'id')::uuid = v_charge_scope_seal
  ), false) IS NOT true THEN
    RAISE EXCEPTION '2b4 week_sealed expected true on sealed-week charge';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_claim -> 'settings') s
    WHERE s ->> 'platform' = 'uber' AND (s ->> 'auto_apply')::boolean = false
  ) THEN
    RAISE EXCEPTION '2b4 settings missing uber auto_apply=false';
  END IF;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));

  RESET ROLE;
  BEGIN
    INSERT INTO toll.paybacks (
      organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by, reversal_of
    ) VALUES (
      v_org_a, 'uber', 'trip_line', 'match-scope-pb-rev-probe', v_week_scope, v_week_scope, 500, 'fleet', v_pb_scope_amt
    );
    SET LOCAL ROLE service_role;
    v_claim := public.toll_sys_match_claim(v_org_a, 50);
    v_reversed := coalesce((
      SELECT (x ->> 'reversed')::boolean FROM jsonb_array_elements(v_claim -> 'paybacks') x
      WHERE (x ->> 'id')::uuid = v_pb_scope_amt
    ), false);
    IF NOT v_reversed THEN
      RAISE EXCEPTION '2b4 payback reversed flag expected true';
    END IF;
    IF v_claim ->> 'claim_id' IS NOT NULL THEN
      PERFORM public.toll_sys_match_store(v_org_a, nullif(v_claim ->> 'claim_id', '')::uuid,
        jsonb_build_object('engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb));
    END IF;
    RAISE EXCEPTION 'match_rev_probe_ok';
  EXCEPTION
    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'match_rev_probe_ok' THEN
        RAISE;
      END IF;
  END;
  RAISE EXCEPTION 'match_amt_probe_ok';
  EXCEPTION
    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'match_amt_probe_ok' THEN
        RAISE;
      END IF;
  END;
  SET LOCAL ROLE service_role;

  -- 2b.5 other company: open suggestions never cross org boundaries in focal
  PERFORM set_config('match.test_org', v_org_b::text, true);
  PERFORM set_config('match.test_user', v_owner_b::text, true);
  RESET ROLE;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_b, 'match-2b-fixture-b', 'fixture', 'user');
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-b-uber',
    'kind', 'uber',
    'rows', jsonb_build_array(jsonb_build_object(
      'row_type', 'trip',
      'platform_trip_id', 'match-scope-b-co',
      'driver_id', 'driver-scope-b',
      'vehicle_id', 'vehicle-scope-b',
      'request_at', v_ev_scope - interval '20 minutes',
      'dropoff_at', v_ev_scope,
      'payment_method', 'card',
      'toll_payback_minor', 500
    ))
  ));
  PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
    'command_id', 'match-2b-b-tag',
    'kind', 'tag_statement',
    'rows', jsonb_build_array(jsonb_build_object(
      'source_ref', 'match-scope-b-tag',
      'occurred_at', v_ev_scope - interval '10 minutes',
      'amount_minor', 500,
      'plaza_id', v_plaza,
      'vehicle_id', 'vehicle-scope-b',
      'driver_id', 'driver-scope-b'
    ))
  ));
  RESET ROLE;
  SELECT id INTO v_charge_b_co FROM toll.charges
  WHERE organization_id = v_org_b AND source_ref = 'match-scope-b-tag' LIMIT 1;
  SELECT id INTO v_pb_b_co FROM toll.paybacks
  WHERE organization_id = v_org_b AND reference = 'trip:match-scope-b-co' LIMIT 1;
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_b, 500) ->> 'claim_id'), '')::uuid;
  v_inputs := pg_temp._match_inputs(v_charge_b_co, v_pb_b_co);
  PERFORM public.toll_sys_match_store(v_org_b, v_claim_id,
    pg_temp._match_result(v_charge_b_co, v_pb_b_co, 100, ARRAY['on_trip'], v_inputs));

  PERFORM set_config('match.test_org', v_org_a::text, true);
  PERFORM set_config('match.test_user', v_owner::text, true);
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge_scope_amt);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_a, 500);
  IF pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'charge_ids', v_charge_b_co)
     OR pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'payback_ids', v_pb_b_co) THEN
    RAISE EXCEPTION '2b5 org B records in org A focal';
  END IF;
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id,
    pg_temp._match_result(v_charge_scope_amt, v_pb_scope_amt, 100, ARRAY['on_trip'], v_inputs));

  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_b, 'charge', v_charge_b_co);
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org_b, 500);
  IF pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'charge_ids', v_charge_scope_amt)
     OR pg_temp._match_ids_in_jsonb(v_claim -> 'focal' -> 'payback_ids', v_pb_scope_amt) THEN
    RAISE EXCEPTION '2b5 org A records in org B focal';
  END IF;
  v_claim_id := nullif(v_claim ->> 'claim_id', '')::uuid;
  v_store := public.toll_sys_match_store(v_org_b, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));

  -- ── 3. Store paths ──
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  PERFORM toll_system.match_enqueue(v_org_a, 'payback', v_payback);
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 50) ->> 'claim_id'), '')::uuid;
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 's3 missing claim for store tests';
  END IF;

  -- unchanged
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, v_result);
  IF coalesce((v_store ->> 'unchanged')::int, 0) < 1 THEN
    RAISE EXCEPTION 's3 unchanged expected %', v_store;
  END IF;
  RESET ROLE;
  SELECT count(*)::int INTO v_open FROM toll.suggestions
  WHERE organization_id = v_org_a AND superseded_by IS NULL
    AND charge_id = v_charge AND payback_id = v_payback;
  SET LOCAL ROLE service_role;
  IF v_open <> 1 THEN
    RAISE EXCEPTION 's3 unchanged wrote extra rows';
  END IF;

  -- replaced (different inputs)
  v_inputs2 := v_inputs || jsonb_build_object('config', jsonb_build_object('note', 'v2'));
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 50) ->> 'claim_id'), '')::uuid;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id,
    pg_temp._match_result(v_charge, v_payback, 90,
      ARRAY['on_trip','amount_close','sole_candidate','auto_apply_off'], v_inputs2));
  IF coalesce((v_store ->> 'replaced')::int, 0) < 1 THEN
    RAISE EXCEPTION 's3 replaced expected %', v_store;
  END IF;
  RESET ROLE;
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org_a AND charge_id = v_charge AND payback_id = v_payback
    AND superseded_by IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM toll.suggestions s
    WHERE s.organization_id = v_org_a AND s.charge_id = v_charge AND s.payback_id = v_payback
      AND s.superseded_by = v_sug
  ) THEN
    RAISE EXCEPTION 's3 superseded_by not set';
  END IF;

  -- withdrawn focal pair omitted
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 50) ->> 'claim_id'), '')::uuid;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));
  IF coalesce((v_store ->> 'withdrawn')::int, 0) < 1 THEN
    RAISE EXCEPTION 's3 withdrawn expected %', v_store;
  END IF;
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM toll.suggestions s
    WHERE s.organization_id = v_org_a AND s.charge_id = v_charge AND s.payback_id = v_payback
      AND 'withdrawn' = ANY (s.rules_fired) AND s.superseded_by IS NULL
  ) THEN
    RAISE EXCEPTION 's3 withdrawn row missing';
  END IF;

  -- skipped (pair outside focal / wrong org payback)
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 50) ->> 'claim_id'), '')::uuid;
  RESET ROLE;
  SELECT id INTO v_pb_orig FROM toll.paybacks WHERE organization_id = v_org_b LIMIT 1;
  IF v_pb_orig IS NULL THEN
    PERFORM set_config('match.test_org', v_org_b::text, true);
    PERFORM set_config('match.test_user', v_owner_b::text, true);
    PERFORM pg_temp._match_cmd('import_batch', jsonb_build_object(
      'command_id', 'match-q-uber-b',
      'kind', 'uber',
      'rows', jsonb_build_array(jsonb_build_object(
        'row_type', 'trip',
        'platform_trip_id', 'match-uber-b-1',
        'driver_id', v_driver,
        'vehicle_id', v_vehicle,
        'request_at', v_ev - interval '20 minutes',
        'dropoff_at', v_ev,
        'payment_method', 'card',
        'toll_payback_minor', 100
      ))
    ));
    PERFORM set_config('match.test_org', v_org_a::text, true);
    PERFORM set_config('match.test_user', v_owner::text, true);
    RESET ROLE;
    SELECT id INTO v_pb_orig FROM toll.paybacks
    WHERE organization_id = v_org_b AND reference = 'trip:match-uber-b-1' LIMIT 1;
  END IF;
  SET LOCAL ROLE service_role;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1',
    'candidates', jsonb_build_array(jsonb_build_object(
      'charge_id', v_charge,
      'payback_id', v_pb_orig,
      'score', 50,
      'auto_apply', false,
      'score_parts', jsonb_build_object('total', 50),
      'rules_fired', '["on_trip"]'::jsonb,
      'inputs', v_inputs
    ))
  ));
  IF coalesce((v_store ->> 'skipped')::int, 0) < 1 THEN
    RAISE EXCEPTION 's3 skipped expected %', v_store;
  END IF;

  -- claim_gone
  v_store := public.toll_sys_match_store(v_org_a, gen_random_uuid(), v_result);
  IF v_store ->> 'status' IS DISTINCT FROM 'claim_gone' THEN
    RAISE EXCEPTION 's3 claim_gone expected %', v_store;
  END IF;

  -- queue cleared after store
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM toll.match_queue WHERE organization_id = v_org_a AND claim_id = v_claim_id) THEN
    RAISE EXCEPTION 's3 queue not cleared';
  END IF;

  -- enqueue during claim survives store (re-enqueue while claimed releases row)
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  SET LOCAL ROLE service_role;
  v_claim_id := nullif((public.toll_sys_match_claim(v_org_a, 50) ->> 'claim_id'), '')::uuid;
  RESET ROLE;
  PERFORM toll_system.match_enqueue(v_org_a, 'charge', v_charge);
  SET LOCAL ROLE service_role;
  v_store := public.toll_sys_match_store(v_org_a, v_claim_id, jsonb_build_object(
    'engine_version', 'toll-matcher-v1', 'candidates', '[]'::jsonb
  ));
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM toll.match_queue
    WHERE organization_id = v_org_a AND record_kind = 'charge' AND record_id = v_charge
      AND claim_id IS NULL
  ) THEN
    RAISE EXCEPTION 's3 re-enqueued row should stay after store';
  END IF;

  -- ── 4. Append-only suggestions ──
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org_a ORDER BY created_at DESC LIMIT 1;
  v_caught := false;
  BEGIN
    UPDATE toll.suggestions SET score_parts = jsonb_build_object('total', 1) WHERE id = v_sug;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_caught := v_msg LIKE '%append-only%' OR v_msg LIKE '%only superseded_by%';
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 's4 update should fail';
  END IF;
  v_caught := false;
  BEGIN
    DELETE FROM toll.suggestions WHERE id = v_sug;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_caught := v_msg LIKE '%append-only%';
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 's4 delete should fail';
  END IF;

  -- ── 5. Grants ──
  RESET ROLE;
  IF has_function_privilege('authenticated', v_fn_claim, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_claim, 'EXECUTE') THEN
    RAISE EXCEPTION 's5 authenticated/anon must not execute toll_sys_match_claim';
  END IF;
  IF has_function_privilege('authenticated', v_fn_store, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_store, 'EXECUTE') THEN
    RAISE EXCEPTION 's5 authenticated/anon must not execute toll_sys_match_store';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_claim, 'EXECUTE') THEN
    RAISE EXCEPTION 's5 service_role must execute claim';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated',
      'app_metadata', json_build_object('organizationId', v_org_a::text))::text,
    true
  );
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM toll.match_queue WHERE organization_id = v_org_b) >
     0 AND EXISTS (SELECT 1 FROM toll.match_queue WHERE organization_id = v_org_b) THEN
    IF EXISTS (
      SELECT 1 FROM toll.match_queue q
      WHERE q.organization_id = v_org_b
        AND NOT EXISTS (SELECT 1 FROM toll.match_queue q2 WHERE q2.organization_id = v_org_a)
    ) THEN
      NULL; -- org B may have rows; RLS hides from A user if we only select A
    END IF;
  END IF;
  IF (SELECT count(*) FROM toll.match_queue WHERE organization_id = v_org_a) = 0
     AND EXISTS (SELECT 1 FROM toll.match_queue) THEN
    NULL;
  END IF;
  v_caught := false;
  BEGIN
    INSERT INTO toll.match_queue (organization_id, record_kind, record_id)
    VALUES (v_org_a, 'charge', v_charge);
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 's5 authenticated must not insert match_queue';
  END IF;
  RESET ROLE;

  PERFORM pg_temp._match_nightly_ok(v_org_a);
  PERFORM pg_temp._match_nightly_ok(v_org_b);
END;
$$;

ROLLBACK;
