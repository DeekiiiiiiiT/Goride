-- F-11 / F-18 / done-test 12: fuel rules in fuel.policy_scenarios are kept apart by company
-- (rolled back). Company B never sees or overwrites company A's rule; a body naming another
-- company is refused; the logged-out and signed-in roles can't call the functions.

BEGIN;

DO $$
DECLARE
  v_a text := 'f1a11111-1111-4111-8111-1111111111aa';
  v_b text := 'f1b11111-1111-4111-8111-1111111111bb';
  v_rule jsonb;
  v_list jsonb;
  v_refused boolean;
BEGIN
  v_rule := jsonb_build_object(
    'id', 'rule-a-1', 'name', 'Standard', 'organizationId', v_a, 'isDefault', true,
    'rules', jsonb_build_array(jsonb_build_object('category', 'Fuel', 'rideShareCoverage', 80)),
    'versions', jsonb_build_array(jsonb_build_object(
      'id', 'aaaaaaaa-0000-4000-8000-000000000001', 'effectiveFrom', '2026-11-23',
      'rules', '[]'::jsonb, 'createdAt', '2026-11-23T00:00:00Z'))
  );
  PERFORM public.fuel_policy_save(v_a, v_rule, 'tester');

  -- A reads its rule back exactly as saved (versions[] included).
  v_list := public.fuel_policy_list(v_a);
  IF jsonb_array_length(v_list) <> 1 OR v_list -> 0 <> v_rule THEN
    RAISE EXCEPTION 'company A must read back exactly its one rule, got %', v_list;
  END IF;

  -- B sees nothing of A's.
  IF jsonb_array_length(public.fuel_policy_list(v_b)) <> 0 THEN
    RAISE EXCEPTION 'company B must not see company A''s rules';
  END IF;
  IF jsonb_array_length(public.fuel_policy_list('')) <> 0 OR jsonb_array_length(public.fuel_policy_list(NULL)) <> 0 THEN
    RAISE EXCEPTION 'no company = no rules';
  END IF;

  -- B saving A's rule id is refused as "not found", and A's rule is unchanged.
  v_refused := false;
  BEGIN
    PERFORM public.fuel_policy_save(v_b, jsonb_set(v_rule, '{organizationId}', to_jsonb(v_b)), 'intruder');
  EXCEPTION WHEN OTHERS THEN
    v_refused := SQLERRM = 'FUEL_POLICY_NOT_FOUND';
  END;
  IF NOT v_refused THEN RAISE EXCEPTION 'B overwriting A''s rule id must be refused with FUEL_POLICY_NOT_FOUND'; END IF;
  IF (public.fuel_policy_list(v_a) -> 0) <> v_rule THEN
    RAISE EXCEPTION 'A''s rule must be unchanged after B''s refused save';
  END IF;

  -- A body naming another company is refused.
  v_refused := false;
  BEGIN
    PERFORM public.fuel_policy_save(v_a, jsonb_set(v_rule, '{organizationId}', to_jsonb(v_b)), 'tester');
  EXCEPTION WHEN OTHERS THEN
    v_refused := SQLERRM = 'FUEL_POLICY_WRONG_ORG';
  END;
  IF NOT v_refused THEN RAISE EXCEPTION 'a body for another company must be refused'; END IF;

  -- A can update its own rule (archive it).
  PERFORM public.fuel_policy_save(v_a, v_rule || '{"archived": true, "isDefault": false}'::jsonb, 'tester');
  IF (public.fuel_policy_list(v_a) -> 0 ->> 'archived') <> 'true' THEN
    RAISE EXCEPTION 'A must be able to archive its own rule';
  END IF;

  -- Only the service role may call the functions.
  IF has_function_privilege('anon', 'public.fuel_policy_list(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.fuel_policy_list(text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.fuel_policy_save(text, jsonb, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.fuel_policy_save(text, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fuel rule functions must not be callable by anon or authenticated';
  END IF;
  IF has_table_privilege('anon', 'fuel.policy_scenarios', 'SELECT') THEN
    RAISE EXCEPTION 'the logged-out role must not read fuel rules';
  END IF;
END;
$$;

ROLLBACK;
