-- Toll disputes round P, done-test 5b: a dispute that opens late (the Uber report came after the 9-day window)
-- opens straight as expired with the fleet's allocation, but `bearer` and `posted_in_week_key` were left empty.
-- The money was right; the screens were not: the result never listed in "Results this week" (it filters on
-- posted_in_week_key), its chip read "Expired · decided" instead of "fleet pays", and the "earlier weeks:
-- fleet pays" line left it out. Record both, exactly as dispute_expire does for a normal expiry.
-- Forward only: nothing is live (the toll_disputes switch is off on every live company).

CREATE OR REPLACE FUNCTION toll_system.dispute_apply_fleet_open_late(
  p_company uuid, p_dispute uuid, p_charge uuid, p_amount bigint, p_decision uuid, p_cmd text, p_line integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM toll_system.dispute_insert_allocation(
    p_company, p_charge, 'fleet', p_amount, NULL, false, p_dispute, 'opened_late', p_decision, p_cmd, p_line);
  -- The fleet bears a late-opened dispute (never the driver, T2); its result belongs to the week the money landed in.
  UPDATE toll.disputes d
  SET bearer = 'fleet',
      posted_in_week_key = toll_system.dispute_result_week(p_company, d.id, d.posted_in_week_key)
  WHERE d.organization_id = p_company AND d.id = p_dispute AND d.bearer IS NULL;
  RETURN p_line;
END;
$$;

REVOKE ALL ON FUNCTION toll_system.dispute_apply_fleet_open_late(uuid, uuid, uuid, bigint, uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
