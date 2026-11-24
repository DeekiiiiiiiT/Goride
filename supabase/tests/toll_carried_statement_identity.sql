-- Carried toll statement identity: chargedToDriver − carriedOwesMinor ties Spend − Reimbursed − NetLoss − Disputed.
-- week_result_live carriedOwesMinor must equal the sum of the three carried parts.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._toll_assert_amounts_carried_identity(p_amt jsonb, p_label text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_charged bigint;
  v_carried bigint;
  v_parts    bigint;
  v_residual bigint;
BEGIN
  v_charged := coalesce((p_amt ->> 'chargedToDriver')::bigint, 0);
  v_carried := coalesce((p_amt ->> 'carriedOwesMinor')::bigint, 0);
  v_parts := coalesce((p_amt ->> 'carriedDisputeToDriver')::bigint, 0)
           + coalesce((p_amt ->> 'carriedTakeBackToDriver')::bigint, 0)
           + coalesce((p_amt ->> 'carriedCorrectionCashToDriver')::bigint, 0);
  IF v_carried IS DISTINCT FROM v_parts THEN
    RAISE EXCEPTION '%: carriedOwesMinor % <> parts %', p_label, v_carried, v_parts;
  END IF;
  v_residual := (v_charged - v_carried)
    - (coalesce((p_amt ->> 'totalSpend')::bigint, 0)
       - coalesce((p_amt ->> 'reimbursed')::bigint, 0)
       - coalesce((p_amt ->> 'netLoss')::bigint, 0)
       - coalesce((p_amt ->> 'disputed')::bigint, 0));
  IF v_residual <> 0 THEN
    RAISE EXCEPTION '%: identity residual %', p_label, v_residual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._toll_assert_live_carried_parts(
  p_org uuid, p_week date, p_driver text, p_label text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  d       jsonb;
  v_parts bigint;
  v_owes  bigint;
BEGIN
  SELECT l INTO d
  FROM jsonb_array_elements(toll_system.week_result_live(p_org, p_week) -> 'drivers') l
  WHERE l ->> 'driverId' IS NOT DISTINCT FROM p_driver
  LIMIT 1;
  IF d IS NULL THEN
    RAISE EXCEPTION '%: no driver line in week_result_live', p_label;
  END IF;
  v_parts := coalesce((d ->> 'carriedDisputeToDriver')::bigint, 0)
           + coalesce((d ->> 'carriedTakeBackToDriver')::bigint, 0)
           + coalesce((d ->> 'carriedCorrectionCashToDriver')::bigint, 0);
  IF coalesce((d ->> 'carriedOwesMinor')::bigint, -1) IS DISTINCT FROM v_parts THEN
    RAISE EXCEPTION '%: live carriedOwesMinor <> parts', p_label;
  END IF;
  v_owes := coalesce((d ->> 'owesFleetMinor')::bigint, 0);
  IF v_parts > 0 AND coalesce((d ->> 'carriedOwesMinor')::bigint, 0) = 0 THEN
    RAISE EXCEPTION '%: owesFleetMinor % but carried parts missing on line', p_label, v_owes;
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM pg_temp._toll_assert_amounts_carried_identity(jsonb_build_object(
    'totalSpend', 1000, 'chargedToDriver', 1120, 'reimbursed', 0, 'netLoss', 0, 'disputed', 0,
    'carriedDisputeToDriver', 120, 'carriedTakeBackToDriver', 0, 'carriedCorrectionCashToDriver', 0,
    'carriedOwesMinor', 120), 'dispute-result-to-driver');

  PERFORM pg_temp._toll_assert_amounts_carried_identity(jsonb_build_object(
    'totalSpend', 5000, 'chargedToDriver', 7000, 'reimbursed', 1000, 'netLoss', 0, 'disputed', 0,
    'carriedDisputeToDriver', 0, 'carriedTakeBackToDriver', 3000, 'carriedCorrectionCashToDriver', 0,
    'carriedOwesMinor', 3000), 'take-back-driver');

  PERFORM pg_temp._toll_assert_amounts_carried_identity(jsonb_build_object(
    'totalSpend', 2000, 'chargedToDriver', 4000, 'reimbursed', 500, 'netLoss', 0, 'disputed', 0,
    'carriedDisputeToDriver', 0, 'carriedTakeBackToDriver', 0, 'carriedCorrectionCashToDriver', 2500,
    'carriedOwesMinor', 2500), 'correction-down-cash');

  PERFORM pg_temp._toll_assert_amounts_carried_identity(jsonb_build_object(
    'totalSpend', 800, 'chargedToDriver', 1000, 'reimbursed', 0, 'netLoss', 0, 'disputed', 0,
    'carriedDisputeToDriver', 200, 'carriedTakeBackToDriver', 0, 'carriedCorrectionCashToDriver', 0,
    'carriedOwesMinor', 200), 'p24-refund-back-net');

  BEGIN
    PERFORM pg_temp._toll_assert_amounts_carried_identity(jsonb_build_object(
      'totalSpend', 1000, 'chargedToDriver', 1120, 'reimbursed', 0, 'netLoss', 0, 'disputed', 0,
      'carriedDisputeToDriver', 120, 'carriedTakeBackToDriver', 0, 'carriedCorrectionCashToDriver', 0,
      'carriedOwesMinor', 0), 'root-cause-missing-carried-sum');
    RAISE EXCEPTION 'root-cause: expected failure when carried in owes but carriedOwesMinor zero';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%carriedOwesMinor%' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'toll_carried_statement_identity: ok';
END;
$$;

ROLLBACK;