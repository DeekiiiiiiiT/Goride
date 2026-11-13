\set ON_ERROR_STOP 1
\set QUIET 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('f0211111-1111-4111-8111-111111111111','dec-smoke@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES ('f2111111-1111-4111-8111-111111111101','f0211111-1111-4111-8111-111111111111','Dec Smoke','dec-smoke','fleet','active');
INSERT INTO toll.switch_state (organization_id, tolls_v2) VALUES ('f2111111-1111-4111-8111-111111111101', true);
SELECT toll_system.ensure_accounts('f2111111-1111-4111-8111-111111111101');

CREATE FUNCTION pg_temp.cmd(p_intent text, p_body jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','f0211111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('organizationId','f2111111-1111-4111-8111-111111111101'))::text, true);
  SET LOCAL ROLE authenticated;
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END $f$;
-- Expect a refusal code; anything else raises.
CREATE FUNCTION pg_temp.refused(p_intent text, p_body jsonb, p_code text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE m text; d text;
BEGIN
  BEGIN
    PERFORM pg_temp.cmd(p_intent, p_body);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL;
    RESET ROLE;
    IF m <> p_code THEN RAISE EXCEPTION 'expected % got %: %', p_code, m, d; END IF;
    RETURN m || ' ' || coalesce(d, '');
  END;
  RAISE EXCEPTION 'expected % but the command succeeded', p_code;
END $f$;
CREATE FUNCTION pg_temp.ch(p_ref text) RETURNS toll.charges LANGUAGE sql AS $f$
  SELECT * FROM toll.charges WHERE organization_id='f2111111-1111-4111-8111-111111111101' AND source_ref=p_ref $f$;
CREATE FUNCTION pg_temp.pb(p_ref text) RETURNS toll.paybacks LANGUAGE sql AS $f$
  SELECT * FROM toll.paybacks WHERE organization_id='f2111111-1111-4111-8111-111111111101' AND reference=p_ref $f$;
CREATE FUNCTION pg_temp.say(p text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RAISE NOTICE '%', p; END $f$;

DO $$
DECLARE
  org uuid := 'f2111111-1111-4111-8111-111111111101';
  r jsonb; c toll.charges; p toll.paybacks; v_link uuid; v_sug uuid; v_msg text; x record;
BEGIN
  -- Data through the real import path (service side)
  PERFORM public.toll_sys_import(org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":34000},
    {"row_type":"adjustment","reference":"adj1","driver_id":"d1","paid_on":"2024-10-09","amount_minor":10000}]'::jsonb, 'imp-uber', 'smoke');
  PERFORM public.toll_sys_import(org, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-08T20:00:00-05:00","amount_minor":50000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c5","occurred_at":"2024-10-09T08:00:00-05:00","amount_minor":25000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"}]'::jsonb, 'imp-tag', 'smoke');
  PERFORM public.toll_sys_import(org, 'driver_cash', '[
    {"source_ref":"c3","occurred_at":"2024-10-08T09:00:00-05:00","amount_minor":20000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"x"}},
    {"source_ref":"c4","occurred_at":"2024-10-08T10:00:00-05:00","amount_minor":15000,"plaza_id":"pzE","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"y"}},
    {"source_ref":"c6","occurred_at":"2024-10-09T18:00:00-05:00","amount_minor":25000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"z"}}]'::jsonb, 'imp-cash', 'smoke');

  -- 1. link_payback
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  r := pg_temp.cmd('link_payback', jsonb_build_object('command_id','k1','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  v_link := (r->>'decision_id')::uuid;
  PERFORM pg_temp.say('1 link: ' || r::text);
  IF toll_system.charge_state(org, c.id) <> 'decided' OR toll_system.payback_open_minor(org, p.id) <> 0 THEN RAISE EXCEPTION '1 link state'; END IF;
  -- replay: same answer, nothing new
  IF (pg_temp.cmd('link_payback', jsonb_build_object('command_id','k1')) ->> 'replay') <> 'true' THEN RAISE EXCEPTION '1 replay'; END IF;
  -- stale versions
  PERFORM pg_temp.say('1 stale: ' || pg_temp.refused('link_payback', jsonb_build_object('command_id','k1b','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version), 'VERSION_CHANGED'));

  -- 2. driver_pays part, then fleet_absorbs the rest; too much refused
  c := pg_temp.ch('c2');
  PERFORM pg_temp.say('2 too much: ' || pg_temp.refused('driver_pays', jsonb_build_object('command_id','k2x','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',99999), 'AMOUNT_TOO_LARGE'));
  r := pg_temp.cmd('driver_pays', jsonb_build_object('command_id','k2','charge_id',c.id,'expected_charge_version',c.version,
         'amount_minor',30000,'reason_code','personal_use'));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','k2b','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));
  PERFORM pg_temp.say('2 fleet rest: ' || r::text);
  IF toll_system.charge_state(org, c.id) <> 'decided' THEN RAISE EXCEPTION '2 state'; END IF;
  PERFORM pg_temp.say('2 decided again: ' || pg_temp.refused('fleet_absorbs', jsonb_build_object('command_id','k2c','charge_id',c.id,
         'expected_charge_version',(r->>'charge_version')::bigint), 'WRONG_STATE'));

  -- 3. verify a cash receipt (P3), then decide it; an unverified one can't be decided
  c := pg_temp.ch('c3');
  PERFORM pg_temp.say('3 unverified: ' || pg_temp.refused('fleet_absorbs', jsonb_build_object('command_id','k3x','charge_id',c.id,
         'expected_charge_version',c.version), 'WRONG_STATE'));
  r := pg_temp.cmd('verify_cash_receipt', jsonb_build_object('command_id','k3','charge_id',c.id,'expected_charge_version',c.version));
  PERFORM pg_temp.say('3 verify: ' || r::text || ' P3 net=' || toll_system.rule_net(org,'P3_cash_verified','charge_id',c.id::text));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','k3b','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));

  -- 4. reject: reason required; rejected is final
  c := pg_temp.ch('c4');
  PERFORM pg_temp.say('4 no reason: ' || pg_temp.refused('reject_cash_receipt', jsonb_build_object('command_id','k4x','charge_id',c.id,
         'expected_charge_version',c.version), 'BAD_REQUEST'));
  r := pg_temp.cmd('reject_cash_receipt', jsonb_build_object('command_id','k4','charge_id',c.id,'expected_charge_version',c.version,'reason_code','no_receipt'));
  PERFORM pg_temp.say('4 verify after reject: ' || pg_temp.refused('verify_cash_receipt', jsonb_build_object('command_id','k4y','charge_id',c.id,
         'expected_charge_version',(r->>'charge_version')::bigint), 'WRONG_STATE'));

  -- 5. leave the support adjustment unlinked (reason required, no posting)
  p := pg_temp.pb('adj1');
  PERFORM pg_temp.refused('leave_payback_unlinked', jsonb_build_object('command_id','k5x','payback_id',p.id,'expected_payback_version',p.version), 'BAD_REQUEST');
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','k5','payback_id',p.id,'expected_payback_version',p.version,
         'reason_code','not_a_toll'));
  PERFORM pg_temp.say('5 unlinked: ' || r::text);

  -- 6. undo the link: charge pending again, payback open again; twice = already undone
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  PERFORM pg_temp.refused('undo_decision', jsonb_build_object('command_id','k6x','decision_id',v_link,
         'expected_versions', jsonb_build_object(c.id::text, c.version)), 'BAD_REQUEST');
  r := pg_temp.cmd('undo_decision', jsonb_build_object('command_id','k6','decision_id',v_link,
         'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp.say('6 undo: ' || r::text);
  IF toll_system.charge_state(org, c.id) <> 'pending' OR toll_system.payback_open_minor(org, p.id) <> 34000 THEN RAISE EXCEPTION '6 undo state'; END IF;
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  PERFORM pg_temp.refused('undo_decision', jsonb_build_object('command_id','k6b','decision_id',v_link,
         'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'WRONG_STATE');

  -- 7. apply a suggestion (a stand-in row, as the matcher would store it); a stale one is refused
  INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES (org, c.id, p.id, '{"total":100}', ARRAY['on_trip'], 'toll-matcher-v1', '{"a":1}', md5('{"a":1}')) RETURNING id INTO v_sug;
  r := pg_temp.cmd('apply_suggestion', jsonb_build_object('command_id','k7','suggestion_id',v_sug,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  PERFORM pg_temp.say('7 apply: ' || r::text);
  INSERT INTO toll.suggestions (organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES (org, c.id, p.id, '{"total":0}', ARRAY['withdrawn'], 'toll-matcher-v1', '{"b":1}', md5('{"b":1}')) RETURNING id INTO v_link;
  UPDATE toll.suggestions SET superseded_by = v_link WHERE id = v_sug;
  PERFORM pg_temp.refused('apply_suggestion', jsonb_build_object('command_id','k7b','suggestion_id',v_sug,
         'expected_charge_version',c.version+1,'expected_payback_version',p.version+1), 'WRONG_STATE');

  -- 8. duplicate review pair (tag c5 and cash c6: same car + plaza + day, outside the window)
  PERFORM pg_temp.say('8 pairs open: ' || (SELECT count(*) FROM toll.duplicate_reviews WHERE organization_id = org AND status='open'));
  c := pg_temp.ch('c6');
  r := pg_temp.cmd('verify_cash_receipt', jsonb_build_object('command_id','k8a','charge_id',c.id,'expected_charge_version',c.version));
  c := pg_temp.ch('c6');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','k8b','charge_id',c.id,'expected_charge_version',c.version));
  c := pg_temp.ch('c6');
  r := pg_temp.cmd('confirm_duplicate', jsonb_build_object('command_id','k8','charge_id',c.id,'other_charge_id',(pg_temp.ch('c5')).id,
         'expected_charge_version',c.version,'expected_other_version',(pg_temp.ch('c5')).version));
  PERFORM pg_temp.say('8 confirm: ' || r::text || ' P3 net now=' || toll_system.rule_net(org,'P3_cash_verified','charge_id',c.id::text)
                      || ' state=' || toll_system.charge_state(org, c.id));
  c := pg_temp.ch('c5');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','k8c','charge_id',c.id,'expected_charge_version',c.version));

  -- 9. seal the week, then any decision in it is refused
  r := pg_temp.cmd('seal_week', jsonb_build_object('command_id','k9','week_key','2024-10-07','expected_week_version',0));
  PERFORM pg_temp.say('9 seal: ' || (r->'weeks')::text);
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  PERFORM pg_temp.say('9 after seal: ' || pg_temp.refused('undo_decision', jsonb_build_object('command_id','k9b',
         'decision_id', (SELECT id FROM toll.decisions WHERE organization_id = org AND command_id='k7'),
         'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)), 'WEEK_SEALED'));

  -- 10. I4 guard: a raw over-allocation is refused by the database
  BEGIN
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, decision_id)
    VALUES (org, (pg_temp.ch('c2')).id, 'fleet', 1, (SELECT id FROM toll.decisions WHERE organization_id = org AND command_id='k2'));
    RAISE EXCEPTION '10 over-allocation was allowed';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'ALLOCATIONS_EXCEED_AMOUNT' THEN RAISE; END IF;
    PERFORM pg_temp.say('10 I4: ' || v_msg);
  END;

  FOR x IN SELECT * FROM toll_system.nightly_checks(org) LOOP
    IF NOT x.ok THEN RAISE EXCEPTION 'nightly % % failed: %', x.check_no, x.name, x.detail; END IF;
  END LOOP;
  PERFORM pg_temp.say('nightly checks: all ok');
END $$;
ROLLBACK;
