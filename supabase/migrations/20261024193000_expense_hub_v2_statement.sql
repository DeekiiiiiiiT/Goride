-- Expense Hub v2: one transaction for a bill, its payment, and the weekly statement lines.
-- Closed weeks are locked. A second tap with the same key does not pay twice.

CREATE TABLE IF NOT EXISTS fleet.expense_coverage_periods (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  contract_id text NOT NULL,
  vendor_name text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  premium numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_coverage_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS fleet.expense_bills (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  coverage_id text,
  status text NOT NULL DEFAULT 'posted',
  bill_date date NOT NULL,
  amount numeric NOT NULL,
  self_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.expense_bill_lines (
  id text PRIMARY KEY,
  bill_id text NOT NULL REFERENCES fleet.expense_bills (id),
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount numeric NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS fleet.expense_bill_payments (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  bill_id text NOT NULL REFERENCES fleet.expense_bills (id),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS fleet.finance_period_locks (
  organization_id text NOT NULL,
  week_start date NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, week_start)
);

CREATE TABLE IF NOT EXISTS fleet.finance_period_lines (
  organization_id text NOT NULL,
  service_line text NOT NULL,
  line_date date NOT NULL,
  line_code text NOT NULL,
  amount numeric NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, service_line, line_date, line_code)
);

CREATE TABLE IF NOT EXISTS fleet.finance_statement_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  line_date date NOT NULL,
  line_code text NOT NULL,
  stored_amount numeric NOT NULL,
  recomputed_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fleet.coverage_overlaps(
  p_contract text,
  p_start date,
  p_end date,
  p_except text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM fleet.expense_coverage_periods c
    WHERE c.contract_id = p_contract
      AND (p_except IS NULL OR c.id <> p_except)
      AND daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')
  );
$$;

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
  week_start date;
BEGIN
  week_start := p_bill_date - ((EXTRACT(ISODOW FROM p_bill_date)::int - 1));
  IF EXISTS (
    SELECT 1 FROM fleet.finance_period_locks
    WHERE organization_id = p_org AND week_start = week_start
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
  week_start date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM fleet.expense_bill_payments WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN;
  END IF;
  week_start := p_payment_date - ((EXTRACT(ISODOW FROM p_payment_date)::int - 1));
  IF EXISTS (
    SELECT 1 FROM fleet.finance_period_locks
    WHERE organization_id = p_org AND week_start = week_start
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

-- Spread a prepaid premium through today. Future days stay unposted.
CREATE OR REPLACE FUNCTION fleet.recognise_coverage_through_today(p_today date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted integer := 0;
  cov record;
  day date;
  daily numeric;
  days integer;
BEGIN
  FOR cov IN SELECT * FROM fleet.expense_coverage_periods LOOP
    days := (cov.end_date - cov.start_date) + 1;
    IF days <= 0 THEN CONTINUE; END IF;
    daily := round(cov.premium / days, 2);
    day := cov.start_date;
    WHILE day <= LEAST(cov.end_date, p_today) LOOP
      INSERT INTO fleet.finance_period_lines (
        organization_id, service_line, line_date, line_code, amount, source
      ) VALUES (
        cov.organization_id, 'rideshare', day, 'prepaid:' || cov.id, daily, 'coverage'
      )
      ON CONFLICT (organization_id, service_line, line_date, line_code)
      DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
      inserted := inserted + 1;
      day := day + 1;
    END LOOP;
  END LOOP;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.finance_statement_drift(p_today date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer := 0;
BEGIN
  INSERT INTO fleet.finance_statement_alerts (organization_id, line_date, line_code, stored_amount, recomputed_amount)
  SELECT l.organization_id, l.line_date, l.line_code, l.amount, round(c.premium / ((c.end_date - c.start_date) + 1), 2)
  FROM fleet.finance_period_lines l
  JOIN fleet.expense_coverage_periods c ON l.line_code = 'prepaid:' || c.id
  WHERE l.line_date <= p_today
    AND abs(l.amount - round(c.premium / ((c.end_date - c.start_date) + 1), 2)) > 0.01;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('finance-statement-drift-nightly');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'finance-statement-drift-nightly',
      '15 4 * * *',
      $job$
      SELECT fleet.recognise_coverage_through_today(CURRENT_DATE);
      SELECT fleet.finance_statement_drift(CURRENT_DATE);
      $job$
    );
  END IF;
END;
$cron$;
