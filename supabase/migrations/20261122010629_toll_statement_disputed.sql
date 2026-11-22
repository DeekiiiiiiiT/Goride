-- Found in the owner's first live close (week of 9 Nov 2026): step 3 would not complete after the seal because the
-- close check TOLL_IDENTITY_UNBALANCED (Spend − Reimbursed − ChargedToDriver − NetLoss) was J$150 out — the open
-- disputes still owed by Uber, which the driver toll statement had no field for. The statement now carries
-- 'disputed' (finance-core subtracts it), and sealed weeks with open disputes are republished once.

CREATE OR REPLACE FUNCTION toll_system.publish_driver_toll_statements(p_company uuid, p_week date, p_status text, p_actor text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result  jsonb := toll_system.week_result(p_company, p_week);
  d         record;
  v_line    jsonb;
  v_amounts jsonb;
  v_prior_closed uuid;
  v_next    int;
  v_n       int := 0;
BEGIN
  IF p_status NOT IN ('closed', 'draft') THEN RAISE EXCEPTION 'BAD_REQUEST: status closed or draft'; END IF;
  FOR d IN
    SELECT DISTINCT x.driver_id FROM (
      SELECT dfp.driver_id::text AS driver_id FROM public.driver_financial_periods dfp
      WHERE dfp.organization_id = p_company AND dfp.period_anchor = p_week
      UNION
      SELECT l ->> 'driverId' FROM jsonb_array_elements(coalesce(v_result -> 'drivers', '[]'::jsonb)) l
    ) x WHERE x.driver_id IS NOT NULL AND x.driver_id <> '' AND x.driver_id <> '*'
  LOOP
    v_line := NULL;
    SELECT l INTO v_line FROM jsonb_array_elements(coalesce(v_result -> 'drivers', '[]'::jsonb)) l
    WHERE l ->> 'driverId' = d.driver_id LIMIT 1;
    v_amounts := jsonb_build_object(
      'totalSpend',      coalesce((v_line ->> 'spendMinor')::bigint, 0),
      'chargedToDriver', coalesce((v_line ->> 'owesFleetMinor')::bigint, 0),
      'reimbursed',      coalesce((v_line ->> 'platformMinor')::bigint, 0),
      'netLoss',         coalesce((v_line ->> 'fleetMinor')::bigint, 0),
      'cashWashSpend',   coalesce((v_line ->> 'fleetOwesMinor')::bigint, 0),
      'tagSpend',        coalesce((v_line ->> 'tagSpendMinor')::bigint, 0),
      -- what Uber still owes for this driver-week on open disputes (provisional), so the close identity ties
      'disputed',        coalesce((
        SELECT sum(a.amount_minor) FROM toll.allocations a
        JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
        WHERE a.organization_id = p_company AND a.reversed_by IS NULL AND a.provisional AND a.bearer = 'platform'
          AND a.dispute_id IS NOT NULL AND c.driver_id = d.driver_id AND NOT c.is_legacy
          AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week), 0));
    SELECT coalesce(max(ws.version), 0) + 1 INTO v_next FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.driver_id = d.driver_id AND ws.week_key = p_week AND ws.kind = 'toll';
    SELECT ws.id INTO v_prior_closed FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.driver_id = d.driver_id AND ws.week_key = p_week
      AND ws.kind = 'toll' AND ws.status = 'closed' ORDER BY ws.version DESC LIMIT 1;
    INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status, amounts_minor,
                                        source_row_ids, source_hash, engine_version, closed_at, closed_by, close_reason,
                                        supersedes)
    VALUES ('toll', p_company, d.driver_id, p_week, v_next, p_status, v_amounts, '[]'::jsonb,
            md5(v_amounts::text || ':' || coalesce(v_result ->> 'factsHash', '')), 'toll_v2_phase1',
            CASE WHEN p_status = 'closed' THEN now() END, CASE WHEN p_status = 'closed' THEN p_actor END,
            CASE WHEN p_status = 'closed' THEN 'toll_v2_seal' END, v_prior_closed);
    IF p_status = 'closed' AND v_prior_closed IS NOT NULL THEN
      UPDATE ledger.week_statements SET status = 'restated' WHERE id = v_prior_closed;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION toll_system.publish_driver_toll_statements(uuid, date, text, text) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ws.organization_id AS org, ws.week_key AS wk
    FROM ledger.week_statements ws
    WHERE ws.kind = 'toll' AND ws.status = 'closed' AND NOT (ws.amounts_minor ? 'disputed')
      AND toll_system.week_is_sealed(ws.organization_id, ws.week_key)
      AND EXISTS (
        SELECT 1 FROM toll.allocations a
        JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
        WHERE a.organization_id = ws.organization_id AND a.reversed_by IS NULL AND a.provisional
          AND a.bearer = 'platform' AND a.dispute_id IS NOT NULL AND NOT c.is_legacy
          AND toll_system.charge_counted_week(ws.organization_id, c.id, c.week_key) = ws.week_key)
  LOOP
    PERFORM toll_system.publish_driver_toll_statements(r.org, r.wk, 'closed', 'migration:20261122010629');
  END LOOP;
END;
$$;
