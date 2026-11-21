-- Owner, 21 Nov 2026: how Uber / InDrive / Roam pay tolls back is one Roam-wide list, edited by Roam staff
-- in Roam Fleet Admin (roamfleet.co/admin → Toll platforms). Fleets no longer see or change it, and toll
-- prices are no longer set in Fleet (Dominion holds plaza prices). In Fleet → Policy → Tolls a company keeps
-- only "When a dispute doesn't work out" (dispute_policy).
--
-- toll.platform_defaults is the list. Every company's toll.platform_settings row is kept equal to it:
-- on save (all companies), on company setup (new companies) and before each matcher run (self-setup).

-- 1. The Roam-wide list ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS toll.platform_defaults (
  platform text PRIMARY KEY,
  pays_tolls_back boolean NOT NULL DEFAULT true,
  payback_mode text NOT NULL CHECK (payback_mode IN ('per_trip', 'adjustments', 'none', 'native', 'rider_pays_driver')),
  takes_disputes boolean NOT NULL DEFAULT false,
  dispute_window_days int CHECK (dispute_window_days IS NULL OR dispute_window_days BETWEEN 1 AND 60),
  refund_periods int CHECK (refund_periods IS NULL OR refund_periods > 0),
  no_report_fallback_days int CHECK (no_report_fallback_days IS NULL OR no_report_fallback_days > 0),
  coverage_source_id text,
  auto_apply boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT platform_defaults_takes_disputes_fields CHECK (
    NOT takes_disputes
    OR (dispute_window_days IS NOT NULL AND refund_periods IS NOT NULL AND no_report_fallback_days IS NOT NULL))
);
REVOKE ALL ON toll.platform_defaults FROM PUBLIC, anon, authenticated;
ALTER TABLE toll.platform_defaults ENABLE ROW LEVEL SECURITY;

INSERT INTO toll.platform_defaults (platform, pays_tolls_back, payback_mode, takes_disputes,
  dispute_window_days, refund_periods, no_report_fallback_days, coverage_source_id, auto_apply)
VALUES
  ('uber',    true,  'per_trip',          true,  9,    2,    23,   'uber_bundle', false),
  ('indrive', false, 'rider_pays_driver', false, NULL, NULL, NULL, NULL,          false),
  ('roam',    true,  'native',            false, NULL, NULL, NULL, NULL,          false)
ON CONFLICT (platform) DO NOTHING;

