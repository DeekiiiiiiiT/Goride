-- P2-R4c smoke run (Claude): carry_forward of every kind into the open week. Local only; everything rolls back.
\set ON_ERROR_STOP 1
\set QUIET 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('f0411111-1111-4111-8111-111111111111','carry-smoke@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES ('f4111111-1111-4111-8111-111111111101','f0411111-1111-4111-8111-111111111111','Carry Smoke','carry-smoke','fleet','active');
INSERT INTO toll.switch_state (organization_id, tolls_v2) VALUES ('f4111111-1111-4111-8111-111111111101', true);
SELECT toll_system.ensure_accounts('f4111111-1111-4111-8111-111111111101');

CREATE FUNCTION pg_temp.cmd(p_intent text, p_body jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','f0411111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('organizationId','f4111111-1111-4111-8111-111111111101'))::text, true);
  SET LOCAL ROLE authenticated;
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END $f$;
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
  SELECT * FROM toll.charges WHERE organization_id='f4111111-1111-4111-8111-111111111101' AND source_ref=p_ref $f$;
CREATE FUNCTION pg_temp.pb(p_ref text) RETURNS toll.paybacks LANGUAGE sql AS $f$
  SELECT * FROM toll.paybacks WHERE organization_id='f4111111-1111-4111-8111-111111111101' AND reference=p_ref $f$;
