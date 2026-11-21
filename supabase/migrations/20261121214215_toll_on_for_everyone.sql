-- Toll disputes, InDrive logged trips and "rider pays driver" are ON for every company, now and from creation.
--
-- Before: a company only had the new toll system if someone hand-inserted its toll.switch_state row, and
-- disputes needed a per-company settings seed (platform settings, dispute policy, dispute text, plaza rules).
-- Now:
--   1. every switch defaults to on;
--   2. every existing fleet company gets its row switched fully on and its settings set up;
--   3. a new fleet company gets the same the moment it is created (trigger on public.organizations);
--   4. the matcher sets up anything missing by itself (a new plaza, a company without settings) instead of
--      stopping the run with SETTINGS_MISSING;
--   5. Uber's refund rates at the three live plazas, read from what Uber actually paid on every linked trip:
--      b826e0b1… J$370 (toll J$390 since its rise, J$370 before), f825d1d0… J$275 (toll J$280 / J$275),
--      9970b3af… J$780 (paid in full). Inserted only where that plaza exists (production).
--   6. the J$1,200.00 the old flow already kept is recorded once per company that has it (record_legacy_kept).
-- Company isolation (each company sees only its own data) is unchanged.

-- 1. Defaults ------------------------------------------------------------------------------------------
ALTER TABLE toll.switch_state
  ALTER COLUMN tolls_v2 SET DEFAULT true,
  ALTER COLUMN toll_disputes SET DEFAULT true,
  ALTER COLUMN logged_trips SET DEFAULT true,
  ALTER COLUMN rider_pays_driver SET DEFAULT true,
  ALTER COLUMN toll_disputes_on_at SET DEFAULT now();

-- 2. One setup for any company (safe to run again: it only adds what is missing) -------------------------
CREATE OR REPLACE FUNCTION toll_system.setup_company(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company IS NULL THEN RETURN; END IF;
  INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes, logged_trips, rider_pays_driver, toll_disputes_on_at)
  VALUES (p_company, true, true, true, true, now())
  ON CONFLICT (organization_id) DO NOTHING;
  PERFORM toll_system.ensure_accounts(p_company);
  PERFORM toll_system.seed_dispute_setup(p_company, false);
END;
$$;
REVOKE ALL ON FUNCTION toll_system.setup_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.setup_company(uuid) TO service_role;

-- 3. New companies ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll.tg_organization_toll_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_line = 'fleet' THEN
    PERFORM toll_system.setup_company(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS organizations_toll_setup ON public.organizations;
CREATE TRIGGER organizations_toll_setup
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION toll.tg_organization_toll_setup();

-- 4. The matcher sets up what is missing instead of stopping ----------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_missing jsonb;
BEGIN
  -- Self-setup: default platform settings, dispute policy, dispute text and plaza rules for anything new.
  PERFORM toll_system.seed_dispute_setup(p_company, false);
  v_missing := toll_system.settings_missing_list(p_company);
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION toll_system.match_refuse_missing_settings(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 5 + 2 for every existing fleet company ------------------------------------------------------------------
UPDATE toll.switch_state
SET tolls_v2 = true, toll_disputes = true, logged_trips = true, rider_pays_driver = true,
    changed_at = now()
WHERE NOT (tolls_v2 AND toll_disputes AND logged_trips AND rider_pays_driver);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT o.id FROM public.organizations o WHERE o.product_line = 'fleet' LOOP
    PERFORM toll_system.setup_company(r.id);
  END LOOP;
  FOR r IN SELECT s.organization_id AS id FROM toll.switch_state s LOOP
    PERFORM toll_system.setup_company(r.id);
  END LOOP;
END;
$$;

INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from)
SELECT v.plaza_id, 'platform_refund', 'uber', v.amount_minor, DATE '2026-01-01'
FROM (VALUES
  ('b826e0b1-a86a-41ad-b6a4-70b246dee604', 37000::bigint),
  ('f825d1d0-b314-4568-8e69-fa0c92395f40', 27500::bigint),
  ('9970b3af-4f22-46b5-93bd-109babf0f313', 78000::bigint)
) AS v(plaza_id, amount_minor)
WHERE EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v.plaza_id)
  AND NOT EXISTS (SELECT 1 FROM toll.plaza_rates x
                  WHERE x.plaza_id = v.plaza_id AND x.rate_kind = 'platform_refund' AND x.platform = 'uber');

