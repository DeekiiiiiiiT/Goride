-- Toll Round S3: screen reads + dispute payloads (docs/toll-build/cursor-S3-screen-reads.md)

-- 0. Close mark_dispute_sent hole
CREATE OR REPLACE FUNCTION toll_write.command(p_intent text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company    uuid;
  v_user       uuid := auth.uid();
  v_command_id text := nullif(btrim(p_body ->> 'command_id'), '');
  v_permission text;
  v_decision   uuid;
  v_stored     jsonb;
  v_response   jsonb;
  v_text       text;
  v_self       boolean := false;
  v_reason     text := nullif(btrim(p_body ->> 'self_approval_reason'), '');
BEGIN
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');
  END IF;

  v_permission := CASE p_intent
    WHEN 'seal_week'   THEN 'toll.manage'
    WHEN 'reopen_week' THEN 'toll.manage'
    WHEN 'carry_forward' THEN 'toll.manage'
    WHEN 'link_payback' THEN 'toll.manage'   WHEN 'driver_pays' THEN 'toll.manage'
    WHEN 'fleet_absorbs' THEN 'toll.manage'  WHEN 'leave_payback_unlinked' THEN 'toll.manage'
    WHEN 'undo_decision' THEN 'toll.manage'  WHEN 'reverse_payback' THEN 'toll.manage'
    WHEN 'correct_charge_amount' THEN 'toll.manage' WHEN 'correct_charge_week' THEN 'toll.manage'
    WHEN 'confirm_duplicate' THEN 'toll.manage' WHEN 'release_duplicate' THEN 'toll.manage'
    WHEN 'verify_cash_receipt' THEN 'toll.manage' WHEN 'reject_cash_receipt' THEN 'toll.manage'
    WHEN 'apply_suggestion' THEN 'toll.manage' WHEN 'import_batch' THEN 'toll.manage'
    WHEN 'open_dispute' THEN 'toll.manage'
    WHEN 'mark_dispute_sent' THEN 'toll.manage'
    WHEN 'settle_dispute' THEN 'toll.manage'
    WHEN 'close_dispute_lost' THEN 'toll.manage'
    WHEN 'change_toll_settings' THEN 'toll.manage'
    WHEN 'approve_settings_seed' THEN 'toll.manage'
    WHEN 'request_approval' THEN 'toll.manage'
    WHEN 'approve_request' THEN 'toll.manage'
    WHEN 'reject_request' THEN 'toll.manage'
    WHEN 'withdraw_request' THEN 'toll.manage'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;

  IF NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;

  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

  PERFORM toll_write.run_approval_gate(v_company, p_intent, p_body, p_intent IN ('request_approval','approve_request','reject_request','withdraw_request'));

  IF p_intent NOT IN ('request_approval','approve_request','reject_request','withdraw_request')
     AND toll_write.approval_requires_four_eyes(v_company, p_intent, p_body) AND v_reason IS NOT NULL
     AND toll_system.manage_seat_count(v_company) = 1 THEN
    v_self := true;
  END IF;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, reason_code, note, targets,
                              self_approved, self_approval_reason)
  VALUES (v_company, v_command_id, p_intent, 'user', v_user, p_body ->> 'reason_code', p_body ->> 'note', p_body,
          v_self, CASE WHEN v_self THEN v_reason ELSE NULL END)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;

  IF v_decision IS NULL THEN
    SELECT d.response, d.intent INTO v_stored, v_text
    FROM toll.decisions d WHERE d.organization_id = v_company AND d.command_id = v_command_id;
    IF v_text IS DISTINCT FROM p_intent THEN
      PERFORM toll_write.refuse('COMMAND_ID_REUSED', jsonb_build_object('command_id', v_command_id));
    END IF;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  v_response := toll_write.dispatch(v_company, p_intent, v_decision, v_command_id, p_body);
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true,
                                     'batch_hash', v_response -> 'batch_hash', 'counts', v_response -> 'counts');
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;


CREATE OR REPLACE FUNCTION toll_write.intent_mark_dispute_sent(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d          toll.disputes%ROWTYPE;
  v_id       uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_exp      bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_cut      date;
  r          record;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('dispute_id', v_id));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_id', v_id, 'dispute_version', d.version));
  END IF;
  IF d.state <> 'to_send' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', v_id, 'state', d.state));
  END IF;
  IF now() > d.deadline THEN
    PERFORM toll_write.refuse('window_closed', jsonb_build_object('dispute_id', v_id));
  END IF;

  UPDATE toll.disputes SET state = 'sent', sent_at = now(), clock_from = now(),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  v_cut := ((now() AT TIME ZONE 'America/Jamaica')::date - 14);
  PERFORM toll_system.match_enqueue(p_company, 'charge', d.charge_id);
  FOR r IN
    SELECT p.id FROM toll.paybacks p
    WHERE p.organization_id = p_company AND NOT p.is_legacy AND p.kind <> 'native'
      AND p.driver_id IS NOT DISTINCT FROM d.driver_id
      AND p.paid_on >= v_cut
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.reversal_of = p.id)
  LOOP
    PERFORM toll_system.match_enqueue(p_company, 'payback', r.id);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'state', 'sent',
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_sent', true))));
END;
$$;

-- Review S3-R1: the week a dispute result's money lands in ("Results this week", AD2 / C4.8).
--   Charge week sealed: the S1 apply helpers already set posted_in_week_key to the open posting week; keep it.
--   Charge week open: the money is moved by reversing / inserting the charge's allocations, which post in the
--   charge's own counted week (dispute_post_at -> charge_post_at), so the result belongs to that week, not today's.
CREATE OR REPLACE FUNCTION toll_system.dispute_result_week(p_company uuid, p_dispute uuid, p_current date)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN toll_system.dispute_charge_week_sealed(p_company, d.charge_id)
              THEN coalesce(p_current, toll_system.posting_week(p_company))
              ELSE toll_system.charge_counted_week(p_company, d.charge_id, d.charge_week_key) END
  FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = p_dispute;
