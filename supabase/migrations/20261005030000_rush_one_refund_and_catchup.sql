-- A second charge on an already-paid order is refunded once.
-- Morning catch-up reads database lists instead of one huge web address.

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

CREATE OR REPLACE VIEW rush_money.v_orders_missing_settle AS
SELECT o.id, o.merchant_id, o.order_number
FROM delivery.orders o
WHERE o.status IN ('delivered', 'completed')
  AND o.money_state IN ('captured', 'partially_refunded', 'collected', 'short_collected', 'settled')
  AND NOT EXISTS (
    SELECT 1 FROM rush_money.journals j
    WHERE j.order_id = o.id AND j.event_type = 'settle_order'
  );

CREATE OR REPLACE VIEW rush_money.v_captures_missing_journal AS
SELECT t.id, t.amount, t.order_id
FROM payments.transactions t
WHERE t.status = 'completed'
  AND t.order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rush_money.journals j
    WHERE j.idempotency_key = 'capture:' || t.id::text
  );

CREATE OR REPLACE VIEW rush_money.v_party_net AS
SELECT
  a.party_id,
  a.party_type,
  COALESCE(SUM(a.balance_minor) FILTER (WHERE a.kind = 'merchant_payable'), 0)::bigint AS payable_minor,
  COALESCE(SUM(a.balance_minor) FILTER (WHERE a.kind = 'merchant_receivable'), 0)::bigint AS receivable_minor,
  (-COALESCE(SUM(a.balance_minor) FILTER (WHERE a.kind IN ('merchant_payable', 'merchant_receivable')), 0))::bigint AS net_owed_minor
FROM rush_money.accounts a
WHERE a.party_id IS NOT NULL
  AND a.kind IN ('merchant_payable', 'merchant_receivable')
GROUP BY a.party_id, a.party_type;

CREATE OR REPLACE VIEW rush_money.v_party_held AS
SELECT a.party_id,
  (-COALESCE(SUM(l.amount_minor), 0))::bigint AS held_minor
FROM rush_money.lines l
JOIN rush_money.accounts a ON a.id = l.account_id
JOIN rush_money.payout_batches b ON b.id = l.payout_batch_id
WHERE a.kind = 'merchant_payable'
  AND b.status NOT IN ('paid', 'returned')
GROUP BY a.party_id;

GRANT SELECT ON rush_money.v_orders_missing_settle, rush_money.v_captures_missing_journal,
  rush_money.v_party_net, rush_money.v_party_held TO service_role;
