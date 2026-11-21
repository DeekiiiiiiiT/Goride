-- Toll S2b: sweep, report-late alert, logged trips, rider suggestions (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('b3b01111-1111-4111-8111-111111111111'::uuid, 's2b-mgr@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'b3b11111-1111-4111-8111-111111111101',
  'b3b01111-1111-4111-8111-111111111111',
  'Toll S2b Sweep Logged',
  'toll-s2b-sweep',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes, logged_trips, rider_pays_driver)
VALUES ('b3b11111-1111-4111-8111-111111111101', true, true, true, true)
ON CONFLICT (organization_id) DO UPDATE SET
  tolls_v2 = true, toll_disputes = true, logged_trips = true, rider_pays_driver = true;

SELECT toll_system.ensure_accounts('b3b11111-1111-4111-8111-111111111101');

CREATE OR REPLACE FUNCTION pg_temp._s3_org() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'b3b11111-1111-4111-8111-111111111101'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3_owner() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'b3b01111-1111-4111-8111-111111111111'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._s3_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s3_as(pg_temp._s3_owner(), pg_temp._s3_org());
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._s3_refused(p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._s3_cmd(p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's2b expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's2b expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._s3_ch(p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges
  WHERE organization_id = pg_temp._s3_org() AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._s3_pb(p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks
  WHERE organization_id = pg_temp._s3_org() AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._s3_natural(p_suffix text) RETURNS bigint
LANGUAGE sql AS $b$
  SELECT coalesce(
    (SELECT balance_minor FROM ledger.accounts
     WHERE account_key = 'org:' || pg_temp._s3_org()::text || ':toll:' || p_suffix),
    0);
$b$;

CREATE OR REPLACE FUNCTION pg_temp._s3_alloc_ok(p_charge uuid) RETURNS void
LANGUAGE plpgsql AS $ok$
DECLARE v_amt bigint; v_sum bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.charges
  WHERE organization_id = pg_temp._s3_org() AND id = p_charge;
  SELECT coalesce(sum(amount_minor), 0) INTO v_sum FROM toll.allocations
  WHERE organization_id = pg_temp._s3_org() AND charge_id = p_charge AND reversed_by IS NULL;
  IF v_sum <> v_amt THEN
    RAISE EXCEPTION 'alloc sum % <> charge %', v_sum, v_amt;
  END IF;
END;
$ok$;

CREATE OR REPLACE FUNCTION pg_temp._s3_assert_nightly() RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM toll_system.nightly_checks(pg_temp._s3_org()) LOOP
    IF NOT r.ok THEN
      RAISE EXCEPTION 'nightly % (check %) %', r.name, r.check_no, r.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._s3_week_hash(p_week date) RETURNS text
LANGUAGE sql AS $h$
  SELECT coalesce(md5(string_agg(
    e.id::text || ':' || e.amount_minor::text || ':' || coalesce(e.metadata ->> 'toll_rule', ''),
    '|' ORDER BY e.id)), '')
  FROM ledger.entries e
  WHERE e.organization_id = pg_temp._s3_org() AND e.reference_type = 'toll'
    AND (e.metadata ->> 'toll_week')::date = p_week;
$h$;

CREATE OR REPLACE FUNCTION pg_temp._s3_snap() RETURNS jsonb
LANGUAGE sql AS $s$
  SELECT jsonb_build_object(
    'receivable_platform_dispute', pg_temp._s3_natural('receivable_platform_dispute'),
    'payback_unallocated', pg_temp._s3_natural('payback_unallocated'),
    'receivable_driver', pg_temp._s3_natural('receivable_driver'),
    'expense', pg_temp._s3_natural('expense'),
    'suspense', pg_temp._s3_natural('suspense'));
$s$;

CREATE OR REPLACE FUNCTION pg_temp._s3_assert_delta(
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
    got := pg_temp._s3_natural(keys[i]);
    bef := (p_before ->> keys[i])::bigint;
    IF got - bef IS DISTINCT FROM exp[i] THEN
      RAISE EXCEPTION '% delta % got % expected %', p_label, keys[i], got - bef, exp[i];
    END IF;
  END LOOP;
END;
$ad$;

CREATE OR REPLACE FUNCTION pg_temp._s3_cover_week(p_week date, p_suffix text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $cov$
DECLARE v_org uuid := pg_temp._s3_org();
BEGIN
  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type, legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end)
  VALUES (
    's3-uber-batch-' || p_suffix || p_week::text, v_org::text, 'uber-week.csv', 'committed', 'merged_import',
    's3-kv-' || p_suffix || p_week::text, '{}'::jsonb, 'uber_bundle', ARRAY[p_week]::date[],
    p_week, p_week + 6)
  ON CONFLICT (id) DO NOTHING;
END;
$cov$;

CREATE OR REPLACE FUNCTION pg_temp._s3_import(
  p_suffix text, p_week date, p_charge bigint DEFAULT 39000, p_pb bigint DEFAULT 37000,
  p_trip_id text DEFAULT NULL, p_ch_ref text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $imp$
DECLARE
  v_trip text := coalesce(p_trip_id, 's3-trip-' || p_suffix);
  v_ch   text := coalesce(p_ch_ref, 's3-ch-' || p_suffix);
  v_trip_at  timestamptz := (((now() AT TIME ZONE 'America/Jamaica')::date - 2) + time '15:00') AT TIME ZONE 'America/Jamaica';
  v_occurred timestamptz := v_trip_at + interval '25 minutes';
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s3-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":%s}]'::text,
    v_trip, v_trip_at, v_trip_at + interval '40 minutes', p_pb)::jsonb,
    's3-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":%s,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]'::text,
    v_ch, v_occurred, p_charge)::jsonb,
    's3-tag-' || p_suffix, 'smoke');
END;
$imp$;

CREATE OR REPLACE FUNCTION pg_temp._s3_import_on(
  p_suffix text, p_day date, p_charge bigint DEFAULT 39000, p_pb bigint DEFAULT 37000)
RETURNS void
LANGUAGE plpgsql AS $impo$
DECLARE
  v_trip_at  timestamptz := (p_day + time '15:00') AT TIME ZONE 'America/Jamaica';
  v_occurred timestamptz := (p_day + time '14:25') AT TIME ZONE 'America/Jamaica';
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s3-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":%s}]'::text,
    's3-trip-' || p_suffix, v_trip_at, v_trip_at + interval '40 minutes', p_pb)::jsonb,
    's3-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":%s,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]'::text,
    's3-ch-' || p_suffix, v_occurred, p_charge)::jsonb,
    's3-tag-' || p_suffix, 'smoke');
END;
$impo$;

CREATE OR REPLACE FUNCTION pg_temp._s3_import390(
  p_suffix text, p_occurred timestamptz, p_trip_at timestamptz)
RETURNS void
LANGUAGE plpgsql AS $imp390$
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"s3-d1","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":37000}]'::text,
    's3-trip-' || p_suffix, p_trip_at, p_trip_at + interval '40 minutes')::jsonb,
    's3-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":39000,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]'::text,
    's3-ch-' || p_suffix, p_occurred)::jsonb,
    's3-tag-' || p_suffix, 'smoke');