$$;
REVOKE ALL ON FUNCTION toll_system.dispute_result_week(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION toll_write.intent_settle_dispute(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb, p_system boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d          toll.disputes%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  v_id       uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_pid      uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_exp      bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_take     bigint;
  v_linked   bigint;
  v_line     int := 0;
  v_new_st   text;
  v_close    text;
  v_bearer   text;
  v_state_at text;
  v_from     date;
  v_to       date;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('dispute_id', v_id));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_id', v_id, 'dispute_version', d.version));
  END IF;

  p := toll_write.lock_payback(p_company, v_pid, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);

  -- Review S2a-R3 (C4.6): the system settles a dispute only with a refund paid inside its refund
  -- window; the engine checks this too, but the database must not trust the caller.
  IF p_system AND d.state IN ('sent', 'expired') THEN
    SELECT b.refund_from, b.refund_to INTO v_from, v_to
    FROM toll_system.dispute_refund_bounds(
           CASE WHEN d.state = 'expired' THEN d.deadline ELSE d.clock_from END,
           (SELECT ps.refund_periods FROM toll.platform_settings ps
            WHERE ps.organization_id = p_company AND ps.platform = d.platform)) b;
    IF v_from IS NULL OR p.paid_on < v_from OR p.paid_on > v_to THEN
      PERFORM toll_write.refuse('OUTSIDE_REFUND_WINDOW', jsonb_build_object(
        'dispute_id', d.id, 'payback_id', p.id, 'paid_on', p.paid_on, 'refund_from', v_from, 'refund_to', v_to));
    END IF;
  END IF;

  SELECT coalesce(sum(l.amount_minor), 0) INTO v_linked
  FROM toll.dispute_links l
  WHERE l.organization_id = p_company AND l.dispute_id = d.id AND l.reversed_by IS NULL;

  v_take := coalesce(toll_write.body_amount(p_body), least(toll_system.payback_open_minor(p_company, p.id), d.owed_minor - v_linked));
  IF v_take > d.owed_minor - v_linked OR v_take > toll_system.payback_open_minor(p_company, p.id) THEN
    v_take := least(d.owed_minor - v_linked, toll_system.payback_open_minor(p_company, p.id));
  END IF;
  IF v_take <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', 'nothing_to_settle'));
  END IF;

  v_state_at := d.state;

  -- Review S2a-R4 (Y2, L2.4): a to_send dispute can't be settled; its refund clock starts at Mark as sent.
  IF d.state = 'to_send' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', 'to_send', 'use', 'mark_dispute_sent first'));
  ELSIF d.state = 'sent' THEN
    v_line := toll_system.dispute_apply_rule2_refund(
      p_company, d.id, d.charge_id, p.id, v_take, p_decision, p_cmd, v_line);
  ELSIF d.state = 'expired' THEN
    IF NOT p_system THEN
      PERFORM toll_write.refuse('EXPIRED_SYSTEM_ONLY', jsonb_build_object('dispute_id', d.id));
    END IF;
    IF p.kind <> 'adjustment' THEN
      PERFORM toll_write.refuse('WRONG_PAYBACK_KIND', jsonb_build_object('payback_id', p.id, 'kind', p.kind));
    END IF;
    SELECT CASE WHEN d.opened_late THEN 'fleet' ELSE coalesce(dp.expired_bearer, 'driver') END INTO v_bearer
    FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    v_line := toll_system.dispute_apply_rule4_expired_refund(
      p_company, d.id, d.charge_id, p.id, v_take, v_bearer, p_decision, p_cmd, v_line);
  ELSE
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', d.id, 'state', d.state));
  END IF;

  INSERT INTO toll.dispute_links (organization_id, dispute_id, payback_id, amount_minor, decision_id, state_at_settle)
  VALUES (p_company, d.id, p.id, v_take, p_decision, v_state_at);

  v_linked := v_linked + v_take;
  IF v_linked >= d.owed_minor THEN
    v_new_st := 'won';
    v_close := 'refund';
  ELSIF d.state = 'expired' THEN
    v_new_st := 'part_won';
    v_close := 'refund';
  ELSE
    v_new_st := 'sent';
    v_close := NULL;
  END IF;

  UPDATE toll.disputes SET recovered_minor = v_linked, state = v_new_st, close_reason = coalesce(v_close, close_reason),
         posted_in_week_key = CASE WHEN v_new_st IN ('won', 'part_won')
                              THEN toll_system.dispute_result_week(p_company, d.id, posted_in_week_key)
                              ELSE posted_in_week_key END,
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  UPDATE toll.paybacks SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = p.id;
  UPDATE toll.charges SET version = version + 1, updated_at = now() WHERE organization_id = p_company AND id = d.charge_id;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'amount_minor', v_take, 'state', v_new_st,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_settled_minor', v_take))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_close_dispute_lost(
  p_company uuid, p_decision uuid, p_cmd text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_id     uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_exp    bigint := (p_body ->> 'expected_dispute_version')::bigint;
  v_rest   bigint;
  v_bearer text;
  v_st     text;
BEGIN
  PERFORM toll_write.require_disputes_on(p_company);
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = v_id FOR UPDATE;
  IF d.state <> 'sent' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', v_id, 'state', d.state));
  END IF;
  IF d.version <> v_exp THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('dispute_version', d.version));
  END IF;

  v_rest := d.owed_minor - d.recovered_minor;
  SELECT coalesce(dp.lost_bearer, 'fleet') INTO v_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;

  IF v_rest > 0 THEN
    PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, v_rest, v_bearer, p_decision, p_cmd, 1);
  END IF;

  v_st := CASE WHEN d.recovered_minor > 0 THEN 'part_won' ELSE 'lost' END;

  UPDATE toll.disputes SET state = v_st, close_reason = 'platform_said_no', bearer = v_bearer,
         posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, posted_in_week_key),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;

  RETURN jsonb_build_object('decision_id', p_decision, 'dispute_id', d.id, 'state', v_st,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, d.charge_week_key,
              jsonb_build_object('dispute_closed_minor', v_rest))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_expire(
  p_company uuid, p_dispute uuid, p_decision uuid, p_cmd text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_bearer text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF d.state <> 'to_send' OR now() <= d.deadline THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', p_dispute, 'state', d.state));
  END IF;
  v_bearer := CASE WHEN d.opened_late THEN 'fleet'
                   ELSE coalesce((SELECT dp.expired_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company), 'driver')
              END;
  PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, d.owed_minor, v_bearer, p_decision, p_cmd, 1);
  UPDATE toll.disputes SET state = 'expired', close_reason = 'window_closed', bearer = v_bearer,
         posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, posted_in_week_key),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;
  RETURN jsonb_build_object('dispute_id', d.id, 'state', 'expired');
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_auto_close(
  p_company uuid, p_dispute uuid, p_decision uuid, p_cmd text, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d        toll.disputes%ROWTYPE;
  v_rest   bigint;
  v_bearer text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute FOR UPDATE;
  IF d.state <> 'sent' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('dispute_id', p_dispute, 'state', d.state));
  END IF;
  v_rest := d.owed_minor - d.recovered_minor;
  v_bearer := CASE WHEN p_reason = 'no_report' THEN 'fleet'
                   ELSE coalesce((SELECT dp.lost_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company), 'fleet')
              END;
  IF v_rest > 0 THEN
    PERFORM toll_system.dispute_apply_rule3_rest(p_company, d.id, d.charge_id, v_rest, v_bearer, p_decision, p_cmd, 1);
  END IF;
  UPDATE toll.disputes SET state = CASE WHEN d.recovered_minor > 0 THEN 'part_won' ELSE 'lost' END,
         close_reason = p_reason, bearer = v_bearer,
         posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, posted_in_week_key),
         decision_ids = array_append(decision_ids, p_decision)
  WHERE organization_id = p_company AND id = d.id;
  RETURN jsonb_build_object('dispute_id', d.id);
END;
$$;


CREATE OR REPLACE FUNCTION toll_system.dispute_format_minor(p_minor bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'J$' || trim(to_char(coalesce(p_minor, 0) / 100.0, 'FM999999990.00'));
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_driver_ids(p_company uuid, p_driver text)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) FROM (
    SELECT p_driver AS x WHERE nullif(btrim(p_driver), '') IS NOT NULL
    UNION SELECT d.id::text FROM fleet.drivers d
      WHERE d.organization_id::text = p_company::text AND (d.id::text = p_driver OR d.legacy_kv_id = p_driver)
    UNION SELECT d.legacy_kv_id FROM fleet.drivers d
      WHERE d.organization_id::text = p_company::text AND (d.id::text = p_driver OR d.legacy_kv_id = p_driver)
        AND d.legacy_kv_id IS NOT NULL) ids;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_template_text(p_company uuid, p_dispute uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d toll.disputes%ROWTYPE;
  c toll.charges%ROWTYPE;
  v_body text;
  v_plat text;
  v_start timestamptz; v_end timestamptz;
  v_paid bigint;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.id = d.charge_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT t.body INTO v_body FROM toll.dispute_text_templates t
  WHERE t.organization_id = p_company AND t.platform = d.platform AND t.version = coalesce(d.text_version, 1);
  IF v_body IS NULL THEN
    SELECT t.body INTO v_body FROM toll.dispute_text_templates t
    WHERE t.organization_id = p_company AND t.platform = d.platform AND t.retired_at IS NULL
    ORDER BY t.version DESC LIMIT 1;
  END IF;
  IF v_body IS NULL THEN RETURN NULL; END IF;
  SELECT t.pickup_at, coalesce(t.dropoff_at, t.pickup_at, t.request_at) INTO v_start, v_end
    FROM toll.platform_trips t
    WHERE t.organization_id = p_company AND t.platform = d.platform AND t.platform_trip_id = d.platform_trip_id;
  v_body := replace(v_body, '{trip_date}', to_char(coalesce(v_start, c.occurred_at) AT TIME ZONE 'America/Jamaica', 'FMDD Mon YYYY'));
  v_body := replace(v_body, '{trip_time}', to_char(coalesce(v_start, c.occurred_at) AT TIME ZONE 'America/Jamaica', 'FMHH12:MI AM')
    || CASE WHEN v_end IS NOT NULL AND v_end IS DISTINCT FROM coalesce(v_start, c.occurred_at)
         THEN '–' || to_char(v_end AT TIME ZONE 'America/Jamaica', 'FMHH12:MI AM') ELSE '' END);
  v_body := replace(v_body, '{plaza}', coalesce((SELECT tp.name FROM fleet.toll_plazas tp WHERE tp.id::text = c.plaza_id), c.plaza_id, ''));
  v_body := replace(v_body, '{toll}', toll_system.dispute_format_minor(c.amount_minor));
  SELECT coalesce(sum(a.amount_minor), 0)::bigint INTO v_paid FROM toll.allocations a
    WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL
      AND a.bearer = 'platform' AND a.payback_id IS NOT NULL AND NOT a.provisional;
  v_body := replace(v_body, '{paid}', toll_system.dispute_format_minor(v_paid));
  v_body := replace(v_body, '{owed}', toll_system.dispute_format_minor(d.owed_minor));
  RETURN v_body;
END; $$;

CREATE OR REPLACE FUNCTION toll_system.dispute_refund_candidates(p_company uuid, p_dispute uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH d AS (
    SELECT * FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute AND x.state = 'sent'
  ), bounds AS (
    -- Review S3-R2: candidates start at the trip's Jamaica date (C3 "near the trip date"), so a late Uber trip line
    -- (paid_on near the trip, before Mark as sent) is listed too (done-test 13); inRefundWindow flags the rest.
    SELECT d.id AS dispute_id, b.refund_from, b.refund_to,
           (coalesce((SELECT coalesce(t.pickup_at, t.request_at) FROM toll.platform_trips t
                      WHERE t.organization_id = p_company AND t.platform = d.platform
                        AND t.platform_trip_id = d.platform_trip_id),
                     (SELECT c.occurred_at FROM toll.charges c WHERE c.organization_id = p_company AND c.id = d.charge_id))
             AT TIME ZONE 'America/Jamaica')::date AS trip_date
    FROM d, toll.platform_settings ps,
         LATERAL toll_system.dispute_refund_bounds(d.clock_from, ps.refund_periods) b
    WHERE ps.organization_id = p_company AND ps.platform = d.platform
  )
  SELECT coalesce(jsonb_agg(row ORDER BY (row ->> 'suggested')::boolean DESC, row ->> 'paidOn'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'paybackId', p.id, 'version', p.version, 'kind', p.kind, 'paidOn', p.paid_on,
      'openMinor', toll_system.payback_open_minor(p_company, p.id), 'reference', p.reference,
      'inRefundWindow', p.paid_on >= bounds.refund_from,
      'suggestionId', (SELECT s.id FROM toll.suggestions s
        WHERE s.organization_id = p_company AND s.kind = 'dispute_refund' AND s.dispute_id = d.id
          AND s.payback_id = p.id AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired)) LIMIT 1),
      'suggested', EXISTS (SELECT 1 FROM toll.suggestions s
        WHERE s.organization_id = p_company AND s.kind = 'dispute_refund' AND s.dispute_id = d.id
          AND s.payback_id = p.id AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired)))
    ) AS row
    FROM d JOIN bounds ON bounds.dispute_id = d.id
    JOIN toll.paybacks p ON p.organization_id = p_company AND p.driver_id = d.driver_id AND p.platform = d.platform
    WHERE NOT p.is_legacy AND p.reversal_of IS NULL
      AND p.kind IN ('adjustment', 'trip_line')
      AND toll_system.payback_open_minor(p_company, p.id) > 0
      AND p.paid_on >= least(bounds.trip_date, bounds.refund_from) AND p.paid_on <= bounds.refund_to
  ) q;
