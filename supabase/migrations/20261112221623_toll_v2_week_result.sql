-- Toll rebuild Phase 1 P1-R1: the week's toll answer (TollWeekResultV1, design B8 / I17).
--   toll_system.week_result_live(company, week) : computed from the records, always.
--   toll_system.week_result(company, week)      : the frozen result once sealed, the live one before.
--   public.toll_v2_week_result(week)            : for signed-in users; company from the token only (B7).
-- The seal now freezes the full result (amounts_minor) and its facts hash (source_hash); check 4 recomputes it.
-- The facts hash leaves out `afterSeal` (facts arriving after a seal must not change a sealed week's hash)
-- and the per-call fields (state, weekVersion, factsHash, engineVersion).

CREATE OR REPLACE FUNCTION toll_system.week_result_live(p_company uuid, p_week date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_body jsonb;
  v_after jsonb;
BEGIN
  WITH ch AS (                                          -- the week's counted, live charges
    SELECT c.*
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  posted AS (SELECT * FROM ch WHERE state NOT IN ('duplicate', 'rejected', 'unverified')),
  al AS (                                               -- active allocations of those charges
    SELECT a.* FROM toll.allocations a JOIN posted p ON p.id = a.charge_id
    WHERE a.organization_id = p_company AND a.reversed_by IS NULL
  ),
  pb AS (                                               -- the week's active paybacks
    SELECT p.*,
           coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)::bigint
             AS unlinked_minor
    FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.week_key = p_week
  ),
  taken AS (                                            -- take-backs landing this week
    SELECT r.* FROM toll.paybacks r
    WHERE r.organization_id = p_company AND r.reversal_of IS NOT NULL AND r.week_key = p_week
      AND NOT r.is_legacy AND NOT r.after_seal
  ),
  topups AS (
    SELECT t.* FROM toll.tag_topups t WHERE t.organization_id = p_company
  ),
  tag_usage AS (                                        -- tag charges, by counted week
    SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk, c.amount_minor
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
  ),
  drivers AS (
    SELECT d.driver_id,
           coalesce((SELECT sum(a.amount_minor) FROM al a JOIN posted p ON p.id = a.charge_id
                     WHERE a.bearer = 'driver' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS owes,
           coalesce((SELECT sum(p.amount_minor) FROM posted p
                     WHERE p.paid_by = 'cash' AND p.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS fleet_owes,
           coalesce((SELECT sum(b.amount_minor) FROM pb b
                     WHERE b.received_by = 'driver' AND b.driver_id IS NOT DISTINCT FROM d.driver_id), 0)::bigint AS recovered
    FROM (SELECT driver_id FROM posted UNION SELECT driver_id FROM pb WHERE received_by = 'driver') d
    WHERE d.driver_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'contractVersion', 1,
    'companyId', p_company,
    'weekKey', p_week,
    'spend', jsonb_build_object(
      'tagMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'tag'),
      'cashMinor',  (SELECT coalesce(sum(amount_minor), 0) FROM posted WHERE paid_by = 'cash'),
      'totalMinor', (SELECT coalesce(sum(amount_minor), 0) FROM posted)),
    'bearers', jsonb_build_object(
      'platformMinor', (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'platform'),
      'driverMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'driver'),
      'fleetMinor',    (SELECT coalesce(sum(amount_minor), 0) FROM al WHERE bearer = 'fleet')),
    'pending', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'pending'),
      'amountMinor', (SELECT coalesce(sum(amount_minor - allocated_minor), 0) FROM ch WHERE state = 'pending')),
    'unverified', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'unverified'),
      'amountMinor', (SELECT coalesce(sum(amount_minor), 0) FROM ch WHERE state = 'unverified')),
    'awaitingCash', jsonb_build_object(
      'charges',     (SELECT count(*) FROM ch WHERE state = 'awaiting_cash'),
      'amountMinor', (SELECT coalesce(sum(amount_minor - allocated_minor), 0) FROM ch WHERE state = 'awaiting_cash')),
    'paybacks', jsonb_build_object(
      'receivedMinor',     (SELECT coalesce(sum(amount_minor), 0) FROM pb),
      'allocatedMinor',    (SELECT coalesce(sum(allocated_minor), 0) FROM pb),
      'unallocatedMinor',  (SELECT coalesce(sum(greatest(amount_minor - allocated_minor - unlinked_minor, 0)), 0) FROM pb),
      'leftUnlinkedMinor', (SELECT coalesce(sum(unlinked_minor), 0) FROM pb),
      'takenBackMinor',    (SELECT coalesce(sum(amount_minor), 0) FROM taken)),
    'carriedIn', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'kind', f.kind, 'id', f.original_id, 'fromWeekKey', f.from_week, 'amountMinor', f.amount_minor,
                    'bearer', f.bearer) ORDER BY f.created_at, f.id), '[]'::jsonb)
                  FROM toll.carried_facts f WHERE f.organization_id = p_company AND f.to_week = p_week),
    'tagAccount', jsonb_build_object(
      'openingMinor', (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key < p_week)
                    - (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk < p_week),
      'topUpsMinor',  (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key = p_week),
      'usageMinor',   (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk = p_week),
      'closingMinor', (SELECT coalesce(sum(amount_minor), 0) FROM topups WHERE week_key <= p_week)
                    - (SELECT coalesce(sum(amount_minor), 0) FROM tag_usage WHERE wk <= p_week)),
    'drivers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'driverId', driver_id, 'owesFleetMinor', owes, 'fleetOwesMinor', fleet_owes,
                  'recoveredInPassengerCashMinor', recovered) ORDER BY driver_id), '[]'::jsonb)
                FROM drivers),
    -- bank movements dated in this week (debit bank = money in, credit bank = money out), for Business Finance
    'ledgerMovements', jsonb_build_object('bankMinor', (
      SELECT coalesce(sum(
        CASE WHEN e.metadata ->> 'toll_rule' ~ '^P(11|12|14)_' THEN 1 ELSE -1 END
        * CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -1 ELSE 1 END
        * e.amount_minor), 0)
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
        AND e.metadata ->> 'toll_rule' ~ '^P(1|11|12|13|14)_'
        AND (e.metadata ->> 'toll_week')::date = p_week))
  ) INTO v_body;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'arrivedAt', x ->> 'id'), '[]'::jsonb) INTO v_after
  FROM (
    SELECT jsonb_build_object('kind', 'charge', 'id', c.id, 'amountMinor', c.amount_minor,
                              'arrivedAt', c.created_at, 'relatedWeekKey', c.week_key) AS x
    FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.week_key = p_week
    UNION ALL
    SELECT jsonb_build_object('kind', CASE WHEN p.reversal_of IS NULL THEN 'payback' ELSE 'reversal' END, 'id', p.id,
                              'amountMinor', p.amount_minor, 'arrivedAt', p.created_at,
                              'relatedWeekKey', coalesce(o.week_key, p.week_key))
    FROM toll.paybacks p
    LEFT JOIN toll.paybacks o ON o.organization_id = p.organization_id AND o.id = p.reversal_of
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
      AND coalesce(o.week_key, p.week_key) = p_week
  ) s;

  RETURN v_body
         || jsonb_build_object('afterSeal', v_after,
                               'state', 'open',
                               'weekVersion', toll_system.week_version(p_company, p_week),
                               -- the week's own facts only: the tag opening / closing depend on earlier weeks,
                               -- which may still be open when this week is sealed
                               'factsHash', md5((v_body #- '{tagAccount,openingMinor}' #- '{tagAccount,closingMinor}')::text),
                               'engineVersion', 'toll_v2_phase1');
END;
$$;

-- The one answer to "how much this week" (I17): the frozen result once sealed, the live result before.
CREATE OR REPLACE FUNCTION toll_system.week_result(p_company uuid, p_week date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ledger.week_statements%ROWTYPE;
  v_live jsonb;
BEGIN
  SELECT * INTO v_row FROM ledger.week_statements ws
  WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*' AND ws.week_key = p_week
  ORDER BY ws.version DESC LIMIT 1;

  IF FOUND AND v_row.status = 'closed' AND v_row.amounts_minor ? 'contractVersion' THEN
    -- the frozen answer; afterSeal is always current (listed beside it, never folded in)
    v_live := toll_system.week_result_live(p_company, p_week);
    RETURN v_row.amounts_minor
           || jsonb_build_object('state', 'sealed', 'weekVersion', v_row.version,
                                 'factsHash', v_row.source_hash, 'afterSeal', v_live -> 'afterSeal');
  END IF;
  RETURN toll_system.week_result_live(p_company, p_week);
END;
$$;

-- The week summary and hash used by the seal and check 4 now come from the full result.
CREATE OR REPLACE FUNCTION toll_system.week_summary(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT toll_system.week_result_live(p_company, p_week) - 'afterSeal' - 'state' - 'weekVersion' - 'factsHash' - 'engineVersion';
$$;

CREATE OR REPLACE FUNCTION toll_system.week_hash(p_company uuid, p_week date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT toll_system.week_result_live(p_company, p_week) ->> 'factsHash';
$$;

-- Who may READ tolls for a company: toll.view = owner, fleet manager, fleet accountant
-- (packages/auth-client/src/permissions.ts; viewers and drivers do not). Mirrors user_can_manage_tolls.
CREATE OR REPLACE FUNCTION toll_system.user_can_view_tolls(p_user uuid, p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT toll_system.user_can_manage_tolls(p_user, p_company) OR EXISTS (
    SELECT 1
    FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user AND ur.scope_type = 'organization' AND ur.scope_id = p_company
      AND ur.status = 'active' AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND r.name = 'fleet_accountant'
  );
$$;

-- For signed-in users: the company comes from the token only (B7); no company parameter.
CREATE OR REPLACE FUNCTION toll_read.week_result(p_week date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := toll_read.current_company();
BEGIN
  IF v_company IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'NO_COMPANY', DETAIL = '{}', ERRCODE = 'P0001';
  END IF;
  IF NOT toll_system.user_can_view_tolls(auth.uid(), v_company) THEN
    RAISE EXCEPTION USING MESSAGE = 'FORBIDDEN', DETAIL = '{"permission":"toll.view"}', ERRCODE = 'P0001';
  END IF;
  IF p_week IS NULL OR p_week <> date_trunc('week', p_week)::date THEN
    RAISE EXCEPTION USING MESSAGE = 'BAD_REQUEST', DETAIL = '{"week_key":"must be a Monday (ADR 0007)"}', ERRCODE = 'P0001';
  END IF;
  RETURN toll_system.week_result(v_company, p_week);
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_v2_week_result(p_week date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT toll_read.week_result(p_week); $$;

-- Grants (B7): users only through public.toll_v2_week_result; toll_system closed.
REVOKE ALL ON FUNCTION toll_system.week_result_live(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_result(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.week_result(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION toll_system.user_can_view_tolls(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_read.week_result(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_read.week_result(date) TO authenticated;
REVOKE ALL ON FUNCTION public.toll_v2_week_result(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_week_result(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
