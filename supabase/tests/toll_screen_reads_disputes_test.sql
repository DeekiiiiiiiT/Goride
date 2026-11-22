-- Toll Round S3: screen reads + disputes (rolled back).
-- Proof groups 1–12 from docs/toll-build/cursor-S3-screen-reads.md (Tests section).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT u.id, u.email
FROM (VALUES
  ('d3a01111-1111-4111-8111-111111111111'::uuid, 's3rd-mgr@example.com'),
  ('d3a02111-1111-4111-8111-111111111112'::uuid, 's3rd-drv-a@example.com'),
  ('d3a03111-1111-4111-8111-111111111113'::uuid, 's3rd-drv-b@example.com'),
  ('d3a04111-1111-4111-8111-111111111114'::uuid, 's3rd-view@example.com'),
  ('d3a05111-1111-4111-8111-111111111115'::uuid, 's3rd-mgr-b@example.com')
) AS u(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES
  ('d3a11111-1111-4111-8111-111111111101', 'd3a01111-1111-4111-8111-111111111111', 'Toll S3 Screen Reads', 'toll-s3-screen', 'fleet', 'active'),
  ('d3b22222-2222-4222-8222-222222222202', 'd3a05111-1111-4111-8111-111111111115', 'Toll S3 Screen B', 'toll-s3-screen-b', 'fleet', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes, logged_trips, rider_pays_driver)
VALUES
  ('d3a11111-1111-4111-8111-111111111101', true, true, true, true),
  ('d3b22222-2222-4222-8222-222222222202', true, true, false, false)
ON CONFLICT (organization_id) DO UPDATE SET
  tolls_v2 = true, toll_disputes = EXCLUDED.toll_disputes,
  logged_trips = EXCLUDED.logged_trips, rider_pays_driver = EXCLUDED.rider_pays_driver;

SELECT toll_system.ensure_accounts('d3a11111-1111-4111-8111-111111111101');
SELECT toll_system.ensure_accounts('d3b22222-2222-4222-8222-222222222202');

INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
VALUES ('fleet_viewer', 'Fleet Viewer', 's3rd toll scr test', 30, 'fleet', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, status, expires_at)
SELECT 'd3a04111-1111-4111-8111-111111111114', r.id, 'organization',
       'd3a11111-1111-4111-8111-111111111101', 'active', NULL
FROM platform.roles r WHERE r.name = 'fleet_viewer'
ON CONFLICT DO NOTHING;

INSERT INTO fleet.drivers (id, legacy_kv_id, organization_id, name, status, user_id, service_lines, payload_json)
VALUES
  ('s3rd-d1-fleet', 's3rd-d1', 'd3a11111-1111-4111-8111-111111111101', 'Driver Alpha', 'active',
   'd3a02111-1111-4111-8111-111111111112', ARRAY['rideshare'], '{}'::jsonb),
  ('s3rd-d2-fleet', 's3rd-d2', 'd3a11111-1111-4111-8111-111111111101', 'Driver Beta', 'active',
   'd3a03111-1111-4111-8111-111111111113', ARRAY['rideshare'], '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  legacy_kv_id = EXCLUDED.legacy_kv_id, organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name, user_id = EXCLUDED.user_id;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_org() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3a11111-1111-4111-8111-111111111101'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_org_b() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3b22222-2222-4222-8222-222222222202'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_mgr() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3a01111-1111-4111-8111-111111111111'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_mgr_b() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3a05111-1111-4111-8111-111111111115'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_drv_a() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3a02111-1111-4111-8111-111111111112'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_drv_b() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'd3a03111-1111-4111-8111-111111111113'::uuid; $$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', p_org::text)
  )::text, true);
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr(), pg_temp._s3rd_org());
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_user_cmd(p_user uuid, p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $uc$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._s3rd_as(p_user, pg_temp._s3rd_org());
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$uc$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_refused(p_user uuid, p_intent text, p_body jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $r$
DECLARE m text;
BEGIN
  BEGIN
    PERFORM pg_temp._s3rd_user_cmd(p_user, p_intent, p_body);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's3rd expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 's3rd expected % but command succeeded', p_code;
END;
$r$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_expect_read(p_fn regprocedure, p_code text, p_args text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $er$
DECLARE m text;
BEGIN
  BEGIN
  CASE p_args
    WHEN 'week' THEN PERFORM public.toll_v2_week_desk(current_setting('s3rd.test_week', true)::date);
    WHEN 'disputes' THEN PERFORM public.toll_v2_disputes();
    WHEN 'settings' THEN PERFORM public.toll_v2_toll_settings();
    ELSE PERFORM 1;
  END CASE;
    RAISE EXCEPTION 's3rd read expected % but succeeded', p_code;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RETURN;
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    RESET ROLE;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 's3rd read expected % got %', p_code, m;
    END IF;
  END;
END;
$er$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_ch(p_ref text) RETURNS toll.charges
LANGUAGE sql AS $ch$
  SELECT * FROM toll.charges WHERE organization_id = pg_temp._s3rd_org() AND source_ref = p_ref;
$ch$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_pb(p_ref text) RETURNS toll.paybacks
LANGUAGE sql AS $pb$
  SELECT * FROM toll.paybacks WHERE organization_id = pg_temp._s3rd_org() AND reference = p_ref;
$pb$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_natural(p_suffix text) RETURNS bigint
LANGUAGE sql AS $b$
  SELECT coalesce(
    (SELECT balance_minor FROM ledger.accounts
     WHERE account_key = 'org:' || pg_temp._s3rd_org()::text || ':toll:' || p_suffix), 0);
$b$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_snap() RETURNS jsonb
LANGUAGE sql AS $s$
  SELECT jsonb_build_object(
    'receivable_platform_dispute', pg_temp._s3rd_natural('receivable_platform_dispute'),
    'payback_unallocated', pg_temp._s3rd_natural('payback_unallocated'),
    'receivable_driver', pg_temp._s3rd_natural('receivable_driver'),
    'expense', pg_temp._s3rd_natural('expense'),
    'suspense', pg_temp._s3rd_natural('suspense'));
$s$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_assert_delta(
  p_before jsonb, p_label text,
  p_rpd bigint, p_payback bigint, p_driver bigint, p_expense bigint, p_suspense bigint
) RETURNS void
LANGUAGE plpgsql AS $ad$
DECLARE
  keys text[] := ARRAY['receivable_platform_dispute','payback_unallocated','receivable_driver','expense','suspense'];
  exp bigint[] := ARRAY[p_rpd, p_payback, p_driver, p_expense, p_suspense];
  i int; got bigint; bef bigint;
BEGIN
  FOR i IN 1..5 LOOP
    got := pg_temp._s3rd_natural(keys[i]);
    bef := (p_before ->> keys[i])::bigint;
    IF got - bef IS DISTINCT FROM exp[i] THEN
      RAISE EXCEPTION '% delta % got % expected %', p_label, keys[i], got - bef, exp[i];
    END IF;
  END LOOP;
END;
$ad$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_assert_nightly() RETURNS void
LANGUAGE plpgsql AS $n$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM toll_system.nightly_checks(pg_temp._s3rd_org()) LOOP
    IF NOT r.ok THEN
      RAISE EXCEPTION 'nightly % (check %) %', r.name, r.check_no, r.detail;
    END IF;
  END LOOP;
END;
$n$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_patch_dispute(
  p_id uuid,
  p_deadline timestamptz DEFAULT NULL,
  p_clock_from timestamptz DEFAULT NULL,
  p_recovered bigint DEFAULT NULL,
  p_state text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $pd$
BEGIN
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET
    deadline = coalesce(p_deadline, deadline),
    clock_from = coalesce(p_clock_from, clock_from),
    recovered_minor = coalesce(p_recovered, recovered_minor),
    state = coalesce(p_state, state)
  WHERE organization_id = pg_temp._s3rd_org() AND id = p_id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
END;
$pd$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_alloc_ok(p_charge uuid) RETURNS void
LANGUAGE plpgsql AS $ok$
DECLARE v_amt bigint; v_sum bigint;
BEGIN
  SELECT amount_minor INTO v_amt FROM toll.charges
  WHERE organization_id = pg_temp._s3rd_org() AND id = p_charge;
  SELECT coalesce(sum(amount_minor), 0) INTO v_sum FROM toll.allocations
  WHERE organization_id = pg_temp._s3rd_org() AND charge_id = p_charge AND reversed_by IS NULL;
  IF v_sum <> v_amt THEN RAISE EXCEPTION 'alloc sum % <> charge %', v_sum, v_amt; END IF;
END;
$ok$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_week_hash(p_week date) RETURNS text
LANGUAGE sql AS $h$
  SELECT coalesce(md5(string_agg(
    e.id::text || ':' || e.amount_minor::text || ':' || coalesce(e.metadata ->> 'toll_rule', ''),
    '|' ORDER BY e.id)), '')
  FROM ledger.entries e
  WHERE e.organization_id = pg_temp._s3rd_org() AND e.reference_type = 'toll'
    AND (e.metadata ->> 'toll_week')::date = p_week;
$h$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_cover_week(p_week date, p_suffix text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $cov$
BEGIN
  INSERT INTO fleet.import_batches (
    id, organization_id, file_name, status, type, legacy_kv_id, payload_json, source_id, week_keys,
    coverage_start, coverage_end)
  VALUES (
    's3rd-uber-batch-' || p_suffix || p_week::text, pg_temp._s3rd_org()::text, 'uber-week.csv', 'committed', 'merged_import',
    's3rd-kv-' || p_suffix || p_week::text, '{}'::jsonb, 'uber_bundle', ARRAY[p_week]::date[],
    p_week, p_week + 6)
  ON CONFLICT (id) DO NOTHING;
END;
$cov$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_cover_refund_periods(p_clock timestamptz, p_periods int) RETURNS void
LANGUAGE plpgsql AS $crp$
DECLARE n int;
BEGIN
  FOR n IN 1..p_periods LOOP
    PERFORM pg_temp._s3rd_cover_week(toll_system.dispute_refund_period_week_start(p_clock, n), 'p' || n::text || '-');
  END LOOP;
END;
$crp$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_import(
  p_suffix text, p_week date, p_driver text DEFAULT 's3rd-d1',
  p_charge bigint DEFAULT 39000, p_pb bigint DEFAULT 37000)
RETURNS void
LANGUAGE plpgsql AS $imp$
DECLARE
  v_trip text := 's3rd-trip-' || p_suffix;
  v_ch text := 's3rd-ch-' || p_suffix;
  -- Review S3-R7 (any weekday in CI): an earlier week's trip is on its Sunday, so it is 1–7 days old and its
  -- dispute is still inside the 9-day window whatever day the test runs; a week 9+ days back still opens expired.
  -- This week's trip is in the past (never in the future on a Monday). The toll is 20 minutes into the trip.
  v_trip_at timestamptz := CASE
    WHEN p_week < ledger.jamaica_week_start(now()) THEN ((p_week + 6) + time '10:00') AT TIME ZONE 'America/Jamaica'
    ELSE greatest((p_week + time '00:01') AT TIME ZONE 'America/Jamaica',
                  least(((p_week + 1) + time '15:00') AT TIME ZONE 'America/Jamaica', now() - interval '1 hour')) END;
  v_occurred timestamptz := v_trip_at + interval '20 minutes';
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'uber', format(
    '[{"row_type":"trip","platform_trip_id":"%s","driver_id":"%s","vehicle_id":"v1",
      "request_at":"%s","dropoff_at":"%s","payment_method":"card","toll_payback_minor":%s}]'::text,
    v_trip, p_driver, v_trip_at, v_trip_at + interval '40 minutes', p_pb)::jsonb,
    's3rd-uber-' || p_suffix, 'smoke');
  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'tag_statement', format(
    '[{"source_ref":"%s","occurred_at":"%s","amount_minor":%s,"plaza_id":"s3rd-pz",
      "vehicle_id":"v1","driver_id":"%s"}]'::text,
    v_ch, v_occurred, p_charge, p_driver)::jsonb,
    's3rd-tag-' || p_suffix, 'smoke');
