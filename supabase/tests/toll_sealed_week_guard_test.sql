-- D2: sealed-week database guard (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT 'e0111111-1111-4111-8111-111111111111'::uuid, 'toll-d2-guard@example.com'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'e0111111-1111-4111-8111-111111111111'::uuid);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES (
  'e1111111-1111-4111-8111-111111111101',
  'e0111111-1111-4111-8111-111111111111',
  'Toll D2 Guard',
  'toll-d2-guard',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES ('e1111111-1111-4111-8111-111111111101', true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = EXCLUDED.tolls_v2;

SELECT toll_system.ensure_accounts('e1111111-1111-4111-8111-111111111101');

CREATE OR REPLACE FUNCTION pg_temp._d2_as(p_user uuid, p_org uuid) RETURNS void
LANGUAGE plpgsql AS $a$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user::text, 'role', 'authenticated',
      'app_metadata', json_build_object('organizationId', p_org::text)
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
END;
$a$;

CREATE OR REPLACE FUNCTION pg_temp._d2_cmd(p_intent text, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $c$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp._d2_as(
    'e0111111-1111-4111-8111-111111111111'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid
  );
  r := public.toll_v2_command(p_intent, p_body);
  RESET ROLE;
  RETURN r;
END;
$c$;

CREATE OR REPLACE FUNCTION pg_temp._d2_expect(p_code text, p_sql text) RETURNS void
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
  v_org       uuid := 'e1111111-1111-4111-8111-111111111101';
  v_owner     uuid := 'e0111111-1111-4111-8111-111111111111';
  v_week      date := ledger.jamaica_week_start(timestamptz '2024-03-12 12:00:00+00');
  v_open_week date := v_week + 7;
  v_week2     date := v_week + 28;
  v_carry_to  date := ledger.jamaica_week_start(now());
  v_dec       uuid;
  v_dec2      uuid;
  v_charge    uuid;
  v_alloc     uuid;
  v_payback   uuid;
  v_unlinked  uuid;
  v_dispute   uuid;
  v_debit     uuid;
  v_credit    uuid;
  v_eff       timestamptz := (v_week + time '12:00') AT TIME ZONE 'America/Jamaica';
  v_trip      text := 'd2-uber-trip-1';
BEGIN
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 'd2-fixture', 'test', 'user')
  RETURNING id INTO v_dec;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id, plaza_id
  ) VALUES (
    v_org, v_eff, v_week, 'exact', 1000,
    'tag', 'manual', 'd2-charge-1', 'd2-driver', 'portmore'
  ) RETURNING id INTO v_charge;

  PERFORM pg_temp._d2_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'd2-setup-absorb',
    'charge_id', v_charge,
    'expected_charge_version', 1
  ));

  SELECT a.id INTO v_alloc FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = v_charge AND a.reversed_by IS NULL LIMIT 1;

  PERFORM pg_temp._d2_cmd('seal_week', jsonb_build_object(
    'command_id', 'd2-seal',
    'week_key', v_week,
    'expected_week_version', 0
  ));

  IF NOT toll_system.week_is_sealed(v_org, v_week) THEN
    RAISE EXCEPTION 'seal_week did not seal %', v_week;
  END IF;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org, 'd2-dec-2', 'test', 'user')
  RETURNING id INTO v_dec2;

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$
      INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, decision_id)
      VALUES (%L::uuid, %L::uuid, 'fleet', 100, %L::uuid)
    $q$, v_org, v_charge, v_dec2)
  );

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$
      UPDATE toll.allocations SET reversed_by = %L::uuid
      WHERE organization_id = %L::uuid AND id = %L::uuid
    $q$, v_dec2, v_org, v_alloc)
  );

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$DELETE FROM toll.allocations WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_alloc)
  );

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, driver_id, paid_on, week_key, amount_minor, received_by
  ) VALUES (
    v_org, 'uber', 'trip_line', 'd2-pb-ref', 'd2-driver', v_week + 2, v_week, 500, 'fleet'
  ) RETURNING id INTO v_payback;

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$
      INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
      VALUES (%L::uuid, %L::uuid, 200, 'd2-test', %L::uuid)
    $q$, v_org, v_payback, v_dec2)
  );

  SELECT id INTO v_debit FROM ledger.accounts
  WHERE account_key = 'org:' || v_org::text || ':toll:suspense' AND currency = 'JMD';
  SELECT id INTO v_credit FROM ledger.accounts
  WHERE account_key = 'org:' || v_org::text || ':toll:tag_prepaid' AND currency = 'JMD';

  PERFORM set_config('toll.writer', 'on', true);
  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$
      INSERT INTO ledger.entries (
        organization_id, idempotency_key, entry_type, product,
        debit_account_id, credit_account_id, amount_minor, currency, effective_at,
        reference_type, metadata
      ) VALUES (
        %L::uuid, 'd2-ledger-' || gen_random_uuid()::text, 'toll_v2:test', 'roam_fleet',
        %L::uuid, %L::uuid, 100, 'JMD', %L::timestamptz,
        'toll', jsonb_build_object('toll_week', %L::text, 'toll_rule', 'P2_tag_crossing')
      )
    $q$, v_org, v_debit, v_credit, v_eff, v_week)
  );
  PERFORM set_config('toll.writer', 'off', true);

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$UPDATE toll.charges SET amount_minor = 1100 WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_org, v_charge)
  );

  INSERT INTO ledger.week_statements (
    kind, organization_id, driver_id, week_key, version, status,
    amounts_minor, source_row_ids, engine_version
  ) VALUES (
    'toll_week', v_org, '*', v_week2, 1, 'closed', '{}'::jsonb, '[]'::jsonb, 'toll_v2_phase0'
  );

  SELECT c.id INTO v_charge FROM toll.charges c
  WHERE c.organization_id = v_org AND c.source_ref = 'd2-charge-1';

  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$UPDATE toll.charges SET week_key = %L::date WHERE organization_id = %L::uuid AND id = %L::uuid$q$,
      v_week2, v_org, v_charge)
  );

  INSERT INTO toll.platform_trips (
    organization_id, platform, platform_trip_id, driver_id, time_precision, payment_method
  ) VALUES (v_org, 'uber', v_trip, 'd2-driver', 'minute', 'card');

  INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
  VALUES (v_org, 'uber', 1, 'D2 {trip_date}')
  ON CONFLICT (organization_id, platform, version) DO NOTHING;  -- new companies come with the Uber text

  SELECT c.id INTO v_charge FROM toll.charges c
  WHERE c.organization_id = v_org AND c.source_ref = 'd2-charge-1';

  INSERT INTO toll.disputes (
    organization_id, charge_id, charge_week_key, platform, platform_trip_id, driver_id,
    owed_minor, deadline, text_version, state
  ) VALUES (
    v_org, v_charge, v_week, 'uber', v_trip, 'd2-driver',
    200, timestamptz '2026-03-20 04:59:59+00', 1, 'to_send'
  ) RETURNING id INTO v_dispute;

  UPDATE toll.disputes SET state = 'sent', sent_at = now() WHERE organization_id = v_org AND id = v_dispute;
  UPDATE toll.disputes SET state = 'lost', close_reason = 'platform_said_no'
  WHERE organization_id = v_org AND id = v_dispute;

  -- Spoof: toll.seal_writer alone is not enough; triggers require cmd+txid proof set by seal/reopen.
  PERFORM set_config('toll.seal_writer', 'on', true);
  SELECT c.id INTO v_charge FROM toll.charges c
  WHERE c.organization_id = v_org AND c.source_ref = 'd2-charge-1';
  PERFORM pg_temp._d2_expect(
    'SEALED_WEEK_LOCKED',
    format($q$
      INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, decision_id)
      VALUES (%L::uuid, %L::uuid, 'fleet', 25, %L::uuid)
    $q$, v_org, v_charge, v_dec2)
  );
  PERFORM set_config('toll.seal_writer', 'off', true);

  PERFORM pg_temp._d2_cmd('reopen_week', jsonb_build_object(
    'command_id', 'd2-reopen',
    'week_key', v_week,
    'expected_week_version', toll_system.week_version(v_org, v_week),
    'reason', 'd2 test reopen', 'self_approval_reason', 'only manager reopens the week (test)'
  ));

  SELECT a.id INTO v_alloc FROM toll.allocations a
  WHERE a.organization_id = v_org AND a.charge_id = v_charge AND a.reversed_by IS NULL LIMIT 1;

  UPDATE toll.allocations SET reversed_by = v_dec2
  WHERE organization_id = v_org AND id = v_alloc;

  -- carry_forward on a separate sealed+paid week (reopen above cannot run after drivers are paid).
  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id, plaza_id
  ) VALUES (
    v_org, (v_open_week + time '12:00') AT TIME ZONE 'America/Jamaica', v_open_week, 'exact', 600,
    'tag', 'manual', 'd2-cf-week-charge', 'd2-driver', 'portmore'
  ) RETURNING id INTO v_charge;

  PERFORM pg_temp._d2_cmd('fleet_absorbs', jsonb_build_object(
    'command_id', 'd2-cf-absorb',
    'charge_id', v_charge,
    'expected_charge_version', 1
  ));

  PERFORM pg_temp._d2_cmd('seal_week', jsonb_build_object(
    'command_id', 'd2-seal-cf',
    'week_key', v_open_week,
    'expected_week_version', 0
  ));

  INSERT INTO ledger.settlement_movements (
    organization_id, driver_id, period_anchor, kind, amount_minor, idempotency_key, status
  ) VALUES (v_org, 'd2-driver', v_open_week, 'pay', 100, 'd2-cf-week-paid', 'posted');

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, driver_id, plaza_id, after_seal
  ) VALUES (
    v_org, (v_open_week + time '12:00') AT TIME ZONE 'America/Jamaica', v_open_week, 'exact', 800,
    'tag', 'manual', 'd2-late-charge', 'd2-driver', 'portmore', true
  ) RETURNING id INTO v_charge;

  PERFORM pg_temp._d2_cmd('carry_forward', jsonb_build_object(
    'command_id', 'd2-carry',
    'from_week', v_open_week,
    'to_week', v_carry_to,
    'kind', 'charge',
    'charge_id', v_charge,
    'expected_charge_version', 1
  ));

  RAISE NOTICE 'toll_sealed_week_guard_test: ok';
END;
$$;

ROLLBACK;