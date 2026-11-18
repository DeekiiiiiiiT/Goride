-- Toll disputes S1: dispute commands and money (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('f0111111-1111-4111-8111-111111111111'::uuid, 'toll-s1-cmd@example.com'),
  ('f0121111-1111-4111-8111-111111111112'::uuid, 'toll-s1-mgr2@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
VALUES ('fleet_manager', 'Fleet Manager', 'S1 disputes second seat', 50, 'fleet', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status)
SELECT 'f0121111-1111-4111-8111-111111111112'::uuid, r.id, 'organization',
       'f1111111-1111-4111-8111-111111111101'::uuid, 'active'
FROM platform.roles r WHERE r.name = 'fleet_manager'
ON CONFLICT DO NOTHING;

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'f1111111-1111-4111-8111-111111111101',
  'f0111111-1111-4111-8111-111111111111',
  'Toll S1 Disputes',
  'toll-s1-disputes',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes)
VALUES ('f1111111-1111-4111-8111-111111111101', true, true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true, toll_disputes = true;

SELECT toll_system.ensure_accounts('f1111111-1111-4111-8111-111111111101');
SELECT toll_system.seed_dispute_setup('f1111111-1111-4111-8111-111111111101', false);

CREATE OR REPLACE FUNCTION pg_temp._s1_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._s1_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s1_as('f0111111-1111-4111-8111-111111111111'::uuid, 'f1111111-1111-4111-8111-111111111101'::uuid);
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._s1_cmd_as(p_user uuid, p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ca$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s1_as(p_user, 'f1111111-1111-4111-8111-111111111101'::uuid);
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$ca$;

CREATE OR REPLACE FUNCTION pg_temp._s1_refused(p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._s1_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's1 expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's1 expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._s1_ch(p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges
  WHERE organization_id = 'f1111111-1111-4111-8111-111111111101'::uuid AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._s1_pb(p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks
  WHERE organization_id = 'f1111111-1111-4111-8111-111111111101'::uuid AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._s1_bal(p_suffix text) RETURNS bigint
LANGUAGE sql AS $b$
  SELECT coalesce(
    (SELECT balance_minor FROM ledger.accounts
     WHERE account_key = 'org:f1111111-1111-4111-8111-111111111101:toll:' || p_suffix),
    0);
$b$;

CREATE OR REPLACE FUNCTION pg_temp._s1_alloc_ok(p_charge uuid) RETURNS void
LANGUAGE plpgsql AS $ok$
DECLARE v_amt bigint; v_sum bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.charges
  WHERE organization_id = 'f1111111-1111-4111-8111-111111111101'::uuid AND id = p_charge;
  SELECT coalesce(sum(amount_minor), 0) INTO v_sum FROM toll.allocations
  WHERE organization_id = 'f1111111-1111-4111-8111-111111111101'::uuid
    AND charge_id = p_charge AND reversed_by IS NULL;
  IF v_sum <> v_amt THEN
    RAISE EXCEPTION 'alloc sum % <> charge %', v_sum, v_amt;
  END IF;
END;
$ok$;

CREATE OR REPLACE FUNCTION pg_temp._s1_import390(p_suffix text, p_week date, p_occurred timestamptz, p_trip_at timestamptz)
RETURNS void
LANGUAGE plpgsql AS $imp$
BEGIN
  PERFORM public.toll_sys_import('f1111111-1111-4111-8111-111111111101'::uuid, 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s1-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":37000}]'::text,
    's1-trip-' || p_suffix, p_trip_at, p_trip_at + interval '40 minutes')::jsonb,
    's1-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import('f1111111-1111-4111-8111-111111111101'::uuid, 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":39000,"plaza_id":"s1-pz",
      "vehicle_id":"v1","driver_id":"s1-d1"}]'::text,
    's1-ch-' || p_suffix, p_occurred)::jsonb,
    's1-tag-' || p_suffix, 'smoke');
END;
$imp$;

CREATE OR REPLACE FUNCTION pg_temp._s1_setup390(
  p_suffix text, p_weeks_ago int DEFAULT 14, OUT charge_id uuid, OUT trip_pb_id uuid, OUT week_key date)
LANGUAGE plpgsql AS $set$
DECLARE c toll.charges; p toll.paybacks; r jsonb;
  v_week date := ledger.jamaica_week_start(
    (now() AT TIME ZONE 'America/Jamaica')::timestamptz - (p_weeks_ago || ' days')::interval);
  v_occurred timestamptz := ((v_week + 2) + time '14:00') AT TIME ZONE 'America/Jamaica';
  v_trip timestamptz := (((now() AT TIME ZONE 'America/Jamaica')::date - 3) + time '15:00') AT TIME ZONE 'America/Jamaica';
BEGIN
  PERFORM pg_temp._s1_import390(p_suffix, v_week, v_occurred, v_trip);
  c := pg_temp._s1_ch('s1-ch-' || p_suffix);
  p := pg_temp._s1_pb('trip:s1-trip-' || p_suffix);
  r := pg_temp._s1_cmd('link_payback', jsonb_build_object(
    'command_id', 's1-link-' || p_suffix, 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  charge_id := c.id;
  trip_pb_id := p.id;
  week_key := toll_system.charge_counted_week('f1111111-1111-4111-8111-111111111101'::uuid, c.id, c.week_key);
END;
$set$;

CREATE OR REPLACE FUNCTION pg_temp._s1_org() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'f1111111-1111-4111-8111-111111111101'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s1_assert_nightly() RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM toll_system.nightly_checks(pg_temp._s1_org()) LOOP
    IF NOT r.ok THEN
      RAISE EXCEPTION 'nightly % (check %) %', r.name, r.check_no, r.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._s1_snap_bals() RETURNS jsonb
LANGUAGE sql AS $s$
  SELECT jsonb_build_object(
    'receivable_platform_dispute', pg_temp._s1_bal('receivable_platform_dispute'),
    'payback_unallocated', pg_temp._s1_bal('payback_unallocated'),
    'receivable_driver', pg_temp._s1_bal('receivable_driver'),
    'expense', pg_temp._s1_bal('expense'),
    'suspense', pg_temp._s1_bal('suspense'));
$s$;

CREATE OR REPLACE FUNCTION pg_temp._s1_week_ledger_hash(p_week date) RETURNS text
LANGUAGE sql AS $h$
  SELECT coalesce(md5(string_agg(
    e.id::text || ':' || e.amount_minor::text || ':' || coalesce(e.metadata ->> 'toll_rule', ''),
    '|' ORDER BY e.id)), '')
  FROM ledger.entries e
  WHERE e.organization_id = pg_temp._s1_org() AND e.reference_type = 'toll'
    AND (e.metadata ->> 'toll_week')::date = p_week;
$h$;

CREATE OR REPLACE FUNCTION pg_temp._s1_assert_snap(p_exp jsonb, p_label text) RETURNS void
LANGUAGE plpgsql AS $as$
DECLARE k text; v bigint; e bigint;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each_text(p_exp) LOOP
    e := pg_temp._s1_bal(k);
    IF e IS DISTINCT FROM v::bigint THEN
      RAISE EXCEPTION '% balance % got % expected %', p_label, k, e, v;
    END IF;
  END LOOP;
END;
$as$;

CREATE OR REPLACE FUNCTION pg_temp._s1_alloc_sum(p_charge uuid) RETURNS bigint
LANGUAGE sql AS $as$
  SELECT coalesce(sum(a.amount_minor), 0) FROM toll.allocations a
  WHERE a.organization_id = pg_temp._s1_org() AND a.charge_id = p_charge AND a.reversed_by IS NULL;
$as$;

CREATE OR REPLACE FUNCTION pg_temp._s1_assert_delta(
  p_before jsonb, p_label text,
  p_rpd bigint, p_payback bigint, p_driver bigint, p_expense bigint, p_suspense bigint
) RETURNS void
LANGUAGE plpgsql AS $ad$
DECLARE
  keys text[] := ARRAY[
    'receivable_platform_dispute', 'payback_unallocated', 'receivable_driver', 'expense', 'suspense'];
  exp    bigint[] := ARRAY[p_rpd, p_payback, p_driver, p_expense, p_suspense];
  i      int;
  got    bigint;
  bef    bigint;
BEGIN
  FOR i IN 1..5 LOOP
    got := pg_temp._s1_bal(keys[i]);
    bef := (p_before ->> keys[i])::bigint;
    IF got - bef IS DISTINCT FROM exp[i] THEN
      RAISE EXCEPTION '% delta % got % expected %', p_label, keys[i], got - bef, exp[i];
    END IF;
  END LOOP;
END;
$ad$;

DO $$
DECLARE
  v_org       uuid := 'f1111111-1111-4111-8111-111111111101';
  v_owner     uuid := 'f0111111-1111-4111-8111-111111111111';
  v_week      date;
  v_charge    uuid;
  v_pb_trip   uuid;
  v_pb_adj    uuid;
  v_dispute   uuid;
  v_disp_ver  bigint;
  v_dec       uuid;
  v_settle    uuid;
  v_r         jsonb;
  v_wk        jsonb;
  c           toll.charges;
  p           toll.paybacks;
  d           toll.disputes;
  v_sum       bigint;
  v_cnt       int;
  v_post_wk   date;
  v_sug       uuid;
  v_sug_w     uuid;
  v_pend_ch   uuid;
  v_snap      jsonb;
  v_hash_pre  text;
  v_hash_post text;
  v_dl        timestamptz;
  v_pw        date;
BEGIN
  -- F8 deadline: trip 9 Nov, 9-day window → 18 Nov 23:59:59 Jamaica
  v_dl := toll_system.dispute_deadline('2025-11-09'::date, 9);
  IF (v_dl AT TIME ZONE 'America/Jamaica')::timestamp <> timestamp '2025-11-18 23:59:59' THEN
    RAISE EXCEPTION 'F8 deadline got %', v_dl;
  END IF;

  -- ── 1–2: J$390 / J$370, open dispute, seal, disputedMinor ──
  SELECT * INTO v_charge, v_pb_trip, v_week FROM pg_temp._s1_setup390('a');

  c := pg_temp._s1_ch('s1-ch-a');
  p := pg_temp._s1_pb('trip:s1-trip-a');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-a', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;

  c := pg_temp._s1_ch('s1-ch-a');
  IF toll_system.charge_state(v_org, c.id) <> 'decided' THEN
    RAISE EXCEPTION '1 charge not decided';
  END IF;
  IF pg_temp._s1_bal('receivable_platform_dispute') <> -2000 THEN
    RAISE EXCEPTION '1 P21 bal got %', pg_temp._s1_bal('receivable_platform_dispute');
  END IF;
  PERFORM pg_temp._s1_alloc_ok(c.id);

  v_wk := toll_system.week_result_live(v_org, v_week);
  IF coalesce((v_wk -> 'spend' ->> 'disputedMinor')::bigint, 0) <> 2000 THEN
    RAISE EXCEPTION '1 disputedMinor got %', v_wk -> 'spend' ->> 'disputedMinor';
  END IF;

  v_r := pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-seal-a', 'week_key', v_week, 'expected_week_version', 0));
  IF NOT toll_system.week_is_sealed(v_org, v_week) THEN
    RAISE EXCEPTION '1 week not sealed';
  END IF;
  PERFORM pg_temp._s1_assert_nightly();

  v_hash_pre := pg_temp._s1_week_ledger_hash(v_week);

  -- ── 2: mark sent, adjustment J$20, settle won (sealed charge week) ──
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-sent-a', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));

  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-a","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-imp-a', 'smoke');
  p := pg_temp._s1_pb('s1-adj-a');

  v_snap := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-settle-a', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version));
  v_settle := (v_r ->> 'decision_id')::uuid;

  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'won' THEN RAISE EXCEPTION '2 state %', d.state; END IF;
  IF pg_temp._s1_bal('receivable_platform_dispute') <> 0 THEN
    RAISE EXCEPTION '2 receivable_platform_dispute %', pg_temp._s1_bal('receivable_platform_dispute');
  END IF;
  v_post_wk := toll_system.posting_week(v_org);
  SELECT count(*)::int INTO v_cnt FROM toll.carried_facts f
  WHERE f.organization_id = v_org AND f.dispute_id = v_dispute AND f.kind = 'dispute_result'
    AND f.to_week = v_post_wk;
  IF v_cnt < 1 THEN RAISE EXCEPTION '2 missing carried dispute_result'; END IF;
  c := pg_temp._s1_ch('s1-ch-a');
  PERFORM pg_temp._s1_alloc_ok(c.id);
  PERFORM pg_temp._s1_assert_nightly();

  -- ── 8: undo won settle → sent + provisional back ──
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-undo-a',
    'decision_id', v_settle,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.close_reason <> 'undo' THEN RAISE EXCEPTION '8 old close_reason'; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND reopens_id = v_dispute
    AND state IN ('sent', 'to_send') ORDER BY created_at DESC LIMIT 1;
  IF d.id IS NULL THEN RAISE EXCEPTION '8 no reopened dispute'; END IF;
  IF toll_system.dispute_active_provisional_amt(v_org, d.id) <> 2000 THEN
    RAISE EXCEPTION '8 provisional amt';
  END IF;
  PERFORM pg_temp._s1_assert_snap(v_snap, 'undo-won-sealed');
  v_hash_post := pg_temp._s1_week_ledger_hash(v_week);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN
    RAISE EXCEPTION '8 sealed week ledger changed';
  END IF;
  PERFORM pg_temp._s1_assert_nightly();

  -- F7: reopen sealed week A — posting_week must not be A+7 while A is draft again (four-eyes)
  v_r := pg_temp._s1_cmd('request_approval', jsonb_build_object(
    'command_id', 's1-reopen-req', 'intent', 'reopen_week',
    'body', jsonb_build_object(
      'command_id', 's1-reopen-a', 'week_key', v_week, 'expected_week_version', 1,
      'reason', 's1 F7 posting_week after reopen'),
    'note', 'F7 reopen'));
  v_r := pg_temp._s1_cmd_as('f0121111-1111-4111-8111-111111111112'::uuid, 'approve_request', jsonb_build_object(
    'command_id', 's1-reopen-appr', 'request_id', (v_r ->> 'request_id')::uuid));
  v_pw := toll_system.posting_week(v_org);
  IF v_pw = v_week + 7 OR toll_system.week_is_sealed(v_org, v_week) THEN
    RAISE EXCEPTION 'F7 posting_week % week %', v_pw, v_week;
  END IF;
  PERFORM pg_temp._s1_assert_nightly();
  -- seal week A again: block 6 below relies on it being sealed
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-reseal-a', 'week_key', v_week,
    'expected_week_version', toll_system.week_version(v_org, v_week)));
  IF NOT toll_system.week_is_sealed(v_org, v_week) THEN RAISE EXCEPTION 'F7 re-seal failed'; END IF;
  PERFORM pg_temp._s1_assert_nightly();

  -- ── 3: part refund J$10 then close_lost (fresh charge) ──
  SELECT * INTO v_charge, v_pb_trip, v_week FROM pg_temp._s1_setup390('b', 21);
  c := pg_temp._s1_ch('s1-ch-b');
  p := pg_temp._s1_pb('trip:s1-trip-b');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-b', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-sent-b', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));

  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-b1","driver_id":"s1-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-imp-b1', 'smoke');
  p := pg_temp._s1_pb('s1-adj-b1');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-settle-b10', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version,
    'amount_minor', 1000));

  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-lost-b', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'part_won' THEN RAISE EXCEPTION '3 state %', d.state; END IF;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_sum FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = v_charge AND a.reversed_by IS NULL
    AND a.bearer = 'fleet' AND a.dispute_id = v_dispute;
  IF v_sum <> 1000 THEN RAISE EXCEPTION '3 fleet rest got %', v_sum; END IF;
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();

  -- ── 4: expire to_send then system settle won on expired (driver bore) ──
  SELECT * INTO v_charge, v_pb_trip, v_week FROM pg_temp._s1_setup390('c', 28);
  c := pg_temp._s1_ch('s1-ch-c');
  p := pg_temp._s1_pb('trip:s1-trip-c');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-c', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;

  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-expire-dec', 'dispute_expire', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_system.dispute_expire(v_org, v_dispute, v_dec, 's1-expire-cmd');

  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'expired' OR d.opened_late IS TRUE THEN
    RAISE EXCEPTION '4 expire state % late %', d.state, d.opened_late;
  END IF;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_sum FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = v_charge AND a.reversed_by IS NULL
    AND a.bearer = 'driver' AND a.dispute_id = v_dispute;
  IF v_sum <> 2000 THEN RAISE EXCEPTION '4 driver bore %', v_sum; END IF;

  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-c","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-imp-c', 'smoke');
  p := pg_temp._s1_pb('s1-adj-c');
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-settle-sys', 'settle_dispute', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_write.intent_settle_dispute(v_org, v_dec, 's1-sys-settle', jsonb_build_object(
    'dispute_id', v_dispute, 'payback_id', p.id, 'expected_dispute_version', d.version,
    'expected_payback_version', p.version), true);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'won' THEN RAISE EXCEPTION '4 won state %', d.state; END IF;
  PERFORM pg_temp._s1_alloc_ok(v_charge);

  -- ── 5: late open → expired, fleet bears ──
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '49 days');
  PERFORM pg_temp._s1_import390('late', v_week,
    ((v_week + 2) + time '10:00') AT TIME ZONE 'America/Jamaica',
    (((now() AT TIME ZONE 'America/Jamaica')::date - 30) + time '15:00') AT TIME ZONE 'America/Jamaica');
  c := pg_temp._s1_ch('s1-ch-late');
  p := pg_temp._s1_pb('trip:s1-trip-late');
  v_r := pg_temp._s1_cmd('link_payback', jsonb_build_object(
    'command_id', 's1-link-late', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  c := pg_temp._s1_ch('s1-ch-late');
  p := pg_temp._s1_pb('trip:s1-trip-late');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-late', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  IF d.state <> 'expired' OR d.opened_late IS NOT TRUE THEN
    RAISE EXCEPTION '5 late open state %', d.state;
  END IF;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_sum FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = c.id AND a.reversed_by IS NULL
    AND a.bearer = 'fleet' AND a.dispute_id = v_dispute;
  IF v_sum <> 2000 THEN RAISE EXCEPTION '5 fleet %', v_sum; END IF;
  PERFORM pg_temp._s1_assert_nightly();

  -- ── 6: refusals ──
  c := pg_temp._s1_ch('s1-ch-a');
  p := pg_temp._s1_pb('trip:s1-trip-a');
  PERFORM pg_temp._s1_refused('open_dispute', jsonb_build_object(
    'command_id', 's1-ref-sealed', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version), 'charge_sealed');

  SELECT * INTO v_charge, v_pb_trip, v_week FROM pg_temp._s1_setup390('ref2', 35);
  c := pg_temp._s1_ch('s1-ch-ref2');
  p := pg_temp._s1_pb('trip:s1-trip-ref2');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-ref2', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '1 hour' WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_refused('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-ref-window', 'dispute_id', v_dispute, 'expected_dispute_version', d.version), 'window_closed');

  c := pg_temp._s1_ch('s1-ch-ref2');
  p := pg_temp._s1_pb('trip:s1-trip-ref2');
  PERFORM pg_temp._s1_refused('open_dispute', jsonb_build_object(
    'command_id', 's1-ref-second', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version), 'DISPUTE_SECOND_OPEN');

  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org;
  c := pg_temp._s1_ch('s1-ch-ref2');
  p := pg_temp._s1_pb('trip:s1-trip-ref2');
  PERFORM pg_temp._s1_refused('open_dispute', jsonb_build_object(
    'command_id', 's1-ref-off', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version), 'DISPUTES_OFF');
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = v_org;

  -- ── 7: settle caps (two refunds one txn worth of links) ──
  SELECT * INTO v_charge, v_pb_trip, v_week FROM pg_temp._s1_setup390('cap', 42);
  c := pg_temp._s1_ch('s1-ch-cap');
  p := pg_temp._s1_pb('trip:s1-trip-cap');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-open-cap', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-sent-cap', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));

  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-cap1","driver_id":"s1-d1","paid_on":"%s","amount_minor":1500},
      {"row_type":"adjustment","reference":"s1-adj-cap2","driver_id":"s1-d1","paid_on":"%s","amount_minor":1500}]',
    (now() AT TIME ZONE 'America/Jamaica')::date, (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb,
    's1-adj-cap', 'smoke');
  p := pg_temp._s1_pb('s1-adj-cap1');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-cap-1', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version));
  p := pg_temp._s1_pb('s1-adj-cap2');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-cap-2', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version,
    'amount_minor', 500));
  SELECT coalesce(sum(l.amount_minor), 0) INTO v_sum FROM toll.dispute_links l
  WHERE l.organization_id = v_org AND l.dispute_id = v_dispute AND l.reversed_by IS NULL;
  IF v_sum <> 2000 THEN RAISE EXCEPTION '7 links sum %', v_sum; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  p := pg_temp._s1_pb('s1-adj-cap2');
  IF d.state = 'won' THEN
    PERFORM pg_temp._s1_refused('settle_dispute', jsonb_build_object(
      'command_id', 's1-cap-over', 'dispute_id', v_dispute, 'payback_id', p.id,
      'expected_dispute_version', d.version, 'expected_payback_version', p.version,
      'amount_minor', 1), 'WRONG_STATE');
  ELSE
    RAISE EXCEPTION '7 expected won state got %', d.state;
  END IF;
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();

  -- ── 9: driver_pays with suggestion_id ──
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '56 days');
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s1-ch-sug","occurred_at":"%s","amount_minor":5000,"plaza_id":"s1-pz","vehicle_id":"v1","driver_id":"s1-d1"}]',
    ((v_week + 3) + time '11:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's1-tag-sug', 'smoke');
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"s1-trip-sug","driver_id":"s1-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":5000}]',
    ((v_week + 3) + time '11:00') AT TIME ZONE 'America/Jamaica',
    ((v_week + 3) + time '11:40') AT TIME ZONE 'America/Jamaica')::jsonb, 's1-uber-sug', 'smoke');
  c := pg_temp._s1_ch('s1-ch-sug');
  p := pg_temp._s1_pb('trip:s1-trip-sug');
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 's1-sug-fix', 'test', 'user') RETURNING id INTO v_dec;
  INSERT INTO toll.suggestions (
    organization_id, charge_id, payback_id, score_parts, rules_fired, engine_version, inputs, inputs_hash)
  VALUES (v_org, c.id, p.id, '{"total": 0.9}'::jsonb, ARRAY['test'], 'toll_matcher_v1', '{}'::jsonb, 's1')
  RETURNING id INTO v_sug;
  v_r := pg_temp._s1_cmd('driver_pays', jsonb_build_object(
    'command_id', 's1-drv-sug', 'charge_id', c.id, 'expected_charge_version', c.version,
    'suggestion_id', v_sug));
  SELECT id INTO v_sug_w FROM toll.suggestions
  WHERE organization_id = v_org AND charge_id = c.id AND 'withdrawn' = ANY (rules_fired)
  ORDER BY created_at DESC LIMIT 1;
  IF v_sug_w IS NULL THEN RAISE EXCEPTION '9 no withdrawn suggestion'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM toll.decisions dec WHERE dec.organization_id = v_org AND dec.command_id = 's1-drv-sug'
      AND dec.targets ? 'suggestion_id'
  ) THEN
    RAISE EXCEPTION '9 decision missing suggestion_id';
  END IF;

  -- ── 10: seal blockers carry part ──
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '63 days');
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 's1-block-fix', 'test', 'user') RETURNING id INTO v_dec;
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id, evidence_status)
  VALUES (v_org, ((v_week + 1) + time '09:00') AT TIME ZONE 'America/Jamaica', v_week, 'exact', 3000,
    'tag', 'manual', 's1-unver', 's1-d1', 'unverified') RETURNING id INTO v_charge;

  -- through the real import, so its P2 posting exists and the nightly check can balance
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s1-pend","occurred_at":"%s","amount_minor":4000,"plaza_id":"s1-pz","vehicle_id":"v1","driver_id":"s1-d1"}]',
    ((v_week + 2) + time '09:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's1-tag-pend', 'smoke');
  v_pend_ch := (pg_temp._s1_ch('s1-pend')).id;

  PERFORM pg_temp._s1_refused('seal_week', jsonb_build_object(
    'command_id', 's1-seal-block', 'week_key', v_week, 'expected_week_version', 0), 'PENDING_NOT_RESOLVED');

  -- block 10 needs blocking JSON with parts — call seal and inspect via exception detail is hard; query seal_blockers
  SELECT count(*)::int INTO v_cnt FROM toll_system.seal_blockers(v_org, v_week) b
  WHERE b.part = 5 AND b.reason = 'unverified';
  IF v_cnt < 1 THEN RAISE EXCEPTION '10 unverified part 5'; END IF;
  SELECT count(*)::int INTO v_cnt FROM toll_system.seal_blockers(v_org, v_week) b
  WHERE b.part = 4 AND b.reason = 'pending';
  IF v_cnt < 1 THEN RAISE EXCEPTION '10 pending part 4'; END IF;
  PERFORM pg_temp._s1_assert_nightly();

  RAISE NOTICE 'toll_dispute_commands_test: ok';
END;
$$;

-- Open charge week: full refund (money path without P22 double-post)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_settle uuid; v_rpd0 bigint;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-open', 70);
  v_rpd0 := pg_temp._s1_bal('receivable_platform_dispute');
  c := pg_temp._s1_ch('s1-ch-mx-open');
  p := pg_temp._s1_pb('trip:s1-trip-mx-open');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-open-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-open","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-open', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-open');
  v_snap := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-open-settle', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version));
  v_settle := (v_r ->> 'decision_id')::uuid;
  IF pg_temp._s1_bal('receivable_platform_dispute') <> v_rpd0 THEN
    RAISE EXCEPTION 'mx-open rpd % want %', pg_temp._s1_bal('receivable_platform_dispute'), v_rpd0;
  END IF;
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
  c := pg_temp._s1_ch('s1-ch-mx-open');
  p := pg_temp._s1_pb('s1-adj-mx-open');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-open-undo', 'decision_id', v_settle,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'undo-won-open');
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-a-open: part refund then lost (open charge week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org(); v_owner uuid := 'f0111111-1111-4111-8111-111111111111'::uuid;
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-a-open', 84);
  c := pg_temp._s1_ch('s1-ch-mx-a-open'); p := pg_temp._s1_pb('trip:s1-trip-mx-a-open');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-a-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-a-open-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-a-open","driver_id":"s1-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-a-open', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-a-open');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-a-open-st10', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version, 'amount_minor', 1000));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-a-open-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-a-open', 2000, 0, 0, -1000, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-a-seal: part refund then lost (sealed charge week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-a-seal', 98);
  c := pg_temp._s1_ch('s1-ch-mx-a-seal'); p := pg_temp._s1_pb('trip:s1-trip-mx-a-seal');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-a-seal', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-a-seal-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_r := pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-a-seal-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-a-seal","driver_id":"s1-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-a-seal', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-a-seal');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-a-seal-st10', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version, 'amount_minor', 1000));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-a-seal-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-a-seal', 2000, 0, 0, -1000, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-b-open: lost without refund (open week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-b-open', 112);
  c := pg_temp._s1_ch('s1-ch-mx-b-open'); p := pg_temp._s1_pb('trip:s1-trip-mx-b-open');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-b-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-b-open-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-b-open-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-b-open', 2000, 0, 0, -2000, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-b-seal: lost without refund (sealed week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-b-seal', 126);
  c := pg_temp._s1_ch('s1-ch-mx-b-seal'); p := pg_temp._s1_pb('trip:s1-trip-mx-b-seal');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-b-seal', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-b-seal-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-b-seal-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-b-seal-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-b-seal', 2000, 0, 0, -2000, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-c-open: expire then full refund (open week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org(); v_owner uuid := 'f0111111-1111-4111-8111-111111111111'::uuid;
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb; v_dec uuid;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-c-open', 140);
  c := pg_temp._s1_ch('s1-ch-mx-c-open'); p := pg_temp._s1_pb('trip:s1-trip-mx-c-open');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-c-open', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-c-open-exp', 'dispute_expire', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_system.dispute_expire(v_org, v_dispute, v_dec, 's1-mx-c-open-exp-cmd');
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-c-open-after-expire', 2000, 0, -2000, 0, 0);
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-c-open","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-c-open', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-c-open');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-c-open-settle', 'settle_dispute', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_write.intent_settle_dispute(v_org, v_dec, 's1-mx-c-open-settle-cmd', jsonb_build_object(
    'dispute_id', v_dispute, 'payback_id', p.id, 'expected_dispute_version', d.version,
    'expected_payback_version', p.version), true);
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-c-open-after-refund', 2000, 0, 0, 0, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-c-seal: expire then full refund (sealed week)
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org(); v_owner uuid := 'f0111111-1111-4111-8111-111111111111'::uuid;
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_base jsonb; v_dec uuid;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-c-seal', 154);
  c := pg_temp._s1_ch('s1-ch-mx-c-seal'); p := pg_temp._s1_pb('trip:s1-trip-mx-c-seal');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-c-seal', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_base := pg_temp._s1_snap_bals();
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-c-seal-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-c-seal-exp', 'dispute_expire', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_system.dispute_expire(v_org, v_dispute, v_dec, 's1-mx-c-seal-exp-cmd');
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-c-seal-after-expire', 2000, 0, -2000, 0, 0);
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-c-seal","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-c-seal', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-c-seal');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-c-seal-settle', 'settle_dispute', 'user', v_owner) RETURNING id INTO v_dec;
  PERFORM toll_write.intent_settle_dispute(v_org, v_dec, 's1-mx-c-seal-settle-cmd', jsonb_build_object(
    'dispute_id', v_dispute, 'payback_id', p.id, 'expected_dispute_version', d.version,
    'expected_payback_version', p.version), true);
  PERFORM pg_temp._s1_assert_delta(v_base, 'mx-c-seal-after-refund', 2000, 0, 0, 0, 0);
  PERFORM pg_temp._s1_alloc_ok(v_charge);
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-pw-open: undo part_won restores balances and allocation sum
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_result uuid;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-upo', 168);
  c := pg_temp._s1_ch('s1-ch-mx-upo'); p := pg_temp._s1_pb('trip:s1-trip-mx-upo');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-upo', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-upo-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-upo","driver_id":"s1-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-upo', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-upo');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-upo-st10', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version, 'amount_minor', 1000));
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-upo-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_result := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1_ch('s1-ch-mx-upo');
  p := pg_temp._s1_pb('s1-adj-mx-upo');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-upo-undo', 'decision_id', v_result,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-pw-open');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-pw-open alloc sum';
  END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-pw-seal: undo part_won, sealed charge week ledger unchanged
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_result uuid;
  v_hash_pre text; v_hash_post text;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-ups', 182);
  c := pg_temp._s1_ch('s1-ch-mx-ups'); p := pg_temp._s1_pb('trip:s1-trip-mx-ups');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-ups', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-ups-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-ups-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  v_hash_pre := pg_temp._s1_week_ledger_hash(v_week);
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-ups","driver_id":"s1-d1","paid_on":"%s","amount_minor":1000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-ups', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-ups');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-ups-st10', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version, 'amount_minor', 1000));
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-ups-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_result := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1_ch('s1-ch-mx-ups');
  p := pg_temp._s1_pb('s1-adj-mx-ups');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-ups-undo', 'decision_id', v_result,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-pw-seal');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-pw-seal alloc sum';
  END IF;
  v_hash_post := pg_temp._s1_week_ledger_hash(v_week);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION 'mx-undo-pw-seal ledger hash'; END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-lost-open
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_result uuid;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-ulo', 196);
  c := pg_temp._s1_ch('s1-ch-mx-ulo'); p := pg_temp._s1_pb('trip:s1-trip-mx-ulo');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-ulo', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-ulo-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-ulo-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_result := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1_ch('s1-ch-mx-ulo');
  p := pg_temp._s1_pb('trip:s1-trip-mx-ulo');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-ulo-undo', 'decision_id', v_result,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-lost-open');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-lost-open alloc sum';
  END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-lost-seal
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_result uuid;
  v_hash_pre text; v_hash_post text;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-uls', 210);
  c := pg_temp._s1_ch('s1-ch-mx-uls'); p := pg_temp._s1_pb('trip:s1-trip-mx-uls');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-uls', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-uls-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-uls-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  v_hash_pre := pg_temp._s1_week_ledger_hash(v_week);
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's1-mx-uls-lost', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  v_result := (v_r ->> 'decision_id')::uuid;
  c := pg_temp._s1_ch('s1-ch-mx-uls');
  p := pg_temp._s1_pb('trip:s1-trip-mx-uls');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-uls-undo', 'decision_id', v_result,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-lost-seal');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-lost-seal alloc sum';
  END IF;
  v_hash_post := pg_temp._s1_week_ledger_hash(v_week);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION 'mx-undo-lost-seal ledger hash'; END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-exp-open: undo dispute_expire
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org(); v_owner uuid := 'f0111111-1111-4111-8111-111111111111'::uuid;
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_expire uuid;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-ueo', 224);
  c := pg_temp._s1_ch('s1-ch-mx-ueo'); p := pg_temp._s1_pb('trip:s1-trip-mx-ueo');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-ueo', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-ueo-exp', 'dispute_expire', 'user', v_owner) RETURNING id INTO v_expire;
  PERFORM toll_system.dispute_expire(v_org, v_dispute, v_expire, 's1-mx-ueo-exp');
  c := pg_temp._s1_ch('s1-ch-mx-ueo');
  p := pg_temp._s1_pb('trip:s1-trip-mx-ueo');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-ueo-undo', 'decision_id', v_expire,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-exp-open');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-exp-open alloc sum';
  END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-exp-seal
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org(); v_owner uuid := 'f0111111-1111-4111-8111-111111111111'::uuid;
  v_charge uuid; v_pb uuid; v_week date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_alloc bigint; v_expire uuid;
  v_hash_pre text; v_hash_post text;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week FROM pg_temp._s1_setup390('mx-ues', 238);
  c := pg_temp._s1_ch('s1-ch-mx-ues'); p := pg_temp._s1_pb('trip:s1-trip-mx-ues');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-ues', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-ues-wk', 'week_key', v_week, 'expected_week_version',
    toll_system.week_version(v_org, v_week)));
  v_hash_pre := pg_temp._s1_week_ledger_hash(v_week);
  v_snap := pg_temp._s1_snap_bals();
  v_alloc := pg_temp._s1_alloc_sum(v_charge);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours'
  WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id)
  VALUES (v_org, 's1-mx-ues-exp', 'dispute_expire', 'user', v_owner) RETURNING id INTO v_expire;
  PERFORM toll_system.dispute_expire(v_org, v_dispute, v_expire, 's1-mx-ues-exp');
  c := pg_temp._s1_ch('s1-ch-mx-ues');
  p := pg_temp._s1_pb('trip:s1-trip-mx-ues');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-ues-undo', 'decision_id', v_expire,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-exp-seal');
  IF pg_temp._s1_alloc_sum(v_charge) IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'mx-undo-exp-seal alloc sum';
  END IF;
  v_hash_post := pg_temp._s1_week_ledger_hash(v_week);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION 'mx-undo-exp-seal ledger hash'; END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

