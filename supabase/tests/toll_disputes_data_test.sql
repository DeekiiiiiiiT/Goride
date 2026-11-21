-- Toll disputes D1: behaviour (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT 'd1111111-1111-4111-8111-111111111111'::uuid, 'toll-dispute-d1@example.com'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'd1111111-1111-4111-8111-111111111111'::uuid);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'd2111111-1111-4111-8111-111111111101',
  'd1111111-1111-4111-8111-111111111111',
  'Toll Disputes D1',
  'toll-disputes-d1',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

SELECT toll_system.ensure_accounts('d2111111-1111-4111-8111-111111111101');

CREATE OR REPLACE FUNCTION pg_temp._d1_expect(p_code text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $e$
DECLARE m text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    IF m IS DISTINCT FROM p_code THEN
      RAISE EXCEPTION 'expected % got %', p_code, m;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected % but statement succeeded', p_code;
END;
$e$;

DO $$
DECLARE
  v_org   uuid := 'd2111111-1111-4111-8111-111111111101';
  v_dec   uuid;
  v_charge uuid;
  v_trip  text := 'd1-trip-uber-1';
  v_disp1 uuid;
  v_disp2 uuid;
  v_pb    uuid;
  v_link1 uuid;
  v_rate  bigint;
  v_cnt   bigint;
  v_n     bigint;
BEGIN
  -- existing allocations still pass F2 CHECK
  SELECT count(*) INTO v_n
  FROM toll.allocations a
  WHERE NOT (
    CASE
      WHEN a.bearer = 'platform' THEN
        a.payback_id IS NOT NULL OR (a.provisional = true AND a.dispute_id IS NOT NULL)
      ELSE
        a.payback_id IS NULL
    END
  );
  IF v_n > 0 THEN
    RAISE EXCEPTION 'existing allocations fail F2 CHECK: %', v_n;
  END IF;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 'd1-dec-1', 'test', 'user')
  RETURNING id INTO v_dec;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id, plaza_id
  ) VALUES (
    v_org, timestamptz '2026-03-10 10:00:00+00', '2026-03-10', 'exact', 2000,
    'tag', 'manual', 'd1-charge-1', 'd1-driver', 'portmore'
  ) RETURNING id INTO v_charge;

  INSERT INTO toll.platform_trips (
    organization_id, platform, platform_trip_id, driver_id, time_precision, payment_method
  ) VALUES (v_org, 'uber', v_trip, 'd1-driver', 'minute', 'card');

  INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
  VALUES (v_org, 'uber', 1, 'Hi {trip_date} {plaza} {toll} {paid} {owed} {trip_time}')
  ON CONFLICT (organization_id, platform, version) DO NOTHING;  -- new companies come with the Uber text

  -- provisional platform allocation with dispute_id, no payback: ok
  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, deadline, text_version
  ) VALUES (
    v_org, v_charge, '2026-03-10', 'uber', v_trip, 'd1-driver',
    200, timestamptz '2026-03-20 04:59:59+00', 1
  ) RETURNING id INTO v_disp1;

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, provisional, dispute_id, decision_id
  ) VALUES (
    v_org, v_charge, 'platform', 200, true, v_disp1, v_dec
  );

  -- platform allocation with neither payback nor provisional+dispute: refused
  BEGIN
    INSERT INTO toll.allocations (
      organization_id, charge_id, bearer, amount_minor, decision_id
    ) VALUES (v_org, v_charge, 'platform', 100, v_dec);
    RAISE EXCEPTION 'platform allocation without payback or provisional+dispute should fail';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- second non-final dispute on same charge
  PERFORM pg_temp._d1_expect(
    'DISPUTE_SECOND_OPEN',
    format(
      $q$INSERT INTO toll.disputes (
        organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
        owed_minor, deadline, state
      ) VALUES (%L::uuid, %L::uuid, '2026-03-10', 'uber', %L, 'd1-driver', 100,
        timestamptz '2026-03-20 04:59:59+00', 'sent')$q$,
      v_org, v_charge, v_trip
    )
  );

  UPDATE toll.disputes SET state = 'lost', close_reason = 'platform_said_no'
  WHERE organization_id = v_org AND id = v_disp1;

  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, deadline, reopens_id, state, text_version
  ) VALUES (
    v_org, v_charge, '2026-03-10', 'uber', v_trip, 'd1-driver',
    200, timestamptz '2026-04-01 04:59:59+00', v_disp1, 'sent', 1
  ) RETURNING id INTO v_disp2;

  PERFORM pg_temp._d1_expect(
    'DISPUTE_IDENTITY_IMMUTABLE',
    format($q$UPDATE toll.disputes SET owed_minor = 300 WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_disp2)
  );

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id
  ) VALUES (
    v_org, timestamptz '2026-03-11 10:00:00+00', '2026-03-10', 'exact', 1500,
    'tag', 'manual', 'd1-charge-2', 'd1-driver'
  );
  PERFORM pg_temp._d1_expect(
    'DISPUTE_IDENTITY_IMMUTABLE',
    format(
      $q$UPDATE toll.disputes SET charge_id = (
        SELECT id FROM toll.charges WHERE organization_id = %L::uuid AND source_ref = 'd1-charge-2'
      ) WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_org, v_disp2
    )
  );

  PERFORM pg_temp._d1_expect(
    'DISPUTE_IDENTITY_IMMUTABLE',
    format($q$UPDATE toll.disputes SET deadline = now() WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_disp2)
  );

  UPDATE toll.disputes SET state = 'won', close_reason = 'refund', recovered_minor = 200
  WHERE organization_id = v_org AND id = v_disp2;

  PERFORM pg_temp._d1_expect(
    'DISPUTE_FINAL_LOCKED',
    format($q$UPDATE toll.disputes SET state = 'sent' WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_disp2)
  );

  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, deadline, text_version, state, recovered_minor
  ) VALUES (
    v_org, v_charge, '2026-03-10', 'uber', v_trip, 'd1-driver',
    500, timestamptz '2026-03-20 04:59:59+00', 1, 'sent', 200
  ) RETURNING id INTO v_disp1;

  PERFORM pg_temp._d1_expect(
    'DISPUTE_RECOVERED_DECREASE',
    format($q$UPDATE toll.disputes SET recovered_minor = 100 WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_disp1)
  );

  PERFORM pg_temp._d1_expect(
    'DISPUTE_DELETE_FORBIDDEN',
    format($q$DELETE FROM toll.disputes WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_disp1)
  );

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org, 'uber', 'adjustment', 'd1-pb-1', '2026-03-12', '2026-03-10', 800, 'fleet'
  ) RETURNING id INTO v_pb;

  INSERT INTO toll.dispute_links (
    organization_id, dispute_id, payback_id, amount_minor, decision_id
  ) VALUES (v_org, v_disp1, v_pb, 300, v_dec);

  PERFORM pg_temp._d1_expect(
    'DISPUTE_LINKS_EXCEED_OWED',
    format(
      $q$INSERT INTO toll.dispute_links (
        organization_id, dispute_id, payback_id, amount_minor, decision_id
      ) VALUES (%L::uuid, %L::uuid, %L::uuid, 300, %L::uuid)$q$,
      v_org, v_disp1, v_pb, v_dec
    )
  );

  PERFORM pg_temp._d1_expect(
    'PLATFORM_SETTINGS_RIDER_PAYS_DRIVER_AA2',
    format(
      $q$INSERT INTO toll.platform_settings (organization_id, platform, payback_mode, auto_apply)
       VALUES (%L::uuid, 'indrive_bad', 'rider_pays_driver', true)$q$,
      v_org
    )
  );

  PERFORM pg_temp._d1_expect(
    'DISPUTE_TEMPLATE_BAD_PLACEHOLDER',
    format(
      $q$INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
       VALUES (%L::uuid, 'uber', 99, 'Hi {driver_name}')$q$,
      v_org
    )
  );

  UPDATE toll.dispute_text_templates SET retired_at = now()
  WHERE organization_id = v_org AND platform = 'uber' AND version = 1;

  PERFORM pg_temp._d1_expect(
    'DISPUTE_TEMPLATE_RETIRE_TWICE',
    format(
      $q$UPDATE toll.dispute_text_templates SET retired_at = now()
       WHERE organization_id = %L::uuid AND platform = 'uber' AND version = 1$q$,
      v_org
    )
  );

  INSERT INTO toll.plaza_rules (plaza_id) VALUES ('d1-plaza') ON CONFLICT DO NOTHING;
  INSERT INTO toll.plaza_rates (plaza_id, rate_kind, amount_minor, valid_from)
  VALUES ('d1-plaza', 'tag_price', 39000, '2026-01-01'),
         ('d1-plaza', 'tag_price', 40000, '2026-06-01');

  v_rate := toll_system.plaza_rate('d1-plaza', 'tag_price', null, '2026-05-15');
  IF v_rate <> 39000 THEN
    RAISE EXCEPTION 'plaza_rate expected 39000 got %', v_rate;
  END IF;
  v_rate := toll_system.plaza_rate('d1-plaza', 'tag_price', null, '2026-07-01');
  IF v_rate <> 40000 THEN
    RAISE EXCEPTION 'plaza_rate expected 40000 got %', v_rate;
  END IF;

  SELECT count(*) INTO v_cnt FROM toll.platform_settings ps
  WHERE ps.organization_id = 'd3111111-1111-4111-8111-111111111103';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'seed org should start empty of platform_settings';
  END IF;

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (
    'd3111111-1111-4111-8111-111111111103',
    'd1111111-1111-4111-8111-111111111111',
    'Toll Seed D1',
    'toll-seed-d1',
    'fleet',
    'active'
  ) ON CONFLICT (id) DO NOTHING;

  -- A new fleet company is set up when it is created; a dry run then adds nothing.
  SELECT count(*)::int INTO v_cnt FROM toll.platform_settings ps
  WHERE ps.organization_id = 'd3111111-1111-4111-8111-111111111103';
  IF v_cnt < 1 THEN RAISE EXCEPTION 'new company not set up on creation'; END IF;
  PERFORM toll_system.seed_dispute_setup('d3111111-1111-4111-8111-111111111103', true);

  IF (SELECT count(*)::int FROM toll.platform_settings ps
      WHERE ps.organization_id = 'd3111111-1111-4111-8111-111111111103') <> v_cnt THEN
    RAISE EXCEPTION 'dry_run seed wrote platform_settings';
  END IF;

  PERFORM toll_system.seed_dispute_setup('d3111111-1111-4111-8111-111111111103', false);

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = 'd3111111-1111-4111-8111-111111111103'
      AND ps.platform = 'uber' AND ps.takes_disputes AND ps.dispute_window_days = 9
  ) THEN
    RAISE EXCEPTION 'seed missing uber settings';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = 'd3111111-1111-4111-8111-111111111103'
      AND ps.platform = 'indrive' AND ps.payback_mode = 'rider_pays_driver'
      AND NOT ps.auto_apply AND NOT ps.takes_disputes AND NOT ps.pays_tolls_back
  ) THEN
    RAISE EXCEPTION 'seed missing indrive rider_pays_driver settings';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.dispute_text_templates t
    WHERE t.organization_id = 'd3111111-1111-4111-8111-111111111103'
      AND t.platform = 'uber' AND t.version = 1
      AND t.body LIKE '%{owed}%'
  ) THEN
    RAISE EXCEPTION 'seed missing uber template';
  END IF;

  SELECT count(*) INTO v_cnt
  FROM toll_system.seed_dispute_setup('d3111111-1111-4111-8111-111111111103', false) s
  WHERE s.new_value <> 'kept';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'second seed should report all kept, got % non-kept rows', v_cnt;
  END IF;

  RAISE NOTICE 'toll_disputes_data_test: ok';
END;
$$;

ROLLBACK;