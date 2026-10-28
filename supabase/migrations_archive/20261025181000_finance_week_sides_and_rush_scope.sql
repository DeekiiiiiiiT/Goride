-- Week checks need two real sources, and courier money must stay on this fleet.
-- Rush lines have no fleet column; they hang off the delivery order.

CREATE OR REPLACE FUNCTION public.svc_rush_fleet_week_money(p_org text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = rush_money, delivery, public
AS $$
  SELECT jsonb_build_object(
    'courier_in', COALESCE(SUM(CASE WHEN a.kind = 'platform_revenue' THEN l.amount_minor ELSE 0 END), 0),
    'courier_out', COALESCE(SUM(CASE WHEN a.kind IN ('platform_cost', 'cod_clearing') THEN abs(l.amount_minor) ELSE 0 END), 0)
  )
  FROM rush_money.lines l
  JOIN rush_money.journals j ON j.id = l.journal_id
  JOIN rush_money.accounts a ON a.id = l.account_id
  JOIN delivery.orders o ON o.id = j.order_id
  WHERE o.courier_fleet_id::text = p_org
    AND j.created_at >= p_start::timestamptz
    AND j.created_at < (p_end + 1)::timestamptz
$$;

CREATE OR REPLACE FUNCTION public.svc_finance_week_sides(p_org text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, fleet
AS $$
  SELECT jsonb_build_object(
    'closed_owed', COALESCE((
      SELECT SUM(GREATEST(COALESCE(settlement_amount, 0), 0))
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

GRANT EXECUTE ON FUNCTION public.svc_rush_fleet_week_money(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_finance_week_sides(text, date, date) TO service_role;

-- Copy posted Hub bills that never landed in the bill book. Safe to re-run.
INSERT INTO fleet.expense_bills (id, organization_id, bill_date, amount, self_approved, status)
SELECT
  COALESCE(k.value->>'id', substring(k.key from 13)),
  COALESCE(k.value->>'organizationId', k.value->>'organization_id', ''),
  COALESCE(left(k.value->>'incurredDate', 10), left(k.value->>'incurred_date', 10), CURRENT_DATE::text)::date,
  COALESCE(NULLIF(k.value->>'netAmount', '')::numeric, NULLIF(k.value->>'net_amount', '')::numeric, 0),
  COALESCE((k.value->>'selfApproved')::boolean, false),
  'posted'
FROM public.kv_store_37f42386 k
WHERE k.key LIKE 'expense_doc:%'
  AND k.value->>'status' IN ('posted', 'partially_paid', 'paid', 'approved')
  AND COALESCE(k.value->>'id', substring(k.key from 13)) <> ''
ON CONFLICT (id) DO NOTHING;

INSERT INTO fleet.expense_bill_lines (id, bill_id, account, direction, amount)
SELECT b.id || ':debit', b.id, 'expense', 'debit', b.amount
FROM fleet.expense_bills b
WHERE NOT EXISTS (SELECT 1 FROM fleet.expense_bill_lines l WHERE l.bill_id = b.id)
  AND b.amount >= 0
UNION ALL
SELECT b.id || ':credit', b.id, 'accounts_payable', 'credit', b.amount
FROM fleet.expense_bills b
WHERE NOT EXISTS (SELECT 1 FROM fleet.expense_bill_lines l WHERE l.bill_id = b.id)
  AND b.amount >= 0;
