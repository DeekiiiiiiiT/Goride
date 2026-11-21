-- Owner, 21 Nov 2026: saving toll settings needs no reason and no second manager.
-- change_toll_settings and approve_settings_seed no longer go through four-eyes; every other rule
-- (Lost, Undo and Refund received above J$5,000, reopen week) is unchanged.
CREATE OR REPLACE FUNCTION toll_write.approval_requires_four_eyes(p_company uuid, p_intent text, p_body jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_on boolean;
  v_amt bigint;
BEGIN
  IF p_intent IN ('change_toll_settings', 'approve_settings_seed') THEN
    RETURN false;
  END IF;
  v_on := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  IF NOT v_on THEN RETURN false; END IF;
  v_amt := toll_write.approval_amount(p_company, p_intent, p_body);
  IF v_amt IS NULL THEN RETURN false; END IF;
  IF v_amt = -1 THEN RETURN true; END IF;
  RETURN v_amt > 500000;
END;
$$;
REVOKE ALL ON FUNCTION toll_write.approval_requires_four_eyes(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