$$;

CREATE OR REPLACE FUNCTION toll_system.dispute_row_json(p_company uuid, p_dispute uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d toll.disputes%ROWTYPE; c toll.charges%ROWTYPE;
  v_paid bigint; v_toll bigint; v_left bigint; v_days int; v_window int;
  v_closed boolean; v_red boolean; v_late boolean; v_hold boolean;
  v_exp_bearer text; v_bearer_ns text; v_reopened uuid;
  v_drv_name text; v_plaza text; v_plate text;
BEGIN
  SELECT * INTO d FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = p_dispute;
  IF NOT FOUND OR d.close_reason = 'undo' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM toll.charges ch WHERE ch.organization_id = p_company AND ch.id = d.charge_id;
  v_toll := c.amount_minor;
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_paid FROM toll.allocations a
    WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL
      AND a.bearer = 'platform' AND a.payback_id IS NOT NULL AND NOT a.provisional;
  v_left := greatest(d.owed_minor - d.recovered_minor, 0);
  SELECT ps.dispute_window_days INTO v_window FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = d.platform;
  v_days := greatest(((d.deadline AT TIME ZONE 'America/Jamaica')::date - (now() AT TIME ZONE 'America/Jamaica')::date), 0);
  v_closed := d.state = 'to_send' AND now() > d.deadline;
  v_red := d.state = 'to_send' AND v_days <= 2;
  v_late := (d.state = 'to_send' AND v_days <= 2)
    OR (d.state = 'sent' AND d.recovered_minor = 0 AND toll_system.platform_week_in(
          p_company, d.platform, toll_system.dispute_refund_period_week_start(d.clock_from, 1)));
  v_hold := toll_system.dispute_sweep_hold(p_company, d.id);
  SELECT dp.expired_bearer INTO v_exp_bearer FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
  v_bearer_ns := CASE WHEN d.opened_late OR coalesce(v_exp_bearer, 'driver') = 'fleet' THEN 'fleet' ELSE 'driver' END;
  SELECT dr.name INTO v_drv_name FROM fleet.drivers dr
    WHERE dr.organization_id::text = p_company::text AND (dr.id::text = d.driver_id OR dr.legacy_kv_id = d.driver_id) LIMIT 1;
  SELECT tp.name INTO v_plaza FROM fleet.toll_plazas tp WHERE tp.id::text = c.plaza_id;
  SELECT v.license_plate INTO v_plate FROM fleet.vehicles v
    WHERE v.organization_id::text = p_company::text AND v.id::text = c.vehicle_id LIMIT 1;
  SELECT r.id INTO v_reopened FROM toll.disputes r
    WHERE r.organization_id = p_company AND r.reopens_id = d.id AND r.close_reason IS DISTINCT FROM 'undo' LIMIT 1;
  RETURN jsonb_build_object(
    'id', d.id, 'version', d.version, 'state', d.state, 'closeReason', d.close_reason,
    'platform', d.platform, 'driverId', d.driver_id, 'driverName', v_drv_name,
    'chargeId', d.charge_id, 'chargeWeekKey', d.charge_week_key, 'postedInWeekKey', d.posted_in_week_key,
    'openedLate', d.opened_late, 'reopensId', d.reopens_id,
    'occurredAt', c.occurred_at, 'plazaName', v_plaza, 'plate', v_plate,
    'tollMinor', v_toll, 'paidMinor', v_paid, 'owedMinor', d.owed_minor,
    'recoveredMinor', d.recovered_minor, 'leftMinor', v_left,
    'trip', toll_system.trip_json(p_company, d.platform, d.platform_trip_id),
    'deadline', d.deadline, 'windowDays', v_window, 'daysLeft', v_days,
    'windowClosed', v_closed, 'red', v_red, 'late', v_late, 'heldBySweep', v_hold,
    'canMarkSent', d.state = 'to_send' AND NOT v_closed,
    'canRefundReceived', d.state = 'sent',
    'canLost', d.state = 'sent',
    'bearerIfNotSent', jsonb_build_object('bearer', v_bearer_ns, 'amountMinor', v_left),
    'reopenedBy', v_reopened);
END; $$;

-- Result rows undo via intent_undo_dispute_result (decision_id only).
CREATE OR REPLACE FUNCTION toll_system.undo_body(p_company uuid, p_decision uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN d.intent IN ('settle_dispute', 'close_dispute_lost', 'dispute_expire', 'dispute_auto_close')
      THEN jsonb_build_object('decision_id', d.id)
    WHEN d.intent IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion')
         AND (EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = d.id
                        AND a.reversed_by IS NULL)
              OR EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                           AND u.decision_id = d.id AND u.reversed_by IS NULL))
      THEN jsonb_build_object('decision_id', d.id, 'expected_versions',
           coalesce((SELECT jsonb_object_agg(x.id, x.version) FROM (
               SELECT c.id::text AS id, c.version FROM toll.charges c
               WHERE c.organization_id = p_company
                 AND c.id IN (SELECT a.charge_id FROM toll.allocations a
                              WHERE a.organization_id = p_company AND a.decision_id = d.id)
               UNION
               SELECT p.id::text, p.version FROM toll.paybacks p
               WHERE p.organization_id = p_company
                 AND p.id IN (SELECT a.payback_id FROM toll.allocations a WHERE a.organization_id = p_company
                                AND a.decision_id = d.id AND a.payback_id IS NOT NULL
                              UNION
                              SELECT u.payback_id FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                                AND u.decision_id = d.id AND u.payback_id IS NOT NULL)) x), '{}'::jsonb))
    END
  FROM toll.decisions d WHERE d.organization_id::text = p_company::text AND d.id = p_decision;
$$;