-- 6. J$ the old flow already kept, once per company that has some ----------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT u.organization_id AS id FROM toll.payback_unlinked_decisions u
    WHERE u.reversed_by IS NULL
      AND NOT toll_system.unlinked_has_p25(u.organization_id, u.decision_id)
      AND NOT EXISTS (SELECT 1 FROM toll.legacy_carve_outs c
                      WHERE c.organization_id = u.organization_id AND c.account_suffix = 'toll:payback_unallocated')
  LOOP
    PERFORM toll_system.record_legacy_kept(r.id);
  END LOOP;
END;
$$;

-- 7. Bug found by switching on: a take-back (reverse_payback) of a payback whose leftover was left unlinked
--    and kept as income (P25) never reversed that P25, so payback_unallocated came out short by the kept
--    amount. The take-back now reverses it in the payback's week, as undo_decision already does.
CREATE OR REPLACE FUNCTION toll_write.intent_reverse_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id       uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_ref      text := nullif(btrim(p_body ->> 'reference'), '');
  v_paid_on  date := nullif(p_body ->> 'paid_on', '')::date;
  v_eff      timestamptz;
  v_rw       date;
  v_pw       date;
  v_weeks    date[];
  v_charges  uuid[];
  v_rev      uuid;
  v_line     int := 0;
  v_taken    bigint := 0;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  v_amount   bigint;
  p          toll.paybacks%ROWTYPE;
  r          record;
  l          toll.dispute_links%ROWTYPE;
  v_st       text;
  v_reopened jsonb := '[]'::jsonb;
  v_sealed   boolean;