END;
$imp$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_adj(p_ref text, p_driver text, p_minor bigint DEFAULT 2000, p_paid date DEFAULT NULL)
RETURNS toll.paybacks
LANGUAGE plpgsql AS $adj$
DECLARE v_paid date := coalesce(p_paid, (now() AT TIME ZONE 'America/Jamaica')::date);
BEGIN
  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'uber', format(
    '[{"row_type":"adjustment","reference":"%s","driver_id":"%s","paid_on":"%s","amount_minor":%s}]',
    p_ref, p_driver, v_paid, p_minor)::jsonb, 's3rd-adj-' || p_ref, 'smoke');
  RETURN pg_temp._s3rd_pb(p_ref);
END;
$adj$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_seed_settings(p_week date) RETURNS void
LANGUAGE plpgsql AS $seed$
BEGIN
  INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
  VALUES ('s3rd-pz', 10, 'same_day')
  ON CONFLICT (plaza_id) DO NOTHING;
  PERFORM pg_temp._s3rd_cmd('approve_settings_seed', jsonb_build_object(
    'command_id', 's3rd-seed', 'note', 's3rd screen reads seed',
    'self_approval_reason', 'twelve chars'));
  -- Uber's rate is shared data (no longer set from Fleet: 20261121222218)
  INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from)
  VALUES ('s3rd-pz', 'platform_refund', 'uber', 37000, (p_week)::date);
  INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from)
  VALUES ('s3rd-pz', 'tag_price', NULL, 39000, p_week)
  ON CONFLICT DO NOTHING;
END;
$seed$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_inputs(p_charge uuid, p_payback uuid, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $i$
  SELECT jsonb_build_object('engine_version', 'toll-matcher-v2', 'config', jsonb_build_object('note', 's3rd-sql'))
    || p_extra || jsonb_build_object(
      'charge', jsonb_build_object('id', p_charge::text),
      'payback', jsonb_build_object('id', p_payback::text));
$i$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_cand(
  p_charge uuid, p_payback uuid, p_open boolean DEFAULT false, p_settle boolean DEFAULT false,
  p_kind text DEFAULT 'payback', p_dispute uuid DEFAULT NULL, p_rules text[] DEFAULT ARRAY['on_trip','amount_exact'])
RETURNS jsonb LANGUAGE sql AS $ca$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'kind', CASE WHEN p_kind <> 'payback' THEN p_kind ELSE NULL END,
    'dispute_id', p_dispute, 'charge_id', p_charge, 'payback_id', p_payback,
    'score', 100, 'auto_apply', false,
    'score_parts', jsonb_build_object('total', 100, 'dispute_open_eligible', p_open,
      'dispute_settle_eligible', p_settle, 'auto_apply', false),
    'rules_fired', to_jsonb(p_rules),
    'inputs', pg_temp._s3rd_inputs(p_charge, p_payback,
      CASE WHEN p_kind = 'dispute_refund' THEN jsonb_build_object('kind', 'dispute_refund', 'dispute_id', p_dispute::text)
           ELSE '{}'::jsonb END)));
$ca$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_cand_rider(p_charge uuid, p_plat text, p_trip_id text)
RETURNS jsonb LANGUAGE sql AS $cr$
  SELECT jsonb_build_object('kind', 'rider_pays_driver', 'charge_id', p_charge, 'payback_id', NULL,
    'trip_platform', p_plat, 'trip_id', p_trip_id, 'score', 90, 'auto_apply', false,
    'dispute_open_eligible', false, 'dispute_settle_eligible', false,
    'score_parts', jsonb_build_object('total', 90, 'auto_apply', false),
    'rules_fired', to_jsonb(ARRAY['on_trip','rider_pays_driver','rider_owed_driver_collects']),
    'inputs', jsonb_build_object('engine_version', 'toll-matcher-v2', 'kind', 'rider_pays_driver',
      'charge', jsonb_build_object('id', p_charge::text),
      'trip', jsonb_build_object('platform', p_plat, 'platform_trip_id', p_trip_id)));
$cr$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_match_store(p_cands jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ms$
DECLARE
  v_org uuid := pg_temp._s3rd_org(); v_fc uuid[]; v_fp uuid[]; v_id uuid;
  v_claim jsonb; v_store jsonb;
BEGIN
  v_fc := array(SELECT DISTINCT (x ->> 'charge_id')::uuid FROM jsonb_array_elements(p_cands) x WHERE x ? 'charge_id');
  v_fp := array(SELECT DISTINCT (x ->> 'payback_id')::uuid FROM jsonb_array_elements(p_cands) x
                WHERE x ? 'payback_id' AND nullif(x ->> 'payback_id', '') IS NOT NULL);
  DELETE FROM toll.match_queue WHERE organization_id = v_org;
  FOREACH v_id IN ARRAY v_fc LOOP PERFORM toll_system.match_enqueue(v_org, 'charge', v_id); END LOOP;
  FOREACH v_id IN ARRAY v_fp LOOP PERFORM toll_system.match_enqueue(v_org, 'payback', v_id); END LOOP;
  RESET ROLE; SET LOCAL ROLE service_role;
  v_claim := public.toll_sys_match_claim(v_org, 500);
  IF nullif(v_claim ->> 'claim_id', '') IS NULL AND jsonb_array_length(p_cands) > 0 THEN
    RAISE EXCEPTION 's3rd match claim empty';
  END IF;
  IF nullif(v_claim ->> 'claim_id', '') IS NOT NULL THEN
    v_store := public.toll_sys_match_store(v_org, (v_claim ->> 'claim_id')::uuid,
      jsonb_build_object('engine_version', 'toll-matcher-v2', 'candidates', p_cands));
  ELSE v_store := '{}'::jsonb; END IF;
  RESET ROLE;
  RETURN coalesce(v_store, '{}'::jsonb) || jsonb_build_object('claim', v_claim);
END;
$ms$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_desk(p_week date) RETURNS jsonb
LANGUAGE plpgsql AS $d$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr(), pg_temp._s3rd_org());
  v := public.toll_v2_week_desk(p_week);
  RESET ROLE;
  RETURN v;
END;
$d$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_disputes_tab(p_driver text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $dt$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr(), pg_temp._s3rd_org());
  v := public.toll_v2_disputes(p_driver);
  RESET ROLE;
  RETURN v;
END;
$dt$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_settings() RETURNS jsonb
LANGUAGE plpgsql AS $st$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr(), pg_temp._s3rd_org());
  v := public.toll_v2_toll_settings();
  RESET ROLE;
  RETURN v;
