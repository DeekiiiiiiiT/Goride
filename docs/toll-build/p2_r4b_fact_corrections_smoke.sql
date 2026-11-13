-- P2-R4b smoke run (Claude): take-backs, amount corrections, week moves. Local only; everything rolls back.
\set ON_ERROR_STOP 1
\set QUIET 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('f0311111-1111-4111-8111-111111111111','fact-smoke@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES ('f3111111-1111-4111-8111-111111111101','f0311111-1111-4111-8111-111111111111','Fact Smoke','fact-smoke','fleet','active');
INSERT INTO toll.switch_state (organization_id, tolls_v2) VALUES ('f3111111-1111-4111-8111-111111111101', true);
SELECT toll_system.ensure_accounts('f3111111-1111-4111-8111-111111111101');

CREATE FUNCTION pg_temp.cmd(p_intent text, p_body jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','f0311111-1111-4111-8111-111111111111','role','authenticated',
    'app_metadata', json_build_object('organizationId','f3111111-1111-4111-8111-111111111101'))::text, true);
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
  SELECT * FROM toll.charges WHERE organization_id='f3111111-1111-4111-8111-111111111101' AND source_ref=p_ref $f$;
CREATE FUNCTION pg_temp.pb(p_ref text) RETURNS toll.paybacks LANGUAGE sql AS $f$
  SELECT * FROM toll.paybacks WHERE organization_id='f3111111-1111-4111-8111-111111111101' AND reference=p_ref $f$;
