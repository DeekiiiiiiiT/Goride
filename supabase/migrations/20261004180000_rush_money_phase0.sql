-- Phase 0: one capture per order, refund rows that can be retried, empty-check views.

ALTER TABLE payments.refunds
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_idempotency_key_uidx
  ON payments.refunds (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Keep the earliest completed capture. Later rows become refundable duplicates.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY intent_id ORDER BY created_at ASC, id ASC) AS rn
  FROM payments.transactions
  WHERE status = 'completed' AND intent_id IS NOT NULL
)
UPDATE payments.transactions t
SET status = 'duplicate_superseded',
    failure_reason = COALESCE(t.failure_reason, 'phase0_duplicate_capture'),
    updated_at = now()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY provider, provider_transaction_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM payments.transactions
  WHERE status = 'completed'
    AND provider_transaction_id IS NOT NULL
    AND btrim(provider_transaction_id) <> ''
)
UPDATE payments.transactions t
SET status = 'duplicate_superseded',
    failure_reason = COALESCE(t.failure_reason, 'phase0_duplicate_capture'),
    updated_at = now()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_completed_intent_uidx
  ON payments.transactions (intent_id)
  WHERE status = 'completed' AND intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_provider_txn_uidx
  ON payments.transactions (provider, provider_transaction_id)
  WHERE status = 'completed'
    AND provider_transaction_id IS NOT NULL
    AND btrim(provider_transaction_id) <> '';

INSERT INTO payments.refunds (transaction_id, order_id, amount, currency, reason, status, idempotency_key)
SELECT t.id, t.order_id, t.amount, COALESCE(t.currency, 'JMD'),
       'Duplicate capture refund', 'pending', 'dup-capture:' || t.id::text
FROM payments.transactions t
WHERE t.status = 'duplicate_superseded'
  AND t.order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payments.refunds r WHERE r.idempotency_key = 'dup-capture:' || t.id::text
  );

INSERT INTO payments.refunds (transaction_id, order_id, amount, currency, reason, status, idempotency_key)
SELECT t.id, o.id, t.amount, COALESCE(t.currency, 'JMD'),
       'Cancelled order was still paid', 'pending', 'cancel-backfill:' || o.id::text
FROM delivery.orders o
JOIN LATERAL (
  SELECT id, amount, currency
  FROM payments.transactions
  WHERE order_id = o.id AND status = 'completed'
  ORDER BY created_at ASC
  LIMIT 1
) t ON true
WHERE o.status = 'cancelled'
  AND o.payment_status IN ('paid', 'refund_pending')
  AND NOT EXISTS (
    SELECT 1 FROM payments.refunds r
    WHERE r.order_id = o.id AND r.status IN ('pending', 'submitted', 'completed')
  );

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

CREATE OR REPLACE VIEW delivery.v_rush_cancelled_paid_unrefunded AS
SELECT o.id, o.order_number, o.payment_status, o.status
FROM delivery.orders o
WHERE o.status = 'cancelled'
  AND o.payment_status = 'paid'
  AND COALESCE((
    SELECT sum(r.amount) FROM payments.refunds r
    WHERE r.order_id = o.id AND r.status IN ('completed', 'succeeded')
  ), 0) < COALESCE((
    SELECT sum(t.amount) FROM payments.transactions t
    WHERE t.order_id = o.id AND t.status = 'completed'
  ), 0);

CREATE OR REPLACE VIEW delivery.v_rush_multi_capture_orders AS
SELECT order_id, count(*) AS captures
FROM payments.transactions
WHERE status = 'completed' AND order_id IS NOT NULL
GROUP BY order_id
HAVING count(*) > 1;

CREATE OR REPLACE VIEW payments.v_rush_refunds_stuck AS
SELECT id, order_id, amount, created_at
FROM payments.refunds
WHERE status = 'pending' AND created_at < now() - interval '48 hours';

GRANT SELECT ON delivery.v_rush_cancelled_paid_unrefunded, delivery.v_rush_multi_capture_orders TO service_role;
GRANT SELECT ON payments.v_rush_refunds_stuck TO service_role;

CREATE OR REPLACE FUNCTION delivery.void_abandoned_unpaid_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, payments, public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH doomed AS (
    SELECT o.id
    FROM delivery.orders o
    WHERE o.status = 'placed'
      AND COALESCE(o.payment_status, 'pending') = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM payments.payment_intents i
        WHERE i.order_id = o.id AND i.expires_at > now() AND i.status IS DISTINCT FROM 'failed'
      )
      AND EXISTS (
        SELECT 1 FROM payments.payment_intents i WHERE i.order_id = o.id
      )
  ),
  updated AS (
    UPDATE delivery.orders o
    SET status = 'cancelled',
        payment_status = 'voided',
        cancelled_at = now(),
        cancelled_by = 'system',
        cancellation_reason = 'Payment window expired',
        updated_at = now()
    FROM doomed d
    WHERE o.id = d.id
    RETURNING o.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION delivery.void_abandoned_unpaid_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delivery.void_abandoned_unpaid_orders() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('rush-void-abandoned-orders');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'rush-void-abandoned-orders',
      '15 * * * *',
      $job$SELECT delivery.void_abandoned_unpaid_orders();$job$
    );
    BEGIN
      PERFORM cron.unschedule('rush-pending-refunds');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'rush-pending-refunds',
      '*/15 * * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/delivery/internal/disputes/process-pending-refunds',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule rush refund drain and abandoned-order sweeper manually.';
END;
$cron$;