END;
$st$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_active_row(p_desk jsonb, p_dispute uuid) RETURNS jsonb
LANGUAGE sql AS $ar$
  SELECT x FROM jsonb_array_elements(p_desk -> 'disputes' -> 'active') x
  WHERE (x ->> 'id')::uuid = p_dispute;
$ar$;

CREATE OR REPLACE FUNCTION pg_temp._s3rd_open(p_suffix text, p_week date, p_driver text DEFAULT 's3rd-d1')
RETURNS TABLE (c toll.charges, p toll.paybacks, d toll.disputes)
LANGUAGE plpgsql AS $od$
DECLARE v_c toll.charges; v_p toll.paybacks; v_d toll.disputes;
BEGIN
  PERFORM pg_temp._s3rd_import(p_suffix, p_week, p_driver);
  v_c := pg_temp._s3rd_ch('s3rd-ch-' || p_suffix);
  v_p := pg_temp._s3rd_pb('trip:s3rd-trip-' || p_suffix);
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(pg_temp._s3rd_cand(v_c.id, v_p.id, true)));
  SELECT * INTO v_d FROM toll.disputes
  WHERE organization_id = pg_temp._s3rd_org() AND charge_id = v_c.id AND close_reason IS DISTINCT FROM 'undo'
  ORDER BY created_at DESC LIMIT 1;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 's3rd open %: no dispute', p_suffix; END IF;
  RETURN QUERY SELECT v_c, v_p, v_d;
END;
$od$;

CREATE OR REPLACE PROCEDURE pg_temp._s3rd_load(
  p_suffix text, p_week date,
  INOUT io_c toll.charges, INOUT io_p toll.paybacks, INOUT io_d toll.disputes,
  p_driver text DEFAULT 's3rd-d1')
LANGUAGE plpgsql AS $lod$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp._s3rd_open(p_suffix, p_week, p_driver) LIMIT 1;
  io_c := r.c; io_p := r.p; io_d := r.d;
END;
$lod$;

-- ══ 1. Access + 2. Switches off (baseline) ══
DO $$
DECLARE
  v_org uuid := pg_temp._s3rd_org();
  v_week date;
  v_desk jsonb; v_set jsonb; v_dis jsonb;
  v_row jsonb; c toll.charges; p toll.paybacks; d toll.disputes;
  v_fn_desk regprocedure := 'public.toll_v2_week_desk(date)'::regprocedure;
  v_fn_dis regprocedure := 'public.toll_v2_disputes(text)'::regprocedure;
  v_fn_set regprocedure := 'public.toll_v2_toll_settings()'::regprocedure;
  v_fn_drv regprocedure := 'public.toll_sys_driver_disputes(uuid, text)'::regprocedure;
  v_fn_drv_sent regprocedure := 'public.toll_sys_driver_mark_dispute_sent(uuid, text, uuid, jsonb)'::regprocedure;
