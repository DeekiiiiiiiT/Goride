-- Toll rebuild Phase 1 P1-R5: toll health metrics (B12) and the missed-Roam-ride alert.
--   toll_system.company_metrics(company) / public.toll_v2_metrics() (signed-in, toll.view, own company only).
--   toll_system.roam_gap_alerts(company), run by aging_alerts in the nightly run, for v2 companies only.

-- Toll health for one company, in one call (B12 metrics; Phase 3's dashboard reads this).
CREATE OR REPLACE FUNCTION toll_system.company_metrics(p_company uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'companyId', p_company,
    'tollsV2', toll_system.tolls_v2_on(p_company),
    'pendingCharges', (SELECT jsonb_build_object('count', count(*), 'amountMinor', coalesce(sum(c.amount_minor - c.allocated_minor), 0),
                                                 'oldestAt', min(c.created_at))
                       FROM toll.v_live_charges c WHERE c.organization_id = p_company AND c.state = 'pending'),
    'unverifiedReceipts', (SELECT jsonb_build_object('count', count(*), 'amountMinor', coalesce(sum(c.amount_minor), 0),
                                                     'oldestAt', min(c.created_at))
                           FROM toll.v_live_charges c WHERE c.organization_id = p_company AND c.state = 'unverified'),
    'awaitingCash', (SELECT jsonb_build_object('count', count(*), 'oldestAt', min(c.created_at))
                     FROM toll.v_live_charges c WHERE c.organization_id = p_company AND c.state = 'awaiting_cash'),
    'unallocatedPaybacks', (SELECT jsonb_build_object('count', count(*), 'amountMinor', coalesce(sum(p.amount_minor - p.allocated_minor), 0),
                                                      'oldestAt', min(p.created_at))
                            FROM toll.v_active_paybacks p
                            WHERE p.organization_id = p_company AND p.amount_minor > p.allocated_minor
                              AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                                                AND u.payback_id = p.id AND u.reversed_by IS NULL)),
    'afterSeal', (SELECT jsonb_build_object('count', count(*), 'oldestAt', min(x.created_at)) FROM (
                    SELECT c.created_at FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy
                    UNION ALL
                    SELECT p.created_at FROM toll.paybacks p WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy) x),
    'reviewPairsOpen', (SELECT count(*) FROM toll.duplicate_reviews d WHERE d.organization_id = p_company AND d.status = 'open'),
    'receivablePlatformMinor', toll_system.natural_balance(p_company, 'toll:receivable_platform'),
    'openAlerts', (SELECT jsonb_build_object('page', count(*) FILTER (WHERE a.severity = 'page'),
                                             'watch', count(*) FILTER (WHERE a.severity = 'watch'))
                   FROM toll.alerts a WHERE a.organization_id = p_company AND a.resolved_at IS NULL),
    'lastNightly', (SELECT jsonb_build_object('at', max(n.created_at),
                                              'failed', count(*) FILTER (WHERE NOT n.ok))
                    FROM toll.nightly_results n
                    WHERE n.organization_id = p_company
                      AND n.run_id = (SELECT n2.run_id FROM toll.nightly_results n2 WHERE n2.organization_id = p_company
                                      ORDER BY n2.created_at DESC LIMIT 1))
  );
$$;

-- For signed-in readers (toll.view): the caller's own company only.
CREATE OR REPLACE FUNCTION toll_read.metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_company uuid := toll_read.current_company();
BEGIN
  IF v_company IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NO_COMPANY', DETAIL = '{}', ERRCODE = 'P0001';
  END IF;
  IF NOT toll_system.user_can_view_tolls(auth.uid(), v_company) THEN
    RAISE EXCEPTION USING MESSAGE = 'FORBIDDEN', DETAIL = '{"permission":"toll.view"}', ERRCODE = 'P0001';
  END IF;
  RETURN toll_system.company_metrics(v_company);
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_v2_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT toll_read.metrics(); $$;

