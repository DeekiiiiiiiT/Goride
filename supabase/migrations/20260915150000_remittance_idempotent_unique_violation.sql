-- R-2: concurrent duplicate collect must replay, not raise unique_violation.
CREATE OR REPLACE FUNCTION delivery.apply_remittance_event(
  p_courier_id uuid,
  p_event_type text,
  p_amount_minor bigint,
  p_idempotency_key text,
  p_order_id uuid DEFAULT NULL,
  p_bag_total_minor bigint DEFAULT NULL,
  p_platform_due_minor bigint DEFAULT NULL,
  p_merchant_due_minor bigint DEFAULT NULL,
  p_courier_retained_minor bigint DEFAULT NULL,
  p_settlement_id uuid DEFAULT NULL,
  p_reversal_of uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS delivery.courier_remittance_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  v_existing delivery.courier_remittance_events;
  v_before bigint;
  v_after bigint;
  v_row delivery.courier_remittance_events;
BEGIN
  SELECT * INTO v_existing
  FROM delivery.courier_remittance_events
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO delivery.courier_remittance_accounts (courier_id)
  VALUES (p_courier_id)
  ON CONFLICT (courier_id) DO NOTHING;

  SELECT balance_minor INTO v_before
  FROM delivery.courier_remittance_accounts
  WHERE courier_id = p_courier_id
  FOR UPDATE;

  v_after := v_before + p_amount_minor;

  IF v_after < 0 THEN
    RAISE EXCEPTION
      'remittance_overdraw: balance %, requested %', v_before, p_amount_minor
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    INSERT INTO delivery.courier_remittance_events (
      courier_id, idempotency_key, event_type, amount_minor,
      balance_before_minor, balance_after_minor, order_id, order_ref,
      bag_total_minor, platform_due_minor, merchant_due_minor,
      courier_retained_minor, settlement_id, reversal_of,
      actor_id, actor_type, notes, metadata
    ) VALUES (
      p_courier_id, p_idempotency_key, p_event_type, p_amount_minor,
      v_before, v_after, p_order_id, p_order_id::text,
      p_bag_total_minor, p_platform_due_minor, p_merchant_due_minor,
      p_courier_retained_minor, p_settlement_id, p_reversal_of,
      p_actor_id, p_actor_type, p_notes, coalesce(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent duplicate: return the winning row (idempotency or one-collection-per-order).
    SELECT * INTO v_existing
    FROM delivery.courier_remittance_events
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
    IF p_order_id IS NOT NULL AND p_event_type = 'collected' THEN
      SELECT * INTO v_existing
      FROM delivery.courier_remittance_events
      WHERE order_id = p_order_id AND event_type = 'collected'
      LIMIT 1;
      IF FOUND THEN
        RETURN v_existing;
      END IF;
    END IF;
    RAISE;
  END;

  UPDATE delivery.courier_remittance_accounts SET
    balance_minor = v_after,
    lifetime_collected_minor = lifetime_collected_minor + GREATEST(p_amount_minor, 0),
    lifetime_settled_minor = lifetime_settled_minor + GREATEST(-p_amount_minor, 0),
    updated_at = now()
  WHERE courier_id = p_courier_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION delivery.apply_remittance_event FROM PUBLIC;
REVOKE ALL ON FUNCTION delivery.apply_remittance_event FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.apply_remittance_event TO service_role;
