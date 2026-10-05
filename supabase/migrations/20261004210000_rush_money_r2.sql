-- R2: sweeper voids the money status after a grace period, and a payout cannot be marked paid by one person on insert.

ALTER TABLE rush_money.payout_batches
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION rush_money.enforce_two_person_payout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_approvers int;
BEGIN
  IF NEW.status IN ('approved', 'exported', 'paid') THEN
    SELECT count(DISTINCT actor_id) INTO v_approvers
    FROM rush_money.payout_approvals
    WHERE batch_id = NEW.id;
    IF v_approvers < 2 THEN
      RAISE EXCEPTION 'payout_two_person_required';
    END IF;
    IF NEW.created_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM rush_money.payout_approvals
      WHERE batch_id = NEW.id AND actor_id IS DISTINCT FROM NEW.created_by
    ) THEN
      RAISE EXCEPTION 'payout_preparer_cannot_approve';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_two_person_insert ON rush_money.payout_batches;
CREATE TRIGGER payout_two_person_insert
  BEFORE INSERT ON rush_money.payout_batches
  FOR EACH ROW EXECUTE FUNCTION rush_money.enforce_two_person_payout();

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
        WHERE i.order_id = o.id
          AND i.expires_at > now() - interval '15 minutes'
          AND i.status IS DISTINCT FROM 'failed'
      )
      AND EXISTS (
        SELECT 1 FROM payments.payment_intents i WHERE i.order_id = o.id
      )
  ),
  updated AS (
    UPDATE delivery.orders o
    SET status = 'cancelled',
        payment_status = 'voided',
        money_state = 'voided',
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
    (v_from = 'awaiting_payment' AND p_to IN ('captured','voided','awaiting_collection')) OR
    (v_from = 'captured' AND p_to IN ('settled','partially_refunded','refunded','cancel_settled','disputed')) OR
    (v_from = 'settled' AND p_to IN ('partially_refunded','refunded','disputed')) OR
    (v_from = 'partially_refunded' AND p_to IN ('refunded','disputed','settled')) OR
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
