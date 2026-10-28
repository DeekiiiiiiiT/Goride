-- settlement_amount is what is still owed after payment. A settled week
-- stores 0 there, so the Payouts check compared 0 to the money already paid.
-- Owed for a closed week is the leftover plus what was already paid.

CREATE OR REPLACE FUNCTION public.svc_finance_week_sides(p_org text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, fleet
AS $$
  SELECT jsonb_build_object(
    'closed_owed', COALESCE((
      SELECT SUM(
        GREATEST(COALESCE(settlement_amount, 0), 0)
        + GREATEST(COALESCE(settlement_paid, 0), 0)
      )
      FROM public.driver_financial_periods
      WHERE organization_id::text = p_org
        AND status = 'closed'
        AND period_anchor::text >= p_start::text
        AND period_anchor::text <= p_end::text
    ), 0),
    'bank_deposits', COALESCE((
      SELECT SUM(COALESCE(amount_received, 0))
      FROM fleet.bank_confirmations
      WHERE organization_id::text = p_org
        AND status = 'confirmed'
        AND week_start_ymd::text >= p_start::text
        AND week_start_ymd::text <= p_end::text
    ), 0),
    'bank_confirmed', EXISTS (
      SELECT 1
      FROM fleet.bank_confirmations
      WHERE organization_id::text = p_org
        AND status = 'confirmed'
        AND week_start_ymd::text >= p_start::text
        AND week_start_ymd::text <= p_end::text
    )
  )
$$;