END;
$imp390$;

CREATE OR REPLACE FUNCTION pg_temp._s3_setup390(
  p_suffix text, p_weeks_ago int DEFAULT 21, OUT week_key date)
LANGUAGE plpgsql AS $s390$
DECLARE
  v_org uuid := pg_temp._s3_org();
  v_week date := ledger.jamaica_week_start(
    (now() AT TIME ZONE 'America/Jamaica')::timestamptz - (p_weeks_ago || ' days')::interval);
  v_occurred timestamptz := ((v_week + 2) + time '14:00') AT TIME ZONE 'America/Jamaica';
  v_trip timestamptz := (((now() AT TIME ZONE 'America/Jamaica')::date - 3) + time '15:00') AT TIME ZONE 'America/Jamaica';
  c toll.charges; p toll.paybacks;
BEGIN
  PERFORM pg_temp._s3_import390(p_suffix, v_occurred, v_trip);
  c := pg_temp._s3_ch('s3-ch-' || p_suffix);
  p := pg_temp._s3_pb('trip:s3-trip-' || p_suffix);
  PERFORM pg_temp._s3_match_store(jsonb_build_array(pg_temp._s3_cand(c.id, p.id, false)));
  SELECT * INTO c FROM toll.charges WHERE organization_id = v_org AND id = c.id;
  SELECT * INTO p FROM toll.paybacks WHERE organization_id = v_org AND id = p.id;
  PERFORM pg_temp._s3_cmd('open_dispute', jsonb_build_object(
    'command_id', 's3-open-' || p_suffix, 'charge_id', c.id, 'payback_id', p.id,
    'expected_charge_version', c.version, 'expected_payback_version', p.version));
  week_key := toll_system.charge_counted_week(v_org, c.id, c.week_key);
END;
$s390$;

CREATE OR REPLACE FUNCTION pg_temp._s3_seed_settings(p_week date) RETURNS void
LANGUAGE plpgsql AS $seed$
BEGIN
  INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
  VALUES ('s3-pz', 10, 'same_day')
  ON CONFLICT (plaza_id) DO NOTHING;
  PERFORM pg_temp._s3_cmd('approve_settings_seed', jsonb_build_object(
    'command_id', 's3-seed', 'note', 's2b sweep test seed',
    'self_approval_reason', 'twelve chars'));
  -- Uber's rate is shared data (no longer set from Fleet: 20261121222218)
  INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from)
  VALUES ('s3-pz', 'platform_refund', 'uber', 37000, (p_week)::date);
END;
$seed$;

CREATE OR REPLACE FUNCTION pg_temp._s3_inputs(
  p_charge uuid, p_payback uuid, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql AS $i$
  SELECT jsonb_build_object(
    'engine_version', 'toll-matcher-v2',
    'config', jsonb_build_object('note', 's2b-sql-test')
  ) || p_extra || jsonb_build_object(
    'charge', jsonb_build_object('id', p_charge::text),
    'payback', jsonb_build_object('id', p_payback::text)
  );
$i$;

CREATE OR REPLACE FUNCTION pg_temp._s3_cand(
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
    'inputs', pg_temp._s3_inputs(p_charge, p_payback,
      CASE WHEN p_kind = 'dispute_refund' THEN jsonb_build_object('kind', 'dispute_refund', 'dispute_id', p_dispute::text)
           ELSE '{}'::jsonb END)
  ));
$ca$;

CREATE OR REPLACE FUNCTION pg_temp._s3_cand_rider(
  p_charge uuid, p_plat text, p_trip_id text,
  p_rules text[] DEFAULT ARRAY['on_trip', 'rider_pays_driver', 'rider_owed_driver_collects'])
RETURNS jsonb
LANGUAGE sql AS $cr$
  SELECT jsonb_build_object(
    'kind', 'rider_pays_driver',
    'charge_id', p_charge,
    'payback_id', NULL,
    'trip_platform', p_plat,
    'trip_id', p_trip_id,
    'score', 90,
    'auto_apply', false,
    'dispute_open_eligible', false,
    'dispute_settle_eligible', false,
    'score_parts', jsonb_build_object(
      'total', 90, 'auto_apply', false, 'dispute_open_eligible', false, 'dispute_settle_eligible', false),
    'rules_fired', to_jsonb(p_rules),
    'inputs', jsonb_build_object(
      'engine_version', 'toll-matcher-v2',
      'config', jsonb_build_object('note', 's2b-rider'),
      'kind', 'rider_pays_driver',
      'charge', jsonb_build_object('id', p_charge::text),
      'trip', jsonb_build_object('platform', p_plat, 'platform_trip_id', p_trip_id))
  );
$cr$;

