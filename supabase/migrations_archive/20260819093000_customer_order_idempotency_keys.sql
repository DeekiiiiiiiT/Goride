-- Customer checkout idempotency (prevents duplicate real orders/charges)
-- Insert-only + de-dupe mapping keyed by `{customer_id, idempotency_key}`.

CREATE TABLE IF NOT EXISTS delivery.order_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  order_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  UNIQUE (customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS order_idempotency_keys_expires_at_idx
  ON delivery.order_idempotency_keys (expires_at);

COMMENT ON TABLE delivery.order_idempotency_keys IS
  'Maps a customer idempotency key to the intended order id to safely retry checkout submissions.';