-- Missed Roam rides (P1-R3 safety net): for a v2 company, a ride that ended (completed, or waiting for cash) and has
-- plaza crossings, but no toll charge for one of them, means the rides hook failed. Raised by the nightly run.
CREATE OR REPLACE FUNCTION toll_system.roam_gap_alerts(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE r record;
BEGIN
  IF NOT toll_system.tolls_v2_on(p_company) THEN RETURN; END IF;
  FOR r IN
    SELECT rr.id AS ride_id, count(*) AS missing
    FROM rides.ride_requests rr
    JOIN rides.ride_toll_crossings x ON x.ride_request_id = rr.id
    WHERE rr.organization_id = p_company
      AND rr.status IN ('completed', 'awaiting_cash_settlement')
      -- the same rides the hook records (nativeTollCallsFor): fleet attribution, cash or card
      AND rr.attribution_mode = 'fleet' AND rr.payment_method IN ('cash', 'card')
      AND coalesce(rr.completed_at, rr.fare_locked_at, rr.updated_at) > coalesce((SELECT min(s.changed_at) FROM toll.switch_state s
                                                                        WHERE s.organization_id = p_company), '-infinity'::timestamptz)
      AND coalesce(rr.completed_at, rr.fare_locked_at, rr.updated_at) < now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM toll.charges c WHERE c.organization_id = p_company
                        AND c.source = 'roam_ride' AND c.source_ref = 'roam_crossing:' || x.id::text)
    GROUP BY rr.id
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'roam_gap:' || r.ride_id,
      'A Roam ride''s tolls were not recorded', jsonb_build_object('ride_id', r.ride_id, 'missing_crossings', r.missing));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.aging_alerts(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id, c.state, c.created_at FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND ((c.state = 'pending' AND c.created_at < now() - interval '14 days')
        OR (c.state = 'unverified' AND c.created_at < now() - interval '7 days'))
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:charge:' || r.id,
      CASE r.state WHEN 'pending' THEN 'Toll undecided for over 14 days' ELSE 'Cash receipt unchecked for over 7 days' END,
      jsonb_build_object('charge_id', r.id, 'state', r.state, 'since', r.created_at));
  END LOOP;

  FOR r IN
    SELECT p.id, p.created_at, (p.amount_minor - p.allocated_minor) AS open_minor FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.amount_minor > p.allocated_minor
      AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                        AND u.payback_id = p.id AND u.reversed_by IS NULL)
      AND p.created_at < now() - interval '14 days'
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:payback:' || r.id,
      'Payback money not given to a toll for over 14 days', jsonb_build_object('payback_id', r.id, 'open_minor', r.open_minor));
  END LOOP;

  FOR r IN
    SELECT 'charge' AS kind, c.id, c.created_at, false AS is_reversal FROM toll.charges c
    WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.created_at < now() - interval '14 days'
    UNION ALL
    SELECT 'payback', p.id, p.created_at, p.reversal_of IS NOT NULL FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
      AND p.created_at < now() - CASE WHEN p.reversal_of IS NOT NULL THEN interval '7 days' ELSE interval '14 days' END
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', CASE WHEN r.is_reversal THEN 'page' ELSE 'watch' END,
      'aging:after_seal:' || r.id,
      CASE WHEN r.is_reversal THEN 'A platform took money back from a sealed week over 7 days ago'
           ELSE 'New data after seal waiting over 14 days' END,
      jsonb_build_object('kind', r.kind, 'id', r.id, 'since', r.created_at));
  END LOOP;

  -- P1-R5: Roam rides whose tolls were not recorded (the rides hook failed).
  PERFORM toll_system.roam_gap_alerts(p_company);

  -- O1: receivable_platform in credit. Raised as 'watch'; becomes 'page' once the alert is 30 days old.
  IF toll_system.natural_balance(p_company, 'toll:receivable_platform') < 0 THEN
    PERFORM toll_system.raise_alert(p_company, 'aging',
      CASE WHEN EXISTS (SELECT 1 FROM toll.alerts a WHERE a.organization_id = p_company
                          AND a.dedupe_key = 'aging:receivable_platform_credit' AND a.resolved_at IS NULL
                          AND a.created_at < now() - interval '30 days') THEN 'page' ELSE 'watch' END,
      'aging:receivable_platform_credit', 'A platform take-back has not been netted from a payout',
      jsonb_build_object('balance', toll_system.natural_balance(p_company, 'toll:receivable_platform')));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION toll_system.company_metrics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.company_metrics(uuid) TO service_role;
REVOKE ALL ON FUNCTION toll_read.metrics() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_read.metrics() TO authenticated;
REVOKE ALL ON FUNCTION public.toll_v2_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_metrics() TO authenticated;
REVOKE ALL ON FUNCTION toll_system.roam_gap_alerts(uuid) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
