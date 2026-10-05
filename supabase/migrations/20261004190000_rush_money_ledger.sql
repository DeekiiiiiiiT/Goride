-- Phase 1: one Rush money book. Debit-positive lines. Journals are append-only.

CREATE SCHEMA IF NOT EXISTS rush_money;

CREATE TABLE IF NOT EXISTS rush_money.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'gateway_clearing','order_clearing','merchant_payable','merchant_receivable',
    'courier_earnings','courier_cash_earned','customer_wallet','platform_revenue',
    'platform_cost','marketing_goodwill','gct_output_payable','refunds_in_flight',
    'chargeback_reserve','payouts_in_flight','bank','cod_clearing'
  )),
  party_type text NOT NULL CHECK (party_type IN ('customer','courier','merchant','order','platform')),
  party_id uuid,
  component text NOT NULL DEFAULT '',
  balance_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JMD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rush_money_accounts_identity_uidx
  ON rush_money.accounts (kind, party_type, COALESCE(party_id, '00000000-0000-0000-0000-000000000000'::uuid), component);

CREATE TABLE IF NOT EXISTS rush_money.journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  correlation_id uuid,
  policy_version text,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  reverses uuid REFERENCES rush_money.journals(id),
  period_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rush_money.lines (
  journal_id uuid NOT NULL REFERENCES rush_money.journals(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES rush_money.accounts(id) ON DELETE RESTRICT,
  component text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  PRIMARY KEY (journal_id, account_id, component)
);

CREATE TABLE IF NOT EXISTS rush_money.runtime_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  note text
);

INSERT INTO rush_money.runtime_flags (key, enabled, note) VALUES
  ('wallet_live', false, 'Turn on only after stored-value legal sign-off'),
  ('device_linking', false, 'Turn on only after the privacy notice is updated'),
  ('payout_export', false, 'Turn on only after the payout rail is chosen'),
  ('risk_controls', true, 'Reversible limits')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS money_state text,
  ADD COLUMN IF NOT EXISTS cash_collected_minor bigint,
  ADD COLUMN IF NOT EXISTS cash_change_kept_minor bigint,
  ADD COLUMN IF NOT EXISTS failed_delivery_outcome text,
  ADD COLUMN IF NOT EXISTS cancel_stage text,
  ADD COLUMN IF NOT EXISTS fault text,
  ADD COLUMN IF NOT EXISTS policy_version text;

UPDATE delivery.orders
SET money_state = CASE
  WHEN status = 'cancelled' AND COALESCE(payment_status, 'pending') IN ('pending', 'voided') THEN 'voided'
  WHEN payment_status = 'refunded' THEN 'refunded'
  WHEN payment_status = 'partially_refunded' THEN 'partially_refunded'
  WHEN payment_status = 'paid' AND status IN ('delivered', 'completed') THEN 'settled'
  WHEN payment_status = 'paid' THEN 'captured'
  WHEN payment_status = 'refund_pending' THEN 'captured'
  WHEN payment_status = 'pending_collection' THEN 'awaiting_collection'
  ELSE 'awaiting_payment'
END
WHERE money_state IS NULL;

ALTER TABLE delivery.orders ALTER COLUMN money_state SET DEFAULT 'awaiting_payment';
ALTER TABLE delivery.orders ALTER COLUMN money_state SET NOT NULL;

ALTER TABLE delivery.orders DROP CONSTRAINT IF EXISTS orders_money_state_check;
ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_money_state_check CHECK (money_state IN (
    'awaiting_payment','captured','settled','partially_refunded','refunded','voided',
    'cancel_settled','disputed','charged_back','awaiting_collection','collected',
    'short_collected','failed_delivery'
  ));

CREATE OR REPLACE FUNCTION rush_money.reject_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rush_money_append_only';
  END IF;
  IF OLD.period_id IS NOT NULL THEN
    RAISE EXCEPTION 'period_locked';
  END IF;
  IF (to_jsonb(NEW) - 'period_id') IS DISTINCT FROM (to_jsonb(OLD) - 'period_id') THEN
    RAISE EXCEPTION 'rush_money_append_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journals_append_only ON rush_money.journals;