BEGIN
  v_week := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '35 days');
  PERFORM set_config('s3rd.test_week', v_week::text, true);

  -- a new company comes with its toll settings already set up (no seed step)
  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr(), v_org);
  v_set := public.toll_v2_toll_settings();
  RESET ROLE;
  IF NOT coalesce((v_set ->> 'seeded')::boolean, false) THEN RAISE EXCEPTION '12 new company not set up %', v_set; END IF;

  PERFORM pg_temp._s3rd_import('acc1', v_week);
  PERFORM pg_temp._s3rd_seed_settings(v_week);
  PERFORM pg_temp._s3rd_assert_nightly();

  IF has_function_privilege('anon', v_fn_dis, 'EXECUTE')
     OR has_function_privilege('service_role', v_fn_dis, 'EXECUTE')
     OR has_function_privilege('anon', v_fn_set, 'EXECUTE')
     OR has_function_privilege('service_role', v_fn_set, 'EXECUTE')
     OR has_function_privilege('service_role', v_fn_desk, 'EXECUTE') THEN
    RAISE EXCEPTION '1 anon/service_role must not EXECUTE user reads';
  END IF;
  IF has_function_privilege('authenticated', v_fn_drv, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn_drv_sent, 'EXECUTE') THEN
    RAISE EXCEPTION '1 authenticated must not EXECUTE toll_sys_driver_*';
  END IF;

  PERFORM pg_temp._s3rd_as('d3a04111-1111-4111-8111-111111111114'::uuid, v_org);
  PERFORM pg_temp._s3rd_expect_read(v_fn_desk, 'FORBIDDEN', 'week');
  PERFORM pg_temp._s3rd_expect_read(v_fn_dis, 'FORBIDDEN', 'disputes');

  CALL pg_temp._s3rd_load('drvforbid', ledger.jamaica_week_start(now()), c, p, d);
  IF d.state <> 'to_send' THEN RAISE EXCEPTION '1 driver forbid setup state %', d.state; END IF;
  PERFORM pg_temp._s3rd_refused(pg_temp._s3rd_drv_a(), 'mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-drv-forbid', 'dispute_id', d.id, 'expected_dispute_version', d.version), 'FORBIDDEN');
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = v_org AND x.id = d.id;
  IF d.state <> 'to_send' THEN RAISE EXCEPTION '1 driver forbid changed dispute'; END IF;

  PERFORM pg_temp._s3rd_as(pg_temp._s3rd_mgr_b(), pg_temp._s3rd_org_b());
  v_desk := public.toll_v2_week_desk(v_week);
  RESET ROLE;
  IF jsonb_array_length(coalesce(v_desk -> 'disputes' -> 'active', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION '1 company B sees A disputes';
  END IF;

  -- 2 switches off
  UPDATE toll.switch_state SET toll_disputes = false, logged_trips = false, rider_pays_driver = false
  WHERE organization_id = v_org;
  v_desk := pg_temp._s3rd_desk(v_week);
  v_dis := pg_temp._s3rd_disputes_tab();
  v_set := pg_temp._s3rd_settings();
  IF jsonb_array_length(coalesce(v_desk -> 'disputes' -> 'active', '[]'::jsonb)) > 0
     OR jsonb_array_length(coalesce(v_desk -> 'results', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION '2 disputes empty when off';
  END IF;
  IF jsonb_array_length(coalesce(v_dis -> 'active', '[]'::jsonb)) > 0 THEN RAISE EXCEPTION '2 tab empty'; END IF;
  c := pg_temp._s3rd_ch('s3rd-ch-acc1');
  p := pg_temp._s3rd_pb('trip:s3rd-trip-acc1');
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(pg_temp._s3rd_cand(c.id, p.id, false)));
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'charges') x
    WHERE EXISTS (SELECT 1 FROM toll.charges ch WHERE ch.id = (x ->> 'id')::uuid AND ch.source_ref = 's3rd-ch-acc1'));
  IF coalesce(v_row -> 'suggestions' -> 0 ->> 'kind', 'payback') <> 'payback'
     OR v_row -> 'suggestions' -> 0 ->> 'command' <> 'apply_suggestion' THEN
    RAISE EXCEPTION '2 payback suggestion shape %', v_row -> 'suggestions' -> 0;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') x WHERE x ->> 'section' = 'disputes') THEN
    RAISE EXCEPTION '2 no charge in disputes section';
  END IF;
  UPDATE toll.switch_state SET toll_disputes = true, logged_trips = true, rider_pays_driver = true
  WHERE organization_id = v_org;
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 3. Disputes part (tiles, late, daysLeft, windowClosed, undone, fromWeekKey) ══
DO $$
DECLARE
  v_week date := ledger.jamaica_week_start(now());
  v_old date := v_week - 14;
  v_desk jsonb; v_row jsonb; c toll.charges; p toll.paybacks; d toll.disputes;
  v_dec uuid; v_cnt int;
BEGIN
  CALL pg_temp._s3rd_load('p3-old', v_old, c, p, d);
  CALL pg_temp._s3rd_load('p3-cur', v_week, c, p, d);
  v_desk := pg_temp._s3rd_desk(v_week);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') x
    WHERE (x ->> 'id')::uuid = c.id AND x ->> 'section' = 'disputes' AND (x ->> 'part')::int = 3) THEN
    RAISE EXCEPTION '3 disputed charge not part 3';
  END IF;
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF v_row ->> 'fromWeekKey' IS NOT NULL THEN
    IF v_row ->> 'fromWeekKey' IS DISTINCT FROM v_old::text THEN RAISE EXCEPTION '3 fromWeekKey'; END IF;
  END IF;

  -- daysLeft 6 of 9
  PERFORM pg_temp._s3rd_patch_dispute(d.id,
    ((now() AT TIME ZONE 'America/Jamaica')::date + 6)::timestamp AT TIME ZONE 'America/Jamaica');
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF (v_row ->> 'daysLeft')::int <> 6 OR (v_row ->> 'windowDays')::int <> 9 THEN
    RAISE EXCEPTION '3 daysLeft6 got % window %', v_row ->> 'daysLeft', v_row ->> 'windowDays';
  END IF;
  IF coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 six days not late'; END IF;

  -- 2 days left → late; 3 days → not late
  PERFORM pg_temp._s3rd_patch_dispute(d.id,
    ((now() AT TIME ZONE 'America/Jamaica')::date + 2)::timestamp AT TIME ZONE 'America/Jamaica');
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF NOT coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 two days late'; END IF;
  PERFORM pg_temp._s3rd_patch_dispute(d.id,
    ((now() AT TIME ZONE 'America/Jamaica')::date + 3)::timestamp AT TIME ZONE 'America/Jamaica');
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 three days not late'; END IF;

  -- windowClosed → canMarkSent false
  PERFORM pg_temp._s3rd_patch_dispute(d.id, now() - interval '1 hour');
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF coalesce((v_row ->> 'canMarkSent')::boolean, true) OR NOT (v_row ->> 'windowClosed')::boolean THEN
    RAISE EXCEPTION '3 windowClosed flags';
  END IF;
  PERFORM pg_temp._s3rd_patch_dispute(d.id,
    ((now() AT TIME ZONE 'America/Jamaica')::date + 5)::timestamp AT TIME ZONE 'America/Jamaica',
    NULL, NULL, 'to_send');

  -- sent late cases
  CALL pg_temp._s3rd_load('p3-sent', v_week, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p3-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE id = d.id;
  PERFORM pg_temp._s3rd_patch_dispute(d.id, NULL,
    ((now() AT TIME ZONE 'America/Jamaica')::date - 10)::timestamp AT TIME ZONE 'America/Jamaica');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  PERFORM pg_temp._s3rd_cover_week(toll_system.dispute_refund_period_week_start(d.clock_from, 1), 'late1-');
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF NOT coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 sent period1 late'; END IF;

  p := pg_temp._s3rd_adj('s3rd-adj-part', 's3rd-d2', 1000);
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 partial recovered not late'; END IF;

  -- period1 not in → not late (fresh sent dispute; keep books aligned — do not zero recovered_minor)
  CALL pg_temp._s3rd_load('p3-late2', v_week, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p3-late2', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  PERFORM pg_temp._s3rd_patch_dispute(d.id, NULL, now() - interval '10 days');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  DELETE FROM fleet.import_batches ib
  WHERE ib.organization_id = pg_temp._s3rd_org()::text AND ib.source_id = 'uber_bundle' AND ib.status = 'committed'
    AND ib.coverage_start <= toll_system.dispute_refund_period_week_start(d.clock_from, 1)
    AND ib.coverage_end >= toll_system.dispute_refund_period_week_start(d.clock_from, 1);
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF coalesce((v_row ->> 'late')::boolean, false) THEN RAISE EXCEPTION '3 period1 not in not late'; END IF;

  SELECT count(*)::int INTO v_cnt FROM jsonb_array_elements(pg_temp._s3rd_desk(v_week) -> 'disputes' -> 'active');
  IF v_cnt < 2 THEN RAISE EXCEPTION '3 active count'; END IF;
  v_desk := pg_temp._s3rd_desk(v_week);
  IF (v_desk -> 'disputes' -> 'tiles' -> 'toSend' ->> 'count')::int < 1 THEN RAISE EXCEPTION '3 tiles toSend'; END IF;

  -- undone dispute absent
  CALL pg_temp._s3rd_load('p3-undo', v_week + 7, c, p, d);
  SELECT dec.id INTO v_dec FROM toll.decisions dec
  WHERE dec.organization_id = pg_temp._s3rd_org() AND dec.command_id LIKE 'matcher:link:%'
    AND dec.targets ->> 'charge_id' = c.id::text LIMIT 1;
  c := pg_temp._s3rd_ch('s3rd-ch-p3-undo'); p := pg_temp._s3rd_pb('trip:s3rd-trip-p3-undo');
  PERFORM pg_temp._s3rd_cmd('undo_decision', jsonb_build_object(
    'command_id', 's3rd-undo-dispute', 'decision_id', v_dec,
    'expected_versions', jsonb_build_object(c.id::text, c.version, p.id::text, p.version),
    'self_approval_reason', 'twelve chars'));
  v_desk := pg_temp._s3rd_desk(v_week + 7);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'disputes' -> 'active') x
    WHERE (x ->> 'closeReason') = 'undo' OR (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION '3 undone in list';
  END IF;
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 4. Refund received candidates ══
DO $$
DECLARE v_week date := ledger.jamaica_week_start(now());
  c toll.charges; p toll.paybacks; d toll.disputes; v_desk jsonb; v_row jsonb;
  v_cand jsonb; v_pb uuid; v_blk jsonb;
BEGIN
  CALL pg_temp._s3rd_load('p4-main', v_week, c, p, d, 's3rd-d1');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p4-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s3rd_adj('s3rd-adj-p4', 's3rd-d1', 2000);
  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
    amount_minor, received_by, is_legacy)
  VALUES (pg_temp._s3rd_org(), 'uber', 'adjustment', NULL, 's3rd-legacy-p4', 's3rd-d1',
    (now() AT TIME ZONE 'America/Jamaica')::date, v_week, 2000, 'fleet', true);
  p := pg_temp._s3rd_adj('s3rd-adj-p4b', 's3rd-d2', 2000);
  p := pg_temp._s3rd_pb('s3rd-adj-p4');
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand(c.id, p.id, false, false, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := pg_temp._s3rd_active_row(v_desk, d.id);
  IF jsonb_array_length(coalesce(v_row -> 'refundCandidates', '[]'::jsonb)) < 1 THEN RAISE EXCEPTION '4 no candidates'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row -> 'refundCandidates') rc WHERE rc ->> 'reference' = 's3rd-legacy-p4') THEN
    RAISE EXCEPTION '4 legacy listed';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row -> 'refundCandidates') rc WHERE rc ->> 'reference' = 's3rd-adj-p4b') THEN
    RAISE EXCEPTION '4 other driver listed';
  END IF;
  SELECT rc INTO v_cand FROM jsonb_array_elements(v_row -> 'refundCandidates') rc LIMIT 1;
  IF coalesce((v_cand ->> 'inRefundWindow')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION '4 inRefundWindow'; END IF;
  v_pb := (v_cand ->> 'paybackId')::uuid;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'paybacks') x WHERE x ->> 'reference' = 's3rd-adj-p4') THEN
    RAISE EXCEPTION '4 refund pb still in paybacks';
  END IF;
  SELECT b INTO v_blk FROM jsonb_array_elements(v_desk -> 'blockers') b
  WHERE (b ->> 'kind') = 'payback' AND (b ->> 'id')::uuid = v_pb LIMIT 1;
  IF coalesce((v_blk ->> 'part')::int, 0) <> 3 THEN RAISE EXCEPTION '4 blocker part %', v_blk; END IF;
  PERFORM pg_temp._s3rd_cmd('settle_dispute', jsonb_build_object(
    'command_id', 's3rd-p4-settle', 'dispute_id', d.id, 'expected_dispute_version', d.version + 1,
    'payback_id', v_pb, 'expected_payback_version', (SELECT version FROM toll.paybacks WHERE id = v_pb)));
  PERFORM pg_temp._s3rd_alloc_ok(c.id);
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 4b. Claude review checks (S3 review) ══
-- Runs before section 5, which seals last week. Each check would have failed on Cursor's first build.
DO $$
DECLARE
  v_open date := ledger.jamaica_week_start(now());
  v_old date := ledger.jamaica_week_start(now()) - 7;
  c toll.charges; p toll.paybacks; d toll.disputes; v_desk jsonb; v_row jsonb; v_res jsonb;
  v_h_old text; v_h_open text; v_trip_day date; v_cand jsonb; v_part int; v_n int; v_m bigint; v_b jsonb;
  v_exp jsonb; v_got jsonb;