CREATE OR REPLACE FUNCTION toll_system.seal_pending_part(p_company uuid, p_charge uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH live AS (
    SELECT s.*, coalesce((s.score_parts ->> 'total')::numeric) AS sc
    FROM toll.suggestions s
    WHERE s.organization_id = p_company AND s.charge_id = p_charge AND s.superseded_by IS NULL
      AND NOT ('withdrawn' = ANY (s.rules_fired)) AND s.kind IN ('payback', 'rider_pays_driver')
      AND (s.kind = 'payback' AND toll_system.payback_open_minor(p_company, s.payback_id) > 0
           OR s.kind = 'rider_pays_driver'
              AND coalesce((SELECT ss.rider_pays_driver FROM toll.switch_state ss WHERE ss.organization_id = p_company), false)
              AND EXISTS (
             SELECT 1 FROM toll.platform_trips t
             WHERE t.organization_id = p_company AND t.platform = s.trip_platform AND t.platform_trip_id = s.trip_id
               AND t.withdrawn_at IS NULL))
  ), top AS (SELECT max(sc) AS mx FROM live)
  SELECT CASE
    -- Review S3-R4: a pending toll in an open review pair is shown in part 5 ("Possible duplicates").
    WHEN EXISTS (SELECT 1 FROM toll.duplicate_reviews dr WHERE dr.organization_id = p_company AND dr.status = 'open'
                   AND p_charge IN (dr.charge_a, dr.charge_b)) THEN 5
    WHEN (SELECT count(*) FROM live l, top t WHERE l.sc = t.mx) >= 2 THEN 2
    WHEN EXISTS (SELECT 1 FROM live) THEN 1
    ELSE 4 END;
$$;

DROP FUNCTION IF EXISTS toll_system.seal_blockers(uuid, date);
CREATE OR REPLACE FUNCTION toll_system.seal_blockers(p_company uuid, p_week date)
RETURNS TABLE (kind text, id uuid, amount_minor bigint, reason text, part int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH week_charges AS (
    SELECT c.id, c.amount_minor, toll_system.charge_state(p_company, c.id) AS state
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  week_paybacks AS (
    SELECT p.id, (p.amount_minor
         - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
         - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0))::bigint AS unallocated
    FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.week_key = p_week AND NOT p.is_legacy AND NOT p.after_seal
      AND p.reversal_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p_company AND r.reversal_of = p.id)
  )
  SELECT 'charge'::text, wc.id, wc.amount_minor, wc.state,
         CASE wc.state WHEN 'unverified' THEN 5 WHEN 'short_paid' THEN 5
                       WHEN 'pending' THEN toll_system.seal_pending_part(p_company, wc.id) END
  FROM week_charges wc WHERE wc.state IN ('pending', 'unverified', 'short_paid')
  UNION ALL
  SELECT 'review_pair'::text, d.id, NULL::bigint, 'review_pair'::text, 5
  FROM toll.duplicate_reviews d
  WHERE d.organization_id = p_company AND d.status = 'open'
    AND (d.charge_a IN (SELECT id FROM week_charges) OR d.charge_b IN (SELECT id FROM week_charges))
  UNION ALL
  SELECT 'payback'::text, wp.id, wp.unallocated, 'unallocated_payback'::text,
         CASE WHEN EXISTS (SELECT 1 FROM toll.suggestions s WHERE s.organization_id = p_company
                  AND s.kind = 'dispute_refund' AND s.payback_id = wp.id AND s.superseded_by IS NULL
                  AND NOT ('withdrawn' = ANY (s.rules_fired))) THEN 3 ELSE 5 END
  FROM week_paybacks wp WHERE wp.unallocated > 0
  UNION ALL
  SELECT 'carried'::text, f.id, toll_system.carried_open_minor(p_company, f.id), 'unallocated_payback'::text, 5
  FROM toll.carried_facts f
  WHERE f.organization_id = p_company AND f.to_week = p_week AND f.kind = 'correction_down' AND f.bearer IS NULL
    AND toll_system.carried_open_minor(p_company, f.id) > 0;
$$;

CREATE OR REPLACE FUNCTION toll_system.week_desk_disputes_block(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH active AS (
    SELECT toll_system.dispute_row_json(p_company, d.id)
         || jsonb_build_object('fromWeekKey', CASE WHEN d.charge_week_key <> p_week THEN d.charge_week_key END,
           'refundCandidates', CASE WHEN d.state = 'sent' THEN toll_system.dispute_refund_candidates(p_company, d.id) ELSE '[]'::jsonb END) AS row
    FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent') AND d.close_reason IS DISTINCT FROM 'undo'
    ORDER BY CASE d.state WHEN 'to_send' THEN 0 ELSE 1 END, d.deadline
  ), tiles AS (
    SELECT
      count(*) FILTER (WHERE (row ->> 'state') = 'to_send') AS to_send_n,
      coalesce(sum((row ->> 'leftMinor')::bigint) FILTER (WHERE (row ->> 'state') = 'to_send'), 0) AS to_send_amt,
      count(*) FILTER (WHERE (row ->> 'state') = 'sent') AS sent_n,
      coalesce(sum((row ->> 'leftMinor')::bigint) FILTER (WHERE (row ->> 'state') = 'sent'), 0) AS sent_amt,
      count(*) FILTER (WHERE (row ->> 'late')::boolean) AS late_n,
      coalesce(sum((row ->> 'leftMinor')::bigint) FILTER (WHERE (row ->> 'late')::boolean), 0) AS late_amt
    FROM active
  )
  SELECT jsonb_build_object(
    'active', coalesce((SELECT jsonb_agg(row) FROM active), '[]'::jsonb),
    'tiles', (SELECT jsonb_build_object(
      'toSend', jsonb_build_object('count', to_send_n, 'amountMinor', to_send_amt),
      'sent', jsonb_build_object('count', sent_n, 'amountMinor', sent_amt),
      'late', jsonb_build_object('count', late_n, 'amountMinor', late_amt)) FROM tiles),
    'waitingMinor', coalesce((SELECT sum((row ->> 'leftMinor')::bigint) FROM active), 0));
$$;

CREATE OR REPLACE FUNCTION toll_system.week_desk_results_block(p_company uuid, p_week date, p_sealed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'outcome', x ->> 'chargeWeekKey'), '[]'::jsonb)
  FROM (
    SELECT toll_system.dispute_row_json(d.organization_id, d.id)
      || jsonb_build_object(
          'outcome', d.state,
          'borneMinor', CASE WHEN d.state IN ('won') THEN 0 ELSE d.owed_minor - d.recovered_minor END,
          'bearer', d.bearer,
          'decider', toll_system.decider(d.organization_id, d.decision_ids[array_length(d.decision_ids, 1)]),
          'undo', CASE WHEN EXISTS (SELECT 1 FROM toll.disputes r WHERE r.reopens_id = d.id AND r.close_reason IS DISTINCT FROM 'undo')
                    THEN NULL ELSE toll_system.undo_body(d.organization_id, d.decision_ids[array_length(d.decision_ids, 1)]) END)
      AS x
    FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.posted_in_week_key = p_week
      AND d.state IN ('won', 'part_won', 'lost', 'expired') AND d.close_reason IS DISTINCT FROM 'undo') s;
$$;

CREATE OR REPLACE FUNCTION toll_system.week_desk_earlier_results(p_week date, p_results jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'refundedMinor', coalesce(sum((e ->> 'recoveredMinor')::bigint) FILTER (WHERE (e ->> 'outcome') IN ('won', 'part_won')), 0),
    'toDriverMinor', coalesce(sum((e ->> 'borneMinor')::bigint) FILTER (WHERE (e ->> 'outcome') IN ('lost', 'expired', 'part_won') AND e ->> 'bearer' = 'driver'), 0),
    'toFleetMinor', coalesce(sum((e ->> 'borneMinor')::bigint) FILTER (WHERE (e ->> 'outcome') IN ('lost', 'expired', 'part_won') AND e ->> 'bearer' = 'fleet'), 0))
  FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e
  WHERE (e ->> 'chargeWeekKey')::date < p_week;
$$;

CREATE OR REPLACE FUNCTION toll_system.week_desk_parts_row(p_company uuid, p_week date, p_sealed boolean,
  p_charges jsonb, p_paybacks jsonb, p_blockers jsonb, p_disputes jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p1 int; v_p2 int; v_p4 int; v_p5 int; v_p3 int; v_to_send int; v_sent int;
  v_blk int; v_seal text;
BEGIN
  -- Review S3-R3: a part's count is what still blocks in it (seal_blockers, one row per item), so an item is
  -- never counted twice (a cash receipt was counted as a charge and again as its blocker; a payback likewise).
  SELECT count(*) FILTER (WHERE (b ->> 'part')::int = 1),
         count(*) FILTER (WHERE (b ->> 'part')::int = 2),
         count(*) FILTER (WHERE (b ->> 'part')::int = 4),
         count(*) FILTER (WHERE (b ->> 'part')::int = 5)
    INTO v_p1, v_p2, v_p4, v_p5 FROM jsonb_array_elements(coalesce(p_blockers, '[]'::jsonb)) b;
  v_to_send := coalesce((p_disputes -> 'tiles' -> 'toSend' ->> 'count')::int, 0);
  v_sent := coalesce((p_disputes -> 'tiles' -> 'sent' ->> 'count')::int, 0);
  v_p3 := v_to_send;
  v_blk := coalesce(jsonb_array_length(p_blockers), 0);
  IF p_sealed THEN v_seal := 'sealed';
  ELSIF v_blk > 0 THEN v_seal := 'blocked';
  ELSE v_seal := 'ready';
  END IF;
  RETURN jsonb_build_array(
    jsonb_build_object('part', 1, 'key', 'matches', 'count', v_p1, 'amountMinor', 0,
      'status', CASE WHEN v_p1 > 0 THEN 'todo' ELSE 'clear' END),
    jsonb_build_object('part', 2, 'key', 'pick_trip', 'count', v_p2, 'amountMinor', 0,
      'status', CASE WHEN v_p2 > 0 THEN 'todo' ELSE 'clear' END),
    jsonb_build_object('part', 3, 'key', 'disputes', 'count', v_p3, 'amountMinor',
      coalesce((p_disputes -> 'tiles' -> 'toSend' ->> 'amountMinor')::bigint, 0),
      'status', CASE WHEN v_to_send > 0 THEN 'todo' WHEN v_sent > 0 THEN 'waiting' ELSE 'clear' END),
    jsonb_build_object('part', 4, 'key', 'no_trip', 'count', v_p4, 'amountMinor', 0,
      'status', CASE WHEN v_p4 > 0 THEN 'todo' ELSE 'clear' END),
    jsonb_build_object('part', 5, 'key', 'other_checks', 'count', v_p5, 'amountMinor', 0,
      'status', CASE WHEN v_p5 > 0 THEN 'todo' ELSE 'clear' END),
    jsonb_build_object('part', 6, 'key', 'seal', 'count', v_blk, 'amountMinor', 0, 'status', v_seal));
END; $$;

CREATE OR REPLACE FUNCTION toll_system.disputes_tab(p_company uuid, p_driver text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ids text[]; v_active jsonb; v_by jsonb;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN jsonb_build_object('active', '[]'::jsonb, 'byDriver', '[]'::jsonb);
  END IF;
  v_ids := CASE WHEN p_driver IS NULL THEN NULL ELSE toll_system.dispute_driver_ids(p_company, p_driver) END;
  SELECT coalesce(jsonb_agg(toll_system.dispute_row_json(p_company, d.id)
    || jsonb_build_object('fromWeekKey', CASE WHEN d.charge_week_key <> ledger.jamaica_week_start(now())
           THEN d.charge_week_key END) ORDER BY CASE d.state WHEN 'to_send' THEN 0 ELSE 1 END, d.deadline), '[]'::jsonb)
  INTO v_active FROM toll.disputes d
  WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent') AND d.close_reason IS DISTINCT FROM 'undo'
    AND (v_ids IS NULL OR d.driver_id = ANY (v_ids));
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'driverId', s.driver_id, 'driverName', s.driver_name,
    'toSend', s.to_send, 'sent', s.sent, 'late', s.late, 'leftMinor', s.left_minor) ORDER BY s.driver_name), '[]'::jsonb)
  INTO v_by FROM (
    SELECT d.driver_id,
      (SELECT dr.name FROM fleet.drivers dr WHERE dr.organization_id::text = p_company::text
         AND (dr.id::text = d.driver_id OR dr.legacy_kv_id = d.driver_id) LIMIT 1) AS driver_name,
      count(*) FILTER (WHERE d.state = 'to_send') AS to_send,
      count(*) FILTER (WHERE d.state = 'sent') AS sent,
      count(*) FILTER (WHERE (toll_system.dispute_row_json(p_company, d.id) ->> 'late')::boolean) AS late,
      sum(d.owed_minor - d.recovered_minor) AS left_minor
    FROM toll.disputes d
    WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent') AND d.close_reason IS DISTINCT FROM 'undo'
    GROUP BY d.driver_id) s;
  RETURN jsonb_build_object('active', v_active, 'byDriver', v_by);