-- mx-undo-weekb: undo after posting week B sealed — reversal lands in current posting_week
DO $$
DECLARE
  v_org uuid := pg_temp._s1_org();
  v_charge uuid; v_pb uuid; v_week_a date; v_week_b date;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_dispute uuid; v_r jsonb; v_snap jsonb; v_settle uuid;
  v_hash_b_pre text; v_hash_b_post text; v_rev_cnt int; v_post_wk date;
BEGIN
  SELECT * INTO v_charge, v_pb, v_week_a FROM pg_temp._s1_setup390('mx-uwb', 252);
  c := pg_temp._s1_ch('s1-ch-mx-uwb'); p := pg_temp._s1_pb('trip:s1-trip-mx-uwb');
  v_r := pg_temp._s1_cmd('open_dispute', jsonb_build_object(
    'command_id', 's1-mx-uwb', 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  v_dispute := (v_r ->> 'dispute_id')::uuid;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  PERFORM pg_temp._s1_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's1-mx-uwb-sent', 'dispute_id', v_dispute, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-uwb-seal-a', 'week_key', v_week_a, 'expected_week_version',
    toll_system.week_version(v_org, v_week_a)));
  PERFORM public.toll_sys_import(v_org, 'uber', format(
    '[{"row_type":"adjustment","reference":"s1-adj-mx-uwb","driver_id":"s1-d1","paid_on":"%s","amount_minor":2000}]',
    (now() AT TIME ZONE 'America/Jamaica')::date)::jsonb, 's1-adj-mx-uwb', 'smoke');
  p := pg_temp._s1_pb('s1-adj-mx-uwb');
  v_week_b := toll_system.posting_week(v_org);
  v_snap := pg_temp._s1_snap_bals();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = v_dispute;
  v_r := pg_temp._s1_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's1-mx-uwb-settle', 'dispute_id', v_dispute, 'payback_id', p.id,
    'expected_dispute_version', d.version, 'expected_payback_version', p.version));
  v_settle := (v_r ->> 'decision_id')::uuid;
  PERFORM pg_temp._s1_cmd('seal_week', jsonb_build_object(
    'command_id', 's1-mx-uwb-seal-b', 'week_key', v_week_b, 'expected_week_version',
    toll_system.week_version(v_org, v_week_b)));
  v_hash_b_pre := pg_temp._s1_week_ledger_hash(v_week_b);
  v_post_wk := toll_system.posting_week(v_org);
  c := pg_temp._s1_ch('s1-ch-mx-uwb');
  p := pg_temp._s1_pb('s1-adj-mx-uwb');
  PERFORM pg_temp._s1_cmd('undo_decision', jsonb_build_object(
    'command_id', 's1-mx-uwb-undo', 'decision_id', v_settle,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version)));
  PERFORM pg_temp._s1_assert_snap(v_snap, 'mx-undo-weekb-bal');
  v_hash_b_post := pg_temp._s1_week_ledger_hash(v_week_b);
  IF v_hash_b_pre IS DISTINCT FROM v_hash_b_post THEN RAISE EXCEPTION 'mx-undo-weekb hash B'; END IF;
  SELECT count(*)::int INTO v_rev_cnt FROM ledger.entries e
  WHERE e.organization_id = v_org AND e.reference_type = 'toll'
    AND coalesce((e.metadata ->> 'reverse')::boolean, false) = true
    AND (e.metadata ->> 'toll_week')::date = v_post_wk;
  IF v_rev_cnt < 1 THEN RAISE EXCEPTION 'mx-undo-weekb no reversal in posting week %', v_post_wk; END IF;
  PERFORM pg_temp._s1_assert_nightly();
END;
$$;

ROLLBACK;