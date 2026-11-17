-- Week Reconciliation step 4 (Tag account) reads the tag top-ups and tag usage of each week from
-- the NEW toll system — the same `tagAccount` numbers the Tolls step shows (toll_system.week_result:
-- frozen for a sealed week, live otherwise). Before this, step 4 read the old fleet.toll_ledger,
-- which no longer receives tag files (14 Nov switch), so every week from 19 Oct showed 0 / 0.
--
-- One row per Monday from p_from to p_to (both included). Service key only (edge server).

CREATE OR REPLACE FUNCTION public.toll_sys_tag_account_weeks(p_company uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  w date;
  v_tag jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF extract(isodow FROM p_from) <> 1 OR extract(isodow FROM p_to) <> 1 THEN
    RAISE EXCEPTION 'week keys must be Mondays';
  END IF;
  IF p_to < p_from OR p_to - p_from > 7 * 60 THEN
    RAISE EXCEPTION 'week range must run forward and cover at most 60 weeks';
  END IF;
  w := p_from;
  WHILE w <= p_to LOOP
    -- A week sealed before the result carried tagAccount falls back to the live numbers.
    v_tag := coalesce(toll_system.week_result(p_company, w) -> 'tagAccount',
                      toll_system.week_result_live(p_company, w) -> 'tagAccount');
    v_out := v_out || jsonb_build_object(
      'weekKey', w,
      'topUpsMinor', coalesce((v_tag ->> 'topUpsMinor')::bigint, 0),
      'usageMinor', coalesce((v_tag ->> 'usageMinor')::bigint, 0));
    w := w + 7;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.toll_sys_tag_account_weeks(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toll_sys_tag_account_weeks(uuid, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