CREATE FUNCTION pg_temp.say(p text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RAISE NOTICE '%', p; END $f$;
CREATE FUNCTION pg_temp.nightly(p_label text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE x record;
BEGIN
  RESET ROLE;
  FOR x IN SELECT * FROM toll_system.nightly_checks('f3111111-1111-4111-8111-111111111101') LOOP
    IF NOT x.ok THEN RAISE EXCEPTION '% nightly % % failed: %', p_label, x.check_no, x.name, x.detail; END IF;
  END LOOP;
  PERFORM pg_temp.say(p_label || ': nightly ok');
END $f$;
-- The open slices of a charge by bearer
CREATE FUNCTION pg_temp.slices(p_ref text) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(a.bearer || '=' || a.amount_minor, ' ' ORDER BY a.bearer, a.amount_minor), '-')
  FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE c.organization_id='f3111111-1111-4111-8111-111111111101' AND c.source_ref = p_ref AND a.reversed_by IS NULL $f$;

DO $$
DECLARE
  org uuid := 'f3111111-1111-4111-8111-111111111101';
  r jsonb; c toll.charges; p toll.paybacks;
BEGIN
  -- Week W = 2024-10-07, W+1 = 2024-10-14. Uber trips with toll paybacks (card → fleet) and tag crossings.
  PERFORM public.toll_sys_import(org, 'uber', '[
    {"row_type":"trip","platform_trip_id":"t1","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-08T14:00:00-05:00","dropoff_at":"2024-10-08T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t2","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-09T14:00:00-05:00","dropoff_at":"2024-10-09T14:50:00-05:00","payment_method":"card","toll_payback_minor":50000},
    {"row_type":"trip","platform_trip_id":"t3","driver_id":"d1","vehicle_id":"v1","request_at":"2024-10-10T14:00:00-05:00","dropoff_at":"2024-10-10T14:50:00-05:00","payment_method":"cash","toll_payback_minor":20000}
  ]'::jsonb, 'imp-uber', 'smoke');
  PERFORM public.toll_sys_import(org, 'tag_statement', '[
    {"source_ref":"c1","occurred_at":"2024-10-08T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzA","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c2","occurred_at":"2024-10-09T14:20:00-05:00","amount_minor":34000,"plaza_id":"pzB","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c3","occurred_at":"2024-10-10T14:20:00-05:00","amount_minor":50000,"plaza_id":"pzC","vehicle_id":"v1","driver_id":"d1"},
    {"source_ref":"c4","occurred_at":"2024-10-11T09:00:00-05:00","amount_minor":50000,"plaza_id":"pzD","vehicle_id":"v1","driver_id":"d1"}
  ]'::jsonb, 'imp-tag', 'smoke');

  -- 1. Same-week take-back with a leftover: t1 payback 500 covers c1 (340), leftover 160 left unlinked.
  c := pg_temp.ch('c1'); p := pg_temp.pb('trip:t1');
  r := pg_temp.cmd('link_payback', jsonb_build_object('command_id','a1','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  p := pg_temp.pb('trip:t1');
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','a2','payback_id',p.id,
         'expected_payback_version',p.version,'reason_code','rider_paid_more'));
  p := pg_temp.pb('trip:t1');
  PERFORM pg_temp.say('1 partial: ' || pg_temp.refused('reverse_payback', jsonb_build_object('command_id','a3x','payback_id',p.id,
         'expected_payback_version',p.version,'reference','tb1','paid_on','2024-10-10','amount_minor',100), 'PARTIAL_TAKE_BACK'));
  r := pg_temp.cmd('reverse_payback', jsonb_build_object('command_id','a3','payback_id',p.id,
         'expected_payback_version',p.version,'reference','tb1','paid_on','2024-10-10'));
  PERFORM pg_temp.say('1 take-back same week: ' || (r - 'charge_versions')::text);
  IF toll_system.charge_state(org, (pg_temp.ch('c1')).id) <> 'pending' THEN RAISE EXCEPTION '1 c1 should be pending'; END IF;
  PERFORM pg_temp.say('1 again: ' || pg_temp.refused('reverse_payback', jsonb_build_object('command_id','a4','payback_id',p.id,
         'expected_payback_version',(r->>'payback_version')::bigint,'reference','tb1b','paid_on','2024-10-10'), 'WRONG_STATE'));
  PERFORM pg_temp.nightly('1');

  -- 2. Cross-week take-back with a leftover: t2 payback 500 covers c2 (340); take-back arrives in W+1.
  c := pg_temp.ch('c2'); p := pg_temp.pb('trip:t2');
  r := pg_temp.cmd('link_payback', jsonb_build_object('command_id','b1','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  p := pg_temp.pb('trip:t2');
  r := pg_temp.cmd('reverse_payback', jsonb_build_object('command_id','b2','payback_id',p.id,
         'expected_payback_version',p.version,'reference','tb2','paid_on','2024-10-16'));
  PERFORM pg_temp.say('2 take-back next week: ' || (r->'weeks')::text);
  PERFORM pg_temp.nightly('2 (cross-week, leftover 160 stays in W)');

  -- 3. Amount down below the slices: c4 500 = driver 300 + fleet 200 → 300 (short 200 → driver 120, fleet 80)
  c := pg_temp.ch('c4');
  r := pg_temp.cmd('driver_pays', jsonb_build_object('command_id','c1','charge_id',c.id,'expected_charge_version',c.version,'amount_minor',30000));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','c2','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));
  PERFORM pg_temp.refused('correct_charge_amount', jsonb_build_object('command_id','c3x','charge_id',c.id,
         'expected_charge_version',(r->>'charge_version')::bigint,'amount_minor',30000), 'BAD_REQUEST');   -- reason required
  r := pg_temp.cmd('correct_charge_amount', jsonb_build_object('command_id','c3','charge_id',c.id,
         'expected_charge_version',(r->>'charge_version')::bigint,'amount_minor',30000,'reason_code','statement_fix'));
  PERFORM pg_temp.say('3 down: slices now ' || pg_temp.slices('c4') || ' state ' || toll_system.charge_state(org, c.id));
  IF pg_temp.slices('c4') <> 'driver=18000 fleet=12000' THEN RAISE EXCEPTION '3 proportional split wrong: %', pg_temp.slices('c4'); END IF;
  PERFORM pg_temp.nightly('3');

  -- 4. Amount up on a decided charge: pending for the difference
  c := pg_temp.ch('c4');
  r := pg_temp.cmd('correct_charge_amount', jsonb_build_object('command_id','d1','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',30500,'reason_code','statement_fix'));
  PERFORM pg_temp.say('4 up: state ' || toll_system.charge_state(org, c.id) || ' open ' || toll_system.charge_open_minor(org, c.id));
  PERFORM pg_temp.nightly('4');

  -- 5. Down with a platform slice: c3 500 linked to the t3 cash payback 200 + fleet 300 → 250 (short 250)
  --    → platform 100, fleet 150; the payback gets a 100 leftover.
  c := pg_temp.ch('c3'); p := pg_temp.pb('trip:t3');
  r := pg_temp.cmd('link_payback', jsonb_build_object('command_id','e1','charge_id',c.id,'payback_id',p.id,
         'expected_charge_version',c.version,'expected_payback_version',p.version));
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','e2','charge_id',c.id,'expected_charge_version',(r->>'charge_version')::bigint));
  r := pg_temp.cmd('correct_charge_amount', jsonb_build_object('command_id','e3','charge_id',c.id,
         'expected_charge_version',(r->>'charge_version')::bigint,'amount_minor',25000,'reason_code','statement_fix'));
  PERFORM pg_temp.say('5 down with platform: slices ' || pg_temp.slices('c3') || ' payback leftover '
                      || toll_system.payback_open_minor(org, p.id));
  IF pg_temp.slices('c3') <> 'fleet=15000 platform=10000' OR toll_system.payback_open_minor(org, p.id) <> 10000 THEN
    RAISE EXCEPTION '5 split wrong'; END IF;
  PERFORM pg_temp.nightly('5');

  -- 6. Week move: c3 (decided, with a platform slice) moves into W+1
  c := pg_temp.ch('c3');
  r := pg_temp.cmd('correct_charge_week', jsonb_build_object('command_id','f1','charge_id',c.id,
         'expected_charge_version',c.version,'occurred_at','2024-10-15T09:00:00-05:00','reason_code','wrong_date'));
  PERFORM pg_temp.say('6 week move: ' || (r->'weeks')::text || ' slices ' || pg_temp.slices('c3'));
  PERFORM pg_temp.nightly('6');

  -- 7. Seal W+1 is not possible (pending charges), but seal W after deciding what is left, then a correction is refused
  c := pg_temp.ch('c1');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','g1','charge_id',c.id,'expected_charge_version',c.version));
  c := pg_temp.ch('c2');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','g2','charge_id',c.id,'expected_charge_version',c.version));
  c := pg_temp.ch('c4');
  r := pg_temp.cmd('fleet_absorbs', jsonb_build_object('command_id','g3','charge_id',c.id,'expected_charge_version',c.version));
  p := pg_temp.pb('trip:t3');   -- step 5 left a 100 leftover on the cash payback: the seal would refuse it (checked)
  PERFORM pg_temp.say('7 before deciding the leftover: ' || pg_temp.refused('seal_week', jsonb_build_object('command_id','g4x',
         'week_key','2024-10-07','expected_week_version',0), 'PENDING_NOT_RESOLVED'));
  r := pg_temp.cmd('leave_payback_unlinked', jsonb_build_object('command_id','g3b','payback_id',p.id,
         'expected_payback_version',p.version,'reason_code','charge_corrected_down'));
  r := pg_temp.cmd('seal_week', jsonb_build_object('command_id','g4','week_key','2024-10-07','expected_week_version',0));
  PERFORM pg_temp.say('7 sealed W: ' || (r->'weeks')::text);
  c := pg_temp.ch('c4');
  PERFORM pg_temp.say('7 after seal: ' || pg_temp.refused('correct_charge_amount', jsonb_build_object('command_id','g5','charge_id',c.id,
         'expected_charge_version',c.version,'amount_minor',100,'reason_code','x'), 'WEEK_SEALED'));
  PERFORM pg_temp.nightly('7');
END $$;
ROLLBACK;
