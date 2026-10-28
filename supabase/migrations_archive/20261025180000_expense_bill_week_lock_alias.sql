-- The lock check named its variable week_start, same as the column.
-- Postgres rejected every payment and void as ambiguous. Production already
-- has the broken functions, so this replacement is what fixes live.

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

CREATE OR REPLACE FUNCTION fleet.record_expense_payment(
  p_org text,
  p_payment_id text,
  p_bill_id text,
  p_amount numeric,
  p_payment_date date,
  p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  owed numeric;
  paid numeric;
  v_week date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM fleet.expense_bill_payments WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN;
  END IF;
  v_week := p_payment_date - ((EXTRACT(ISODOW FROM p_payment_date)::int - 1));
  IF EXISTS (
    SELECT 1 FROM fleet.finance_period_locks AS locks
    WHERE locks.organization_id = p_org AND locks.week_start = v_week
  ) THEN
    RAISE EXCEPTION 'week locked';
  END IF;
  SELECT amount INTO owed FROM fleet.expense_bills WHERE id = p_bill_id AND organization_id = p_org FOR UPDATE;
  IF owed IS NULL THEN
    RAISE EXCEPTION 'bill not found';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM fleet.expense_bill_payments WHERE bill_id = p_bill_id;
  IF p_amount > owed - paid + 0.001 THEN
    RAISE EXCEPTION 'overpay';
  END IF;
  INSERT INTO fleet.expense_bill_payments (id, organization_id, bill_id, amount, payment_date, idempotency_key)
  VALUES (p_payment_id, p_org, p_bill_id, p_amount, p_payment_date, p_idempotency_key);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.void_expense_bill(p_org text, p_bill_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill_date date;
  v_week date;
BEGIN
  SELECT b.bill_date INTO v_bill_date FROM fleet.expense_bills b
  WHERE b.id = p_bill_id AND b.organization_id = p_org FOR UPDATE;
  IF v_bill_date IS NULL THEN
    RAISE EXCEPTION 'bill not found';
  END IF;
  v_week := v_bill_date - ((EXTRACT(ISODOW FROM v_bill_date)::int - 1));
  IF EXISTS (
    SELECT 1 FROM fleet.finance_period_locks AS locks
    WHERE locks.organization_id = p_org AND locks.week_start = v_week
  ) THEN
    RAISE EXCEPTION 'week locked';
  END IF;
  UPDATE fleet.expense_bills SET status = 'voided' WHERE id = p_bill_id;
END;
$$;
