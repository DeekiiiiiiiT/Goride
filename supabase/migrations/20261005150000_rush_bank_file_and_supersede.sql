-- A payout file needs the full account, and a duplicate charge must close the original intent.

ALTER TABLE payments.merchant_bank_accounts
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS branch text;

REVOKE SELECT (account_number) ON payments.merchant_bank_accounts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS payments.courier_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL,
  bank_name text,
  branch text,
  account_holder_name text,
  account_number text,
  account_last4 text,
  account_type text,
  is_default boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments.courier_bank_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON payments.courier_bank_accounts TO service_role;

CREATE OR REPLACE FUNCTION payments.complete_payment_intent(
  p_intent_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_currency text,
  p_net_amount numeric,
  p_provider_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = payments, delivery, public
AS $$
DECLARE
  v_intent payments.payment_intents%ROWTYPE;
  v_order delivery.orders%ROWTYPE;
  v_existing uuid;
  v_txn uuid;
  v_refund uuid;
  v_provider_txn text;
  v_posted text;
BEGIN
  SELECT * INTO v_intent FROM payments.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'intent_not_found');
  END IF;

  IF p_amount IS NOT NULL AND abs(p_amount - v_intent.amount) > 0.01 THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'amount_mismatch');
  END IF;
  IF p_currency IS NOT NULL AND upper(btrim(p_currency)) <> 'JMD' THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'currency_mismatch');
  END IF;

  v_provider_txn := NULLIF(btrim(COALESCE(p_provider_transaction_id, '')), '');

  IF v_provider_txn IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM payments.transactions
    WHERE provider = p_provider
      AND provider_transaction_id = v_provider_txn
      AND status = 'completed'
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      IF v_intent.status IN ('pending', 'created') THEN
        UPDATE payments.payment_intents
        SET status = 'superseded', completed_at = now()
        WHERE id = p_intent_id;
      END IF;
      RETURN jsonb_build_object('action', 'replay', 'transaction_id', v_existing, 'order_id', v_intent.order_id);
    END IF;
  END IF;

  SELECT id INTO v_existing
  FROM payments.transactions
  WHERE intent_id = p_intent_id AND status = 'completed'
  LIMIT 1;

  IF v_intent.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM delivery.orders WHERE id = v_intent.order_id FOR UPDATE;
  END IF;

  IF v_existing IS NOT NULL THEN
    IF v_intent.status IN ('pending', 'created') THEN
      UPDATE payments.payment_intents
      SET status = 'superseded', completed_at = now()
      WHERE id = p_intent_id;
    END IF;
    INSERT INTO payments.transactions (
      intent_id, order_id, customer_id, amount, net_amount, currency, status, provider,
      provider_transaction_id, provider_data, payment_method, failure_reason
    ) VALUES (
      p_intent_id, v_intent.order_id, v_intent.customer_id, v_intent.amount, COALESCE(p_net_amount, v_intent.amount),
      'JMD', 'duplicate_superseded', p_provider, v_provider_txn, COALESCE(p_provider_data, '{}'::jsonb),
      'credit_card', 'second_capture'
    )
    RETURNING id INTO v_txn;

    INSERT INTO payments.refunds (transaction_id, order_id, amount, currency, reason, status, idempotency_key)
    SELECT v_txn, v_intent.order_id, v_intent.amount, 'JMD', 'Duplicate capture refund', 'pending', 'dup-capture:' || v_txn::text
    WHERE NOT EXISTS (
      SELECT 1 FROM payments.refunds r WHERE r.idempotency_key = 'dup-capture:' || v_txn::text
    )
    RETURNING id INTO v_refund;

    RETURN jsonb_build_object(
      'action', 'duplicate_refund_required',
      'transaction_id', v_txn,
      'refund_id', v_refund,
      'order_id', v_intent.order_id
    );
  END IF;

  INSERT INTO payments.transactions (
    intent_id, order_id, customer_id, amount, net_amount, currency, status, provider,
    provider_transaction_id, provider_data, payment_method
  ) VALUES (
    p_intent_id, v_intent.order_id, v_intent.customer_id, v_intent.amount, COALESCE(p_net_amount, v_intent.amount),
    'JMD', 'completed', p_provider, COALESCE(v_provider_txn, p_intent_id::text),
    COALESCE(p_provider_data, '{}'::jsonb), 'credit_card'
  )
  RETURNING id INTO v_txn;

  SELECT status INTO v_posted FROM payments.transactions WHERE id = v_txn;
  IF v_posted = 'duplicate_superseded' THEN
    IF v_intent.status IN ('pending', 'created') THEN
      UPDATE payments.payment_intents
      SET status = 'superseded', completed_at = now()
      WHERE id = p_intent_id;
    END IF;
    RETURN jsonb_build_object(
      'action', 'duplicate_refund_required',
      'transaction_id', v_txn,
      'order_id', v_intent.order_id
    );
  END IF;

  UPDATE payments.payment_intents
  SET status = 'completed',
      completed_at = now(),
      provider_data = COALESCE(provider_data, '{}'::jsonb) || jsonb_build_object('callback', COALESCE(p_provider_data, '{}'::jsonb))
  WHERE id = p_intent_id;

  IF v_intent.order_id IS NULL THEN
    RETURN jsonb_build_object('action', 'captured', 'transaction_id', v_txn);
  END IF;

  IF v_order.status = 'cancelled'
     OR v_order.payment_status IN ('refunded', 'refund_pending', 'partially_refunded')
     OR (v_intent.expires_at IS NOT NULL AND v_intent.expires_at < now()) THEN
    INSERT INTO payments.refunds (transaction_id, order_id, amount, currency, reason, status, idempotency_key)
    VALUES (
      v_txn, v_intent.order_id, v_intent.amount, 'JMD',
      'Late or cancelled capture refund', 'pending', 'late-capture:' || v_txn::text
    )
    RETURNING id INTO v_refund;
    RETURN jsonb_build_object(
      'action', 'late_capture_refund_required',
      'transaction_id', v_txn,
      'refund_id', v_refund,
      'order_id', v_intent.order_id
    );
  END IF;

  IF v_order.payment_status IS NULL
     OR v_order.payment_status IN ('pending', 'pending_collection') THEN
    UPDATE delivery.orders
    SET payment_status = 'paid', updated_at = now()
    WHERE id = v_intent.order_id;
  END IF;

  RETURN jsonb_build_object('action', 'captured', 'transaction_id', v_txn, 'order_id', v_intent.order_id);
END;
$$;

REVOKE ALL ON FUNCTION payments.complete_payment_intent(uuid, text, text, numeric, text, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payments.complete_payment_intent(uuid, text, text, numeric, text, numeric, jsonb) TO service_role;