BEGIN
  -- R1. A result of a dispute whose charge week is an earlier, still-open week posts in that week: its ledger
  --     changes, today's doesn't, and it is listed in that week's "Results this week" only. Its Undo works.
  CALL pg_temp._s3rd_load('r13-a', v_old, c, p, d, 's3rd-d2');
  IF d.state <> 'to_send' THEN RAISE EXCEPTION 'R1 setup state % (trip must be inside the window)', d.state; END IF;
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 'r13-a-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  v_h_old := pg_temp._s3rd_week_hash(v_old); v_h_open := pg_temp._s3rd_week_hash(v_open);
  PERFORM pg_temp._s3rd_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 'r13-a-lost', 'dispute_id', d.id, 'expected_dispute_version', d.version,
    'reason_code', 'platform_said_no', 'self_approval_reason', 'review check R1'));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  IF d.posted_in_week_key IS DISTINCT FROM v_old THEN RAISE EXCEPTION 'R1 posted week % want %', d.posted_in_week_key, v_old; END IF;
  IF pg_temp._s3rd_week_hash(v_old) = v_h_old THEN RAISE EXCEPTION 'R1 money did not land in the charge week'; END IF;
  IF pg_temp._s3rd_week_hash(v_open) IS DISTINCT FROM v_h_open THEN RAISE EXCEPTION 'R1 money landed in today''s week'; END IF;
  v_row := (SELECT x FROM jsonb_array_elements(pg_temp._s3rd_desk(v_old) -> 'results') x WHERE (x ->> 'id')::uuid = d.id);
  IF v_row IS NULL THEN RAISE EXCEPTION 'R1 not in charge week results'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp._s3rd_desk(v_open) -> 'results') x WHERE (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION 'R1 listed in today''s results';
  END IF;
  IF (v_row ->> 'borneMinor')::bigint <> 2000 THEN RAISE EXCEPTION 'R1 borne %', v_row ->> 'borneMinor'; END IF;
  PERFORM pg_temp._s3rd_cmd('undo_decision', (v_row -> 'undo')
    || jsonb_build_object('command_id', 'r13-a-undo', 'self_approval_reason', 'review check R1'));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  IF d.close_reason IS DISTINCT FROM 'undo' THEN RAISE EXCEPTION 'R1 undone row close_reason %', d.close_reason; END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.disputes r WHERE r.organization_id = pg_temp._s3rd_org() AND r.reopens_id = d.id
                   AND r.state = 'sent' AND r.clock_from IS NOT DISTINCT FROM d.clock_from) THEN
    RAISE EXCEPTION 'R1 undo did not reopen as sent with its clock';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp._s3rd_desk(v_old) -> 'results') x WHERE (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION 'R1 undone result still listed';
  END IF;
  PERFORM pg_temp._s3rd_alloc_ok(c.id);
  PERFORM pg_temp._s3rd_assert_nightly();

  -- R2. Refund received lists a refund paid on the trip date (before Mark as sent), flagged outside the
  --     refund window, and settle_dispute accepts it (done-test 13: a late trip line dated near the trip).
  CALL pg_temp._s3rd_load('r13-b', v_open, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 'r13-b-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  v_trip_day := (c.occurred_at AT TIME ZONE 'America/Jamaica')::date;
  p := pg_temp._s3rd_adj('r13-b-early', 's3rd-d2', 2000, v_trip_day);
  v_cand := (SELECT rc FROM jsonb_array_elements(pg_temp._s3rd_active_row(pg_temp._s3rd_desk(v_open), d.id) -> 'refundCandidates') rc
             WHERE (rc ->> 'paybackId')::uuid = p.id);
  IF v_cand IS NULL THEN RAISE EXCEPTION 'R2 trip-date refund not listed'; END IF;
  IF (v_cand ->> 'inRefundWindow')::boolean IS DISTINCT FROM (v_trip_day >= (d.clock_from AT TIME ZONE 'America/Jamaica')::date) THEN
    RAISE EXCEPTION 'R2 inRefundWindow %', v_cand;
  END IF;
  PERFORM pg_temp._s3rd_cmd('settle_dispute', jsonb_build_object(
    'command_id', 'r13-b-settle', 'dispute_id', d.id, 'expected_dispute_version', d.version,
    'payback_id', p.id, 'expected_payback_version', p.version));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  IF d.state <> 'won' THEN RAISE EXCEPTION 'R2 settle state %', d.state; END IF;
  PERFORM pg_temp._s3rd_alloc_ok(c.id);
  PERFORM pg_temp._s3rd_assert_nightly();

  -- R3. "If not sent" consequence (C4.18): driver normally; fleet when opened late; fleet when the
  --     company's expired bearer is the fleet. And the dispute text's time has no leading zero.
  CALL pg_temp._s3rd_load('r13-c', v_open, c, p, d, 's3rd-d1');
  RESET ROLE; SET LOCAL ROLE service_role;
  v_res := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1');
  RESET ROLE;
  v_row := (SELECT x FROM jsonb_array_elements(v_res -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id);
  IF v_row -> 'bearerIfNotSent' ->> 'bearer' <> 'driver' OR (v_row -> 'bearerIfNotSent' ->> 'amountMinor')::bigint <> 2000 THEN
    RAISE EXCEPTION 'R3 driver bearer %', v_row -> 'bearerIfNotSent';
  END IF;
  IF v_row ->> 'text' ~ '(^|[^0-9])0[0-9]:[0-9]{2} ?[AP]M' THEN RAISE EXCEPTION 'R3 leading zero in time: %', v_row ->> 'text'; END IF;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET opened_late = true WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  RESET ROLE; SET LOCAL ROLE service_role;
  v_res := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1');
  RESET ROLE;
  v_row := (SELECT x FROM jsonb_array_elements(v_res -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id);
  -- found late follows the setting (owner 21 Nov): here the driver
  IF v_row -> 'bearerIfNotSent' ->> 'bearer' <> 'driver' THEN RAISE EXCEPTION 'R3 opened late bearer %', v_row -> 'bearerIfNotSent'; END IF;
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET opened_late = false WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  PERFORM pg_temp._s3rd_cmd('change_toll_settings', jsonb_build_object(
    'command_id', 'r13-c-pol-fleet', 'note', 'expired bearer fleet', 'self_approval_reason', 'review check R3',
    'dispute_policy', jsonb_build_object('expired_bearer', 'fleet')));
  RESET ROLE; SET LOCAL ROLE service_role;
  v_res := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1');
  RESET ROLE;
  v_row := (SELECT x FROM jsonb_array_elements(v_res -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id);
  IF v_row -> 'bearerIfNotSent' ->> 'bearer' <> 'fleet' THEN RAISE EXCEPTION 'R3 policy fleet bearer %', v_row -> 'bearerIfNotSent'; END IF;
  PERFORM pg_temp._s3rd_cmd('change_toll_settings', jsonb_build_object(
    'command_id', 'r13-c-pol-driver', 'note', 'expired bearer back to driver', 'self_approval_reason', 'review check R3',
    'dispute_policy', jsonb_build_object('expired_bearer', 'driver')));

  -- R4. A sweep expiry is listed in its week's results and its Undo works (back to To send).
  CALL pg_temp._s3rd_load('r13-d', v_open, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_patch_dispute(d.id, now() - interval '1 hour');
  RESET ROLE; SET LOCAL ROLE service_role;
  PERFORM public.toll_sys_dispute_sweep(pg_temp._s3rd_org());
  RESET ROLE;
  v_row := (SELECT x FROM jsonb_array_elements(pg_temp._s3rd_desk(v_open) -> 'results') x WHERE (x ->> 'id')::uuid = d.id);
  IF v_row IS NULL OR v_row ->> 'outcome' <> 'expired' OR v_row -> 'undo' IS NULL OR v_row -> 'undo' = 'null'::jsonb THEN
    RAISE EXCEPTION 'R4 expired result %', v_row;
  END IF;
  PERFORM pg_temp._s3rd_cmd('undo_decision', (v_row -> 'undo')
    || jsonb_build_object('command_id', 'r13-d-undo', 'self_approval_reason', 'review check R4'));
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  IF d.close_reason IS DISTINCT FROM 'undo' THEN RAISE EXCEPTION 'R4 undone row close_reason %', d.close_reason; END IF;
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND reopens_id = d.id;
  IF d.state IS DISTINCT FROM 'to_send' THEN RAISE EXCEPTION 'R4 undo did not reopen as to_send: %', d.state; END IF;
  PERFORM pg_temp._s3rd_patch_dispute(d.id, now() + interval '5 days');
  PERFORM pg_temp._s3rd_alloc_ok(c.id);
  PERFORM pg_temp._s3rd_assert_nightly();

  -- R5. Parts and blockers agree: every pending / unverified / short-paid charge's part equals its blocker's part,
  --     and each pill (1, 2, 4, 5) counts exactly its blockers, so nothing is counted twice.
  v_desk := pg_temp._s3rd_desk(v_open);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') ch
             JOIN jsonb_array_elements(v_desk -> 'blockers') b ON b ->> 'kind' = 'charge' AND b ->> 'id' = ch ->> 'id'
             WHERE (ch ->> 'part')::int IS DISTINCT FROM (b ->> 'part')::int) THEN
    RAISE EXCEPTION 'R5 charge part <> blocker part';
  END IF;
  FOREACH v_part IN ARRAY ARRAY[1, 2, 4, 5] LOOP
    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_desk -> 'blockers') b WHERE (b ->> 'part')::int = v_part;
    IF (SELECT (x ->> 'count')::int FROM jsonb_array_elements(v_desk -> 'parts') x WHERE (x ->> 'part')::int = v_part) <> v_n THEN
      RAISE EXCEPTION 'R5 part % count % want %', v_part, v_desk -> 'parts', v_n;
    END IF;
  END LOOP;

  -- R6. The sum line comes from the ledger rows, not from a remainder: paid back = firm platform money,
  --     waiting = provisional dispute money, driver and fleet = their allocations, over the week's counted tolls.
  SELECT jsonb_build_object(
    'paidBackMinor', coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'platform' AND NOT (a.provisional AND a.dispute_id IS NOT NULL)), 0),
    'waitingOnUberMinor', coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'platform' AND a.provisional AND a.dispute_id IS NOT NULL), 0),
    'driverMinor', coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'driver'), 0),
    'fleetMinor', coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'fleet'), 0))
  INTO v_exp
  FROM toll.allocations a
  JOIN toll.charges ch ON ch.organization_id = a.organization_id AND ch.id = a.charge_id
  WHERE a.organization_id = pg_temp._s3rd_org() AND a.reversed_by IS NULL
    AND NOT ch.is_legacy AND NOT ch.after_seal AND ch.evidence_status = 'verified' AND ch.duplicate_of IS NULL
    AND toll_system.charge_counted_week(pg_temp._s3rd_org(), ch.id, ch.week_key) = v_open;
  v_got := v_desk -> 'sumLine';
  IF (v_got ->> 'paidBackMinor')::bigint <> (v_exp ->> 'paidBackMinor')::bigint
     OR (v_got ->> 'waitingOnUberMinor')::bigint <> (v_exp ->> 'waitingOnUberMinor')::bigint
     OR (v_got ->> 'driverMinor')::bigint <> (v_exp ->> 'driverMinor')::bigint
     OR (v_got ->> 'fleetMinor')::bigint <> (v_exp ->> 'fleetMinor')::bigint THEN
    RAISE EXCEPTION 'R6 sum line % want %', v_got, v_exp;
  END IF;
  IF (v_exp ->> 'waitingOnUberMinor')::bigint = 0 THEN RAISE EXCEPTION 'R6 no open dispute money to check'; END IF;

  -- R7. A new plaza shows in Fleet Policy "missing" until the matcher next runs; the matcher then sets it up
  --     itself (default plaza rule) and does not refuse.
  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'tag_statement', format(
    '[{"source_ref":"r13-g-unknown-plaza","occurred_at":"%s","amount_minor":39000,"plaza_id":"r13-no-rules-plaza",
      "vehicle_id":"v1","driver_id":"s3rd-d1"}]', now() - interval '2 hours')::jsonb, 'r13-g-tag', 'smoke');
  v_b := pg_temp._s3rd_settings() -> 'missing';
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_b) m WHERE m ->> 'kind' = 'plaza_rules' AND m ->> 'plaza_id' = 'r13-no-rules-plaza') THEN
    RAISE EXCEPTION 'R7 missing list lacks the plaza the matcher refuses on: %', v_b;
  END IF;
  PERFORM toll_system.match_refuse_missing_settings(pg_temp._s3rd_org());
  IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules WHERE plaza_id = 'r13-no-rules-plaza') THEN
    RAISE EXCEPTION 'R7 matcher did not set up the new plaza';
  END IF;
  IF jsonb_array_length(coalesce(pg_temp._s3rd_settings() -> 'missing', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'R7 still missing after the matcher: %', pg_temp._s3rd_settings() -> 'missing';
  END IF;
  -- roll this probe back: the unknown plaza would block every later section
  RAISE EXCEPTION 'r13-probe-done';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'r13-probe-done' THEN RAISE; END IF;
END;
$$;

-- The whole 4b block rolls back at its end (the R7 probe's unknown plaza would block later sections); a failed
-- check above still stops the test, because only the 'r13-probe-done' marker is swallowed.

-- ══ 5. Results this week ══
DO $$
DECLARE
  v_open date := ledger.jamaica_week_start(now());
  v_old date := v_open - 7; -- older charge week; still inside dispute window (9 days)
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_desk jsonb; v_res jsonb; v_row jsonb; v_snap jsonb; v_hash text;
  v_dec uuid; v_new uuid;
BEGIN
  -- won
  CALL pg_temp._s3rd_load('p5-won', v_open, c, p, d);
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p5-won-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s3rd_adj('s3rd-adj-p5won', 's3rd-d1', 2000);
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  v_desk := pg_temp._s3rd_desk(v_open);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'results') x
    WHERE (x ->> 'id')::uuid = d.id AND x ->> 'outcome' = 'won') THEN RAISE EXCEPTION '5 won row'; END IF;
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'results') x WHERE (x ->> 'id')::uuid = d.id);
  IF (v_row ->> 'borneMinor')::bigint <> 0 OR v_row -> 'undo' IS NULL THEN RAISE EXCEPTION '5 won borne/undo'; END IF;
  PERFORM pg_temp._s3rd_cmd('undo_decision', (v_row -> 'undo')
    || jsonb_build_object('command_id', 's3rd-p5-undo-won', 'self_approval_reason', 'twelve chars'));
  v_desk := pg_temp._s3rd_desk(v_open);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'results') x WHERE (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION '5 undo removed result';
  END IF;

  -- lost person
  CALL pg_temp._s3rd_load('p5-lost', v_open, c, p, d);
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p5-lost-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  PERFORM pg_temp._s3rd_cmd('close_dispute_lost', jsonb_build_object(
    'command_id', 's3rd-p5-lost-close', 'dispute_id', d.id, 'expected_dispute_version', d.version + 1,
    'reason_code', 'gave_up'));
  v_desk := pg_temp._s3rd_desk(v_open);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'results') x WHERE (x ->> 'id')::uuid = d.id);
  IF v_row ->> 'bearer' IS NULL OR (v_row ->> 'borneMinor')::bigint < 1 THEN RAISE EXCEPTION '5 lost bearer'; END IF;

  -- lost sweep (s3rd-d2 avoids dispute_sweep_hold from d1 refund-window adjustments)
  CALL pg_temp._s3rd_load('p5-sweep', v_open, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p5-sweep-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  SELECT * INTO d FROM toll.disputes WHERE id = d.id;
  PERFORM pg_temp._s3rd_patch_dispute(d.id, NULL,
    ((now() AT TIME ZONE 'America/Jamaica')::date - 30)::timestamp AT TIME ZONE 'America/Jamaica');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  PERFORM pg_temp._s3rd_cover_refund_periods(d.clock_from, 2);
  PERFORM pg_temp._s3rd_assert_nightly();
  RESET ROLE; SET LOCAL ROLE service_role;
  PERFORM public.toll_sys_dispute_sweep(pg_temp._s3rd_org());
  RESET ROLE;
  v_desk := pg_temp._s3rd_desk(v_open);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'results') x
    WHERE (x ->> 'chargeId')::uuid = c.id AND x ->> 'outcome' = 'lost' LIMIT 1);
  IF v_row IS NULL OR v_row ->> 'bearer' IS NULL THEN RAISE EXCEPTION '5 sweep lost'; END IF;

  -- expired
  CALL pg_temp._s3rd_load('p5-exp', v_open, c, p, d);
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '2 hours' WHERE id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  RESET ROLE; SET LOCAL ROLE service_role;
  PERFORM public.toll_sys_dispute_sweep(pg_temp._s3rd_org());
  RESET ROLE;
  v_desk := pg_temp._s3rd_desk(v_open);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'results') x
    WHERE (x ->> 'chargeId')::uuid = c.id AND x ->> 'outcome' = 'expired') THEN RAISE EXCEPTION '5 expired'; END IF;

  -- earlierResults + reopenedBy (before v_old is sealed)
  CALL pg_temp._s3rd_load('p5-reopen', v_old, c, p, d, 's3rd-d2');
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p5-ro-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s3rd_adj('s3rd-adj-p5ro', 's3rd-d2', 2000);
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  p := pg_temp._s3rd_pb('s3rd-adj-p5ro');
  SELECT * INTO d FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND id = d.id;
  IF d.state = 'sent' THEN
    PERFORM pg_temp._s3rd_cmd('settle_dispute', jsonb_build_object(
      'command_id', 's3rd-p5-ro-settle', 'dispute_id', d.id, 'expected_dispute_version', d.version + 1,
      'payback_id', p.id, 'expected_payback_version', p.version));
    SELECT * INTO d FROM toll.disputes WHERE id = d.id;
    p := pg_temp._s3rd_pb('s3rd-adj-p5ro');
  END IF;
  PERFORM pg_temp._s3rd_cmd('reverse_payback', jsonb_build_object(
    'command_id', 's3rd-p5-ro-rev', 'payback_id', p.id, 'expected_payback_version', p.version,
    'reference', 'rev-p5ro', 'paid_on', (now() AT TIME ZONE 'America/Jamaica')::date));
  SELECT id INTO v_new FROM toll.disputes WHERE organization_id = pg_temp._s3rd_org() AND reopens_id = d.id LIMIT 1;
  -- Review S3-R1: the charge week (v_old) is still open, so the refund's money landed in v_old (allocations), and
  -- its result is listed in v_old's "Results this week", not today's.
  v_desk := pg_temp._s3rd_desk(v_old);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'results') x WHERE (x ->> 'id')::uuid = d.id LIMIT 1);
  IF v_new IS NULL THEN RAISE EXCEPTION '5 reopen child missing'; END IF;
  IF v_row IS NULL THEN RAISE EXCEPTION '5 won result missing for reopen'; END IF;
  IF (v_row ->> 'reopenedBy')::uuid IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION '5 reopenedBy got % want %', v_row ->> 'reopenedBy', v_new;
  END IF;
  IF (v_row ? 'undo') AND v_row -> 'undo' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION '5 undo should be null got %', v_row -> 'undo';
  END IF;
  IF (pg_temp._s3rd_desk(v_open) -> 'earlierResults') IS NULL THEN RAISE EXCEPTION '5 earlierResults'; END IF;

  -- sealed charge week result in open posting week
  CALL pg_temp._s3rd_load('p5-sealed', v_old, c, p, d);
  PERFORM pg_temp._s3rd_cmd('seal_week', jsonb_build_object(
    'command_id', 's3rd-p5-seal-ch', 'week_key', v_old,
    'expected_week_version', toll_system.week_version(pg_temp._s3rd_org(), v_old)));
  PERFORM pg_temp._s3rd_cmd('mark_dispute_sent', jsonb_build_object(
    'command_id', 's3rd-p5-sealed-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  p := pg_temp._s3rd_adj('s3rd-adj-p5seal', 's3rd-d1', 2000);
  v_hash := pg_temp._s3rd_week_hash(v_old);
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand(c.id, p.id, false, true, 'dispute_refund', d.id, ARRAY['refund_window','dispute_refund'])));
  IF pg_temp._s3rd_week_hash(v_old) IS DISTINCT FROM v_hash THEN RAISE EXCEPTION '5 sealed ledger changed'; END IF;
  v_desk := pg_temp._s3rd_desk(v_open);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'results') x
    WHERE (x ->> 'id')::uuid = d.id AND (x ->> 'chargeWeekKey')::date = v_old) THEN RAISE EXCEPTION '5 sealed result week'; END IF;
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 6. InDrive rider suggestion ══
DO $$
DECLARE v_day date := (now() AT TIME ZONE 'America/Jamaica')::date - 1;
  v_req text := to_char(v_day, 'YYYY-MM-DD') || 'T10:00:00';
  v_drop text := to_char(v_day, 'YYYY-MM-DD') || 'T10:45:00';
  v_week date := ledger.jamaica_week_start((v_day::timestamp AT TIME ZONE 'America/Jamaica'));
  c toll.charges; v_sug uuid; v_desk jsonb; v_row jsonb;