CREATE FUNCTION pg_temp.say(p text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RAISE NOTICE '%', p; END $f$;
CREATE FUNCTION pg_temp.nightly(p_label text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE x record;
BEGIN
  RESET ROLE;
  FOR x IN SELECT * FROM toll_system.nightly_checks('f4111111-1111-4111-8111-111111111101') LOOP
    IF NOT x.ok THEN RAISE EXCEPTION '% nightly % % failed: %', p_label, x.check_no, x.name, x.detail; END IF;
  END LOOP;
  PERFORM pg_temp.say(p_label || ': nightly ok');
END $f$;

DO $$
DECLARE
  org uuid := 'f4111111-1111-4111-8111-111111111101';
  w date := '2024-10-07';
  tw date := ledger.jamaica_week_start(now());       -- the open week facts are carried into
  r jsonb; c toll.charges; p toll.paybacks; v_fact uuid; v_dec uuid; v_hash text;
BEGIN
  -- Week W: an Uber card trip with a 500 payback; tag c1 (340) on it, tag c2 (500), cash c3 (300).
  PERFORM public.toll_sys_import(org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000}
  ]'::jsonb, 'imp-uber', 'smoke');
  PERFORM public.toll_sys_import(org, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-09T09:00:00-05:00","amount_minor":50000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'imp-tag', 'smoke');
  PERFORM public.toll_sys_import(org, 'driver_cash', '[
    {"source_ref":"c3","occurred_at":"2024-10-10T09:00:00-05:00","amount_minor":30000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1","evidence":{"receipt_url":"x"}}
  ]'::jsonb, 'imp-cash', 'smoke');
  -- Decide everything, then seal W and pay its driver.
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  r := pg_temp.cmd('link_payback', jsonb_build_object('command_id','a1','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  p := pg_temp.pb('trip:t1');
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','a2','payback_id',p.id,'expected_payback_version',p.version,
         'reason_code','rider_paid_more'));
  c := pg_temp.ch('c2');
  r := pg_temp.cmd('driver_pays', jsonb_build_object('command_id','a3','charge_id',c.id,'expected_charge_version',c.version,'amount_minor',30000));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','a4','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));
  c := pg_temp.ch('c3');
  r := pg_temp.cmd('verify_cash_receipt', jsonb_build_object('command_id','a5','charge_id',c.id,'expected_charge_version',c.version));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','a6','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));
  r := pg_temp.cmd('seal_week', jsonb_build_object('command_id','a7','week_key',w,'expected_week_version',0));
  v_hash := toll_system.week_hash(org, w);
  PERFORM pg_temp.say('setup: W sealed, carried into ' || tw);

  -- 0. Drivers not paid yet → reopen instead
  c := pg_temp.ch('c2');
  PERFORM pg_temp.say('0 unpaid: ' || pg_temp.refused('carry_forward', jsonb_build_object('command_id','b0','from_week',w,
         'kind','correction_down','charge_id',c.id,'expected_charge_version',c.version,'amount_minor',30000,'reason_code','x'), 'REOPEN_INSTEAD'));
  INSERT INTO ledger.settlement_movements (organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status)
  VALUES (org, 'd1', w, 'pay', 100, 'carry-smoke-pay', 'posted');

  -- 1. A late tag charge (arrives after the seal) → carried, posted in the open week, then decided there
  PERFORM public.toll_sys_import(org, 'tag_statement', '[
    {"source_ref":"c4","occurred_at":"2024-10-11T09:00:00-05:00","amount_minor":20000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'imp-tag-late', 'smoke');
  c := pg_temp.ch('c4');
  IF NOT c.after_seal THEN RAISE EXCEPTION '1 c4 should arrive after_seal'; END IF;
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b1','from_week',w,'kind','charge','charge_id',c.id,
         'expected_charge_version',c.version));
  PERFORM pg_temp.say('1 late charge: ' || (r - 'carried_fact_ids')::text);
  c := pg_temp.ch('c4');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','b1b','charge_id',c.id,'expected_charge_version',c.version));
  PERFORM pg_temp.nightly('1');

  -- 2. A late payback → its week becomes the open week; posted there; left unlinked
  PERFORM public.toll_sys_import(org, 'uber', '[
    {"row_type":"adjustment","reference":"adj-late","driver_id":"d1","paid_on":"2024-10-12","amount_minor":5000}
  ]'::jsonb, 'imp-uber-late', 'smoke');
  p := pg_temp.pb('adj-late');
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b2','from_week',w,'kind','payback','payback_id',p.id,
         'expected_payback_version',p.version));
  p := pg_temp.pb('adj-late');
  PERFORM pg_temp.say('2 late payback: week now ' || p.week_key || ', after_seal ' || p.after_seal);
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','b2b','payback_id',p.id,'expected_payback_version',p.version,
         'reason_code','not_a_toll'));
  PERFORM pg_temp.nightly('2');

  -- 3. Uber takes back the t1 payback (500: 340 covered c1, 160 left unlinked) → P18a 160 + P18b fleet 340
  p := pg_temp.pb('trip:t1');
  PERFORM pg_temp.refused('carry_forward', jsonb_build_object('command_id','b3x','from_week',w,'kind','take_back','payback_id',p.id,
         'expected_payback_version',p.version,'reference','tb1','paid_on','2026-11-10'), 'BAD_REQUEST');     -- bearer required
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b3','from_week',w,'kind','take_back','payback_id',p.id,
         'expected_payback_version',p.version,'reference','tb1','paid_on','2026-11-10','bearer','fleet'));
  PERFORM pg_temp.say('3 take-back: leftover ' || (r->>'leftover_minor') || ', covered ' || (r->>'covered_minor'));
  PERFORM pg_temp.say('3 again: ' || pg_temp.refused('carry_forward', jsonb_build_object('command_id','b3y','from_week',w,'kind','take_back',
         'payback_id',p.id,'expected_payback_version',(r->>'payback_version')::bigint,'reference','tb1b','paid_on','2026-11-10','bearer','fleet'),
         'WRONG_STATE'));
  PERFORM pg_temp.nightly('3');

  -- 4. Down correction on c2 (500 = driver 300 + fleet 200) → 300: D 200 → driver 120, fleet 80 (P19 tag)
  c := pg_temp.ch('c2');
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b4','from_week',w,'kind','correction_down','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',30000,'reason_code','statement_fix'));
  PERFORM pg_temp.say('4 down: shares ' || (r->'shares')::text);
  IF (r->'shares') <> '{"driver": 12000, "fleet": 8000, "platform": 0}'::jsonb THEN RAISE EXCEPTION '4 shares wrong'; END IF;
  PERFORM pg_temp.nightly('4');

  -- 5. Down correction on c1 (340, all platform) → 240: the platform share 100 waits for a person and blocks the seal
  c := pg_temp.ch('c1');
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b5','from_week',w,'kind','correction_down','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',24000,'reason_code','statement_fix'));
  v_fact := (r->'carried_fact_ids'->>0)::uuid;
  PERFORM pg_temp.say('5 blockers in open week: ' || (SELECT count(*) FROM toll_system.seal_blockers(org, tw) b WHERE b.kind = 'carried'));
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','b5b','carried_fact_id',v_fact,
         'expected_carried_version',(SELECT version FROM toll.carried_facts WHERE id = v_fact),'reason_code','tag_refund_excess'));
  v_dec := (r->>'decision_id')::uuid;
  PERFORM pg_temp.say('5 after deciding it: ' || (SELECT count(*) FROM toll_system.seal_blockers(org, tw) b WHERE b.kind = 'carried'));
  r := pg_temp.cmd('undo_decision', jsonb_build_object('command_id','b5c','decision_id',v_dec,
         'expected_versions', jsonb_build_object(v_fact::text, (SELECT version FROM toll.carried_facts WHERE id = v_fact))));
  PERFORM pg_temp.say('5 after undo: ' || (SELECT count(*) FROM toll_system.seal_blockers(org, tw) b WHERE b.kind = 'carried'));
  PERFORM pg_temp.nightly('5');

  -- 6. Up correction on cash c3 (300 → 350): a new charge of 50, counted and decided in the open week
  c := pg_temp.ch('c3');
  r := pg_temp.cmd('carry_forward', jsonb_build_object('command_id','b6','from_week',w,'kind','correction_up','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',35000,'reason_code','receipt_fix'));
  c := (SELECT x FROM toll.charges x WHERE x.organization_id = org AND x.id = (r->>'adjusting_charge_id')::uuid);
  PERFORM pg_temp.say('6 up: new charge ' || c.amount_minor || ' counted in ' || toll_system.charge_counted_week(org, c.id, c.week_key)
                      || ' state ' || toll_system.charge_state(org, c.id));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','b6b','charge_id',c.id,'expected_charge_version',c.version));
  PERFORM pg_temp.nightly('6');

  -- The paid week never changed; the open week shows the carried money and the driver's lines
  IF toll_system.week_hash(org, w) <> v_hash THEN RAISE EXCEPTION 'the sealed week changed'; END IF;
  r := toll_system.week_result_live(org, tw);
  PERFORM pg_temp.say('open week carriedMoney: ' || (r->'carriedMoney')::text);
  PERFORM pg_temp.say('open week driver d1: ' || (r->'drivers'->0)::text);
END $$;
ROLLBACK;
