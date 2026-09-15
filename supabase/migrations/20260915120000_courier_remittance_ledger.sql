-- Delivery Remittance Layer A′ (CASH_ARCHITECTURE_ONBOARDING Parts 13–13.6)
-- Separates COD remittance from fleet Layer B cash held / Log Cash.

CREATE TABLE IF NOT EXISTS delivery.courier_remittance_accounts (
  courier_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  pause_threshold_minor bigint NOT NULL DEFAULT 1000000,
  is_paused boolean GENERATED ALWAYS AS (balance_minor >= pause_threshold_minor) STORED,
  paused_since timestamptz,
  lifetime_collected_minor bigint NOT NULL DEFAULT 0,
  lifetime_settled_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JMD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.courier_remittance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  courier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  method text NOT NULL CHECK (method IN (
    'lynk', 'bank_transfer', 'cash_office', 'wipay', 'payout_offset', 'other'
  )),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  evidence_url text,
  external_ref text,
  balance_before_minor bigint NOT NULL,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.courier_remittance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL
    REFERENCES delivery.courier_remittance_accounts(courier_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'collected', 'settled', 'adjustment', 'reversal', 'write_off'
  )),
  amount_minor bigint NOT NULL,
  balance_before_minor bigint NOT NULL,
  balance_after_minor bigint NOT NULL,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  order_ref text,
  bag_total_minor bigint,
  platform_due_minor bigint,
  merchant_due_minor bigint,
  courier_retained_minor bigint,
  settlement_id uuid REFERENCES delivery.courier_remittance_settlements(id),
  reversal_of uuid REFERENCES delivery.courier_remittance_events(id),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'admin', 'courier', 'ops', 'migration')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remittance_balance_arithmetic
    CHECK (balance_after_minor = balance_before_minor + amount_minor),
  CONSTRAINT remittance_collection_sign
    CHECK (event_type <> 'collected' OR amount_minor >= 0),
  CONSTRAINT remittance_settlement_sign
    CHECK (event_type <> 'settled' OR amount_minor <= 0),
  CONSTRAINT remittance_trial_balance
    CHECK (
      event_type <> 'collected'
      OR bag_total_minor IS NULL
      OR bag_total_minor = platform_due_minor + merchant_due_minor + courier_retained_minor
    )
);

CREATE UNIQUE INDEX ux_remittance_idem
  ON delivery.courier_remittance_events(idempotency_key);

CREATE UNIQUE INDEX ux_remittance_one_collection_per_order
  ON delivery.courier_remittance_events(order_id)
  WHERE event_type = 'collected' AND order_id IS NOT NULL;

CREATE INDEX ix_remittance_courier_time
  ON delivery.courier_remittance_events(courier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery.courier_remittance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  courier_id uuid,
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

-- Append-only events
CREATE OR REPLACE FUNCTION delivery.remittance_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'courier_remittance_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_remittance_events_no_update ON delivery.courier_remittance_events;
CREATE TRIGGER trg_remittance_events_no_update
  BEFORE UPDATE OR DELETE ON delivery.courier_remittance_events
  FOR EACH ROW EXECUTE FUNCTION delivery.remittance_events_append_only();

-- Stamp paused_since from balance (generated is_paused not yet available in BEFORE)
CREATE OR REPLACE FUNCTION delivery.remittance_stamp_paused_since()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.balance_minor >= NEW.pause_threshold_minor THEN
    NEW.paused_since := coalesce(NEW.paused_since, now());
  ELSE
    NEW.paused_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remittance_paused_since ON delivery.courier_remittance_accounts;
CREATE TRIGGER trg_remittance_paused_since
  BEFORE INSERT OR UPDATE OF balance_minor, pause_threshold_minor
  ON delivery.courier_remittance_accounts
  FOR EACH ROW EXECUTE FUNCTION delivery.remittance_stamp_paused_since();

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

CREATE OR REPLACE VIEW delivery.v_remittance_drift AS
SELECT
  a.courier_id,
  a.balance_minor AS account_balance_minor,
  coalesce(sum(e.amount_minor), 0) AS event_sum_minor,
  a.balance_minor - coalesce(sum(e.amount_minor), 0) AS drift_minor
FROM delivery.courier_remittance_accounts a
LEFT JOIN delivery.courier_remittance_events e USING (courier_id)
GROUP BY a.courier_id, a.balance_minor
HAVING a.balance_minor <> coalesce(sum(e.amount_minor), 0);

CREATE OR REPLACE VIEW delivery.v_remittance_missing_collections AS
SELECT o.id AS order_id, o.courier_id, o.total, o.delivered_at
FROM delivery.orders o
WHERE o.payment_method = 'cash'
  AND o.status IN ('delivered', 'completed')
  AND o.courier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM delivery.courier_remittance_events e
    WHERE e.order_id = o.id AND e.event_type = 'collected'
  )
  AND NOT EXISTS (
    SELECT 1 FROM delivery.courier_remittance_exceptions x
    WHERE x.order_id = o.id AND x.resolved_at IS NULL
  );

CREATE OR REPLACE VIEW delivery.v_remittance_trial_balance_breaks AS
SELECT
  id,
  order_id,
  bag_total_minor,
  platform_due_minor + merchant_due_minor + courier_retained_minor AS split_sum_minor
FROM delivery.courier_remittance_events
WHERE event_type = 'collected'
  AND bag_total_minor IS NOT NULL
  AND bag_total_minor <> platform_due_minor + merchant_due_minor + courier_retained_minor;

ALTER TABLE delivery.courier_remittance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_remittance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_remittance_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_remittance_exceptions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON delivery.courier_remittance_accounts TO service_role;
GRANT ALL ON delivery.courier_remittance_events TO service_role;
GRANT ALL ON delivery.courier_remittance_settlements TO service_role;
GRANT ALL ON delivery.courier_remittance_exceptions TO service_role;
GRANT SELECT ON delivery.v_remittance_drift TO service_role;
GRANT SELECT ON delivery.v_remittance_missing_collections TO service_role;
GRANT SELECT ON delivery.v_remittance_trial_balance_breaks TO service_role;

COMMENT ON TABLE delivery.courier_remittance_accounts IS
  'Layer A′ COD remittance owing to Roam — never fleet Driver Settlements cash held.';