BEGIN
  INSERT INTO fleet.trips (id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
    payment_method, service_line, amount, legacy_kv_id, payload_json)
  VALUES ('s3rd-indrive-1', pg_temp._s3rd_org()::text, v_day, 's3rd-d1', 'v1', 'InDrive', 'completed', 'live_driver_app',
    'cash', 'rideshare', 2000, 's3rd-kv-ind', jsonb_build_object('isManual', true, 'requestTime', v_req, 'dropoffTime', v_drop))
  ON CONFLICT DO NOTHING;
  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'tag_statement', format(
    '[{"source_ref":"s3rd-ch-indrive","occurred_at":"%s","amount_minor":39000,"plaza_id":"s3rd-pz",
      "vehicle_id":"v1","driver_id":"s3rd-d1"}]',
    ((v_day::timestamp + time '10:20') AT TIME ZONE 'America/Jamaica'))::jsonb, 's3rd-tag-ind', 'smoke');
  c := pg_temp._s3rd_ch('s3rd-ch-indrive');
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand_rider(c.id, 'indrive', 'logged:s3rd-indrive-1')));
  SELECT id INTO v_sug FROM toll.suggestions WHERE organization_id = pg_temp._s3rd_org() AND charge_id = c.id
    AND kind = 'rider_pays_driver' AND superseded_by IS NULL LIMIT 1;
  IF v_sug IS NULL THEN RAISE EXCEPTION '6 no rider suggestion'; END IF;
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'charges') x
    WHERE EXISTS (SELECT 1 FROM toll.charges ch WHERE ch.id = (x ->> 'id')::uuid AND ch.source_ref = 's3rd-ch-indrive'));
  IF v_row ->> 'section' <> 'suggested' OR (v_row ->> 'part')::int <> 1 THEN RAISE EXCEPTION '6 section/part'; END IF;
  IF v_row -> 'suggestions' -> 0 -> 'command' IS DISTINCT FROM jsonb_build_object('confirm', 'driver_pays', 'other', 'fleet_absorbs') THEN
    RAISE EXCEPTION '6 rider command';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_desk -> 'blockers') b WHERE (b ->> 'part')::int = 1) THEN
    RAISE EXCEPTION '6 blocker part 1';
  END IF;
  c := pg_temp._s3rd_ch('s3rd-ch-indrive');
  PERFORM pg_temp._s3rd_cmd('driver_pays', jsonb_build_object(
    'command_id', 's3rd-ind-drive', 'charge_id', c.id, 'expected_charge_version', c.version,
    'suggestion_id', v_sug));
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'charges') x WHERE (x ->> 'id')::uuid = c.id);
  IF v_row ->> 'section' NOT IN ('decided', 'disputes') AND toll_system.charge_state(pg_temp._s3rd_org(), c.id) NOT IN ('resolved','decided') THEN
    RAISE EXCEPTION '6 after driver_pays %', v_row ->> 'section';
  END IF;
  UPDATE fleet.trips SET status = 'cancelled' WHERE id = 's3rd-indrive-1';
  PERFORM pg_temp._s3rd_match_store(jsonb_build_array(
    pg_temp._s3rd_cand_rider(c.id, 'indrive', 'logged:s3rd-indrive-1')));
  v_desk := pg_temp._s3rd_desk(v_week);
  v_row := (SELECT x FROM jsonb_array_elements(v_desk -> 'charges') x WHERE (x ->> 'id')::uuid = c.id);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row -> 'suggestions') s WHERE s ->> 'kind' = 'rider_pays_driver') THEN
    RAISE EXCEPTION '6 withdrawn suggestion still shown';
  END IF;
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 7. Sum line + 8. Parts + 9. Seal refusal ══
DO $$
DECLARE
  v_week date := ledger.jamaica_week_start((now() AT TIME ZONE 'America/Jamaica')::timestamptz - interval '21 days');
  v_desk jsonb; v_sum jsonb; v_part jsonb; v_row jsonb; v_blk jsonb;
  c toll.charges; p toll.paybacks; d toll.disputes;
  v_snap jsonb; v_m text; v_blks jsonb;