CREATE OR REPLACE FUNCTION pg_temp._s3_match_store(p_cands jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ms$
DECLARE
  v_org  uuid := pg_temp._s3_org();
  v_fc   uuid[];
  v_fp   uuid[];
  v_ft   uuid[];
  v_id   uuid;
  v_claim jsonb;
  v_store jsonb;
BEGIN
  v_fc := array(SELECT DISTINCT (x ->> 'charge_id')::uuid FROM jsonb_array_elements(p_cands) x WHERE x ? 'charge_id');
  v_fp := array(SELECT DISTINCT (x ->> 'payback_id')::uuid FROM jsonb_array_elements(p_cands) x
                WHERE x ? 'payback_id' AND nullif(x ->> 'payback_id', '') IS NOT NULL);
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  FOREACH v_id IN ARRAY v_fc LOOP
    PERFORM toll_system.match_enqueue(v_org, 'charge', v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_fp LOOP
    PERFORM toll_system.match_enqueue(v_org, 'payback', v_id);
  END LOOP;
  FOR v_id IN
    SELECT t.id FROM jsonb_array_elements(p_cands) x
    JOIN toll.platform_trips t ON t.organization_id = v_org
      AND t.platform = x ->> 'trip_platform' AND t.platform_trip_id = x ->> 'trip_id'
      AND t.withdrawn_at IS NULL
    WHERE coalesce(x ->> 'kind', '') = 'rider_pays_driver'
  LOOP
    PERFORM toll_system.match_enqueue(v_org, 'trip', v_id);
  END LOOP;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  IF nullif(v_claim ->> 'claim_id', '') IS NULL AND jsonb_array_length(p_cands) > 0 THEN
    RAISE EXCEPTION 's2b match claim empty';
  END IF;
  IF nullif(v_claim ->> 'claim_id', '') IS NOT NULL THEN
    v_store := public.toll_sys_match_store(v_org, (v_claim ->> 'claim_id')::uuid, jsonb_build_object(
      'engine_version', 'toll-matcher-v2', 'candidates', p_cands));
  ELSE
    v_store := '{}'::jsonb;
  END IF;
  RESET ROLE;
  RETURN coalesce(v_store, '{}'::jsonb) || jsonb_build_object('claim', v_claim);
END;
$ms$;

CREATE OR REPLACE FUNCTION pg_temp._s3_claim_only(p_charge uuid, p_payback uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $co$
DECLARE v_org uuid := pg_temp._s3_org(); v_claim jsonb; v_trip uuid;
BEGIN
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  PERFORM toll_system.match_enqueue(v_org, 'charge', p_charge);
  IF p_payback IS NOT NULL THEN
    PERFORM toll_system.match_enqueue(v_org, 'payback', p_payback);
  END IF;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  RESET ROLE;
  RETURN v_claim;
END;
$co$;

CREATE OR REPLACE FUNCTION pg_temp._s3_sweep() RETURNS jsonb
LANGUAGE plpgsql AS $sw$
DECLARE r jsonb;
BEGIN
  RESET ROLE;
  SET LOCAL ROLE service_role;
  r := public.toll_sys_dispute_sweep(pg_temp._s3_org());
  RESET ROLE;
  RETURN r;
END;
$sw$;

CREATE OR REPLACE FUNCTION pg_temp._s3_sweep_rpc() RETURNS jsonb
LANGUAGE plpgsql AS $sr$
DECLARE r jsonb;
BEGIN
  RESET ROLE;
  SET LOCAL ROLE service_role;
  r := public.toll_sys_dispute_sweep(pg_temp._s3_org());
  RESET ROLE;
  RETURN r;
END;
$sr$;

CREATE OR REPLACE FUNCTION pg_temp._s3_report_late() RETURNS jsonb
LANGUAGE plpgsql AS $rl$
DECLARE r jsonb;
BEGIN
  RESET ROLE;
  SET LOCAL ROLE service_role;
  r := toll_system.report_late_check(pg_temp._s3_org());
  RESET ROLE;
  RETURN r;
END;
$rl$;

CREATE OR REPLACE FUNCTION pg_temp._s3_open_dispute(p_suffix text, p_week date)
RETURNS TABLE (c toll.charges, p toll.paybacks, d toll.disputes)
LANGUAGE plpgsql AS $od$
DECLARE v_c toll.charges; v_p toll.paybacks; v_d toll.disputes;
BEGIN
  PERFORM pg_temp._s3_import(p_suffix, p_week);
  v_c := pg_temp._s3_ch('s3-ch-' || p_suffix);
  v_p := pg_temp._s3_pb('trip:s3-trip-' || p_suffix);
  PERFORM pg_temp._s3_match_store(jsonb_build_array(pg_temp._s3_cand(v_c.id, v_p.id, true)));
  SELECT * INTO v_d FROM toll.disputes
  WHERE organization_id = pg_temp._s3_org() AND charge_id = v_c.id AND close_reason IS DISTINCT FROM 'undo'
  LIMIT 1;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 's2b open_dispute %: no row opened', p_suffix;
  END IF;
  RETURN QUERY SELECT v_c, v_p, v_d;
END;
$od$;

CREATE OR REPLACE PROCEDURE pg_temp._s3_load_od(
  p_suffix text, p_week date,
  INOUT io_c toll.charges, INOUT io_p toll.paybacks, INOUT io_d toll.disputes)
LANGUAGE plpgsql AS $lod$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp._s3_open_dispute(p_suffix, p_week) x LIMIT 1;
  io_c := r.c;
  io_p := r.p;
  io_d := r.d;
END;
$lod$;

CREATE OR REPLACE FUNCTION pg_temp._s3_adj(
  p_ref text, p_minor bigint DEFAULT 2000, p_paid date DEFAULT NULL)
RETURNS toll.paybacks
LANGUAGE plpgsql AS $adj$
DECLARE v_paid date := coalesce(p_paid, (now() AT TIME ZONE 'America/Jamaica')::date);
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3_org(), 'uber', format(
    '[{"row_type":"adjustment","reference":"%s","driver_id":"s3-d1","paid_on":"%s","amount_minor":%s}]',
    p_ref, v_paid, p_minor)::jsonb, 's3-adj-' || p_ref, 'smoke');
  RETURN pg_temp._s3_pb(p_ref);
END;
$adj$;

CREATE OR REPLACE FUNCTION pg_temp._s3_cover_refund_periods(p_clock timestamptz, p_periods int) RETURNS void
LANGUAGE plpgsql AS $crp$
DECLARE n int;
BEGIN
  FOR n IN 1..p_periods LOOP
    PERFORM pg_temp._s3_cover_week(toll_system.dispute_refund_period_week_start(p_clock, n), 'p' || n::text || '-');
  END LOOP;
END;
$crp$;

DO $$
DECLARE
  v_org       uuid := pg_temp._s3_org();
  v_week      date;
  v_claim     jsonb;
  v_store     jsonb;
  v_r         jsonb;
  v_snap      jsonb;
  v_snap2     jsonb;
  c           toll.charges;
  p           toll.paybacks;
  d           toll.disputes;
  v_dispute   uuid;
  v_dec       uuid;
  v_sug       uuid;
  v_cnt       int;
  v_hash_pre  text;
  v_hash_post text;
  v_drv_sum   bigint;
  v_expense   bigint;
  v_pt        toll.platform_trips%ROWTYPE;
  v_ws        date;
  v_key       text;
  v_seen      timestamptz;
  v_trip_day  date;
  v_trip_at   timestamptz;
  v_ch_wk     date;
BEGIN
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '28 days');
  PERFORM pg_temp._s3_import('seed', v_week);
  PERFORM pg_temp._s3_seed_settings(v_week);
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 1. Switches off: sweep, alert, adapter, rider → nothing; no rider_trips key ──
  UPDATE toll.switch_state SET toll_disputes = false, logged_trips = false, rider_pays_driver = false
  WHERE organization_id = v_org;
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'expired')::int, 0) <> 0 OR coalesce((v_r ->> 'closed')::int, 0) <> 0 THEN
    RAISE EXCEPTION '1 sweep wrote when off %', v_r;
  END IF;
  v_r := pg_temp._s3_report_late();
  IF coalesce((v_r ->> 'opened')::int, 0) <> 0 THEN
    RAISE EXCEPTION '1 report_late opened when off';
  END IF;
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-sw-off-trip', v_org::text, (now() AT TIME ZONE 'America/Jamaica')::date, 's3-d1', 'v1',
    'InDrive', 'completed', 'live_driver_app', 'cash', 'rideshare', 1200, 's3-kv-sw',
    jsonb_build_object('isManual', true, 'requestTime', '2026-01-15T10:00:00', 'dropoffTime', '2026-01-15T10:40:00'));
  IF EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-sw-off-trip') THEN
    RAISE EXCEPTION '1 adapter wrote platform_trips when off';
  END IF;
  PERFORM pg_temp._s3_import('sw1', v_week + 7);
  c := pg_temp._s3_ch('s3-ch-sw1');
  v_claim := pg_temp._s3_claim_only(c.id);
  IF v_claim ? 'rider_trips' THEN
    RAISE EXCEPTION '1 bundle must not carry rider_trips when off';
  END IF;
  UPDATE toll.switch_state SET toll_disputes = true, logged_trips = true, rider_pays_driver = true
  WHERE organization_id = v_org;
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 2. Expire via sweep; mark_dispute_sent refused; replay sweep ──
  v_snap := pg_temp._s3_snap();
  CALL pg_temp._s3_load_od('t2a', v_week + 14, c, p, d);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'expired')::int, 0) < 1 THEN
    RAISE EXCEPTION '2 sweep did not expire %', v_r;
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'expired' THEN RAISE EXCEPTION '2 not expired %', d.state; END IF;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_drv_sum FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = c.id AND a.reversed_by IS NULL
    AND a.bearer = 'driver' AND a.dispute_id = d.id;
  IF v_drv_sum <> 2000 THEN RAISE EXCEPTION '2 driver bore %', v_drv_sum; END IF;
  PERFORM pg_temp._s3_alloc_ok(c.id);
  v_snap2 := pg_temp._s3_snap();
  PERFORM pg_temp._s3_sweep();
  PERFORM pg_temp._s3_assert_delta(v_snap2, 't2-replay', 0, 0, 0, 0, 0);
  CALL pg_temp._s3_load_od('t2b', v_week + 21, c, p, d);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s3_refused('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t2-ref', 'dispute_id', d.id, 'expected_dispute_version', d.version), 'window_closed');
  v_r := pg_temp._s3_sweep();
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'expired' OR coalesce((v_r ->> 'expired')::int, 0) < 1 THEN
    RAISE EXCEPTION '2b sweep must expire overdue dispute state=% sweep=%', d.state, v_r;
  END IF;
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 3. Both refund periods in, no refund → lost; first period only → hold nothing ──
  CALL pg_temp._s3_load_od('t3a', v_week + 28, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t3a-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'closed')::int, 0) < 1 THEN RAISE EXCEPTION '3 no close %', v_r; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'lost' OR d.close_reason <> 'no_refund_two_periods' THEN
    RAISE EXCEPTION '3 lost expected got % %', d.state, d.close_reason;
  END IF;
  PERFORM pg_temp._s3_assert_delta(v_snap, 't3-lost', 2000, 0, 0, -2000, 0);
  PERFORM pg_temp._s3_alloc_ok(c.id);
  CALL pg_temp._s3_load_od('t3b', v_week + 35, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t3b-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  DELETE FROM fleet.import_batches
  WHERE organization_id = v_org::text AND source_id = 'uber_bundle'
    AND coverage_start = toll_system.dispute_refund_period_week_start(d.clock_from, 2);
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 1);
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'closed')::int, 0) <> 0 THEN RAISE EXCEPTION '3 one period closed early'; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'sent' THEN RAISE EXCEPTION '3 still sent got %', d.state; END IF;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'closed')::int, 0) < 1 THEN RAISE EXCEPTION '3b finish close %', v_r; END IF;
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 4. J$10 recovered, both periods → part_won ──
  CALL pg_temp._s3_load_od('t4', v_week + 42, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t4-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  p := pg_temp._s3_adj('s3-adj-t4', 1000);
  PERFORM pg_temp._s3_match_store(jsonb_build_array(
    pg_temp._s3_cand(c.id, p.id, false, true, 'dispute_refund', d.id,
      ARRAY['refund_window','dispute_refund'])));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.recovered_minor <> 1000 THEN RAISE EXCEPTION 't4 recovered %', d.recovered_minor; END IF;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'closed')::int, 0) < 1 THEN RAISE EXCEPTION '4 no close'; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'part_won' OR d.close_reason <> 'partial_refund_two_periods' THEN
    RAISE EXCEPTION '4 part_won % %', d.state, d.close_reason;
  END IF;
  PERFORM pg_temp._s3_assert_delta(v_snap, 't4-part', 1000, 0, 0, -1000, 0);
  PERFORM pg_temp._s3_alloc_ok(c.id);
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 5. Hold: both periods in + unallocated adjustment in window ──
  CALL pg_temp._s3_load_od('t5', v_week + 49, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t5-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  p := pg_temp._s3_adj('s3-adj-t5-hold', 2000, toll_system.dispute_refund_period_week_start(d.clock_from, 1) + 2);
  v_dispute := d.id;
  v_r := pg_temp._s3_sweep();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(v_r -> 'held', '[]'::jsonb)) x WHERE x::uuid = v_dispute) THEN
    RAISE EXCEPTION '5 not held %', v_r;
  END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'sent' THEN RAISE EXCEPTION '5 held but state %', d.state; END IF;
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 6. no_report day 24 vs day 22 ──
  CALL pg_temp._s3_load_od('t6a', v_week + 56, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t6a-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET clock_from = now() - interval '22 days' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'no_report')::int, 0) <> 0 THEN RAISE EXCEPTION '6 day22 no_report'; END IF;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET clock_from = now() - interval '24 days' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'no_report')::int, 0) < 1 THEN RAISE EXCEPTION '6 day24 no_report %', v_r; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  IF d.state <> 'lost' OR d.close_reason <> 'no_report' THEN RAISE EXCEPTION '6 lost no_report'; END IF;
  PERFORM pg_temp._s3_assert_delta(v_snap, 't6-fleet', 2000, 0, 0, -2000, 0);
  PERFORM pg_temp._s3_alloc_ok(c.id);
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 9. Report late (before 7 in file order to free weeks) ──
  v_ws := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::date - 10);
  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = v_org;
  UPDATE toll.switch_state SET toll_disputes = true,
    toll_disputes_on_at = (v_ws::timestamp AT TIME ZONE 'America/Jamaica')
  WHERE organization_id = v_org;
  v_key := 'report_late:uber:' || v_ws::text;
  v_r := pg_temp._s3_report_late();
  SELECT count(*)::int INTO v_cnt FROM toll.alerts
  WHERE organization_id = v_org AND kind = 'report_late' AND dedupe_key = v_key AND resolved_at IS NULL;
  IF v_cnt <> 1 THEN RAISE EXCEPTION '9 want one alert got %', v_cnt; END IF;
  SELECT last_seen_at INTO v_seen FROM toll.alerts
  WHERE organization_id = v_org AND dedupe_key = v_key AND resolved_at IS NULL LIMIT 1;
  PERFORM pg_temp._s3_report_late();
  IF (SELECT count(*) FROM toll.alerts WHERE organization_id = v_org AND dedupe_key = v_key AND resolved_at IS NULL) <> 1 THEN
    RAISE EXCEPTION '9 second check duplicated';
  END IF;
  IF (SELECT last_seen_at FROM toll.alerts WHERE organization_id = v_org AND dedupe_key = v_key AND resolved_at IS NULL LIMIT 1)
        <= v_seen THEN
    RAISE EXCEPTION '9 alert not refreshed';
  END IF;
  PERFORM pg_temp._s3_cover_week(v_ws, 'late-');
  PERFORM pg_temp._s3_report_late();
  IF EXISTS (SELECT 1 FROM toll.alerts WHERE organization_id = v_org AND dedupe_key = v_key AND resolved_at IS NULL) THEN
    RAISE EXCEPTION '9 not resolved after coverage';
  END IF;
  v_key := 'report_late:uber:' || (v_ws - 7)::text;
  PERFORM pg_temp._s3_report_late();
  IF EXISTS (SELECT 1 FROM toll.alerts WHERE organization_id = v_org AND dedupe_key = v_key AND resolved_at IS NULL) THEN
    RAISE EXCEPTION '9 week before switch-on alerted';
  END IF;

  -- ── 10. Logged-trips adapter ──
  v_trip_day := (now() AT TIME ZONE 'America/Jamaica')::date - 2;
  v_trip_at := (v_trip_day::timestamp + time '14:30') AT TIME ZONE 'America/Jamaica';
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-indrive-log-1', v_org::text, v_trip_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 1500, 's3-kv-ind-1',
    jsonb_build_object(
      'isManual', true,
      'requestTime', to_char(v_trip_day, 'YYYY-MM-DD') || 'T14:30:00',
      'pickupTime', to_char(v_trip_day, 'YYYY-MM-DD') || 'T14:35:00',
      'dropoffTime', to_char(v_trip_day, 'YYYY-MM-DD') || 'T15:10:00'));
  SELECT * INTO v_pt FROM toll.platform_trips
  WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-indrive-log-1';
  IF v_pt.source <> 'logged' OR v_pt.time_precision <> 'minute' THEN
    RAISE EXCEPTION '10 mirror bad % %', v_pt.source, v_pt.time_precision;
  END IF;
  IF (v_pt.request_at AT TIME ZONE 'America/Jamaica')::time <> time '14:30'
     OR (v_pt.dropoff_at AT TIME ZONE 'America/Jamaica')::time <> time '15:10' THEN
    RAISE EXCEPTION '10 jamaica times';
  END IF;
  UPDATE fleet.trips SET driver_id = 's3-d2'
  WHERE id = 's3-indrive-log-1' AND organization_id = v_org::text;
  IF (SELECT driver_id FROM toll.platform_trips WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-indrive-log-1')
        IS DISTINCT FROM 's3-d2' THEN
    RAISE EXCEPTION '10 edit did not mirror';
  END IF;
  UPDATE fleet.trips SET status = 'cancelled' WHERE id = 's3-indrive-log-1' AND organization_id = v_org::text;
  IF (SELECT withdrawn_at IS NULL FROM toll.platform_trips
      WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-indrive-log-1') THEN
    RAISE EXCEPTION '10 cancel no withdrawn_at';
  END IF;
  INSERT INTO fleet.trips (
    id, organization_id, date, platform, service_line, amount, legacy_kv_id, payload_json, batch_id)
  VALUES (
    's3-uber-imported', v_org::text, v_trip_day, 'uber', 'rideshare', 500, 's3-kv-uimp', '{}'::jsonb, 'csv_upload');
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-uber-hand', v_org::text, v_trip_day, 's3-d1', 'v1', 'Uber', 'completed', 'manual_entry',
    'cash', 'rideshare', 800, 's3-kv-uhand',
    jsonb_build_object('isManual', true, 'requestTime', to_char(v_trip_day, 'YYYY-MM-DD') || 'T09:00:00'));
  IF EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org
               AND platform_trip_id IN ('logged:s3-uber-imported', 'logged:s3-uber-hand')) THEN
    RAISE EXCEPTION '10 uber trips must not mirror';
  END IF;
  UPDATE toll.switch_state SET logged_trips = false WHERE organization_id = v_org;
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-heal-trip', v_org::text, v_trip_day - 1, 's3-d1', 'v1', 'indrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 900, 's3-kv-heal',
    jsonb_build_object('isManual', true, 'requestTime', to_char(v_trip_day - 1, 'YYYY-MM-DD') || 'T11:00:00',
      'dropoffTime', to_char(v_trip_day - 1, 'YYYY-MM-DD') || 'T11:30:00'));
  IF EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-heal-trip') THEN
    RAISE EXCEPTION '10 heal appeared before sync';
  END IF;
  UPDATE toll.switch_state SET logged_trips = true WHERE organization_id = v_org;
  v_cnt := toll_system.logged_trips_sync(v_org);
  IF NOT EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org AND platform_trip_id = 'logged:s3-heal-trip') THEN
    RAISE EXCEPTION '10 sync did not heal';
  END IF;
  PERFORM pg_temp._s3_assert_nightly();

  -- ── 13. Orphan toll: no suggestions ──
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s3-ch-orphan","occurred_at":"%s","amount_minor":5000,"plaza_id":"s3-pz",
      "vehicle_id":"v99","driver_id":"s3-d1"}]',
    ((v_week + 3) + time '09:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's3-tag-orphan', 'smoke');
  c := pg_temp._s3_ch('s3-ch-orphan');
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  PERFORM toll_system.match_enqueue(v_org, 'charge', c.id);
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  v_store := public.toll_sys_match_store(v_org, (v_claim ->> 'claim_id')::uuid, jsonb_build_object(
    'engine_version', 'toll-matcher-v2', 'candidates', '[]'::jsonb));
  RESET ROLE;
  v_cnt := (SELECT count(*)::int FROM toll.suggestions s
    WHERE s.organization_id = v_org AND s.charge_id = c.id AND s.superseded_by IS NULL
      AND NOT ('withdrawn' = ANY (s.rules_fired)));
  IF v_cnt <> 0 THEN RAISE EXCEPTION '13 orphan has suggestions %', v_cnt; END IF;

  RAISE NOTICE 'toll_sweep_logged_trips_test: main ok';
END;
$$;

-- ── 7. Sealed charge week: sweep expire + auto-close, ledger unchanged in sealed week ──
DO $$
DECLARE
  v_org uuid := pg_temp._s3_org();
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_hash_pre text; v_hash_post text; v_ch_wk date;
  v_r jsonb; v_snap jsonb;
BEGIN
  -- review: clear test 5's held J$20 the way a person would (Keep with no toll), never by flagging a
  -- posted payback as legacy (that broke the payback_unallocated check: ledger had it, records didn't)
  p := pg_temp._s3_pb('s3-adj-t5-hold');
  PERFORM pg_temp._s3_cmd('leave_payback_unlinked', jsonb_build_object(
    'command_id', 's3-t7-clear-hold', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reason_code', 'test clears the held refund'));
  PERFORM pg_temp._s3_assert_nightly();
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() + interval '30 days'
  WHERE organization_id = v_org AND state = 'to_send';
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  PERFORM pg_temp._s3_setup390('t7exp', 21);
  c := pg_temp._s3_ch('s3-ch-t7exp');
  v_ch_wk := toll_system.charge_counted_week(v_org, c.id, c.week_key);
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id LIMIT 1;
  PERFORM pg_temp._s3_cmd('seal_week', jsonb_build_object(
    'command_id', 's3-t7exp-seal', 'week_key', v_ch_wk,
    'expected_week_version', toll_system.week_version(v_org, v_ch_wk)));
  v_hash_pre := pg_temp._s3_week_hash(v_ch_wk);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'expired')::int, 0) < 1 THEN RAISE EXCEPTION '7exp sweep %', v_r; END IF;
  v_hash_post := pg_temp._s3_week_hash(v_ch_wk);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION '7exp sealed ledger changed'; END IF;
  PERFORM pg_temp._s3_assert_nightly();  -- review: money check after sealed-week expire
  PERFORM pg_temp._s3_alloc_ok(c.id);

  PERFORM pg_temp._s3_setup390('t7close', 154);
  c := pg_temp._s3_ch('s3-ch-t7close');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id LIMIT 1;
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t7close-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  v_ch_wk := toll_system.charge_counted_week(v_org, c.id, c.week_key);
  PERFORM pg_temp._s3_cmd('seal_week', jsonb_build_object(
    'command_id', 's3-t7close-seal', 'week_key', v_ch_wk,
    'expected_week_version', toll_system.week_version(v_org, v_ch_wk)));
  v_hash_pre := pg_temp._s3_week_hash(v_ch_wk);
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  IF coalesce((v_r ->> 'closed')::int, 0) < 1 THEN RAISE EXCEPTION '7close %', v_r; END IF;
  v_hash_post := pg_temp._s3_week_hash(v_ch_wk);
  IF v_hash_pre IS DISTINCT FROM v_hash_post THEN RAISE EXCEPTION '7close sealed ledger changed'; END IF;
  PERFORM pg_temp._s3_assert_nightly();  -- review: money check after sealed-week auto-close
  PERFORM pg_temp._s3_alloc_ok(c.id);
END;
$$;

-- ── 8. Undo sweep auto_close and expire ──
DO $$
DECLARE
  v_org uuid := pg_temp._s3_org();
  v_week date := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '42 days');
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_r jsonb; v_snap jsonb; v_dec uuid;
  v_dispute uuid;
BEGIN
  CALL pg_temp._s3_load_od('t8close', v_week, c, p, d);
  PERFORM pg_temp._s3_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3-t8close-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND id = d.id;
  PERFORM pg_temp._s3_cover_refund_periods(d.clock_from, 2);
  v_dispute := d.id;
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  SELECT id INTO v_dec FROM toll.decisions
  WHERE organization_id = v_org AND command_id = 'sweep:close:' || v_dispute::text LIMIT 1;
  IF v_dec IS NULL THEN RAISE EXCEPTION '8 missing close decision'; END IF;
  c := pg_temp._s3_ch('s3-ch-t8close');
  PERFORM pg_temp._s3_cmd('undo_decision', jsonb_build_object(
    'command_id', 's3-t8-undo-close', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id
    AND close_reason IS DISTINCT FROM 'undo' ORDER BY created_at DESC LIMIT 1;
  IF d.state <> 'sent' OR d.clock_from IS NULL THEN RAISE EXCEPTION '8 undo close state'; END IF;
  PERFORM pg_temp._s3_assert_delta(v_snap, '8-undo-close', 0, 0, 0, 0, 0);
  PERFORM pg_temp._s3_assert_nightly();  -- review

  CALL pg_temp._s3_load_od('t8exp', v_week + 7, c, p, d);
  v_dispute := d.id;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() + interval '30 days'
  WHERE organization_id = v_org AND state = 'to_send' AND id <> v_dispute;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE organization_id = v_org AND id = v_dispute;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  v_snap := pg_temp._s3_snap();
  v_r := pg_temp._s3_sweep();
  SELECT id INTO v_dec FROM toll.decisions
  WHERE organization_id = v_org AND command_id = 'sweep:expire:' || v_dispute::text LIMIT 1;
  c := pg_temp._s3_ch('s3-ch-t8exp');
  PERFORM pg_temp._s3_cmd('undo_decision', jsonb_build_object(
    'command_id', 's3-t8-undo-exp', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version)));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id
    AND close_reason IS DISTINCT FROM 'undo' ORDER BY created_at DESC LIMIT 1;
  IF d.state <> 'to_send' THEN RAISE EXCEPTION '8 undo expire not to_send'; END IF;
  PERFORM pg_temp._s3_assert_nightly();  -- review: money check after undo of a sweep expire
END;
$$;

-- ── 11 / 8 / 8b / 14. Rider suggestions + withdrawn ──
DO $$
DECLARE
  v_org uuid := pg_temp._s3_org();
  v_day date := (now() AT TIME ZONE 'America/Jamaica')::date - 1;
  v_req text := to_char(v_day, 'YYYY-MM-DD') || 'T10:00:00';
  v_drop text := to_char(v_day, 'YYYY-MM-DD') || 'T10:45:00';
  v_occurred timestamptz;
  c toll.charges;
  v_sug uuid;
  v_store jsonb;
  v_r jsonb;
  v_ptid text := 'logged:s3-rider-trip';
BEGIN
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-rider-trip', v_org::text, v_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 2000, 's3-kv-rider',
    jsonb_build_object('isManual', true, 'requestTime', v_req, 'dropoffTime', v_drop))
  ON CONFLICT DO NOTHING;

  v_occurred := (v_day::timestamp + time '10:20') AT TIME ZONE 'America/Jamaica';
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s3-ch-rider-tag","occurred_at":"%s","amount_minor":39000,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]', v_occurred)::jsonb, 's3-tag-rider', 'smoke');
  c := pg_temp._s3_ch('s3-ch-rider-tag');
  v_store := pg_temp._s3_match_store(jsonb_build_array(pg_temp._s3_cand_rider(c.id, 'indrive', v_ptid)));
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org AND charge_id = c.id AND kind = 'rider_pays_driver'
    AND payback_id IS NULL AND superseded_by IS NULL LIMIT 1;
  IF v_sug IS NULL THEN RAISE EXCEPTION '11 no rider suggestion'; END IF;
  IF EXISTS (SELECT 1 FROM toll.suggestions WHERE id = v_sug AND coalesce((score_parts ->> 'auto_apply')::boolean, true)) THEN
    RAISE EXCEPTION '11 auto_apply';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id AND close_reason IS DISTINCT FROM 'undo') THEN
    RAISE EXCEPTION '11 dispute opened';
  END IF;
  PERFORM pg_temp._s3_refused('apply_suggestion', jsonb_build_object(
    'command_id', 's3-rider-apply', 'suggestion_id', v_sug, 'expected_charge_version', c.version), 'WRONG_STATE');

  c := pg_temp._s3_ch('s3-ch-rider-tag');
  v_r := pg_temp._s3_cmd('driver_pays', jsonb_build_object(
    'command_id', 's3-rider-drv', 'charge_id', c.id, 'expected_charge_version', c.version,
    'suggestion_id', v_sug));
  IF toll_system.charge_state(v_org, c.id) NOT IN ('resolved', 'decided') THEN
    RAISE EXCEPTION '11 charge state %', toll_system.charge_state(v_org, c.id);
  END IF;
  PERFORM pg_temp._s3_alloc_ok(c.id);

  -- 8 (fleet_absorbs on tag toll with rider suggestion)
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-rider-fleet-trip', v_org::text, v_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 2100, 's3-kv-rider-f',
    jsonb_build_object('isManual', true, 'requestTime', v_req, 'dropoffTime', v_drop));
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s3-ch-rider-fleet","occurred_at":"%s","amount_minor":3200,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]',
    ((v_day::timestamp + time '10:21') AT TIME ZONE 'America/Jamaica'))::jsonb, 's3-tag-rider-f', 'smoke');
  c := pg_temp._s3_ch('s3-ch-rider-fleet');
  v_store := pg_temp._s3_match_store(jsonb_build_array(
    pg_temp._s3_cand_rider(c.id, 'indrive', 'logged:s3-rider-fleet-trip')));
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org AND charge_id = c.id AND kind = 'rider_pays_driver' AND superseded_by IS NULL LIMIT 1;
  c := pg_temp._s3_ch('s3-ch-rider-fleet');
  PERFORM pg_temp._s3_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 's3-rider-fleet', 'charge_id', c.id, 'expected_charge_version', c.version,
    'suggestion_id', v_sug));
  IF toll_system.charge_state(v_org, c.id) NOT IN ('resolved', 'decided') THEN
    RAISE EXCEPTION '8 fleet_absorbs state %', toll_system.charge_state(v_org, c.id);
  END IF;
  PERFORM pg_temp._s3_alloc_ok(c.id);
  PERFORM pg_temp._s3_assert_nightly();  -- review: money check after Driver pays / Fleet pays

  -- 8b (review: was skipped; it is not covered anywhere else): a DRIVER CASH toll inside the InDrive
  -- trip gets the same "Driver pays" suggestion; after the receipt is checked, Driver pays carries it.
  PERFORM public.toll_sys_import(v_org, 'driver_cash', format(
    '[{"source_ref":"s3-ch-rider-cash","occurred_at":"%s","amount_minor":3200,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1","evidence":{"receipt_url":"s3-r"}}]',
    ((v_day::timestamp + time '10:40') AT TIME ZONE 'America/Jamaica'))::jsonb, 's3-cash-rider', 'smoke');  -- 19+ min after the tag tolls, so not an auto duplicate
  c := pg_temp._s3_ch('s3-ch-rider-cash');
  PERFORM pg_temp._s3_cmd('verify_cash_receipt', jsonb_build_object(
    'command_id', 's3-rider-cash-ok', 'charge_id', c.id, 'expected_charge_version', c.version));
  v_store := pg_temp._s3_match_store(jsonb_build_array(pg_temp._s3_cand_rider(c.id, 'indrive', v_ptid)));
  SELECT id INTO v_sug FROM toll.suggestions
  WHERE organization_id = v_org AND charge_id = c.id AND kind = 'rider_pays_driver' AND superseded_by IS NULL LIMIT 1;
  IF v_sug IS NULL THEN RAISE EXCEPTION '8b no rider suggestion for the driver cash toll'; END IF;
  c := pg_temp._s3_ch('s3-ch-rider-cash');
  PERFORM pg_temp._s3_cmd('driver_pays', jsonb_build_object(
    'command_id', 's3-rider-cash-drv', 'charge_id', c.id, 'expected_charge_version', c.version,
    'suggestion_id', v_sug));
  PERFORM pg_temp._s3_alloc_ok(c.id);
  IF EXISTS (SELECT 1 FROM toll.disputes WHERE organization_id = v_org AND charge_id = c.id) THEN
    RAISE EXCEPTION '8b a dispute opened on an InDrive toll';
  END IF;
  PERFORM pg_temp._s3_assert_nightly();

  -- 14 (review: was skipped): the InDrive trip is cancelled → its platform trip is withdrawn, and the
  -- next matcher run (no candidate for it any more) withdraws the open rider suggestion.
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-rider-cancel-trip', v_org::text, v_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 2200, 's3-kv-rider-c',
    jsonb_build_object('isManual', true, 'requestTime', v_req, 'dropoffTime', v_drop));
  PERFORM public.toll_sys_import(v_org, 'tag_statement', format(
    '[{"source_ref":"s3-ch-rider-cancel","occurred_at":"%s","amount_minor":3300,"plaza_id":"s3-pz",
      "vehicle_id":"v1","driver_id":"s3-d1"}]',
    ((v_day::timestamp + time '10:30') AT TIME ZONE 'America/Jamaica'))::jsonb, 's3-tag-rider-c', 'smoke');
  c := pg_temp._s3_ch('s3-ch-rider-cancel');
  PERFORM pg_temp._s3_match_store(jsonb_build_array(
    pg_temp._s3_cand_rider(c.id, 'indrive', 'logged:s3-rider-cancel-trip')));
  UPDATE fleet.trips SET status = 'cancelled' WHERE id = 's3-rider-cancel-trip';
  IF NOT EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org
                   AND platform_trip_id = 'logged:s3-rider-cancel-trip' AND withdrawn_at IS NOT NULL) THEN
    RAISE EXCEPTION '14 cancelled trip not withdrawn';
  END IF;
  -- The trip is withdrawn, so match_store must refuse a candidate pointing at it, and the open
  -- suggestion (no longer a candidate) is withdrawn.
  v_store := pg_temp._s3_match_store(jsonb_build_array(
    pg_temp._s3_cand_rider(c.id, 'indrive', 'logged:s3-rider-cancel-trip')));
  IF EXISTS (SELECT 1 FROM toll.suggestions WHERE organization_id = v_org AND charge_id = c.id
               AND kind = 'rider_pays_driver' AND superseded_by IS NULL AND NOT ('withdrawn' = ANY (rules_fired))) THEN
    RAISE EXCEPTION '14 rider suggestion on a withdrawn trip still open';
  END IF;

  -- review S2b-R1: the mirror trigger never stops a trip from saving (a company id that isn't a uuid)
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-bad-org-trip', 'not-a-uuid', v_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 1000, 's3-kv-bad-org', jsonb_build_object('isManual', true));
  IF NOT EXISTS (SELECT 1 FROM fleet.trips WHERE id = 's3-bad-org-trip') THEN
    RAISE EXCEPTION 'R1 trip with a non-uuid company did not save';
  END IF;
  IF EXISTS (SELECT 1 FROM toll.platform_trips WHERE platform_trip_id = 'logged:s3-bad-org-trip') THEN
    RAISE EXCEPTION 'R1 non-uuid company trip was mirrored';
  END IF;

  -- review S2b-R2: a trip logged with a date only (no clock times) is date_only, not a noon "minute" trip
  INSERT INTO fleet.trips (
    id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES (
    's3-dateonly-trip', v_org::text, v_day, 's3-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 1500, 's3-kv-dateonly',
    jsonb_build_object('isManual', true, 'requestTime', to_char(v_day, 'YYYY-MM-DD')));
  IF NOT EXISTS (SELECT 1 FROM toll.platform_trips WHERE organization_id = v_org
                   AND platform_trip_id = 'logged:s3-dateonly-trip' AND time_precision = 'date_only'
                   AND dropoff_at IS NULL AND pickup_at IS NULL
                   AND (request_at AT TIME ZONE 'America/Jamaica')::date = v_day) THEN
    RAISE EXCEPTION 'R2 date-only trip not mirrored as date_only on its day: %',
      (SELECT to_jsonb(t) FROM toll.platform_trips t WHERE t.platform_trip_id = 'logged:s3-dateonly-trip');
  END IF;
  PERFORM pg_temp._s3_assert_nightly();

  RAISE NOTICE 'toll_sweep_logged_trips_test: rider ok';
END;
$$;

ROLLBACK;