BEGIN
  IF v_id IS NULL OR v_ref IS NULL OR v_paid_on IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('payback_id', 'reference', 'paid_on')));
  END IF;
  v_amount := toll_write.body_amount(p_body);
  v_eff := (v_paid_on + time '12:00') AT TIME ZONE 'America/Jamaica';
  v_rw := ledger.jamaica_week_start(v_eff);

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = v_id AND a.reversed_by IS NULL ORDER BY 1);
  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
                   WHERE c.organization_id = p_company AND c.id = ANY (v_charges)) || ARRAY[v_pw, v_rw];
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  IF v_amount IS NOT NULL AND v_amount <> p.amount_minor THEN
    PERFORM toll_write.refuse('PARTIAL_TAKE_BACK', jsonb_build_object('payback_id', p.id, 'amount_minor', p.amount_minor,
                                                                      'taken_back_minor', v_amount));
  END IF;
  IF EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p_company AND x.platform = p.platform
               AND x.reference = v_ref) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('reference', v_ref, 'state', 'reference_used'));
  END IF;
  PERFORM 1 FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) ORDER BY c.id FOR UPDATE;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  INSERT INTO toll.paybacks (organization_id, platform, kind, platform_trip_id, reference, driver_id, paid_on, week_key,
                             amount_minor, reversal_of, received_by)
  VALUES (p_company, p.platform, p.kind, p.platform_trip_id, v_ref, p.driver_id, v_paid_on, v_rw,
          p.amount_minor, p.id, p.received_by)
  RETURNING id INTO v_rev;

  FOR r IN
    SELECT a.id, a.charge_id, a.amount_minor, c.occurred_at, c.driver_id,
           toll_system.charge_counted_week(p_company, c.id, c.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
    WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL
    ORDER BY a.created_at DESC, a.id DESC
  LOOP
    UPDATE toll.allocations SET reversed_by = v_rev WHERE organization_id = p_company AND id = r.id;
    v_line := v_line + 1;
    PERFORM toll_system.post(p_company, 'P6_allocate_platform', r.amount_minor, toll_system.charge_post_at(p_company, r.charge_id), p_cmd, v_line,
                             jsonb_build_object('charge_id', r.charge_id, 'payback_id', p.id, 'reversing_payback_id', v_rev,
                                                'driver_id', r.driver_id), true);
    v_taken := v_taken + r.amount_minor;
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object('uncovered_minor',
                  coalesce((v_deltas -> (r.cw::text) ->> 'uncovered_minor')::bigint, 0) + r.amount_minor));
  END LOOP;

  FOR r IN
    SELECT u.amount_minor, u.decision_id FROM toll.payback_unlinked_decisions u
    WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL
    ORDER BY u.created_at, u.id
  LOOP
    IF toll_system.unlinked_has_p25(p_company, r.decision_id) THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P25_kept_to_income', r.amount_minor,
        (v_pw + time '12:00') AT TIME ZONE 'America/Jamaica', p_cmd, v_line,
        jsonb_build_object('payback_id', p.id, 'decision_id', r.decision_id), true);
    END IF;
  END LOOP;

  UPDATE toll.payback_unlinked_decisions SET reversed_by = v_rev
  WHERE organization_id = p_company AND payback_id = p.id AND reversed_by IS NULL;

  FOR l IN
    SELECT * FROM toll.dispute_links dl
    WHERE dl.organization_id = p_company AND dl.payback_id = p.id AND dl.reversed_by IS NULL
    ORDER BY dl.created_at, dl.id
  LOOP
    -- Links made before S2a have no state_at_settle; the dispute's state now is its final one (won),
    -- so infer the settled-from state: it had been sent if it has a sent_at, otherwise it was expired.
    v_st := coalesce(l.state_at_settle,
      (SELECT CASE WHEN d.sent_at IS NOT NULL THEN 'sent' ELSE 'expired' END
       FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = l.dispute_id),
      'sent');
    UPDATE toll.dispute_links SET reversed_by = p_decision WHERE organization_id = p_company AND id = l.id;
    v_sealed := toll_system.dispute_charge_week_sealed(p_company,
                  (SELECT x.charge_id FROM toll.disputes x WHERE x.organization_id = p_company AND x.id = l.dispute_id));
    IF v_sealed THEN
      v_line := toll_system.dispute_reverse_settle_legs(p_company, l.decision_id, p_cmd, v_line);
    END IF;
    IF v_st IN ('sent', 'expired') THEN
      v_line := toll_system.dispute_reopen_after_link_reverse(
        p_company, l.dispute_id, l.amount_minor, v_st, p_decision, p_cmd, v_line, v_sealed);
      v_reopened := v_reopened || jsonb_build_array(jsonb_build_object(
        'dispute_id', l.dispute_id, 'amount_minor', l.amount_minor, 'state_at_settle', v_st));
    END IF;
  END LOOP;

  v_line := v_line + 1;
  PERFORM toll_system.post(p_company, CASE WHEN p.received_by = 'fleet' THEN 'P4_payback_fleet' ELSE 'P5_payback_driver' END,
                           p.amount_minor, v_eff, p_cmd, v_line,
                           jsonb_build_object('payback_id', p.id, 'reversing_payback_id', v_rev, 'driver_id', p.driver_id), true);

  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_ver;
  FOR r IN SELECT c.id FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_charges) LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = r.id RETURNING version INTO v_amount;
    v_versions := v_versions || jsonb_build_object(r.id::text, v_amount);
  END LOOP;
  v_deltas := toll_write.add_delta(v_deltas, v_rw, jsonb_build_object('taken_back_minor', p.amount_minor));

  RETURN jsonb_build_object('decision_id', p_decision, 'reversal_payback_id', v_rev, 'payback_version', v_ver,
                            'charge_versions', v_versions, 'uncovered_minor', v_taken, 'disputes_reopened', v_reopened,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

REVOKE ALL ON FUNCTION toll_write.intent_reverse_payback(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- 8. Bug found by switching on: linking a payback that is short of the toll opens the dispute in the same
--    command, which bumps the charge's version again, but the answer still carried the version from
--    before the dispute. The screen's next action on that toll was then refused VERSION_CHANGED.
--    Both link commands now answer with the charge's and payback's versions as they are at the end.
CREATE OR REPLACE FUNCTION toll_write.link_answer_versions(p_company uuid, p_res jsonb, p_charge uuid, p_payback uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_res
    || coalesce((SELECT jsonb_build_object('charge_version', c.version) FROM toll.charges c
                 WHERE c.organization_id = p_company AND c.id = p_charge), '{}'::jsonb)
    || coalesce((SELECT jsonb_build_object('payback_version', p.version) FROM toll.paybacks p
                 WHERE p.organization_id = p_company AND p.id = p_payback), '{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION toll_write.link_answer_versions(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION toll_write.intent_link_payback(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res jsonb;
  v_c   uuid := nullif(p_body ->> 'charge_id', '')::uuid;
  v_p   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
BEGIN
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, v_c, v_p,
           (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
           toll_write.body_amount(p_body), coalesce(nullif(p_body ->> 'reason_code', ''), 'link_payback'));
  IF NOT EXISTS (SELECT 1 FROM toll.decisions d WHERE d.id = p_decision AND d.actor = 'system') THEN
    PERFORM toll_system.try_auto_dispute_after_link(p_company, p_decision, p_cmd, v_c, v_p, false);
  END IF;
  RETURN toll_write.link_answer_versions(p_company, v_res, v_c, v_p);
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_apply_suggestion(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s     toll.suggestions%ROWTYPE;
  v_res jsonb;
BEGIN
  IF nullif(p_body ->> 'suggestion_id', '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('suggestion_id')));
  END IF;
  SELECT * INTO s FROM toll.suggestions x
  WHERE x.organization_id = p_company AND x.id = (p_body ->> 'suggestion_id')::uuid;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('suggestion_id', p_body ->> 'suggestion_id'));
  END IF;
  IF s.kind = 'dispute_refund' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'dispute_refund',
      'use', 'refund received'));
  END IF;
  IF s.kind = 'rider_pays_driver' THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'rider_pays_driver',
      'use', 'driver_pays or fleet_absorbs'));
  END IF;
  IF s.superseded_by IS NOT NULL OR 'withdrawn' = ANY (s.rules_fired) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('suggestion_id', s.id, 'state', 'suggestion_stale',
                                                                'charge_id', s.charge_id, 'payback_id', s.payback_id));
  END IF;
  v_res := toll_write.do_link(p_company, p_decision, p_cmd, s.charge_id, s.payback_id,
                              (p_body ->> 'expected_charge_version')::bigint, (p_body ->> 'expected_payback_version')::bigint,
                              NULL, 'apply_suggestion');
  PERFORM toll_system.try_auto_dispute_after_link(
    p_company, p_decision, p_cmd, s.charge_id, s.payback_id, false);
  RETURN toll_write.link_answer_versions(p_company, v_res, s.charge_id, s.payback_id)
         || jsonb_build_object('suggestion_id', s.id, 'engine_version', s.engine_version,
                               'score', s.score_parts -> 'total');