END; $$;

CREATE OR REPLACE FUNCTION toll_system.toll_settings_plaza_rates_json(p_plaza text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'platform', plat.platform,
    'current', jsonb_build_object('amountMinor', cr.amount_minor, 'validFrom', cr.valid_from),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('amountMinor', h.amount_minor, 'validFrom', h.valid_from)
                ORDER BY h.valid_from DESC), '[]'::jsonb)
              FROM toll.plaza_rates h
              WHERE h.plaza_id = p_plaza AND h.rate_kind = 'platform_refund' AND h.platform = plat.platform)
  )
  ORDER BY plat.platform), '[]'::jsonb)
  FROM (SELECT DISTINCT platform FROM toll.plaza_rates
        WHERE plaza_id = p_plaza AND rate_kind = 'platform_refund') plat
  -- Review S3-R6: "current" = the rate valid today (Jamaica date), not the newest one; a rate that starts later is
  -- only in history (newest first). A platform with only future rates has current amountMinor null.
  LEFT JOIN LATERAL (
    SELECT r2.amount_minor, r2.valid_from FROM toll.plaza_rates r2
    WHERE r2.plaza_id = p_plaza AND r2.platform = plat.platform AND r2.rate_kind = 'platform_refund'
      AND r2.valid_from <= (now() AT TIME ZONE 'America/Jamaica')::date
    ORDER BY r2.valid_from DESC LIMIT 1
  ) cr ON true;
$$;

CREATE OR REPLACE FUNCTION toll_system.toll_settings_plazas_json()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'plazaId', pr.plaza_id,
    'name', tp.name,
    'tagPrice', jsonb_build_object(
      'current', jsonb_build_object(
        'amountMinor', toll_system.plaza_rate(pr.plaza_id, 'tag_price', NULL, (now() AT TIME ZONE 'America/Jamaica')::date),
        'validFrom', (SELECT r.valid_from FROM toll.plaza_rates r
          WHERE r.plaza_id = pr.plaza_id AND r.rate_kind = 'tag_price' AND r.platform IS NULL
            AND r.valid_from <= (now() AT TIME ZONE 'America/Jamaica')::date
          ORDER BY r.valid_from DESC LIMIT 1)),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('amountMinor', r.amount_minor, 'validFrom', r.valid_from)
                  ORDER BY r.valid_from DESC), '[]'::jsonb)
                FROM toll.plaza_rates r
                WHERE r.plaza_id = pr.plaza_id AND r.rate_kind = 'tag_price' AND r.platform IS NULL)
    ),
    'platformRates', toll_system.toll_settings_plaza_rates_json(pr.plaza_id)
  ) ORDER BY tp.name), '[]'::jsonb)
  FROM toll.plaza_rules pr
  LEFT JOIN fleet.toll_plazas tp ON tp.id::text = pr.plaza_id;
$$;

-- Review S3-R5: one list of missing settings, used by the matcher's refusal and by the Fleet Policy read, so the
-- screen can never say "all set" while matching still refuses SETTINGS_MISSING. Same four checks as S1b / S2b.
CREATE OR REPLACE FUNCTION toll_system.settings_missing_list(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_missing jsonb := '[]'::jsonb; v_plat text; v_plaza text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'dispute_policy'));
  END IF;
  FOR v_plat IN
    SELECT DISTINCT x.platform FROM (
      SELECT p.platform FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
      UNION
      SELECT t.platform FROM toll.platform_trips t WHERE t.organization_id = p_company AND NOT t.is_legacy
    ) x
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'platform_settings', 'platform', v_plat));
    END IF;
  END LOOP;
  FOR v_plaza IN SELECT DISTINCT c.plaza_id FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND c.plaza_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v_plaza) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'plaza_rules', 'plaza_id', v_plaza));
    END IF;
  END LOOP;
  FOR v_plat IN
    SELECT ps.platform FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.takes_disputes
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM toll.platform_settings ps2
      WHERE ps2.organization_id = p_company AND ps2.platform = v_plat
        AND ps2.coverage_source_id IS NOT NULL AND btrim(ps2.coverage_source_id) <> '') THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'coverage_source', 'platform', v_plat));
    END IF;
  END LOOP;
  RETURN v_missing;
END; $$;

CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_missing jsonb := toll_system.settings_missing_list(p_company);
BEGIN
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION toll_system.match_refuse_missing_settings(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- change_toll_settings keys: platform_settings.* snake fields; dispute_policy lost_bearer/expired_bearer; plaza_rates_add plaza_id/platform/rate_minor/effective_from
CREATE OR REPLACE FUNCTION toll_system.toll_settings_read(p_company uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'switches', (SELECT jsonb_build_object('tollDisputes', s.toll_disputes, 'loggedTrips', s.logged_trips,
      'riderPaysDriver', s.rider_pays_driver, 'tollDisputesOnAt', s.toll_disputes_on_at)
      FROM toll.switch_state s WHERE s.organization_id = p_company),
    'disputePolicy', (SELECT jsonb_build_object('lostBearer', dp.lost_bearer, 'expiredBearer', dp.expired_bearer)
      FROM toll.dispute_policy dp WHERE dp.organization_id = p_company),
    'platforms', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'platform', ps.platform, 'paybackMode', ps.payback_mode, 'paysTollsBack', ps.pays_tolls_back,
      'takesDisputes', ps.takes_disputes, 'autoApply', ps.auto_apply,
      'disputeWindowDays', ps.dispute_window_days, 'refundPeriods', ps.refund_periods,
      'noReportFallbackDays', ps.no_report_fallback_days, 'coverageSourceId', ps.coverage_source_id
      ) ORDER BY ps.platform) FROM toll.platform_settings ps WHERE ps.organization_id = p_company), '[]'::jsonb),
    'plazas', toll_system.toll_settings_plazas_json(),
    'templates', coalesce((SELECT jsonb_agg(jsonb_build_object('platform', t.platform, 'version', t.version, 'body', t.body))
      FROM toll.dispute_text_templates t WHERE t.organization_id = p_company AND t.retired_at IS NULL), '[]'::jsonb),
    -- Review S3-R5: seeded = approve_settings_seed ran (direct or via approve_request; a refused one rolls back).
    'seeded', EXISTS (SELECT 1 FROM toll.decisions sd WHERE sd.organization_id = p_company AND sd.intent = 'approve_settings_seed'),
    'missing', toll_system.settings_missing_list(p_company),
    'approvals', jsonb_build_object(
      'soleManager', toll_system.manage_seat_count(p_company) = 1,
      'thresholdMinor', 500000)  -- the fixed J$5,000 in toll_write.approval_requires_four_eyes (B14)
  );
