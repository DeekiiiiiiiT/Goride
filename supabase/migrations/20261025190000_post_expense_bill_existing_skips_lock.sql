-- Paying a bill uses post_expense_bill first. A lock blocks a new bill in a
-- closed week. It must not block a payment made on an open day for a bill
-- that already exists.

CREATE OR REPLACE FUNCTION fleet.post_expense_bill(
  p_org text,
  p_bill_id text,
  p_coverage_id text,
  p_bill_date date,
  p_amount numeric,
  p_self_approved boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_week date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM fleet.expense_bills
    WHERE id = p_bill_id AND organization_id = p_org
  ) THEN
    RETURN;
  END IF;
  v_week := p_bill_date - ((EXTRACT(ISODOW FROM p_bill_date)::int - 1));
  IF EXISTS (
    SELECT 1 FROM fleet.finance_period_locks AS locks
    WHERE locks.organization_id = p_org AND locks.week_start = v_week
  ) THEN
    RAISE EXCEPTION 'week locked';
  END IF;
  INSERT INTO fleet.expense_bills (id, organization_id, coverage_id, bill_date, amount, self_approved)
  VALUES (p_bill_id, p_org, p_coverage_id, p_bill_date, p_amount, COALESCE(p_self_approved, false));
  INSERT INTO fleet.expense_bill_lines (id, bill_id, account, direction, amount)
  VALUES
    (p_bill_id || ':debit', p_bill_id, 'expense', 'debit', p_amount),
    (p_bill_id || ':credit', p_bill_id, 'accounts_payable', 'credit', p_amount);
END;
$$;