-- 2. Keep one company equal to the list ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.apply_platform_defaults(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company IS NULL THEN RETURN; END IF;
  INSERT INTO toll.platform_settings (organization_id, platform, pays_tolls_back, payback_mode, takes_disputes,
    dispute_window_days, refund_periods, no_report_fallback_days, coverage_source_id, auto_apply)
  SELECT p_company, d.platform, d.pays_tolls_back, d.payback_mode, d.takes_disputes,
         d.dispute_window_days, d.refund_periods, d.no_report_fallback_days, d.coverage_source_id, d.auto_apply
  FROM toll.platform_defaults d
  ON CONFLICT (organization_id, platform) DO UPDATE SET
    pays_tolls_back = EXCLUDED.pays_tolls_back,
    payback_mode = EXCLUDED.payback_mode,
    takes_disputes = EXCLUDED.takes_disputes,
    dispute_window_days = EXCLUDED.dispute_window_days,
    refund_periods = EXCLUDED.refund_periods,
    no_report_fallback_days = EXCLUDED.no_report_fallback_days,
    coverage_source_id = EXCLUDED.coverage_source_id,
    auto_apply = EXCLUDED.auto_apply,
    updated_at = now()
  WHERE (toll.platform_settings.pays_tolls_back, toll.platform_settings.payback_mode,
         toll.platform_settings.takes_disputes, toll.platform_settings.dispute_window_days,
         toll.platform_settings.refund_periods, toll.platform_settings.no_report_fallback_days,
         toll.platform_settings.coverage_source_id, toll.platform_settings.auto_apply)
        IS DISTINCT FROM
        (EXCLUDED.pays_tolls_back, EXCLUDED.payback_mode, EXCLUDED.takes_disputes, EXCLUDED.dispute_window_days,
         EXCLUDED.refund_periods, EXCLUDED.no_report_fallback_days, EXCLUDED.coverage_source_id, EXCLUDED.auto_apply);
END;
$$;
REVOKE ALL ON FUNCTION toll_system.apply_platform_defaults(uuid) FROM PUBLIC, anon, authenticated, service_role;

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
  PERFORM toll_system.apply_platform_defaults(p_company);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_missing jsonb;
BEGIN
  -- Self-setup: dispute policy, dispute text and plaza rules for anything new; platforms from the Roam list.
  PERFORM toll_system.seed_dispute_setup(p_company, false);
  PERFORM toll_system.apply_platform_defaults(p_company);
  v_missing := toll_system.settings_missing_list(p_company);
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION toll_system.match_refuse_missing_settings(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- every company now
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT x.organization_id AS id FROM (
    SELECT s.organization_id FROM toll.switch_state s
    UNION SELECT ps.organization_id FROM toll.platform_settings ps) x
  LOOP
    PERFORM toll_system.apply_platform_defaults(r.id);
  END LOOP;
END;
$$;

-- 3. Roam Fleet Admin read / save (server route only: service_role) --------------------------------------
CREATE OR REPLACE FUNCTION public.toll_sys_platform_defaults()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('platforms', coalesce(jsonb_agg(jsonb_build_object(
      'platform', d.platform, 'paysTollsBack', d.pays_tolls_back, 'paybackMode', d.payback_mode,
      'takesDisputes', d.takes_disputes, 'disputeWindowDays', d.dispute_window_days,
      'refundPeriods', d.refund_periods, 'noReportFallbackDays', d.no_report_fallback_days,
      'updatedAt', d.updated_at)
    ORDER BY CASE d.platform WHEN 'uber' THEN 0 WHEN 'indrive' THEN 1 WHEN 'roam' THEN 2 ELSE 3 END, d.platform), '[]'::jsonb))
  FROM toll.platform_defaults d;
$$;
REVOKE ALL ON FUNCTION public.toll_sys_platform_defaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_platform_defaults() TO service_role;

-- p_rows: [{platform, paysTollsBack?, paybackMode?, takesDisputes?, disputeWindowDays?}]
CREATE OR REPLACE FUNCTION public.toll_sys_platform_defaults_save(p_rows jsonb, p_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r       jsonb;
  d       toll.platform_defaults%ROWTYPE;
  v_old   jsonb;
  v_mode  text;
  v_takes boolean;
  v_days  int;
  v_co    record;
  v_n     int := 0;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = 'platforms must be a non-empty list', ERRCODE = 'P0001';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO d FROM toll.platform_defaults x WHERE x.platform = r ->> 'platform' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = 'unknown platform ' || coalesce(r ->> 'platform', '?'), ERRCODE = 'P0001';
    END IF;
    v_old := to_jsonb(d);
    v_mode := coalesce(r ->> 'paybackMode', d.payback_mode);
    IF v_mode NOT IN ('per_trip', 'adjustments', 'none', 'native', 'rider_pays_driver') THEN
      RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = 'unknown way of paying back ' || v_mode, ERRCODE = 'P0001';
    END IF;
    v_takes := coalesce((r ->> 'takesDisputes')::boolean, d.takes_disputes);
    v_days := CASE WHEN r ? 'disputeWindowDays' THEN nullif(r ->> 'disputeWindowDays', '')::int ELSE d.dispute_window_days END;
    IF v_takes AND (v_days IS NULL OR v_days < 1 OR v_days > 60) THEN
      RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = 'days to dispute must be 1 to 60', ERRCODE = 'P0001';
    END IF;
    UPDATE toll.platform_defaults x SET
      pays_tolls_back = coalesce((r ->> 'paysTollsBack')::boolean, d.pays_tolls_back),
      payback_mode = v_mode,
      takes_disputes = v_takes,
      dispute_window_days = v_days,
      refund_periods = CASE WHEN v_takes THEN coalesce(d.refund_periods, 2) ELSE d.refund_periods END,
      no_report_fallback_days = CASE WHEN v_takes THEN coalesce(d.no_report_fallback_days, 23) ELSE d.no_report_fallback_days END,
      coverage_source_id = CASE WHEN v_takes AND x.platform = 'uber' THEN coalesce(d.coverage_source_id, 'uber_bundle')
                                ELSE d.coverage_source_id END,
      updated_at = now(), updated_by = p_by
    WHERE x.platform = d.platform;
    INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
    SELECT NULL, 'toll.platform_defaults', d.platform, 'update', v_old, to_jsonb(x), p_by
    FROM toll.platform_defaults x WHERE x.platform = d.platform;
  END LOOP;

  FOR v_co IN SELECT DISTINCT x.organization_id AS id FROM (
    SELECT s.organization_id FROM toll.switch_state s
    UNION SELECT ps.organization_id FROM toll.platform_settings ps) x
  LOOP
    PERFORM toll_system.apply_platform_defaults(v_co.id);
    v_n := v_n + 1;
  END LOOP;

  RETURN public.toll_sys_platform_defaults() || jsonb_build_object('companiesUpdated', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.toll_sys_platform_defaults_save(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_platform_defaults_save(jsonb, uuid) TO service_role;

-- 4. Fleet may change only "who pays" (dispute_policy) ----------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_change_toll_settings(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k        text;
  v_obj    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_body) LOOP
    CONTINUE WHEN k IN ('reason_code', 'note', 'command_id', 'self_approval_reason', 'dispute_policy');
    IF k IN ('platform_settings', 'plaza_rates_add') THEN
      PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('key', k,
        'message', CASE k WHEN 'platform_settings' THEN 'Platform rules are set by Roam for every fleet.'
                          ELSE 'Toll prices are kept in Dominion.' END));
    END IF;
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('unknown_key', k));
  END LOOP;
  IF NOT p_body ? 'dispute_policy' THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', 'dispute_policy'));
  END IF;

  v_obj := p_body -> 'dispute_policy';
  IF jsonb_typeof(v_obj) <> 'object' THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('dispute_policy', 'object'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    INSERT INTO toll.dispute_policy (organization_id) VALUES (p_company);
  END IF;
  SELECT to_jsonb(dp) INTO v_before FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
  UPDATE toll.dispute_policy dp SET
    lost_bearer = CASE WHEN v_obj ? 'lost_bearer' THEN v_obj ->> 'lost_bearer' ELSE dp.lost_bearer END,
    expired_bearer = CASE WHEN v_obj ? 'expired_bearer' THEN v_obj ->> 'expired_bearer' ELSE dp.expired_bearer END,
    changed_by = auth.uid(), changed_at = now()
  WHERE dp.organization_id = p_company;
  SELECT to_jsonb(dp) INTO v_after FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
  VALUES (p_company, 'toll.dispute_policy', p_company::text, 'update', v_before, v_after, auth.uid());
  v_changes := jsonb_build_array(jsonb_build_object(
    'table', 'toll.dispute_policy', 'row_key', p_company::text, 'before', v_before, 'after', v_after));

  RETURN jsonb_build_object('decision_id', p_decision, 'changed', v_before IS DISTINCT FROM v_after,
                            'changes', v_changes);
END;
$$;
REVOKE ALL ON FUNCTION toll_write.intent_change_toll_settings(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