END;
$$;

-- 9. Bug found by switching on: linking only PART of an Uber trip payback to a toll opened a dispute for the
--    gap, though the payback still had money left (Uber did not pay short; the person chose a part). A
--    dispute now opens by itself only when the trip payback is used up and the toll is still not covered.
CREATE OR REPLACE FUNCTION toll_system.try_auto_dispute_after_link(
  p_company     uuid,
  p_link_decision uuid,
  p_cmd         text,
  p_charge      uuid,
  p_payback     uuid,
  p_defer_provisional boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c      toll.charges%ROWTYPE;
  p      toll.paybacks%ROWTYPE;
  v_plat text;
  v_open bigint;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN;
  END IF;

  SELECT * INTO c FROM toll.charges x WHERE x.organization_id = p_company AND x.id = p_charge;
  SELECT * INTO p FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = p_payback;

  IF p.kind <> 'trip_line' THEN RETURN; END IF;
  v_plat := p.platform;
  IF NOT coalesce((SELECT ps.takes_disputes FROM toll.platform_settings ps
                   WHERE ps.organization_id = p_company AND ps.platform = v_plat), false) THEN
    RETURN;
  END IF;

  v_open := toll_system.charge_open_minor(p_company, c.id);
  IF toll_system.payback_open_minor(p_company, p.id) > 0 THEN
    RETURN;
  END IF;
  IF v_open <= 0 OR toll_system.charge_has_active_dispute(p_company, c.id) THEN
    RETURN;
  END IF;

  PERFORM toll_system.run_system_command(
    p_company, 'open_dispute', 'auto-dispute:' || p_link_decision::text,
    jsonb_build_object(
      'charge_id', c.id, 'payback_id', p.id,
      'expected_charge_version', c.version,
      'expected_payback_version', p.version,
      'defer_provisional', p_defer_provisional),
    'matcher:auto_dispute');
END;
$$;


-- 10. "Settings set up" on the Fleet Policy screen now means the settings exist, not that a seed button was
--     pressed (every company is set up automatically).
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
    'seeded', EXISTS (SELECT 1 FROM toll.decisions sd WHERE sd.organization_id = p_company AND sd.intent = 'approve_settings_seed')
              OR (EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company)
                  AND EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company)),
    'missing', toll_system.settings_missing_list(p_company),
    'approvals', jsonb_build_object(
      'soleManager', toll_system.manage_seat_count(p_company) = 1,
      'thresholdMinor', 500000)  -- the fixed J$5,000 in toll_write.approval_requires_four_eyes (B14)
  );
$$;
