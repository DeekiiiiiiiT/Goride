-- Service-only reads and writes so Plug and Fleet can leave the fleet and fuel
-- schemas off the public API. Authenticated clients get no execute grant.

CREATE OR REPLACE FUNCTION places.station_match_candidates()
RETURNS TABLE (id text, name text, payload_json jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, places
AS $$
  SELECT s.id, s.name, s.payload_json
  FROM fleet.stations s
  WHERE COALESCE(s.payload_json->>'status', '') IN ('verified', 'learnt')
  ORDER BY s.updated_at DESC
  LIMIT 1000
$$;

CREATE OR REPLACE FUNCTION places.insert_plug_learnt_station(
  p_id text,
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_brand text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, places
AS $$
BEGIN
  INSERT INTO fleet.stations (id, organization_id, name, legacy_kv_id, origin_app, payload_json)
  VALUES (
    p_id,
    NULL,
    COALESCE(NULLIF(btrim(p_name), ''), 'Unconfirmed station'),
    'plug:' || p_id,
    'roam_plug',
    jsonb_build_object(
      'status', 'learnt',
      'originApp', 'roam_plug',
      'dataSource', 'log',
      'location', jsonb_build_object('lat', p_lat, 'lng', p_lng),
      'brand', NULLIF(btrim(COALESCE(p_brand, '')), '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION places.latest_retail_estimate(p_grade text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = fuel, public
AS $$
DECLARE
  wholesale numeric;
  mark numeric;
BEGIN
  SELECT CASE p_grade
    WHEN 'e10_90' THEN gasolene_90
    WHEN 'diesel' THEN auto_diesel
    ELSE gasolene_87
  END
  INTO wholesale
  FROM fuel.petrojam_prices
  ORDER BY price_date DESC
  LIMIT 1;

  IF wholesale IS NULL OR wholesale <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT CASE p_grade
    WHEN 'e10_90' THEN gasolene_90_markup
    WHEN 'diesel' THEN auto_diesel_markup
    ELSE gasolene_87_markup
  END
  INTO mark
  FROM fuel.retail_price_markup
  WHERE is_published IS TRUE
  ORDER BY effective_from DESC
  LIMIT 1;

  IF mark IS NULL OR mark < 0 THEN
    RETURN NULL;
  END IF;
  RETURN wholesale + mark;
END;
$$;

CREATE OR REPLACE FUNCTION public.svc_finance_coverage_lines(p_org text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'amount', row.amount,
    'line_code', row.line_code,
    'line_date', row.line_date
  )), '[]'::jsonb)
  FROM (
    SELECT amount, line_code, line_date
    FROM fleet.finance_period_lines
    WHERE organization_id = p_org
      AND line_date >= p_start
      AND line_date <= p_end
    LIMIT 5000
  ) AS row
$$;

CREATE OR REPLACE FUNCTION public.svc_coverage_contracts(p_ids text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'contract_id', c.contract_id
  )), '[]'::jsonb)
  FROM fleet.expense_coverage_periods c
  WHERE c.id = ANY (COALESCE(p_ids, ARRAY[]::text[]))
$$;

CREATE OR REPLACE FUNCTION public.svc_finance_week_locked(p_org text, p_week date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM fleet.finance_period_locks
    WHERE organization_id = p_org
      AND week_start = p_week
  )
$$;

CREATE OR REPLACE FUNCTION public.svc_lock_finance_week(p_org text, p_week date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  INSERT INTO fleet.finance_period_locks (organization_id, week_start)
  VALUES (p_org, p_week)
  ON CONFLICT (organization_id, week_start) DO NOTHING
$$;

CREATE OR REPLACE FUNCTION public.svc_post_expense_bill(
  p_org text,
  p_bill_id text,
  p_coverage_id text,
  p_bill_date date,
  p_amount numeric,
  p_self_approved boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  PERFORM fleet.post_expense_bill(p_org, p_bill_id, p_coverage_id, p_bill_date, p_amount, p_self_approved);
END;
$$;

CREATE OR REPLACE FUNCTION public.svc_record_expense_payment(
  p_org text,
  p_payment_id text,
  p_bill_id text,
  p_amount numeric,
  p_payment_date date,
  p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  PERFORM fleet.record_expense_payment(p_org, p_payment_id, p_bill_id, p_amount, p_payment_date, p_idempotency_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.svc_void_expense_bill(p_org text, p_bill_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  PERFORM fleet.void_expense_bill(p_org, p_bill_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_latest_completed(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT id
  FROM fleet.module_purchases
  WHERE user_id = p_user
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_attach_org(p_user uuid, p_org uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  UPDATE fleet.module_purchases
  SET organization_id = p_org
  WHERE user_id = p_user
    AND status = 'completed'
    AND organization_id IS NULL
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_get(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT to_jsonb(p)
  FROM fleet.module_purchases p
  WHERE p.id = p_id
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_insert(
  p_org uuid,
  p_user uuid,
  p_lines text[],
  p_amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  created fleet.module_purchases;
BEGIN
  INSERT INTO fleet.module_purchases (organization_id, user_id, service_lines, amount_jmd, status, provider)
  VALUES (p_org, p_user, p_lines, p_amount, 'pending', 'wipay')
  RETURNING * INTO created;
  RETURN to_jsonb(created);
END;
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_set_redirect(
  p_id uuid,
  p_txn text,
  p_url text,
  p_provider_data jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  UPDATE fleet.module_purchases
  SET provider_transaction_id = p_txn,
      payment_redirect_url = p_url,
      provider_data = COALESCE(p_provider_data, '{}'::jsonb)
  WHERE id = p_id
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_complete(
  p_id uuid,
  p_txn text,
  p_provider_data jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  UPDATE fleet.module_purchases
  SET status = 'completed',
      completed_at = now(),
      provider_transaction_id = p_txn,
      provider_data = COALESCE(p_provider_data, '{}'::jsonb)
  WHERE id = p_id
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_status(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'status', status,
    'amount_jmd', amount_jmd,
    'currency', currency,
    'user_id', user_id,
    'completed_at', completed_at
  )
  FROM fleet.module_purchases
  WHERE id = p_id
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_id_by_txn(p_txn text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT id
  FROM fleet.module_purchases
  WHERE provider_transaction_id = p_txn
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.svc_module_purchase_fail(p_id uuid, p_provider_data jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  UPDATE fleet.module_purchases
  SET status = 'failed',
      provider_data = COALESCE(p_provider_data, '{}'::jsonb)
  WHERE id = p_id
$$;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'places.station_match_candidates()',
    'places.insert_plug_learnt_station(text, text, double precision, double precision, text)',
    'places.latest_retail_estimate(text)',
    'public.svc_finance_coverage_lines(text, date, date)',
    'public.svc_coverage_contracts(text[])',
    'public.svc_finance_week_locked(text, date)',
    'public.svc_lock_finance_week(text, date)',
    'public.svc_post_expense_bill(text, text, text, date, numeric, boolean)',
    'public.svc_record_expense_payment(text, text, text, numeric, date, text)',
    'public.svc_void_expense_bill(text, text)',
    'public.svc_module_purchase_latest_completed(uuid)',
    'public.svc_module_purchase_attach_org(uuid, uuid)',
    'public.svc_module_purchase_get(uuid)',
    'public.svc_module_purchase_insert(uuid, uuid, text[], numeric)',
    'public.svc_module_purchase_set_redirect(uuid, text, text, jsonb)',
    'public.svc_module_purchase_complete(uuid, text, jsonb)',
    'public.svc_module_purchase_status(uuid)',
    'public.svc_module_purchase_id_by_txn(text)',
    'public.svc_module_purchase_fail(uuid, jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;