$$;

CREATE OR REPLACE FUNCTION toll_system.driver_disputes_read(p_company uuid, p_driver text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ids text[]; v_on boolean; v_rows jsonb;
BEGIN
  v_on := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  IF NOT v_on THEN RETURN jsonb_build_object('enabled', false, 'disputes', '[]'::jsonb); END IF;
  v_ids := toll_system.dispute_driver_ids(p_company, p_driver);
  SELECT coalesce(jsonb_agg(toll_system.dispute_row_json(p_company, d.id)
    || jsonb_build_object('text', toll_system.dispute_template_text(p_company, d.id))
    ORDER BY CASE d.state WHEN 'to_send' THEN 0 ELSE 1 END, d.deadline), '[]'::jsonb)
  INTO v_rows FROM toll.disputes d
  WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent') AND d.close_reason IS DISTINCT FROM 'undo'
    AND d.driver_id = ANY (v_ids);
  RETURN jsonb_build_object('enabled', true, 'disputes', coalesce(v_rows, '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION toll_system.driver_mark_dispute_sent(p_company uuid, p_driver text, p_user uuid, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ids text[]; v_cmd text := nullif(btrim(p_body ->> 'command_id'), '');
  v_did uuid := nullif(p_body ->> 'dispute_id', '')::uuid;
  v_decision uuid; v_stored jsonb; v_intent text; v_response jsonb;
BEGIN
  v_ids := toll_system.dispute_driver_ids(p_company, p_driver);
  IF v_cmd IS NULL OR v_did IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id', 'dispute_id')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = v_did AND d.driver_id = ANY (v_ids)) THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('dispute_id', v_did));
  END IF;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, actor_job, targets)
  VALUES (p_company, v_cmd, 'mark_dispute_sent', 'user', p_user, 'driver_app', p_body)
  ON CONFLICT (organization_id, command_id) DO NOTHING RETURNING id INTO v_decision;
  IF v_decision IS NULL THEN
    SELECT d.response, d.intent INTO v_stored, v_intent FROM toll.decisions d
      WHERE d.organization_id = p_company AND d.command_id = v_cmd;
    IF v_intent IS DISTINCT FROM 'mark_dispute_sent' THEN
      PERFORM toll_write.refuse('COMMAND_ID_REUSED', jsonb_build_object('command_id', v_cmd));
    END IF;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;
  v_response := toll_write.intent_mark_dispute_sent(p_company, v_decision, v_cmd, p_body);
  UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  RETURN v_response;
END; $$;

REVOKE ALL ON FUNCTION toll_system.dispute_format_minor(bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_driver_ids(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_template_text(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_refund_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_row_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_pending_part(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_blockers(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk_disputes_block(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk_results_block(uuid, date, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk_earlier_results(date, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk_parts_row(uuid, date, boolean, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.disputes_tab(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.toll_settings_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.settings_missing_list(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.toll_settings_plaza_rates_json(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.toll_settings_plazas_json() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.driver_disputes_read(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.driver_mark_dispute_sent(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION toll_system.week_desk(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sealed   boolean := toll_system.week_is_sealed(p_company, p_week);
  v_paid     boolean := EXISTS (SELECT 1 FROM ledger.settlement_movements m
                                WHERE m.organization_id = p_company AND m.period_anchor = p_week
                                  AND m.kind IN ('pay', 'write_off') AND m.status = 'posted');
  v_charges  jsonb;
  v_paybacks jsonb;
  v_kept     jsonb;
  v_pairs    jsonb;
  v_late     jsonb;
  v_blockers jsonb;
  v_disputes boolean := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  v_rider    boolean := coalesce((SELECT s.rider_pays_driver FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  v_result   jsonb;
  v_disputes_obj jsonb;
  v_results jsonb;
  v_sum_line jsonb;
  v_earlier jsonb;
  v_parts jsonb;
  v_offline_flagged int;
  v_offline_minor bigint;
  v_spend bigint; v_paid_back bigint; v_driver bigint; v_fleet bigint; v_waiting bigint; v_still bigint;
BEGIN
  v_result := toll_system.week_result(p_company, p_week);
  WITH ch AS (
    SELECT c.*, toll_system.charge_state(p_company, c.id) AS state,
           coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)::bigint AS allocated
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  sug AS (
    SELECT s.charge_id, s.id AS suggestion_id, s.kind,
           coalesce((s.score_parts ->> 'total')::int, 0) AS score, s.rules_fired,
           p.id AS payback_id, p.version AS payback_version, p.amount_minor AS payback_minor,
           p.platform AS payback_platform, p.platform_trip_id AS payback_trip_id,
           s.trip_platform, s.trip_id,
           toll_system.payback_open_minor(p_company, p.id) AS payback_open_minor
    FROM toll.suggestions s
    JOIN ch ON ch.id = s.charge_id AND ch.state = 'pending'
    LEFT JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = s.payback_id
    WHERE s.organization_id = p_company AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired))
      AND s.kind IN ('payback', 'rider_pays_driver')
      AND (
        (s.kind = 'payback' AND toll_system.payback_open_minor(p_company, p.id) > 0)
        OR (s.kind = 'rider_pays_driver' AND v_rider AND EXISTS (
          SELECT 1 FROM toll.platform_trips t
          WHERE t.organization_id = p_company AND t.platform = s.trip_platform AND t.platform_trip_id = s.trip_id
            AND t.withdrawn_at IS NULL)))
  ),
  ranked AS (
    SELECT sug.*, max(score) OVER (PARTITION BY charge_id) AS top_score,
           count(*) OVER (PARTITION BY charge_id, score) AS same_score_n
    FROM sug
  ),
  conf AS (
    SELECT charge_id,
           CASE WHEN max(same_score_n) FILTER (WHERE score = top_score) >= 2 THEN 'two_trips'
                WHEN bool_or(score = top_score AND 'sole_candidate' = ANY (rules_fired) AND 'on_trip' = ANY (rules_fired))
                  THEN 'sure'
                ELSE 'likely' END AS confidence
    FROM ranked GROUP BY charge_id
  ),
  pairs AS (
    SELECT d.id, d.charge_a, d.charge_b FROM toll.duplicate_reviews d
    WHERE d.organization_id::text = p_company::text AND d.status = 'open'
      AND (d.charge_a IN (SELECT id FROM ch) OR d.charge_b IN (SELECT id FROM ch))
  ),
  rows AS (
    SELECT ch.*, cf.confidence,
           (SELECT pr.id FROM pairs pr WHERE ch.id IN (pr.charge_a, pr.charge_b) LIMIT 1) AS pair_id,
           CASE
                WHEN v_disputes AND ch.state = 'decided' AND EXISTS (
                  SELECT 1 FROM toll.allocations a
                  JOIN toll.disputes d ON d.organization_id = a.organization_id AND d.id = a.dispute_id
                  WHERE a.organization_id = p_company AND a.charge_id = ch.id AND a.reversed_by IS NULL
                    AND a.provisional AND a.bearer = 'platform' AND a.dispute_id IS NOT NULL
                    AND d.state IN ('to_send', 'sent', 'expired') AND d.close_reason IS DISTINCT FROM 'undo') THEN 'disputes'
                WHEN v_disputes AND ch.state = 'short_paid' THEN 'part_paid'
                WHEN ch.state IN ('decided', 'rejected', 'duplicate') THEN 'decided'
                WHEN ch.state = 'unverified' THEN 'receipts'
                WHEN ch.state = 'awaiting_cash' THEN 'awaiting_cash'
                WHEN EXISTS (SELECT 1 FROM pairs pr WHERE ch.id IN (pr.charge_a, pr.charge_b)) THEN 'duplicates'
                WHEN cf.confidence = 'two_trips' THEN 'pick'
                WHEN cf.confidence IS NOT NULL THEN 'suggested'
                ELSE 'no_trip' END AS section,
           CASE
             WHEN v_disputes AND ch.state = 'decided' AND EXISTS (
               SELECT 1 FROM toll.allocations a
               JOIN toll.disputes d ON d.organization_id = a.organization_id AND d.id = a.dispute_id
               WHERE a.organization_id = p_company AND a.charge_id = ch.id AND a.reversed_by IS NULL
                 AND a.provisional AND a.bearer = 'platform' AND a.dispute_id IS NOT NULL
                 AND d.state IN ('to_send', 'sent', 'expired') AND d.close_reason IS DISTINCT FROM 'undo') THEN 3
             WHEN ch.state = 'short_paid' THEN 5
             WHEN ch.state IN ('decided', 'rejected', 'duplicate') THEN 6
             WHEN ch.state IN ('unverified', 'awaiting_cash') THEN 5
             WHEN EXISTS (SELECT 1 FROM pairs pr WHERE ch.id IN (pr.charge_a, pr.charge_b)) THEN 5
             WHEN cf.confidence = 'two_trips' THEN 2
             WHEN cf.confidence IS NOT NULL THEN 1
             ELSE 4 END AS part,
           (SELECT a.dispute_id FROM toll.allocations a
            JOIN toll.disputes d ON d.organization_id = a.organization_id AND d.id = a.dispute_id
            WHERE a.organization_id = p_company AND a.charge_id = ch.id AND a.reversed_by IS NULL
              AND a.provisional AND a.bearer = 'platform' AND a.dispute_id IS NOT NULL
              AND d.state IN ('to_send', 'sent', 'expired') AND d.close_reason IS DISTINCT FROM 'undo'
            ORDER BY a.created_at LIMIT 1) AS dispute_id
    FROM ch LEFT JOIN conf cf ON cf.charge_id = ch.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'version', r.version, 'section', r.section, 'state', r.state,
           'occurredAt', r.occurred_at, 'timePrecision', r.time_precision, 'weekKey', r.week_key,
           'amountMinor', r.amount_minor, 'allocatedMinor', r.allocated, 'openMinor', greatest(r.amount_minor - r.allocated, 0),
           'paidBy', r.paid_by, 'source', r.source,
           'plazaId', r.plaza_id, 'plazaName', tp.name,
           'vehicleId', r.vehicle_id, 'plate', v.license_plate,
           'driverId', r.driver_id, 'driverName', dr.name,
           'driverStatus', st.driver_status,
           'offlineFlag', (r.section = 'no_trip' AND r.state = 'pending' AND st.driver_status = 'offline'),
           'receipt', CASE WHEN r.paid_by = 'cash' THEN r.evidence || jsonb_build_object('sourceRef', r.source_ref) END,
           'part', r.part, 'disputeId', r.dispute_id, 'confidence', r.confidence, 'reviewPairId', r.pair_id,
           'suggestions', CASE WHEN r.state = 'pending' THEN (
               SELECT coalesce(jsonb_agg(
                      CASE WHEN k.kind = 'rider_pays_driver' THEN jsonb_build_object(
                        'suggestionId', k.suggestion_id, 'kind', 'rider_pays_driver', 'score', k.score,
                        'top', k.score = k.top_score,
                        'confidence', CASE WHEN k.score < k.top_score THEN 'likely' ELSE r.confidence END,
                        'rules', to_jsonb(k.rules_fired),
                        'command', jsonb_build_object('confirm', 'driver_pays', 'other', 'fleet_absorbs'),
                        'paybackId', NULL, 'paybackVersion', NULL, 'paidBackMinor', NULL, 'paybackOpenMinor', NULL,
                        'reasonKey', 'rider_owed_driver_collects',
                        'trip', toll_system.trip_json(p_company, k.trip_platform, k.trip_id))
                      ELSE jsonb_build_object(
                        'suggestionId', k.suggestion_id, 'kind', 'payback', 'score', k.score,
                        'top', k.score = k.top_score,
                        'confidence', CASE WHEN k.score < k.top_score THEN 'likely' ELSE r.confidence END,
                        'rules', to_jsonb(k.rules_fired),
                        'command', 'apply_suggestion',
                        'paybackId', k.payback_id, 'paybackVersion', k.payback_version,
                        'paidBackMinor', k.payback_minor, 'paybackOpenMinor', k.payback_open_minor,
                        'trip', toll_system.trip_json(p_company, k.payback_platform, k.payback_trip_id),
                        'alsoFits', (SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId', o.charge_id,
                                        'occurredAt', oc.occurred_at, 'plazaName', otp.name) ORDER BY oc.occurred_at), '[]'::jsonb)
                                     FROM ranked o JOIN ch oc ON oc.id = o.charge_id
                                     LEFT JOIN fleet.toll_plazas otp ON otp.id::text = oc.plaza_id
                                     WHERE o.payback_id = k.payback_id AND o.charge_id <> k.charge_id))
                      END ORDER BY k.score DESC, k.suggestion_id), '[]'::jsonb)
               FROM ranked k WHERE k.charge_id = r.id) ELSE '[]'::jsonb END,
           'decision', CASE
               WHEN r.state = 'rejected' THEN (
                 SELECT jsonb_build_object('kind', 'receipt_rejected', 'undo', NULL)
                        || toll_system.decider(p_company, d.id)
                 FROM toll.decisions d
                 WHERE d.organization_id::text = p_company::text AND d.intent = 'reject_cash_receipt'
                   AND d.targets ->> 'charge_id' = r.id::text
                 ORDER BY d.created_at DESC LIMIT 1)
               -- P3-R4: a duplicate a person confirmed shows who and when; an automatic one has no decider.
               WHEN r.state = 'duplicate' THEN jsonb_build_object('kind', 'duplicate', 'keptChargeId', r.duplicate_of, 'undo', NULL)
                 || coalesce((SELECT toll_system.decider(p_company, d.id)
                              FROM toll.decisions d
                              WHERE d.organization_id::text = p_company::text AND d.intent = 'confirm_duplicate'
                                AND d.targets ->> 'charge_id' = r.id::text
                              ORDER BY d.created_at DESC LIMIT 1), '{}'::jsonb)
               WHEN r.state = 'decided' OR r.allocated > 0 THEN (
                 SELECT jsonb_build_object(
                          'kind', CASE WHEN a.payback_id IS NOT NULL THEN 'matched'
                                       WHEN a.bearer = 'driver' THEN 'driver_pays' ELSE 'fleet_pays' END,
                          'allocations', (SELECT jsonb_agg(jsonb_build_object('bearer', x.bearer, 'amountMinor', x.amount_minor,
                                            'paybackId', x.payback_id, 'provisional', x.provisional, 'decisionId', x.decision_id)
                                            ORDER BY x.created_at)
                                          FROM toll.allocations x WHERE x.organization_id = p_company AND x.charge_id = r.id
                                            AND x.reversed_by IS NULL),
                          'trip', (SELECT toll_system.trip_json(p_company, pb.platform, pb.platform_trip_id)
                                   FROM toll.paybacks pb WHERE pb.organization_id = p_company AND pb.id = a.payback_id),
                          'undo', CASE WHEN v_sealed THEN NULL ELSE toll_system.undo_body(p_company, a.decision_id) END)
                        || toll_system.decider(p_company, a.decision_id)
                 FROM toll.allocations a
                 WHERE a.organization_id = p_company AND a.charge_id = r.id AND a.reversed_by IS NULL
                 ORDER BY a.created_at DESC LIMIT 1)
             END
         ) ORDER BY r.occurred_at, r.id), '[]'::jsonb)
  INTO v_charges
  FROM rows r
  LEFT JOIN fleet.toll_plazas tp ON tp.id::text = r.plaza_id
  LEFT JOIN fleet.vehicles v ON v.organization_id::text = p_company::text AND v.id::text = r.vehicle_id
  LEFT JOIN LATERAL (SELECT d.name FROM fleet.drivers d
                     WHERE d.organization_id::text = p_company::text AND (d.id::text = r.driver_id OR d.legacy_kv_id = r.driver_id)
                     LIMIT 1) dr ON true
  LEFT JOIN LATERAL (
    SELECT toll_system.driver_status_at(p_company, r.driver_id, r.vehicle_id, r.occurred_at, r.time_precision) AS driver_status
  ) st ON true;

  SELECT count(*)::int, coalesce(sum((e ->> 'openMinor')::bigint), 0)::bigint
  INTO v_offline_flagged, v_offline_minor
  FROM jsonb_array_elements(v_charges) e
  WHERE coalesce((e ->> 'offlineFlag')::boolean, false);

  -- Paybacks of the week with an open amount that no current suggestion points at ("Uber paybacks with no toll").
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'version', p.version, 'platform', p.platform, 'kind', p.kind, 'reference', p.reference,
           'paidOn', p.paid_on, 'amountMinor', p.amount_minor, 'openMinor', toll_system.payback_open_minor(p_company, p.id),
           'receivedBy', p.received_by, 'driverId', p.driver_id,
           'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id)) ORDER BY p.paid_on, p.id), '[]'::jsonb)
  INTO v_paybacks
  FROM toll.v_active_paybacks p
  WHERE p.organization_id = p_company AND p.week_key = p_week
    AND toll_system.payback_open_minor(p_company, p.id) > 0
    AND NOT EXISTS (SELECT 1 FROM toll.suggestions s
                    JOIN toll.charges c ON c.organization_id = p_company AND c.id = s.charge_id
                    WHERE s.organization_id = p_company AND s.payback_id = p.id AND s.superseded_by IS NULL
                      AND NOT ('withdrawn' = ANY (s.rules_fired))
                      AND s.kind = 'payback'
                      AND toll_system.charge_state(p_company, c.id) = 'pending')
    AND NOT EXISTS (SELECT 1 FROM toll.suggestions s
                    WHERE s.organization_id = p_company AND s.kind = 'dispute_refund' AND s.payback_id = p.id
                      AND s.superseded_by IS NULL AND NOT ('withdrawn' = ANY (s.rules_fired)));

  -- Paybacks (or carried platform shares) a person kept with no toll — shown in "Decided" with their Undo.
  SELECT coalesce(jsonb_agg((jsonb_build_object(
           'id', u.id, 'paybackId', u.payback_id, 'carriedFactId', u.carried_fact_id, 'amountMinor', u.amount_minor,
           'reason', u.reason, 'reference', p.reference, 'paidOn', p.paid_on,
           'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id),
           'undo', CASE WHEN v_sealed THEN NULL ELSE toll_system.undo_body(p_company, u.decision_id) END) || toll_system.decider(p_company, u.decision_id))
           ORDER BY u.created_at), '[]'::jsonb)
  INTO v_kept
  FROM toll.payback_unlinked_decisions u
  LEFT JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = u.payback_id
  LEFT JOIN toll.carried_facts f ON f.organization_id = p_company AND f.id = u.carried_fact_id
  WHERE u.organization_id = p_company AND u.reversed_by IS NULL
    AND coalesce(p.week_key, f.to_week) = p_week;

  -- Open review pairs touching the week, with both charges' versions (confirm / release need both).
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'chargeA', d.charge_a, 'chargeAVersion', a.version,
           'chargeB', d.charge_b, 'chargeBVersion', b.version) ORDER BY d.created_at), '[]'::jsonb)
  INTO v_pairs
  FROM toll.duplicate_reviews d
  JOIN toll.charges a ON a.organization_id = p_company AND a.id = d.charge_a
  JOIN toll.charges b ON b.organization_id = p_company AND b.id = d.charge_b
  WHERE d.organization_id::text = p_company::text AND d.status = 'open'
    AND (toll_system.charge_counted_week(p_company, a.id, a.week_key) = p_week
         OR toll_system.charge_counted_week(p_company, b.id, b.week_key) = p_week);

  -- Facts that arrived after the week was sealed, and pending amount corrections of its charges.
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'at'), '[]'::jsonb) INTO v_late FROM (
    SELECT jsonb_build_object('kind', 'late_charge', 'id', c.id, 'version', c.version, 'at', c.occurred_at,
             'amountMinor', c.amount_minor, 'paidBy', c.paid_by, 'plazaName', tp.name, 'driverId', c.driver_id,
             'evidenceStatus', c.evidence_status) AS x
    FROM toll.charges c LEFT JOIN fleet.toll_plazas tp ON tp.id::text = c.plaza_id
    WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', 'late_payback', 'id', p.id, 'version', p.version, 'at', p.paid_on,
             'amountMinor', p.amount_minor, 'platform', p.platform, 'reference', p.reference, 'driverId', p.driver_id,
             'trip', toll_system.trip_json(p_company, p.platform, p.platform_trip_id))
    FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy AND p.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', 'correction', 'id', c.id, 'version', c.version, 'changeId', g.id, 'at', g.created_at,
             'oldAmountMinor', c.amount_minor, 'newAmountMinor', (g.new_value)::bigint,
             'direction', CASE WHEN (g.new_value)::bigint < c.amount_minor THEN 'down' ELSE 'up' END,
             'occurredAt', c.occurred_at, 'plazaName', tp.name)
    FROM toll.charge_changes g
    JOIN toll.charges c ON c.organization_id = p_company AND c.id = g.charge_id
    LEFT JOIN fleet.toll_plazas tp ON tp.id::text = c.plaza_id
    WHERE g.organization_id = p_company AND g.pending AND g.field = 'amount_minor'
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ) late;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason, 'part', b.part)),
                  '[]'::jsonb)
  INTO v_blockers FROM toll_system.seal_blockers(p_company, p_week) b;

  IF v_disputes THEN
    v_disputes_obj := toll_system.week_desk_disputes_block(p_company, p_week);
    v_results := toll_system.week_desk_results_block(p_company, p_week, v_sealed);
  ELSE
    v_disputes_obj := jsonb_build_object(
      'active', '[]'::jsonb,
      'tiles', jsonb_build_object('toSend', jsonb_build_object('count', 0, 'amountMinor', 0),
                                  'sent', jsonb_build_object('count', 0, 'amountMinor', 0),
                                  'late', jsonb_build_object('count', 0, 'amountMinor', 0)),
      'waitingMinor', 0);
    v_results := '[]'::jsonb;
  END IF;

  v_spend := coalesce((v_result -> 'spend' ->> 'totalMinor')::bigint, 0);
  v_waiting := coalesce((v_result -> 'spend' ->> 'disputedMinor')::bigint, 0);
  v_paid_back := coalesce((v_result -> 'bearers' ->> 'platformMinor')::bigint, 0) - v_waiting;
  v_driver := coalesce((v_result -> 'bearers' ->> 'driverMinor')::bigint, 0);
  v_fleet := coalesce((v_result -> 'bearers' ->> 'fleetMinor')::bigint, 0);
  v_still := v_spend - v_paid_back - v_driver - v_fleet - v_waiting;
  v_sum_line := jsonb_build_object('spendMinor', v_spend, 'paidBackMinor', v_paid_back, 'driverMinor', v_driver,
                                 'fleetMinor', v_fleet, 'waitingOnUberMinor', v_waiting, 'stillOpenMinor', v_still);

  v_earlier := toll_system.week_desk_earlier_results(p_week, v_results);

  v_parts := toll_system.week_desk_parts_row(p_company, p_week, v_sealed, v_charges, v_paybacks, v_blockers, v_disputes_obj);

  RETURN jsonb_build_object(
    'weekKey', p_week, 'sealed', v_sealed, 'paid', v_paid,
    'weekVersion', toll_system.week_version(p_company, p_week),
    'openWeek', ledger.jamaica_week_start(now()),
    'matcherBusy', EXISTS (SELECT 1 FROM toll.match_queue q WHERE q.organization_id = p_company),
    'result', v_result,
    'charges', v_charges, 'paybacks', v_paybacks, 'kept', v_kept, 'reviewPairs', v_pairs,
    'late', v_late, 'blockers', v_blockers,
    'summary', jsonb_build_object(
      'offlineFlagged', coalesce(v_offline_flagged, 0),
      'offlineFlaggedMinor', coalesce(v_offline_minor, 0)),
    'disputes', v_disputes_obj, 'results', v_results, 'sumLine', v_sum_line,
    'earlierResults', v_earlier, 'parts', v_parts,
    'approvals', jsonb_build_object('soleManager', toll_system.manage_seat_count(p_company) = 1,
                                    'thresholdMinor', 500000));
END;
$$;

-- D3: source coverage for uber_activity_timeline

-- Public reads + grants
CREATE OR REPLACE FUNCTION toll_read.disputes(p_driver text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid := toll_read.check_view();
BEGIN
  RETURN toll_system.disputes_tab(v_company, p_driver);
END; $$;

CREATE OR REPLACE FUNCTION toll_read.toll_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid := toll_read.check_view();
BEGIN RETURN toll_system.toll_settings_read(v_company); END; $$;

CREATE OR REPLACE FUNCTION public.toll_v2_disputes(p_driver text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT toll_read.disputes(p_driver); $$;

CREATE OR REPLACE FUNCTION public.toll_v2_toll_settings()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT toll_read.toll_settings(); $$;

CREATE OR REPLACE FUNCTION public.toll_sys_driver_disputes(p_company uuid, p_driver text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN toll_system.driver_disputes_read(p_company, p_driver); END; $$;

CREATE OR REPLACE FUNCTION public.toll_sys_driver_mark_dispute_sent(p_company uuid, p_driver text, p_user uuid, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN toll_system.driver_mark_dispute_sent(p_company, p_driver, p_user, p_body); END; $$;

REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_mark_dispute_sent(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_settle_dispute(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_close_dispute_lost(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_expire(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.dispute_auto_close(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_desk(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_read.disputes(text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION toll_read.toll_settings() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.toll_v2_disputes(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_v2_toll_settings() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_sys_driver_disputes(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_sys_driver_mark_dispute_sent(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION toll_read.disputes(text) TO authenticated;
GRANT EXECUTE ON FUNCTION toll_read.toll_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_v2_disputes(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_v2_toll_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_driver_disputes(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.toll_sys_driver_mark_dispute_sent(uuid, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