CREATE TRIGGER journals_append_only
  BEFORE UPDATE OR DELETE ON rush_money.journals
  FOR EACH ROW EXECUTE FUNCTION rush_money.reject_journal_mutation();

CREATE OR REPLACE FUNCTION rush_money.reject_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rush_money_append_only';
END;
$$;

DROP TRIGGER IF EXISTS lines_append_only ON rush_money.lines;
CREATE TRIGGER lines_append_only
  BEFORE UPDATE OR DELETE ON rush_money.lines
  FOR EACH ROW EXECUTE FUNCTION rush_money.reject_line_mutation();

CREATE OR REPLACE FUNCTION rush_money.post_journal(
  p_idempotency_key text,
  p_event_type text,
  p_order_id uuid,
  p_correlation_id uuid,
  p_lines jsonb,
  p_actor_id uuid,
  p_actor_type text,
  p_reason text,
  p_evidence jsonb,
  p_policy_version text
) RETURNS rush_money.journals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
DECLARE
  v_existing rush_money.journals%ROWTYPE;
  v_journal rush_money.journals%ROWTYPE;
  v_line jsonb;
  v_sum bigint := 0;
  v_count int := 0;
  v_account_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_amount bigint;
  v_party uuid;
  v_kind text;
  v_party_type text;
  v_component text;
  v_balance bigint;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT * INTO v_existing FROM rush_money.journals WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_amount := (v_line->>'amount_minor')::bigint;
    IF v_amount IS NULL OR v_amount = 0 THEN
      RAISE EXCEPTION 'line_amount_required';
    END IF;
    v_sum := v_sum + v_amount;
    v_count := v_count + 1;
  END LOOP;
  IF v_count < 2 OR v_sum <> 0 THEN
    RAISE EXCEPTION 'journal_imbalance: %', v_sum;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_kind := v_line->>'kind';
    v_party_type := v_line->>'party_type';
    v_component := COALESCE(v_line->>'component', '');
    v_party := NULLIF(v_line->>'party_id', '')::uuid;
    SELECT id INTO v_account_id
    FROM rush_money.accounts
    WHERE kind = v_kind
      AND party_type = v_party_type
      AND component = v_component
      AND party_id IS NOT DISTINCT FROM v_party;
    IF v_account_id IS NULL THEN
      BEGIN
        INSERT INTO rush_money.accounts (kind, party_type, party_id, component)
        VALUES (v_kind, v_party_type, v_party, v_component)
        RETURNING id INTO v_account_id;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_account_id
        FROM rush_money.accounts
        WHERE kind = v_kind
          AND party_type = v_party_type
          AND component = v_component
          AND party_id IS NOT DISTINCT FROM v_party;
      END;
    END IF;
    v_ids := array_append(v_ids, v_account_id);
  END LOOP;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(v_ids) AS x;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM 1 FROM rush_money.accounts WHERE id = v_id FOR UPDATE;
  END LOOP;

  INSERT INTO rush_money.journals (
    idempotency_key, event_type, order_id, correlation_id, policy_version,
    reason, evidence, actor_id, actor_type
  ) VALUES (
    p_idempotency_key, p_event_type, p_order_id, p_correlation_id, p_policy_version,
    p_reason, COALESCE(p_evidence, '{}'::jsonb), p_actor_id, COALESCE(p_actor_type, 'system')
  )
  RETURNING * INTO v_journal;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_kind := v_line->>'kind';
    v_party_type := v_line->>'party_type';
    v_component := COALESCE(v_line->>'component', '');
    v_party := NULLIF(v_line->>'party_id', '')::uuid;
    v_amount := (v_line->>'amount_minor')::bigint;
    SELECT id, balance_minor INTO v_account_id, v_balance
    FROM rush_money.accounts
    WHERE kind = v_kind
      AND party_type = v_party_type
      AND component = v_component
      AND party_id IS NOT DISTINCT FROM v_party
    FOR UPDATE;

    IF v_kind = 'customer_wallet' AND v_balance + v_amount > 500000
       AND COALESCE(p_evidence->>'allow_debt_over_cap', '') <> 'true' THEN
      RAISE EXCEPTION 'wallet_debt_cap';
    END IF;

    INSERT INTO rush_money.lines (journal_id, account_id, component, amount_minor)
    VALUES (v_journal.id, v_account_id, v_component, v_amount);

    UPDATE rush_money.accounts
    SET balance_minor = balance_minor + v_amount
    WHERE id = v_account_id;
  END LOOP;

  RETURN v_journal;