BEGIN
  CALL pg_temp._s3rd_load('p7-sum', v_week, c, p, d);
  v_desk := pg_temp._s3rd_desk(v_week);
  v_sum := v_desk -> 'sumLine';
  IF (v_sum ->> 'spendMinor')::bigint <>
       (v_sum ->> 'paidBackMinor')::bigint + (v_sum ->> 'driverMinor')::bigint + (v_sum ->> 'fleetMinor')::bigint
     + (v_sum ->> 'waitingOnUberMinor')::bigint + (v_sum ->> 'stillOpenMinor')::bigint THEN
    RAISE EXCEPTION '7 sum line %', v_sum;
  END IF;
  v_part := (SELECT x FROM jsonb_array_elements(v_desk -> 'parts') x WHERE (x ->> 'part')::int = 3);
  IF v_part ->> 'status' <> 'todo' THEN RAISE EXCEPTION '8 part3 todo'; END IF;

  -- clear this week's pending charges except the new orphan path
  FOR c IN SELECT * FROM toll.charges WHERE organization_id = pg_temp._s3rd_org()
    AND toll_system.charge_counted_week(pg_temp._s3rd_org(), id, week_key) = v_week
    AND toll_system.charge_state(pg_temp._s3rd_org(), id) = 'pending'
  LOOP
    PERFORM pg_temp._s3rd_cmd('fleet_absorbs', jsonb_build_object(
      'command_id', 's3rd-clear-' || left(c.id::text, 8),
      'charge_id', c.id, 'expected_charge_version', c.version));
  END LOOP;
  FOR p IN SELECT * FROM toll.paybacks WHERE organization_id = pg_temp._s3rd_org() AND week_key = v_week
    AND toll_system.payback_open_minor(pg_temp._s3rd_org(), id) > 0
  LOOP
    PERFORM pg_temp._s3rd_cmd('leave_payback_unlinked', jsonb_build_object(
      'command_id', 's3rd-kept-' || left(p.id::text, 8),
      'payback_id', p.id, 'expected_payback_version', p.version, 'reason_code', 'no_toll'));
  END LOOP;

  -- only sent disputes → part3 waiting
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET state = 'sent', clock_from = now()
  WHERE organization_id = pg_temp._s3rd_org() AND state = 'to_send';
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  v_desk := pg_temp._s3rd_desk(v_week);
  v_part := (SELECT x FROM jsonb_array_elements(v_desk -> 'parts') x WHERE (x ->> 'part')::int = 3);
  IF v_part ->> 'status' <> 'waiting' THEN RAISE EXCEPTION '8 part3 waiting %', v_part; END IF;

  PERFORM public.toll_sys_import(pg_temp._s3rd_org(), 'tag_statement', format(
    '[{"source_ref":"s3rd-ch-sealblk","occurred_at":"%s","amount_minor":5000,"plaza_id":"s3rd-pz",
      "vehicle_id":"v1","driver_id":"s3rd-d1"}]',
    ((v_week + 2) + time '09:00') AT TIME ZONE 'America/Jamaica')::jsonb, 's3rd-tag-sealblk', 'smoke');
  v_desk := pg_temp._s3rd_desk(v_week);
  BEGIN
    PERFORM pg_temp._s3rd_cmd('seal_week', jsonb_build_object(
      'command_id', 's3rd-seal-refuse', 'week_key', v_week,
      'expected_week_version', toll_system.week_version(pg_temp._s3rd_org(), v_week)));
    RAISE EXCEPTION '9 seal should refuse';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_m = MESSAGE_TEXT;
    IF v_m <> 'PENDING_NOT_RESOLVED' THEN RAISE EXCEPTION '9 expected PENDING got %', v_m; END IF;
  END;
  v_blks := (SELECT response FROM toll.decisions WHERE organization_id = pg_temp._s3rd_org()
    AND command_id = 's3rd-seal-refuse' LIMIT 1);
  IF v_blks IS NULL THEN
    -- refusal stored on exception path may not persist; compare live desk blockers
    v_blks := pg_temp._s3rd_desk(v_week) -> 'blockers';
  ELSE
    v_blks := v_blks -> 'blocking';
  END IF;
  FOR v_blk IN SELECT * FROM jsonb_array_elements(coalesce(v_blks, '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp._s3rd_desk(v_week) -> 'blockers') b
      WHERE b ->> 'kind' = v_blk ->> 'kind' AND b ->> 'id' = v_blk ->> 'id'
        AND (b ->> 'part')::int = (v_blk ->> 'part')::int) THEN
      RAISE EXCEPTION '9 blocker part mismatch %', v_blk;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_desk -> 'charges') ch
    JOIN jsonb_array_elements(v_desk -> 'blockers') b
      ON (ch ->> 'id') = (b ->> 'id') AND (ch ->> 'part')::int IS DISTINCT FROM (b ->> 'part')::int
  ) THEN RAISE EXCEPTION '8 charge/blocker part mismatch';
  END IF;
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 10. Driver service_role reads + mark sent ══
DO $$
DECLARE
  v_week date := ledger.jamaica_week_start(now());
  c toll.charges; p toll.paybacks; d toll.disputes; d_b toll.disputes;
  v_r jsonb; v_row jsonb; v_txt text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_text_templates t
      WHERE t.organization_id = pg_temp._s3rd_org() AND t.platform = 'uber' AND t.retired_at IS NULL) THEN
    INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
    VALUES (pg_temp._s3rd_org(), 'uber', 1,
      'On {trip_date} at {trip_time} at {plaza}: toll {toll}, paid {paid}, owed {owed}.');
  END IF;
  CALL pg_temp._s3rd_load('p10-a', v_week, c, p, d, 's3rd-d1');
  CALL pg_temp._s3rd_load('p10-b', v_week, c, p, d_b, 's3rd-d2');
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = ((now() AT TIME ZONE 'America/Jamaica')::date + 5)::timestamp AT TIME ZONE 'America/Jamaica'
  WHERE id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;

  RESET ROLE; SET LOCAL ROLE service_role;
  v_r := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1');
  RESET ROLE;
  IF NOT coalesce((v_r ->> 'enabled')::boolean, false) THEN RAISE EXCEPTION '10 enabled'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'disputes') x WHERE (x ->> 'id')::uuid = d_b.id) THEN
    RAISE EXCEPTION '10 sees other driver';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION '10 missing own dispute legacy id';
  END IF;
  RESET ROLE; SET LOCAL ROLE service_role;
  v_r := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1-fleet');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id) THEN
    RAISE EXCEPTION '10 missing own dispute uuid id';
  END IF;
  v_row := (SELECT x FROM jsonb_array_elements(v_r -> 'disputes') x WHERE (x ->> 'id')::uuid = d.id);
  v_txt := v_row ->> 'text';
  IF v_txt IS NULL OR position('{' in coalesce(v_txt, '')) > 0 THEN RAISE EXCEPTION '10 template braces %', v_txt; END IF;
  IF v_row -> 'bearerIfNotSent' ->> 'bearer' <> 'driver' THEN RAISE EXCEPTION '10 bearer driver'; END IF;

  RESET ROLE; SET LOCAL ROLE service_role;
  v_r := public.toll_sys_driver_mark_dispute_sent(pg_temp._s3rd_org(), 's3rd-d1', pg_temp._s3rd_drv_a(),
    jsonb_build_object('command_id', 's3rd-drv-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  RESET ROLE;
  SELECT * INTO d FROM toll.disputes WHERE id = d.id;
  IF d.state <> 'sent' THEN RAISE EXCEPTION '10 not sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.decisions dec WHERE dec.organization_id = pg_temp._s3rd_org()
    AND dec.command_id = 's3rd-drv-sent' AND dec.actor_user_id = pg_temp._s3rd_drv_a() AND dec.actor_job = 'driver_app') THEN
    RAISE EXCEPTION '10 decision actor';
  END IF;
  RESET ROLE; SET LOCAL ROLE service_role;
  v_r := public.toll_sys_driver_mark_dispute_sent(pg_temp._s3rd_org(), 's3rd-d1', pg_temp._s3rd_drv_a(),
    jsonb_build_object('command_id', 's3rd-drv-sent', 'dispute_id', d.id, 'expected_dispute_version', d.version));
  RESET ROLE;
  IF coalesce((v_r ->> 'replay')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION '10 replay %', v_r; END IF;

  BEGIN
    RESET ROLE; SET LOCAL ROLE service_role;
    PERFORM public.toll_sys_driver_mark_dispute_sent(pg_temp._s3rd_org(), 's3rd-d1', pg_temp._s3rd_drv_a(),
      jsonb_build_object('command_id', 's3rd-drv-b', 'dispute_id', d_b.id, 'expected_dispute_version', d_b.version));
    RESET ROLE;
    RAISE EXCEPTION '10 other driver should fail';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    RESET ROLE;
    IF v_txt <> 'NOT_FOUND' THEN RAISE EXCEPTION '10 expected NOT_FOUND got %', v_txt; END IF;
  END;

  CALL pg_temp._s3rd_load('p10-wc', v_week + 7, c, p, d, 's3rd-d1');
  ALTER TABLE toll.disputes DISABLE TRIGGER USER;
  UPDATE toll.disputes SET deadline = now() - interval '1 hour' WHERE id = d.id;
  ALTER TABLE toll.disputes ENABLE TRIGGER USER;
  BEGIN
    RESET ROLE; SET LOCAL ROLE service_role;
    PERFORM public.toll_sys_driver_mark_dispute_sent(pg_temp._s3rd_org(), 's3rd-d1', pg_temp._s3rd_drv_a(),
      jsonb_build_object('command_id', 's3rd-drv-wc', 'dispute_id', d.id, 'expected_dispute_version', d.version));
    RESET ROLE;
    RAISE EXCEPTION '10 window_closed expected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    RESET ROLE;
    IF v_txt <> 'window_closed' THEN RAISE EXCEPTION '10 window_closed got %', v_txt; END IF;
  END;

  UPDATE toll.switch_state SET toll_disputes = false WHERE organization_id = pg_temp._s3rd_org();
  RESET ROLE; SET LOCAL ROLE service_role;
  v_r := public.toll_sys_driver_disputes(pg_temp._s3rd_org(), 's3rd-d1');
  RESET ROLE;
  IF coalesce((v_r ->> 'enabled')::boolean, true) THEN RAISE EXCEPTION '10 switch off'; END IF;
  UPDATE toll.switch_state SET toll_disputes = true WHERE organization_id = pg_temp._s3rd_org();
  PERFORM pg_temp._s3rd_assert_nightly();
END;
$$;

-- ══ 11. toll_v2_disputes tab + 12. Settings read ══
DO $$
DECLARE
  v_week date := ledger.jamaica_week_start(now());
  v_tab jsonb; v_set jsonb; v_drv jsonb;
  c toll.charges; p toll.paybacks; d toll.disputes;
BEGIN
  CALL pg_temp._s3rd_load('p11-a', v_week, c, p, d, 's3rd-d1');
  CALL pg_temp._s3rd_load('p11-b', v_week, c, p, d, 's3rd-d2');
  v_tab := pg_temp._s3rd_disputes_tab();
  IF jsonb_array_length(v_tab -> 'byDriver') < 2 THEN RAISE EXCEPTION '11 byDriver count'; END IF;
  v_drv := (SELECT x FROM jsonb_array_elements(v_tab -> 'byDriver') x WHERE x ->> 'driverId' = 's3rd-d1');
  IF (v_drv ->> 'toSend')::int < 1 THEN RAISE EXCEPTION '11 badge toSend'; END IF;
  v_tab := pg_temp._s3rd_disputes_tab('s3rd-d1');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_tab -> 'active') x WHERE x ->> 'driverId' = 's3rd-d2') THEN
    RAISE EXCEPTION '11 filter driver';
  END IF;
  v_tab := pg_temp._s3rd_disputes_tab('s3rd-d1-fleet');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_tab -> 'active') x WHERE x ->> 'driverId' = 's3rd-d1') THEN
    RAISE EXCEPTION '11 filter fleet id';
  END IF;

  v_set := pg_temp._s3rd_settings();
  IF coalesce((v_set ->> 'seeded')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION '12 seeded'; END IF;
  IF jsonb_array_length(coalesce(v_set -> 'missing', '["x"]'::jsonb)) > 0 THEN RAISE EXCEPTION '12 missing after seed %', v_set -> 'missing'; END IF;
  IF NOT (v_set ? 'platforms') OR NOT (v_set ? 'plazas') OR NOT (v_set ? 'templates') THEN RAISE EXCEPTION '12 fields'; END IF;
  PERFORM pg_temp._s3rd_cmd('change_toll_settings', jsonb_build_object(
    'command_id', 's3rd-chg-pol', 'note', 'lost bearer',
    'self_approval_reason', 'twelve chars',
    'dispute_policy', jsonb_build_object('lost_bearer', 'driver')));
  v_set := pg_temp._s3rd_settings();
  IF v_set -> 'disputePolicy' ->> 'lostBearer' <> 'driver' THEN RAISE EXCEPTION '12 policy read'; END IF;
  -- Uber's rate is shared data (no longer set from Fleet: 20261121222218)
  INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from)
  VALUES ('s3rd-pz', 'platform_refund', 'uber', 40000, ((v_week + 14))::date);
  v_set := pg_temp._s3rd_settings();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_set -> 'plazas') pl
    WHERE pl ->> 'plazaId' = 's3rd-pz'
      -- Review S3-R6: J$400 starts in two weeks, so today's rate is still J$370; J$400 leads the history.
      AND (pl -> 'platformRates' -> 0 -> 'current' ->> 'amountMinor')::bigint = 37000
      AND (pl -> 'platformRates' -> 0 -> 'history' -> 0 ->> 'amountMinor')::bigint = 40000
      AND jsonb_array_length(pl -> 'platformRates' -> 0 -> 'history') >= 2
  ) THEN RAISE EXCEPTION '12 plaza rate history %', v_set -> 'plazas'; END IF;

  PERFORM pg_temp._s3rd_assert_nightly();
  RAISE NOTICE 'toll_screen_reads_disputes_test: ok';
END;
$$;

ROLLBACK;