END;
$$;

REVOKE ALL ON FUNCTION rush_money.post_journal(text, text, uuid, uuid, jsonb, uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rush_money.post_journal(text, text, uuid, uuid, jsonb, uuid, text, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rush_post_journal(
  p_idempotency_key text,
  p_event_type text,
  p_order_id uuid,
  p_correlation_id uuid,
  p_lines jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_reason text DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_policy_version text DEFAULT NULL
) RETURNS rush_money.journals
LANGUAGE sql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT rush_money.post_journal(
    p_idempotency_key, p_event_type, p_order_id, p_correlation_id, p_lines,
    p_actor_id, p_actor_type, p_reason, p_evidence, p_policy_version
  );
$$;

REVOKE ALL ON FUNCTION public.rush_post_journal(text, text, uuid, uuid, jsonb, uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_post_journal(text, text, uuid, uuid, jsonb, uuid, text, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION rush_money.transition_money_state(p_order_id uuid, p_to text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  v_from text;
BEGIN
  SELECT money_state INTO v_from FROM delivery.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_from = p_to THEN
    RETURN v_from;
  END IF;
  IF NOT (
    (v_from = 'awaiting_payment' AND p_to IN ('captured','voided')) OR
    (v_from = 'captured' AND p_to IN ('settled','partially_refunded','refunded','cancel_settled','disputed')) OR
    (v_from = 'settled' AND p_to IN ('partially_refunded','refunded','disputed')) OR
    (v_from = 'partially_refunded' AND p_to IN ('refunded','disputed')) OR
    (v_from = 'disputed' AND p_to IN ('settled','charged_back')) OR
    (v_from = 'awaiting_collection' AND p_to IN ('collected','short_collected','failed_delivery','voided')) OR
    (v_from IN ('collected','short_collected') AND p_to = 'settled') OR
    (v_from = 'failed_delivery' AND p_to = 'cancel_settled')
  ) THEN
    RAISE EXCEPTION 'money_state_refused: % -> %', v_from, p_to;
  END IF;
  UPDATE delivery.orders SET money_state = p_to, updated_at = now() WHERE id = p_order_id;
  RETURN p_to;
END;
$$;

REVOKE ALL ON FUNCTION rush_money.transition_money_state(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rush_money.transition_money_state(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rush_transition_money_state(p_order_id uuid, p_to text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT rush_money.transition_money_state(p_order_id, p_to);
$$;

REVOKE ALL ON FUNCTION public.rush_transition_money_state(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_transition_money_state(uuid, text) TO service_role;

CREATE OR REPLACE VIEW rush_money.v_journal_imbalance AS
SELECT journal_id, sum(amount_minor) AS sum_minor
FROM rush_money.lines
GROUP BY journal_id
HAVING sum(amount_minor) <> 0;

CREATE OR REPLACE VIEW rush_money.v_order_clearing_stale AS
SELECT a.party_id AS order_id, a.balance_minor
FROM rush_money.accounts a
JOIN delivery.orders o ON o.id = a.party_id
WHERE a.kind = 'order_clearing'
  AND a.balance_minor <> 0
  AND o.status IN ('delivered','completed','cancelled')
  AND COALESCE(o.updated_at, o.created_at) < now() - interval '24 hours';

CREATE OR REPLACE VIEW rush_money.v_wallet_drift AS
SELECT a.id, a.balance_minor, COALESCE(sum(l.amount_minor), 0) AS lines_sum
FROM rush_money.accounts a
LEFT JOIN rush_money.lines l ON l.account_id = a.id
WHERE a.kind = 'customer_wallet'
GROUP BY a.id, a.balance_minor
HAVING a.balance_minor <> COALESCE(sum(l.amount_minor), 0);

GRANT SELECT ON rush_money.v_journal_imbalance, rush_money.v_order_clearing_stale, rush_money.v_wallet_drift TO service_role;

ALTER TABLE rush_money.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.runtime_flags ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA rush_money TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA rush_money TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA rush_money TO service_role;

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
